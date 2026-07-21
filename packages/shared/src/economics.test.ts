import { describe, expect, it } from "vitest";
import { priceFloors } from "./economics";

describe("priceFloors", () => {
  it("computes CAC and floors from assumptions", () => {
    const floors = priceFloors(4, 0.02, 4);
    expect(floors.impliedCac).toBeCloseTo(200);
    expect(floors.annualPriceFloor).toBeCloseTo(50);
    expect(floors.monthlyPriceFloor).toBeCloseTo(50 / 12);
  });
});
