import { Controller, Get } from "@nestjs/common";
import { NichesService } from "../niches/niches.service";

@Controller("recommendations")
export class RecommendationsController {
  constructor(private readonly niches: NichesService) {}

  @Get()
  list() {
    return this.niches.recommendations();
  }
}
