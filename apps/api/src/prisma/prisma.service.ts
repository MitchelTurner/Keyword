import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    super({
      log: ["warn", "error"],
    });
  }

  // Intentionally no onModuleInit $connect — lazy connect on first query
  // so HTTP can bind even if DB is briefly unavailable during Railway boot.

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
