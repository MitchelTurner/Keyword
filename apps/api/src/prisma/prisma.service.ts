import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({
      log:
        process.env.NODE_ENV === "production"
          ? ["warn", "error"]
          : ["warn", "error"],
    });
  }

  async onModuleInit() {
    // Fail fast on bad DATABASE_URL, but keep the connect timeout tight.
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
