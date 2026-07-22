import { describe, expect, it } from "vitest";
import {
  AddTrackedKeywordsSchema,
  SuggestDomainsSchema,
  ClaudeClassificationSchema,
  ClaudeKeywordExpandSchema,
  ClaudeSeedMonetizationReviewSchema,
  ClaudeThemeBuildBriefSchema,
  CreateTrackedSiteSchema,
  RejectSeedSchema,
  CreateNicheSchema,
  SearchSeedKeywordsSchema,
  SearchVolumeItemSchema,
  UpdateNicheAssumptionsSchema,
  UpdateOpportunitySchema,
  isBucketCompetition,
  normalizeCompetition,
} from "./schemas";

describe("CreateNicheSchema", () => {
  it("accepts trimmed seed terms", () => {
    expect(CreateNicheSchema.parse({ seedTerm: "  crm software  " }).seedTerm)
      .toBe("crm software");
  });

  it("rejects empty seed", () => {
    expect(() => CreateNicheSchema.parse({ seedTerm: "  " })).toThrow();
  });
});

describe("SearchSeedKeywordsSchema", () => {
  it("applies high-volume low-competition defaults", () => {
    expect(SearchSeedKeywordsSchema.parse({})).toMatchObject({
      q: "",
      minVolume: 500,
      maxCompetition: 0.45,
      limit: 40,
    });
  });

  it("coerces query-string numbers", () => {
    expect(
      SearchSeedKeywordsSchema.parse({
        q: " cleaning ",
        minVolume: "1000",
        maxCompetition: "0.3",
        maxCpc: "1",
        limit: "20",
      }),
    ).toEqual({
      q: "cleaning",
      minVolume: 1000,
      maxCompetition: 0.3,
      maxCpc: 1,
      limit: 20,
    });
  });
});

describe("UpdateNicheAssumptionsSchema", () => {
  it("requires at least one field", () => {
    expect(() => UpdateNicheAssumptionsSchema.parse({})).toThrow();
  });

  it("accepts partial updates", () => {
    expect(UpdateNicheAssumptionsSchema.parse({ convRate: 0.02 })).toEqual({
      convRate: 0.02,
    });
  });

  it("accepts rubric config without preferred buyers", () => {
    const parsed = UpdateNicheAssumptionsSchema.parse({
      rubricConfig: {
        minMonthlyFloor: 49,
        minVolume: 500,
        minPain: 3,
        maxCompetition: 0.8,
        rejectDeclining: true,
      },
    });
    expect(parsed.rubricConfig).toMatchObject({
      minVolume: 500,
      rejectDeclining: true,
    });
    expect(
      (parsed.rubricConfig as { preferredBuyers?: unknown }).preferredBuyers,
    ).toBeUndefined();
  });
});

describe("UpdateOpportunitySchema", () => {
  it("accepts pin and review status", () => {
    expect(
      UpdateOpportunitySchema.parse({
        pinned: true,
        reviewStatus: "watching",
        notes: "worth building",
      }),
    ).toMatchObject({ pinned: true, reviewStatus: "watching" });
  });
});

describe("ClaudeKeywordExpandSchema", () => {
  it("accepts a keyword list", () => {
    const parsed = ClaudeKeywordExpandSchema.parse({
      keywords: ["running shoes", "best trail runners", "marathon racing flats"],
    });
    expect(parsed.keywords).toHaveLength(3);
  });
});

