import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  MIN_KEYWORD_VOLUME,
  RECOMMENDED_SEED_LOW_CPC_LIMIT,
  RECOMMENDED_SEED_LOW_CPC_MAX_COMPETITION,
  RECOMMENDED_SEED_LOW_CPC_MIN_VOLUME,
  RECOMMENDED_SEED_MAX_CPC,
  analyzeOpportunityTrend,
  buildRecommendations,
  estimateRunCost,
  searchSeedKeywords,
  type ApiSeedCandidate,
  type CreateNicheDto,
  type RecommendationKeyword,
  type RejectSeedDto,
  type SearchSeedKeywordsDto,
  type TrendAnalysis,
  type TrendPoint,
  type UpdateNicheAssumptionsDto,
  type UpdateOpportunityDto,
} from "@prospector/shared";
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { PipelineService } from "../pipeline/pipeline.service";
import { CostService } from "../cost/cost.service";
import { DataForSeoService } from "../dataforseo/dataforseo.service";
import { ClaudeService } from "../claude/claude.service";
import {
  DEFAULT_RUBRIC,
  attachDecisionSupport,
  parseRubricConfig,
} from "./decision";
import {
  SeedSearchJobStore,
  type SeedSearchJobRecord,
  type SeedSearchMode,
} from "./seed-search-job.store";

export type { SeedSearchMode };

export type RecommendationsPayload = ReturnType<typeof buildRecommendations> & {
  aiReviewError?: string;
  searching?: boolean;
  jobId?: string | null;
  progress?: string;
  mode?: SeedSearchMode;
  maxCpc?: number | null;
  diagnostics?: {
    discovered: number;
    afterRejectList: number;
    afterAi: number;
    recommended: number;
  };
};

function csvEscape(value: string | number | null | undefined): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function asTrendPoints(raw: Prisma.JsonValue | null): TrendPoint[] | null {
  if (!raw || !Array.isArray(raw)) return null;
  return raw as TrendPoint[];
}

const IN_FLIGHT_STATUSES = new Set([
  "EXPANDING",
  "ENRICHING",
  "CLASSIFYING",
  "SCORING",
]);

@Injectable()
export class NichesService {
  private readonly logger = new Logger(NichesService.name);

  /** Cache AI approve/reject decisions for a candidate set (6h). */
  private monetizeReviewCache: {
    key: string;
    expiresAt: number;
    reasons: Map<string, string>;
  } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly pipeline: PipelineService,
    private readonly cost: CostService,
    private readonly dataForSeo: DataForSeoService,
    private readonly claude: ClaudeService,
    private readonly seedJobs: SeedSearchJobStore,
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

  private mapOpportunity(
    o: {
      id: string;
      productDescription: string;
      buyerType: string;
      intent: string;
      painSeverity: number;
      reasoning: string;
      productAngle?: string | null;
      monetizationModel?: string | null;
      wedge?: string | null;
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
    },
    trend?: TrendAnalysis,
  ) {
    const t =
      trend ??
      ({
        direction: "unknown",
        score: 0,
        changePct: null,
        series: [],
      } satisfies TrendAnalysis);

    return {
      id: o.id,
      productDescription: o.productDescription,
      buyerType: o.buyerType,
      intent: o.intent,
      painSeverity: o.painSeverity,
      reasoning: o.reasoning,
      productAngle: o.productAngle ?? null,
      monetizationModel: o.monetizationModel ?? null,
      wedge: o.wedge ?? null,
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
      trend: {
        direction: t.direction,
        score: t.score,
        changePct: t.changePct,
        series: t.series,
      },
    };
  }

  private trendFromKeywords(
    keywords: Array<{ monthlyTrend: Prisma.JsonValue | null }>,
  ): TrendAnalysis {
    return analyzeOpportunityTrend(
      keywords.map((k) => asTrendPoints(k.monthlyTrend)),
    );
  }

