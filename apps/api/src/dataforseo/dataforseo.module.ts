import { Module } from "@nestjs/common";
import { DataForSeoService } from "./dataforseo.service";

@Module({
  providers: [DataForSeoService],
  exports: [DataForSeoService],
})
export class DataForSeoModule {}
