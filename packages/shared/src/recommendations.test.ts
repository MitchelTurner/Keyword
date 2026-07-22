import { describe, expect, it } from "vitest";
import {
  CURATED_NICHES,
  TOPIC_PROBES,
  buildRecommendations,
  diversifyApiSeedRecommendations,
  isSeedablePhrase,
  phrasesTooSimilar,
  searchSeedKeywords,
  seedLowCpcScore,
  seedOpportunityScore,
} from "./recommendations";

describe("recommendations", () => {
  it("ships curated niches and diverse topic probes", () => {
    expect(CURATED_NICHES.length).toBeGreaterThanOrEqual(8);
    expect(TOPIC_PROBES.length).toBeGreaterThanOrEqual(12);
    const categories = new Set(TOPIC_PROBES.map((p) => p.category));
    expect(categories.size).toBeGreaterThanOrEqual(12);
  });

  it("scores high volume + low competition above high volume crowded terms", () => {
    const lowComp = seedOpportunityScore(2000, 0.2);
    const highComp = seedOpportunityScore(5000, 0.9);
    expect(lowComp).toBeGreaterThan(highComp);
  });

  it("boosts score for higher CPC at equal volume and competition", () => {
    const cheap = seedOpportunityScore(2000, 0.2, 0.5);
    const pricey = seedOpportunityScore(2000, 0.2, 8);
    expect(pricey).toBeGreaterThan(cheap);
  });

  it("low-CPC score prefers pennies over dollar clicks", () => {
    const pennies = seedLowCpcScore(2000, 0.2, 0.08);
    const dollar = seedLowCpcScore(2000, 0.2, 0.95);
    expect(pennies).toBeGreaterThan(dollar);
  });

  it("filters and ranks low-CPC API seeds cheapest first within categories", () => {
    const picks = diversifyApiSeedRecommendations(
      [
        {
          term: "cheap habit tracker free",
          category: "Productivity",
          probe: "habit tracker",
          volume: 1200,
          competition: 0.2,
          cpc: 0.12,
        },
        {
          term: "premium habit coaching app",
          category: "Productivity",
          probe: "habit tracker",
          volume: 1800,
          competition: 0.2,
          cpc: 2.5,
        },
        {
          term: "simple budget spreadsheet template",
          category: "Fintech",
          probe: "budget spreadsheet",
          volume: 900,
          competition: 0.25,
          cpc: 0.05,
        },
      ],
      [],
      10,
      { maxCpc: 1, preferLowCpc: true },
    );
    expect(picks.every((p) => (p.cpc ?? 99) <= 1)).toBe(true);
    expect(picks.map((p) => p.term)).not.toContain("premium habit coaching app");
    expect(picks.length).toBeGreaterThanOrEqual(2);
  });

  it("biases topic probes toward software and tools", () => {
    const seeds = TOPIC_PROBES.map((p) => p.seed.toLowerCase()).join(" ");
    expect(seeds).toMatch(/software|app|tool|calculator|platform|crm|seo/);
    expect(seeds).not.toMatch(/\blawyer\b|\bplumber\b|\bdentist\b|\bdoctor\b/);
  });

  it("diversifies API seeds across categories", () => {
    const picks = diversifyApiSeedRecommendations(
      [
        {
          term: "trail running shoes",
          category: "Fitness",
          probe: "running shoes",
          volume: 2000,
          competition: 0.2,
        },
        {
          term: "marathon racing flats",
          category: "Fitness",
          probe: "running shoes",
          volume: 1800,
          competition: 0.22,
        },
        {
          term: "car accident attorney",
          category: "Legal",
          probe: "personal injury lawyer",
          volume: 1500,
          competition: 0.3,
        },
        {
          term: "truck accident lawyer",
          category: "Legal",
          probe: "personal injury lawyer",
          volume: 900,
          competition: 0.28,
        },
        {
          term: "residential solar cost",
          category: "Energy",
          probe: "solar panels",
          volume: 1100,
          competition: 0.25,
        },
      ],
      [],
      3,
    );

    expect(picks).toHaveLength(3);
    const cats = new Set(picks.map((p) => p.category));
    expect(cats.size).toBe(3);
    expect(picks.every((p) => p.source === "api")).toBe(true);
    expect(picks.every((p) => isSeedablePhrase(p.term))).toBe(true);
  });

  it("never recommends crowded probe head terms like invoice software", () => {
    const picks = diversifyApiSeedRecommendations(
      [
        {
          term: "invoice software",
          category: "SaaS",
          probe: "invoice software",
          volume: 12000,
          competition: 0.2,
        },
        {
          term: "freelance invoice templates",
          category: "SaaS",
          probe: "invoice software",
          volume: 900,
          competition: 0.18,
        },
      ],
      [],
      10,
    );
    expect(
      picks.some((p) => p.term.toLowerCase() === "invoice software"),
    ).toBe(false);
    expect(picks.map((p) => p.term)).toContain("freelance invoice templates");
  });

  it("detects near-duplicate phrases", () => {
    expect(
      phrasesTooSimilar("dog training classes", "puppy dog training classes"),
    ).toBe(true);
    expect(phrasesTooSimilar("dog training", "solar panel cost")).toBe(false);
  });

  it("builds recommendations from API candidates", () => {
    const result = buildRecommendations({
      existingSeeds: ["running shoes"],
      apiCandidates: [
        {
          term: "trail running shoes",
          category: "Fitness",
          probe: "running shoes",
          volume: 2000,
          competition: 0.2,
        },
        {
          term: "car accident attorney",
          category: "Legal",
          probe: "personal injury lawyer",
          volume: 1500,
          competition: 0.3,
        },
      ],
    });
    expect(result.niches).toHaveLength(0);
    expect(result.keywords.length).toBeGreaterThan(0);
    expect(result.keywords.every((k) => k.source === "api")).toBe(true);
  });

  it("does not fall back to curated high-comp head terms", () => {
    const result = buildRecommendations({
      existingSeeds: [],
      apiCandidates: [],
    });
    expect(result.keywords).toHaveLength(0);
    expect(result.niches).toHaveLength(0);
  });

  it("drops missing competition (bucket placeholders normalize to null)", () => {
    const picks = diversifyApiSeedRecommendations(
      [
        {
          term: "niche kayak mount",
          category: "Outdoors",
          probe: "kayak fishing",
          volume: 800,
          competition: null,
        },
      ],
      [],
      10,
    );
    expect(picks).toHaveLength(0);
  });

  it("keeps Ads competition_index 33% — 0.33 is precise, not a bucket drop", () => {
    const picks = diversifyApiSeedRecommendations(
      [
        {
          term: "niche kayak mount",
          category: "Outdoors",
          probe: "kayak fishing",
          volume: 800,
          competition: 0.33,
        },
      ],
      [],
      10,
    );
    expect(picks).toHaveLength(1);
    expect(picks[0]?.competition).toBeCloseTo(0.33);
  });

  it("searches seeds with min volume and max competition filters", () => {
    const hits = searchSeedKeywords(
      [
        {
          term: "low competition widgets",
          nicheId: "a",
          nicheSeed: "widgets",
          volume: 1200,
          competition: 0.2,
        },
        {
          term: "busy widget market",
          nicheId: "a",
          nicheSeed: "widgets",
          volume: 5000,
          competition: 0.7,
        },
      ],
      ["widgets"],
      { minVolume: 500, maxCompetition: 0.45, limit: 10 },
    );
    expect(hits).toHaveLength(1);
    expect(hits[0]?.term).toBe("low competition widgets");
  });
});
