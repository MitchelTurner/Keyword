import { z } from "zod";
import {
  preparePythonSource,
  pythonBracketAssignment,
  pythonStringAssignment,
  pythonStringIntDict,
  pythonStrings,
  pythonYearLists,
} from "./dfs-pull";

/** Same default as dfs_pull2.py (`MAX_COST`, default $5). */
export const DFS_PULL2_DEFAULT_MAX_COST = 5;

export const DFS_PULL2_PATHS = [
  "keywords_data/google_trends/explore/live",
  "serp/google/organic/live/advanced",
  "serp/google/autocomplete/live/advanced",
] as const;

const TrendsPayloadSchema = z.object({
  keywords: z.array(z.string().min(1).max(80)).min(1).max(5),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.literal("web").optional(),
  item_types: z
    .array(
      z.enum([
        "google_trends_graph",
        "google_trends_map",
        "google_trends_topics_list",
        "google_trends_queries_list",
      ]),
    )
    .min(1)
    .max(4),
  tag: z.string().min(1).max(180),
  location_code: z.number().int().positive().optional(),
});

const SerpPayloadSchema = z.object({
  keyword: z.string().min(1).max(80),
  location_code: z.number().int().positive(),
  language_code: z.string().regex(/^[a-z]{2}$/),
  device: z.literal("desktop"),
  depth: z.number().int().min(1).max(20),
  tag: z.string().min(1).max(180),
});

const AutocompletePayloadSchema = z.object({
  keyword: z.string().min(1).max(80),
  location_code: z.number().int().positive(),
  language_code: z.string().regex(/^[a-z]{2}$/),
  client: z.string().min(1).max(40),
  tag: z.string().min(1).max(180),
});

export const DfsPull2JobSchema = z.discriminatedUnion("path", [
  z.object({
    key: z.string().min(1).max(180),
    path: z.literal("keywords_data/google_trends/explore/live"),
    payload: TrendsPayloadSchema,
  }),
  z.object({
    key: z.string().min(1).max(180),
    path: z.literal("serp/google/organic/live/advanced"),
    payload: SerpPayloadSchema,
  }),
  z.object({
    key: z.string().min(1).max(180),
    path: z.literal("serp/google/autocomplete/live/advanced"),
    payload: AutocompletePayloadSchema,
  }),
]);
export type DfsPull2Job = z.infer<typeof DfsPull2JobSchema>;

export type DfsPull2EndpointCount = { path: string; count: number };

export type DfsPull2Plan = {
  sourceName: string;
  anchor: string;
  today: string;
  jobs: DfsPull2Job[];
  endpoints: DfsPull2EndpointCount[];
  resultsFile: string;
};

export const StartDfsTrendsSchema = z.object({
  sourceName: z.string().trim().min(1).max(120).optional(),
  source: z.string().min(1).max(200_000),
  maxCost: z.number().positive().max(100).optional(),
});
export type StartDfsTrendsDto = z.infer<typeof StartDfsTrendsSchema>;

export const ContinueDfsTrendsSchema = z.object({
  maxCost: z.number().positive().max(100).optional(),
  retryFailed: z.boolean().optional(),
});
export type ContinueDfsTrendsDto = z.infer<typeof ContinueDfsTrendsSchema>;

export const DfsTrendsJobMetaSchema = z.object({
  key: z.string(),
  path: z.string(),
  statusCode: z.number().nullable(),
  cost: z.number(),
  message: z.string(),
  ok: z.boolean(),
});
export type DfsTrendsJobMeta = z.infer<typeof DfsTrendsJobMetaSchema>;

export const DfsTrendsPullSchema = z.object({
  kind: z.literal("trends"),
  id: z.string(),
  sourceName: z.string(),
  pulledAt: z.string(),
  anchor: z.string(),
  status: z.enum(["running", "done", "capped"]),
  cost: z.number(),
  maxCost: z.number(),
  jobTotal: z.number().int(),
  jobDone: z.number().int(),
  failed: z.number().int(),
  warnings: z.array(z.string()),
  endpoints: z.array(z.object({ path: z.string(), count: z.number() })),
  jobs: z.array(DfsTrendsJobMetaSchema),
  resultsFile: z.string().default("dfs_results2.json"),
});
export type DfsTrendsPull = z.infer<typeof DfsTrendsPullSchema>;

export function dfsPull2EndpointLabel(path: string): string {
  switch (path) {
    case "keywords_data/google_trends/explore/live":
      return "Google Trends";
    case "serp/google/organic/live/advanced":
      return "Google results";
    case "serp/google/autocomplete/live/advanced":
      return "Autocomplete";
    default:
      return path;
  }
}

type Ymd = { y: number; m: number; d: number };

export function utcYmd(now: Date = new Date()): Ymd {
  return {
    y: now.getUTCFullYear(),
    m: now.getUTCMonth() + 1,
    d: now.getUTCDate(),
  };
}

function iso(part: Ymd): string {
  return `${part.y}-${String(part.m).padStart(2, "0")}-${String(part.d).padStart(2, "0")}`;
}

