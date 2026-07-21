import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import {
  CreateNicheSchema,
  UpdateNicheAssumptionsSchema,
  UpdateOpportunitySchema,
  type CreateNicheDto,
  type UpdateNicheAssumptionsDto,
  type UpdateOpportunityDto,
} from "@prospector/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { NichesService } from "./niches.service";

@Controller("niches")
export class NichesController {
  constructor(private readonly niches: NichesService) {}

  @Get("cost-estimate")
  costEstimate() {
    return this.niches.estimateCost();
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(CreateNicheSchema))
    body: CreateNicheDto,
  ) {
    return this.niches.create(body);
  }

  @Get()
  list() {
    return this.niches.list();
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.niches.get(id);
  }

  @Get(":id/export.csv")
  async exportCsv(@Param("id") id: string, @Res() res: Response) {
    const csv = await this.niches.exportCsv(id);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="prospector-${id}.csv"`,
    );
    res.send(csv);
  }

  @Get(":id/opportunities/:oppId")
  getOpportunity(
    @Param("id") id: string,
    @Param("oppId") oppId: string,
  ) {
    return this.niches.getOpportunity(id, oppId);
  }

  @Patch(":id/opportunities/:oppId")
  updateOpportunity(
    @Param("id") id: string,
    @Param("oppId") oppId: string,
    @Body(new ZodValidationPipe(UpdateOpportunitySchema))
    body: UpdateOpportunityDto,
  ) {
    return this.niches.updateOpportunity(id, oppId, body);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(UpdateNicheAssumptionsSchema))
    body: UpdateNicheAssumptionsDto,
  ) {
    return this.niches.updateAssumptions(id, body);
  }

  @Post(":id/reclassify")
  reclassify(@Param("id") id: string) {
    return this.niches.reclassify(id);
  }

  @Post(":id/retry")
  retry(@Param("id") id: string) {
    return this.niches.retry(id);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.niches.remove(id);
  }
}
