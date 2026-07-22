import { Body, Controller, Post } from "@nestjs/common";
import {
  SuggestDomainsSchema,
  type SuggestDomainsDto,
} from "@prospector/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { DomainsService } from "./domains.service";

@Controller("domains")
export class DomainsController {
  constructor(private readonly domains: DomainsService) {}

  @Post("suggest")
  suggest(
    @Body(new ZodValidationPipe(SuggestDomainsSchema)) body: SuggestDomainsDto,
  ) {
    return this.domains.suggest(body);
  }
}
