import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import {
  ContinueDfsTrendsSchema,
  CreateDfsPullSchema,
  StartDfsTrendsSchema,
  type ContinueDfsTrendsDto,
  type CreateDfsPullDto,
  type StartDfsTrendsDto,
} from "@prospector/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { DfsService } from "./dfs.service";

@Controller("dfs/pulls")
export class DfsController {
  constructor(private readonly dfs: DfsService) {}

  @Get()
  list() {
    return this.dfs.list();
  }

  @Get("latest")
  latest() {
    return this.dfs.latest();
  }

  @Get(":id/raw")
  raw(@Param("id") id: string) {
    return this.dfs.raw(id);
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.dfs.get(id);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(CreateDfsPullSchema))
    body: CreateDfsPullDto,
  ) {
    return this.dfs.create(body);
  }

  @Post("trends")
  startTrends(
    @Body(new ZodValidationPipe(StartDfsTrendsSchema))
    body: StartDfsTrendsDto,
  ) {
    return this.dfs.startTrends(body);
  }

  @Post(":id/continue")
  continueTrends(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(ContinueDfsTrendsSchema))
    body: ContinueDfsTrendsDto,
  ) {
    return this.dfs.continueTrends(id, body);
  }
}
