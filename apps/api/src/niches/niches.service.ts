import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  estimateRunCost,
  type CreateNicheDto,
  type UpdateNicheAssumptionsDto,
  type UpdateOpportunityDto,
} from "@prospector/shared";
import { PrismaService } from "../prisma/prisma.service";
import { PipelineService } from "../pipeline/pipeline.service";
import { CostService } from "../cost/cost.service";

function csvEscape(value: string | number | null | undefined): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

@Injectable()
export class NichesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pipeline: PipelineService,
    private readonly cost: CostService,
  ) {}

  estimateCost() {
    return estimateRunCost();
  }

  async create(dto: CreateNicheDto) {
    const niche = await this.prisma.niche.create({
      data: { seedTerm: dto.seedTerm, status: "EXPANDING" },
    });
    await this.pipeline.enqueueExpand(niche.id);
    return niche;
  }

  async list() {
    const [niches, globalCost] = await Promise.all([
      this.prisma.niche.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          _count: {
            select: { keywords: true, opportunities: true },
          },
        },
      }),
      this.cost.globalTotal(),
    ]);

    return {
      globalCost,
      costEstimate: estimateRunCost(),
      niches: niches.map((n) => ({
        id: n.id,
        seedTerm: n.seedTerm,
        status: n.status,
        error: n.error,
        convRate: n.convRate,
        ltvCacRatio: n.ltvCacRatio,
        keywordCount: n._count.keywords,
        opportunityCount: n._count.opportunities,
        createdAt: n.createdAt,
        updatedAt: n.updatedAt,
      })),
    };
  }

  private mapOpportunity(o: {
    id: string;
    productDescription: string;
    buyerType: string;
    intent: string;
    painSeverity: number;
    reasoning: string;
    totalVolume: number;
    avgCpc: number;
    avgCompetition: number;
    impliedCac: number;
    annualPriceFloor: number;
    monthlyPriceFloor: number;
    demandScore: number;
    pinned: boolean;
    notes: string;
    reviewStatus: string;
    createdAt: Date;
    _count?: { keywords: number };
    keywordCount?: number;
  }) {
    return {
      id: o.id,
      productDescription: o.productDescription,
      buyerType: o.buyerType,
      intent: o.intent,
      painSeverity: o.painSeverity,
      reasoning: o.reasoning,
      totalVolume: o.totalVolume,
      avgCpc: o.avgCpc,
      avgCompetition: o.avgCompetition,
      impliedCac: o.impliedCac,
      annualPriceFloor: o.annualPriceFloor,
      monthlyPriceFloor: o.monthlyPriceFloor,
      demandScore: o.demandScore,
      pinned: o.pinned,
      notes: o.notes,
      reviewStatus: o.reviewStatus,
      keywordCount: o.keywordCount ?? o._count?.keywords ?? 0,
      createdAt: o.createdAt,
    };
  }

  async get(id: string) {
    const niche = await this.prisma.niche.findUnique({
      where: { id },
      include: {
        opportunities: {
          orderBy: [{ pinned: "desc" }, { demandScore: "desc" }],
          include: {
            _count: { select: { keywords: true } },
          },
        },
        _count: { select: { keywords: true } },
      },
    });
    if (!niche) throw new NotFoundException("Niche not found");

    const costs = await this.cost.totalsByNiche(id);
    const enrichedCount = await this.prisma.keyword.count({
      where: { nicheId: id, searchVolume: { not: null } },
    });

    return {
      id: niche.id,
      seedTerm: niche.seedTerm,
      status: niche.status,
      error: niche.error,
      convRate: niche.convRate,
      ltvCacRatio: niche.ltvCacRatio,
      keywordCount: niche._count.keywords,
      enrichedKeywordCount: enrichedCount,
      createdAt: niche.createdAt,
      updatedAt: niche.updatedAt,
      costs,
      opportunities: niche.opportunities.map((o) => this.mapOpportunity(o)),
    };
  }

  async getOpportunity(nicheId: string, oppId: string) {
    const opportunity = await this.prisma.opportunity.findFirst({
      where: { id: oppId, nicheId },
      include: {
        keywords: {
          orderBy: { searchVolume: "desc" },
        },
      },
    });
    if (!opportunity) throw new NotFoundException("Opportunity not found");

    return {
      ...this.mapOpportunity({
        ...opportunity,
        keywordCount: opportunity.keywords.length,
      }),
      nicheId: opportunity.nicheId,
      keywords: opportunity.keywords.map((k) => ({
        id: k.id,
        term: k.term,
        searchVolume: k.searchVolume,
        cpc: k.cpc,
        competition: k.competition,
        monthlyTrend: k.monthlyTrend,
      })),
    };
  }

  async updateOpportunity(
    nicheId: string,
    oppId: string,
    dto: UpdateOpportunityDto,
  ) {
    const opportunity = await this.prisma.opportunity.findFirst({
      where: { id: oppId, nicheId },
    });
    if (!opportunity) throw new NotFoundException("Opportunity not found");

    const updated = await this.prisma.opportunity.update({
      where: { id: oppId },
      data: {
        pinned: dto.pinned ?? undefined,
        notes: dto.notes ?? undefined,
        reviewStatus: dto.reviewStatus ?? undefined,
      },
      include: { _count: { select: { keywords: true } } },
    });

    return this.mapOpportunity(updated);
  }

  async updateAssumptions(id: string, dto: UpdateNicheAssumptionsDto) {
    const niche = await this.prisma.niche.findUnique({ where: { id } });
    if (!niche) throw new NotFoundException("Niche not found");

    if (niche.status !== "DONE" && niche.status !== "FAILED") {
      throw new BadRequestException(
        "Assumptions can only be edited when niche is DONE or FAILED",
      );
    }

    const updated = await this.prisma.niche.update({
      where: { id },
      data: {
        convRate: dto.convRate ?? niche.convRate,
        ltvCacRatio: dto.ltvCacRatio ?? niche.ltvCacRatio,
        status: "SCORING",
        error: null,
      },
    });

    await this.pipeline.enqueueScore(id);
    return updated;
  }

  async reclassify(id: string) {
    const niche = await this.prisma.niche.findUnique({ where: { id } });
    if (!niche) throw new NotFoundException("Niche not found");

    if (niche.status !== "DONE" && niche.status !== "FAILED") {
      throw new BadRequestException(
        "Re-classify is only available when niche is DONE or FAILED",
      );
    }

    const enrichedCount = await this.prisma.keyword.count({
      where: { nicheId: id, searchVolume: { not: null } },
    });
    if (enrichedCount === 0) {
      throw new BadRequestException(
        "No enriched keywords available to re-classify",
      );
    }

    await this.prisma.niche.update({
      where: { id },
      data: { status: "CLASSIFYING", error: null },
    });
    await this.pipeline.enqueueClassify(id);
    return { id, status: "CLASSIFYING" as const };
  }

  async exportCsv(id: string): Promise<string> {
    const niche = await this.prisma.niche.findUnique({ where: { id } });
    if (!niche) throw new NotFoundException("Niche not found");

    const opportunities = await this.prisma.opportunity.findMany({
      where: { nicheId: id },
      orderBy: [{ pinned: "desc" }, { demandScore: "desc" }],
      include: {
        keywords: { orderBy: { searchVolume: "desc" } },
      },
    });

    const header = [
      "niche_seed",
      "opportunity_id",
      "product_description",
      "buyer_type",
      "intent",
      "pain_severity",
      "review_status",
      "pinned",
      "notes",
      "total_volume",
      "avg_cpc",
      "avg_competition",
      "implied_cac",
      "monthly_price_floor",
      "demand_score",
      "reasoning",
      "keyword",
      "keyword_volume",
      "keyword_cpc",
      "keyword_competition",
    ].join(",");

    const lines = [header];
    for (const opp of opportunities) {
      const base = [
        csvEscape(niche.seedTerm),
        csvEscape(opp.id),
        csvEscape(opp.productDescription),
        csvEscape(opp.buyerType),
        csvEscape(opp.intent),
        csvEscape(opp.painSeverity),
        csvEscape(opp.reviewStatus),
        csvEscape(opp.pinned ? "true" : "false"),
        csvEscape(opp.notes),
        csvEscape(opp.totalVolume),
        csvEscape(opp.avgCpc),
        csvEscape(opp.avgCompetition),
        csvEscape(opp.impliedCac),
        csvEscape(opp.monthlyPriceFloor),
        csvEscape(opp.demandScore),
        csvEscape(opp.reasoning),
      ];

      if (opp.keywords.length === 0) {
        lines.push([...base, "", "", "", ""].join(","));
        continue;
      }

      for (const kw of opp.keywords) {
        lines.push(
          [
            ...base,
            csvEscape(kw.term),
            csvEscape(kw.searchVolume),
            csvEscape(kw.cpc),
            csvEscape(kw.competition),
          ].join(","),
        );
      }
    }

    return lines.join("\n") + "\n";
  }

  async retry(id: string) {
    const niche = await this.prisma.niche.findUnique({ where: { id } });
    if (!niche) throw new NotFoundException("Niche not found");
    if (niche.status !== "FAILED") {
      throw new BadRequestException("Only FAILED niches can be retried");
    }
    const job = await this.pipeline.retryFailed(id);
    return { id, retriedJob: job };
  }

  async remove(id: string) {
    const niche = await this.prisma.niche.findUnique({ where: { id } });
    if (!niche) throw new NotFoundException("Niche not found");

    await this.prisma.keyword.updateMany({
      where: { nicheId: id },
      data: { opportunityId: null },
    });
    await this.prisma.niche.delete({ where: { id } });
    return { ok: true };
  }
}
