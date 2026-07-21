import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./prisma/prisma.module";
import { HealthModule } from "./health/health.module";
import { DataForSeoModule } from "./dataforseo/dataforseo.module";
import { ClaudeModule } from "./claude/claude.module";
import { PipelineModule } from "./pipeline/pipeline.module";
import { NichesModule } from "./niches/niches.module";
import { CostModule } from "./cost/cost.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ["../../.env", ".env"] }),
    PrismaModule,
    CostModule,
    HealthModule,
    DataForSeoModule,
    ClaudeModule,
    PipelineModule,
    NichesModule,
  ],
})
export class AppModule {}
