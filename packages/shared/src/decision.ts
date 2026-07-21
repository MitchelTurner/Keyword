import type { BuyerType } from "./schemas";
import { BUYER_TYPE_WEIGHTS } from "./scoring";
import type { TrendDirection } from "./trend";

export type DemandBreakdown = {
  volumeFactor: number;
  cpcFactor: number;
  competitionFactor: number;
  buyerWeight: number;
  demandScore: number;
  /** Human-readable contribution lines for the UI. */
  drivers: string[];
};

export type RubricConfig = {
  minMonthlyFloor: number;
  minVolume: number;
  minPain: number;
  maxCompetition: number;
  preferredBuyers: BuyerType[];
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
  minMonthlyFloor: 49,
  minVolume: 500,
  minPain: 3,
  maxCompetition: 0.85,
  preferredBuyers: ["government", "enterprise", "SMB"],
  rejectDeclining: true,
};

export function mergeBuyerWeights(
  override?: Partial<Record<BuyerType, number>> | null,
): Record<BuyerType, number> {
  return {
    ...BUYER_TYPE_WEIGHTS,
    ...(override ?? {}),
  };
}

export function explainDemandScore(input: {
  totalVolume: number;
  avgCpc: number;
  avgCompetition: number;
  buyerType: BuyerType | string;
  buyerWeights?: Partial<Record<BuyerType, number>> | null;
}): DemandBreakdown {
  const weights = mergeBuyerWeights(input.buyerWeights);
  const buyerWeight = weights[input.buyerType as BuyerType] ?? 1;
  const volumeFactor = Math.log10(input.totalVolume + 1);
  const cpcFactor = input.avgCpc;
  const competitionFactor = 1 + input.avgCompetition;
  const demandScore = volumeFactor * cpcFactor * competitionFactor * buyerWeight;

  const drivers: string[] = [];
  if (volumeFactor >= 3) drivers.push("Strong search volume lifts the log factor");
  else if (volumeFactor < 2) drivers.push("Low volume caps upside");

  if (cpcFactor >= 10) drivers.push("High CPC signals commercial intent / pain");
  else if (cpcFactor < 2) drivers.push("Low CPC weakens pricing power signal");

  if (input.avgCompetition >= 0.7)
    drivers.push("High competition — crowded auction");
  else if (input.avgCompetition <= 0.35)
    drivers.push("Lower competition — room to win traffic");

  if (buyerWeight >= 1.1)
    drivers.push(`Buyer type ${input.buyerType} matches sales strengths`);
  else if (buyerWeight < 1)
    drivers.push(`Buyer type ${input.buyerType} is down-weighted`);

  if (!drivers.length) drivers.push("Balanced factors — no single dominant driver");

  return {
    volumeFactor: round3(volumeFactor),
    cpcFactor: round3(cpcFactor),
    competitionFactor: round3(competitionFactor),
    buyerWeight: round3(buyerWeight),
    demandScore: round3(demandScore),
    drivers,
  };
}

export function evaluateRubric(
  input: {
    buyerType: string;
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
      id: "buyer",
      label: "Preferred buyer type",
      pass: config.preferredBuyers.includes(input.buyerType as BuyerType),
      detail: `${input.buyerType} · prefer ${config.preferredBuyers.join(", ")}`,
    },
    {
      id: "floor",
      label: "Monthly price floor",
      pass: input.monthlyPriceFloor >= config.minMonthlyFloor,
      detail: `$${input.monthlyPriceFloor.toFixed(0)} vs min $${config.minMonthlyFloor}`,
    },
    {
      id: "volume",
      label: "Search volume",
      pass: input.totalVolume >= config.minVolume,
      detail: `${input.totalVolume} vs min ${config.minVolume}`,
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
      detail: `${input.avgCompetition.toFixed(2)} vs max ${config.maxCompetition}`,
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
  if (input.buyerType === "consumer" || input.buyerType === "prosumer") {
    nextStep = "Validate whether you want this buyer segment; otherwise pass.";
  } else if (input.trendDirection === "declining") {
    nextStep = "Check seasonality / SERP before investing — demand is cooling.";
  } else if (input.monthlyPriceFloor < 49) {
    nextStep = "Pressure-test willingness to pay; floor may be too low for sales-led.";
  } else {
    nextStep = "Pin it, skim top keywords, then spot-check SERPs for software intent.";
  }

  return { summary, whyRanks, nextStep };
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}
