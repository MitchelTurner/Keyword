import { Controller, Get, Post, Query } from "@nestjs/common";
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
  list(@Query("refresh") refresh?: string) {
    const forceRefresh = refresh === "1" || refresh === "true";
    return this.niches.recommendations({ forceRefresh });
  }

  /** Explicit refresh used by the "Search new seeds" button. */
  @Post("refresh")
  refresh() {
    return this.niches.recommendations({ forceRefresh: true });
  }

  @Get("seeds")
  searchSeeds(
    @Query(new ZodValidationPipe(SearchSeedKeywordsSchema))
    query: SearchSeedKeywordsDto,
  ) {
    return this.niches.searchSeeds(query);
  }
}