  async get(id: string) {
    const niche = await this.prisma.niche.findUnique({
      where: { id },
      include: {
        opportunities: {
          orderBy: [{ pinned: "desc" }, { demandScore: "desc" }],
          include: {
            _count: { select: { keywords: true } },
            keywords: { select: { monthlyTrend: true } },
          },
        },
        _count: { select: { keywords: true } },
      },
    });
    if (!niche) throw new NotFoundException("Niche not found");

    const [costs, enrichedCount, keywordRows] = await Promise.all([
      this.cost.totalsByNiche(id),
      this.prisma.keyword.count({
        where: {
          nicheId: id,
          searchVolume: { gte: MIN_KEYWORD_VOLUME },
        },
      }),
      this.prisma.keyword.findMany({
        where: {
          nicheId: id,
          OR: [
            { searchVolume: { gte: MIN_KEYWORD_VOLUME } },
            { searchVolume: null },
          ],
        },
        orderBy: [{ searchVolume: "desc" }, { term: "asc" }],
        take: 500,
        select: {
          id: true,
          term: true,
          searchVolume: true,
          cpc: true,
          competition: true,
          monthlyTrend: true,
          opportunityId: true,
        },
      }),
    ]);

    const rubricConfig = parseRubricConfig(niche.rubricConfig);

    const mapped = niche.opportunities.map((o) =>
      this.mapOpportunity(
        { ...o, keywordCount: o._count.keywords },
        this.trendFromKeywords(o.keywords),
      ),
    );
    const opportunities = attachDecisionSupport(mapped, {
      rubricConfig,
    });

    const oppCount = opportunities.length || 1;
    const passCount = opportunities.filter((o) => o.decision.rubric.pass).length;

    return {
      id: niche.id,
      seedTerm: niche.seedTerm,
      status: niche.status,
      error: niche.error,
      convRate: niche.convRate,
      ltvCacRatio: niche.ltvCacRatio,
      rubricConfig,
      keywordCount: niche._count.keywords,
      enrichedKeywordCount: enrichedCount,
      createdAt: niche.createdAt,
      updatedAt: niche.updatedAt,
      costs: {
        ...costs,
        perOpportunity: costs.total / oppCount,
        perEnrichedKeyword:
          enrichedCount > 0 ? costs.total / enrichedCount : 0,
      },
      decisionSummary: {
        passCount,
        failCount: opportunities.length - passCount,
        defaults: {
          rubricConfig: DEFAULT_RUBRIC,
        },
      },
      opportunities,
      keywords: keywordRows.map((k) => ({
        id: k.id,
        term: k.term,
        searchVolume: k.searchVolume,
        cpc: k.cpc,
        competition: k.competition,
        monthlyTrend: k.monthlyTrend,
        opportunityId: k.opportunityId,
      })),
    };
  }

  async getOpportunity(nicheId: string, oppId: string) {
    const niche = await this.prisma.niche.findUnique({ where: { id: nicheId } });
    if (!niche) throw new NotFoundException("Niche not found");

    const siblings = await this.prisma.opportunity.findMany({
      where: { nicheId },
      include: {
        keywords: { select: { monthlyTrend: true } },
        _count: { select: { keywords: true } },
      },
    });

    const rubricConfig = parseRubricConfig(niche.rubricConfig);
    const withDecision = attachDecisionSupport(
      siblings.map((o) =>
        this.mapOpportunity(
          { ...o, keywordCount: o._count.keywords },
          this.trendFromKeywords(o.keywords),
        ),
      ),
      { rubricConfig },
    );

    const opportunity = await this.prisma.opportunity.findFirst({
      where: { id: oppId, nicheId },
      include: {
        keywords: {
          orderBy: { searchVolume: "desc" },
        },
      },
    });
    if (!opportunity) throw new NotFoundException("Opportunity not found");

    const decided = withDecision.find((o) => o.id === oppId);
    if (!decided) throw new NotFoundException("Opportunity not found");

    return {
      ...decided,
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

  async portfolio() {
    const rows = await this.prisma.opportunity.findMany({
      where: {
        OR: [
          { pinned: true },
          { reviewStatus: { in: ["watching", "building"] } },
        ],
      },
      orderBy: [{ pinned: "desc" }, { demandScore: "desc" }],
      include: {
        niche: {
          select: {
            id: true,
            seedTerm: true,
            status: true,
            rubricConfig: true,
          },
        },
        _count: { select: { keywords: true } },
        keywords: { select: { monthlyTrend: true } },
      },
    });

    // Decision support is per-niche (rubric), so group then flatten.
    const byNiche = new Map<string, typeof rows>();
    for (const row of rows) {
      const list = byNiche.get(row.nicheId) ?? [];
      list.push(row);
      byNiche.set(row.nicheId, list);
    }

    const items = [...byNiche.values()].flatMap((group) => {
      const niche = group[0]!.niche;
      const decided = attachDecisionSupport(
        group.map((o) =>
          this.mapOpportunity(
            { ...o, keywordCount: o._count.keywords },
            this.trendFromKeywords(o.keywords),
          ),
        ),
        {
          rubricConfig: parseRubricConfig(niche.rubricConfig),
        },
      );
      return decided.map((o) => ({
        ...o,
        nicheId: niche.id,
        nicheSeedTerm: niche.seedTerm,
        nicheStatus: niche.status,
      }));
    });

    items.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.demandScore - a.demandScore;
    });

    return { count: items.length, items };
  }

