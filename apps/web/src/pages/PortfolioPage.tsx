import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  money,
  num,
  type OpportunityOutcome,
  type PortfolioItem,
} from "../api";
import Sparkline from "../components/Sparkline";
import TrendBadge from "../components/TrendBadge";
import RubricBadge from "../components/RubricBadge";
import VerdictBadge from "../components/VerdictBadge";
import PageHeader from "../components/PageHeader";
import EmptyState from "../components/EmptyState";

const REVIEW_OPTIONS = [
  { value: "none", label: "—" },
  { value: "watching", label: "Watching" },
  { value: "building", label: "Building" },
  { value: "passed", label: "Passed" },
] as const;

const OUTCOME_OPTIONS = [
  { value: "none", label: "—" },
  { value: "built", label: "Built" },
  { value: "ranked", label: "Ranked" },
  { value: "abandoned", label: "Abandoned" },
  { value: "revenue_low", label: "Rev · low" },
  { value: "revenue_mid", label: "Rev · mid" },
  { value: "revenue_high", label: "Rev · high" },
] as const;

type Filter = "all" | "build" | "watch" | "kill";

export default function PortfolioPage() {
  const [items, setItems] = useState<PortfolioItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function refresh() {
    const data = await api.portfolio();
    setItems(data.items);
  }

  useEffect(() => {
    refresh()
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    const pass = items.filter((i) => i.decision.rubric.pass).length;
    const build = items.filter((i) => i.decision.verdict.verdict === "build").length;
    const withStrategy = items.filter((i) => i.strategyBrief).length;
    const building = items.filter((i) => i.reviewStatus === "building").length;
    const watching = items.filter((i) => i.reviewStatus === "watching").length;
    return { pass, build, withStrategy, building, watching, total: items.length };
  }, [items]);

  const visible = useMemo(() => {
    if (filter === "all") return items;
    return items.filter((i) => i.decision.verdict.verdict === filter);
  }, [items, filter]);

  async function patchItem(
    item: PortfolioItem,
    body: {
      pinned?: boolean;
      reviewStatus?: string;
      outcome?: OpportunityOutcome;
    },
  ) {
    setBusyId(item.id);
    setError(null);
    try {
      const updated = await api.updateOpportunity(item.nicheId, item.id, body);
      setItems((prev) =>
        prev.map((row) =>
          row.id === item.id
            ? {
                ...row,
                ...updated,
                nicheId: item.nicheId,
                nicheSeedTerm: item.nicheSeedTerm,
                nicheStatus: item.nicheStatus,
                boardRank: item.boardRank,
                decision: updated.decision ?? row.decision,
              }
            : row,
        ),
      );
    } catch (err) {
      setError(String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function promote(item: PortfolioItem) {
    setBusyId(item.id);
    setError(null);
    try {
      await api.promoteOpportunity(item.nicheId, item.id, { keywordLimit: 12 });
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function generateStrategy(item: PortfolioItem) {
    setBusyId(item.id);
    setError(null);
    try {
      const result = await api.generateStrategy(item.nicheId, item.id);
      setItems((prev) =>
        prev.map((row) =>
          row.id === item.id
            ? {
                ...row,
                strategyBrief: result.strategyBrief,
                strategyGeneratedAt: result.strategyGeneratedAt,
              }
            : row,
        ),
      );
    } catch (err) {
      setError(String(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="Portfolio"
        description="Decision inbox — Builds ranked by priority (TAM × softness ÷ difficulty). Act without opening each niche."
      />

      {!loading && items.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {(
            [
              ["Tracked", stats.total],
              ["Build verdict", stats.build],
              ["With strategy", stats.withStrategy],
              ["Watching", stats.watching],
              ["Building", stats.building],
            ] as const
          ).map(([label, value]) => (
            <div
              key={label}
              className="rounded-lg border border-zinc-800/90 bg-zinc-900/35 px-3 py-2.5"
            >
              <div className="text-[11px] uppercase tracking-wide text-zinc-500">
                {label}
              </div>
              <div className="mt-1 text-xl font-semibold tabular-nums text-zinc-100">
                {value}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ["all", "All"],
            ["build", "Build"],
            ["watch", "Watch"],
            ["kill", "Kill"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`rounded-md border px-2.5 py-1 text-xs transition ${
              filter === key
                ? "border-emerald-700 bg-emerald-950/40 text-emerald-300"
                : "border-zinc-800 text-zinc-400 hover:border-zinc-600"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-md border border-rose-900 bg-rose-950/40 px-3 py-2 text-sm text-rose-300">
          {error}
        </div>
      )}

      <div className="table-scroll max-h-[70vh]">
        <table className="w-full min-w-[1280px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2.5">#</th>
              <th className="px-3 py-2.5">Theme</th>
              <th className="px-3 py-2.5">Verdict</th>
              <th className="px-3 py-2.5">KD / Soft</th>
              <th className="px-3 py-2.5">Competitors</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5">Outcome</th>
              <th className="px-3 py-2.5">Strategy</th>
              <th className="px-3 py-2.5">Volume</th>
              <th className="px-3 py-2.5">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-t border-zinc-800/80">
                  <td className="px-3 py-3" colSpan={10}>
                    <div className="skeleton h-4 w-full" />
                  </td>
                </tr>
              ))}
            {!loading && visible.length === 0 && (
              <tr>
                <td colSpan={10}>
                  <EmptyState
                    title="Watchlist is empty"
                    description="Pin an opportunity or set review status to watching/building from a niche detail page."
                    action={
                      <Link
                        to="/"
                        className="text-sm text-emerald-300 hover:underline"
                      >
                        Browse niches →
                      </Link>
                    }
                  />
                </td>
              </tr>
            )}
            {visible.map((item) => {
              const busy = busyId === item.id;
              const v = item.decision.verdict;
              return (
                <tr key={item.id} className="border-t border-zinc-800/80 align-top">
                  <td className="px-3 py-2.5 tabular-nums text-zinc-500">
                    {item.boardRank ?? "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <Link
                      to={`/niches/${item.nicheId}`}
                      className="font-medium text-emerald-300 transition hover:text-emerald-200"
                    >
                      {item.pinned && (
                        <span className="mr-1 text-amber-400" aria-hidden>
                          ★
                        </span>
                      )}
                      {item.productDescription}
                    </Link>
                    <div className="text-[11px] text-zinc-500">
                      {item.nicheSeedTerm} · {item.buyerType} · {item.intent}
                    </div>
                    {item.decision.diff && (
                      <div className="mt-0.5 text-[11px] text-amber-400/90">
                        {item.decision.diff.summary}
                      </div>
                    )}
                    {v.contentGap && v.contentGap.score >= 0.55 && (
                      <div className="mt-0.5 text-[11px] text-emerald-400/80">
                        Content gap wedge
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <VerdictBadge verdict={v.verdict} score={v.score} />
                    <div className="mt-1 text-[11px] tabular-nums text-zinc-500">
                      pri {v.priorityScore.toFixed(2)}
                    </div>
                    <div className="mt-1">
                      <RubricBadge
                        pass={item.decision.rubric.pass}
                        checks={item.decision.rubric.checks}
                      />
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-xs tabular-nums text-zinc-300">
                    <div>
                      KD{" "}
                      {item.keywordDifficulty != null
                        ? item.keywordDifficulty.toFixed(0)
                        : "—"}
                    </div>
                    <div className="text-zinc-500">
                      soft{" "}
                      {v.organicSoftness != null
                        ? `${(v.organicSoftness * 100).toFixed(0)}%`
                        : "—"}
                    </div>
                    <div className="mt-1">
                      <TrendBadge trend={item.trend} />
                    </div>
                    <Sparkline
                      data={item.trend.series}
                      tone={item.trend.direction}
                    />
                  </td>
                  <td className="px-3 py-2.5 text-xs text-zinc-400">
                    {v.competitors ? (
                      <>
                        <span className="capitalize text-zinc-200">
                          {v.competitors.beatability}
                        </span>
                        <div className="mt-0.5 line-clamp-2">
                          {v.competitors.summary}
                        </div>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <select
                      value={item.reviewStatus}
                      disabled={busy}
                      onChange={(e) =>
                        void patchItem(item, {
                          reviewStatus: e.target.value,
                        })
                      }
                      className="w-full rounded-md border border-zinc-700 bg-zinc-950/80 px-1.5 py-1 text-xs text-zinc-200"
                    >
                      {REVIEW_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2.5">
                    <select
                      value={item.outcome ?? "none"}
                      disabled={busy}
                      onChange={(e) =>
                        void patchItem(item, {
                          outcome: e.target.value as OpportunityOutcome,
                        })
                      }
                      className="w-full rounded-md border border-zinc-700 bg-zinc-950/80 px-1.5 py-1 text-xs text-zinc-200"
                    >
                      {OUTCOME_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-zinc-400">
                    {item.strategyBrief ? (
                      <span className="text-emerald-300/90" title={item.strategyBrief.entryStrategy}>
                        Ready
                        {item.strategyBrief.killCriteria && (
                          <span className="mt-0.5 block line-clamp-2 text-[11px] text-rose-300/80">
                            Kill: {item.strategyBrief.killCriteria}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-zinc-600">None</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-zinc-300">
                    {num(item.totalVolume)}
                    <div className="text-[11px] text-zinc-500">
                      {money(item.monthlyPriceFloor)}/mo
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void promote(item)}
                        className="rounded border border-emerald-800 px-2 py-0.5 text-[11px] text-emerald-300 hover:border-emerald-600 disabled:opacity-40"
                      >
                        Promote
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void generateStrategy(item)}
                        className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-300 hover:border-zinc-500 disabled:opacity-40"
                      >
                        {item.strategyBrief ? "Regen strategy" : "Strategy"}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void patchItem(item, { pinned: !item.pinned })
                        }
                        className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-400 hover:border-zinc-500 disabled:opacity-40"
                      >
                        {item.pinned ? "Unpin" : "Pin"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
