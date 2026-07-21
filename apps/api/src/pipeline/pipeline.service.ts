import { Inject, Injectable } from "@nestjs/common";
import { NicheStatus } from "@prisma/client";
import { Queue } from "bullmq";
import { PrismaService } from "../prisma/prisma.service";
import { PIPELINE_QUEUE, type PipelineJobName } from "./pipeline.constants";

const STATUS_TO_JOB: Record<NicheStatus, PipelineJobName | null> = {
  PENDING: "expand",
  EXPANDING: "expand",
  ENRICHING: "enrich",
  CLASSIFYING: "classify",
  SCORING: "score",
  FAILED: null,
  DONE: null,
};

@Injectable()
export class PipelineService {
  constructor(
    @Inject(PIPELINE_QUEUE) private readonly queue: Queue,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async enqueue(jobName: PipelineJobName, nicheId: string) {
    await this.queue.add(
      jobName,
      { nicheId },
      {
        jobId: `${jobName}:${nicheId}:${Date.now()}`,
        removeOnComplete: 100,
        removeOnFail: 200,
        attempts: 1,
      },
    );
  }

  async enqueueExpand(nicheId: string) {
    await this.enqueue("expand", nicheId);
  }

  async enqueueScore(nicheId: string) {
    await this.enqueue("score", nicheId);
  }

  async retryFailed(nicheId: string) {
    const niche = await this.prisma.niche.findUniqueOrThrow({
      where: { id: nicheId },
    });

    if (niche.status !== "FAILED") {
      throw new Error("Niche is not in FAILED status");
    }

    // Infer stage from last successful progress via keyword/opportunity presence.
    const [keywordCount, enrichedCount, oppCount] = await Promise.all([
      this.prisma.keyword.count({ where: { nicheId } }),
      this.prisma.keyword.count({
        where: { nicheId, searchVolume: { not: null } },
      }),
      this.prisma.opportunity.count({ where: { nicheId } }),
    ]);

    let job: PipelineJobName = "expand";
    if (oppCount > 0) job = "score";
    else if (enrichedCount > 0) job = "classify";
    else if (keywordCount > 0) job = "enrich";

    await this.prisma.niche.update({
      where: { id: nicheId },
      data: { error: null, status: this.statusForJob(job) },
    });

    await this.enqueue(job, nicheId);
    return job;
  }

  statusForJob(job: PipelineJobName): NicheStatus {
    switch (job) {
      case "expand":
        return "EXPANDING";
      case "enrich":
        return "ENRICHING";
      case "classify":
        return "CLASSIFYING";
      case "score":
        return "SCORING";
    }
  }

  jobForStatus(status: NicheStatus): PipelineJobName | null {
    return STATUS_TO_JOB[status];
  }
}
