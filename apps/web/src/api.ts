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

export type RecommendedKeyword = {
  term: string;
  source: "api" | "curated" | "follow_on";
  nicheId?: string;
  nicheSeed?: string;
  category?: string;
  reason?: string;
  volume?: number | null;
  competition?: number | null;
  score?: number;
};

export type RecommendationsResponse = {
  niches: RecommendedNiche[];
  keywords: RecommendedKeyword[];
  followOns: RecommendedKeyword[];
};

export type SeedSearchResponse = {
  query: {
    q: string;
    minVolume: number;
    maxCompetition: number;
    limit: number;
  };
  count: number;
  keywords: RecommendedKeyword[];
};

export const api = {
  listNiches: () =>
    request<{
      globalCost: number;
      costEstimate: CostEstimate;
      niches: NicheListItem[];
    }>("/niches"),
  recommendations: () => request<RecommendationsResponse>("/recommendations"),
  searchSeeds: (params: {
    q?: string;
    minVolume?: number;
    maxCompetition?: number;
    limit?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params.q?.trim()) qs.set("q", params.q.trim());
    if (params.minVolume != null) qs.set("minVolume", String(params.minVolume));
    if (params.maxCompetition != null) {
      qs.set("maxCompetition", String(params.maxCompetition));
    }
    if (params.limit != null) qs.set("limit", String(params.limit));
    const suffix = qs.toString() ? `?${qs}` : "";
    return request<SeedSearchResponse>(`/recommendations/seeds${suffix}`);
  },
  portfolio: () =>
    request<{ count: number; items: PortfolioItem[] }>("/portfolio"),
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
