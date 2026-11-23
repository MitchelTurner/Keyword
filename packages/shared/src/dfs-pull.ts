import { z } from "zod";

/**
 * Keyword lists and date window from dfs_pull.py.
 * The browser parses the script and sends only keywords — never the file.
 */

export const DFS_MARKET_IDS = [
  "ads_worldwide",
  "labs_us",
  "labs_br",
  "labs_gb",
] as const;

export const DfsMarketIdSchema = z.enum(DFS_MARKET_IDS);
export type DfsMarketId = z.infer<typeof DfsMarketIdSchema>;

export const DFS_MARKETS: readonly {
  id: DfsMarketId;
  label: string;
  detail: string;
  kind: "ads" | "labs";
  locationCode?: number;
  languageCode?: string;
}[] = [
  {
    id: "ads_worldwide",
    label: "Worldwide",
    detail: "Google Ads, no location, last 4 years",
    kind: "ads",
  },
  {
    id: "labs_us",
    label: "United States",
    detail: "Labs history · English",
    kind: "labs",
    locationCode: 2840,
    languageCode: "en",
  },
  {
    id: "labs_br",
    label: "Brazil",
    detail: "Labs history · Portuguese",
    kind: "labs",
    locationCode: 2076,
    languageCode: "pt",
  },
  {
    id: "labs_gb",
    label: "United Kingdom",
    detail: "Labs history · English",
    kind: "labs",
    locationCode: 2826,
    languageCode: "en",
  },
];

export const DfsVolumePointSchema = z.object({
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  searchVolume: z.number().nullable(),
});
export type DfsVolumePoint = z.infer<typeof DfsVolumePointSchema>;

export const DfsMarketSeriesSchema = z.object({
  searchVolume: z.number().nullable(),
  cpc: z.number().nullable(),
  monthly: z.array(DfsVolumePointSchema),
});
export type DfsMarketSeries = z.infer<typeof DfsMarketSeriesSchema>;

export const DfsPullRowSchema = z.object({
  keyword: z.string(),
  labels: z.array(z.string()),
  markets: z.object({
    ads_worldwide: DfsMarketSeriesSchema.optional(),
    labs_us: DfsMarketSeriesSchema.optional(),
    labs_br: DfsMarketSeriesSchema.optional(),
    labs_gb: DfsMarketSeriesSchema.optional(),
  }),
});
export type DfsPullRow = z.infer<typeof DfsPullRowSchema>;

export const DfsKeywordGroupSchema = z.object({
  keyword: z.string().trim().min(1).max(80),
  labels: z.array(z.string().trim().min(1).max(40)).max(12),
});
export type DfsKeywordGroup = z.infer<typeof DfsKeywordGroupSchema>;

export const CreateDfsPullSchema = z.object({
  sourceName: z.string().trim().min(1).max(120).optional(),
  keywords: z.array(z.string().trim().min(1).max(80)).min(1).max(700),
  groups: z.array(DfsKeywordGroupSchema).max(700).optional(),
  markets: z.array(DfsMarketIdSchema).min(1).optional(),
});
export type CreateDfsPullDto = z.infer<typeof CreateDfsPullSchema>;

export const DfsPullSummarySchema = z.object({
  id: z.string(),
  sourceName: z.string(),
  pulledAt: z.string(),
  cost: z.number(),
  keywordCount: z.number().int(),
  markets: z.array(DfsMarketIdSchema),
  warnings: z.array(z.string()),
  kind: z.enum(["volume", "trends"]).default("volume"),
  status: z.enum(["running", "done", "capped"]).default("done"),
  jobDone: z.number().int().default(0),
  jobTotal: z.number().int().default(0),
  maxCost: z.number().nullable().default(null),
});
export type DfsPullSummary = z.infer<typeof DfsPullSummarySchema>;

export const DfsPullResultSchema = DfsPullSummarySchema.extend({
  kind: z.literal("volume").default("volume"),
  rows: z.array(DfsPullRowSchema),
});
export type DfsPullResult = z.infer<typeof DfsPullResultSchema>;

export type DfsParsedScript = {
  sourceName: string;
  keywords: string[];
  groups: DfsKeywordGroup[];
};

const LABEL_RANK: Record<string, number> = {
  control: 10000,
  candidate: 10001,
  variant: 10002,
  keyword: 10003,
  custom: 10004,
};

export function labelRank(label: string): number {
  if (/^\d{4}$/.test(label)) return Number(label);
  return LABEL_RANK[label] ?? 20000;
}

export function sortLabels(labels: readonly string[]): string[] {
  return [...labels].sort(
    (a, b) => labelRank(a) - labelRank(b) || a.localeCompare(b),
  );
}

export function sectionTitle(label: string): string {
  if (/^\d{4}$/.test(label)) return label;
  switch (label) {
    case "control":
      return "Controls";
    case "candidate":
      return "2026 candidates";
    case "variant":
      return "Spelling variants";
    case "keyword":
      return "Keywords";
    case "custom":
      return "Added";
    default:
      return label;
  }
}