  async recommendations(
    opts: { forceRefresh?: boolean; mode?: SeedSearchMode } = {},
  ) {
    // Legacy ?refresh=true still works but prefers the async job path.
    if (opts.forceRefresh) {
      return this.startRecommendationsRefresh({
        mode: opts.mode ?? "default",
      });
    }

    const seedJob = await this.seedJobs.get();
    const mode = opts.mode;

    if (seedJob.status === "running") {
      const prior =
        mode == null || seedJob.mode === mode
          ? (seedJob.result as RecommendationsPayload | undefined)
          : undefined;
      return {
        niches: prior?.niches ?? [],
        keywords: prior?.keywords ?? [],
        followOns: prior?.followOns ?? [],
        aiReviewError: prior?.aiReviewError,
        searching: true,
        jobId: seedJob.id,
        progress: seedJob.progress,
        mode: seedJob.mode,
        maxCpc: seedJob.mode === "low_cpc" ? RECOMMENDED_SEED_MAX_CPC : null,
      };
    }

    // No mode (or matching mode): return the latest completed job as-is.
    // Critical: niche-list polls must not rebuild default high-CPC results
    // over a completed low-CPC search.
    if (
      seedJob.status === "done" &&
      seedJob.result &&
      (mode == null || seedJob.mode === mode)
    ) {
      return {
        ...(seedJob.result as RecommendationsPayload),
        searching: false,
        jobId: seedJob.id,
      };
    }

    return this.buildRecommendationsPayload({
      forceRefresh: false,
      attachSerp: false,
      mode: mode ?? "default",
    });
  }

  /** Start a background seed search (POST /recommendations/refresh). */
  async startRecommendationsRefresh(opts: { mode?: SeedSearchMode } = {}) {
    const mode = opts.mode ?? "default";
    const current = await this.seedJobs.get();
    if (current.status === "running") {
      return {
        niches: [] as RecommendationsPayload["niches"],
        keywords: [] as RecommendationKeyword[],
        followOns: [] as RecommendationKeyword[],
        searching: true,
        jobId: current.id,
        progress: current.progress,
        mode: current.mode,
        maxCpc: current.mode === "low_cpc" ? RECOMMENDED_SEED_MAX_CPC : null,
      };
    }

    const id = randomUUID();
    const running: SeedSearchJobRecord = {
      id,
      status: "running",
      progress:
        mode === "low_cpc"
          ? "Discovering low-CPC keywords…"
          : "Discovering keywords…",
      mode,
      // Do not carry prior-mode keywords — avoids flashing $50 CPC on a low-CPC run.
      result: undefined,
      updatedAt: Date.now(),
    };
    await this.seedJobs.set(running);

    void this.runRecommendationsRefresh(id, mode);

    return {
      niches: [] as RecommendationsPayload["niches"],
      keywords: [] as RecommendationKeyword[],
      followOns: [] as RecommendationKeyword[],
      searching: true,
      jobId: id,
      progress: running.progress,
      mode,
      maxCpc: mode === "low_cpc" ? RECOMMENDED_SEED_MAX_CPC : null,
    };
  }

