import { describe, expect, it } from "vitest";
import { scoreOpportunity, volumeWeightedMean } from "./scoring";

describe("volumeWeightedMean", () => {
  it("weights by search volume", () => {
    const mean = volumeWeightedMean([
      { value: 2, volume: 100 },
      { value: 4, volume: 300 },
    ]);
    expect(mean).toBeCloseTo(3.5);
  });

  it("ignores null values and zero volume", () => {
    expect(
      volumeWeightedMean([
        { value: null, volume: 100 },
        { value: 5, volume: 0 },
        { value: 10, volume: 50 },
      ]),
    ).toBe(10);
  });

  it("returns 0 when no usable data", () => {
    expect(volumeWeightedMean([{ value: null, volume: 10 }])).toBe(0);
  });
});

describe("scoreOpportunity", () => {
  it("computes floors and demand score from volume, CPC, competition", () => {
    const scored = scoreOpportunity(
      [
        { searchVolume: 1000, cpc: 5, competition: 0.5 },
        { searchVolume: 1000, cpc: 3, competition: 0.5 },
      ],
      { convRate: 0.02, ltvCacRatio: 4 },
    );

    expect(scored.totalVolume).toBe(2000);
    expect(scored.avgCpc).toBeCloseTo(4);
    expect(scored.avgCompetition).toBeCloseTo(0.5);
    expect(scored.impliedCac).toBeCloseTo(200);
    expect(scored.annualPriceFloor).toBeCloseTo(50);
    expect(scored.monthlyPriceFloor).toBeCloseTo(50 / 12);

    const base = Math.log10(2000 + 1) * 4 * (1.05 - 0.5);
    expect(scored.demandScore).toBeCloseTo(base);
  });

  it("ranks lower competition higher at equal volume and CPC", () => {
    const low = scoreOpportunity(
      [{ searchVolume: 1000, cpc: 5, competition: 0.2 }],
      { convRate: 0.02, ltvCacRatio: 3 },
    );
    const high = scoreOpportunity(
      [{ searchVolume: 1000, cpc: 5, competition: 0.8 }],
      { convRate: 0.02, ltvCacRatio: 3 },
    );
    expect(low.demandScore).toBeGreaterThan(high.demandScore);
  });

  it("excludes null-volume keywords from totals", () => {
    const scored = scoreOpportunity(
      [
        { searchVolume: null, cpc: 99, competition: 1 },
        { searchVolume: 50, cpc: 1, competition: 0.2 },
      ],
      { convRate: 0.015, ltvCacRatio: 3 },
    );
    expect(scored.totalVolume).toBe(50);
    expect(scored.avgCpc).toBe(1);
  });
});
