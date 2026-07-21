import {
  DEFAULT_RUBRIC,
  buildBrief,
  evaluateRubric,
  explainDemandScore,
  type RubricConfig,
  type TrendAnalysis,
} from "@prospector/shared";
import type { Prisma } from "@prisma/client";

export function parseRubricConfig(
  raw: Prisma.JsonValue | null | undefined,
): RubricConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_RUBRIC };
  }
  const o = raw as Record<string, unknown>;
  return {
    minMonthlyFloor:
      typeof o.minMonthlyFloor === "number"
        ? o.minMonthlyFloor
        : DEFAULT_RUBRIC.minMonthlyFloor,
    minVolume:
      typeof o.minVolume === "number" ? o.minVolume : DEFAULT_RUBRIC.minVolume,
    minPain:
      typeof o.minPain === "number" ? o.minPain : DEFAULT_RUBRIC.minPain,
    maxCompetition:
      typeof o.maxCompetition === "number"
        ? o.maxCompetition
        : DEFAULT_RUBRIC.maxCompetition,
    rejectDeclining:
      typeof o.rejectDeclining === "boolean"
        ? o.rejectDeclining
        : DEFAULT_RUBRIC.rejectDeclining,
  };
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
    rubricConfig?: RubricConfig;
  } = {},
) {
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
    });
    const rubricResult = evaluateRubric(
      {
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

export { DEFAULT_RUBRIC };
