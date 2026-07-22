import { describe, expect, it, vi } from "vitest";
import { SitesService } from "./sites.service";

describe("SitesService helpers via public flows", () => {
  it("serializes list output shape from prisma mocks", async () => {
    const prisma = {
      trackedSite: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "s1",
            name: "Demo",
            domain: "demo.test",
            notes: "",
            createdAt: new Date("2026-01-01"),
            updatedAt: new Date("2026-01-02"),
            _count: { keywords: 3 },
          },
        ]),
      },
    };
    const dataForSeo = {};
    const service = new SitesService(prisma as never, dataForSeo as never);
    const result = await service.listSites();
    expect(result.count).toBe(1);
    expect(result.sites[0]).toMatchObject({
      id: "s1",
      name: "Demo",
      domain: "demo.test",
      keywordCount: 3,
    });
  });
});
