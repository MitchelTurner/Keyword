export type CuratedNiche = {
  id: string;
  seed: string;
  category: string;
  why: string;
  /** Related seed angles / keyword phrases worth running next */
  keywords: string[];
};

/**
 * Curated B2B / prosumer wedges that tend to expand well in Prospector:
 * clear buyer, paid intent, and software-shaped pain.
 */
export const CURATED_NICHES: CuratedNiche[] = [
  {
    id: "hoa-management",
    seed: "HOA management",
    category: "Property ops",
    why: "Fragmented board workflows, recurring billing, and compliance create sticky SMB/HOA software demand.",
    keywords: [
      "HOA accounting software",
      "community association management",
      "HOA board portal",
      "HOA violation tracking",
    ],
  },
  {
    id: "dental-billing",
    seed: "dental billing",
    category: "Healthcare admin",
    why: "Clinics pay for claim accuracy and AR follow-up; high CPC often signals willingness to buy.",
    keywords: [
      "dental practice management",
      "dental insurance verification",
      "dental claims denial",
      "dental patient billing",
    ],
  },
  {
    id: "freight-broker",
    seed: "freight broker software",
    category: "Logistics",
    why: "Brokers juggle load boards, carrier compliance, and invoicing — classic workflow software wedge.",
    keywords: [
      "TMS for brokers",
      "carrier onboarding software",
      "load board automation",
      "freight factoring software",
    ],
  },
  {
    id: "construction-estimating",
    seed: "construction estimating",
    category: "Trades",
    why: "Estimators and GCs still live in spreadsheets; takeoff + bid tools monetize well.",
    keywords: [
      "construction takeoff software",
      "contractor bidding software",
      "job costing software",
      "construction proposal software",
    ],
  },
  {
    id: "nonprofit-grant",
    seed: "grant management software",
    category: "Nonprofit / gov",
    why: "Grant tracking and reporting are painful for nonprofits and local agencies with budget.",
    keywords: [
      "nonprofit fundraising CRM",
      "foundation grant tracking",
      "federal grant compliance",
      "donor management software",
    ],
  },
  {
    id: "property-maintenance",
    seed: "property maintenance software",
    category: "Property ops",
    why: "Work orders, vendors, and tenant requests are recurring ops problems for managers.",
    keywords: [
      "work order management software",
      "landlord maintenance app",
      "facility maintenance CMMS",
      "tenant request portal",
    ],
  },
  {
    id: "law-firm-intake",
    seed: "law firm intake software",
    category: "Legal",
    why: "Intake, conflicts, and matter opening are high-pain workflows with enterprise/SMB buyers.",
    keywords: [
      "legal practice management",
      "client intake forms lawyers",
      "conflict check software",
      "law firm CRM",
    ],
  },
  {
    id: "veterinary-practice",
    seed: "veterinary practice management",
    category: "Healthcare admin",
    why: "Clinics need scheduling, reminders, inventory, and billing in one ops layer.",
    keywords: [
      "vet clinic software",
      "pet hospital scheduling",
      "veterinary inventory management",
      "vet client communication",
    ],
  },
  {
    id: "inspection-scheduling",
    seed: "home inspection software",
    category: "Field services",
    why: "Inspectors need scheduling, report writing, and payments — mobile-first SaaS angle.",
    keywords: [
      "inspection report software",
      "field service scheduling",
      "home inspector CRM",
      "property inspection checklist",
    ],
  },
  {
    id: "church-management",
    seed: "church management software",
    category: "Nonprofit / gov",
    why: "Membership, giving, and event ops are sticky for mid-size congregations.",
    keywords: [
      "church giving software",
      "ministry management software",
      "church member database",
      "nonprofit event registration",
    ],
  },
  {
    id: "restaurant-inventory",
    seed: "restaurant inventory software",
    category: "Hospitality",
    why: "Food cost control and ordering are measurable ROI problems for multi-unit operators.",
    keywords: [
      "restaurant purchasing software",
      "food cost management",
      "restaurant recipe costing",
      "bar inventory management",
    ],
  },
  {
    id: "hvac-dispatch",
    seed: "HVAC dispatch software",
    category: "Field services",
    why: "Dispatch, tech routing, and job costing convert well for home-services SMBs.",
    keywords: [
      "plumbing dispatch software",
      "field service management HVAC",
      "technician scheduling software",
      "service agreement software",
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
  limit = 24,
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
  limit = 16,
): RecommendationKeyword[] {
  const used = new Set(existingSeeds.map(normalizeTerm));
  const best = new Map<string, FollowOnCandidate>();

  for (const c of candidates) {
    if (!isSeedablePhrase(c.term)) continue;
    const key = normalizeTerm(c.term);
    if (used.has(key)) continue;
    // Skip if it's basically the niche seed itself
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
    keywords: [...followOns, ...curatedKeywords].slice(0, 32),
    followOns,
  };
}
