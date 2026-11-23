import {
  SearchVolumeItemSchema,
  foldKeyword,
  seriesFromVolumeFields,
  type DfsMarketSeries,
} from "@prospector/shared";
import { z } from "zod";

const EnvelopeCostSchema = z.object({
  cost: z.number().optional(),
  tasks: z
    .array(z.object({ cost: z.number().optional() }).passthrough())
    .optional(),
});

const TaskResultSchema = z.object({
  tasks: z
    .array(
      z
        .object({
          result: z.array(z.unknown()).nullable().optional(),
        })
        .passthrough(),
    )
    .optional(),
});

const MonthlySchema = z
  .object({
    year: z.number(),
    month: z.number(),
    search_volume: z.number().nullable().optional(),
  })
  .passthrough();

const HistoricalItemSchema = z
  .object({
    keyword: z.string(),
    search_volume: z.number().nullable().optional(),
    cpc: z.number().nullable().optional(),
    monthly_searches: z.array(MonthlySchema).nullable().optional(),
    keyword_info: z
      .object({
        search_volume: z.number().nullable().optional(),
        cpc: z.number().nullable().optional(),
        monthly_searches: z.array(MonthlySchema).nullable().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

export function readEnvelopeCost(json: unknown): number {
  const parsed = EnvelopeCostSchema.safeParse(json);
  if (!parsed.success) return 0;
  const taskCost = (parsed.data.tasks ?? []).reduce(
    (sum, task) => sum + (task.cost ?? 0),
    0,
  );
  if (taskCost > 0) return taskCost;
  return parsed.data.cost ?? 0;
}

export function taskResult(json: unknown): unknown[] {
  const parsed = TaskResultSchema.safeParse(json);
  if (!parsed.success) return [];
  return parsed.data.tasks?.[0]?.result ?? [];
}

export function extractHistoricalItems(
  result: unknown[] | null | undefined,
): unknown[] {
  if (!result?.length) return [];
  const first = result[0];
  if (
    first &&
    typeof first === "object" &&
    Array.isArray((first as { items?: unknown }).items)
  ) {
    return (first as { items: unknown[] }).items;
  }
  return [];
}

export function seriesFromHistoricalItem(
  raw: unknown,
): { keyword: string; series: DfsMarketSeries } | null {
  const parsed = HistoricalItemSchema.safeParse(raw);
  if (!parsed.success) return null;
  const keyword = parsed.data.keyword.trim();
  if (!keyword) return null;
  const info = parsed.data.keyword_info;
  return {
    keyword,
    series: seriesFromVolumeFields({
      searchVolume: info?.search_volume ?? parsed.data.search_volume,
      cpc: info?.cpc ?? parsed.data.cpc,
      monthly: info?.monthly_searches ?? parsed.data.monthly_searches,
    }),
  };
}

export function seriesFromAdsItem(
  raw: unknown,
): { keyword: string; series: DfsMarketSeries } | null {
  const parsed = SearchVolumeItemSchema.safeParse(raw);
  if (!parsed.success) return null;
  const keyword = parsed.data.keyword.trim();
  if (!keyword) return null;
  return {
    keyword,
    series: seriesFromVolumeFields({
      searchVolume: parsed.data.search_volume,
      cpc: parsed.data.cpc,
      monthly: parsed.data.monthly_searches,
    }),
  };
}

export function indexSeries(
  items: Array<{ keyword: string; series: DfsMarketSeries }>,
): {
  byLower: Map<string, DfsMarketSeries>;
  byFold: Map<string, DfsMarketSeries>;
} {
  const byLower = new Map<string, DfsMarketSeries>();
  const byFold = new Map<string, DfsMarketSeries>();
  for (const item of items) {
    byLower.set(item.keyword.toLowerCase(), item.series);
    byFold.set(foldKeyword(item.keyword), item.series);
  }
  return { byLower, byFold };
}
