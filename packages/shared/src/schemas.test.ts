import { describe, expect, it } from "vitest";
import {
  ClaudeClassificationSchema,
  CreateNicheSchema,
  UpdateNicheAssumptionsSchema,
  UpdateOpportunitySchema,
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

describe("UpdateNicheAssumptionsSchema", () => {
  it("requires at least one field", () => {
    expect(() => UpdateNicheAssumptionsSchema.parse({})).toThrow();
  });

  it("accepts partial updates", () => {
    expect(UpdateNicheAssumptionsSchema.parse({ convRate: 0.02 })).toEqual({
      convRate: 0.02,
    });
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
