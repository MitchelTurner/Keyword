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

export type RecommendationKeyword = {
  term: string;
  source: "curated" | "follow_on";
  nicheId?: string;
  nicheSeed?: string;
  reason?: string;
  volume?: number | null;
};

export type FollowOnCandidate = {
  term: string;
  nicheId: string;
  nicheSeed: string;
  volume: number | null;
};

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

export function filterUnusedCurated(
  existingSeeds: string[],
): CuratedNiche[] {
  const used = new Set(existingSeeds.map(normalizeTerm));
  return CURATED_NICHES.filter((n) => !used.has(normalizeTerm(n.seed)));
}

export function curatedKeywordSuggestions(
  existingSeeds: string[],
  limit = 96,
): RecommendationKeyword[] {
  const used = new Set(existingSeeds.map(normalizeTerm));
  const out: RecommendationKeyword[] = [];
  for (const niche of CURATED_NICHES) {
    for (const term of niche.keywords) {
      if (used.has(normalizeTerm(term))) continue;
      out.push({
        term,
        source: "curated",
        nicheId: niche.id,
        nicheSeed: niche.seed,
        reason: `Related to ${niche.seed}`,
      });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/**
 * Rank follow-on keyword seeds from enriched terms already in the DB.
 */
export function rankFollowOnKeywords(
  candidates: FollowOnCandidate[],
  existingSeeds: string[],
  limit = 40,
): RecommendationKeyword[] {
  const used = new Set(existingSeeds.map(normalizeTerm));
  const best = new Map<string, FollowOnCandidate>();

  for (const c of candidates) {
    if (!isSeedablePhrase(c.term)) continue;
    const key = normalizeTerm(c.term);
    if (used.has(key)) continue;
    if (key === normalizeTerm(c.nicheSeed)) continue;
    const prev = best.get(key);
    if (!prev || (c.volume ?? 0) > (prev.volume ?? 0)) {
      best.set(key, c);
    }
  }

  return [...best.values()]
    .sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))
    .slice(0, limit)
    .map((c) => ({
      term: c.term,
      source: "follow_on" as const,
      nicheId: c.nicheId,
      nicheSeed: c.nicheSeed,
      volume: c.volume,
      reason: `High-volume term from “${c.nicheSeed}”`,
    }));
}

export function buildRecommendations(input: {
  existingSeeds: string[];
  followOnCandidates?: FollowOnCandidate[];
}) {
  const existing = input.existingSeeds;
  const niches = CURATED_NICHES.map((n) => {
    const match = existing.find(
      (s) => normalizeTerm(s) === normalizeTerm(n.seed),
    );
    return {
      ...n,
      alreadyRun: Boolean(match),
    };
  });

  const followOns = rankFollowOnKeywords(
    input.followOnCandidates ?? [],
    existing,
  );
  const curatedKeywords = curatedKeywordSuggestions(existing).filter(
    (k) =>
      !followOns.some((f) => normalizeTerm(f.term) === normalizeTerm(k.term)),
  );

  return {
    niches,
    keywords: [...followOns, ...curatedKeywords].slice(0, 96),
    followOns,
  };
}
