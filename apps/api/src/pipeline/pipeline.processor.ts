import { Inject, Injectable, Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { Prisma } from "@prisma/client";
import {
  scoreOpportunity,
  type BuyerType,
} from "@prospector/shared";
import { PrismaService } from "../prisma/prisma.service";
import { DataForSeoService } from "../dataforseo/dataforseo.service";
import { ClaudeService } from "../claude/claude.service";
import { PipelineService } from "./pipeline.service";
import type { PipelineJobData, PipelineJobName } from "./pipeline.constants";

type WorkingCluster = {
  productDescription: string;
  buyerType: string;
  intent: string;
  painSeverity: number;
  reasoning: string;
  keywords: Set<string>;
};

@Injectable()
export class PipelineProcessor {
  private readonly logger = new Logger(PipelineProcessor.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DataForSeoService) private readonly dataForSeo: DataForSeoService,
    @Inject(ClaudeService) private readonly claude: ClaudeService,
    @Inject(PipelineService) private readonly pipeline: PipelineService,
  ) {}

  async process(job: Job<PipelineJobData>) {
    const nicheId = job.data.nicheId;
    const name = job.name as PipelineJobName;

    try {
      switch (name) {
        case "expand":
          await this.expand(nicheId);
          await this.pipeline.enqueue("enrich", nicheId);
          break;
        case "enrich":
          await this.enrich(nicheId);
          await this.pipeline.enqueue("classify", nicheId);
          break;
        case "classify":
          await this.classify(nicheId);
          await this.pipeline.enqueue("score", nicheId);
          break;
        case "score":
          await this.score(nicheId);
          break;
        // v2 stub:
        // case "serp":
        //   await this.serp(nicheId);
        //   break;
        default:
          throw new Error(`Unknown job type: ${name}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Niche ${nicheId} job ${name} failed: ${message}`);
      await this.prisma.niche.update({
        where: { id: nicheId },
        data: { status: "FAILED", error: message },
      });
      throw err;
    }
  }

  private async expand(nicheId: string) {
    const niche = await this.prisma.niche.findUniqueOrThrow({
      where: { id: nicheId },
    });

    await this.prisma.niche.update({
      where: { id: nicheId },
      data: { status: "EXPANDING", error: null },
    });

    const ideas = await this.dataForSeo.expandKeywords(
      niche.seedTerm,
      nicheId,
    );

    const existing = await this.prisma.keyword.findMany({
      where: { nicheId },
      select: { term: true },
    });
    const existingLower = new Set(existing.map((k) => k.term.toLowerCase()));

    const seed = niche.seedTerm.trim();
    const candidates = [seed, ...ideas];
    const toInsert: string[] = [];
    for (const term of candidates) {
      const normalized = term.trim();
      if (!normalized) continue;
      const key = normalized.toLowerCase();
      if (existingLower.has(key)) continue;
      existingLower.add(key);
      toInsert.push(normalized);
    }

    if (toInsert.length) {
      await this.prisma.keyword.createMany({
        data: toInsert.map((term) => ({ nicheId, term })),
        skipDuplicates: true,
      });
    }

    await this.prisma.niche.update({
      where: { id: nicheId },
      data: { status: "ENRICHING" },
    });
  }

  private async enrich(nicheId: string) {
    await this.prisma.niche.update({
      where: { id: nicheId },
      data: { status: "ENRICHING", error: null },
    });

    const keywords = await this.prisma.keyword.findMany({
      where: { nicheId },
      select: { id: true, term: true },
    });

    const byTerm = new Map(
      keywords.map((k) => [k.term.toLowerCase(), k.id] as const),
    );
    const rows = await this.dataForSeo.enrichKeywords(
      keywords.map((k) => k.term),
      nicheId,
    );

    for (const row of rows) {
      const id = byTerm.get(row.keyword.toLowerCase());
      if (!id) continue;
      await this.prisma.keyword.update({
        where: { id },
        data: {
          searchVolume: row.searchVolume,
          cpc: row.cpc,
          competition: row.competition,
          monthlyTrend:
            row.monthlyTrend === null
              ? Prisma.DbNull
              : (row.monthlyTrend as Prisma.InputJsonValue),
          raw: row.raw as Prisma.InputJsonValue,
        },
      });
    }

    await this.prisma.niche.update({
      where: { id: nicheId },
      data: { status: "CLASSIFYING" },
    });
  }

  private async classify(nicheId: string) {
    await this.prisma.niche.update({
      where: { id: nicheId },
      data: { status: "CLASSIFYING", error: null },
    });

    // Idempotent: clear prior opportunities and unlink keywords.
    await this.prisma.keyword.updateMany({
      where: { nicheId },
      data: { opportunityId: null },
    });
    await this.prisma.opportunity.deleteMany({ where: { nicheId } });

    const keywords = await this.prisma.keyword.findMany({
      where: {
        nicheId,
        searchVolume: { not: null },
      },
      select: {
        id: true,
        term: true,
        searchVolume: true,
        cpc: true,
        competition: true,
      },
    });

    const classifiable = keywords
      .filter((k) => (k.searchVolume ?? 0) > 0)
      .map((k) => ({
        id: k.id,
        term: k.term,
        searchVolume: k.searchVolume ?? 0,
        cpc: k.cpc ?? 0,
        competition: k.competition ?? 0,
      }));

    const termToId = new Map(
      classifiable.map((k) => [k.term.toLowerCase(), k.id] as const),
    );

    const chunkClusters: WorkingCluster[] = [];
    for (let i = 0; i < classifiable.length; i += 50) {
      const chunk = classifiable.slice(i, i + 50);
      const result = await this.claude.classifyChunk(chunk, nicheId);
      for (const cluster of result.clusters) {
        chunkClusters.push({
          productDescription: cluster.product_description,
          buyerType: cluster.buyer_type,
          intent: cluster.intent,
          painSeverity: cluster.pain_severity,
          reasoning: cluster.reasoning,
          keywords: new Set(cluster.keywords.map((t) => t.toLowerCase())),
        });
      }
    }

    const labels = chunkClusters.map((c) => c.productDescription);
    const merge = await this.claude.mergeClusterLabels(labels, nicheId);

    const aliasToCanonical = new Map<string, string>();
    for (const m of merge.merges) {
      aliasToCanonical.set(m.canonical, m.canonical);
      for (const alias of m.aliases) {
        aliasToCanonical.set(alias, m.canonical);
      }
      // ensure every label maps somewhere even if Claude omitted it
      aliasToCanonical.set(m.canonical, m.canonical);
    }
    for (const label of labels) {
      if (!aliasToCanonical.has(label)) {
        aliasToCanonical.set(label, label);
      }
    }

    const merged = new Map<string, WorkingCluster>();
    for (const cluster of chunkClusters) {
      const canonical =
        aliasToCanonical.get(cluster.productDescription) ??
        cluster.productDescription;
      const existing = merged.get(canonical);
      if (!existing) {
        merged.set(canonical, {
          ...cluster,
          productDescription: canonical,
          keywords: new Set(cluster.keywords),
        });
      } else {
        for (const kw of cluster.keywords) existing.keywords.add(kw);
        // Prefer higher pain / longer reasoning when merging.
        if (cluster.painSeverity > existing.painSeverity) {
          existing.painSeverity = cluster.painSeverity;
          existing.reasoning = cluster.reasoning;
          existing.buyerType = cluster.buyerType;
          existing.intent = cluster.intent;
        }
      }
    }

    for (const cluster of merged.values()) {
      if (cluster.productDescription === "NOT_SOFTWARE") {
        continue;
      }

      const memberIds: string[] = [];
      for (const term of cluster.keywords) {
        const id = termToId.get(term);
        if (id) memberIds.push(id);
      }
      if (!memberIds.length) continue;

      const opportunity = await this.prisma.opportunity.create({
        data: {
          nicheId,
          productDescription: cluster.productDescription,
          buyerType: cluster.buyerType,
          intent: cluster.intent,
          painSeverity: cluster.painSeverity,
          reasoning: cluster.reasoning,
          totalVolume: 0,
          avgCpc: 0,
          avgCompetition: 0,
          impliedCac: 0,
          annualPriceFloor: 0,
          monthlyPriceFloor: 0,
          demandScore: 0,
        },
      });

      await this.prisma.keyword.updateMany({
        where: { id: { in: memberIds } },
        data: { opportunityId: opportunity.id },
      });
    }

    await this.prisma.niche.update({
      where: { id: nicheId },
      data: { status: "SCORING" },
    });
  }

  private async score(nicheId: string) {
    await this.prisma.niche.update({
      where: { id: nicheId },
      data: { status: "SCORING", error: null },
    });

    const niche = await this.prisma.niche.findUniqueOrThrow({
      where: { id: nicheId },
    });

    const opportunities = await this.prisma.opportunity.findMany({
      where: { nicheId },
      include: {
        keywords: {
          select: {
            searchVolume: true,
            cpc: true,
            competition: true,
          },
        },
      },
    });

    for (const opp of opportunities) {
      const scored = scoreOpportunity(
        opp.keywords,
        { convRate: niche.convRate, ltvCacRatio: niche.ltvCacRatio },
        opp.buyerType as BuyerType,
      );

      await this.prisma.opportunity.update({
        where: { id: opp.id },
        data: scored,
      });
    }

    await this.prisma.niche.update({
      where: { id: nicheId },
      data: { status: "DONE", error: null },
    });
  }
}
