import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import type { INestApplication } from "@nestjs/common";
import type { Queue } from "bullmq";

process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://prospector:prospector@localhost:5432/prospector";
process.env.REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
process.env.NICHE_PIPELINE_QUEUE = "niche-pipeline-test";
process.env.DATAFORSEO_LOGIN = "test";
process.env.DATAFORSEO_PASSWORD = "test";
process.env.ANTHROPIC_API_KEY = "test";

const prisma = new PrismaClient();

describe("niche pipeline integration (mocked externals)", () => {
  let app: INestApplication;
  let niches: {
    create: (dto: { seedTerm: string }) => Promise<{ id: string; status: string }>;
    get: (id: string) => Promise<{
      keywordCount: number;
      opportunities: Array<{ demandScore: number; totalVolume: number }>;
    }>;
    remove: (id: string) => Promise<unknown>;
  };
  let queue: Queue;

  beforeAll(async () => {
    const { Test } = await import("@nestjs/testing");
    const { ConfigModule } = await import("@nestjs/config");
    const { AppModule } = await import("../src/app.module");
    const { DataForSeoService } = await import(
      "../src/dataforseo/dataforseo.service"
    );
    const { ClaudeService } = await import("../src/claude/claude.service");
    const { NichesService } = await import("../src/niches/niches.service");
    const { PIPELINE_QUEUE } = await import(
      "../src/pipeline/pipeline.constants"
    );

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), AppModule],
    })
      .overrideProvider(DataForSeoService)
      .useValue({
        expandKeywords: vi.fn(async () => [
          "invoice software",
          "best invoicing software",
          "invoice ocr software",
          "accounts payable automation",
        ]),
        enrichKeywords: vi.fn(async (terms: string[]) =>
          terms.map((keyword, i) => ({
            keyword,
            searchVolume: 1000 + i * 100,
            cpc: 5 + i,
            competition: 0.4,
            monthlyTrend: [
              { year: 2025, month: 1, search_volume: 900 + i * 100 },
              { year: 2025, month: 2, search_volume: 1000 + i * 100 },
            ],
            raw: { keyword, search_volume: 1000 + i * 100 },
          })),
        ),
      })
      .overrideProvider(ClaudeService)
      .useValue({
        expandKeywords: vi.fn(
          async (_seed: string, candidates: string[] = []) => [
            "invoice software",
            "best invoicing software",
            "invoice ocr software",
            "accounts payable automation",
            ...candidates.slice(0, 2),
          ],
        ),
        classifyChunk: vi.fn(async (keywords: Array<{ term: string }>) => ({
          clusters: [
            {
              product_description: "Invoicing software for SMBs",
              buyer_type: "SMB",
              intent: "transactional",
              pain_severity: 4,
              reasoning: "Buyers searching for tools to send invoices.",
              keywords: keywords
                .map((k) => k.term)
                .filter((t) => !t.includes("payable")),
            },
            {
              product_description: "Accounts payable automation",
              buyer_type: "enterprise",
              intent: "comparison",
              pain_severity: 5,
              reasoning: "Enterprise AP automation demand.",
              keywords: keywords
                .map((k) => k.term)
                .filter((t) => t.includes("payable")),
            },
          ].filter((c) => c.keywords.length > 0),
        })),
        mergeClusterLabels: vi.fn(async (labels: string[]) => ({
          merges: labels.map((canonical) => ({ canonical, aliases: [] })),
        })),
        reviewThemeBuildAngles: vi.fn(
          async (
            themes: Array<{ productDescription: string }>,
          ) => ({
            themes: themes.map((t) => ({
              product_description: t.productDescription,
              product_angle: "Ship a focused SaaS for this theme",
              monetization_model: "SaaS subscription",
              wedge: "Start with a single painful workflow",
            })),
          }),
        ),
        reviewMonetizableSeeds: vi.fn(async (keywords: string[]) => ({
          reviews: keywords.map((keyword) => ({
            keyword,
            approve: true,
            reason: "Buildable software niche",
          })),
        })),
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
    niches = app.get(NichesService);
    queue = app.get(PIPELINE_QUEUE);
  }, 60_000);

  afterAll(async () => {
    await queue?.close();
    await app?.close();
    await prisma.$disconnect();
  });

  it("runs expand→enrich→classify→score and produces opportunities", async () => {
    const created = await niches.create({ seedTerm: "invoice software" });

    let status = created.status;
    let error: string | null = null;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const current = await prisma.niche.findUniqueOrThrow({
        where: { id: created.id },
      });
      status = current.status;
      error = current.error;
      if (status === "DONE" || status === "FAILED") break;
    }

    expect({ status, error }).toEqual({ status: "DONE", error: null });

    const detail = await niches.get(created.id);
    expect(detail.keywordCount).toBeGreaterThanOrEqual(4);
    expect(detail.opportunities.length).toBeGreaterThanOrEqual(1);
    expect(detail.opportunities[0].demandScore).toBeGreaterThan(0);
    expect(detail.opportunities[0].totalVolume).toBeGreaterThan(0);

    await niches.remove(created.id);
  }, 60_000);
});
