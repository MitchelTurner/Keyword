import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  DFS_MARKETS,
  DFS_MARKET_IDS,
  DfsPullResultSchema,
  dfsAdsDateRange,
  takeSeriesForKeyword,
  type CreateDfsPullDto,
  type DfsMarketId,
  type DfsMarketSeries,
  type DfsPullResult,
  type DfsPullRow,
  type DfsPullSummary,
} from "@prospector/shared";
import { Prisma } from "@prisma/client";
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
        cost: true,
        createdAt: true,
        keywords: true,
        markets: true,
        warnings: true,
      },
    });
    return { pulls: rows.map((row) => this.summary(row)) };
  }

  async latest(): Promise<{ pull: DfsPullResult | null }> {
    const row = await this.prisma.dfsPull.findFirst({
      orderBy: { createdAt: "desc" },
    });
    return { pull: row ? this.hydrate(row) : null };
  }

  async get(id: string): Promise<DfsPullResult> {
    const row = await this.prisma.dfsPull.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("DFS pull not found");
    return this.hydrate(row);
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

  private summary(row: {
    id: string;
    sourceName: string;
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
      keywordCount: keywords.length,
      markets,
      warnings,
    };
  }

  private hydrate(row: {
    id: string;
    sourceName: string;
    cost: number;
    createdAt: Date;
    keywords: Prisma.JsonValue;
    markets: Prisma.JsonValue;
    warnings: Prisma.JsonValue;
    rows: Prisma.JsonValue;
  }): DfsPullResult {
    return DfsPullResultSchema.parse({
      ...this.summary(row),
      rows: row.rows,
    });
  }
}
