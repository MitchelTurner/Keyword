import type { TrendDirection } from "./trend";

export type DemandBreakdown = {
  volumeFactor: number;
  cpcFactor: number;
  competitionFactor: number;
  demandScore: number;
  /** Human-readable contribution lines for the UI. */
  drivers: string[];
};

export type RubricConfig = {
  minMonthlyFloor: number;
  minVolume: number;
  minPain: number;
  maxCompetition: number;
  rejectDeclining: boolean;
};

export type RubricCheck = {
  id: string;
  label: string;
  pass: boolean;
  detail: string;
};

export type RubricResult = {
  pass: boolean;
  score: number; // 0..1 fraction of checks passed
  checks: RubricCheck[];
};

export type BuildBriefInput = {
  productDescription: string;
  buyerType: string;
  intent: string;
  painSeverity: number;
  totalVolume: number;
  avgCpc: number;
  avgCompetition: number;
  monthlyPriceFloor: number;
  demandScore: number;
  trendDirection: TrendDirection;
  changePct: number | null;
  nicheMedianDemand: number;
  rank: number;
  nicheOpportunityCount: number;
};

export type BuildBrief = {
  summary: string;
  whyRanks: string;
  nextStep: string;
};

export const DEFAULT_RUBRIC: RubricConfig = {
  // Softer floor: CPC-implied floors understate management SaaS WTP.
  minMonthlyFloor: 19,
  minVolume: 500,
  minPain: 3,
  maxCompetition: 0.75,
  rejectDeclining: true,
};

export function explainDemandScore(input: {
  totalVolume: number;
  avgCpc: number;
  avgCompetition: number;
}): DemandBreakdown {
  const volumeFactor = Math.log10(input.totalVolume + 1);
  // Soft commercial signal — aligned with scoreOpportunity (not raw CPC).
  const cpcFactor = 0.9 + Math.min(0.4, Math.log10(1 + input.avgCpc) * 0.3);
  const competitionFactor =
    1.05 - Math.min(1, Math.max(0, input.avgCompetition));
  const demandScore = volumeFactor * competitionFactor * cpcFactor;

  const drivers: string[] = [];
  if (volumeFactor >= 3.5)
    drivers.push("Strong search volume — primary demand driver");
  else if (volumeFactor < 2.5) drivers.push("Low volume caps upside");

  if (input.avgCompetition <= 0.35)
    drivers.push("Lower ads competition — room to win traffic");
  else if (input.avgCompetition >= 0.7)
    drivers.push("High ads competition — crowded auction");

  if (input.avgCpc >= 5)
    drivers.push("CPC hints commercial intent (soft signal only)");
  else if (input.avgCpc > 0 && input.avgCpc <= 1)
    drivers.push("Low CPC — fine for management SaaS if organic is soft");

  if (!drivers.length) drivers.push("Balanced factors — no single dominant driver");

  return {
    volumeFactor: round3(volumeFactor),
    cpcFactor: round3(cpcFactor),
    competitionFactor: round3(competitionFactor),
    demandScore: round3(demandScore),
    drivers,
  };
}

export function evaluateRubric(
  input: {
    monthlyPriceFloor: number;
    totalVolume: number;
    painSeverity: number;
    avgCompetition: number;
    trendDirection: TrendDirection;
  },
  config: RubricConfig = DEFAULT_RUBRIC,
): RubricResult {
  const checks: RubricCheck[] = [
    {
      id: "floor",
      label: "Monthly price floor",
      pass: input.monthlyPriceFloor >= config.minMonthlyFloor,
      detail: `$${input.monthlyPriceFloor.toFixed(0)} vs min $${config.minMonthlyFloor}`,
    },
    {
      id: "volume",
      label: "Theme search volume",
      pass: input.totalVolume >= config.minVolume,
      detail: `${Math.round(input.totalVolume).toLocaleString()} vs min ${config.minVolume.toLocaleString()}`,
    },
    {
      id: "pain",
      label: "Pain severity",
      pass: input.painSeverity >= config.minPain,
      detail: `${input.painSeverity}/5 vs min ${config.minPain}`,
    },
    {
      id: "competition",
      label: "Competition ceiling",
      pass: input.avgCompetition <= config.maxCompetition,
      detail: `${input.avgCompetition.toFixed(2)} vs max ${config.maxCompetition.toFixed(2)}`,
    },
    {
      id: "trend",
      label: "Trend not declining",
      pass: !config.rejectDeclining || input.trendDirection !== "declining",
      detail:
        input.trendDirection === "declining" && config.rejectDeclining
          ? "Declining trend fails rubric"
          : `Trend: ${input.trendDirection}`,
    },
  ];

  const passed = checks.filter((c) => c.pass).length;
  return {
    pass: passed === checks.length,
    score: passed / checks.length,
    checks,
  };
}

export function buildBrief(input: BuildBriefInput): BuildBrief {
  const trendBit =
    input.trendDirection === "unknown"
      ? "Trend unclear"
      : input.changePct == null
        ? `Trend ${input.trendDirection}`
        : `Trend ${input.trendDirection} (${input.changePct > 0 ? "+" : ""}${input.changePct.toFixed(0)}%)`;

  const summary = `${input.productDescription} for ${input.buyerType} (${input.intent}). ~${Math.round(input.totalVolume).toLocaleString()}/mo searches, $${input.avgCpc.toFixed(2)} CPC, pain ${input.painSeverity}/5. ${trendBit}. Suggested floor ~$${input.monthlyPriceFloor.toFixed(0)}/mo.`;

  const vsMedian =
    input.nicheMedianDemand > 0
      ? input.demandScore / input.nicheMedianDemand
      : 1;
  let whyRanks: string;
  if (input.nicheOpportunityCount <= 1) {
    whyRanks = "Only scored opportunity in this niche so far.";
  } else if (input.rank === 1) {
    whyRanks = `Ranks #1 of ${input.nicheOpportunityCount} — ${vsMedian.toFixed(1)}× niche median demand.`;
  } else if (vsMedian >= 1.15) {
    whyRanks = `Ranks #${input.rank} of ${input.nicheOpportunityCount} — ${vsMedian.toFixed(1)}× niche median demand.`;
  } else if (vsMedian < 0.85) {
    whyRanks = `Ranks #${input.rank} of ${input.nicheOpportunityCount} — below niche median demand (${vsMedian.toFixed(1)}×).`;
  } else {
    whyRanks = `Ranks #${input.rank} of ${input.nicheOpportunityCount} — near niche median demand.`;
  }

  let nextStep: string;
  if (input.trendDirection === "declining") {
    nextStep = "Check seasonality / SERP before investing — demand is cooling.";
  } else if (input.avgCompetition >= 0.75) {
    nextStep =
      "Ads auction is crowded — need a soft organic SERP or sharper wedge.";
  } else if (input.monthlyPriceFloor < 19) {
    nextStep =
      "CPC floor is thin — validate SaaS WTP via TAM / buyer interviews.";
  } else {
    nextStep =
      "Check organic SERP softness, then promote to a tracked site if Build.";
  }

  return { summary, whyRanks, nextStep };
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}
