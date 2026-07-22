import { Module } from "@nestjs/common";
import { DataForSeoModule } from "../dataforseo/dataforseo.module";
import { SitesController } from "./sites.controller";
import { SitesService } from "./sites.service";

@Module({
  imports: [DataForSeoModule],
  controllers: [SitesController],
  providers: [SitesService],
  exports: [SitesService],
})
export class SitesModule {}