/**
 * Google Ads date window from dfs_pull.py:
 * date_from = (today minus 4 years) + 1 day, date_to = last day of the previous month.
 * Uses UTC, which is the server clock.
 */
export function dfsAdsDateRange(now: Date = new Date()): {
  dateFrom: string;
  dateTo: string;
} {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const day = now.getUTCDate();
  const shifted = utcDate(year - 4, month, day);
  const fourYearsAgo = new Date(shifted.getTime() + 86_400_000);
  const monthStart = utcDate(year, month, 1);
  const lastMonthEnd = new Date(monthStart.getTime() - 86_400_000);
  return {
    dateFrom: fourYearsAgo.toISOString().slice(0, 10),
    dateTo: lastMonthEnd.toISOString().slice(0, 10),
  };
}

function utcDate(year: number, monthIndex: number, day: number): Date {
  const dim = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, monthIndex, Math.min(day, dim)));
}

export function foldKeyword(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

export function toMonthly(
  points:
    | Array<{
        year?: number;
        month?: number;
        search_volume?: number | null;
      }>
    | null
    | undefined,
): DfsVolumePoint[] {
  if (!points?.length) return [];
  const out: DfsVolumePoint[] = [];
  for (const point of points) {
    const year = point.year;
    const month = point.month;
    if (typeof year !== "number" || typeof month !== "number") continue;
    if (month < 1 || month > 12) continue;
    const volume = point.search_volume;
    out.push({
      year,
      month,
      searchVolume:
        typeof volume === "number" && !Number.isNaN(volume) ? volume : null,
    });
  }
  out.sort((a, b) => a.year - b.year || a.month - b.month);
  return out;
}

export function seriesFromVolumeFields(input: {
  searchVolume?: number | null;
  cpc?: number | null;
  monthly?: Array<{
    year?: number;
    month?: number;
    search_volume?: number | null;
  }> | null;
}): DfsMarketSeries {
  const monthly = toMonthly(input.monthly);
  const cpc =
    typeof input.cpc === "number" && !Number.isNaN(input.cpc) ? input.cpc : null;
  let searchVolume: number | null = null;
  if (typeof input.searchVolume === "number" && !Number.isNaN(input.searchVolume)) {
    searchVolume = input.searchVolume;
  } else {
    for (let i = monthly.length - 1; i >= 0; i -= 1) {
      const value = monthly[i]?.searchVolume;
      if (value != null) {
        searchVolume = value;
        break;
      }
    }
  }
  return { searchVolume, cpc, monthly };
}

export function takeSeriesForKeyword<T>(
  requested: string,
  byLower: ReadonlyMap<string, T>,
  byFold: ReadonlyMap<string, T>,
): T | undefined {
  return (
    byLower.get(requested.toLowerCase()) ?? byFold.get(foldKeyword(requested))
  );
}

export function parsePlainKeywordList(raw: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(/[\n,]+/)) {
    const term = part.trim().replace(/\s+/g, " ");
    if (!term || term.length > 80 || term.startsWith("#")) continue;
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(term);
  }
  return out;
}

export function parseDfsPullSource(
  source: string,
  sourceName = "dfs_pull.py",
): DfsParsedScript {
  const withoutDocs = source.replace(/"""[\s\S]*?"""|'''[\s\S]*?'''/g, "");
  const cleaned = stripPythonComments(withoutDocs);
  const rows = new Map<string, { keyword: string; labels: string[] }>();

  const add = (keyword: string, label: string) => {
    const term = keyword.trim().replace(/\s+/g, " ");
    if (!term || term.length > 80) return;
    const key = term.toLowerCase();
    const existing = rows.get(key);
    if (!existing) {
      rows.set(key, { keyword: term, labels: [label] });
      return;
    }
    if (!existing.labels.includes(label)) existing.labels.push(label);
  };

  const past = findAssignment(cleaned, "PAST");
  if (past) {
    for (const yearList of parseYearLists(past)) {
      for (const keyword of yearList.keywords) {
        add(keyword, String(yearList.year));
      }
    }
  }
  const named: Array<[string, string]> = [
    ["CONTROLS", "control"],
    ["CANDIDATES", "candidate"],
    ["VARIANTS", "variant"],
  ];
  for (const [name, label] of named) {
    const block = findAssignment(cleaned, name);
    if (!block) continue;
    for (const keyword of extractStrings(block)) add(keyword, label);
  }

  if (rows.size === 0) {
    const keywords = findAssignment(cleaned, "KEYWORDS");
    if (keywords) {
      for (const keyword of extractStrings(keywords)) add(keyword, "keyword");
    }
  }

  if (rows.size === 0) {
    const trimmed = source.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      throw new Error(
        "That looks like JSON. Enter dfs_pull.py, or paste one keyword per line.",
      );
    }
    if (looksLikePython(cleaned)) {
      throw new Error(
        "This looks like Python, but no keyword lists were found. Expected PAST, CONTROLS, CANDIDATES, VARIANTS, or KEYWORDS = [].",
      );
    }
    for (const keyword of parsePlainKeywordList(source)) add(keyword, "custom");
  }

  if (rows.size === 0) {
    throw new Error("No keywords found. Enter dfs_pull.py or a keyword list.");
  }

  const groups = [...rows.values()]
    .map((row) => ({ keyword: row.keyword, labels: sortLabels(row.labels) }))
    .sort((a, b) => a.keyword.localeCompare(b.keyword));

  return {
    sourceName,
    keywords: groups.map((row) => row.keyword),
    groups,
  };
}

