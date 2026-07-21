import { Controller, Get } from "@nestjs/common";
import { NichesService } from "../niches/niches.service";

@Controller("portfolio")
export class PortfolioController {
  constructor(private readonly niches: NichesService) {}

  @Get()
  list() {
    return this.niches.portfolio();
  }
}
