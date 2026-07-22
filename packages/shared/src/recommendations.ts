import { isBucketCompetition } from "./schemas";

export type CuratedNiche = {
  id: string;
  seed: string;
  category: string;
  why: string;
  /** Related seed angles / keyword phrases worth running next */
  keywords: string[];
};

/**
 * Curated starter seeds across general search demand — not software-only.
 * Also used as fallback when the live keyword API is unavailable.
 */
export const CURATED_NICHES: CuratedNiche[] = [
  {
    id: "running-shoes",
    seed: "running shoes",
    category: "Ecommerce",
    why: "High-volume commerce queries with clear comparison and brand angles.",
    keywords: [
      "best running shoes",
      "trail running shoes",
      "running shoes for flat feet",
      "marathon racing shoes",
    ],
  },
  {
    id: "meal-prep",
    seed: "meal prep",
    category: "Food & health",
    why: "Recurring consumer intent spanning recipes, delivery, and containers.",
    keywords: [
      "meal prep ideas",
      "healthy meal prep",
      "meal prep delivery",
      "meal prep containers",
    ],
  },
  {
    id: "divorce-lawyer",
    seed: "divorce lawyer",
    category: "Local services",
    why: "High CPC local/professional services with strong transactional intent.",
    keywords: [
      "family law attorney near me",
      "uncontested divorce cost",
      "child custody lawyer",
      "divorce mediation",
    ],
  },
  {
    id: "airbnb-cleaning",
    seed: "Airbnb cleaning",
    category: "Local services",
    why: "Service demand tied to short-term rentals and turnovers.",
    keywords: [
      "Airbnb turnover cleaning",
      "vacation rental cleaning service",
      "short term rental cleaner",
      "Airbnb co host services",
    ],
  },
  {
    id: "solar-panels",
    seed: "solar panels",
    category: "Home",
    why: "Big-ticket home improvement with research + quote intent.",
    keywords: [
      "solar panel cost",
      "best solar companies",
      "residential solar installation",
      "solar tax credit",
    ],
  },
  {
    id: "personal-injury",
    seed: "personal injury lawyer",
    category: "Legal",
    why: "Classic high-intent legal searches with expensive clicks.",
    keywords: [
      "car accident attorney",
      "slip and fall lawyer",
      "truck accident lawyer",
      "free consultation injury lawyer",
    ],
  },
  {
    id: "dog-training",
    seed: "dog training",
    category: "Pets",
    why: "Mix of local services, courses, and product-adjacent queries.",
    keywords: [
      "puppy training classes",
      "dog training near me",
      "aggressive dog training",
      "online dog training course",
    ],
  },
  {
    id: "wedding-photography",
    seed: "wedding photography",
    category: "Events",
    why: "Seasonal but high-consideration local creative services.",
    keywords: [
      "wedding photographer near me",
      "wedding photography packages",
      "elopement photographer",
      "engagement photo ideas",
    ],
  },
  {
    id: "credit-repair",
    seed: "credit repair",
    category: "Finance",
    why: "Consumer finance with strong commercial and comparison language.",
    keywords: [
      "how to fix credit score",
      "best credit repair companies",
      "credit repair cost",
      "remove collections from credit",
    ],
  },
  {
    id: "moving-company",
    seed: "moving company",
    category: "Local services",
    why: "Transactional local demand with quote and price intent.",
    keywords: [
      "movers near me",
      "long distance moving companies",
      "apartment movers cost",
      "packing services movers",
    ],
  },
  {
    id: "hoa-management",
    seed: "HOA management",
    category: "Property",
    why: "Still a strong ops niche — boards, fees, and compliance searches.",
    keywords: [
      "HOA fees explained",
      "community association management",
      "HOA violation rules",
      "HOA board responsibilities",
    ],
  },
  {
    id: "dental-implants",
    seed: "dental implants",
    category: "Healthcare",
    why: "High CPC medical/cosmetic procedures with cost research.",
    keywords: [
      "dental implant cost",
      "all on 4 dental implants",
      "dental implants near me",
      "implant dentist",
    ],
  },
];

