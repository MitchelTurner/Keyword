import { describe, expect, it } from "vitest";
import { SearchVolumeItemSchema, KeywordIdeaItemSchema } from "@prospector/shared";
import keywordIdeasFixture from "../../test/fixtures/keyword-ideas.json";
import searchVolumeFixture from "../../test/fixtures/search-volume.json";

describe("DataForSEO response parsing", () => {
  it("extracts keywords from keyword_ideas fixture", () => {
    const items = keywordIdeasFixture.tasks[0].result[0].items;
    const terms = items
      .map((item) => KeywordIdeaItemSchema.parse(item).keyword)
      .filter(Boolean);
    expect(terms).toContain("invoice software");
    expect(terms.length).toBeGreaterThan(3);
  });

  it("maps search_volume rows and competition_index", () => {
    const items = searchVolumeFixture.tasks[0].result[0].items;
    const parsed = items.map((item) => SearchVolumeItemSchema.parse(item));

    const withIndex = parsed.find((p) => p.keyword === "free invoice app");
    expect(withIndex?.competition_index).toBe(45);
    expect((withIndex!.competition_index as number) / 100).toBeCloseTo(0.45);

    const nullVol = parsed.find((p) => p.keyword === "obscure niche term xyz");
    expect(nullVol?.search_volume).toBeNull();
  });

  it("rejects tasks that are not success codes at fixture level", () => {
    expect(keywordIdeasFixture.tasks[0].status_code).toBe(20000);
    expect(searchVolumeFixture.tasks[0].status_code).toBe(20000);
  });
});
