import { describe, expect, it } from "vitest";
import {
  analyzeCompetitors,
  annotateSerpSnapshot,
  buildVerdict,
  captureDecisionSnapshot,
  classifySerpPageType,
  combineOrganicSignal,
  computePriorityScore,
  contentGapScore,
  deriveWeightOverrides,
  diffDecisionSnapshots,
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

describe("combineOrganicSignal", () => {
  it("falls back to heuristic softness when no difficulty score", () => {
    const softness = { score: 0.7, detail: "Soft SERP" };
    expect(combineOrganicSignal({ softness })).toEqual(softness);
  });

  it("blends real Labs difficulty with the heuristic", () => {
    const softness = { score: 0.7, detail: "Soft SERP" };
    const easy = combineOrganicSignal({ softness, keywordDifficulty: 10 });
    const hard = combineOrganicSignal({ softness, keywordDifficulty: 90 });
    expect(easy.score).toBeGreaterThan(hard.score);
    expect(easy.detail).toContain("Keyword difficulty 10/100");
  });
});

describe("analyzeCompetitors", () => {
  it("marks UGC/low-traffic SERPs as beatable", () => {
    const intel = analyzeCompetitors([
      { domain: "reddit.com", title: "t", organicEtv: 2000 },
      { domain: "medium.com", title: "How to", organicEtv: 5000 },
      { domain: "g2.com", title: "list", organicEtv: 8000 },
      { domain: "quora.com", title: "q", organicEtv: 1000 },
      { domain: "blog.example.com", title: "Guide", organicEtv: 3000 },
    ]);
    expect(intel?.beatability).toBe("beatable");
    expect(intel?.topIncumbents[0]?.organicEtv).toBe(8000);
  });

  it("marks high-traffic SaaS SERPs as owned", () => {
    const intel = analyzeCompetitors([
      { domain: "salesforce.com", title: "CRM", organicEtv: 2_000_000 },
      { domain: "hubspot.com", title: "Hub", organicEtv: 1_500_000 },
      { domain: "oracle.com", title: "Suite", organicEtv: 900_000 },
      { domain: "sap.com", title: "ERP", organicEtv: 800_000 },
      { domain: "zendesk.com", title: "Support", organicEtv: 700_000 },
    ]);
    expect(intel?.beatability).toBe("owned");
  });
});

describe("contentGapScore", () => {
  it("flags transactional intent on content-heavy SERPs", () => {
    const gap = contentGapScore("transactional", [
      { domain: "reddit.com", title: "tools?" },
      { domain: "medium.com", title: "How to pick" },
      { domain: "g2.com", title: "list" },
      { domain: "blog.example.com", title: "Guide" },
    ]);
    expect(gap?.score).toBeGreaterThan(0.55);
    expect(gap?.detail).toContain("product wedge");
  });
});

describe("computePriorityScore", () => {
  it("ranks soft+large TAM above hard+small", () => {
    const high = computePriorityScore({
      tamScore: 0.8,
      organicSoftness: 0.8,
      keywordDifficulty: 20,
      contentGapScore: 0.7,
    });
    const low = computePriorityScore({
      tamScore: 0.3,
      organicSoftness: 0.2,
      keywordDifficulty: 85,
      contentGapScore: 0.1,
    });
    expect(high).toBeGreaterThan(low);
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
  });
});

describe("deriveWeightOverrides", () => {
  it("returns empty until enough outcomes", () => {
    expect(deriveWeightOverrides([{ outcome: "built" }])).toEqual({});
  });

  it("boosts organic/contentGap when wins dominate", () => {
    const o = deriveWeightOverrides([
      { outcome: "ranked" },
      { outcome: "revenue_mid" },
      { outcome: "built" },
      { outcome: "ranked" },
    ]);
    expect(o.organic).toBeGreaterThan(0.18);
    expect(o.contentGap).toBeGreaterThan(0.08);
  });
});

describe("decision snapshots", () => {
  it("diffs previous vs current", () => {
    const prev = captureDecisionSnapshot({
      verdict: "watch",
      score: 50,
      demandScore: 3,
      totalVolume: 5000,
      avgCompetition: 0.4,
      organicSoftness: 0.5,
      keywordDifficulty: 40,
      priorityScore: 2,
      capturedAt: "2026-01-01T00:00:00.000Z",
    });
    const cur = captureDecisionSnapshot({
      verdict: "build",
      score: 72,
      demandScore: 4,
      totalVolume: 8000,
      avgCompetition: 0.35,
      organicSoftness: 0.7,
      keywordDifficulty: 25,
      priorityScore: 3.5,
    });
    const diff = diffDecisionSnapshots(prev, cur);
    expect(diff?.verdictChanged).toBe(true);
    expect(diff?.summary).toContain("watch → build");
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
      intent: "transactional",
      monetizationModel: "B2B SaaS management platform",
      serp: [
        { domain: "reddit.com", title: "tools?", organicEtv: 2000 },
        { domain: "g2.com", title: "list", organicEtv: 8000 },
        { domain: "medium.com", title: "guide", organicEtv: 4000 },
        { domain: "quora.com", title: "q", organicEtv: 1000 },
        { domain: "blog.example.com", title: "How to", organicEtv: 3000 },
      ],
    });
    expect(v.verdict).toBe("build");
    expect(v.score).toBeGreaterThanOrEqual(68);
    expect(v.competitors?.beatability).toBe("beatable");
    expect(v.contentGap?.score).toBeGreaterThan(0.5);
    expect(v.priorityScore).toBeGreaterThan(0);
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
        { domain: "salesforce.com", title: "CRM", organicEtv: 2_000_000 },
        { domain: "hubspot.com", title: "Hub", organicEtv: 1_000_000 },
        { domain: "en.wikipedia.org", title: "Topic", organicEtv: 500_000 },
      ],
    });
    expect(v.verdict).toBe("kill");
    expect(v.score).toBeLessThan(42);
  });

  it("preserves organicEtv on annotated snapshots", () => {
    const annotated = annotateSerpSnapshot([
      { rank: 1, domain: "reddit.com", title: "x", organicEtv: 1234 },
    ]);
    expect(annotated[0]?.pageType).toBe("ugc");
    expect(annotated[0]?.organicEtv).toBe(1234);
  });

  it("lowers the verdict when real keyword difficulty is high despite a soft SERP", () => {
    const base = {
      totalVolume: 12_000,
      avgCpc: 0.6,
      avgCompetition: 0.35,
      monthlyPriceFloor: 25,
      demandScore: 4.5,
      painSeverity: 4,
      trendDirection: "rising" as const,
      rubricPass: true,
      rubricScore: 1,
      serp: [
        { domain: "reddit.com", title: "tools?" },
        { domain: "g2.com", title: "list" },
        { domain: "medium.com", title: "guide" },
      ],
    };
    const soft = buildVerdict({ ...base, keywordDifficulty: 5 });
    const hard = buildVerdict({ ...base, keywordDifficulty: 95 });
    expect(soft.score).toBeGreaterThan(hard.score);
  });
});
