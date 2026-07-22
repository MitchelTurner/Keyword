import { describe, expect, it } from "vitest";
import {
  CURATED_NICHES,
  TOPIC_PROBES,
  buildRecommendations,
  diversifyApiSeedRecommendations,
  isSeedablePhrase,
  phrasesTooSimilar,
  searchSeedKeywords,
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

  it("never recommends crowded probe head terms like wedding photography", () => {
    const picks = diversifyApiSeedRecommendations(
      [
        {
          term: "wedding photography",
          category: "Events",
          probe: "wedding photography",
          volume: 12000,
          competition: 0.2,
        },
        {
          term: "elopement photo packages",
          category: "Events",
          probe: "wedding photography",
          volume: 900,
          competition: 0.18,
        },
      ],
      [],
      10,
    );
    expect(
      picks.some((p) => p.term.toLowerCase() === "wedding photography"),
    ).toBe(false);
    expect(picks.map((p) => p.term)).toContain("elopement photo packages");
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

  it("drops bucketed 0.33 competition placeholders", () => {
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
    expect(picks).toHaveLength(0);
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
