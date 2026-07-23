import {
  DEFAULT_RUBRIC,
  annotateSerpSnapshot,
  buildBrief,
  buildVerdict,
  evaluateRubric,
  explainDemandScore,
  type RubricConfig,
  type SerpSnapshotItem,
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

function parseSerpSnapshot(
  raw: Prisma.JsonValue | null | undefined,
): SerpSnapshotItem[] | null {
  if (!raw || !Array.isArray(raw)) return null;
  const items: SerpSnapshotItem[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const o = row as Record<string, unknown>;
    const rank = typeof o.rank === "number" ? o.rank : items.length + 1;
    const domain = typeof o.domain === "string" ? o.domain : "";
    const title = typeof o.title === "string" ? o.title : "";
    if (!domain && !title) continue;
    items.push({
      rank,
      domain: domain || "unknown",
      title: title || domain || "untitled",
      pageType:
        typeof o.pageType === "string"
          ? (o.pageType as SerpSnapshotItem["pageType"])
          : undefined,
    });
  }
  return items.length ? annotateSerpSnapshot(items) : null;
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
    monetizationModel?: string | null;
    serpSnapshot?: Prisma.JsonValue | null;
    organicSoftness?: number | null;
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

    const serp = parseSerpSnapshot(o.serpSnapshot);
    const verdict = buildVerdict({
      totalVolume: o.totalVolume,
      avgCpc: o.avgCpc,
      avgCompetition: o.avgCompetition,
      monthlyPriceFloor: o.monthlyPriceFloor,
      demandScore: o.demandScore,
      painSeverity: o.painSeverity,
      trendDirection: o.trend.direction,
      rubricPass: rubricResult.pass,
      rubricScore: rubricResult.score,
      monetizationModel: o.monetizationModel,
      serp,
      organicSoftness: o.organicSoftness,
    });

    return {
      ...o,
      serp: serp,
      decision: {
        rank,
        breakdown,
        rubric: rubricResult,
        brief,
        verdict,
      },
    };
  });
}

export { DEFAULT_RUBRIC };