function addDays(part: Ymd, days: number): Ymd {
  const date = new Date(Date.UTC(part.y, part.m - 1, part.d));
  date.setUTCDate(date.getUTCDate() + days);
  return utcYmd(date);
}

function compareYmd(a: Ymd, b: Ymd): number {
  return a.y - b.y || a.m - b.m || a.d - b.d;
}

/** dfs_pull2.py `window(y)`: Jan 1 of the previous year through min(Nov 25, yesterday). */
export function dfsPull2Window(year: number, today: Ymd): [string, string] {
  const start = { y: year - 1, m: 1, d: 1 };
  const nov25 = { y: year, m: 11, d: 25 };
  const yesterday = addDays(today, -1);
  const end = compareYmd(nov25, yesterday) <= 0 ? nov25 : yesterday;
  return [iso(start), iso(end)];
}

export function isDfsPull2Source(source: string): boolean {
  const prepared = preparePythonSource(source);
  return /\bSEASONS\s*=\s*\{/.test(prepared) && prepared.includes("google_trends");
}

export function buildDfsPull2Plan(
  source: string,
  sourceName = "dfs_pull2.py",
  now: Date = new Date(),
): DfsPull2Plan {
  if (!isDfsPull2Source(source)) {
    throw new Error("This file is not dfs_pull2.py. It needs SEASONS and Google Trends requests.");
  }
  const seasonsBlock = pythonBracketAssignment(source, "SEASONS");
  if (!seasonsBlock) {
    throw new Error("dfs_pull2.py is missing SEASONS.");
  }
  const seasons = new Map<number, string[]>();
  for (const row of pythonYearLists(seasonsBlock)) {
    seasons.set(row.year, row.keywords);
  }
  const anchor = pythonStringAssignment(source, "ANCHOR") ?? "taylor swift";
  const pairsBlock = pythonBracketAssignment(source, "ACCENT_PAIRS");
  const pairStrings = pairsBlock ? pythonStrings(pairsBlock) : [];
  if (pairStrings.length % 2 !== 0) {
    throw new Error("ACCENT_PAIRS must be a list of string pairs.");
  }
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < pairStrings.length; i += 2) {
    const left = pairStrings[i];
    const right = pairStrings[i + 1];
    if (!left || !right) continue;
    pairs.push([left, right]);
  }
  const pairYear = pythonStringIntDict(source, "PAIR_YEAR") ?? {};
  const today = utcYmd(now);
  const jobs: DfsPull2Job[] = [];

  const years = [...seasons.keys()].sort((a, b) => a - b);
  for (const year of years) {
    const names = seasons.get(year) ?? [];
    const [from, to] = dfsPull2Window(year, today);
    for (const [geoTag, loc] of [
      ["ww", null],
      ["br", 2076],
      ["us", 2840],
    ] as const) {
      for (let i = 0; i < names.length; i += 4) {
        const batch = [anchor, ...names.slice(i, i + 4)];
        const tag = `graph_${year}_${geoTag}_${i}`;
        const payload: z.infer<typeof TrendsPayloadSchema> = {
          keywords: batch,
          date_from: from,
          date_to: to,
          type: "web",
          item_types: ["google_trends_graph"],
          tag,
        };
        if (loc) payload.location_code = loc;
        jobs.push({
          key: tag,
          path: "keywords_data/google_trends/explore/live",
          payload,
        });
      }
    }
  }

  const season2025 = seasons.get(2025);
  const season2026 = seasons.get(2026);
  if (!season2025 || !season2026) {
    throw new Error("dfs_pull2.py SEASONS must include 2025 and 2026.");
  }
  const mapNames = [
    ...season2025.slice(0, 10),
    ...season2026.filter((name) => name !== "donald trump" && name !== "elon musk"),
  ];
  for (const name of mapNames) {
    const year = season2025.includes(name) ? 2025 : 2026;
    const tag = `map_${year}_${name}`;
    const [, to] = dfsPull2Window(year, today);
    jobs.push({
      key: tag,
      path: "keywords_data/google_trends/explore/live",
      payload: {
        keywords: [name],
        date_from: iso({ y: year, m: 1, d: 1 }),
        date_to: to,
        item_types: ["google_trends_map"],
        tag,
      },
    });
  }

  for (const [left, right] of pairs) {
    const year = pairYear[left];
    if (year == null) {
      throw new Error(`PAIR_YEAR is missing ${left}.`);
    }
    const [, to] = dfsPull2Window(year, today);
    const from = iso({ y: year, m: 1, d: 1 });
    for (const [geoTag, loc] of [
      ["ww", null],
      ["br", 2076],
    ] as const) {
      const tag = `pair_${geoTag}_${left}`;
      const payload: z.infer<typeof TrendsPayloadSchema> = {
        keywords: [left, right],
        date_from: from,
        date_to: to,
        item_types: ["google_trends_graph"],
        tag,
      };
      if (loc) payload.location_code = loc;
      jobs.push({
        key: tag,
        path: "keywords_data/google_trends/explore/live",
        payload,
      });
    }
    for (const keyword of [left, right]) {
      const tag = `topics_${keyword}`;
      jobs.push({
        key: tag,
        path: "keywords_data/google_trends/explore/live",
        payload: {
          keywords: [keyword],
          date_from: from,
          date_to: to,
          item_types: ["google_trends_topics_list"],
          tag,
        },
      });
    }
  }

  for (const [left, right] of pairs) {
    for (const keyword of [left, right]) {
      for (const [geoTag, loc, lang] of [
        ["br", 2076, "pt"],
        ["us", 2840, "en"],
      ] as const) {
        const serpTag = `serp_${geoTag}_${keyword}`;
        jobs.push({
          key: serpTag,
          path: "serp/google/organic/live/advanced",
          payload: {
            keyword,
            location_code: loc,
            language_code: lang,
            device: "desktop",
            depth: 10,
            tag: serpTag,
          },
        });
        const acTag = `ac_${geoTag}_${keyword}`;
        jobs.push({
          key: acTag,
          path: "serp/google/autocomplete/live/advanced",
          payload: {
            keyword,
            location_code: loc,
            language_code: lang,
            client: "gws-wiz-serp",
            tag: acTag,
          },
        });
      }
    }
  }

  const parsed = z.array(DfsPull2JobSchema).safeParse(jobs);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(
      `dfs_pull2.py produced a request the site cannot send${issue ? `: ${issue.message}` : ""}.`,
    );
  }

  return {
    sourceName,
    anchor,
    today: iso(today),
    jobs: parsed.data,
    endpoints: endpointCounts(parsed.data),
    resultsFile: "dfs_results2.json",
  };
}

