import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class CostService {
  private readonly logger = new Logger(CostService.name);

  constructor(private readonly prisma: PrismaService) {}

  async logCost(input: {
    provider: string;
    endpoint: string;
    cost: number;
    nicheId?: string;
    meta?: Record<string, unknown>;
  }) {
    this.logger.log(
      JSON.stringify({
        event: "api_cost",
        provider: input.provider,
        endpoint: input.endpoint,
        cost: input.cost,
        nicheId: input.nicheId ?? null,
      }),
    );

    await this.prisma.apiCostLog.create({
      data: {
        provider: input.provider,
        endpoint: input.endpoint,
        cost: input.cost,
        nicheId: input.nicheId,
        meta: (input.meta as Prisma.InputJsonValue) ?? undefined,
      },
    });
  }

  async totalsByNiche(nicheId: string) {
    const rows = await this.prisma.apiCostLog.groupBy({
      by: ["provider"],
      where: { nicheId },
      _sum: { cost: true },
    });
    const byProvider = Object.fromEntries(
      rows.map((r) => [r.provider, r._sum.cost ?? 0]),
    );
    const total = rows.reduce((s, r) => s + (r._sum.cost ?? 0), 0);
    return { total, byProvider };
  }

  async globalTotal() {
    const agg = await this.prisma.apiCostLog.aggregate({
      _sum: { cost: true },
    });
    return agg._sum.cost ?? 0;
  }
}