  async getRecommendationsJob() {
    const seedJob = await this.seedJobs.get();
    return {
      jobId: seedJob.id || null,
      status: seedJob.status,
      progress: seedJob.progress,
      mode: seedJob.mode,
      error: seedJob.error ?? null,
      updatedAt: seedJob.updatedAt,
      result:
        seedJob.status === "done"
          ? ((seedJob.result as RecommendationsPayload | undefined) ?? null)
          : null,
    };
  }

  private async runRecommendationsRefresh(
    jobId: string,
    mode: SeedSearchMode,
  ) {
    try {
      await this.seedJobs.patch(jobId, {
        progress:
          mode === "low_cpc"
            ? "Discovering low-CPC keywords…"
            : "Discovering keywords…",
      });
      const result = await this.buildRecommendationsPayload({
        forceRefresh: true,
        attachSerp: true,
        mode,
        onProgress: (progress) => {
          void this.seedJobs.patch(jobId, { progress });
        },
      });
      const current = await this.seedJobs.get();
      if (current.id !== jobId) return;
      await this.seedJobs.set({
        id: jobId,
        status: "done",
        progress: "Done",
        mode,
        result,
        updatedAt: Date.now(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Async seed refresh failed: ${message}`);
      const current = await this.seedJobs.get();
      if (current.id !== jobId) return;
      await this.seedJobs.set({
        id: jobId,
        status: "error",
        progress: "Failed",
        mode,
        error: message,
        updatedAt: Date.now(),
      });
    }
  }

  private async buildRecommendationsPayload(opts: {
    forceRefresh: boolean;
    attachSerp: boolean;
    mode?: SeedSearchMode;
    onProgress?: (progress: string) => void;
  }): Promise<RecommendationsPayload> {
    const mode = opts.mode ?? "default";
    const maxCpc = mode === "low_cpc" ? RECOMMENDED_SEED_MAX_CPC : undefined;
    const minVolume =
      mode === "low_cpc" ? RECOMMENDED_SEED_LOW_CPC_MIN_VOLUME : undefined;
    const maxCompetition =
      mode === "low_cpc" ? RECOMMENDED_SEED_LOW_CPC_MAX_COMPETITION : undefined;

    const niches = await this.prisma.niche.findMany({
      select: { seedTerm: true },
    });
    const existingSeeds = niches.map((n) => n.seedTerm);

    const rejected = await this.prisma.rejectedSeed.findMany({
      select: { term: true },
    });
    const rejectedSet = new Set(
      rejected.map((r) => r.term.trim().toLowerCase()),
    );

    let apiCandidates: ApiSeedCandidate[] = [];
    let aiReviewError: string | undefined;
    let discovered = 0;
    let afterRejectList = 0;
    let afterAi = 0;

    try {
      opts.onProgress?.(
        mode === "low_cpc"
          ? "Querying DataForSEO for cheap CPC niches (≥100k vol)…"
          : "Querying DataForSEO…",
      );
      apiCandidates = await this.dataForSeo.discoverRecommendedSeeds({
        forceRefresh: opts.forceRefresh,
        maxCpc,
        minVolume,
        maxCompetition,
      });
      discovered = apiCandidates.length;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Live seed discovery failed: ${message}`);
      if (opts.forceRefresh) {
        throw new BadRequestException(`Seed search failed: ${message}`);
      }
      apiCandidates = [];
    }

    apiCandidates = apiCandidates.filter(
      (c) => !rejectedSet.has(c.term.trim().toLowerCase()),
    );
    // Hard volume floor for low-CPC before AI spend.
    if (mode === "low_cpc" && minVolume != null) {
      apiCandidates = apiCandidates.filter(
        (c) => (c.volume ?? 0) >= minVolume,
      );
    }
    afterRejectList = apiCandidates.length;

    // AI gate — fail closed: never surface unreviewed volume/comp seeds.
    if (apiCandidates.length > 0) {
      try {
        opts.onProgress?.(
          mode === "low_cpc"
            ? "AI-reviewing for high-volume monetizable niches…"
            : "AI-reviewing for buildable niches…",
        );
        apiCandidates = await this.filterMonetizableSeeds(
          apiCandidates,
          opts.forceRefresh,
          mode,
        );
        afterAi = apiCandidates.length;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`AI monetization review failed: ${message}`);
        aiReviewError = message;
        apiCandidates = [];
        afterAi = 0;
        if (opts.forceRefresh) {
          throw new BadRequestException(
            `AI review unavailable — seeds not shown without review: ${message}`,
          );
        }
      }
    }

    apiCandidates = apiCandidates.filter(
      (c) => !rejectedSet.has(c.term.trim().toLowerCase()),
    );

    opts.onProgress?.(
      mode === "low_cpc"
        ? "Ranking cheapest CPC seeds…"
        : "Ranking recommendations…",
    );
    const built = buildRecommendations({
      existingSeeds,
      apiCandidates,
      shuffle: opts.forceRefresh,
      maxCpc,
      preferLowCpc: mode === "low_cpc",
      minVolume,
      maxCompetition,
      limit: mode === "low_cpc" ? RECOMMENDED_SEED_LOW_CPC_LIMIT : undefined,
    });

    let keywords = built.keywords.filter(
      (k) => !rejectedSet.has(k.term.trim().toLowerCase()),
    );

    // Hard guarantee: low-CPC mode never returns keywords above the ceiling
    // or below the 100k volume floor.
    if (maxCpc != null) {
      const volFloor = minVolume ?? RECOMMENDED_SEED_LOW_CPC_MIN_VOLUME;
      keywords = keywords.filter(
        (k) =>
          k.cpc != null &&
          !Number.isNaN(k.cpc) &&
          k.cpc <= maxCpc &&
          (k.volume ?? 0) >= volFloor,
      );
      keywords = [...keywords].sort((a, b) => {
        const scoreA = a.score ?? 0;
        const scoreB = b.score ?? 0;
        if (scoreB !== scoreA) return scoreB - scoreA;
        const volDiff = (b.volume ?? 0) - (a.volume ?? 0);
        if (volDiff !== 0) return volDiff;
        const cpcA = a.cpc ?? Number.POSITIVE_INFINITY;
        const cpcB = b.cpc ?? Number.POSITIVE_INFINITY;
        return cpcA - cpcB;
      });
    }

    if (opts.attachSerp && keywords.length > 0) {
      opts.onProgress?.("Checking SERP for top picks…");
      keywords = await this.attachSerpPreviews(keywords, 5);
      // SERP attach must not reintroduce high-CPC rows.
      if (maxCpc != null) {
        const volFloor = minVolume ?? RECOMMENDED_SEED_LOW_CPC_MIN_VOLUME;
        keywords = keywords.filter(
          (k) =>
            k.cpc != null &&
            !Number.isNaN(k.cpc) &&
            k.cpc <= maxCpc &&
            (k.volume ?? 0) >= volFloor,
        );
      }
    }

    const job = await this.seedJobs.get();
    const diagnostics = {
      discovered,
      afterRejectList,
      afterAi,
      recommended: keywords.length,
    };

    this.logger.log(
      JSON.stringify({
        event: "seed_recommendations",
        mode,
        maxCpc: maxCpc ?? null,
        maxCpcInResult:
          keywords.length > 0
            ? Math.max(...keywords.map((k) => k.cpc ?? 0))
            : null,
        ...diagnostics,
      }),
    );

    return {
      ...built,
      keywords,
      followOns: keywords,
      aiReviewError,
      searching: false,
      jobId: job.id || null,
      mode,
      maxCpc: maxCpc ?? null,
      diagnostics,
    };
  }

  private async attachSerpPreviews(
    keywords: RecommendationKeyword[],
    limit: number,
  ): Promise<RecommendationKeyword[]> {
    const top = keywords.slice(0, limit);
    const settled = await Promise.allSettled(
      top.map((k) => this.dataForSeo.fetchOrganicSerpPreview(k.term, { depth: 5 })),
    );

    return keywords.map((k, idx) => {
      if (idx >= top.length) return k;
      const result = settled[idx];
      if (!result || result.status !== "fulfilled") return k;
      return { ...k, serp: result.value };
    });
  }

  /**
   * Ask Claude which seed terms are plausible website/software niches to monetize.
   * Rejects licensed professions (e.g. "doctor") and similar non-productizable terms.
   */
  private async filterMonetizableSeeds(
    candidates: ApiSeedCandidate[],
    forceRefresh: boolean,
    mode: SeedSearchMode = "default",
  ): Promise<ApiSeedCandidate[]> {
    const key = `${mode}|${candidates
      .map((c) => c.term.trim().toLowerCase())
      .sort()
      .join("|")}`;
    const ttlMs = 6 * 60 * 60 * 1000;

    if (
      !forceRefresh &&
      this.monetizeReviewCache &&
      this.monetizeReviewCache.key === key &&
      this.monetizeReviewCache.expiresAt > Date.now()
    ) {
      return candidates
        .filter((c) =>
          this.monetizeReviewCache!.reasons.has(c.term.trim().toLowerCase()),
        )
        .map((c) => ({
          ...c,
          aiReason:
            this.monetizeReviewCache!.reasons.get(c.term.trim().toLowerCase()) ??
            c.aiReason,
        }));
    }

    const review = await this.claude.reviewMonetizableSeeds(
      candidates.map((c) => c.term),
      { mode },
    );
    const reasons = new Map<string, string>();
    for (const r of review.reviews) {
      if (!r.approve) continue;
      reasons.set(r.keyword.trim().toLowerCase(), r.reason);
    }

    this.logger.log(
      JSON.stringify({
        event: "seed_monetize_review",
        input: candidates.length,
        approved: reasons.size,
        rejected: candidates.length - reasons.size,
        forceRefresh,
      }),
    );

    this.monetizeReviewCache = {
      key,
      expiresAt: Date.now() + ttlMs,
      reasons,
    };

    return candidates
      .filter((c) => reasons.has(c.term.trim().toLowerCase()))
      .map((c) => ({
        ...c,
        aiReason: reasons.get(c.term.trim().toLowerCase()) ?? c.aiReason,
      }));
  }

  async rejectSeed(dto: RejectSeedDto) {
    const term = dto.term.trim().replace(/\s+/g, " ");
    const key = term.toLowerCase();
    await this.prisma.rejectedSeed.upsert({
      where: { term: key },
      create: { term: key, reason: dto.reason?.trim() || null },
      update: { reason: dto.reason?.trim() || null },
    });

    // Drop from latest job result immediately.
    const job = await this.seedJobs.get();
    if (job.result) {
      const prior = job.result as RecommendationsPayload;
      const keywords = prior.keywords.filter(
        (k) => k.term.trim().toLowerCase() !== key,
      );
      await this.seedJobs.set({
        ...job,
        result: { ...prior, keywords, followOns: keywords },
        updatedAt: Date.now(),
      });
    }

    return { ok: true as const, term: key };
  }

  async unrejectSeed(term: string) {
    const key = term.trim().toLowerCase();
    await this.prisma.rejectedSeed.deleteMany({ where: { term: key } });
    return { ok: true as const, term: key };
  }

  async listRejectedSeeds() {
    const items = await this.prisma.rejectedSeed.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return { count: items.length, items };
  }

  /**
   * Search enriched keyword data for high-volume / low-competition seed ideas.
   */
  async searchSeeds(dto: SearchSeedKeywordsDto) {
    const minVolume = Math.max(dto.minVolume, MIN_KEYWORD_VOLUME);
    const maxCompetition = dto.maxCompetition;
    const maxCpc = dto.maxCpc;
    const limit = dto.limit;
    const q = dto.q.trim();

    const niches = await this.prisma.niche.findMany({
      select: { seedTerm: true },
    });
    const existingSeeds = niches.map((n) => n.seedTerm);

    const rows = await this.prisma.keyword.findMany({
      where: {
        searchVolume: { gte: minVolume },
        competition: { not: null, lte: maxCompetition },
        ...(maxCpc != null
          ? { cpc: { not: null, lte: maxCpc } }
          : {}),
        ...(q
          ? { term: { contains: q, mode: "insensitive" as const } }
          : {}),
      },
      orderBy:
        maxCpc != null
          ? [{ cpc: "asc" }, { searchVolume: "desc" }]
          : [{ searchVolume: "desc" }, { competition: "asc" }],
      take: 500,
      select: {
        term: true,
        searchVolume: true,
        competition: true,
        cpc: true,
        nicheId: true,
        niche: { select: { seedTerm: true } },
      },
    });

    const keywords = searchSeedKeywords(
      rows.map((k) => ({
        term: k.term,
        nicheId: k.nicheId,
        nicheSeed: k.niche.seedTerm,
        volume: k.searchVolume,
        competition: k.competition,
        cpc: k.cpc,
      })),
      existingSeeds,
      { minVolume, maxCompetition, maxCpc, limit },
    );

    return {
      query: {
        q,
        minVolume,
        maxCompetition,
        maxCpc: maxCpc ?? null,
        limit,
      },
      count: keywords.length,
      keywords,
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
      include: {
        _count: { select: { keywords: true } },
        keywords: { select: { monthlyTrend: true } },
      },
    });

    return this.mapOpportunity(
      updated,
      this.trendFromKeywords(updated.keywords),
    );
  }

