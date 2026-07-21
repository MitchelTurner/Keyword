import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Liveness — must stay fast and DB-free for Railway healthchecks. */
  @Get()
  check() {
    return {
      ok: true,
      service: "prospector-api",
      uptime: process.uptime(),
    };
  }

  /** Readiness — verifies Postgres is reachable. */
  @Get("ready")
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { ok: true, db: true };
    } catch (err) {
      throw new ServiceUnavailableException({
        ok: false,
        db: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