function looksLikePython(source: string): boolean {
  return /\b(?:import|def|class)\b/.test(source) || /^\s*[A-Za-z_]+\s*=/m.test(source);
}

function stripPythonComments(source: string): string {
  let out = "";
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < source.length; i += 1) {
    const c = source.charAt(i);
    if (quote) {
      out += c;
      if (c === "\\") {
        const next = source.charAt(i + 1);
        if (next) {
          out += next;
          i += 1;
        }
        continue;
      }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      out += c;
      continue;
    }
    if (c === "#") {
      while (i + 1 < source.length && source.charAt(i + 1) !== "\n") i += 1;
      continue;
    }
    out += c;
  }
  return out;
}

function sliceBalanced(source: string, start: number): string | null {
  const open = source.charAt(start);
  if (open !== "{" && open !== "[") return null;
  let depth = 0;
  let quote: '"' | "'" | null = null;
  for (let j = start; j < source.length; j += 1) {
    const c = source.charAt(j);
    if (quote) {
      if (c === "\\") {
        j += 1;
        continue;
      }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c === "{" || c === "[") depth += 1;
    else if (c === "}" || c === "]") {
      depth -= 1;
      if (depth === 0) return source.slice(start, j + 1);
    }
  }
  return null;
}

function findAssignment(source: string, name: string): string | null {
  const re = new RegExp(`\\b${name}\\s*=\\s*`, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    let i = match.index + match[0].length;
    while (i < source.length && /\s/.test(source.charAt(i))) i += 1;
    const sliced = sliceBalanced(source, i);
    if (sliced) return sliced;
  }
  return null;
}

function parseYearLists(
  block: string,
): Array<{ year: number; keywords: string[] }> {
  const out: Array<{ year: number; keywords: string[] }> = [];
  const re = /(?:^|[^0-9])(\d{4})\s*:/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(block)) !== null) {
    const yearToken = match[1];
    if (!yearToken) continue;
    let i = match.index + match[0].length;
    while (i < block.length && /\s/.test(block.charAt(i))) i += 1;
    if (block.charAt(i) !== "[") continue;
    const list = sliceBalanced(block, i);
    if (!list) continue;
    out.push({ year: Number(yearToken), keywords: extractStrings(list) });
    re.lastIndex = i + list.length;
  }
  return out;
}

function extractStrings(block: string): string[] {
  const strings: string[] = [];
  const re = /"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(block)) !== null) {
    const raw = match[1] ?? match[2];
    if (raw == null) continue;
    strings.push(unescapePy(raw));
  }
  return strings;
}

export function preparePythonSource(source: string): string {
  return stripPythonComments(source.replace(/"""[\s\S]*?"""|'''[\s\S]*?'''/g, ""));
}

export function pythonBracketAssignment(
  source: string,
  name: string,
): string | null {
  return findAssignment(preparePythonSource(source), name);
}

export function pythonStrings(block: string): string[] {
  return extractStrings(block);
}

export function pythonYearLists(
  block: string,
): Array<{ year: number; keywords: string[] }> {
  return parseYearLists(block);
}

export function pythonStringAssignment(
  source: string,
  name: string,
): string | null {
  const prepared = preparePythonSource(source);
  const re = new RegExp(
    `\\b${name}\\s*=\\s*("(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*')`,
  );
  const match = re.exec(prepared);
  const literal = match?.[1];
  if (!literal) return null;
  return extractStrings(literal)[0] ?? null;
}

export function pythonStringIntDict(
  source: string,
  name: string,
): Record<string, number> | null {
  const block = pythonBracketAssignment(source, name);
  if (!block?.startsWith("{")) return null;
  const out: Record<string, number> = {};
  const re = /"((?:\\.|[^"\\])*)"\s*:\s*(\d+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(block)) !== null) {
    const raw = match[1];
    if (raw == null) continue;
    const key = extractStrings(`"${raw}"`)[0];
    if (!key) continue;
    out[key] = Number(match[2]);
  }
  return out;
}

function unescapePy(raw: string): string {
  return raw.replace(/\\(?:n|t|r|"|'|\\)/g, (seq) => {
    switch (seq) {
      case "\\n":
        return "\n";
      case "\\t":
        return "\t";
      case "\\r":
        return "\r";
      case '\\"':
        return '"';
      case "\\'":
        return "'";
      case "\\\\":
        return "\\";
      default:
        return seq;
    }
  });
}
