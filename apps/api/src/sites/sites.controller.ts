import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import {
  AddTrackedKeywordsSchema,
  CreateTrackedSiteSchema,
  FetchKeywordIdeasSchema,
  UpdateTrackedKeywordSchema,
  UpdateTrackedSiteSchema,
  type AddTrackedKeywordsDto,
  type CreateTrackedSiteDto,
  type FetchKeywordIdeasDto,
  type UpdateTrackedKeywordDto,
  type UpdateTrackedSiteDto,
} from "@prospector/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { SitesService } from "./sites.service";

@Controller("sites")
export class SitesController {
  constructor(private readonly sites: SitesService) {}

  @Get()
  list() {
    return this.sites.listSites();
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(CreateTrackedSiteSchema))
    body: CreateTrackedSiteDto,
  ) {
    return this.sites.createSite(body);
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.sites.getSite(id);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(UpdateTrackedSiteSchema))
    body: UpdateTrackedSiteDto,
  ) {
    return this.sites.updateSite(id, body);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.sites.deleteSite(id);
  }

  @Post(":id/keywords")
  addKeywords(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(AddTrackedKeywordsSchema))
    body: AddTrackedKeywordsDto,
  ) {
    return this.sites.addKeywords(id, body);
  }

  @Post(":id/enrich")
  enrich(@Param("id") id: string) {
    return this.sites.enrichSite(id);
  }

  @Patch(":id/keywords/:keywordId")
  updateKeyword(
    @Param("id") id: string,
    @Param("keywordId") keywordId: string,
    @Body(new ZodValidationPipe(UpdateTrackedKeywordSchema))
    body: UpdateTrackedKeywordDto,
  ) {
    return this.sites.updateKeyword(id, keywordId, body);
  }

  @Delete(":id/keywords/:keywordId")
  deleteKeyword(
    @Param("id") id: string,
    @Param("keywordId") keywordId: string,
  ) {
    return this.sites.deleteKeyword(id, keywordId);
  }

  @Post(":id/keywords/:keywordId/ideas")
  fetchIdeas(
    @Param("id") id: string,
    @Param("keywordId") keywordId: string,
    @Body(new ZodValidationPipe(FetchKeywordIdeasSchema.default({})))
    body: FetchKeywordIdeasDto,
  ) {
    return this.sites.fetchIdeas(id, keywordId, body ?? {});
  }
}
