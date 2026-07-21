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
  CreateNicheSchema,
  UpdateNicheAssumptionsSchema,
} from "@prospector/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { NichesService } from "./niches.service";

@Controller("niches")
export class NichesController {
  constructor(private readonly niches: NichesService) {}

  @Post()
  create(
    @Body(new ZodValidationPipe(CreateNicheSchema))
    body: { seedTerm: string },
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

  @Get(":id/opportunities/:oppId")
  getOpportunity(
    @Param("id") id: string,
    @Param("oppId") oppId: string,
  ) {
    return this.niches.getOpportunity(id, oppId);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(UpdateNicheAssumptionsSchema))
    body: { convRate?: number; ltvCacRatio?: number },
  ) {
    return this.niches.updateAssumptions(id, body);
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
