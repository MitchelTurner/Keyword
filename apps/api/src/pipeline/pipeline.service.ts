import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from "@nestjs/common";
import { NicheStatus } from "@prisma/client";
import { Queue } from "bullmq";
import { PrismaService } from "../prisma/prisma.service";
import { PIPELINE_QUEUE, type PipelineJobName } from "./pipeline.constants";
import { PipelineRunner } from "./pipeline.runner";

const STATUS_TO_JOB: Record<NicheStatus, PipelineJobName | null> = {
  PENDING: "expand",
  EXPANDING: "expand",
  ENRICHING: "enrich",
  CLASSIFYING: "classify",
  SCORING: "score",
  FAILED: null,
  DONE: null,
};

const IN_FLIGHT: NicheStatus[] = [
  "PENDING",
  "EXPANDING",
  "ENRICHING",
  "CLASSIFYING",
  "SCORING",
];

@Injectable()
export class PipelineService {
  private readonly logger = new Logger(PipelineService.name);

  constructor(
    @Inject(PIPELINE_QUEUE) private readonly queue: Queue,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PipelineRunner) private readonly runner: PipelineRunner,
  ) {}

  /**
   * Start a stage: in-process first (reliable), Redis queue second (backup).
   */
  async enqueue(
    jobName: PipelineJobName,
    nicheId: string,
    opts: { force?: boolean } = {},
  ) {
    // Primary path — never block niche creation on Redis.
    this.runner.start(nicheId, jobName, { force: opts.force });

    // Best-effort backup queue (do not await — a bad Redis can hang forever).
    void this.queue
      .add(
        jobName,
        { nicheId },
        {
          jobId: `${jobName}:${nicheId}:${Date.now()}`,
          removeOnComplete: 100,
          removeOnFail: 200,
          attempts: 1,
        },
      )
      .catch((err: unknown) => {
        this.logger.warn(
          `Redis enqueue failed for ${nicheId}/${jobName} (in-process running): ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      });
  }

  async enqueueExpand(nicheId: string) {
    await this.enqueue("expand", nicheId);
  }

  async enqueueScore(nicheId: string) {
    await this.enqueue("score", nicheId);
  }

  async enqueueClassify(nicheId: string) {
    await this.enqueue("classify", nicheId);
  }

  /**
   * Resume a failed or in-flight niche from the best inferred stage.
   */
  async retryFailed(nicheId: string) {
    const niche = await this.prisma.niche.findUniqueOrThrow({
      where: { id: nicheId },
    });

    if (niche.status === "DONE") {
      throw new BadRequestException("Niche is already DONE");
    }
    if (niche.status !== "FAILED" && !IN_FLIGHT.includes(niche.status)) {
      throw new BadRequestException("Niche is not failed or in-flight");
    }

    const job = await this.runner.inferStage(nicheId);

    await this.prisma.niche.update({
      where: { id: nicheId },
      data: { error: null, status: this.statusForJob(job) },
    });

    await this.enqueue(job, nicheId, { force: true });
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
