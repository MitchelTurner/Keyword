import { describe, expect, it } from "vitest";
import { extractSearchVolumeItems } from "../dataforseo/dataforseo.service";
import searchVolumeFixture from "../../test/fixtures/search-volume.json";
import {
  extractHistoricalItems,
  indexSeries,
  readEnvelopeCost,
  seriesFromAdsItem,
  seriesFromHistoricalItem,
  taskResult,
} from "./dfs.parse";
import { takeSeriesForKeyword } from "@prospector/shared";

describe("dfs pull response parsing", () => {
  it("reads Ads search volume rows and envelope cost", () => {
    expect(readEnvelopeCost(searchVolumeFixture)).toBe(0.075);
    const items = extractSearchVolumeItems(taskResult(searchVolumeFixture));
    const indexed = indexSeries(
      items
        .map((item) => seriesFromAdsItem(item))
        .filter((row): row is NonNullable<typeof row> => row != null),
    );
    const invoice = takeSeriesForKeyword(
      "Invoice Software",
      indexed.byLower,
      indexed.byFold,
    );
    expect(invoice?.searchVolume).toBe(12100);
    expect(invoice?.cpc).toBe(18.4);
    expect(invoice?.monthly).toHaveLength(2);
  });

  it("reads Labs historical items nested under keyword_info", () => {
    const json = {
      cost: 0.02,
      tasks: [
        {
          cost: 0.02,
          result: [
            {
              items: [
                {
                  keyword: "Flávio Bolsonaro",
                  keyword_info: {
                    search_volume: 74000,
                    cpc: 0.4,
                    monthly_searches: [
                      { year: 2025, month: 10, search_volume: 80000 },
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
    };
    const items = extractHistoricalItems(taskResult(json));
    const row = seriesFromHistoricalItem(items[0]);
    expect(row?.keyword).toBe("Flávio Bolsonaro");
    expect(row?.series.searchVolume).toBe(74000);
    const indexed = indexSeries(row ? [row] : []);
    expect(
      takeSeriesForKeyword("flavio bolsonaro", indexed.byLower, indexed.byFold)
        ?.searchVolume,
    ).toBe(74000);
  });
});
