import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Worker } from "bullmq";
import { NICHE_PIPELINE_QUEUE } from "./pipeline.constants";
import type { PipelineJobName } from "./pipeline.constants";
import { PipelineRunner } from "./pipeline.runner";
import { redisConnection, resolveRedisUrl } from "../redis";

@Injectable()
export class PipelineWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PipelineWorker.name);
  private worker?: Worker;

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(PipelineRunner) private readonly runner: PipelineRunner,
  ) {}

  onModuleInit() {
    try {
      const redisUrl = resolveRedisUrl(this.config.get<string>("REDIS_URL"));
      this.logger.log(
        `Connecting BullMQ worker to Redis at ${safeRedisHost(redisUrl)}`,
      );

      this.worker = new Worker(
        NICHE_PIPELINE_QUEUE,
        async (job) => {
          const nicheId = job.data?.nicheId as string | undefined;
          const stage = job.name as PipelineJobName;
          if (!nicheId) {
            throw new Error("Job missing nicheId");
          }
          // Prefer single in-process execution; skip if runner already has it.
          const started = this.runner.start(nicheId, stage);
          if (!started) {
            this.logger.log(
              `BullMQ job ${stage} for ${nicheId} skipped — already running in-process`,
            );
            return;
          }
          // Wait until the in-process run finishes so BullMQ doesn't mark
          // complete while work is still going.
          while (this.runner.isActive(nicheId)) {
            await new Promise((r) => setTimeout(r, 1000));
          }
        },
        {
          connection: redisConnection(redisUrl),
          concurrency: 1,
          lockDuration: 15 * 60 * 1000,
          stalledInterval: 60 * 1000,
          maxStalledCount: 2,
        },
      );

      this.worker.on("ready", () => {
        this.logger.log("BullMQ worker ready");
      });

      this.worker.on("failed", (job, err) => {
        this.logger.error(
          `Job ${job?.name} failed for niche ${job?.data?.nicheId}: ${err.message}`,
        );
      });

      this.worker.on("error", (err) => {
        this.logger.error(`BullMQ worker error: ${err.message}`);
      });
    } catch (err) {
      this.logger.error(
        `Failed to start BullMQ worker (in-process runner still active): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }
}

function safeRedisHost(redisUrl: string): string {
  try {
    const u = new URL(redisUrl);
    return `${u.protocol}//${u.hostname}:${u.port || 6379}`;
  } catch {
    return "(invalid REDIS_URL)";
  }
}
