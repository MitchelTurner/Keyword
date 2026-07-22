import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  KeywordIdeaItemSchema,
  LabsKeywordMetricsSchema,
  MIN_KEYWORD_VOLUME,
  RECOMMENDED_SEED_MAX_COMPETITION,
  RECOMMENDED_SEED_MIN_VOLUME,
  SearchVolumeItemSchema,
  TOPIC_PROBES,
  normalizeCompetition,
  type ApiSeedCandidate,
  type SearchVolumeItem,
} from "@prospector/shared";
import { z } from "zod";
import { CostService } from "../cost/cost.service";

const EnvelopeSchema = z.object({
  status_code: z.number().optional(),
  status_message: z.string().optional(),
  cost: z.number().optional(),
  tasks: z
    .array(
      z.object({
        status_code: z.number(),
        status_message: z.string().optional(),
        cost: z.number().optional(),
        result: z.array(z.unknown()).nullable().optional(),
      }),
    )
    .optional(),
});

export type EnrichedKeywordRow = {
  keyword: string;
  /** Original term we requested (Google Ads may lowercase / spell-correct). */
  requestedKeyword?: string;
  searchVolume: number | null;
  cpc: number | null;
  competition: number | null;
  monthlyTrend: SearchVolumeItem["monthly_searches"];
  raw: SearchVolumeItem;
};

/**
 * Google Ads search_volume live returns a flat `result` array of keyword rows.
 * Labs endpoints (and older fixtures) nest rows under `result[0].items`.
 */
export function extractSearchVolumeItems(result: unknown[] | null | undefined): unknown[] {
  if (!result?.length) return [];
  const first = result[0];
  if (
    first &&
    typeof first === "object" &&
    Array.isArray((first as { items?: unknown }).items)
  ) {
    return (first as { items: unknown[] }).items;
  }
  return result;
}

type SeedDiscoveryCache = {
  expiresAt: number;
  candidates: ApiSeedCandidate[];
};

