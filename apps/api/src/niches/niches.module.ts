import { Module } from "@nestjs/common";
import { ClaudeModule } from "../claude/claude.module";
import { DataForSeoModule } from "../dataforseo/dataforseo.module";
import { PipelineModule } from "../pipeline/pipeline.module";
import { PortfolioController } from "../portfolio/portfolio.controller";
import { RecommendationsController } from "../recommendations/recommendations.controller";
import { SitesModule } from "../sites/sites.module";
import { NichesController } from "./niches.controller";
import { NichesService } from "./niches.service";
import { SeedSearchJobStore } from "./seed-search-job.store";

@Module({
  imports: [PipelineModule, DataForSeoModule, ClaudeModule, SitesModule],
  controllers: [
    NichesController,
    PortfolioController,
    RecommendationsController,
  ],
  providers: [NichesService, SeedSearchJobStore],
  exports: [NichesService],
})
export class NichesModule {}
