import { Module } from "@nestjs/common";
import { ClaudeModule } from "../claude/claude.module";
import { DataForSeoModule } from "../dataforseo/dataforseo.module";
import { PipelineModule } from "../pipeline/pipeline.module";
import { PortfolioController } from "../portfolio/portfolio.controller";
import { RecommendationsController } from "../recommendations/recommendations.controller";
import { NichesController } from "./niches.controller";
import { NichesService } from "./niches.service";

@Module({
  imports: [PipelineModule, DataForSeoModule, ClaudeModule],
  controllers: [
    NichesController,
    PortfolioController,
    RecommendationsController,
  ],
  providers: [NichesService],
  exports: [NichesService],
})
export class NichesModule {}
