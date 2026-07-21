import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue } from "bullmq";
import { DataForSeoModule } from "../dataforseo/dataforseo.module";
import { ClaudeModule } from "../claude/claude.module";
import { PipelineService } from "./pipeline.service";
import { PipelineProcessor } from "./pipeline.processor";
import { PipelineWorker } from "./pipeline.worker";
import { NICHE_PIPELINE_QUEUE, PIPELINE_QUEUE } from "./pipeline.constants";
import { redisConnection } from "../redis";

@Module({
  imports: [DataForSeoModule, ClaudeModule],
  providers: [
    PipelineProcessor,
    PipelineService,
    PipelineWorker,
    {
      provide: PIPELINE_QUEUE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        return new Queue(NICHE_PIPELINE_QUEUE, {
          connection: redisConnection(
            config.get<string>("REDIS_URL") ?? "redis://localhost:6379",
          ),
        });
      },
    },
  ],
  exports: [PipelineService, PIPELINE_QUEUE],
})
export class PipelineModule {}