describe("SearchVolumeItemSchema", () => {
  it("prefers competition_index over LOW/MEDIUM/HIGH labels", () => {
    const parsed = SearchVolumeItemSchema.parse({
      keyword: "buy laptop",
      search_volume: 2900,
      cpc: 7.95,
      competition: "LOW",
      competition_index: 12,
      monthly_searches: [{ year: 2023, month: 10, search_volume: 2400 }],
    });
    expect(
      normalizeCompetition(parsed.competition, parsed.competition_index),
    ).toBeCloseTo(0.12);
  });

  it("ignores Google Ads string labels when index is missing", () => {
    expect(normalizeCompetition("HIGH", null)).toBeNull();
    expect(normalizeCompetition("LOW", null)).toBeNull();
  });

  it("keeps competition_index even when it lands on a former bucket float", () => {
    // Ads LOW band includes index 33 → 0.33; that is precise, not a placeholder.
    expect(normalizeCompetition("LOW", 33)).toBeCloseTo(0.33);
    expect(normalizeCompetition(null, 66)).toBeCloseTo(0.66);
    expect(normalizeCompetition(null, 100)).toBe(1);
  });

  it("nulls coarse Labs bucket floats without an index", () => {
    expect(normalizeCompetition(0.33, null)).toBeNull();
    expect(normalizeCompetition(0.66, null)).toBeNull();
    expect(normalizeCompetition(1, null)).toBeNull();
    expect(normalizeCompetition(0.12, null)).toBeCloseTo(0.12);
  });

  it("detects bucketed competition placeholders", () => {
    expect(isBucketCompetition(0.33)).toBe(true);
    expect(isBucketCompetition(0.12)).toBe(false);
  });
});

describe("ClaudeClassificationSchema", () => {
  it("parses a valid cluster payload", () => {
    const parsed = ClaudeClassificationSchema.parse({
      clusters: [
        {
          product_description: "Invoice OCR software",
          buyer_type: "SMB",
          intent: "transactional",
          pain_severity: 4,
          reasoning: "High CPC + buyer language",
          keywords: ["invoice ocr software", "best invoice scanner"],
        },
      ],
    });
    expect(parsed.clusters).toHaveLength(1);
  });

  it("rejects invalid buyer types", () => {
    expect(() =>
      ClaudeClassificationSchema.parse({
        clusters: [
          {
            product_description: "x",
            buyer_type: "startup",
            intent: "transactional",
            pain_severity: 3,
            reasoning: "r",
            keywords: ["a"],
          },
        ],
      }),
    ).toThrow();
  });
});

describe("ClaudeSeedMonetizationReviewSchema", () => {
  it("parses approve/reject reviews", () => {
    const parsed = ClaudeSeedMonetizationReviewSchema.parse({
      reviews: [
        {
          keyword: "invoice software",
          approve: true,
          reason: "Clear SaaS product with subscription monetization",
        },
        {
          keyword: "doctor",
          approve: false,
          reason: "Licensed profession, not a buildable digital product",
        },
      ],
    });
    expect(parsed.reviews).toHaveLength(2);
    expect(parsed.reviews[1]?.approve).toBe(false);
  });

  it("rejects empty reason", () => {
    expect(() =>
      ClaudeSeedMonetizationReviewSchema.parse({
        reviews: [{ keyword: "x", approve: true, reason: "  " }],
      }),
    ).toThrow();
  });
});

describe("ClaudeThemeBuildBriefSchema", () => {
  it("parses theme build briefs", () => {
    const parsed = ClaudeThemeBuildBriefSchema.parse({
      themes: [
        {
          product_description: "Invoice OCR software",
          product_angle: "SMB invoice scanning SaaS",
          monetization_model: "SaaS subscription",
          wedge: "Start with freelancers who hate QuickBooks receipts",
        },
      ],
    });
    expect(parsed.themes[0]?.monetization_model).toBe("SaaS subscription");
  });
});

describe("RejectSeedSchema", () => {
  it("accepts a term", () => {
    expect(RejectSeedSchema.parse({ term: " doctor " }).term).toBe("doctor");
  });
});

describe("tracked site schemas", () => {
  it("creates a site with optional domain", () => {
    const parsed = CreateTrackedSiteSchema.parse({
      name: " HabitKit ",
      domain: " habitkit.com ",
    });
    expect(parsed.name).toBe("HabitKit");
    expect(parsed.domain).toBe("habitkit.com");
  });

  it("adds keywords and defaults enrich", () => {
    const parsed = AddTrackedKeywordsSchema.parse({
      terms: [" habit tracker ", "morning routine"],
    });
    expect(parsed.terms).toEqual(["habit tracker", "morning routine"]);
    expect(parsed.enrich).toBe(true);
  });
});

describe("SuggestDomainsSchema", () => {
  it("defaults limit and trims topic", () => {
    const parsed = SuggestDomainsSchema.parse({ topic: " salon management " });
    expect(parsed.topic).toBe("salon management");
    expect(parsed.limit).toBe(24);
  });
});
