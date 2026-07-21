import {
  BUYER_TYPE_WEIGHTS,
  DEFAULT_RUBRIC,
  buildBrief,
  evaluateRubric,
  explainDemandScore,
  mergeBuyerWeights,
  type BuyerType,
  type RubricConfig,
  type TrendAnalysis,
} from "@prospector/shared";
import type { Prisma } from "@prisma/client";

export function parseBuyerWeights(
  raw: Prisma.JsonValue | null | undefined,
): Partial<Record<BuyerType, number>> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Partial<Record<BuyerType, number>>;
}

export function parseRubricConfig(
  raw: Prisma.JsonValue | null | undefined,
): RubricConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return DEFAULT_RUBRIC;
  }
  return { ...DEFAULT_RUBRIC, ...(raw as Partial<RubricConfig>) };
}

export function attachDecisionSupport<
  T extends {
    id: string;
    productDescription: string;
    buyerType: string;
    intent: string;
    painSeverity: number;
    totalVolume: number;
    avgCpc: number;
    avgCompetition: number;
    monthlyPriceFloor: number;
    demandScore: number;
    trend: TrendAnalysis;
  },
>(
  opportunities: T[],
  opts: {
    buyerWeights?: Partial<Record<BuyerType, number>> | null;
    rubricConfig?: RubricConfig;
  },
) {
  const weights = mergeBuyerWeights(opts.buyerWeights);
  const rubric = opts.rubricConfig ?? DEFAULT_RUBRIC;
  const scores = opportunities.map((o) => o.demandScore).sort((a, b) => a - b);
  const median =
    scores.length === 0
      ? 0
      : scores.length % 2 === 1
        ? scores[(scores.length - 1) / 2]!
        : (scores[scores.length / 2 - 1]! + scores[scores.length / 2]!) / 2;

  const ranked = [...opportunities].sort(
    (a, b) => b.demandScore - a.demandScore,
  );
  const rankById = new Map(ranked.map((o, i) => [o.id, i + 1]));

  return opportunities.map((o) => {
    const breakdown = explainDemandScore({
      totalVolume: o.totalVolume,
      avgCpc: o.avgCpc,
      avgCompetition: o.avgCompetition,
      buyerType: o.buyerType,
      buyerWeights: weights,
    });
    const rubricResult = evaluateRubric(
      {
        buyerType: o.buyerType,
        monthlyPriceFloor: o.monthlyPriceFloor,
        totalVolume: o.totalVolume,
        painSeverity: o.painSeverity,
        avgCompetition: o.avgCompetition,
        trendDirection: o.trend.direction,
      },
      rubric,
    );
    const rank = rankById.get(o.id) ?? opportunities.length;
    const brief = buildBrief({
      productDescription: o.productDescription,
      buyerType: o.buyerType,
      intent: o.intent,
      painSeverity: o.painSeverity,
      totalVolume: o.totalVolume,
      avgCpc: o.avgCpc,
      avgCompetition: o.avgCompetition,
      monthlyPriceFloor: o.monthlyPriceFloor,
      demandScore: o.demandScore,
      trendDirection: o.trend.direction,
      changePct: o.trend.changePct,
      nicheMedianDemand: median,
      rank,
      nicheOpportunityCount: opportunities.length,
    });

    return {
      ...o,
      decision: {
        rank,
        breakdown,
        rubric: rubricResult,
        brief,
      },
    };
  });
}

export { BUYER_TYPE_WEIGHTS, DEFAULT_RUBRIC, mergeBuyerWeights };
