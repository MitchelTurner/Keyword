import { Global, Module } from "@nestjs/common";
import { CostService } from "./cost.service";

@Global()
@Module({
  providers: [CostService],
  exports: [CostService],
})
export class CostModule {}
