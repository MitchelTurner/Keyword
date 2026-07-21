import { Module } from "@nestjs/common";
import { PipelineModule } from "../pipeline/pipeline.module";
import { PortfolioController } from "../portfolio/portfolio.controller";
import { NichesController } from "./niches.controller";
import { NichesService } from "./niches.service";

@Module({
  imports: [PipelineModule],
  controllers: [NichesController, PortfolioController],
  providers: [NichesService],
  exports: [NichesService],
})
export class NichesModule {}
