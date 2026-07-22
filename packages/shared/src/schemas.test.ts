import { describe, expect, it } from "vitest";
import {
  ClaudeClassificationSchema,
  ClaudeKeywordExpandSchema,
  ClaudeSeedMonetizationReviewSchema,
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
        limit: "20",
      }),
    ).toEqual({
      q: "cleaning",
      minVolume: 1000,
      maxCompetition: 0.3,
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

  it("accepts Google Ads string competition labels when index missing", () => {
    expect(normalizeCompetition("HIGH", null)).toBe(1);
    expect(normalizeCompetition("LOW", null)).toBeCloseTo(0.33);
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
