import {
  FormEvent,
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Link } from "react-router-dom";
import {
  adsCompPct,
  api,
  money,
  num,
  type TrackedKeyword,
  type TrackedSiteDetail,
  type TrackedSiteSummary,
} from "../api";
import EmptyState from "../components/EmptyState";
import PageHeader from "../components/PageHeader";
import Panel from "../components/Panel";
import Sparkline from "../components/Sparkline";

function parseTerms(raw: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(/[\n,]+/)) {
    const term = part.trim().replace(/\s+/g, " ");
    if (!term || term.length > 120) continue;
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(term);
  }
  return out;
}

function statusTone(status: string) {
  switch (status) {
    case "targeting":
      return "bg-emerald-950/50 text-emerald-300 border-emerald-900/60";
    case "idea":
      return "bg-sky-950/40 text-sky-300 border-sky-900/50";
    case "dismissed":
      return "bg-zinc-900 text-zinc-500 border-zinc-800";
    default:
      return "bg-zinc-900/80 text-zinc-300 border-zinc-700/80";
  }
}

export default function SitesPage() {
  const [sites, setSites] = useState<TrackedSiteSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [site, setSite] = useState<TrackedSiteDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [ideasBusyId, setIdeasBusyId] = useState<string | null>(null);
  const [expandedParents, setExpandedParents] = useState<Set<string>>(
    () => new Set(),
  );

  const [siteName, setSiteName] = useState("");
  const [siteDomain, setSiteDomain] = useState("");
  const [keywordDraft, setKeywordDraft] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "active" | "ideas" | "all" | "dismissed"
  >("active");

  const loadSites = useCallback(async () => {
    const data = await api.listSites();
    setSites(data.sites);
    return data.sites;
  }, []);

  const loadSite = useCallback(async (id: string) => {
    const detail = await api.getSite(id);
    setSite(detail);
    setSelectedId(id);
    return detail;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await loadSites();
        if (cancelled) return;
        if (list[0]) {
          await loadSite(list[0].id);
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadSites, loadSite]);

  const parents = useMemo(() => {
    if (!site) return [] as TrackedKeyword[];
    return site.keywords.filter(
      (k) => k.status === "tracking" || k.status === "targeting",
    );
  }, [site]);

  const ideasByParent = useMemo(() => {
    const map = new Map<string, TrackedKeyword[]>();
    if (!site) return map;
    for (const k of site.keywords) {
      if (k.status !== "idea" || !k.parentId) continue;
      const list = map.get(k.parentId) ?? [];
      list.push(k);
      map.set(k.parentId, list);
    }
    for (const [, list] of map) {
      list.sort((a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0));
    }
    return map;
  }, [site]);

  const orphanIdeas = useMemo(() => {
    if (!site) return [] as TrackedKeyword[];
    return site.keywords.filter(
      (k) => k.status === "idea" && (!k.parentId || !parents.some((p) => p.id === k.parentId)),
    );
  }, [site, parents]);

  const dismissed = useMemo(
    () => site?.keywords.filter((k) => k.status === "dismissed") ?? [],
    [site],
  );

  async function onCreateSite(e: FormEvent) {
    e.preventDefault();
    if (!siteName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api.createSite({
        name: siteName.trim(),
        domain: siteDomain.trim() || undefined,
      });
      setSiteName("");
      setSiteDomain("");
      await loadSites();
      await loadSite(created.id);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onAddKeywords(e: FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    const terms = parseTerms(keywordDraft);
    if (terms.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const detail = await api.addSiteKeywords(selectedId, { terms, enrich: true });
      setSite(detail);
      setKeywordDraft("");
      await loadSites();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onEnrichAll() {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.enrichSite(selectedId);
      setSite(res.site);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onFetchIdeas(keywordId: string) {
    if (!selectedId) return;
    setIdeasBusyId(keywordId);
    setError(null);
    try {
      const res = await api.fetchSiteKeywordIdeas(selectedId, keywordId, {
        limit: 30,
      });
      setSite(res.site);
      setExpandedParents((prev) => new Set(prev).add(keywordId));
      await loadSites();
    } catch (err) {
      setError(String(err));
    } finally {
      setIdeasBusyId(null);
    }
  }

  async function setKeywordStatus(
    keywordId: string,
    status: "tracking" | "targeting" | "idea" | "dismissed",
  ) {
    if (!selectedId) return;
    try {
      await api.updateSiteKeyword(selectedId, keywordId, { status });
      await loadSite(selectedId);
      await loadSites();
    } catch (err) {
      setError(String(err));
    }
  }

  async function onDeleteKeyword(keywordId: string) {
    if (!selectedId) return;
    if (!confirm("Remove this keyword?")) return;
    try {
      await api.deleteSiteKeyword(selectedId, keywordId);
      await loadSite(selectedId);
      await loadSites();
    } catch (err) {
      setError(String(err));
    }
  }

  async function onDeleteSite() {
    if (!selectedId || !site) return;
    if (!confirm(`Delete site “${site.name}” and all its keywords?`)) return;
    setBusy(true);
    try {
      await api.deleteSite(selectedId);
      setSite(null);
      setSelectedId(null);
      const list = await loadSites();
      if (list[0]) await loadSite(list[0].id);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  function toggleParent(id: string) {
    setExpandedParents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function renderKeywordRow(
    k: TrackedKeyword,
    opts?: { nested?: boolean; parentTerm?: string },
  ) {
    const ideaCount = ideasByParent.get(k.id)?.length ?? 0;
    const expanded = expandedParents.has(k.id);
    return (
      <tr
        key={k.id}
        className={`border-t border-zinc-800/80 ${opts?.nested ? "bg-zinc-950/40" : ""}`}
      >
        <td className="px-3 py-2.5">
          <div className={opts?.nested ? "pl-5" : ""}>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              {opts?.nested && (
                <span className="text-[11px] text-zinc-600">↳</span>
              )}
              <span className="font-medium text-zinc-100">{k.term}</span>
              <span
                className={`rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${statusTone(k.status)}`}
              >
                {k.status}
              </span>
            </div>
            {opts?.parentTerm && (
              <div className="mt-0.5 text-[11px] text-zinc-600">
                from “{opts.parentTerm}”
              </div>
            )}
          </div>
        </td>
        <td className="px-3 py-2.5 tabular-nums text-zinc-300">
          {k.searchVolume != null ? num(k.searchVolume) : "—"}
        </td>
        <td className="px-3 py-2.5 tabular-nums text-zinc-300">
          {k.cpc != null ? money(k.cpc) : "—"}
        </td>
        <td className="px-3 py-2.5 tabular-nums text-zinc-300">
          {adsCompPct(k.competition)}
        </td>
        <td className="px-3 py-2.5">
          <Sparkline data={k.monthlyTrend} tone="flat" />
        </td>
        <td className="px-3 py-2.5 text-right">
          <div className="flex flex-wrap justify-end gap-2">
            {(k.status === "tracking" || k.status === "targeting") && (
              <>
                <button
                  type="button"
                  disabled={ideasBusyId === k.id || busy}
                  onClick={() => void onFetchIdeas(k.id)}
                  className="text-xs text-sky-300 hover:underline disabled:opacity-50"
                >
                  {ideasBusyId === k.id
                    ? "Ideas…"
                    : ideaCount > 0
                      ? `More ideas`
                      : "Get ideas"}
                </button>
                {ideaCount > 0 && (
                  <button
                    type="button"
                    onClick={() => toggleParent(k.id)}
                    className="text-xs text-zinc-400 hover:underline"
                  >
                    {expanded ? "Hide" : `Show ${ideaCount}`}
                  </button>
                )}
                {k.status !== "targeting" ? (
                  <button
                    type="button"
                    onClick={() => void setKeywordStatus(k.id, "targeting")}
                    className="text-xs text-emerald-300 hover:underline"
                  >
                    Target
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void setKeywordStatus(k.id, "tracking")}
                    className="text-xs text-zinc-400 hover:underline"
                  >
                    Untarget
                  </button>
                )}
              </>
            )}
            {k.status === "idea" && (
              <>
                <button
                  type="button"
                  onClick={() => void setKeywordStatus(k.id, "tracking")}
                  className="text-xs text-emerald-300 hover:underline"
                >
                  Track
                </button>
                <button
                  type="button"
                  onClick={() => void setKeywordStatus(k.id, "targeting")}
                  className="text-xs text-emerald-300/80 hover:underline"
                >
                  Target
                </button>
                <Link
                  to={`/?seed=${encodeURIComponent(k.term)}`}
                  className="text-xs text-amber-300/90 hover:underline"
                >
                  Research
                </Link>
              </>
            )}
            {k.status !== "dismissed" && (
              <button
                type="button"
                onClick={() => void setKeywordStatus(k.id, "dismissed")}
                className="text-xs text-zinc-500 hover:text-rose-300"
              >
                Dismiss
              </button>
            )}
            {k.status === "dismissed" && (
              <button
                type="button"
                onClick={() => void setKeywordStatus(k.id, "tracking")}
                className="text-xs text-zinc-400 hover:underline"
              >
                Restore
              </button>
            )}
            <button
              type="button"
              onClick={() => void onDeleteKeyword(k.id)}
              className="text-xs text-zinc-600 hover:text-rose-300"
            >
              Delete
            </button>
          </div>
        </td>
      </tr>
    );
  }

  const showParents =
    statusFilter === "active" || statusFilter === "all" || statusFilter === "ideas";
  const showDismissed = statusFilter === "dismissed" || statusFilter === "all";
  const showOrphanIdeas =
    statusFilter === "ideas" || statusFilter === "all";

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="My sites"
        description="Track keywords for websites you already run, then pull related keyword ideas with live volume and CPC."
      />

      {error && (
        <div className="rounded-md border border-rose-900 bg-rose-950/40 px-3 py-2 text-sm text-rose-300">
          {error}
        </div>
      )}

      <Panel>
        <form
          onSubmit={onCreateSite}
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <label className="block flex-1">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-zinc-500">
              Site / product name
            </span>
            <input
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              placeholder="e.g. HabitKit, InvoicePanda"
              className="w-full rounded-md border border-zinc-700 bg-zinc-950/80 px-3 py-2.5 text-sm text-zinc-100 outline-none ring-emerald-500/30 transition focus:border-emerald-700 focus:ring"
            />
          </label>
          <label className="block flex-1">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-zinc-500">
              Domain (optional)
            </span>
            <input
              value={siteDomain}
              onChange={(e) => setSiteDomain(e.target.value)}
              placeholder="habitkit.com"
              className="w-full rounded-md border border-zinc-700 bg-zinc-950/80 px-3 py-2.5 text-sm text-zinc-100 outline-none ring-emerald-500/30 transition focus:border-emerald-700 focus:ring"
            />
          </label>
          <button
            type="submit"
            disabled={busy || !siteName.trim()}
            className="rounded-md bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {busy ? "Saving…" : "Add site"}
          </button>
        </form>
      </Panel>

      {sites.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {sites.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => void loadSite(s.id).catch((e) => setError(String(e)))}
              className={`rounded-md border px-3 py-1.5 text-sm transition ${
                selectedId === s.id
                  ? "border-emerald-700/70 bg-emerald-950/40 text-emerald-200"
                  : "border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
              }`}
            >
              {s.name}
              <span className="ml-2 tabular-nums text-zinc-600">
                {s.keywordCount}
              </span>
            </button>
          ))}
        </div>
      )}

      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-10 w-full" />
          ))}
        </div>
      )}

      {!loading && sites.length === 0 && (
        <EmptyState
          title="No sites yet"
          description="Add a website or product, then paste the keywords you already target or rank for."
        />
      )}

      {site && (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-zinc-100">{site.name}</h2>
              {site.domain && (
                <p className="text-sm text-zinc-500">{site.domain}</p>
              )}
              <p className="mt-1 text-xs text-zinc-600">
                {site.stats.tracking} tracking · {site.stats.targeting} targeting ·{" "}
                {site.stats.ideas} ideas
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void onEnrichAll()}
                className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100 disabled:opacity-50"
              >
                Refresh metrics
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void onDeleteSite()}
                className="rounded-md border border-zinc-800 px-3 py-1.5 text-xs text-zinc-500 transition hover:border-rose-900/60 hover:text-rose-300"
              >
                Delete site
              </button>
            </div>
          </div>

          <Panel>
            <form onSubmit={onAddKeywords} className="space-y-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Add keywords you already use
                </span>
                <textarea
                  value={keywordDraft}
                  onChange={(e) => setKeywordDraft(e.target.value)}
                  rows={3}
                  placeholder={"habit tracker app\nbest habit tracker\nmorning routine checklist"}
                  className="w-full rounded-md border border-zinc-700 bg-zinc-950/80 px-3 py-2.5 text-sm text-zinc-100 outline-none ring-emerald-500/30 transition focus:border-emerald-700 focus:ring"
                />
              </label>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-zinc-600">
                  One per line or comma-separated. Metrics enrich automatically.
                </p>
                <button
                  type="submit"
                  disabled={busy || !keywordDraft.trim()}
                  className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {busy ? "Adding…" : "Add keywords"}
                </button>
              </div>
            </form>
          </Panel>

          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["active", "Tracking"],
                ["ideas", "Ideas"],
                ["dismissed", "Dismissed"],
                ["all", "All"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setStatusFilter(id)}
                className={`rounded border px-2.5 py-1 text-xs transition ${
                  statusFilter === id
                    ? "border-zinc-600 bg-zinc-800 text-zinc-100"
                    : "border-zinc-800 text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="table-scroll max-h-[70vh]">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2.5">Keyword</th>
                  <th className="px-3 py-2.5">Volume</th>
                  <th className="px-3 py-2.5">CPC</th>
                  <th className="px-3 py-2.5">Ads</th>
                  <th className="px-3 py-2.5">12-mo</th>
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {showParents &&
                  parents.length === 0 &&
                  statusFilter === "active" && (
                    <tr>
                      <td colSpan={6}>
                        <EmptyState
                          title="No tracked keywords yet"
                          description="Paste the terms this site already targets, then click Get ideas on any row."
                        />
                      </td>
                    </tr>
                  )}
                {showParents &&
                  parents.map((p) => (
                    <Fragment key={p.id}>
                      {statusFilter !== "ideas" && renderKeywordRow(p)}
                      {(statusFilter === "ideas" ||
                        expandedParents.has(p.id)) &&
                        (ideasByParent.get(p.id) ?? []).map((idea) =>
                          renderKeywordRow(idea, {
                            nested: true,
                            parentTerm: p.term,
                          }),
                        )}
                    </Fragment>
                  ))}
                {showOrphanIdeas &&
                  orphanIdeas.map((idea) =>
                    renderKeywordRow(idea, { nested: true }),
                  )}
                {showDismissed &&
                  dismissed.map((k) => renderKeywordRow(k))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
