import { describe, expect, it } from "vitest";
import {
  buildBrief,
  DEFAULT_RUBRIC,
  evaluateRubric,
  explainDemandScore,
} from "./decision";

describe("explainDemandScore", () => {
  it("factors volume, cpc, competition, and buyer weight", () => {
    const b = explainDemandScore({
      totalVolume: 999,
      avgCpc: 10,
      avgCompetition: 0.5,
      buyerType: "enterprise",
    });
    expect(b.buyerWeight).toBe(1.1);
    expect(b.demandScore).toBeCloseTo(
      Math.log10(1000) * 10 * 1.5 * 1.1,
      2,
    );
    expect(b.drivers.length).toBeGreaterThan(0);
  });
});

describe("evaluateRubric", () => {
  it("passes a strong opportunity on economics and demand", () => {
    const r = evaluateRubric({
      monthlyPriceFloor: 120,
      totalVolume: 2000,
      painSeverity: 4,
      avgCompetition: 0.5,
      trendDirection: "rising",
    });
    expect(r.pass).toBe(true);
    expect(r.score).toBe(1);
    expect(r.checks.some((c) => c.id === "buyer")).toBe(false);
  });

  it("fails weak declining opportunity", () => {
    const r = evaluateRubric(
      {
        monthlyPriceFloor: 9,
        totalVolume: 100,
        painSeverity: 2,
        avgCompetition: 0.9,
        trendDirection: "declining",
      },
      DEFAULT_RUBRIC,
    );
    expect(r.pass).toBe(false);
    expect(r.score).toBeLessThan(0.5);
  });
});

describe("buildBrief", () => {
  it("writes summary, rank context, and next step", () => {
    const brief = buildBrief({
      productDescription: "AP automation",
      buyerType: "enterprise",
      intent: "transactional",
      painSeverity: 5,
      totalVolume: 1600,
      avgCpc: 18,
      avgCompetition: 0.6,
      monthlyPriceFloor: 100,
      demandScore: 40,
      trendDirection: "rising",
      changePct: 22,
      nicheMedianDemand: 20,
      rank: 1,
      nicheOpportunityCount: 5,
    });
    expect(brief.summary).toContain("AP automation");
    expect(brief.whyRanks).toContain("#1");
    expect(brief.nextStep.length).toBeGreaterThan(10);
  });
});
