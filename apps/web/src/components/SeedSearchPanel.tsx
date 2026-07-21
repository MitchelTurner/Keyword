import { useEffect, useState } from "react";
import { api, num, type RecommendedKeyword } from "../api";
import Panel from "./Panel";

const inputClass =
  "mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950/80 px-2.5 py-1.5 text-sm text-zinc-100 outline-none ring-emerald-500/25 focus:border-emerald-700 focus:ring";

export default function SeedSearchPanel({
  selectedSeed,
  onPick,
}: {
  selectedSeed: string;
  onPick: (term: string) => void;
}) {
  const [q, setQ] = useState("");
  const [minVolume, setMinVolume] = useState(500);
  const [maxCompetition, setMaxCompetition] = useState(0.45);
  const [keywords, setKeywords] = useState<RecommendedKeyword[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      api
        .searchSeeds({
          q,
          minVolume,
          maxCompetition,
          limit: 40,
        })
        .then((res) => {
          if (cancelled) return;
          setKeywords(res.keywords);
        })
        .catch((err) => {
          if (cancelled) return;
          setError(String(err));
          setKeywords([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [q, minVolume, maxCompetition]);

  return (
    <Panel
      title="Search seed keywords"
      hint="From your enriched data — high volume, low competition"
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-xs text-zinc-500 sm:col-span-1">
          Contains
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. cleaning, solar…"
            className={inputClass}
          />
        </label>
        <label className="block text-xs text-zinc-500">
          Min volume
          <input
            type="number"
            min={100}
            step={100}
            value={minVolume}
            onChange={(e) => setMinVolume(Number(e.target.value) || 0)}
            className={inputClass}
          />
        </label>
        <label className="block text-xs text-zinc-500">
          Max competition
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={maxCompetition}
            onChange={(e) => setMaxCompetition(Number(e.target.value) || 0)}
            className={inputClass}
          />
        </label>
      </div>

      {error && (
        <p className="mt-3 text-xs text-rose-400">{error}</p>
      )}

      <div className="mt-3 table-scroll">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-2 py-2 font-medium">Keyword</th>
              <th className="px-2 py-2 font-medium">Volume</th>
              <th className="px-2 py-2 font-medium">Comp</th>
              <th className="px-2 py-2 font-medium">From</th>
              <th className="px-2 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="border-t border-zinc-800/80">
                  <td className="px-2 py-2.5" colSpan={5}>
                    <div className="skeleton h-4 w-full max-w-md" />
                  </td>
                </tr>
              ))}
            {!loading && keywords.length === 0 && (
              <tr className="border-t border-zinc-800/80">
                <td colSpan={5} className="px-2 py-4 text-xs text-zinc-500">
                  No matching keywords yet. Run a few niches to build volume and
                  competition data, then search here for seed ideas.
                </td>
              </tr>
            )}
            {!loading &&
              keywords.map((k) => (
                <tr
                  key={k.term}
                  className={`border-t border-zinc-800/80 ${
                    selectedSeed === k.term ? "bg-emerald-950/20" : ""
                  }`}
                >
                  <td className="px-2 py-2 font-medium text-zinc-100">
                    {k.term}
                  </td>
                  <td className="px-2 py-2 tabular-nums text-zinc-300">
                    {k.volume != null ? num(k.volume) : "—"}
                  </td>
                  <td className="px-2 py-2 tabular-nums text-zinc-300">
                    {k.competition != null ? k.competition.toFixed(2) : "—"}
                  </td>
                  <td className="px-2 py-2 text-xs text-zinc-500">
                    {k.nicheSeed ?? "—"}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => onPick(k.term)}
                      className="text-xs text-emerald-300 transition hover:text-emerald-200"
                    >
                      Use seed
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
