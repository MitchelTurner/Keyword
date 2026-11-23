import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CreateDfsPullSchema,
  dfsAdsDateRange,
  parseDfsPullSource,
  seriesFromVolumeFields,
  takeSeriesForKeyword,
  foldKeyword,
} from "./dfs-pull";

const scriptPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../apps/web/public/dfs_pull.py",
);

describe("parseDfsPullSource", () => {
  const source = readFileSync(scriptPath, "utf8");
  const parsed = parseDfsPullSource(source, "dfs_pull.py");

  it("reads the keyword set from dfs_pull.py", () => {
    expect(parsed.keywords).toHaveLength(88);
    expect(new Set(parsed.keywords.map((k) => k.toLowerCase())).size).toBe(88);
    expect(parsed.keywords).toEqual(
      [...parsed.keywords].sort((a, b) => a.localeCompare(b)),
    );
  });

  it("keeps year, control, candidate, and variant labels", () => {
    const labels = (keyword: string) =>
      parsed.groups.find((g) => g.keyword === keyword)?.labels;

    expect(labels("alec baldwin")).toEqual(["2021"]);
    expect(labels("andrew tate")).toEqual(["2022", "2023"]);
    expect(labels("joe biden")).toEqual(["2021", "2024"]);
    expect(labels("simone biles")).toEqual(["2021", "2024"]);
    expect(labels("lamine yamal")).toEqual(["2024", "candidate"]);
    expect(labels("elon musk")).toEqual(["control"]);
    expect(labels("lindsay clancy")).toEqual(["candidate"]);
    expect(labels("mbappe")).toEqual(["2023"]);
    expect(labels("mbappé")).toEqual(["variant"]);
    expect(labels("flávio bolsonaro")).toEqual(["variant"]);
  });

  it("ignores comments, docstrings, and the KEYWORDS expression", () => {
    const parsedMini = parseDfsPullSource(`
"""
PAST = { 1999: ["from docstring"] }
"""
# CONTROLS = ["hidden"]
PAST = {
    2021: ["visible name"],  # "also hidden"
}
CONTROLS = ["control name"]
KEYWORDS = sorted({"should not be read"} | set(CONTROLS))
`);
    expect(parsedMini.keywords).toEqual(["control name", "visible name"]);
    expect(parsedMini.groups.find((g) => g.keyword === "visible name")?.labels).toEqual([
      "2021",
    ]);
  });

  it("reads a KEYWORDS list when the named groups are absent", () => {
    const parsedList = parseDfsPullSource(`KEYWORDS = ["Alpha", "alpha", "beta"]`);
    expect(parsedList.keywords.map((k) => k.toLowerCase()).sort()).toEqual([
      "alpha",
      "beta",
    ]);
    expect(parsedList.groups.every((g) => g.labels.includes("keyword"))).toBe(true);
  });

  it("treats a plain list as custom keywords", () => {
    const parsedList = parseDfsPullSource("running shoes\nbest trail runners, marathon flats");
    expect(parsedList.keywords).toEqual([
      "best trail runners",
      "marathon flats",
      "running shoes",
    ]);
    expect(parsedList.groups.every((g) => g.labels[0] === "custom")).toBe(true);
  });

  it("rejects Python that has no keyword list", () => {
    expect(() => parseDfsPullSource("import os\ndef post():\n    pass\n")).toThrow(
      /no keyword lists/i,
    );
  });

  it("rejects a JSON results file", () => {
    expect(() => parseDfsPullSource('{"keywords":["alec baldwin"]}')).toThrow(
      /JSON/,
    );
  });
});

describe("dfsAdsDateRange", () => {
  it("matches the script window for a mid-month date", () => {
    expect(dfsAdsDateRange(new Date("2026-11-22T12:00:00Z"))).toEqual({
      dateFrom: "2022-11-23",
      dateTo: "2026-10-31",
    });
  });

  it("steps off leap day the way datetime.date.replace does", () => {
    expect(dfsAdsDateRange(new Date("2024-02-29T00:00:00Z"))).toEqual({
      dateFrom: "2020-03-01",
      dateTo: "2024-01-31",
    });
  });
});

describe("series matching", () => {
  it("falls back to the latest monthly volume", () => {
    const series = seriesFromVolumeFields({
      searchVolume: null,
      cpc: 1.5,
      monthly: [
        { year: 2024, month: 1, search_volume: 10 },
        { year: 2024, month: 3, search_volume: 30 },
        { year: 2024, month: 2, search_volume: 20 },
      ],
    });
    expect(series.searchVolume).toBe(30);
    expect(series.monthly.map((p) => p.month)).toEqual([1, 2, 3]);
    expect(series.cpc).toBe(1.5);
  });

  it("matches accent-folded keywords", () => {
    const series = { searchVolume: 5, cpc: null, monthly: [] };
    const byLower = new Map<string, typeof series>();
    const byFold = new Map<string, typeof series>([
      [foldKeyword("flávio bolsonaro"), series],
    ]);
    expect(takeSeriesForKeyword("flavio bolsonaro", byLower, byFold)).toBe(series);
  });
});

describe("CreateDfsPullSchema", () => {
  it("accepts a short pull", () => {
    const parsed = CreateDfsPullSchema.parse({
      sourceName: "dfs_pull.py",
      keywords: ["alec baldwin"],
      groups: [{ keyword: "alec baldwin", labels: ["2021"] }],
      markets: ["ads_worldwide", "labs_br"],
    });
    expect(parsed.markets).toEqual(["ads_worldwide", "labs_br"]);
  });
});
