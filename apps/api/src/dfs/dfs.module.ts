import { Module } from "@nestjs/common";
import { DataForSeoModule } from "../dataforseo/dataforseo.module";
import { DfsController } from "./dfs.controller";
import { DfsService } from "./dfs.service";

@Module({
  imports: [DataForSeoModule],
  controllers: [DfsController],
  providers: [DfsService],
})
export class DfsModule {}
