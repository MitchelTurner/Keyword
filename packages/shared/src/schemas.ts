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

export const BuyerWeightsSchema = z.object({
  government: z.number().min(0).max(3).optional(),
  enterprise: z.number().min(0).max(3).optional(),
  SMB: z.number().min(0).max(3).optional(),
  prosumer: z.number().min(0).max(3).optional(),
  consumer: z.number().min(0).max(3).optional(),
});
export type BuyerWeightsDto = z.infer<typeof BuyerWeightsSchema>;

export const RubricConfigSchema = z.object({
  minMonthlyFloor: z.number().min(0).max(100000),
  minVolume: z.number().int().min(0).max(10_000_000),
  minPain: z.number().int().min(1).max(5),
  maxCompetition: z.number().min(0).max(1),
  preferredBuyers: z.array(BuyerTypeSchema).min(1),
  rejectDeclining: z.boolean(),
});
export type RubricConfigDto = z.infer<typeof RubricConfigSchema>;

export const UpdateNicheAssumptionsSchema = z
  .object({
    convRate: z.number().positive().max(1).optional(),
    ltvCacRatio: z.number().positive().max(100).optional(),
    buyerWeights: BuyerWeightsSchema.optional(),
    rubricConfig: RubricConfigSchema.optional(),
    /** When true, re-run score after saving weights/assumptions. Default true if scoring fields change. */
    rescore: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.convRate !== undefined ||
      v.ltvCacRatio !== undefined ||
      v.buyerWeights !== undefined ||
      v.rubricConfig !== undefined,
    {
      message:
        "At least one of convRate, ltvCacRatio, buyerWeights, or rubricConfig is required",
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
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  search_volume: z.number().int().nullable().optional(),
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

export const SearchVolumeItemSchema = z
  .object({
    keyword: z.string(),
    search_volume: z.number().nullable().optional(),
    cpc: z.number().nullable().optional(),
    competition: z.number().nullable().optional(),
    competition_index: z.number().nullable().optional(),
    monthly_searches: z.array(MonthlyTrendPointSchema).nullable().optional(),
  })
  .passthrough();

export type SearchVolumeItem = z.infer<typeof SearchVolumeItemSchema>;
