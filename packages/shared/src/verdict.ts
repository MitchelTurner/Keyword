import type { TrendDirection } from "./trend";

export type VerdictLabel = "build" | "watch" | "kill";

export type SerpSnapshotItem = {
  rank: number;
  domain: string;
  title: string;
  /** Inferred page type for organic softness. */
  pageType?: SerpPageType;
};

export type SerpPageType =
  | "ugc"
  | "directory"
  | "content"
  | "marketplace"
  | "saas"
  | "authority"
  | "other";

export type VerdictFactor = {
  id: string;
  label: string;
  /** 0..1 contribution quality (higher is better for building). */
  score: number;
  weight: number;
  detail: string;
};

export type TamEstimate = {
  /** Theme monthly search volume. */
  monthlySearches: number;
  /** Rough paid-search market: volume × CPC. */
  adMarketUsd: number;
  /** Soft SaaS ARR ceiling hint from volume × assumed conversion × floor. */
  saasArrHintUsd: number;
  /** 0..1 TAM quality for verdict weighting. */
  score: number;
  summary: string;
};

export type VerdictResult = {
  verdict: VerdictLabel;
  /** 0..100 composite decision score. */
  score: number;
  factors: VerdictFactor[];
  rationale: string;
  tam: TamEstimate;
  organicSoftness: number | null;
};

const UGC_HOSTS =
  /\b(reddit\.com|quora\.com|stackoverflow\.com|stackexchange\.com|medium\.com|dev\.to|facebook\.com|linkedin\.com\/pulse|youtube\.com|tiktok\.com)\b/i;
const DIRECTORY_HOSTS =
  /\b(g2\.com|capterra\.com|getapp\.com|producthunt\.com|alternativeto\.net|saasworthy\.com|softwareadvice\.com|trustpilot\.com|yelp\.com|clutch\.co)\b/i;
const MARKETPLACE_HOSTS =
  /\b(amazon\.com|ebay\.com|etsy\.com|shopify\.com|appsumo\.com)\b/i;
const AUTHORITY_HOSTS =
  /\b(wikipedia\.org|gov|edu|nih\.gov|who\.int|nytimes\.com|forbes\.com|wsj\.com|harvard\.edu|stanford\.edu)\b/i;
const CONTENT_HINT =
  /\b(blog|guide|how[- ]to|what is|wiki|tutorial|best |vs |review)/i;

export function classifySerpPageType(
  domain: string,
  title: string,
): SerpPageType {
  const host = domain.toLowerCase();
  const text = `${domain} ${title}`;
  if (UGC_HOSTS.test(host)) return "ugc";
  if (DIRECTORY_HOSTS.test(host)) return "directory";
  if (MARKETPLACE_HOSTS.test(host)) return "marketplace";
  if (AUTHORITY_HOSTS.test(host) || /\.(gov|edu)(\.|$)/i.test(host)) {
    return "authority";
  }
  if (CONTENT_HINT.test(text)) return "content";
  // Default: treat branded/product domains as SaaS-like competitors.
  if (host.split(".").length >= 2 && !CONTENT_HINT.test(title)) return "saas";
  return "other";
}

/** Softness 0..1 — higher means easier organic entry. */
export function organicSoftnessScore(
  items: Array<{ domain: string; title: string }>,
): { score: number; detail: string } {
  if (!items.length) {
    return { score: 0.45, detail: "No SERP snapshot — neutral softness" };
  }

  const typed = items.map((i) => classifySerpPageType(i.domain, i.title));
  const weights: Record<SerpPageType, number> = {
    ugc: 1,
    directory: 0.85,
    content: 0.7,
    marketplace: 0.45,
    other: 0.4,
    saas: 0.25,
    authority: 0.1,
  };

  let sum = 0;
  for (const t of typed) sum += weights[t];
  const score = Math.min(1, Math.max(0, sum / typed.length));

  const softCount = typed.filter((t) =>
    t === "ugc" || t === "directory" || t === "content",
  ).length;
  const hardCount = typed.filter((t) => t === "saas" || t === "authority").length;

  let detail: string;
  if (score >= 0.65) {
    detail = `Soft SERP — ${softCount}/${typed.length} UGC/directory/content results`;
  } else if (score <= 0.35) {
    detail = `Hard SERP — ${hardCount}/${typed.length} SaaS/authority incumbents`;
  } else {
    detail = `Mixed SERP — softness ${(score * 100).toFixed(0)}%`;
  }

  return { score: round3(score), detail };
}

export function estimateTam(input: {
  totalVolume: number;
  avgCpc: number;
  monthlyPriceFloor: number;
  monetizationModel?: string | null;
}): TamEstimate {
  const monthlySearches = Math.max(0, input.totalVolume);
  const adMarketUsd = monthlySearches * Math.max(0, input.avgCpc);
  // Assume a thin organic capture + paid assist converts at ~0.5% of searchers,
  // at the suggested monthly floor — order-of-magnitude SaaS ARR hint only.
  const assumedPaying = monthlySearches * 0.005;
  const saasArrHintUsd = assumedPaying * Math.max(0, input.monthlyPriceFloor) * 12;

  const model = (input.monetizationModel ?? "").toLowerCase();
  const modelBoost =
    /saas|subscription|management|platform|b2b/.test(model)
      ? 0.1
      : /affiliate|ads|lead/.test(model)
        ? 0.05
        : 0;

  // Volume + ad market + floor form a soft TAM quality score.
  const volScore = Math.min(1, Math.log10(monthlySearches + 1) / 5.5);
  const adScore = Math.min(1, Math.log10(adMarketUsd + 1) / 6);
  const floorScore = Math.min(1, input.monthlyPriceFloor / 80);
  const score = Math.min(1, volScore * 0.55 + adScore * 0.2 + floorScore * 0.15 + modelBoost);

  const summary =
    monthlySearches >= 5000
      ? `~${Math.round(monthlySearches).toLocaleString()}/mo searches · ~$${Math.round(adMarketUsd).toLocaleString()} ad market · SaaS ARR hint ~$${Math.round(saasArrHintUsd).toLocaleString()}`
      : `Smaller TAM — ~${Math.round(monthlySearches).toLocaleString()}/mo searches; validate willingness to pay before building.`;

  return {
    monthlySearches,
    adMarketUsd: round2(adMarketUsd),
    saasArrHintUsd: round2(saasArrHintUsd),
    score: round3(score),
    summary,
  };
}

