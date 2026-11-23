import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  DFS_MARKETS,
  DFS_MARKET_IDS,
  DFS_PULL2_DEFAULT_MAX_COST,
  DfsPull2JobSchema,
  DfsPullResultSchema,
  DfsTrendsPullSchema,
  buildTrendsPlan,
  trendsResultsFile,
  dfsAdsDateRange,
  nextTrendsJob,
  takeSeriesForKeyword,
  trendsResponseInfo,
  trendsResponseSucceeded,
  trendsRunStatus,
  trendsSpent,
  type ContinueDfsTrendsDto,
  type CreateDfsPullDto,
  type DfsMarketId,
  type DfsMarketSeries,
  type DfsPull2Job,
  type DfsPullResult,
  type DfsPullRow,
  type DfsPullSummary,
  type DfsTrendsPull,
  type StartDfsTrendsDto,
} from "@prospector/shared";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  DataForSeoService,
  extractSearchVolumeItems,
} from "../dataforseo/dataforseo.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  extractHistoricalItems,
  indexSeries,
  readEnvelopeCost,
  seriesFromAdsItem,
  seriesFromHistoricalItem,
  taskResult,
} from "./dfs.parse";

const MARKET_GAP_MS = 2_000;
const ADS_BATCH = 1000;
const LABS_BATCH = 700;
const TRENDS_BATCH_MS = 45_000;
const TRENDS_GAP_MS = 400;

type TrendMeta = Record<
  string,
  {
    statusCode: number | null;
    cost: number;
    message: string;
    settled: boolean;
    ok: boolean;
  }
>;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function messageOf(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.length > 400 ? `${message.slice(0, 400)}…` : message;
}

function isMarket(value: unknown): value is DfsMarketId {
  return (
    typeof value === "string" &&
    (DFS_MARKET_IDS as readonly string[]).includes(value)
  );
}

function dedupeKeywords(keywords: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of keywords) {
    const term = raw.trim().replace(/\s+/g, " ");
    if (!term) continue;
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(term);
  }
  return out;
}

@Injectable()
export class DfsService {
  private readonly logger = new Logger(DfsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dataForSeo: DataForSeoService,
  ) {}

