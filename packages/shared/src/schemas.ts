import { z } from "zod";

export const NicheStatusSchema = z.enum([
  "PENDING",
  "EXPANDING",
  "ENRICHING",
  "CLASSIFYING",
  "SCORING",
  "DONE",
  "FAILED",
]);
export type NicheStatus = z.infer<typeof NicheStatusSchema>;

export const BuyerTypeSchema = z.enum([
  "SMB",
  "enterprise",
  "government",
  "consumer",
  "prosumer",
]);
export type BuyerType = z.infer<typeof BuyerTypeSchema>;

export const IntentSchema = z.enum([
  "transactional",
  "comparison",
  "informational",
]);
export type Intent = z.infer<typeof IntentSchema>;

export const CreateNicheSchema = z.object({
  seedTerm: z.string().trim().min(1).max(200),
});
export type CreateNicheDto = z.infer<typeof CreateNicheSchema>;

/** Search enriched keywords for high-volume / low-competition seed ideas. */
export const SearchSeedKeywordsSchema = z.object({
  q: z.string().trim().max(200).optional().default(""),
  minVolume: z.coerce.number().int().min(0).max(10_000_000).optional().default(500),
  maxCompetition: z.coerce.number().min(0).max(1).optional().default(0.45),
  limit: z.coerce.number().int().min(1).max(100).optional().default(40),
});
export type SearchSeedKeywordsDto = z.infer<typeof SearchSeedKeywordsSchema>;

export const RubricConfigSchema = z.object({
  minMonthlyFloor: z.number().min(0).max(100000),
  minVolume: z.number().int().min(0).max(10_000_000),
  minPain: z.number().int().min(1).max(5),
  maxCompetition: z.number().min(0).max(1),
  rejectDeclining: z.boolean(),
});
export type RubricConfigDto = z.infer<typeof RubricConfigSchema>;

