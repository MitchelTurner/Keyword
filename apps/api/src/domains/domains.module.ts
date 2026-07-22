import { Module } from "@nestjs/common";
import { ClaudeModule } from "../claude/claude.module";
import { DataForSeoModule } from "../dataforseo/dataforseo.module";
import { DomainsController } from "./domains.controller";
import { DomainsService } from "./domains.service";

@Module({
  imports: [ClaudeModule, DataForSeoModule],
  controllers: [DomainsController],
  providers: [DomainsService],
  exports: [DomainsService],
})
export class DomainsModule {}
