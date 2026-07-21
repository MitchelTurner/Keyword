import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  KeywordIdeaItemSchema,
  SearchVolumeItemSchema,
  normalizeCompetition,
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

@Injectable()
export class DataForSeoService {
  private readonly logger = new Logger(DataForSeoService.name);
  private readonly baseUrl = "https://api.dataforseo.com/v3";

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

  async expandKeywords(seedTerm: string, nicheId?: string): Promise<string[]> {
    const payload = [
      {
        keywords: [seedTerm],
        location_code: this.locationCode(),
        language_code: this.languageCode(),
        limit: 500,
      },
    ];

    const json = await this.request<{
      tasks: Array<{
        result?: Array<{ items?: unknown[] } | null> | null;
      }>;
    }>("/dataforseo_labs/google/keyword_ideas/live", payload, nicheId);

    const items = json.tasks?.[0]?.result?.[0]?.items ?? [];
    const terms: string[] = [];
    for (const raw of items) {
      const parsed = KeywordIdeaItemSchema.safeParse(raw);
      if (parsed.success && parsed.data.keyword.trim()) {
        terms.push(parsed.data.keyword.trim());
      }
    }
    return terms;
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
      for (const raw of items) {
        const parsed = SearchVolumeItemSchema.safeParse(raw);
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