export function trendsResultsFile(
  jobs: readonly { key: string }[],
  sourceName = "",
): string {
  if (
    /dfs_pull3/i.test(sourceName) ||
    jobs.some((job) => job.key.startsWith("gl_") || job.key.startsWith("h2h_"))
  ) {
    return "dfs_results3.json";
  }
  return "dfs_results2.json";
}

export function endpointCounts(jobs: readonly { path: string }[]): DfsPull2EndpointCount[] {
  const counts = new Map<string, number>();
  for (const job of jobs) counts.set(job.path, (counts.get(job.path) ?? 0) + 1);
  return [...counts.entries()].map(([path, count]) => ({ path, count }));
}

export function trendsResponseSucceeded(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  return (raw as { status_code?: unknown }).status_code === 20000;
}

export function trendsSpent(responses: Record<string, unknown>): number {
  let spent = 0;
  for (const raw of Object.values(responses)) {
    if (!raw || typeof raw !== "object") continue;
    const cost = (raw as { cost?: unknown }).cost;
    if (typeof cost === "number" && !Number.isNaN(cost)) spent += cost;
  }
  return spent;
}

export type TrendsJobState = { settled?: boolean };

/**
 * Next request in script order. Skips tasks already saved with status 20000,
 * tasks attempted earlier in this run, and tasks settled by a previous pass.
 * Stops when the cost cap is already reached, matching dfs_pull2.py.
 */
export function nextTrendsJob(
  jobs: readonly DfsPull2Job[],
  responses: Record<string, unknown>,
  meta: Record<string, TrendsJobState>,
  attempted: ReadonlySet<string>,
  spent: number,
  maxCost: number,
): DfsPull2Job | null {
  if (spent >= maxCost) return null;
  for (const job of jobs) {
    if (attempted.has(job.key)) continue;
    if (trendsResponseSucceeded(responses[job.key])) continue;
    if (meta[job.key]?.settled) continue;
    return job;
  }
  return null;
}

export function trendsRunStatus(
  jobs: readonly DfsPull2Job[],
  responses: Record<string, unknown>,
  meta: Record<string, TrendsJobState>,
  spent: number,
  maxCost: number,
): "running" | "done" | "capped" {
  const pending = jobs.some(
    (job) =>
      !trendsResponseSucceeded(responses[job.key]) && !meta[job.key]?.settled,
  );
  if (!pending) return "done";
  if (spent >= maxCost) return "capped";
  return "running";
}

export function trendsResponseInfo(raw: unknown): {
  statusCode: number | null;
  cost: number;
  message: string;
} {
  if (!raw || typeof raw !== "object") {
    return { statusCode: null, cost: 0, message: "" };
  }
  const record = raw as {
    status_code?: unknown;
    status_message?: unknown;
    cost?: unknown;
    tasks?: unknown;
  };
  const task = Array.isArray(record.tasks) ? record.tasks[0] : undefined;
  const taskRecord =
    task && typeof task === "object"
      ? (task as { status_code?: unknown; status_message?: unknown })
      : undefined;
  const statusCode =
    typeof taskRecord?.status_code === "number"
      ? taskRecord.status_code
      : typeof record.status_code === "number"
        ? record.status_code
        : null;
  const message =
    typeof taskRecord?.status_message === "string"
      ? taskRecord.status_message
      : typeof record.status_message === "string"
        ? record.status_message
        : "";
  const cost = typeof record.cost === "number" && !Number.isNaN(record.cost) ? record.cost : 0;
  return { statusCode, cost, message: message.slice(0, 300) };
}
