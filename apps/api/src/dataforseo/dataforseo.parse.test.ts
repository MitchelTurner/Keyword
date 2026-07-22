import { describe, expect, it } from "vitest";
import {
  SearchVolumeItemSchema,
  KeywordIdeaItemSchema,
  normalizeCompetition,
} from "@prospector/shared";
import keywordIdeasFixture from "../../test/fixtures/keyword-ideas.json";
import searchVolumeFixture from "../../test/fixtures/search-volume.json";
import { extractSearchVolumeItems } from "./dataforseo.service";

describe("DataForSEO response parsing", () => {
  it("extracts keywords from labs fixture items", () => {
    const items = keywordIdeasFixture.tasks[0].result[0].items;
    const terms = items
      .map((item) => KeywordIdeaItemSchema.parse(item).keyword)
      .filter(Boolean);
    expect(terms).toContain("invoice software");
    expect(terms.length).toBeGreaterThan(3);
  });

  it("reads Google Ads search_volume as a flat result array", () => {
    const items = extractSearchVolumeItems(
      searchVolumeFixture.tasks[0].result,
    );
    expect(items.length).toBe(4);
    expect(
      (items[0] as { keyword: string; competition: string }).competition,
    ).toBe("HIGH");
  });

  it("still supports nested result[0].items fixtures", () => {
    const nested = [
      {
        items: [{ keyword: "nested term", search_volume: 10, competition: 0.5 }],
      },
    ];
    const items = extractSearchVolumeItems(nested);
    expect(items).toHaveLength(1);
  });

  it("maps search_volume rows with string competition labels", () => {
    const items = extractSearchVolumeItems(
      searchVolumeFixture.tasks[0].result,
    );
    const parsed = items.map((item) => SearchVolumeItemSchema.parse(item));

    const high = parsed.find((p) => p.keyword === "invoice software");
    // Prefer competition_index (72) over the HIGH label bucket.
    expect(
      normalizeCompetition(high?.competition, high?.competition_index),
    ).toBeCloseTo(0.72);

    const withIndex = parsed.find((p) => p.keyword === "free invoice app");
    expect(withIndex?.competition_index).toBe(45);
    expect(
      normalizeCompetition(withIndex?.competition, withIndex?.competition_index),
    ).toBeCloseTo(0.45);

    const nullVol = parsed.find((p) => p.keyword === "obscure niche term xyz");
    expect(nullVol?.search_volume).toBeNull();
  });

  it("rejects tasks that are not success codes at fixture level", () => {
    expect(keywordIdeasFixture.tasks[0].status_code).toBe(20000);
    expect(searchVolumeFixture.tasks[0].status_code).toBe(20000);
  });
});

describe("normalizeCompetition", () => {
  it("prefers competition_index over LOW/MEDIUM/HIGH labels", () => {
    expect(normalizeCompetition("HIGH")).toBe(1);
    expect(normalizeCompetition("medium")).toBeCloseTo(0.66);
    expect(normalizeCompetition(null, 45)).toBeCloseTo(0.45);
    expect(normalizeCompetition("LOW", 12)).toBeCloseTo(0.12);
    expect(normalizeCompetition(0.72)).toBeCloseTo(0.72);
  });
});