@Injectable()
export class DataForSeoService {
  private readonly logger = new Logger(DataForSeoService.name);
  private readonly baseUrl = "https://api.dataforseo.com/v3";
  private seedDiscoveryCache: SeedDiscoveryCache | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly costService: CostService,
  ) {}

  private credentials() {
    const login = this.config.get<string>("DATAFORSEO_LOGIN") ?? "";
    const password = this.config.get<string>("DATAFORSEO_PASSWORD") ?? "";
    if (!login || !password) {
      throw new Error("DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD are required");
    }
    return { login, password };
  }

  private locationCode() {
    return Number(this.config.get("DEFAULT_LOCATION_CODE") ?? 2840);
  }

  private languageCode() {
    return this.config.get<string>("DEFAULT_LANGUAGE_CODE") ?? "en";
  }

  private authHeader() {
    const { login, password } = this.credentials();
    const token = Buffer.from(`${login}:${password}`).toString("base64");
    return `Basic ${token}`;
  }

  async request<T>(
    endpoint: string,
    body: unknown,
    nicheId?: string,
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    let lastError: unknown;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: this.authHeader(),
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });

        if (res.status === 429 || res.status >= 500) {
          const text = await res.text();
          throw new Error(`DataForSEO HTTP ${res.status}: ${text}`);
        }

        if (!res.ok) {
          const text = await res.text();
          throw new Error(`DataForSEO HTTP ${res.status}: ${text}`);
        }

        const json: unknown = await res.json();
        const envelope = EnvelopeSchema.parse(json);
        const task = envelope.tasks?.[0];
        if (!task) {
          throw new Error("DataForSEO response missing tasks[0]");
        }
        if (task.status_code !== 20000) {
          throw new Error(
            `DataForSEO task failed (${task.status_code}): ${task.status_message ?? "unknown"}`,
          );
        }

        const cost = task.cost ?? envelope.cost ?? 0;
        await this.costService.logCost({
          provider: "dataforseo",
          endpoint,
          cost,
          nicheId,
          meta: { status_code: task.status_code },
        });

        return json as T;
      } catch (err) {
        lastError = err;
        const message = err instanceof Error ? err.message : String(err);
        const retryable =
          message.includes("HTTP 429") ||
          /HTTP 5\d\d/.test(message) ||
          message.includes("fetch failed");

        this.logger.warn(
          `DataForSEO ${endpoint} attempt ${attempt} failed: ${message}`,
        );

        if (!retryable || attempt === 3) break;
        const delay = 500 * 2 ** (attempt - 1);
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error(String(lastError));
  }

  /**
   * Pull broad keyword-database candidates for a seed.
   * Does NOT require the seed phrase inside each term — Claude filters relevance.
   */
  async expandKeywords(seedTerm: string, nicheId?: string): Promise<string[]> {
    const seed = seedTerm.trim();
    const [suggested, ideas] = await Promise.all([
      this.fetchKeywordSuggestions(seed, nicheId).catch((err) => {
        this.logger.warn(
          `keyword_suggestions failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        return [] as string[];
      }),
      this.fetchKeywordIdeas(seed, nicheId).catch((err) => {
        this.logger.warn(
          `keyword_ideas failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        return [] as string[];
      }),
    ]);

    const seen = new Set<string>();
    const pool: string[] = [];
    for (const term of [...suggested, ...ideas]) {
      const key = term.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      pool.push(term);
      if (pool.length >= 150) break;
    }

    this.logger.log(
      JSON.stringify({
        event: "expand_candidates",
        nicheId,
        seed,
        suggested: suggested.length,
        ideas: ideas.length,
        pool: pool.length,
      }),
    );
    return pool;
  }

  private extractLabKeywords(items: unknown[]): string[] {
    const terms: string[] = [];
    for (const raw of items) {
      const parsed = KeywordIdeaItemSchema.safeParse(raw);
      if (parsed.success && parsed.data.keyword.trim()) {
        terms.push(parsed.data.keyword.trim());
      }
    }
    return terms;
  }

  private async fetchKeywordSuggestions(
    seed: string,
    nicheId?: string,
  ): Promise<string[]> {
    const payload = [
      {
        keyword: seed,
        location_code: this.locationCode(),
        language_code: this.languageCode(),
        include_seed_keyword: true,
        // Allow related phrasing; AI decides topical relevance afterward.
        exact_match: false,
        filters: ["keyword_info.search_volume", ">=", MIN_KEYWORD_VOLUME],
        order_by: ["keyword_info.search_volume,desc"],
        limit: 100,
      },
    ];

    const json = await this.request<{
      tasks: Array<{
        result?: Array<{ items?: unknown[] } | null> | null;
      }>;
    }>("/dataforseo_labs/google/keyword_suggestions/live", payload, nicheId);

    return this.extractLabKeywords(json.tasks?.[0]?.result?.[0]?.items ?? []);
  }

  private async fetchKeywordIdeas(
    seed: string,
    nicheId?: string,
  ): Promise<string[]> {
    const payload = [
      {
        keywords: [seed],
        location_code: this.locationCode(),
        language_code: this.languageCode(),
        closely_variants: true,
        filters: ["keyword_info.search_volume", ">=", MIN_KEYWORD_VOLUME],
        order_by: ["relevance,desc"],
        limit: 100,
      },
    ];

    const json = await this.request<{
      tasks: Array<{
        result?: Array<{ items?: unknown[] } | null> | null;
      }>;
    }>("/dataforseo_labs/google/keyword_ideas/live", payload, nicheId);

    return this.extractLabKeywords(json.tasks?.[0]?.result?.[0]?.items ?? []);
  }

  /**
   * Live discovery of high-volume / low-competition seed ideas across
   * widely different topic probes. Cached in-memory to avoid repeat spend.
   *
   * Labs often returns bucketed competition (LOW≈0.33). We re-enrich the
   * shortlist with Google Ads search_volume to get competition_index (0–100).
   */
  async discoverRecommendedSeeds(opts?: {
    minVolume?: number;
    maxCompetition?: number;
    /** Keep only Ads CPC at or below this (USD). */
    maxCpc?: number;
    forceRefresh?: boolean;
  }): Promise<ApiSeedCandidate[]> {
    const minVolume = opts?.minVolume ?? RECOMMENDED_SEED_MIN_VOLUME;
    const maxCompetition =
      opts?.maxCompetition ?? RECOMMENDED_SEED_MAX_COMPETITION;
    const maxCpc = opts?.maxCpc;
    const ttlMs = 6 * 60 * 60 * 1000;

    if (
      !opts?.forceRefresh &&
      this.seedDiscoveryCache &&
      this.seedDiscoveryCache.expiresAt > Date.now()
    ) {
      return this.applyMaxCpcFilter(
        this.seedDiscoveryCache.candidates,
        maxCpc,
        minVolume,
        maxCompetition,
      );
    }

    const candidates: ApiSeedCandidate[] = [];
    // Shuffle probes; on button refresh use a smaller random subset so the
    // request finishes before proxy timeouts (full 18-probe runs are too slow).
    const probes = [...TOPIC_PROBES];
    for (let i = probes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [probes[i], probes[j]] = [probes[j]!, probes[i]!];
    }
    // Low-CPC niches are rarer — probe more topics when filtering by maxCpc.
    const selectedProbes = opts?.maxCpc != null
      ? probes.slice(0, opts?.forceRefresh ? 16 : 18)
      : opts?.forceRefresh
        ? probes.slice(0, 12)
        : probes.slice(0, 16);

    // Parallel probe calls (bounded) — much faster than serial batches.
    const concurrency = 6;
    for (let i = 0; i < selectedProbes.length; i += concurrency) {
      const batch = selectedProbes.slice(i, i + concurrency);
      const settled = await Promise.allSettled(
        batch.map((probe) =>
          this.fetchSeedIdeasForProbe(probe.seed, minVolume),
        ),
      );

      settled.forEach((result, idx) => {
        const probe = batch[idx]!;
        if (result.status === "rejected") {
          this.logger.warn(
            `Seed discovery probe failed (${probe.seed}): ${
              result.reason instanceof Error
                ? result.reason.message
                : String(result.reason)
            }`,
          );
          return;
        }
        for (const row of result.value) {
          candidates.push({
            term: row.term,
            category: probe.category,
            probe: probe.seed,
            volume: row.volume,
            competition: row.competition,
          });
        }
      });
    }

    if (candidates.length === 0) {
      throw new Error(
        "DataForSEO returned no low-competition keyword ideas for the probed topics",
      );
    }

    // Dedupe, keep strongest volume per term, then get precise Ads competition.
    const bestByTerm = new Map<string, ApiSeedCandidate>();
    for (const c of candidates) {
      const key = c.term.trim().toLowerCase();
      const prev = bestByTerm.get(key);
      if (!prev || (c.volume ?? 0) > (prev.volume ?? 0)) {
        bestByTerm.set(key, c);
      }
    }
    const shortlist = [...bestByTerm.values()]
      .sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))
      .slice(0, opts?.maxCpc != null ? 100 : opts?.forceRefresh ? 50 : 80);

    const refined = await this.refineSeedCompetition(shortlist, maxCompetition);

    this.logger.log(
      JSON.stringify({
        event: "seed_discovery",
        probes: selectedProbes.length,
        labsCandidates: candidates.length,
        shortlist: shortlist.length,
        refined: refined.length,
        forceRefresh: Boolean(opts?.forceRefresh),
        minVolume,
        maxCompetition,
        maxCpc: maxCpc ?? null,
      }),
    );

    if (refined.length === 0) {
      throw new Error(
        `No keywords passed volume ≥ ${minVolume} and competition ≤ ${Math.round(maxCompetition * 100)}% after Ads refine`,
      );
    }

    this.seedDiscoveryCache = {
      expiresAt: Date.now() + ttlMs,
      candidates: refined,
    };
    return this.applyMaxCpcFilter(
      refined,
      maxCpc,
      minVolume,
      maxCompetition,
    );
  }

  private applyMaxCpcFilter(
    candidates: ApiSeedCandidate[],
    maxCpc: number | undefined,
    minVolume: number,
    maxCompetition: number,
  ): ApiSeedCandidate[] {
    if (maxCpc == null) return candidates;
    const cheap = candidates.filter(
      (c) => c.cpc != null && !Number.isNaN(c.cpc) && c.cpc <= maxCpc,
    );
    if (cheap.length === 0) {
      throw new Error(
        `No keywords with CPC ≤ $${maxCpc.toFixed(2)} (volume ≥ ${minVolume}, competition ≤ ${Math.round(maxCompetition * 100)}%). Try Search new seeds first, or raise the CPC ceiling.`,
      );
    }
    // Prefer pennies: cheapest first within the cached set.
    return [...cheap].sort((a, b) => (a.cpc ?? 99) - (b.cpc ?? 99));
  }

  /**
   * Replace bucketed Labs competition (~0.33 for all LOW) with Google Ads
   * competition_index values, then keep only truly low-competition terms.
   */
  private async refineSeedCompetition(
    candidates: ApiSeedCandidate[],
    maxCompetition: number,
  ): Promise<ApiSeedCandidate[]> {
    if (candidates.length === 0) return [];

    const enriched = await this.enrichKeywords(
      candidates.map((c) => c.term),
    ).catch((err) => {
      this.logger.warn(
        `Seed competition refine failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return [] as EnrichedKeywordRow[];
    });

    const byTerm = new Map(
      enriched.map((row) => [
        (row.requestedKeyword ?? row.keyword).trim().toLowerCase(),
        row,
      ]),
    );
    // Also index by returned keyword spelling.
    for (const row of enriched) {
      byTerm.set(row.keyword.trim().toLowerCase(), row);
    }

    const out: ApiSeedCandidate[] = [];
    for (const c of candidates) {
      const row = byTerm.get(c.term.trim().toLowerCase());
      // Require Ads enrich — Labs LOW≈0.33 is not trustworthy alone.
      if (!row) continue;
      const volume = row.searchVolume ?? c.volume;
      // enrichKeywords already dropped label/bucket placeholders via normalizeCompetition.
      // Trust Ads competition_index values — including exact 0.33 (index 33).
      const competition = row.competition;
      if (volume == null || volume < RECOMMENDED_SEED_MIN_VOLUME) continue;
      if (competition == null || competition > maxCompetition) {
        continue;
      }
      out.push({
        ...c,
        volume,
        competition,
        cpc: row.cpc ?? null,
      });
    }
    return out;
  }

  /**
   * Lightweight organic SERP snapshot for reality-checking a seed keyword.
   */
  async fetchOrganicSerpPreview(
    keyword: string,
    opts?: { depth?: number },
  ): Promise<Array<{ rank: number; domain: string; title: string }>> {
    const depth = Math.min(Math.max(opts?.depth ?? 5, 1), 10);
    const payload = [
      {
        keyword,
        location_code: this.locationCode(),
        language_code: this.languageCode(),
        device: "desktop",
        os: "windows",
        depth,
      },
    ];

    const json = await this.request<{
      tasks: Array<{
        result?: Array<{
          items?: Array<{
            type?: string;
            rank_absolute?: number;
            rank_group?: number;
            domain?: string;
            title?: string;
            url?: string;
          }>;
        }>;
      }>;
    }>("/serp/google/organic/live/regular", payload);

    const items = json.tasks?.[0]?.result?.[0]?.items ?? [];
    const out: Array<{ rank: number; domain: string; title: string }> = [];
    for (const item of items) {
      if (item.type && item.type !== "organic") continue;
      const domain =
        item.domain?.trim() ||
        (item.url
          ? (() => {
              try {
                return new URL(item.url).hostname;
              } catch {
                return "";
              }
            })()
          : "");
      const title = item.title?.trim() ?? "";
      if (!domain && !title) continue;
      out.push({
        rank: item.rank_absolute ?? item.rank_group ?? out.length + 1,
        domain: domain || "unknown",
        title: title || domain || "untitled",
      });
      if (out.length >= depth) break;
    }
    return out;
  }

  private async fetchSeedIdeasForProbe(
    seed: string,
    minVolume: number,
  ): Promise<
    Array<{ term: string; volume: number | null; competition: number | null }>
  > {
    // Volume-only in Labs — LOW-only starved software niches. Ads refine is the
    // real competition gate (competition_index).
    const payload = [
      {
        keywords: [seed],
        location_code: this.locationCode(),
        language_code: this.languageCode(),
        closely_variants: false,
        filters: [["keyword_info.search_volume", ">=", minVolume]],
        order_by: ["keyword_info.search_volume,desc"],
        limit: 40,
      },
    ];

    const json = await this.request<{
      tasks: Array<{
        result?: Array<{ items?: unknown[] } | null> | null;
      }>;
    }>("/dataforseo_labs/google/keyword_ideas/live", payload);

    const items = json.tasks?.[0]?.result?.[0]?.items ?? [];
    const out: Array<{
      term: string;
      volume: number | null;
      competition: number | null;
    }> = [];

    for (const raw of items) {
      const parsed = LabsKeywordMetricsSchema.safeParse(raw);
      if (!parsed.success) continue;
      const term = parsed.data.keyword.trim();
      if (!term) continue;
      const info = parsed.data.keyword_info;
      out.push({
        term,
        volume: info?.search_volume ?? null,
        // Labs floats/labels are coarse — normalizeCompetition nulls buckets.
        // Ads refine fills competition_index afterward.
        competition: normalizeCompetition(info?.competition, null),
      });
    }
    return out;
  }

  async enrichKeywords(
    keywords: string[],
    nicheId?: string,
  ): Promise<EnrichedKeywordRow[]> {
    const chunks: string[][] = [];
    for (let i = 0; i < keywords.length; i += 1000) {
      chunks.push(keywords.slice(i, i + 1000));
    }

    const rows: EnrichedKeywordRow[] = [];
    for (const chunk of chunks) {
      const payload = [
        {
          keywords: chunk,
          location_code: this.locationCode(),
          language_code: this.languageCode(),
        },
      ];

      const json = await this.request<{
        tasks: Array<{
          result?: unknown[] | null;
        }>;
      }>("/keywords_data/google_ads/search_volume/live", payload, nicheId);

      const items = extractSearchVolumeItems(json.tasks?.[0]?.result ?? []);
      let parseFailures = 0;
      // Match response rows back to requested terms (API lowercases / may spell-correct).
      const claimed = new Set<number>();
      for (let reqIdx = 0; reqIdx < chunk.length; reqIdx++) {
        const requested = chunk[reqIdx]!;
        const reqLower = requested.toLowerCase();
        let matchIdx = items.findIndex((raw, i) => {
          if (claimed.has(i)) return false;
          const parsed = SearchVolumeItemSchema.safeParse(raw);
          if (!parsed.success) return false;
          const kw = parsed.data.keyword.trim().toLowerCase();
          const spell =
            typeof (parsed.data as { spell?: unknown }).spell === "string"
              ? String((parsed.data as { spell?: string }).spell)
                  .trim()
                  .toLowerCase()
              : "";
          return kw === reqLower || spell === reqLower;
        });
        if (matchIdx < 0 && reqIdx < items.length && !claimed.has(reqIdx)) {
          matchIdx = reqIdx; // positional fallback
        }
        if (matchIdx < 0) continue;

        const parsed = SearchVolumeItemSchema.safeParse(items[matchIdx]);
        if (!parsed.success) {
          parseFailures += 1;
          continue;
        }
        claimed.add(matchIdx);
        const item = parsed.data;
        rows.push({
          keyword: item.keyword,
          requestedKeyword: requested,
          searchVolume: item.search_volume ?? null,
          cpc: item.cpc ?? null,
          competition: normalizeCompetition(
            item.competition,
            item.competition_index,
          ),
          monthlyTrend: item.monthly_searches ?? null,
          raw: item,
        });
      }

      // Keep any leftover parsed items that did not map (better than dropping).
      for (let i = 0; i < items.length; i++) {
        if (claimed.has(i)) continue;
        const parsed = SearchVolumeItemSchema.safeParse(items[i]);
        if (!parsed.success) {
          parseFailures += 1;
          continue;
        }
        const item = parsed.data;
        rows.push({
          keyword: item.keyword,
          searchVolume: item.search_volume ?? null,
          cpc: item.cpc ?? null,
          competition: normalizeCompetition(
            item.competition,
            item.competition_index,
          ),
          monthlyTrend: item.monthly_searches ?? null,
          raw: item,
        });
      }

      if (items.length > 0 && rows.length === 0) {
        throw new Error(
          `DataForSEO search_volume returned ${items.length} rows but none parsed (check competition/schema)`,
        );
      }
      if (parseFailures > 0) {
        this.logger.warn(
          JSON.stringify({
            event: "search_volume_parse_failures",
            nicheId,
            parseFailures,
            items: items.length,
            parsed: items.length - parseFailures,
          }),
        );
      }
    }

    return rows;
  }
}
