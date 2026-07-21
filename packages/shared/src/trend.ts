export type TrendPoint = {
  year: number;
  month: number;
  search_volume?: number | null;
};

export type TrendDirection = "rising" | "flat" | "declining" | "unknown";

export type TrendAnalysis = {
  direction: TrendDirection;
  /** Rough momentum in [-1, 1]: positive = rising. */
  score: number;
  /** Percent change from first third to last third of the series. */
  changePct: number | null;
  series: Array<{ year: number; month: number; search_volume: number }>;
};

function monthKey(year: number, month: number) {
  return year * 12 + month;
}

/** Merge keyword-level monthly series into one volume series (sum by month). */
export function aggregateMonthlyTrends(
  trends: Array<TrendPoint[] | null | undefined>,
): Array<{ year: number; month: number; search_volume: number }> {
  const byMonth = new Map<number, { year: number; month: number; search_volume: number }>();

  for (const trend of trends) {
    if (!trend?.length) continue;
    for (const point of trend) {
      const volume = point.search_volume ?? 0;
      if (!point.year || !point.month) continue;
      const key = monthKey(point.year, point.month);
      const existing = byMonth.get(key);
      if (existing) {
        existing.search_volume += volume;
      } else {
        byMonth.set(key, {
          year: point.year,
          month: point.month,
          search_volume: volume,
        });
      }
    }
  }

  return [...byMonth.values()].sort(
    (a, b) => monthKey(a.year, a.month) - monthKey(b.year, b.month),
  );
}

/**
 * Classify demand momentum from a monthly volume series.
 * Uses early-third vs late-third averages to dampen single-month noise.
 */
export function analyzeTrend(
  points: TrendPoint[] | null | undefined,
): TrendAnalysis {
  const series = aggregateMonthlyTrends([points ?? []]);
  if (series.length < 3) {
    return { direction: "unknown", score: 0, changePct: null, series };
  }

  const third = Math.max(1, Math.floor(series.length / 3));
  const early = series.slice(0, third);
  const late = series.slice(-third);

  const earlyAvg =
    early.reduce((s, p) => s + p.search_volume, 0) / early.length;
  const lateAvg = late.reduce((s, p) => s + p.search_volume, 0) / late.length;

  const baseline = Math.max(earlyAvg, 1);
  const changePct = ((lateAvg - earlyAvg) / baseline) * 100;

  // Map ~±50% change into roughly [-1, 1]
  const score = Math.max(-1, Math.min(1, changePct / 50));

  let direction: TrendDirection = "flat";
  if (changePct >= 15) direction = "rising";
  else if (changePct <= -15) direction = "declining";

  return {
    direction,
    score: Math.round(score * 100) / 100,
    changePct: Math.round(changePct * 10) / 10,
    series,
  };
}

export function analyzeOpportunityTrend(
  keywordTrends: Array<TrendPoint[] | null | undefined>,
): TrendAnalysis {
  const series = aggregateMonthlyTrends(keywordTrends);
  return analyzeTrend(series);
}
