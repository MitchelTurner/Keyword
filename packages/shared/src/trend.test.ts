import { describe, expect, it } from "vitest";
import {
  aggregateMonthlyTrends,
  analyzeOpportunityTrend,
  analyzeTrend,
} from "./trend";

describe("aggregateMonthlyTrends", () => {
  it("sums volumes for the same month across keywords", () => {
    const series = aggregateMonthlyTrends([
      [
        { year: 2025, month: 1, search_volume: 100 },
        { year: 2025, month: 2, search_volume: 120 },
      ],
      [
        { year: 2025, month: 1, search_volume: 50 },
        { year: 2025, month: 2, search_volume: 80 },
      ],
    ]);
    expect(series).toEqual([
      { year: 2025, month: 1, search_volume: 150 },
      { year: 2025, month: 2, search_volume: 200 },
    ]);
  });
});

describe("analyzeTrend", () => {
  it("detects rising demand", () => {
    const points = Array.from({ length: 12 }, (_, i) => ({
      year: 2025,
      month: i + 1,
      search_volume: 100 + i * 20,
    }));
    const t = analyzeTrend(points);
    expect(t.direction).toBe("rising");
    expect(t.score).toBeGreaterThan(0);
    expect(t.changePct).toBeGreaterThan(15);
  });

  it("detects declining demand", () => {
    const points = Array.from({ length: 12 }, (_, i) => ({
      year: 2025,
      month: i + 1,
      search_volume: 500 - i * 30,
    }));
    const t = analyzeTrend(points);
    expect(t.direction).toBe("declining");
    expect(t.score).toBeLessThan(0);
  });

  it("returns unknown for sparse series", () => {
    expect(analyzeTrend([{ year: 2025, month: 1, search_volume: 10 }]).direction)
      .toBe("unknown");
  });
});

describe("analyzeOpportunityTrend", () => {
  it("aggregates before classifying", () => {
    const t = analyzeOpportunityTrend([
      [
        { year: 2025, month: 1, search_volume: 10 },
        { year: 2025, month: 2, search_volume: 10 },
        { year: 2025, month: 3, search_volume: 10 },
        { year: 2025, month: 4, search_volume: 40 },
        { year: 2025, month: 5, search_volume: 40 },
        { year: 2025, month: 6, search_volume: 40 },
      ],
    ]);
    expect(t.direction).toBe("rising");
  });
});
