const BASE = import.meta.env.VITE_API_BASE ?? (import.meta.env.DEV ? "/api" : "");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  const contentType = res.headers.get("content-type") ?? "";
  const body = await res.text();
  if (!res.ok) {
    throw new Error(body || res.statusText);
  }
  if (!contentType.includes("application/json")) {
    throw new Error(
      `Expected JSON from ${path}, got ${contentType || "unknown"} (check API/SPA routing)`,
    );
  }
  return JSON.parse(body) as T;
}

export type NicheListItem = {
  id: string;
  seedTerm: string;
  status: string;
  error: string | null;
  convRate: number;
  ltvCacRatio: number;
  keywordCount: number;
  opportunityCount: number;
  createdAt: string;
  updatedAt: string;
};

export type CostEstimate = {
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

export type TrendInfo = {
  direction: "rising" | "flat" | "declining" | "unknown";
  score: number;
  changePct: number | null;
  series: Array<{ year: number; month: number; search_volume: number }>;
};

export type DecisionSupport = {
  rank: number;
  breakdown: {
    volumeFactor: number;
    cpcFactor: number;
    competitionFactor: number;
    demandScore: number;
    drivers: string[];
  };
  rubric: {
    pass: boolean;
    score: number;
    checks: Array<{
      id: string;
      label: string;
      pass: boolean;
      detail: string;
    }>;
  };
  brief: {
    summary: string;
    whyRanks: string;
    nextStep: string;
  };
};

export type OpportunityRow = {
  id: string;
  productDescription: string;
  buyerType: string;
  intent: string;
  painSeverity: number;
  reasoning: string;
  productAngle?: string | null;
  monetizationModel?: string | null;
  wedge?: string | null;
  totalVolume: number;
  avgCpc: number;
  avgCompetition: number;
  impliedCac: number;
  annualPriceFloor: number;
  monthlyPriceFloor: number;
  demandScore: number;
  pinned: boolean;
  notes: string;
  reviewStatus: string;
  keywordCount: number;
  createdAt: string;
  trend: TrendInfo;
  decision: DecisionSupport;
};

export type RubricConfig = {
  minMonthlyFloor: number;
  minVolume: number;
  minPain: number;
  maxCompetition: number;
  rejectDeclining: boolean;
};

export type NicheDetail = {
  id: string;
  seedTerm: string;
  status: string;
  error: string | null;
  convRate: number;
  ltvCacRatio: number;
  rubricConfig: RubricConfig;
  keywordCount: number;
  enrichedKeywordCount: number;
  createdAt: string;
  updatedAt: string;
  costs: {
    total: number;
    byProvider: Record<string, number>;
    perOpportunity: number;
    perEnrichedKeyword: number;
  };
  decisionSummary: {
    passCount: number;
    failCount: number;
  };
  opportunities: OpportunityRow[];
  keywords: Array<{
    id: string;
    term: string;
    searchVolume: number | null;
    cpc: number | null;
    competition: number | null;
    monthlyTrend: Array<{
      year: number;
      month: number;
      search_volume?: number | null;
    }> | null;
    opportunityId: string | null;
  }>;
};

export type OpportunityDetail = OpportunityRow & {
  nicheId: string;
  keywords: Array<{
    id: string;
    term: string;
    searchVolume: number | null;
    cpc: number | null;
    competition: number | null;
    monthlyTrend: Array<{
      year: number;
      month: number;
      search_volume?: number | null;
    }> | null;
  }>;
};

export type PortfolioItem = OpportunityRow & {
  nicheId: string;
  nicheSeedTerm: string;
  nicheStatus: string;
};

export type RecommendedNiche = {
  id: string;
  seed: string;
  category: string;
  why: string;
  keywords: string[];
  alreadyRun: boolean;
};

export type SerpPreviewItem = {
  rank: number;
  domain: string;
  title: string;
};

export type RecommendedKeyword = {
  term: string;
  source: "api" | "curated" | "follow_on";
  nicheId?: string;
  nicheSeed?: string;
  category?: string;
  reason?: string;
  aiReason?: string;
  volume?: number | null;
  competition?: number | null;
  cpc?: number | null;
  score?: number;
  serp?: SerpPreviewItem[];
};

export type SeedSearchDiagnostics = {
  discovered: number;
  afterRejectList: number;
  afterAi: number;
  recommended: number;
};

export type SeedSearchMode = "default" | "low_cpc";

export type TrackedKeywordStatus =
  | "tracking"
  | "idea"
  | "targeting"
  | "dismissed";

export type TrackedKeyword = {
  id: string;
  siteId: string;
  term: string;
  source: string;
  status: TrackedKeywordStatus | string;
  parentId: string | null;
  searchVolume: number | null;
  cpc: number | null;
  competition: number | null;
  monthlyTrend: Array<{
    year: number;
    month: number;
    search_volume: number;
  }> | null;
  notes: string;
  lastEnrichedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TrackedSiteSummary = {
  id: string;
  name: string;
  domain: string | null;
  notes: string;
  keywordCount: number;
  createdAt: string;
  updatedAt: string;
};

export type TrackedSiteDetail = {
  id: string;
  name: string;
  domain: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
  stats: {
    tracking: number;
    ideas: number;
    targeting: number;
    dismissed: number;
  };
  keywords: TrackedKeyword[];
};

export type RecommendationsResponse = {
  niches: RecommendedNiche[];
  keywords: RecommendedKeyword[];
  followOns: RecommendedKeyword[];
  aiReviewError?: string;
  searching?: boolean;
  jobId?: string | null;
  progress?: string;
  mode?: SeedSearchMode;
  maxCpc?: number | null;
  diagnostics?: SeedSearchDiagnostics;
};

export type RecommendationsJob = {
  jobId: string | null;
  status: "idle" | "running" | "done" | "error";
  progress: string;
  mode?: SeedSearchMode;
  error: string | null;
  updatedAt: number;
  result: RecommendationsResponse | null;
};

export type SeedSearchResponse = {
  query: {
    q: string;
    minVolume: number;
    maxCompetition: number;
    maxCpc?: number | null;
    limit: number;
  };
  count: number;
  keywords: RecommendedKeyword[];
};

export type DomainIdea = {
  domain: string;
  label: string;
  tld: string;
  available: boolean | null;
  availabilityMethod: string;
  seoScore: number;
  relatedKeyword: string | null;
  keywordVolume: number | null;
  rationale: string;
  source: "ai" | "keyword";
};

export type DomainSuggestResponse = {
  topic: string;
  tlds: string[];
  keywords: Array<{ term: string; volume: number | null }>;
  count: number;
  availableCount: number;
  domains: DomainIdea[];
  note: string;
};

export const api = {
  listNiches: () =>
    request<{
      globalCost: number;
      costEstimate: CostEstimate;
      niches: NicheListItem[];
    }>("/niches"),
  recommendations: (opts?: { refresh?: boolean; mode?: SeedSearchMode }) => {
    if (opts?.refresh) {
      const mode = opts.mode ?? "default";
      return request<RecommendationsResponse>(
        `/recommendations/refresh?mode=${encodeURIComponent(mode)}`,
        {
          method: "POST",
          body: JSON.stringify({ mode }),
        },
      );
    }
    // Omit mode to fetch the latest completed job (whatever mode it was).
    // Passing mode=default was overwriting low-CPC results on niche refresh polls.
    const qs =
      opts?.mode != null ? `?mode=${encodeURIComponent(opts.mode)}` : "";
    return request<RecommendationsResponse>(`/recommendations${qs}`);
  },
  recommendationsJob: () =>
    request<RecommendationsJob>("/recommendations/job"),
  rejectSeed: (term: string, reason?: string) =>
    request<{ ok: true; term: string }>("/recommendations/reject", {
      method: "POST",
      body: JSON.stringify({ term, reason }),
    }),
  unrejectSeed: (term: string) =>
    request<{ ok: true; term: string }>(
      `/recommendations/reject/${encodeURIComponent(term)}`,
      { method: "DELETE" },
    ),
  searchSeeds: (params: {
    q?: string;
    minVolume?: number;
    maxCompetition?: number;
    maxCpc?: number;
    limit?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params.q?.trim()) qs.set("q", params.q.trim());
    if (params.minVolume != null) qs.set("minVolume", String(params.minVolume));
    if (params.maxCompetition != null) {
      qs.set("maxCompetition", String(params.maxCompetition));
    }
    if (params.maxCpc != null) qs.set("maxCpc", String(params.maxCpc));
    if (params.limit != null) qs.set("limit", String(params.limit));
    const suffix = qs.toString() ? `?${qs}` : "";
    return request<SeedSearchResponse>(`/recommendations/seeds${suffix}`);
  },
  portfolio: () =>
    request<{ count: number; items: PortfolioItem[] }>("/portfolio"),
  suggestDomains: (body: {
    topic: string;
    tlds?: string[];
    limit?: number;
  }) =>
    request<DomainSuggestResponse>("/domains/suggest", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  listSites: () =>
    request<{ count: number; sites: TrackedSiteSummary[] }>("/sites"),
  createSite: (body: { name: string; domain?: string; notes?: string }) =>
    request<TrackedSiteSummary>("/sites", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getSite: (id: string) => request<TrackedSiteDetail>(`/sites/${id}`),
  updateSite: (
    id: string,
    body: { name?: string; domain?: string | null; notes?: string },
  ) =>
    request<TrackedSiteSummary>(`/sites/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteSite: (id: string) =>
    request<{ ok: true }>(`/sites/${id}`, { method: "DELETE" }),
  addSiteKeywords: (
    id: string,
    body: { terms: string[]; enrich?: boolean },
  ) =>
    request<TrackedSiteDetail>(`/sites/${id}/keywords`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  enrichSite: (id: string) =>
    request<{ enriched: number; site: TrackedSiteDetail }>(
      `/sites/${id}/enrich`,
      { method: "POST" },
    ),
  updateSiteKeyword: (
    siteId: string,
    keywordId: string,
    body: { status?: TrackedKeywordStatus; notes?: string },
  ) =>
    request<TrackedKeyword>(`/sites/${siteId}/keywords/${keywordId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteSiteKeyword: (siteId: string, keywordId: string) =>
    request<{ ok: true }>(`/sites/${siteId}/keywords/${keywordId}`, {
      method: "DELETE",
    }),
  fetchSiteKeywordIdeas: (
    siteId: string,
    keywordId: string,
    body?: { limit?: number },
  ) =>
    request<{
      parentId: string;
      added: number;
      ideas: TrackedKeyword[];
      site: TrackedSiteDetail;
    }>(`/sites/${siteId}/keywords/${keywordId}/ideas`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    }),
  costEstimate: () => request<CostEstimate>("/niches/cost-estimate"),
  createNiche: (seedTerm: string) =>
    request<NicheListItem>("/niches", {
      method: "POST",
      body: JSON.stringify({ seedTerm }),
    }),
  getNiche: (id: string) => request<NicheDetail>(`/niches/${id}`),
  getOpportunity: (nicheId: string, oppId: string) =>
    request<OpportunityDetail>(`/niches/${nicheId}/opportunities/${oppId}`),
  updateOpportunity: (
    nicheId: string,
    oppId: string,
    body: { pinned?: boolean; notes?: string; reviewStatus?: string },
  ) =>
    request<OpportunityRow>(`/niches/${nicheId}/opportunities/${oppId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  updateAssumptions: (
    id: string,
    body: {
      convRate?: number;
      ltvCacRatio?: number;
      rubricConfig?: RubricConfig;
      rescore?: boolean;
    },
  ) =>
    request(`/niches/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  reclassify: (id: string) =>
    request(`/niches/${id}/reclassify`, { method: "POST" }),
  retry: (id: string) =>
    request(`/niches/${id}/retry`, { method: "POST" }),
  remove: (id: string) =>
    request(`/niches/${id}`, { method: "DELETE" }),
  exportCsvUrl: (id: string) => `${BASE}/niches/${id}/export.csv`,
};

export function money(n: number, digits = 2) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: digits,
  }).format(n);
}

export function num(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}

/** Format stored 0–1 Ads competition_index as a percent (e.g. 0.12 → "12%"). */
export function adsCompPct(competition: number | null | undefined): string {
  if (competition == null || Number.isNaN(competition)) return "—";
  return `${Math.round(Math.min(1, Math.max(0, competition)) * 100)}%`;
}