/**
 * Probe seeds biased toward buildable software / tools / content niches
 * (not licensed professions or pure local services).
 */
export const TOPIC_PROBES: Array<{
  id: string;
  category: string;
  seed: string;
}> = [
  { id: "billing", category: "SaaS", seed: "invoice software" },
  { id: "crm", category: "SaaS", seed: "crm software" },
  { id: "scheduling", category: "SaaS", seed: "appointment scheduling software" },
  { id: "habits", category: "Productivity", seed: "habit tracker app" },
  { id: "meal", category: "Food tech", seed: "meal planning app" },
  { id: "budget", category: "Fintech", seed: "budget tracker app" },
  { id: "hoa", category: "Proptech", seed: "hoa management software" },
  { id: "dental", category: "Health tech", seed: "dental practice software" },
  { id: "legal-tech", category: "Legal tech", seed: "law firm billing software" },
  { id: "ecommerce", category: "Ecommerce", seed: "shopify inventory app" },
  { id: "education", category: "Edtech", seed: "online course platform" },
  { id: "content", category: "Content", seed: "newsletter tools" },
  { id: "seo", category: "Marketing", seed: "keyword research tool" },
  { id: "hr", category: "HR tech", seed: "employee scheduling software" },
  { id: "pets", category: "Pets", seed: "pet sitting software" },
  { id: "fitness", category: "Fitness tech", seed: "workout planner app" },
  { id: "rentals", category: "Proptech", seed: "rental property management software" },
  { id: "tools", category: "Tools", seed: "mortgage calculator" },
];

export type SerpPreviewItem = {
  rank: number;
  domain: string;
  title: string;
};

export type RecommendationKeyword = {
  term: string;
  source: "api" | "curated" | "follow_on";
  nicheId?: string;
  nicheSeed?: string;
  category?: string;
  reason?: string;
  /** Why Claude approved this seed for a buildable monetizable niche. */
  aiReason?: string;
  volume?: number | null;
  competition?: number | null;
  cpc?: number | null;
  /** Higher = better seed opportunity (volume × low competition × CPC). */
  score?: number;
  /** Lightweight organic SERP snapshot for reality-checking the niche. */
  serp?: SerpPreviewItem[];
};

export type FollowOnCandidate = {
  term: string;
  nicheId: string;
  nicheSeed: string;
  volume: number | null;
  competition?: number | null;
};

export type ApiSeedCandidate = {
  term: string;
  category: string;
  probe: string;
  volume: number | null;
  competition: number | null;
  cpc?: number | null;
  aiReason?: string;
};

/** Soft ceiling — terms above this are usually too crowded to recommend as seeds. */
export const MAX_RECOMMENDED_COMPETITION = 0.75;

/** Live recommended-seed thresholds. */
export const RECOMMENDED_SEED_MIN_VOLUME = 500;
/** Ads competition_index / 100 — keep only clearly low-comp niches. */
export const RECOMMENDED_SEED_MAX_COMPETITION = 0.35;

/** Head terms used as discovery probes — usually crowded; never recommend these. */
export function blockedProbeSeeds(): Set<string> {
  return new Set([
    ...TOPIC_PROBES.map((p) => normalizeTerm(p.seed)),
    ...CURATED_NICHES.map((n) => normalizeTerm(n.seed)),
  ]);
}

