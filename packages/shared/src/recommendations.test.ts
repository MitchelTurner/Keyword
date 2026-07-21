import { describe, expect, it } from "vitest";
import {
  CURATED_NICHES,
  buildRecommendations,
  isSeedablePhrase,
  rankFollowOnKeywords,
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

  it("marks already-run niches and filters duplicate keywords", () => {
    const result = buildRecommendations({
      existingSeeds: ["HOA management", "running shoes"],
      followOnCandidates: [
        {
          term: "HOA fees explained",
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
        (k) => k.term.toLowerCase() === "hoa fees explained",
      ),
    ).toBe(true);
    expect(result.keywords.every((k) => isSeedablePhrase(k.term))).toBe(true);
  });

  it("ranks follow-ons by volume and drops seed clones", () => {
    const ranked = rankFollowOnKeywords(
      [
        {
          term: "trail running shoes",
          nicheId: "a",
          nicheSeed: "running shoes",
          volume: 500,
        },
        {
          term: "running shoes",
          nicheId: "a",
          nicheSeed: "running shoes",
          volume: 9000,
        },
        {
          term: "best running shoes",
          nicheId: "a",
          nicheSeed: "running shoes",
          volume: 800,
        },
      ],
      [],
      5,
    );
    expect(ranked[0]?.term).toBe("best running shoes");
    expect(ranked.some((k) => k.term.toLowerCase() === "running shoes")).toBe(
      false,
    );
  });
});
