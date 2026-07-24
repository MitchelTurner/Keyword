import {
  DEFAULT_RUBRIC,
  annotateSerpSnapshot,
  buildBrief,
  buildVerdict,
  captureDecisionSnapshot,
  diffDecisionSnapshots,
  evaluateRubric,
  explainDemandScore,
  type DecisionDiff,
  type DecisionSnapshot,
  type FactorWeightOverrides,
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

export function parseSerpSnapshot(
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
    const organicEtv =
      typeof o.organicEtv === "number" && !Number.isNaN(o.organicEtv)
        ? o.organicEtv
        : null;
    items.push({
      rank,
      domain: domain || "unknown",
      title: title || domain || "untitled",
      organicEtv,
      pageType:
        typeof o.pageType === "string"
          ? (o.pageType as SerpSnapshotItem["pageType"])
          : undefined,
    });
  }
  return items.length ? annotateSerpSnapshot(items) : null;
}

export function parseDecisionSnapshot(
  raw: Prisma.JsonValue | null | undefined,
): DecisionSnapshot | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.verdict !== "string" || typeof o.score !== "number") return null;
  return {
    verdict: o.verdict as DecisionSnapshot["verdict"],
    score: o.score,
    demandScore: typeof o.demandScore === "number" ? o.demandScore : 0,
    totalVolume: typeof o.totalVolume === "number" ? o.totalVolume : 0,
    avgCompetition:
      typeof o.avgCompetition === "number" ? o.avgCompetition : 0,
    organicSoftness:
      typeof o.organicSoftness === "number" ? o.organicSoftness : null,
    keywordDifficulty:
      typeof o.keywordDifficulty === "number" ? o.keywordDifficulty : null,
    priorityScore: typeof o.priorityScore === "number" ? o.priorityScore : 0,
    capturedAt:
      typeof o.capturedAt === "string"
        ? o.capturedAt
        : new Date().toISOString(),
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
    monetizationModel?: string | null;
    serpSnapshot?: Prisma.JsonValue | null;
    organicSoftness?: number | null;
    keywordDifficulty?: number | null;
    previousSnapshot?: Prisma.JsonValue | null;
    decisionSnapshot?: Prisma.JsonValue | null;
  },
>(
  opportunities: T[],
  opts: {
    rubricConfig?: RubricConfig;
    weightOverrides?: FactorWeightOverrides;
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

  const withDecision = opportunities.map((o) => {
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
      intent: o.intent,
      serp,
      organicSoftness: o.organicSoftness,
      keywordDifficulty: o.keywordDifficulty,
      weightOverrides: opts.weightOverrides,
    });

    const currentSnap = captureDecisionSnapshot({
      verdict: verdict.verdict,
      score: verdict.score,
      demandScore: o.demandScore,
      totalVolume: o.totalVolume,
      avgCompetition: o.avgCompetition,
      organicSoftness: verdict.organicSoftness,
      keywordDifficulty: o.keywordDifficulty ?? null,
      priorityScore: verdict.priorityScore,
    });
    // Prefer stored previousSnapshot; fall back to older decisionSnapshot for
    // niches that haven't been re-scored since this feature landed.
    const previous =
      parseDecisionSnapshot(o.previousSnapshot) ??
      parseDecisionSnapshot(o.decisionSnapshot);
    const diff: DecisionDiff | null = previous
      ? diffDecisionSnapshots(previous, currentSnap)
      : null;

    return {
      ...o,
      serp,
      decision: {
        rank,
        breakdown,
        rubric: rubricResult,
        brief,
        verdict,
        diff,
        snapshot: currentSnap,
      },
    };
  });

  // Cross-list priority rank (build this before that).
  const byPriority = [...withDecision].sort(
    (a, b) =>
      b.decision.verdict.priorityScore - a.decision.verdict.priorityScore,
  );
  const priorityRankById = new Map(byPriority.map((o, i) => [o.id, i + 1]));

  return withDecision.map((o) => ({
    ...o,
    decision: {
      ...o.decision,
      priorityRank: priorityRankById.get(o.id) ?? withDecision.length,
    },
  }));
}

export { DEFAULT_RUBRIC };
