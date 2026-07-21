const BASE = import.meta.env.VITE_API_BASE ?? (import.meta.env.DEV ? "/api" : "");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || res.statusText);
  }
  return res.json() as Promise<T>;
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
  keywordCount: number;
  createdAt: string;
};

export type NicheDetail = {
  id: string;
  seedTerm: string;
  status: string;
  error: string | null;
  convRate: number;
  ltvCacRatio: number;
  keywordCount: number;
  createdAt: string;
  updatedAt: string;
  costs: { total: number; byProvider: Record<string, number> };
  opportunities: OpportunityRow[];
};

export type OpportunityDetail = {
  id: string;
  nicheId: string;
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

export const api = {
  listNiches: () =>
    request<{ globalCost: number; niches: NicheListItem[] }>("/niches"),
  createNiche: (seedTerm: string) =>
    request<NicheListItem>("/niches", {
      method: "POST",
      body: JSON.stringify({ seedTerm }),
    }),
  getNiche: (id: string) => request<NicheDetail>(`/niches/${id}`),
  getOpportunity: (nicheId: string, oppId: string) =>
    request<OpportunityDetail>(`/niches/${nicheId}/opportunities/${oppId}`),
  updateAssumptions: (
    id: string,
    body: { convRate?: number; ltvCacRatio?: number },
  ) =>
    request(`/niches/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  retry: (id: string) =>
    request(`/niches/${id}/retry`, { method: "POST" }),
  remove: (id: string) =>
    request(`/niches/${id}`, { method: "DELETE" }),
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
