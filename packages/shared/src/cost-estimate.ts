/**
 * Pre-run cost heuristics (USD). Tuned for DataForSEO live endpoints + Claude Sonnet.
 * Not a quote — a planning range for the operator before clicking Run.
 */
export type RunCostEstimate = {
  assumedKeywords: number;
  low: number;
  high: number;
  breakdown: {
    expandLow: number;
    expandHigh: number;
    enrichLow: number;
    enrichHigh: number;
    classifyLow: number;
    classifyHigh: number;
  };
  note: string;
};

/** Typical keyword_ideas yield for a single seed (live mode). */
const ASSUMED_KEYWORDS = 400;

export function estimateRunCost(
  assumedKeywords: number = ASSUMED_KEYWORDS,
): RunCostEstimate {
  const kw = Math.max(50, Math.min(assumedKeywords, 2000));

  const expandLow = 0.01;
  const expandHigh = 0.05;

  // search_volume live ~$0.075 / 1000 keywords
  const enrichUnit = 0.075;
  const enrichLow = (kw * 0.5 * enrichUnit) / 1000;
  const enrichHigh = (kw * enrichUnit) / 1000;

  // ~1 classify call per 50 keywords + 1 merge; rough Sonnet token cost
  const chunks = Math.ceil(kw / 50);
  const classifyLow = chunks * 0.015 + 0.01;
  const classifyHigh = chunks * 0.04 + 0.03;

  const low = expandLow + enrichLow + classifyLow;
  const high = expandHigh + enrichHigh + classifyHigh;

  return {
    assumedKeywords: kw,
    low: round4(low),
    high: round4(high),
    breakdown: {
      expandLow: round4(expandLow),
      expandHigh: round4(expandHigh),
      enrichLow: round4(enrichLow),
      enrichHigh: round4(enrichHigh),
      classifyLow: round4(classifyLow),
      classifyHigh: round4(classifyHigh),
    },
    note: "Enrich cost drops when terms are already cached from prior niches. Classify cost is Claude-only and still applies on re-classify.",
  };
}

function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}
