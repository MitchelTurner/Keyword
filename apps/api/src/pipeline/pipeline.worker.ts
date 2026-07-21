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
import { PipelineProcessor } from "./pipeline.processor";
import { redisConnection } from "../redis";

@Injectable()
export class PipelineWorker
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PipelineWorker.name);
  private worker?: Worker;

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(PipelineProcessor) private readonly processor: PipelineProcessor,
  ) {}

  onModuleInit() {
    this.worker = new Worker(
      NICHE_PIPELINE_QUEUE,
      async (job) => this.processor.process(job),
      {
        connection: redisConnection(
          this.config.get<string>("REDIS_URL") ?? "redis://localhost:6379",
        ),
        concurrency: 2,
      },
    );

    this.worker.on("failed", (job, err) => {
      this.logger.error(
        `Job ${job?.name} failed for niche ${job?.data?.nicheId}: ${err.message}`,
      );
    });

    // v2 stub — do not register yet:
    // case "serp": await this.serp(nicheId); break;
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }
}