function normalizeTerm(term: string): string {
  return term.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Prefer 2–5 word phrases that look like runnable seed terms. */
export function isSeedablePhrase(term: string): boolean {
  const t = term.trim();
  if (t.length < 6 || t.length > 64) return false;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 6) return false;
  if (/https?:\/\//i.test(t)) return false;
  if (/^[0-9$]+$/.test(t)) return false;
  return true;
}

/**
 * Rank seed opportunity: high volume + low competition + commercial CPC.
 * Missing competition is treated as mid (0.55); missing CPC as $0 (no boost).
 */
export function seedOpportunityScore(
  volume: number | null | undefined,
  competition: number | null | undefined,
  cpc?: number | null | undefined,
): number {
  const vol = Math.max(0, volume ?? 0);
  if (vol <= 0) return 0;
  const comp =
    competition == null
      ? 0.55
      : Math.min(1, Math.max(0, competition));
  const cpcBoost = 1 + Math.log10(1 + Math.max(0, cpc ?? 0));
  return Math.log10(vol + 1) * (1.05 - comp) * cpcBoost;
}

function competitionLabel(competition: number | null | undefined): string {
  if (competition == null) return "unknown competition";
  if (competition <= 0.35) return "low competition";
  if (competition <= 0.6) return "moderate competition";
  return "higher competition";
}

function significantTokens(term: string): Set<string> {
  return new Set(
    term
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3),
  );
}

/** True when two phrases share most content words (near-duplicates). */
export function phrasesTooSimilar(a: string, b: string): boolean {
  const ta = significantTokens(a);
  const tb = significantTokens(b);
  if (ta.size === 0 || tb.size === 0) return false;
  let overlap = 0;
  for (const t of ta) if (tb.has(t)) overlap += 1;
  const union = new Set([...ta, ...tb]).size;
  return overlap / union >= 0.55;
}

export function filterUnusedCurated(
  existingSeeds: string[],
): CuratedNiche[] {
  const used = new Set(existingSeeds.map(normalizeTerm));
  return CURATED_NICHES.filter((n) => !used.has(normalizeTerm(n.seed)));
}

/**
 * Diversify live API candidates across topic categories.
 * Round-robins categories so recommendations span wide market differences.
 */
export function diversifyApiSeedRecommendations(
  candidates: ApiSeedCandidate[],
  existingSeeds: string[],
  limit = 24,
  opts: { shuffle?: boolean } = {},
): RecommendationKeyword[] {
  const used = new Set(existingSeeds.map(normalizeTerm));
  const byCategory = new Map<
    string,
    Array<ApiSeedCandidate & { score: number }>
  >();

  const blocked = blockedProbeSeeds();

  for (const c of candidates) {
    if (!isSeedablePhrase(c.term)) continue;
    const key = normalizeTerm(c.term);
    if (used.has(key)) continue;
    // Never recommend crowded head terms used as probes / curated starters.
    if (blocked.has(key)) continue;
    if (key === normalizeTerm(c.probe)) continue;
    const volume = c.volume ?? 0;
    if (volume < RECOMMENDED_SEED_MIN_VOLUME) continue;
    // Require a real Ads competition value (not missing / bucket placeholder).
    if (
      c.competition == null ||
      isBucketCompetition(c.competition) ||
      c.competition > RECOMMENDED_SEED_MAX_COMPETITION
    ) {
      continue;
    }
    const score = seedOpportunityScore(c.volume, c.competition, c.cpc);
    const list = byCategory.get(c.category) ?? [];
    list.push({ ...c, score });
    byCategory.set(c.category, list);
  }

  for (const [category, list] of byCategory) {
    list.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (b.volume ?? 0) - (a.volume ?? 0);
    });
    byCategory.set(category, list);
  }

  let categories = [...byCategory.keys()].sort();
  if (opts.shuffle) {
    // Fisher–Yates so each "Search new seeds" pass surfaces a different mix.
    for (let i = categories.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [categories[i], categories[j]] = [categories[j]!, categories[i]!];
    }
  }
  const indexes = new Map(categories.map((c) => [c, 0]));
  const picked: RecommendationKeyword[] = [];
  const pickedTerms: string[] = [];

  while (picked.length < limit) {
    let added = false;
    for (const category of categories) {
      if (picked.length >= limit) break;
      const list = byCategory.get(category) ?? [];
      let idx = indexes.get(category) ?? 0;
      while (idx < list.length) {
        const c = list[idx]!;
        idx += 1;
        indexes.set(category, idx);
        const key = normalizeTerm(c.term);
        if (pickedTerms.some((t) => phrasesTooSimilar(t, c.term))) continue;
        if (picked.some((p) => normalizeTerm(p.term) === key)) continue;
        const cpcBit =
          c.cpc != null && c.cpc > 0 ? ` · $${c.cpc.toFixed(2)} CPC` : "";
        picked.push({
          term: c.term,
          source: "api",
          nicheSeed: c.probe,
          category: c.category,
          volume: c.volume,
          competition: c.competition,
          cpc: c.cpc ?? null,
          score: c.score,
          aiReason: c.aiReason,
          reason: `${c.category} · ${competitionLabel(c.competition)} · ${Math.round(c.volume ?? 0).toLocaleString()}/mo${cpcBit}`,
        });
        pickedTerms.push(c.term);
        added = true;
        break;
      }
    }
    if (!added) break;
  }

  return picked;
}

