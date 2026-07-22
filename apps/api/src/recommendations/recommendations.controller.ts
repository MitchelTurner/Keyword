import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import {
  RejectSeedSchema,
  SearchSeedKeywordsSchema,
  type RejectSeedDto,
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

  /** Kick off an async seed search used by the "Search new seeds" button. */
  @Post("refresh")
  refresh() {
    return this.niches.startRecommendationsRefresh();
  }

  /** Poll status / result for the latest seed search job. */
  @Get("job")
  job() {
    return this.niches.getRecommendationsJob();
  }

  @Get("seeds")
  searchSeeds(
    @Query(new ZodValidationPipe(SearchSeedKeywordsSchema))
    query: SearchSeedKeywordsDto,
  ) {
    return this.niches.searchSeeds(query);
  }

  @Get("rejected")
  listRejected() {
    return this.niches.listRejectedSeeds();
  }

  @Post("reject")
  reject(
    @Body(new ZodValidationPipe(RejectSeedSchema)) body: RejectSeedDto,
  ) {
    return this.niches.rejectSeed(body);
  }

  @Delete("reject/:term")
  unreject(@Param("term") term: string) {
    return this.niches.unrejectSeed(decodeURIComponent(term));
  }
}
