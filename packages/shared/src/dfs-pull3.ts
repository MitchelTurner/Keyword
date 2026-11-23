import { z } from "zod";
import { preparePythonSource, pythonBracketAssignment, pythonStringAssignment, pythonStrings, pythonYearLists } from "./dfs-pull";
import {
  DfsPull2JobSchema,
  buildDfsPull2Plan,
  dfsPull2Window,
  endpointCounts,
  utcYmd,
  type DfsPull2Job,
  type DfsPull2Plan,
} from "./dfs-pull2";

export function isDfsPull3Source(source: string): boolean {
  const prepared = preparePythonSource(source);
  return (
    /\bGLOBAL\s*=\s*\{/.test(prepared) &&
    /\bUS\s*=\s*\{/.test(prepared) &&
    /\bH2H\s*=\s*\[/.test(prepared) &&
    prepared.includes("google_trends")
  );
}

/** Pick dfs_pull3.py or dfs_pull2.py from the pasted source. */
export function buildTrendsPlan(
  source: string,
  sourceName?: string,
  now: Date = new Date(),
): DfsPull2Plan {
  if (isDfsPull3Source(source)) {
    return buildDfsPull3Plan(source, sourceName?.trim() || "dfs_pull3.py", now);
  }
  return buildDfsPull2Plan(source, sourceName?.trim() || "dfs_pull2.py", now);
}

export function buildDfsPull3Plan(
  source: string,
  sourceName = "dfs_pull3.py",
  now: Date = new Date(),
): DfsPull2Plan {
  if (!isDfsPull3Source(source)) {
    throw new Error("This file is not dfs_pull3.py. It needs GLOBAL, US, and H2H.");
  }
  const globalBlock = pythonBracketAssignment(source, "GLOBAL");
  const usBlock = pythonBracketAssignment(source, "US");
  const h2hBlock = pythonBracketAssignment(source, "H2H");
  if (!globalBlock || !usBlock || !h2hBlock) {
    throw new Error("dfs_pull3.py is missing GLOBAL, US, or H2H.");
  }
  const anchor = pythonStringAssignment(source, "ANCHOR") ?? "taylor swift";
  const today = utcYmd(now);
  const jobs: DfsPull2Job[] = [];

  const addBatches = (prefix: string, year: number, names: string[], loc: number | null) => {
    const [from, to] = dfsPull2Window(year, today);
    for (let i = 0; i < names.length; i += 4) {
      const tag = `${prefix}_${year}_${i}`;
      const payload: DfsPull2Job["payload"] = {
        keywords: [anchor, ...names.slice(i, i + 4)],
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
  };

  for (const row of pythonYearLists(globalBlock)) addBatches("gl", row.year, row.keywords, null);
  for (const row of pythonYearLists(usBlock)) addBatches("us", row.year, row.keywords, 2840);

  const [from2026, to2026] = dfsPull2Window(2026, today);
  nestedStringLists(h2hBlock).forEach((batch, index) => {
    for (const [geo, loc] of [
      ["ww", null],
      ["us", 2840],
    ] as const) {
      const tag = `h2h_${geo}_${index}`;
      const payload: DfsPull2Job["payload"] = {
        keywords: [anchor, ...batch],
        date_from: from2026,
        date_to: to2026,
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
  });

  const parsed = z.array(DfsPull2JobSchema).safeParse(jobs);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(
      `dfs_pull3.py produced a request the site cannot send${issue ? `: ${issue.message}` : ""}.`,
    );
  }

  return {
    sourceName,
    anchor,
    today: isoToday(today),
    jobs: parsed.data,
    endpoints: endpointCounts(parsed.data),
    resultsFile: "dfs_results3.json",
  };
}

function isoToday(part: { y: number; m: number; d: number }): string {
  return `${part.y}-${String(part.m).padStart(2, "0")}-${String(part.d).padStart(2, "0")}`;
}

function nestedStringLists(block: string): string[][] {
  const lists: string[][] = [];
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < block.length; i += 1) {
    const c = block.charAt(i);
    if (quote) {
      if (c === "\\") i += 1;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c !== "[") continue;
    if (lists.length === 0 && i === 0) continue;
    const inner = sliceBracket(block, i);
    if (!inner) continue;
    lists.push(pythonStrings(inner));
    i += inner.length - 1;
  }
  return lists;
}

function sliceBracket(source: string, start: number): string | null {
  if (source.charAt(start) !== "[") return null;
  let depth = 0;
  let quote: '"' | "'" | null = null;
  for (let j = start; j < source.length; j += 1) {
    const c = source.charAt(j);
    if (quote) {
      if (c === "\\") j += 1;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c === "[") depth += 1;
    else if (c === "]") {
      depth -= 1;
      if (depth === 0) return source.slice(start, j + 1);
    }
  }
  return null;
}
