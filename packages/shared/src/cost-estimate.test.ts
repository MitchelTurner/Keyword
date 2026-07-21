import { describe, expect, it } from "vitest";
import { estimateRunCost } from "./cost-estimate";

describe("estimateRunCost", () => {
  it("returns a sensible planning range", () => {
    const est = estimateRunCost(400);
    expect(est.assumedKeywords).toBe(400);
    expect(est.low).toBeGreaterThan(0);
    expect(est.high).toBeGreaterThan(est.low);
    expect(est.breakdown.enrichHigh).toBeGreaterThan(est.breakdown.enrichLow);
  });

  it("scales with assumed keyword count", () => {
    const small = estimateRunCost(100);
    const large = estimateRunCost(1000);
    expect(large.high).toBeGreaterThan(small.high);
  });
});
