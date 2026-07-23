import { describe, expect, it } from "vitest";
import {
  annotateSerpSnapshot,
  buildVerdict,
  classifySerpPageType,
  estimateTam,
  organicSoftnessScore,
} from "./verdict";

describe("classifySerpPageType", () => {
  it("detects UGC, directories, and authority", () => {
    expect(classifySerpPageType("reddit.com", "Anyone use X?")).toBe("ugc");
    expect(classifySerpPageType("g2.com", "Best tools")).toBe("directory");
    expect(classifySerpPageType("en.wikipedia.org", "Topic")).toBe("authority");
  });
});

describe("organicSoftnessScore", () => {
  it("scores UGC-heavy SERPs as soft", () => {
    const soft = organicSoftnessScore([
      { domain: "reddit.com", title: "thread" },
      { domain: "quora.com", title: "q" },
      { domain: "medium.com", title: "guide" },
      { domain: "g2.com", title: "list" },
      { domain: "example-blog.com", title: "How to manage X" },
    ]);
    expect(soft.score).toBeGreaterThan(0.65);
  });

  it("scores SaaS/authority SERPs as hard", () => {
    const hard = organicSoftnessScore([
      { domain: "salesforce.com", title: "Product" },
      { domain: "hubspot.com", title: "Platform" },
      { domain: "en.wikipedia.org", title: "Topic" },
      { domain: "oracle.com", title: "Enterprise" },
      { domain: "sap.com", title: "Suite" },
    ]);
    expect(hard.score).toBeLessThan(0.4);
  });
});

describe("estimateTam", () => {
  it("scales with volume and floor", () => {
    const tam = estimateTam({
      totalVolume: 20_000,
      avgCpc: 0.4,
      monthlyPriceFloor: 49,
      monetizationModel: "SaaS subscription",
    });
    expect(tam.monthlySearches).toBe(20_000);
    expect(tam.adMarketUsd).toBeCloseTo(8000);
    expect(tam.score).toBeGreaterThan(0.4);
    expect(tam.summary).toContain("searches");
  });
});

describe("buildVerdict", () => {
  it("returns build for soft SERP + solid demand", () => {
    const v = buildVerdict({
      totalVolume: 12_000,
      avgCpc: 0.6,
      avgCompetition: 0.35,
      monthlyPriceFloor: 25,
      demandScore: 4.5,
      painSeverity: 4,
      trendDirection: "rising",
      rubricPass: true,
      rubricScore: 1,
      monetizationModel: "B2B SaaS management platform",
      serp: [
        { domain: "reddit.com", title: "tools?" },
        { domain: "g2.com", title: "list" },
        { domain: "medium.com", title: "guide" },
        { domain: "quora.com", title: "q" },
        { domain: "blog.example.com", title: "How to" },
      ],
    });
    expect(v.verdict).toBe("build");
    expect(v.score).toBeGreaterThanOrEqual(68);
    expect(v.tam.monthlySearches).toBe(12_000);
    expect(v.organicSoftness).toBeGreaterThan(0.5);
  });

  it("returns kill for declining hard niches", () => {
    const v = buildVerdict({
      totalVolume: 200,
      avgCpc: 12,
      avgCompetition: 0.9,
      monthlyPriceFloor: 5,
      demandScore: 0.8,
      painSeverity: 2,
      trendDirection: "declining",
      rubricPass: false,
      rubricScore: 0.2,
      serp: [
        { domain: "salesforce.com", title: "CRM" },
        { domain: "hubspot.com", title: "Hub" },
        { domain: "en.wikipedia.org", title: "Topic" },
      ],
    });
    expect(v.verdict).toBe("kill");
    expect(v.score).toBeLessThan(42);
  });

  it("annotates page types on snapshots", () => {
    const annotated = annotateSerpSnapshot([
      { rank: 1, domain: "reddit.com", title: "x" },
    ]);
    expect(annotated[0]?.pageType).toBe("ugc");
  });
});
