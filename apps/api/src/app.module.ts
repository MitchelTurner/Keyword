import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./prisma/prisma.module";
import { HealthModule } from "./health/health.module";
import { DataForSeoModule } from "./dataforseo/dataforseo.module";
import { ClaudeModule } from "./claude/claude.module";
import { PipelineModule } from "./pipeline/pipeline.module";
import { NichesModule } from "./niches/niches.module";
import { SitesModule } from "./sites/sites.module";
import { DomainsModule } from "./domains/domains.module";
import { DfsModule } from "./dfs/dfs.module";
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
    SitesModule,
    DomainsModule,
    DfsModule,
  ],
})
export class AppModule {}
