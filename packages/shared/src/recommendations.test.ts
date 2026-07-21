import { describe, expect, it } from "vitest";
import {
  CURATED_NICHES,
  buildRecommendations,
  isSeedablePhrase,
  rankFollowOnKeywords,
  searchSeedKeywords,
  seedOpportunityScore,
} from "./recommendations";

describe("recommendations", () => {
  it("ships a curated niche catalog beyond software-only seeds", () => {
    expect(CURATED_NICHES.length).toBeGreaterThanOrEqual(8);
    const seeds = CURATED_NICHES.map((n) => n.seed.toLowerCase()).join(" ");
    expect(seeds.includes("software")).toBe(false);
    for (const n of CURATED_NICHES) {
      expect(n.seed.length).toBeGreaterThan(3);
      expect(n.keywords.length).toBeGreaterThan(0);
    }
  });

  it("scores high volume + low competition above high volume crowded terms", () => {
    const lowComp = seedOpportunityScore(2000, 0.2);
    const highComp = seedOpportunityScore(5000, 0.9);
    expect(lowComp).toBeGreaterThan(highComp);
  });

  it("marks already-run niches and filters duplicate keywords", () => {
    const result = buildRecommendations({
      existingSeeds: ["HOA management", "running shoes"],
      followOnCandidates: [
        {
          term: "HOA fees explained",
          nicheId: "n1",
          nicheSeed: "HOA management",
          volume: 1200,
          competition: 0.3,
        },
        {
          term: "x",
          nicheId: "n1",
          nicheSeed: "HOA management",
          volume: 9999,
          competition: 0.1,
        },
      ],
    });

    const hoa = result.niches.find((n) => n.id === "hoa-management");
    expect(hoa?.alreadyRun).toBe(true);
    expect(
      result.keywords.some(
        (k) => k.term.toLowerCase() === "hoa fees explained",
      ),
    ).toBe(true);
    expect(result.keywords.every((k) => isSeedablePhrase(k.term))).toBe(true);
  });

  it("ranks follow-ons by volume and low competition", () => {
    const ranked = rankFollowOnKeywords(
      [
        {
          term: "trail running shoes",
          nicheId: "a",
          nicheSeed: "running shoes",
          volume: 500,
          competition: 0.8,
        },
        {
          term: "running shoes",
          nicheId: "a",
          nicheSeed: "running shoes",
          volume: 9000,
          competition: 0.2,
        },
        {
          term: "best running shoes",
          nicheId: "a",
          nicheSeed: "running shoes",
          volume: 800,
          competition: 0.25,
        },
        {
          term: "crowded shoe deals",
          nicheId: "a",
          nicheSeed: "running shoes",
          volume: 4000,
          competition: 0.92,
        },
      ],
      [],
      5,
    );
    expect(ranked[0]?.term).toBe("best running shoes");
    expect(ranked.some((k) => k.term.toLowerCase() === "running shoes")).toBe(
      false,
    );
    expect(
      ranked.some((k) => k.term.toLowerCase() === "crowded shoe deals"),
    ).toBe(false);
    expect(ranked[0]?.competition).toBe(0.25);
    expect(ranked[0]?.reason?.toLowerCase()).toContain("competition");
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
        {
          term: "tiny widget tip",
          nicheId: "a",
          nicheSeed: "widgets",
          volume: 80,
          competition: 0.1,
        },
      ],
      ["widgets"],
      { minVolume: 500, maxCompetition: 0.45, limit: 10 },
    );
    expect(hits).toHaveLength(1);
    expect(hits[0]?.term).toBe("low competition widgets");
  });
});
