import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  api,
  money,
  type CostEstimate,
  type NicheListItem,
  type RecommendationsResponse,
} from "../api";
import StatusBadge from "../components/StatusBadge";
import PageHeader from "../components/PageHeader";
import EmptyState from "../components/EmptyState";
import Panel from "../components/Panel";
import RecommendationsPanel from "../components/RecommendationsPanel";
import SeedSearchPanel from "../components/SeedSearchPanel";
import { relativeTime } from "../lib/format";

const IN_FLIGHT = new Set([
  "PENDING",
  "EXPANDING",
  "ENRICHING",
  "CLASSIFYING",
  "SCORING",
]);

export default function NicheListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [seedTerm, setSeedTerm] = useState("");
  const [niches, setNiches] = useState<NicheListItem[]>([]);
  const [globalCost, setGlobalCost] = useState(0);
  const [estimate, setEstimate] = useState<CostEstimate | null>(null);
  const [recs, setRecs] = useState<RecommendationsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fromQuery = searchParams.get("seed");
    if (!fromQuery) return;
    setSeedTerm(fromQuery);
    const next = new URLSearchParams(searchParams);
    next.delete("seed");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const anyInFlight = useMemo(
    () => niches.some((n) => IN_FLIGHT.has(n.status)),
    [niches],
  );

  const runningCount = useMemo(
    () => niches.filter((n) => IN_FLIGHT.has(n.status)).length,
    [niches],
  );

  async function refresh() {
    const list = await api.listNiches();
    setNiches(list.niches);
    setGlobalCost(list.globalCost);
    setEstimate(list.costEstimate);
    // Recommendations are optional — never block the niche table on this call.
    try {
      setRecs(await api.recommendations());
    } catch {
      /* keep prior recs */
    }
  }

  useEffect(() => {
    refresh()
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!anyInFlight) return;
    const id = window.setInterval(() => {
      refresh().catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(id);
  }, [anyInFlight]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!seedTerm.trim()) return;
    if (estimate) {
      const ok = confirm(
        `Run pipeline for "${seedTerm.trim()}"?\n\nEstimated API spend: ${money(estimate.low, 2)} – ${money(estimate.high, 2)}\n(assumes ~${estimate.assumedKeywords} keywords; enrich may be cheaper with cache)`,
      );
      if (!ok) return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.createNiche(seedTerm.trim());
      setSeedTerm("");
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function onRetry(id: string) {
    await api.retry(id);
    await refresh();
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this niche and all related data?")) return;
    await api.remove(id);
    await refresh();
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="Niches"
        description="Seed a term, expand related keywords with volume/CPC, and cluster them into research themes."
      />

      <Panel>
        <form
          onSubmit={onSubmit}
          className="flex flex-col gap-3 sm:flex-row sm:items-stretch"
        >
          <label className="block flex-1">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-zinc-500">
              Seed term
            </span>
            <input
              value={seedTerm}
              onChange={(e) => setSeedTerm(e.target.value)}
              placeholder="e.g. HOA management, dental billing…"
              autoFocus
              className="w-full rounded-md border border-zinc-700 bg-zinc-950/80 px-3 py-2.5 text-sm text-zinc-100 outline-none ring-emerald-500/30 transition focus:border-emerald-700 focus:ring"
            />
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={submitting || !seedTerm.trim()}
              className="w-full rounded-md bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
            >
              {submitting ? "Starting…" : "Run pipeline"}
            </button>
          </div>
        </form>

        {estimate && (
          <div className="mt-3 border-t border-zinc-800/80 pt-3 text-xs text-zinc-500">
            <span className="text-zinc-300">
              Est. run: {money(estimate.low, 2)} – {money(estimate.high, 2)}
            </span>
            <span className="mx-2 text-zinc-700">·</span>
            expand {money(estimate.breakdown.expandLow, 2)}–
            {money(estimate.breakdown.expandHigh, 2)}
            <span className="mx-2 text-zinc-700">·</span>
            enrich {money(estimate.breakdown.enrichLow, 2)}–
            {money(estimate.breakdown.enrichHigh, 2)}
            <span className="mx-2 text-zinc-700">·</span>
            classify {money(estimate.breakdown.classifyLow, 2)}–
            {money(estimate.breakdown.classifyHigh, 2)}
            <p className="mt-1 text-zinc-600">{estimate.note}</p>
          </div>
        )}
      </Panel>

      <SeedSearchPanel selectedSeed={seedTerm} onPick={setSeedTerm} />

      {recs && (
        <RecommendationsPanel
          niches={recs.niches}
          keywords={recs.keywords}
          selectedSeed={seedTerm}
          onPick={setSeedTerm}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
        <div className="flex items-center gap-3">
          <span>
            <span className="tabular-nums text-zinc-300">{niches.length}</span>{" "}
            niches
          </span>
          {runningCount > 0 && (
            <span className="inline-flex items-center gap-1.5 text-emerald-400/90">
              <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-emerald-400" />
              {runningCount} running
            </span>
          )}
        </div>
        <span>
          API spend{" "}
          <span className="tabular-nums text-zinc-300">
            {money(globalCost, 4)}
          </span>
        </span>
      </div>

      {error && (
        <div className="rounded-md border border-rose-900 bg-rose-950/40 px-3 py-2 text-sm text-rose-300">
          {error}
        </div>
      )}

      <div className="table-scroll">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2.5 font-medium">Seed</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 font-medium">Keywords</th>
              <th className="px-3 py-2.5 font-medium">Opportunities</th>
              <th className="px-3 py-2.5 font-medium">Updated</th>
              <th className="px-3 py-2.5 font-medium" />
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-t border-zinc-800/80">
                  <td className="px-3 py-3" colSpan={6}>
                    <div className="skeleton h-4 w-full max-w-md" />
                  </td>
                </tr>
              ))}
            {!loading && niches.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <EmptyState
                    title="No niches yet"
                    description="Pick a recommended niche above, or enter your own seed term to begin."
                  />
                </td>
              </tr>
            )}
            {niches.map((n) => (
              <tr key={n.id} className="border-t border-zinc-800/80">
                <td className="px-3 py-2.5">
                  <Link
                    to={`/niches/${n.id}`}
                    className="font-medium text-emerald-300 transition hover:text-emerald-200"
                  >
                    {n.seedTerm}
                  </Link>
                  {n.error && (
                    <div className="mt-0.5 max-w-md truncate text-xs text-rose-400">
                      {n.error}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <StatusBadge status={n.status} />
                </td>
                <td className="px-3 py-2.5 tabular-nums text-zinc-300">
                  {n.keywordCount}
                </td>
                <td className="px-3 py-2.5 tabular-nums text-zinc-300">
                  {n.opportunityCount}
                </td>
                <td
                  className="px-3 py-2.5 text-xs text-zinc-500"
                  title={new Date(n.updatedAt).toLocaleString()}
                >
                  {relativeTime(n.updatedAt)}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <div className="flex justify-end gap-3">
                    {n.status === "FAILED" && (
                      <button
                        type="button"
                        onClick={() => onRetry(n.id)}
                        className="text-xs text-amber-300 hover:underline"
                      >
                        Retry
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onDelete(n.id)}
                      className="text-xs text-zinc-600 transition hover:text-rose-300"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