/**
 * Search / filter enriched keyword rows for seed ideas (legacy /seeds endpoint).
 */
export function searchSeedKeywords(
  candidates: FollowOnCandidate[],
  existingSeeds: string[],
  opts: {
    minVolume?: number;
    maxCompetition?: number;
    limit?: number;
  } = {},
): RecommendationKeyword[] {
  const minVolume = opts.minVolume ?? RECOMMENDED_SEED_MIN_VOLUME;
  const maxCompetition = opts.maxCompetition ?? RECOMMENDED_SEED_MAX_COMPETITION;
  const limit = opts.limit ?? 40;
  const used = new Set(existingSeeds.map(normalizeTerm));
  const best = new Map<string, FollowOnCandidate & { score: number }>();

  for (const c of candidates) {
    if (!isSeedablePhrase(c.term)) continue;
    const key = normalizeTerm(c.term);
    if (used.has(key)) continue;
    if (key === normalizeTerm(c.nicheSeed)) continue;
    const volume = c.volume ?? 0;
    if (volume < minVolume) continue;
    if (c.competition == null || c.competition > maxCompetition) continue;

    const score = seedOpportunityScore(c.volume, c.competition, null);
    const prev = best.get(key);
    if (!prev || score > prev.score) {
      best.set(key, { ...c, score });
    }
  }

  return [...best.values()]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if ((b.volume ?? 0) !== (a.volume ?? 0)) {
        return (b.volume ?? 0) - (a.volume ?? 0);
      }
      return (a.competition ?? 1) - (b.competition ?? 1);
    })
    .slice(0, limit)
    .map((c) => ({
      term: c.term,
      source: "follow_on" as const,
      nicheId: c.nicheId,
      nicheSeed: c.nicheSeed,
      volume: c.volume,
      competition: c.competition ?? null,
      score: c.score,
      reason: `${competitionLabel(c.competition)}, ${Math.round(c.volume ?? 0).toLocaleString()}/mo from “${c.nicheSeed}”`,
    }));
}

/**
 * Recommended seeds from live API discovery (high volume + low competition),
 * diversified across topic probes. No curated fallback — head terms like
 * "wedding photography" are often high competition and must not be suggested.
 */
export function buildRecommendations(input: {
  existingSeeds: string[];
  apiCandidates?: ApiSeedCandidate[];
  /** Shuffle category order for a fresher mix (e.g. after "Search new seeds"). */
  shuffle?: boolean;
}) {
  const existing = input.existingSeeds;
  const seeds = diversifyApiSeedRecommendations(
    input.apiCandidates ?? [],
    existing,
    24,
    { shuffle: input.shuffle },
  );

  return {
    niches: [] as Array<CuratedNiche & { alreadyRun: boolean }>,
    keywords: seeds,
    followOns: seeds,
  };
}
