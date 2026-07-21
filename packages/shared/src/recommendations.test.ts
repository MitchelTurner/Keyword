import { describe, expect, it } from "vitest";
import {
  CURATED_NICHES,
  buildRecommendations,
  isSeedablePhrase,
  rankFollowOnKeywords,
} from "./recommendations";

describe("recommendations", () => {
  it("ships a curated niche catalog", () => {
    expect(CURATED_NICHES.length).toBeGreaterThanOrEqual(8);
    for (const n of CURATED_NICHES) {
      expect(n.seed.length).toBeGreaterThan(3);
      expect(n.keywords.length).toBeGreaterThan(0);
    }
  });

  it("marks already-run niches and filters duplicate keywords", () => {
    const result = buildRecommendations({
      existingSeeds: ["HOA management", "dental billing"],
      followOnCandidates: [
        {
          term: "HOA board portal",
          nicheId: "n1",
          nicheSeed: "HOA management",
          volume: 1200,
        },
        {
          term: "x",
          nicheId: "n1",
          nicheSeed: "HOA management",
          volume: 9999,
        },
      ],
    });

    const hoa = result.niches.find((n) => n.id === "hoa-management");
    expect(hoa?.alreadyRun).toBe(true);
    expect(
      result.keywords.some(
        (k) => k.term.toLowerCase() === "hoa board portal",
      ),
    ).toBe(true);
    expect(result.keywords.every((k) => isSeedablePhrase(k.term))).toBe(true);
  });

  it("ranks follow-ons by volume and drops seed clones", () => {
    const ranked = rankFollowOnKeywords(
      [
        {
          term: "carrier onboarding software",
          nicheId: "a",
          nicheSeed: "freight broker software",
          volume: 500,
        },
        {
          term: "freight broker software",
          nicheId: "a",
          nicheSeed: "freight broker software",
          volume: 9000,
        },
        {
          term: "load board automation",
          nicheId: "a",
          nicheSeed: "freight broker software",
          volume: 800,
        },
      ],
      [],
      5,
    );
    expect(ranked[0]?.term).toBe("load board automation");
    expect(
      ranked.some((k) => k.term.toLowerCase() === "freight broker software"),
    ).toBe(false);
  });
});
