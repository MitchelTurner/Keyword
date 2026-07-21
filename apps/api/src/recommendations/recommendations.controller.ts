import { Controller, Get, Query } from "@nestjs/common";
import {
  SearchSeedKeywordsSchema,
  type SearchSeedKeywordsDto,
} from "@prospector/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { NichesService } from "../niches/niches.service";

@Controller("recommendations")
export class RecommendationsController {
  constructor(private readonly niches: NichesService) {}

  @Get()
  list() {
    return this.niches.recommendations();
  }

  @Get("seeds")
  searchSeeds(
    @Query(new ZodValidationPipe(SearchSeedKeywordsSchema))
    query: SearchSeedKeywordsDto,
  ) {
    return this.niches.searchSeeds(query);
  }
}
