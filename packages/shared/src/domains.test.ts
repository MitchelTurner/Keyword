import { describe, expect, it } from "vitest";
import {
  buildDomainLabels,
  scoreDomainIdea,
  slugifyDomainLabel,
} from "./domains";

describe("domains", () => {
  it("slugifies labels", () => {
    expect(slugifyDomainLabel("Salon Management!")).toBe("salonmanagement");
  });

  it("builds labels from topic keywords", () => {
    const labels = buildDomainLabels("salon management", [
      "salon booking software",
      "salon client management",
    ]);
    expect(labels.length).toBeGreaterThan(5);
    expect(labels.every((l) => l.label.length >= 4)).toBe(true);
  });

  it("scores keyword .com higher than long hyphenated odd TLD", () => {
    const good = scoreDomainIdea("salonflow.com", {
      relatedKeyword: "salon management",
      keywordVolume: 8000,
      available: true,
    });
    const bad = scoreDomainIdea("best-salon-management-software-online.xyz", {
      relatedKeyword: "salon management",
      keywordVolume: 8000,
      available: false,
    });
    expect(good).toBeGreaterThan(bad);
  });
});
