export const NICHE_PIPELINE_QUEUE =
  process.env.NICHE_PIPELINE_QUEUE ?? "niche-pipeline";
export const PIPELINE_QUEUE = "PIPELINE_QUEUE";

export type PipelineJobName = "expand" | "enrich" | "classify" | "score";
// v2 stub: | "serp"

export type PipelineJobData = {
  nicheId: string;
};
