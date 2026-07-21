import type { BuyerType } from "./schemas";

export type KeywordMetrics = {
  searchVolume: number | null | undefined;
  cpc: number | null | undefined;
  competition: number | null | undefined;
};

export type ScoringAssumptions = {
  convRate: number;
  ltvCacRatio: number;
};

export type ScoredOpportunity = {
  totalVolume: number;
  avgCpc: number;
  avgCompetition: number;
  impliedCac: number;
  annualPriceFloor: number;
  monthlyPriceFloor: number;
  demandScore: number;
};

/** Operator sales-strength weights — edit freely. */
export const BUYER_TYPE_WEIGHTS: Record<BuyerType, number> = {
  government: 1.2,
  enterprise: 1.1,
  SMB: 1.0,
  prosumer: 0.8,
  consumer: 0.6,
};

export function volumeWeightedMean(
  items: Array<{ value: number | null | undefined; volume: number | null | undefined }>,
): number {
  let weightedSum = 0;
  let totalVolume = 0;

  for (const item of items) {
    const volume = item.volume ?? 0;
    if (volume <= 0 || item.value == null || Number.isNaN(item.value)) continue;
    weightedSum += item.value * volume;
    totalVolume += volume;
  }

  if (totalVolume === 0) return 0;
  return weightedSum / totalVolume;
}

export function scoreOpportunity(
  keywords: KeywordMetrics[],
  assumptions: ScoringAssumptions,
  buyerType: BuyerType,
): ScoredOpportunity {
  const enriched = keywords.filter(
    (k) => k.searchVolume != null && k.searchVolume > 0,
  );

  const totalVolume = enriched.reduce(
    (sum, k) => sum + (k.searchVolume ?? 0),
    0,
  );

  const avgCpc = volumeWeightedMean(
    enriched.map((k) => ({ value: k.cpc, volume: k.searchVolume })),
  );
  const avgCompetition = volumeWeightedMean(
    enriched.map((k) => ({ value: k.competition, volume: k.searchVolume })),
  );

  const convRate = assumptions.convRate > 0 ? assumptions.convRate : 0.015;
  const ltvCacRatio =
    assumptions.ltvCacRatio > 0 ? assumptions.ltvCacRatio : 3.0;

  const impliedCac = avgCpc / convRate;
  const annualPriceFloor = impliedCac / ltvCacRatio;
  const monthlyPriceFloor = annualPriceFloor / 12;

  const weight = BUYER_TYPE_WEIGHTS[buyerType] ?? 1.0;
  const demandScore =
    Math.log10(totalVolume + 1) * avgCpc * (1 + avgCompetition) * weight;

  return {
    totalVolume,
    avgCpc,
    avgCompetition,
    impliedCac,
    annualPriceFloor,
    monthlyPriceFloor,
    demandScore,
  };
}
