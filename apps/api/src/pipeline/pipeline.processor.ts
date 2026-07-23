import { Inject, Injectable, Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { Prisma } from "@prisma/client";
import {
  MIN_KEYWORD_VOLUME,
  annotateSerpSnapshot,
  organicSoftnessScore,
  scoreOpportunity,
} from "@prospector/shared";
import { PrismaService } from "../prisma/prisma.service";
import { DataForSeoService } from "../dataforseo/dataforseo.service";
import { ClaudeService } from "../claude/claude.service";
import type { PipelineJobData, PipelineJobName } from "./pipeline.constants";

type WorkingCluster = {
  productDescription: string;
  buyerType: string;
  intent: string;
  painSeverity: number;
  reasoning: string;
  keywords: Set<string>;
};

const STAGES: PipelineJobName[] = ["expand", "enrich", "classify", "score"];

@Injectable()
export class PipelineProcessor {
  private readonly logger = new Logger(PipelineProcessor.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DataForSeoService) private readonly dataForSeo: DataForSeoService,
    @Inject(ClaudeService) private readonly claude: ClaudeService,
  ) {}

  async process(job: Job<PipelineJobData>) {
    const nicheId = job.data.nicheId;
    const name = job.name as PipelineJobName;

    try {
      // Run remaining stages in-process so we don't depend on Redis to
      // re-deliver each hop (a common cause of niches stuck "running").
      await this.runFrom(nicheId, name);
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

  async runFrom(
    nicheId: string,
    start: PipelineJobName,
    isCancelled?: () => boolean,
  ) {
    const startIdx = STAGES.indexOf(start);
    if (startIdx < 0) {
      throw new Error(`Unknown job type: ${start}`);
    }

    for (let i = startIdx; i < STAGES.length; i++) {
      if (isCancelled?.()) {
        this.logger.warn(
          JSON.stringify({
            event: "pipeline_cancelled",
            nicheId,
            at: STAGES[i],
          }),
        );
        return;
      }
      const stage = STAGES[i]!;
      this.logger.log(
        JSON.stringify({ event: "pipeline_stage_start", nicheId, stage }),
      );
      switch (stage) {
        case "expand":
          await this.expand(nicheId);
          break;
        case "enrich":
          await this.enrich(nicheId);
          break;
        case "classify":
          await this.classify(nicheId);
          break;
        case "score":
          await this.score(nicheId);
          break;
      }
      this.logger.log(
        JSON.stringify({ event: "pipeline_stage_done", nicheId, stage }),
      );
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

    const seed = niche.seedTerm.trim();

    // Broad DFS candidates (optional) → Claude generates/filters a relevant list.
    // Seed words are NOT required inside each keyword; topical relevance is.
    const dfsCandidates = await this.dataForSeo
      .expandKeywords(seed, nicheId)
      .catch((err) => {
        this.logger.warn(
          `DFS expand candidates failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        return [] as string[];
      });

    const aiKeywords = await this.claude
      .expandKeywords(seed, dfsCandidates, nicheId)
      .catch((err) => {
        this.logger.warn(
          `Claude expand failed, using DFS candidates: ${err instanceof Error ? err.message : String(err)}`,
        );
        return dfsCandidates;
      });

    this.logger.log(
      JSON.stringify({
        event: "expand_ai_keywords",
        nicheId,
        seed,
        dfsCandidates: dfsCandidates.length,
        aiKeywords: aiKeywords.length,
      }),
    );

    const existing = await this.prisma.keyword.findMany({
      where: { nicheId },
      select: { term: true },
    });
    const existingLower = new Set(existing.map((k) => k.term.toLowerCase()));

    const candidates = [seed, ...aiKeywords];
    const toInsert: string[] = [];
    for (const term of candidates) {
      const normalized = term.trim().replace(/\s+/g, " ");
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

    const count = await this.prisma.keyword.count({ where: { nicheId } });
    if (count === 0) {
      throw new Error(
        `Expand produced no keywords for seed "${niche.seedTerm}"`,
      );
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
      select: { id: true, term: true, searchVolume: true },
    });

    const byTerm = new Map(
      keywords.map((k) => [k.term.toLowerCase(), k.id] as const),
    );

    // Cross-niche cache: reuse previously enriched metrics for the same term.
    const unenriched = keywords.filter((k) => k.searchVolume == null);
    const termsNeedingFetch: string[] = [];
    let cacheHits = 0;

    if (unenriched.length > 0) {
      const lowers = unenriched.map((k) => k.term.toLowerCase());
      const cachedRows = await this.prisma.$queryRaw<
        Array<{
          term: string;
          searchVolume: number | null;
          cpc: number | null;
          competition: number | null;
          monthlyTrend: Prisma.JsonValue;
          raw: Prisma.JsonValue;
        }>
      >`
        SELECT DISTINCT ON (lower(term))
          term,
          "searchVolume",
          cpc,
          competition,
          "monthlyTrend",
          raw
        FROM "Keyword"
        WHERE "nicheId" <> ${nicheId}
          AND "searchVolume" IS NOT NULL
          AND lower(term) = ANY(${lowers})
        ORDER BY lower(term), "createdAt" DESC
      `;

      const cacheByTerm = new Map(
        cachedRows.map((r) => [r.term.toLowerCase(), r] as const),
      );

      for (const kw of unenriched) {
        const cached = cacheByTerm.get(kw.term.toLowerCase());
        if (!cached) {
          termsNeedingFetch.push(kw.term);
          continue;
        }
        await this.prisma.keyword.update({
          where: { id: kw.id },
          data: {
            searchVolume: cached.searchVolume,
            cpc: cached.cpc,
            competition: cached.competition,
            monthlyTrend:
              cached.monthlyTrend === null
                ? Prisma.DbNull
                : (cached.monthlyTrend as Prisma.InputJsonValue),
            raw:
              cached.raw === null
                ? Prisma.DbNull
                : (cached.raw as Prisma.InputJsonValue),
          },
        });
        cacheHits += 1;
      }
    }

    if (cacheHits > 0) {
      this.logger.log(
        JSON.stringify({
          event: "keyword_cache_hits",
          nicheId,
          cacheHits,
          remaining: termsNeedingFetch.length,
        }),
      );
    }

    let applied = 0;
    if (termsNeedingFetch.length > 0) {
      const rows = await this.dataForSeo.enrichKeywords(
        termsNeedingFetch,
        nicheId,
      );

      const unmatchedIds = new Set(
        termsNeedingFetch
          .map((t) => byTerm.get(t.toLowerCase()))
          .filter((id): id is string => Boolean(id)),
      );

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]!;
        const requested = row.requestedKeyword ?? termsNeedingFetch[i];
        const id =
          (requested ? byTerm.get(requested.toLowerCase()) : undefined) ??
          byTerm.get(row.keyword.toLowerCase());
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
        unmatchedIds.delete(id);
        applied += 1;
      }

      // Positional fallback for any leftover request terms / response rows.
      if (unmatchedIds.size > 0) {
        const leftoverTerms = termsNeedingFetch.filter((t) => {
          const id = byTerm.get(t.toLowerCase());
          return id != null && unmatchedIds.has(id);
        });
        for (let i = 0; i < leftoverTerms.length && i < rows.length; i++) {
          const term = leftoverTerms[i]!;
          const id = byTerm.get(term.toLowerCase());
          const row = rows[i];
          if (!id || !row || !unmatchedIds.has(id)) continue;
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
          unmatchedIds.delete(id);
          applied += 1;
        }
      }

      this.logger.log(
        JSON.stringify({
          event: "enrich_applied",
          nicheId,
          requested: termsNeedingFetch.length,
          returned: rows.length,
          applied,
        }),
      );
    }

    // Drop keywords below the volume floor (unenriched nulls are left alone).
    const pruned = await this.prisma.keyword.deleteMany({
      where: {
        nicheId,
        searchVolume: { lt: MIN_KEYWORD_VOLUME },
      },
    });
    if (pruned.count > 0) {
      this.logger.log(
        JSON.stringify({
          event: "enrich_volume_prune",
          nicheId,
          removed: pruned.count,
          minVolume: MIN_KEYWORD_VOLUME,
        }),
      );
    }

    const enrichedCount = await this.prisma.keyword.count({
      where: {
        nicheId,
        searchVolume: { gte: MIN_KEYWORD_VOLUME },
      },
    });
    if (enrichedCount === 0) {
      throw new Error(
        `Enrich finished with 0 keywords at volume ≥ ${MIN_KEYWORD_VOLUME} (fetched ${termsNeedingFetch.length}, applied ${applied}). Try a broader seed.`,
      );
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

    // Preserve operator pins/notes across re-classify when product labels match.
    const preserve = await this.prisma.opportunity.findMany({
      where: {
        nicheId,
        OR: [
          { pinned: true },
          { notes: { not: "" } },
          { reviewStatus: { not: "none" } },
        ],
      },
      select: {
        productDescription: true,
        pinned: true,
        notes: true,
        reviewStatus: true,
      },
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
        searchVolume: { gte: MIN_KEYWORD_VOLUME },
      },
      select: {
        id: true,
        term: true,
        searchVolume: true,
        cpc: true,
        competition: true,
      },
    });

    const classifiable = keywords.map((k) => ({
      id: k.id,
      term: k.term,
      searchVolume: k.searchVolume ?? 0,
      cpc: k.cpc ?? 0,
      // Missing Ads competition_index → mid default (not 0 = "easiest").
      competition: k.competition ?? 0.55,
    }));

    if (classifiable.length === 0) {
      throw new Error(
        `No keywords with search volume ≥ ${MIN_KEYWORD_VOLUME} for niche ${nicheId}. Try a broader seed.`,
      );
    }

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
        if (cluster.painSeverity > existing.painSeverity) {
          existing.painSeverity = cluster.painSeverity;
          existing.reasoning = cluster.reasoning;
          existing.buyerType = cluster.buyerType;
          existing.intent = cluster.intent;
        }
      }
    }

    let createdOpps = 0;
    for (const cluster of merged.values()) {
      // Only drop pure noise — keep all normal keyword themes (not software-gated).
      const label = cluster.productDescription.trim().toUpperCase();
      if (label === "NOISE" || label === "NOT_SOFTWARE") {
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
      createdOpps += 1;

      await this.prisma.keyword.updateMany({
        where: { id: { in: memberIds } },
        data: { opportunityId: opportunity.id },
      });
    }

    if (createdOpps === 0) {
      throw new Error(
        `Classify produced 0 themes from ${classifiable.length} keywords (all noise or unmatched).`,
      );
    }

    for (const p of preserve) {
      const match = await this.prisma.opportunity.findFirst({
        where: {
          nicheId,
          productDescription: {
            equals: p.productDescription,
            mode: "insensitive",
          },
        },
      });
      if (!match) continue;
      await this.prisma.opportunity.update({
        where: { id: match.id },
        data: {
          pinned: p.pinned,
          notes: p.notes,
          reviewStatus: p.reviewStatus,
        },
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

    if (opportunities.length === 0) {
      throw new Error(`Score found 0 opportunities for niche ${nicheId}`);
    }

    for (const opp of opportunities) {
      const scored = scoreOpportunity(opp.keywords, {
        convRate: niche.convRate,
        ltvCacRatio: niche.ltvCacRatio,
      });

      await this.prisma.opportunity.update({
        where: { id: opp.id },
        data: scored,
      });
    }

    // Organic SERP snapshots for decision softness (top themes by demand).
    try {
      await this.enrichOpportunitySerp(nicheId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Opportunity SERP enrichment failed for ${nicheId}: ${message}`,
      );
    }

    // Second AI pass: product angle + monetization + wedge for scored themes.
    try {
      await this.enrichBuildBriefs(nicheId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Theme build-brief enrichment failed for ${nicheId}: ${message}`,
      );
    }

    await this.prisma.niche.update({
      where: { id: nicheId },
      data: { status: "DONE", error: null },
    });
  }

  /** Fetch organic SERP for each theme's top keyword (cost-capped). */
  private async enrichOpportunitySerp(nicheId: string) {
    const opportunities = await this.prisma.opportunity.findMany({
      where: { nicheId },
      orderBy: { demandScore: "desc" },
      take: 12,
      select: {
        id: true,
        keywords: {
          orderBy: { searchVolume: "desc" },
          take: 1,
          select: { term: true },
        },
      },
    });

    for (const opp of opportunities) {
      const term = opp.keywords[0]?.term?.trim();
      if (!term) continue;
      try {
        const raw = await this.dataForSeo.fetchOrganicSerpPreview(term, {
          depth: 5,
        });
        const serp = annotateSerpSnapshot(raw);
        const soft = organicSoftnessScore(serp);
        await this.prisma.opportunity.update({
          where: { id: opp.id },
          data: {
            serpSnapshot: serp,
            serpQuery: term,
            serpFetchedAt: new Date(),
            organicSoftness: soft.score,
          },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `SERP preview failed for opportunity ${opp.id} (${term}): ${message}`,
        );
      }
    }
  }

  private async enrichBuildBriefs(nicheId: string) {
    const opportunities = await this.prisma.opportunity.findMany({
      where: { nicheId },
      orderBy: { demandScore: "desc" },
      take: 16,
      select: {
        id: true,
        productDescription: true,
        buyerType: true,
        intent: true,
        totalVolume: true,
        avgCpc: true,
        avgCompetition: true,
        painSeverity: true,
      },
    });
    if (opportunities.length === 0) return;

    const brief = await this.claude.reviewThemeBuildAngles(
      opportunities.map((o) => ({
        productDescription: o.productDescription,
        buyerType: o.buyerType,
        intent: o.intent,
        totalVolume: o.totalVolume,
        avgCpc: o.avgCpc,
        avgCompetition: o.avgCompetition,
        painSeverity: o.painSeverity,
      })),
      nicheId,
    );

    const byLabel = new Map(
      brief.themes.map(
        (t) =>
          [
            t.product_description.trim().toLowerCase(),
            t,
          ] as const,
      ),
    );

    for (const opp of opportunities) {
      const t = byLabel.get(opp.productDescription.trim().toLowerCase());
      if (!t) continue;
      await this.prisma.opportunity.update({
        where: { id: opp.id },
        data: {
          productAngle: t.product_angle,
          monetizationModel: t.monetization_model,
          wedge: t.wedge,
        },
      });
    }
  }
}