  async updateAssumptions(id: string, dto: UpdateNicheAssumptionsDto) {
    const niche = await this.prisma.niche.findUnique({ where: { id } });
    if (!niche) throw new NotFoundException("Niche not found");

    const touchesScoring =
      dto.convRate !== undefined || dto.ltvCacRatio !== undefined;
    const shouldRescore = dto.rescore ?? touchesScoring;

    if (shouldRescore && niche.status !== "DONE" && niche.status !== "FAILED") {
      throw new BadRequestException(
        "Assumptions can only be edited when niche is DONE or FAILED",
      );
    }

    if (!shouldRescore && niche.status !== "DONE" && niche.status !== "FAILED") {
      // Allow rubric-only edits anytime except mid-flight.
      if (
        niche.status !== "PENDING" &&
        IN_FLIGHT_STATUSES.has(niche.status)
      ) {
        throw new BadRequestException(
          "Wait for the pipeline to finish before editing decision config",
        );
      }
    }

    const nextRubric = dto.rubricConfig
      ? { ...parseRubricConfig(niche.rubricConfig), ...dto.rubricConfig }
      : undefined;

    const updated = await this.prisma.niche.update({
      where: { id },
      data: {
        convRate: dto.convRate ?? niche.convRate,
        ltvCacRatio: dto.ltvCacRatio ?? niche.ltvCacRatio,
        rubricConfig:
          nextRubric === undefined
            ? undefined
            : (nextRubric as Prisma.InputJsonValue),
        ...(shouldRescore
          ? { status: "SCORING" as const, error: null }
          : {}),
      },
    });

    if (shouldRescore) {
      await this.pipeline.enqueueScore(id);
    }
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
      "trend_direction",
      "trend_change_pct",
      "reasoning",
      "keyword",
      "keyword_volume",
      "keyword_cpc",
      "keyword_competition",
    ].join(",");

    const lines = [header];
    for (const opp of opportunities) {
      const trend = this.trendFromKeywords(opp.keywords);
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
        csvEscape(trend.direction),
        csvEscape(trend.changePct),
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
    // Supports FAILED niches and stuck in-flight niches (see PipelineService).
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
