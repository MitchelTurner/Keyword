import type { TrendDirection } from "./trend";

export type VerdictLabel = "build" | "watch" | "kill";

export type SerpSnapshotItem = {
  rank: number;
  domain: string;
  title: string;
  /** Inferred page type for organic softness. */
  pageType?: SerpPageType;
  /** Estimated monthly organic traffic (etv) for this domain, from Labs bulk traffic estimation. */
  organicEtv?: number | null;
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

export type Beatability = "beatable" | "contested" | "owned";

export type CompetitorIntel = {
  beatability: Beatability;
  saasShare: number;
  contentShare: number;
  ugcShare: number;
  /** Median organic ETV of ranked domains (null when no traffic data). */
  medianIncumbentEtv: number | null;
  topIncumbents: Array<{
    domain: string;
    pageType: SerpPageType;
    organicEtv: number | null;
  }>;
  summary: string;
};

export type ContentGap = {
  /** 0..1 — higher means commercial intent facing content-heavy SERP (product wedge). */
  score: number;
  detail: string;
};

export type DecisionSnapshot = {
  verdict: VerdictLabel;
  score: number;
  demandScore: number;
  totalVolume: number;
  avgCompetition: number;
  organicSoftness: number | null;
  keywordDifficulty: number | null;
  priorityScore: number;
  capturedAt: string;
};

export type DecisionDiff = {
  verdictChanged: boolean;
  fromVerdict: VerdictLabel | null;
  toVerdict: VerdictLabel;
  scoreDelta: number;
  volumeDelta: number;
  softnessDelta: number | null;
  difficultyDelta: number | null;
  priorityDelta: number;
  summary: string;
};

export type OpportunityOutcome =
  | "none"
  | "built"
  | "ranked"
  | "abandoned"
  | "revenue_low"
  | "revenue_mid"
  | "revenue_high";

export type FactorWeightOverrides = Partial<
  Record<
    | "demand"
    | "organic"
    | "competition"
    | "tam"
    | "pain"
    | "trend"
    | "rubric"
    | "contentGap"
    | "incumbents",
    number
  >
>;

export type VerdictResult = {
  verdict: VerdictLabel;
  /** 0..100 composite decision score. */
  score: number;
  /** Comparative priority for ranking Builds across niches. */
  priorityScore: number;
  factors: VerdictFactor[];
  rationale: string;
  tam: TamEstimate;
  organicSoftness: number | null;
  competitors: CompetitorIntel | null;
  contentGap: ContentGap | null;
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

const DEFAULT_WEIGHTS: Record<string, number> = {
  demand: 0.24,
  organic: 0.18,
  competition: 0.12,
  tam: 0.14,
  pain: 0.07,
  trend: 0.06,
  rubric: 0.04,
  contentGap: 0.08,
  incumbents: 0.07,
};

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

  const softCount = typed.filter(
    (t) => t === "ugc" || t === "directory" || t === "content",
  ).length;
  const hardCount = typed.filter(
    (t) => t === "saas" || t === "authority",
  ).length;

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

/**
 * Blend a real Labs keyword-difficulty score (0..100, authoritative) with the
 * page-type softness heuristic. Falls back to the heuristic alone when no
 * difficulty score is available.
 */
export function combineOrganicSignal(input: {
  softness: { score: number; detail: string };
  keywordDifficulty?: number | null;
}): { score: number; detail: string } {
  if (input.keywordDifficulty == null || Number.isNaN(input.keywordDifficulty)) {
    return input.softness;
  }
  const kd = Math.min(100, Math.max(0, input.keywordDifficulty));
  const difficultyNorm = 1 - kd / 100;
  const score = round3(difficultyNorm * 0.6 + input.softness.score * 0.4);
  const detail = `Keyword difficulty ${kd.toFixed(0)}/100 (Labs) · ${input.softness.detail}`;
  return { score, detail };
}

/**
 * Quantify SERP incumbents: page-type mix + estimated traffic → beatability.
 */
export function analyzeCompetitors(
  serp: Array<{
    domain: string;
    title: string;
    pageType?: SerpPageType;
    organicEtv?: number | null;
  }> | null | undefined,
): CompetitorIntel | null {
  if (!serp?.length) return null;

  const typed = serp.map((s) => ({
    domain: s.domain,
    pageType: s.pageType ?? classifySerpPageType(s.domain, s.title),
    organicEtv: s.organicEtv ?? null,
  }));
  const n = typed.length;
  const saasShare = typed.filter((t) => t.pageType === "saas").length / n;
  const contentShare =
    typed.filter((t) => t.pageType === "content" || t.pageType === "ugc")
      .length / n;
  const ugcShare = typed.filter((t) => t.pageType === "ugc").length / n;

  const etvs = typed
    .map((t) => t.organicEtv)
    .filter((v): v is number => v != null && !Number.isNaN(v) && v >= 0)
    .sort((a, b) => a - b);
  const medianIncumbentEtv =
    etvs.length === 0
      ? null
      : etvs.length % 2 === 1
        ? etvs[(etvs.length - 1) / 2]!
        : (etvs[etvs.length / 2 - 1]! + etvs[etvs.length / 2]!) / 2;

  const topIncumbents = [...typed]
    .sort((a, b) => (b.organicEtv ?? 0) - (a.organicEtv ?? 0))
    .slice(0, 3)
    .map((t) => ({
      domain: t.domain,
      pageType: t.pageType,
      organicEtv: t.organicEtv,
    }));

  let beatability: Beatability;
  if (saasShare >= 0.6 || (medianIncumbentEtv != null && medianIncumbentEtv >= 500_000)) {
    beatability = "owned";
  } else if (
    saasShare <= 0.3 &&
    (contentShare >= 0.4 || ugcShare >= 0.2) &&
    (medianIncumbentEtv == null || medianIncumbentEtv < 50_000)
  ) {
    beatability = "beatable";
  } else {
    beatability = "contested";
  }

  const topBit = topIncumbents
    .slice(0, 2)
    .map((t) =>
      t.organicEtv != null
        ? `${t.domain} (~${Math.round(t.organicEtv).toLocaleString()}/mo)`
        : t.domain,
    )
    .join(", ");

  const summary =
    beatability === "beatable"
      ? `Beatable via UGC/long-tail — ${Math.round(contentShare * 100)}% content/UGC; leaders: ${topBit || "n/a"}`
      : beatability === "owned"
        ? `Owned by large incumbents — ${Math.round(saasShare * 100)}% SaaS${medianIncumbentEtv != null ? `; median ~${Math.round(medianIncumbentEtv).toLocaleString()}/mo traffic` : ""}`
        : `Contested SERP — mix of SaaS (${Math.round(saasShare * 100)}%) and content (${Math.round(contentShare * 100)}%); leaders: ${topBit || "n/a"}`;

  return {
    beatability,
    saasShare: round3(saasShare),
    contentShare: round3(contentShare),
    ugcShare: round3(ugcShare),
    medianIncumbentEtv:
      medianIncumbentEtv == null ? null : round2(medianIncumbentEtv),
    topIncumbents,
    summary,
  };
}

/**
 * Commercial intent facing a content-heavy SERP = product wedge opportunity.
 */
export function contentGapScore(
  intent: string | null | undefined,
  serp: Array<{ domain: string; title: string; pageType?: SerpPageType }> | null | undefined,
): ContentGap | null {
  if (!serp?.length) return null;
  const typed = serp.map(
    (s) => s.pageType ?? classifySerpPageType(s.domain, s.title),
  );
  const softShare =
    typed.filter((t) => t === "content" || t === "ugc" || t === "directory")
      .length / typed.length;
  const commercial =
    intent === "transactional" || intent === "comparison";

  if (!commercial) {
    return {
      score: round3(softShare * 0.4),
      detail: `Intent ${intent ?? "unknown"} — content gap less actionable`,
    };
  }

  const score = round3(Math.min(1, softShare * 1.15));
  const detail =
    score >= 0.55
      ? `${intent} intent + ${Math.round(softShare * 100)}% soft SERP — product wedge`
      : `${intent} intent but SERP is product-heavy — sharper differentiation needed`;
  return { score, detail };
}

/**
 * Cross-niche priority: TAM × softness ÷ difficulty so Builds can be ordered.
 */
export function computePriorityScore(input: {
  tamScore: number;
  organicSoftness: number;
  keywordDifficulty?: number | null;
  contentGapScore?: number | null;
}): number {
  const kd =
    input.keywordDifficulty == null || Number.isNaN(input.keywordDifficulty)
      ? 50
      : Math.min(100, Math.max(0, input.keywordDifficulty));
  const difficultyDenom = kd / 100 + 0.15;
  const gapBoost = 1 + (input.contentGapScore ?? 0) * 0.25;
  const raw =
    ((input.tamScore + 0.05) * (input.organicSoftness + 0.05) * gapBoost) /
    difficultyDenom;
  return round3(Math.min(10, raw * 4));
}

export function estimateTam(input: {
  totalVolume: number;
  avgCpc: number;
  monthlyPriceFloor: number;
  monetizationModel?: string | null;
}): TamEstimate {
  const monthlySearches = Math.max(0, input.totalVolume);
  const adMarketUsd = monthlySearches * Math.max(0, input.avgCpc);
  const assumedPaying = monthlySearches * 0.005;
  const saasArrHintUsd =
    assumedPaying * Math.max(0, input.monthlyPriceFloor) * 12;

  const model = (input.monetizationModel ?? "").toLowerCase();
  const modelBoost = /saas|subscription|management|platform|b2b/.test(model)
    ? 0.1
    : /affiliate|ads|lead/.test(model)
      ? 0.05
      : 0;

  const volScore = Math.min(1, Math.log10(monthlySearches + 1) / 5.5);
  const adScore = Math.min(1, Math.log10(adMarketUsd + 1) / 6);
  const floorScore = Math.min(1, input.monthlyPriceFloor / 80);
  const score = Math.min(
    1,
    volScore * 0.55 + adScore * 0.2 + floorScore * 0.15 + modelBoost,
  );

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

/**
 * Learn soft weight nudges from past outcomes so Build favors what worked.
 * Positive outcomes (ranked / revenue_*) boost organic+contentGap+tam;
 * abandoned outcomes boost organic+competition caution (raise those weights'
 * importance by nudging their contribution upward when soft/easy).
 */
export function deriveWeightOverrides(
  outcomes: Array<{ outcome: OpportunityOutcome; factors?: VerdictFactor[] }>,
): FactorWeightOverrides {
  const usable = outcomes.filter((o) => o.outcome !== "none");
  if (usable.length < 3) return {};

  const wins = usable.filter((o) =>
    ["ranked", "revenue_low", "revenue_mid", "revenue_high", "built"].includes(
      o.outcome,
    ),
  ).length;
  const losses = usable.filter((o) => o.outcome === "abandoned").length;
  const winRate = wins / usable.length;
  const lossRate = losses / usable.length;

  const overrides: FactorWeightOverrides = {};
  // When wins dominate, lean into organic softness + content gap + TAM.
  if (winRate >= 0.55) {
    overrides.organic = DEFAULT_WEIGHTS.organic! * 1.25;
    overrides.contentGap = DEFAULT_WEIGHTS.contentGap! * 1.3;
    overrides.tam = DEFAULT_WEIGHTS.tam! * 1.15;
  }
  // When abandonments dominate, demand volume alone wasn't enough — weight
  // organic/competition more so hard SERPs get killed earlier.
  if (lossRate >= 0.4) {
    overrides.organic = Math.max(
      overrides.organic ?? DEFAULT_WEIGHTS.organic!,
      DEFAULT_WEIGHTS.organic! * 1.35,
    );
    overrides.competition = DEFAULT_WEIGHTS.competition! * 1.25;
  }
  return overrides;
}

export function captureDecisionSnapshot(input: {
  verdict: VerdictLabel;
  score: number;
  demandScore: number;
  totalVolume: number;
  avgCompetition: number;
  organicSoftness: number | null;
  keywordDifficulty: number | null;
  priorityScore: number;
  capturedAt?: string;
}): DecisionSnapshot {
  return {
    verdict: input.verdict,
    score: input.score,
    demandScore: round3(input.demandScore),
    totalVolume: input.totalVolume,
    avgCompetition: round3(input.avgCompetition),
    organicSoftness: input.organicSoftness,
    keywordDifficulty: input.keywordDifficulty,
    priorityScore: input.priorityScore,
    capturedAt: input.capturedAt ?? new Date().toISOString(),
  };
}

export function diffDecisionSnapshots(
  previous: DecisionSnapshot | null | undefined,
  current: DecisionSnapshot,
): DecisionDiff | null {
  if (!previous) return null;
  const scoreDelta = round3(current.score - previous.score);
  const volumeDelta = current.totalVolume - previous.totalVolume;
  const softnessDelta =
    current.organicSoftness != null && previous.organicSoftness != null
      ? round3(current.organicSoftness - previous.organicSoftness)
      : null;
  const difficultyDelta =
    current.keywordDifficulty != null && previous.keywordDifficulty != null
      ? round3(current.keywordDifficulty - previous.keywordDifficulty)
      : null;
  const priorityDelta = round3(current.priorityScore - previous.priorityScore);
  const verdictChanged = previous.verdict !== current.verdict;

  const bits: string[] = [];
  if (verdictChanged) {
    bits.push(`${previous.verdict} → ${current.verdict}`);
  }
  if (Math.abs(scoreDelta) >= 1) {
    bits.push(`score ${scoreDelta > 0 ? "+" : ""}${scoreDelta.toFixed(1)}`);
  }
  if (Math.abs(volumeDelta) >= 100) {
    bits.push(
      `volume ${volumeDelta > 0 ? "+" : ""}${volumeDelta.toLocaleString()}`,
    );
  }
  if (softnessDelta != null && Math.abs(softnessDelta) >= 0.05) {
    bits.push(
      `softness ${softnessDelta > 0 ? "+" : ""}${(softnessDelta * 100).toFixed(0)}%`,
    );
  }
  if (difficultyDelta != null && Math.abs(difficultyDelta) >= 3) {
    bits.push(
      `difficulty ${difficultyDelta > 0 ? "+" : ""}${difficultyDelta.toFixed(0)}`,
    );
  }
  if (!bits.length) bits.push("No material change since last run");

  return {
    verdictChanged,
    fromVerdict: previous.verdict,
    toVerdict: current.verdict,
    scoreDelta,
    volumeDelta,
    softnessDelta,
    difficultyDelta,
    priorityDelta,
    summary: bits.join(" · "),
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
  intent?: string | null;
  serp?: Array<{
    domain: string;
    title: string;
    pageType?: SerpPageType;
    organicEtv?: number | null;
  }> | null;
  organicSoftness?: number | null;
  /** Real Labs bulk-keyword-difficulty score (0..100) for the theme's top keyword. */
  keywordDifficulty?: number | null;
  weightOverrides?: FactorWeightOverrides;
}): VerdictResult {
  const tam = estimateTam({
    totalVolume: input.totalVolume,
    avgCpc: input.avgCpc,
    monthlyPriceFloor: input.monthlyPriceFloor,
    monetizationModel: input.monetizationModel,
  });

  const competitors = analyzeCompetitors(input.serp);
  const gap = contentGapScore(input.intent, input.serp);

  const rawSoftness =
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
  const softness = combineOrganicSignal({
    softness: rawSoftness,
    keywordDifficulty: input.keywordDifficulty,
  });

  // Incumbent power: high-traffic SaaS SERPs hurt; beatable SERPs help.
  let incumbentScore = 0.5;
  let incumbentDetail = "No competitor traffic data";
  if (competitors) {
    if (competitors.beatability === "beatable") {
      incumbentScore = 0.85;
    } else if (competitors.beatability === "owned") {
      incumbentScore = 0.2;
    } else {
      incumbentScore = 0.5;
    }
    // Soften further when median traffic is tiny.
    if (
      competitors.medianIncumbentEtv != null &&
      competitors.medianIncumbentEtv < 10_000
    ) {
      incumbentScore = Math.min(1, incumbentScore + 0.1);
    }
    if (
      competitors.medianIncumbentEtv != null &&
      competitors.medianIncumbentEtv > 250_000
    ) {
      incumbentScore = Math.max(0, incumbentScore - 0.15);
    }
    incumbentDetail = competitors.summary;
  }

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

  const w = { ...DEFAULT_WEIGHTS, ...(input.weightOverrides ?? {}) };

  const factors: VerdictFactor[] = [
    {
      id: "demand",
      label: "Demand (volume × winnability)",
      score: demandNorm,
      weight: w.demand!,
      detail: `Demand score ${input.demandScore.toFixed(2)}`,
    },
    {
      id: "organic",
      label: "Organic softness",
      score: softness.score,
      weight: w.organic!,
      detail: softness.detail,
    },
    {
      id: "incumbents",
      label: "Competitor power",
      score: incumbentScore,
      weight: w.incumbents!,
      detail: incumbentDetail,
    },
    {
      id: "contentGap",
      label: "Intent / content gap",
      score: gap?.score ?? 0.4,
      weight: w.contentGap!,
      detail: gap?.detail ?? "No SERP — content gap unknown",
    },
    {
      id: "competition",
      label: "Ads competition",
      score: competitionNorm,
      weight: w.competition!,
      detail: `Ads comp ${(input.avgCompetition * 100).toFixed(0)}%`,
    },
    {
      id: "tam",
      label: "TAM / money model",
      score: tam.score,
      weight: w.tam!,
      detail: tam.summary,
    },
    {
      id: "pain",
      label: "Pain severity",
      score: painNorm,
      weight: w.pain!,
      detail: `${input.painSeverity}/5`,
    },
    {
      id: "trend",
      label: "Trend",
      score: trendNorm,
      weight: w.trend!,
      detail: `Trend: ${input.trendDirection}`,
    },
    {
      id: "rubric",
      label: "Rubric",
      score: input.rubricScore,
      weight: w.rubric!,
      detail: input.rubricPass
        ? "All rubric checks passed"
        : `Rubric ${(input.rubricScore * 100).toFixed(0)}%`,
    },
  ];

  const weighted =
    factors.reduce((sum, f) => sum + f.score * f.weight, 0) /
    factors.reduce((sum, f) => sum + f.weight, 0);
  let score = Math.round(weighted * 1000) / 10;

  const softOverride =
    softness.score >= 0.6 &&
    input.totalVolume >= 2000 &&
    input.avgCompetition <= 0.65 &&
    input.trendDirection !== "declining";

  let verdict: VerdictLabel;
  if (
    score >= 68 &&
    (input.rubricPass || softOverride) &&
    input.trendDirection !== "declining"
  ) {
    verdict = "build";
  } else if (score >= 42) {
    verdict = "watch";
  } else {
    verdict = "kill";
  }

  if (
    verdict === "build" &&
    softness.score < 0.28 &&
    input.avgCompetition >= 0.75
  ) {
    verdict = "watch";
    score = Math.min(score, 64);
  }
  if (verdict === "build" && competitors?.beatability === "owned") {
    verdict = "watch";
    score = Math.min(score, 66);
  }

  const priorityScore = computePriorityScore({
    tamScore: tam.score,
    organicSoftness: softness.score,
    keywordDifficulty: input.keywordDifficulty,
    contentGapScore: gap?.score,
  });

  let rationale: string;
  if (verdict === "build") {
    rationale =
      competitors?.beatability === "beatable"
        ? "Build — soft/beatable SERP with enough demand and a clear money model."
        : softOverride && !input.rubricPass
          ? "Build — soft organic SERP and volume outweigh a weak CPC floor."
          : "Build — demand, winnability, and money model clear the bar.";
  } else if (verdict === "watch") {
    rationale =
      competitors?.beatability === "owned"
        ? "Watch — incumbents look heavy; validate a sharper wedge before building."
        : "Watch — promising signals, but validate SERP / willingness to pay first.";
  } else {
    rationale =
      "Kill — weak demand, hard SERP, or cooling trend; park it.";
  }

  return {
    verdict,
    score,
    priorityScore,
    factors: factors.map((f) => ({ ...f, score: round3(f.score) })),
    rationale,
    tam,
    organicSoftness:
      input.serp?.length || input.organicSoftness != null
        ? softness.score
        : null,
    competitors,
    contentGap: gap,
  };
}

export function annotateSerpSnapshot(
  items: Array<{
    rank: number;
    domain: string;
    title: string;
    organicEtv?: number | null;
  }>,
): SerpSnapshotItem[] {
  return items.map((i) => ({
    ...i,
    organicEtv: i.organicEtv ?? null,
    pageType: classifySerpPageType(i.domain, i.title),
  }));
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
