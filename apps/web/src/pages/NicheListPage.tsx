import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, money, type CostEstimate, type NicheListItem } from "../api";
import StatusBadge from "../components/StatusBadge";

const IN_FLIGHT = new Set([
  "PENDING",
  "EXPANDING",
  "ENRICHING",
  "CLASSIFYING",
  "SCORING",
]);

export default function NicheListPage() {
  const [seedTerm, setSeedTerm] = useState("");
  const [niches, setNiches] = useState<NicheListItem[]>([]);
  const [globalCost, setGlobalCost] = useState(0);
  const [estimate, setEstimate] = useState<CostEstimate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const anyInFlight = useMemo(
    () => niches.some((n) => IN_FLIGHT.has(n.status)),
    [niches],
  );

  async function refresh() {
    const data = await api.listNiches();
    setNiches(data.niches);
    setGlobalCost(data.globalCost);
    setEstimate(data.costEstimate);
  }

  useEffect(() => {
    refresh().catch((e) => setError(String(e)));
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
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-100">Niches</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Seed a term, expand the keyword universe, and rank software product
          opportunities.
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-2 sm:flex-row sm:items-center"
      >
        <input
          value={seedTerm}
          onChange={(e) => setSeedTerm(e.target.value)}
          placeholder="Enter a seed term"
          className="w-full flex-1 rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none ring-emerald-500/40 focus:ring"
        />
        <button
          type="submit"
          disabled={submitting || !seedTerm.trim()}
          className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-zinc-950 disabled:opacity-50"
        >
          {submitting ? "Starting…" : "Run"}
        </button>
      </form>

      {estimate && (
        <div className="rounded border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-xs text-zinc-400">
          <span className="text-zinc-300">
            Est. run cost: {money(estimate.low, 2)} – {money(estimate.high, 2)}
          </span>
          <span className="mx-2 text-zinc-600">·</span>
          expand {money(estimate.breakdown.expandLow, 2)}–
          {money(estimate.breakdown.expandHigh, 2)}
          <span className="mx-2 text-zinc-600">·</span>
          enrich {money(estimate.breakdown.enrichLow, 2)}–
          {money(estimate.breakdown.enrichHigh, 2)}
          <span className="mx-2 text-zinc-600">·</span>
          classify {money(estimate.breakdown.classifyLow, 2)}–
          {money(estimate.breakdown.classifyHigh, 2)}
          <div className="mt-1 text-zinc-600">{estimate.note}</div>
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>{niches.length} niches</span>
        <span>API spend logged: {money(globalCost, 4)}</span>
      </div>

      {error && (
        <div className="rounded border border-rose-900 bg-rose-950/40 px-3 py-2 text-sm text-rose-300">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded border border-zinc-800">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-zinc-900/80 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2 font-medium">Seed</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Keywords</th>
              <th className="px-3 py-2 font-medium">Opportunities</th>
              <th className="px-3 py-2 font-medium">Updated</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {niches.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-8 text-center text-zinc-500"
                >
                  No niches yet. Enter a seed term to begin.
                </td>
              </tr>
            )}
            {niches.map((n) => (
              <tr key={n.id} className="border-t border-zinc-800/80">
                <td className="px-3 py-2">
                  <Link
                    to={`/niches/${n.id}`}
                    className="font-medium text-emerald-300 hover:underline"
                  >
                    {n.seedTerm}
                  </Link>
                  {n.error && (
                    <div className="mt-0.5 max-w-md truncate text-xs text-rose-400">
                      {n.error}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2">
                  <StatusBadge status={n.status} />
                </td>
                <td className="px-3 py-2 tabular-nums text-zinc-300">
                  {n.keywordCount}
                </td>
                <td className="px-3 py-2 tabular-nums text-zinc-300">
                  {n.opportunityCount}
                </td>
                <td className="px-3 py-2 text-xs text-zinc-500">
                  {new Date(n.updatedAt).toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="flex justify-end gap-2">
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
                      className="text-xs text-zinc-500 hover:text-rose-300"
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
