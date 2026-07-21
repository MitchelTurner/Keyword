import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  CreateNicheDto,
  UpdateNicheAssumptionsDto,
} from "@prospector/shared";
import { PrismaService } from "../prisma/prisma.service";
import { PipelineService } from "../pipeline/pipeline.service";
import { CostService } from "../cost/cost.service";

@Injectable()
export class NichesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pipeline: PipelineService,
    private readonly cost: CostService,
  ) {}

  async create(dto: CreateNicheDto) {
    const niche = await this.prisma.niche.create({
      data: { seedTerm: dto.seedTerm, status: "EXPANDING" },
    });
    await this.pipeline.enqueueExpand(niche.id);
    return niche;
  }

  async list() {
    const niches = await this.prisma.niche.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { keywords: true, opportunities: true },
        },
      },
    });

    const globalCost = await this.cost.globalTotal();

    return {
      globalCost,
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

  async get(id: string) {
    const niche = await this.prisma.niche.findUnique({
      where: { id },
      include: {
        opportunities: {
          orderBy: { demandScore: "desc" },
          include: {
            _count: { select: { keywords: true } },
          },
        },
        _count: { select: { keywords: true } },
      },
    });
    if (!niche) throw new NotFoundException("Niche not found");

    const costs = await this.cost.totalsByNiche(id);

    return {
      id: niche.id,
      seedTerm: niche.seedTerm,
      status: niche.status,
      error: niche.error,
      convRate: niche.convRate,
      ltvCacRatio: niche.ltvCacRatio,
      keywordCount: niche._count.keywords,
      createdAt: niche.createdAt,
      updatedAt: niche.updatedAt,
      costs,
      opportunities: niche.opportunities.map((o) => ({
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
        keywordCount: o._count.keywords,
        createdAt: o.createdAt,
      })),
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
      id: opportunity.id,
      nicheId: opportunity.nicheId,
      productDescription: opportunity.productDescription,
      buyerType: opportunity.buyerType,
      intent: opportunity.intent,
      painSeverity: opportunity.painSeverity,
      reasoning: opportunity.reasoning,
      totalVolume: opportunity.totalVolume,
      avgCpc: opportunity.avgCpc,
      avgCompetition: opportunity.avgCompetition,
      impliedCac: opportunity.impliedCac,
      annualPriceFloor: opportunity.annualPriceFloor,
      monthlyPriceFloor: opportunity.monthlyPriceFloor,
      demandScore: opportunity.demandScore,
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

    // Unlink keywords from opportunities first (optional FK), then cascade niche.
    await this.prisma.keyword.updateMany({
      where: { nicheId: id },
      data: { opportunityId: null },
    });
    await this.prisma.niche.delete({ where: { id } });
    return { ok: true };
  }
}