export const UpdateNicheAssumptionsSchema = z
  .object({
    convRate: z.number().positive().max(1).optional(),
    ltvCacRatio: z.number().positive().max(100).optional(),
    rubricConfig: RubricConfigSchema.optional(),
    /** When true, re-run score after saving assumptions. Default true if scoring fields change. */
    rescore: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.convRate !== undefined ||
      v.ltvCacRatio !== undefined ||
      v.rubricConfig !== undefined,
    {
      message:
        "At least one of convRate, ltvCacRatio, or rubricConfig is required",
    },
  );
export type UpdateNicheAssumptionsDto = z.infer<
  typeof UpdateNicheAssumptionsSchema
>;

export const ReviewStatusSchema = z.enum([
  "none",
  "watching",
  "building",
  "passed",
]);
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;

export const UpdateOpportunitySchema = z
  .object({
    pinned: z.boolean().optional(),
    notes: z.string().max(5000).optional(),
    reviewStatus: ReviewStatusSchema.optional(),
  })
  .refine(
    (v) =>
      v.pinned !== undefined ||
      v.notes !== undefined ||
      v.reviewStatus !== undefined,
    { message: "At least one field is required" },
  );
export type UpdateOpportunityDto = z.infer<typeof UpdateOpportunitySchema>;

export const MonthlyTrendPointSchema = z.object({
  year: z.number(),
  month: z.number().min(1).max(12),
  // Google Ads occasionally returns non-integers; don't drop the whole row.
  search_volume: z.number().nullable().optional(),
});
export type MonthlyTrendPoint = z.infer<typeof MonthlyTrendPointSchema>;

export const ClaudeClusterSchema = z.object({
  product_description: z.string().min(1),
  buyer_type: BuyerTypeSchema,
  intent: IntentSchema,
  pain_severity: z.number().int().min(1).max(5),
  reasoning: z.string().min(1),
  keywords: z.array(z.string()).min(1),
});

export const ClaudeClassificationSchema = z.object({
  clusters: z.array(ClaudeClusterSchema).min(1),
});
export type ClaudeClassification = z.infer<typeof ClaudeClassificationSchema>;

export const ClaudeMergeSchema = z.object({
  merges: z.array(
    z.object({
      canonical: z.string().min(1),
      aliases: z.array(z.string()),
    }),
  ),
});
export type ClaudeMerge = z.infer<typeof ClaudeMergeSchema>;

/** AI-generated / AI-filtered keyword expand list */
export const ClaudeKeywordExpandSchema = z.object({
  keywords: z.array(z.string().trim().min(1)).min(1).max(200),
});
export type ClaudeKeywordExpand = z.infer<typeof ClaudeKeywordExpandSchema>;

/**
 * AI review of recommended seed keywords for "can I build a website/software
 * product and monetize it easily?" — not licensed professions or pure local services.
 */
export const ClaudeSeedMonetizationReviewSchema = z.object({
  reviews: z
    .array(
      z.object({
        keyword: z.string().trim().min(1),
        approve: z.boolean(),
        reason: z.string().trim().min(1).max(280),
      }),
    )
    .max(120),
});
export type ClaudeSeedMonetizationReview = z.infer<
  typeof ClaudeSeedMonetizationReviewSchema
>;

/** Second-pass AI brief: buildable product angle + monetization for a theme. */
export const ClaudeThemeBuildBriefSchema = z.object({
  themes: z
    .array(
      z.object({
        product_description: z.string().trim().min(1),
        product_angle: z.string().trim().min(1).max(280),
        monetization_model: z.string().trim().min(1).max(80),
        wedge: z.string().trim().min(1).max(280),
      }),
    )
    .max(40),
});
export type ClaudeThemeBuildBrief = z.infer<typeof ClaudeThemeBuildBriefSchema>;

/** Permanently hide a recommended seed from the suggestions panel. */
export const RejectSeedSchema = z.object({
  term: z.string().trim().min(1).max(120),
  reason: z.string().trim().max(280).optional(),
});
export type RejectSeedDto = z.infer<typeof RejectSeedSchema>;

/** DataForSEO wrapper envelope helpers */
export const DataForSeoTaskMetaSchema = z.object({
  status_code: z.number(),
  status_message: z.string().optional(),
  cost: z.number().optional(),
  result: z.array(z.unknown()).nullable().optional(),
});

export const KeywordIdeaItemSchema = z
  .object({
    keyword: z.string(),
  })
  .passthrough();

/** Labs keyword_ideas / keyword_suggestions row with metrics. */
export const LabsKeywordMetricsSchema = z
  .object({
    keyword: z.string(),
    keyword_info: z
      .object({
        search_volume: z.number().nullable().optional(),
        competition: z.number().nullable().optional(),
        competition_level: z.string().nullable().optional(),
        cpc: z.number().nullable().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();
export type LabsKeywordMetrics = z.infer<typeof LabsKeywordMetricsSchema>;

/**
 * Google Ads search_volume live returns competition as HIGH|MEDIUM|LOW (string).
 * Older AdWords-shaped fixtures used a 0–1 float. Accept both.
 */
export const SearchVolumeItemSchema = z
  .object({
    keyword: z.string(),
    search_volume: z.number().nullable().optional(),
    cpc: z.number().nullable().optional(),
    competition: z.union([z.number(), z.string()]).nullable().optional(),
    competition_index: z.number().nullable().optional(),
    monthly_searches: z.array(MonthlyTrendPointSchema).nullable().optional(),
  })
  .passthrough();

export type SearchVolumeItem = z.infer<typeof SearchVolumeItemSchema>;

const COMPETITION_LABELS: Record<string, number> = {
  low: 0.33,
  medium: 0.66,
  high: 1,
};

/** Coarse Google Ads bucket midpoints — prefer competition_index when present. */
const BUCKET_COMPETITION = new Set([0.33, 0.3333, 0.66, 0.6667, 1, 1.0]);

/**
 * Normalize Google Ads competition into 0–1.
 * Prefer competition_index (0–100) — labels / bucket floats collapse to ~0.33/0.66/1.
 */
export function normalizeCompetition(
  competition: number | string | null | undefined,
  competitionIndex?: number | null,
): number | null {
  if (competitionIndex != null && !Number.isNaN(competitionIndex)) {
    return Math.min(1, Math.max(0, competitionIndex / 100));
  }
  if (typeof competition === "number" && !Number.isNaN(competition)) {
    return competition > 1 ? competition / 100 : competition;
  }
  if (typeof competition === "string") {
    const mapped = COMPETITION_LABELS[competition.trim().toLowerCase()];
    if (mapped != null) return mapped;
  }
  return null;
}

/** True when a competition value looks like a LOW/MEDIUM/HIGH bucket, not a precise index. */
export function isBucketCompetition(
  competition: number | null | undefined,
): boolean {
  if (competition == null || Number.isNaN(competition)) return false;
  const rounded = Math.round(competition * 10000) / 10000;
  return BUCKET_COMPETITION.has(rounded) || BUCKET_COMPETITION.has(competition);
}
