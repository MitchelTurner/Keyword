import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import {
  CreateDfsPullSchema,
  type CreateDfsPullDto,
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
}
