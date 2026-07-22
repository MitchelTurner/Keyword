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
import {
  NichesService,
  type SeedSearchMode,
} from "../niches/niches.service";

function parseMode(raw?: string): SeedSearchMode {
  return raw === "low_cpc" ? "low_cpc" : "default";
}

@Controller("recommendations")
export class RecommendationsController {
  constructor(private readonly niches: NichesService) {}

  @Get()
  list(
    @Query("refresh") refresh?: string,
    @Query("mode") mode?: string,
  ) {
    const forceRefresh = refresh === "1" || refresh === "true";
    return this.niches.recommendations({
      forceRefresh,
      mode: parseMode(mode),
    });
  }

  /** Kick off an async seed search used by the search buttons. */
  @Post("refresh")
  refresh(@Query("mode") mode?: string, @Body() body?: { mode?: string }) {
    return this.niches.startRecommendationsRefresh({
      mode: parseMode(mode ?? body?.mode),
    });
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