  async list(): Promise<{ pulls: DfsPullSummary[] }> {
    const rows = await this.prisma.dfsPull.findMany({
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        id: true,
        sourceName: true,
        kind: true,
        status: true,
        maxCost: true,
        jobDone: true,
        jobTotal: true,
        cost: true,
        createdAt: true,
        keywords: true,
        markets: true,
        warnings: true,
      },
    });
    return { pulls: rows.map((row) => this.summary(row)) };
  }

  async latest(): Promise<{ pull: DfsPullResult | DfsTrendsPull | null }> {
    const row = await this.prisma.dfsPull.findFirst({
      orderBy: { createdAt: "desc" },
    });
    return { pull: row ? this.present(row) : null };
  }

  async get(id: string): Promise<DfsPullResult | DfsTrendsPull> {
    const row = await this.prisma.dfsPull.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("DFS pull not found");
    return this.present(row);
  }

  async startTrends(dto: StartDfsTrendsDto): Promise<DfsTrendsPull> {
    let plan;
    try {
      plan = buildTrendsPlan(dto.source, dto.sourceName);
    } catch (err) {
      throw new BadRequestException(messageOf(err));
    }
    const created = await this.prisma.dfsPull.create({
      data: {
        sourceName: plan.sourceName,
        kind: "trends",
        status: "running",
        maxCost: dto.maxCost ?? DFS_PULL2_DEFAULT_MAX_COST,
        anchor: plan.anchor,
        jobTotal: plan.jobs.length,
        jobDone: 0,
        keywords: [],
        groups: [],
        markets: [],
        rows: [],
        warnings: [],
        plan: plan.jobs as Prisma.InputJsonValue,
        jobMeta: {},
        responses: {},
        cost: 0,
      },
    });
    return this.runTrendsBatch(created.id, {});
  }

  async continueTrends(id: string, dto: ContinueDfsTrendsDto): Promise<DfsTrendsPull> {
    return this.runTrendsBatch(id, dto);
  }

  async raw(id: string): Promise<{
    pulled: string;
    anchor: string;
    responses: Record<string, unknown>;
  }> {
    const row = await this.prisma.dfsPull.findUnique({
      where: { id },
      select: { kind: true, anchor: true, createdAt: true, responses: true },
    });
    if (!row || row.kind !== "trends") {
      throw new NotFoundException("DFS pull not found");
    }
    return {
      pulled: row.createdAt.toISOString().slice(0, 10),
      anchor: row.anchor ?? "taylor swift",
      responses: readRecord(row.responses),
    };
  }

  async create(dto: CreateDfsPullDto): Promise<DfsPullResult> {
    const keywords = dedupeKeywords(dto.keywords);
    if (keywords.length === 0) {
      throw new BadRequestException("Enter at least one keyword");
    }
    const requested: DfsMarketId[] = dto.markets?.length
      ? [...new Set(dto.markets)]
      : DFS_MARKETS.map((market) => market.id);

    const warnings: string[] = [];
    const succeeded: DfsMarketId[] = [];
    const byMarket = new Map<DfsMarketId, Map<string, DfsMarketSeries>>();
    let cost = 0;

    for (let i = 0; i < requested.length; i += 1) {
      const market = requested[i]!;
      if (i > 0) await sleep(MARKET_GAP_MS);
      try {
        const pulled = await this.pullMarket(market, keywords);
        cost += pulled.cost;
        succeeded.push(market);
        byMarket.set(market, pulled.byKeyword);
        if (pulled.missing > 0) {
          const label = DFS_MARKETS.find((item) => item.id === market)?.label ?? market;
          warnings.push(
            `${label}: no data for ${pulled.missing} keyword${pulled.missing === 1 ? "" : "s"}`,
          );
        }
      } catch (err) {
        const label = DFS_MARKETS.find((item) => item.id === market)?.label ?? market;
        const message = messageOf(err);
        this.logger.warn(`DFS pull ${market} failed: ${message}`);
        warnings.push(`${label}: ${message}`);
      }
    }

    if (succeeded.length === 0) {
      throw new BadRequestException(
        warnings.join(" ") || "DataForSEO pull failed",
      );
    }

    const labelMap = new Map<string, string[]>();
    for (const group of dto.groups ?? []) {
      const key = group.keyword.trim().toLowerCase();
      if (!labelMap.has(key)) labelMap.set(key, group.labels);
    }

    const rows: DfsPullRow[] = keywords.map((keyword) => {
      const markets: DfsPullRow["markets"] = {};
      for (const market of succeeded) {
        const series = byMarket.get(market)?.get(keyword);
        if (series) markets[market] = series;
      }
      return {
        keyword,
        labels: labelMap.get(keyword.toLowerCase()) ?? [],
        markets,
      };
    });

    const saved = await this.prisma.dfsPull.create({
      data: {
        sourceName: dto.sourceName?.trim() || "dfs_pull.py",
        keywords: keywords as Prisma.InputJsonValue,
        groups: (dto.groups ?? []) as Prisma.InputJsonValue,
        markets: succeeded as Prisma.InputJsonValue,
        rows: rows as Prisma.InputJsonValue,
        warnings: warnings as Prisma.InputJsonValue,
        cost,
      },
    });

    return this.hydrate(saved);
  }

  private async pullMarket(market: DfsMarketId, keywords: string[]) {
    const spec = DFS_MARKETS.find((item) => item.id === market);
    if (!spec) throw new Error(`Unknown market ${market}`);
    const batchSize = spec.kind === "ads" ? ADS_BATCH : LABS_BATCH;
    const byKeyword = new Map<string, DfsMarketSeries>();
    let cost = 0;
    let missing = 0;

    for (let i = 0; i < keywords.length; i += batchSize) {
      const chunk = keywords.slice(i, i + batchSize);
      const json = await this.dataForSeo.request<unknown>(
        spec.kind === "ads"
          ? "/keywords_data/google_ads/search_volume/live"
          : "/dataforseo_labs/google/historical_search_volume/live",
        [this.payload(spec, chunk)],
      );
      cost += readEnvelopeCost(json);
      const rawItems =
        spec.kind === "ads"
          ? extractSearchVolumeItems(taskResult(json))
          : extractHistoricalItems(taskResult(json));
      const parsed = rawItems
        .map((item) =>
          spec.kind === "ads" ? seriesFromAdsItem(item) : seriesFromHistoricalItem(item),
        )
        .filter((row): row is NonNullable<typeof row> => row != null);
      const indexed = indexSeries(parsed);
      for (const keyword of chunk) {
        const series = takeSeriesForKeyword(
          keyword,
          indexed.byLower,
          indexed.byFold,
        );
        if (!series) {
          missing += 1;
          byKeyword.set(keyword, { searchVolume: null, cpc: null, monthly: [] });
        } else {
          byKeyword.set(keyword, series);
        }
      }
    }

    return { byKeyword, cost, missing };
  }

  private payload(
    spec: (typeof DFS_MARKETS)[number],
    keywords: string[],
  ): Record<string, unknown> {
    if (spec.kind === "ads") {
      const range = dfsAdsDateRange();
      return {
        keywords,
        date_from: range.dateFrom,
        date_to: range.dateTo,
        tag: "yis_ads_worldwide",
      };
    }
    if (spec.locationCode == null || !spec.languageCode) {
      throw new Error(`Market ${spec.id} is missing a location`);
    }
    return {
      keywords,
      location_code: spec.locationCode,
      language_code: spec.languageCode,
      tag: `yis_${spec.id}`,
    };
  }

  private async runTrendsBatch(
    id: string,
    options: ContinueDfsTrendsDto,
  ): Promise<DfsTrendsPull> {
    const row = await this.prisma.dfsPull.findUnique({ where: { id } });
    if (!row || row.kind !== "trends") {
      throw new NotFoundException("DFS pull not found");
    }
    const jobs = z.array(DfsPull2JobSchema).parse(row.plan ?? []);
    const responses = readRecord(row.responses);
    const meta = readMeta(row.jobMeta);
    if (options.retryFailed) {
      for (const job of jobs) {
        if (!trendsResponseSucceeded(responses[job.key])) delete meta[job.key];
      }
    }
    const maxCost = options.maxCost ?? row.maxCost ?? DFS_PULL2_DEFAULT_MAX_COST;
    const attempted = new Set<string>();
    const deadline = Date.now() + TRENDS_BATCH_MS;
    let sinceSave = 0;

    while (Date.now() < deadline) {
      const spent = trendsSpent(responses);
      const job = nextTrendsJob(jobs, responses, meta, attempted, spent, maxCost);
      if (!job) break;
      attempted.add(job.key);
      const raw = await this.dataForSeo.requestRaw(`/${job.path}`, [job.payload]);
      responses[job.key] = raw as Prisma.JsonValue;
      const info = trendsResponseInfo(raw);
      meta[job.key] = {
        ...info,
        settled: true,
        ok: trendsResponseSucceeded(raw),
      };
      sinceSave += 1;
      if (sinceSave >= 5) {
        await this.saveTrends(id, responses, meta, maxCost, jobs);
        sinceSave = 0;
      }
      if (Date.now() < deadline - TRENDS_GAP_MS) {
        await new Promise((resolve) => setTimeout(resolve, TRENDS_GAP_MS));
      }
    }

    return this.saveTrends(id, responses, meta, maxCost, jobs);
  }

  private async saveTrends(
    id: string,
    responses: Record<string, unknown>,
    meta: TrendMeta,
    maxCost: number,
    jobs: DfsPull2Job[],
  ): Promise<DfsTrendsPull> {
    const spent = trendsSpent(responses);
    const done = jobs.filter((job) => trendsResponseSucceeded(responses[job.key])).length;
    const failed = jobs.filter(
      (job) => meta[job.key]?.settled && !trendsResponseSucceeded(responses[job.key]),
    ).length;
    const status = trendsRunStatus(jobs, responses, meta, spent, maxCost);
    const warnings: string[] = [];
    if (status === "capped") {
      warnings.push(
        `Stopped at the $${maxCost.toFixed(2)} cap after $${spent.toFixed(2)}. Raise the cap and continue to finish the rest.`,
      );
    }
    if (failed > 0) {
      warnings.push(
        `${failed} request${failed === 1 ? "" : "s"} failed. Retry failed to send them again.`,
      );
    }
    const saved = await this.prisma.dfsPull.update({
      where: { id },
      data: {
        status,
        maxCost,
        jobDone: done,
        cost: spent,
        warnings,
        jobMeta: meta as Prisma.InputJsonValue,
        responses: responses as Prisma.InputJsonValue,
      },
    });
    return this.presentTrends(saved, jobs);
  }

  private present(
    row: Prisma.DfsPullGetPayload<Record<string, never>>,
  ): DfsPullResult | DfsTrendsPull {
    if (row.kind === "trends") {
      const jobs = z.array(DfsPull2JobSchema).parse(row.plan ?? []);
      return this.presentTrends(row, jobs);
    }
    return this.hydrate(row);
  }

  private presentTrends(
    row: Prisma.DfsPullGetPayload<Record<string, never>>,
    jobs: DfsPull2Job[],
  ): DfsTrendsPull {
    const responses = readRecord(row.responses);
    const meta = readMeta(row.jobMeta);
    const endpoints = new Map<string, number>();
    for (const job of jobs) endpoints.set(job.path, (endpoints.get(job.path) ?? 0) + 1);
    const done = jobs.filter((job) => trendsResponseSucceeded(responses[job.key])).length;
    const failed = jobs.filter(
      (job) => meta[job.key]?.settled && !trendsResponseSucceeded(responses[job.key]),
    ).length;
    return DfsTrendsPullSchema.parse({
      kind: "trends",
      id: row.id,
      sourceName: row.sourceName,
      pulledAt: row.createdAt.toISOString(),
      anchor: row.anchor ?? "taylor swift",
      status: row.status === "capped" || row.status === "done" ? row.status : "running",
      cost: row.cost,
      maxCost: row.maxCost ?? DFS_PULL2_DEFAULT_MAX_COST,
      jobTotal: jobs.length,
      jobDone: done,
      failed,
      warnings: Array.isArray(row.warnings)
        ? row.warnings.filter((item): item is string => typeof item === "string")
        : [],
      endpoints: [...endpoints.entries()].map(([path, count]) => ({ path, count })),
      resultsFile: trendsResultsFile(jobs, row.sourceName),
      jobs: jobs.map((job) => ({
        key: job.key,
        path: job.path,
        statusCode: meta[job.key]?.statusCode ?? null,
        cost: meta[job.key]?.cost ?? 0,
        message: meta[job.key]?.message ?? "",
        ok: meta[job.key]?.ok === true || trendsResponseSucceeded(responses[job.key]),
      })),
    });
  }

  private summary(row: {
    id: string;
    sourceName: string;
    kind: string;
    status: string;
    maxCost: number | null;
    jobDone: number;
    jobTotal: number;
    cost: number;
    createdAt: Date;
    keywords: Prisma.JsonValue;
    markets: Prisma.JsonValue;
    warnings: Prisma.JsonValue;
  }): DfsPullSummary {
    const keywords = Array.isArray(row.keywords) ? row.keywords : [];
    const markets = Array.isArray(row.markets) ? row.markets.filter(isMarket) : [];
    const warnings = Array.isArray(row.warnings)
      ? row.warnings.filter((item): item is string => typeof item === "string")
      : [];
    return {
      id: row.id,
      sourceName: row.sourceName,
      pulledAt: row.createdAt.toISOString(),
      cost: row.cost,
      keywordCount: row.kind === "trends" ? row.jobTotal : keywords.length,
      markets,
      warnings,
      kind: row.kind === "trends" ? "trends" : "volume",
      status: row.status === "running" || row.status === "capped" ? row.status : "done",
      jobDone: row.jobDone,
      jobTotal: row.jobTotal,
      maxCost: row.maxCost,
    };
  }

  private hydrate(row: {
    id: string;
    sourceName: string;
    kind: string;
    status: string;
    maxCost: number | null;
    jobDone: number;
    jobTotal: number;
    cost: number;
    createdAt: Date;
    keywords: Prisma.JsonValue;
    markets: Prisma.JsonValue;
    warnings: Prisma.JsonValue;
    rows: Prisma.JsonValue;
  }): DfsPullResult {
    return DfsPullResultSchema.parse({
      ...this.summary(row),
      kind: "volume",
      rows: row.rows,
    });
  }
}

function readRecord(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function readMeta(value: Prisma.JsonValue | null | undefined): TrendMeta {
  const record = readRecord(value);
  const meta: TrendMeta = {};
  for (const [key, raw] of Object.entries(record)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const item = raw as {
      statusCode?: unknown;
      cost?: unknown;
      message?: unknown;
      settled?: unknown;
      ok?: unknown;
    };
    meta[key] = {
      statusCode: typeof item.statusCode === "number" ? item.statusCode : null,
      cost: typeof item.cost === "number" ? item.cost : 0,
      message: typeof item.message === "string" ? item.message : "",
      settled: item.settled === true,
      ok: item.ok === true,
    };
  }
  return meta;
}