export function buildVerdict(input: {
  totalVolume: number;
  avgCpc: number;
  avgCompetition: number;
  monthlyPriceFloor: number;
  demandScore: number;
  painSeverity: number;
  trendDirection: TrendDirection;
  rubricPass: boolean;
  rubricScore: number;
  monetizationModel?: string | null;
  serp?: Array<{ domain: string; title: string }> | null;
  organicSoftness?: number | null;
}): VerdictResult {
  const tam = estimateTam({
    totalVolume: input.totalVolume,
    avgCpc: input.avgCpc,
    monthlyPriceFloor: input.monthlyPriceFloor,
    monetizationModel: input.monetizationModel,
  });

  const softness =
    input.organicSoftness != null
      ? {
          score: Math.min(1, Math.max(0, input.organicSoftness)),
          detail:
            input.organicSoftness >= 0.65
              ? "Stored organic softness is high"
              : input.organicSoftness <= 0.35
                ? "Stored organic softness is low"
                : "Stored organic softness is mixed",
        }
      : organicSoftnessScore(input.serp ?? []);

  // Normalize demand: log-scale typical scores after scoring rewrite (~1..8).
  const demandNorm = Math.min(1, Math.max(0, input.demandScore / 6));
  const competitionNorm = 1 - Math.min(1, Math.max(0, input.avgCompetition));
  const painNorm = Math.min(1, Math.max(0, (input.painSeverity - 1) / 4));
  const trendNorm =
    input.trendDirection === "rising"
      ? 1
      : input.trendDirection === "flat"
        ? 0.7
        : input.trendDirection === "declining"
          ? 0.15
          : 0.5;

  const factors: VerdictFactor[] = [
    {
      id: "demand",
      label: "Demand (volume × winnability)",
      score: demandNorm,
      weight: 0.28,
      detail: `Demand score ${input.demandScore.toFixed(2)}`,
    },
    {
      id: "organic",
      label: "Organic softness",
      score: softness.score,
      weight: 0.22,
      detail: softness.detail,
    },
    {
      id: "competition",
      label: "Ads competition",
      score: competitionNorm,
      weight: 0.14,
      detail: `Ads comp ${(input.avgCompetition * 100).toFixed(0)}%`,
    },
    {
      id: "tam",
      label: "TAM / money model",
      score: tam.score,
      weight: 0.16,
      detail: tam.summary,
    },
    {
      id: "pain",
      label: "Pain severity",
      score: painNorm,
      weight: 0.08,
      detail: `${input.painSeverity}/5`,
    },
    {
      id: "trend",
      label: "Trend",
      score: trendNorm,
      weight: 0.07,
      detail: `Trend: ${input.trendDirection}`,
    },
    {
      id: "rubric",
      label: "Rubric",
      score: input.rubricScore,
      weight: 0.05,
      detail: input.rubricPass
        ? "All rubric checks passed"
        : `Rubric ${(input.rubricScore * 100).toFixed(0)}%`,
    },
  ];

  const weighted =
    factors.reduce((sum, f) => sum + f.score * f.weight, 0) /
    factors.reduce((sum, f) => sum + f.weight, 0);
  let score = Math.round(weighted * 1000) / 10; // 0..100 one decimal

  // Soft SERP + solid volume can override a weak CPC floor for Build.
  const softOverride =
    softness.score >= 0.6 &&
    input.totalVolume >= 2000 &&
    input.avgCompetition <= 0.65 &&
    input.trendDirection !== "declining";

  let verdict: VerdictLabel;
  if (score >= 68 && (input.rubricPass || softOverride) && input.trendDirection !== "declining") {
    verdict = "build";
  } else if (score >= 42) {
    verdict = "watch";
  } else {
    verdict = "kill";
  }

  // Cap Build when SERP is clearly dominated by authority/SaaS.
  if (verdict === "build" && softness.score < 0.28 && input.avgCompetition >= 0.75) {
    verdict = "watch";
    score = Math.min(score, 64);
  }

  const rationale =
    verdict === "build"
      ? softOverride && !input.rubricPass
        ? "Build — soft organic SERP and volume outweigh a weak CPC floor."
        : "Build — demand, winnability, and money model clear the bar."
      : verdict === "watch"
        ? "Watch — promising signals, but validate SERP / willingness to pay first."
        : "Kill — weak demand, hard SERP, or cooling trend; park it.";

  return {
    verdict,
    score,
    factors: factors.map((f) => ({ ...f, score: round3(f.score) })),
    rationale,
    tam,
    organicSoftness: input.serp?.length || input.organicSoftness != null
      ? softness.score
      : null,
  };
}

export function annotateSerpSnapshot(
  items: Array<{ rank: number; domain: string; title: string }>,
): SerpSnapshotItem[] {
  return items.map((i) => ({
    ...i,
    pageType: classifySerpPageType(i.domain, i.title),
  }));
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
