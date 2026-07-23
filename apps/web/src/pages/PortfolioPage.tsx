import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, money, num, type PortfolioItem } from "../api";
import Sparkline from "../components/Sparkline";
import TrendBadge from "../components/TrendBadge";
import RubricBadge from "../components/RubricBadge";
import VerdictBadge from "../components/VerdictBadge";
import PageHeader from "../components/PageHeader";
import EmptyState from "../components/EmptyState";

export default function PortfolioPage() {
  const [items, setItems] = useState<PortfolioItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .portfolio()
      .then((data) => setItems(data.items))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    const pass = items.filter((i) => i.decision.rubric.pass).length;
    const build = items.filter((i) => i.decision.verdict.verdict === "build").length;
    const building = items.filter((i) => i.reviewStatus === "building").length;
    const watching = items.filter((i) => i.reviewStatus === "watching").length;
    return { pass, build, building, watching, total: items.length };
  }, [items]);

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="Portfolio"
        description="Pinned, watching, and building themes across niches — sorted by Build/Watch/Kill score."
      />

      {!loading && items.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {(
            [
              ["Tracked", stats.total],
              ["Build verdict", stats.build],
              ["Pass rubric", stats.pass],
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

      {error && (
        <div className="rounded-md border border-rose-900 bg-rose-950/40 px-3 py-2 text-sm text-rose-300">
          {error}
        </div>
      )}

      <div className="table-scroll max-h-[70vh]">
        <table className="w-full min-w-[1080px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2.5">Theme</th>
              <th className="px-3 py-2.5">Niche</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5">Verdict</th>
              <th className="px-3 py-2.5">Rubric</th>
              <th className="px-3 py-2.5">Trend</th>
              <th className="px-3 py-2.5">12-mo</th>
              <th className="px-3 py-2.5">Volume</th>
              <th className="px-3 py-2.5">Mo. floor</th>
              <th className="px-3 py-2.5">Demand</th>
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
            {!loading && items.length === 0 && (
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
            {items.map((item) => (
              <tr key={item.id} className="border-t border-zinc-800/80">
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
                    {item.buyerType} · {item.intent}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-zinc-300">
                  {item.nicheSeedTerm}
                </td>
                <td className="px-3 py-2.5">
                  <span className="rounded bg-zinc-800/80 px-1.5 py-0.5 text-[11px] capitalize text-zinc-300">
                    {item.reviewStatus === "none" ? "pinned" : item.reviewStatus}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <VerdictBadge
                    verdict={item.decision.verdict.verdict}
                    score={item.decision.verdict.score}
                  />
                </td>
                <td className="px-3 py-2.5">
                  <RubricBadge
                    pass={item.decision.rubric.pass}
                    checks={item.decision.rubric.checks}
                  />
                </td>
                <td className="px-3 py-2.5">
                  <TrendBadge trend={item.trend} />
                </td>
                <td className="px-3 py-2.5">
                  <Sparkline
                    data={item.trend.series}
                    tone={item.trend.direction}
                  />
                </td>
                <td className="px-3 py-2.5 tabular-nums text-zinc-300">
                  {num(item.totalVolume)}
                </td>
                <td className="px-3 py-2.5 tabular-nums text-zinc-300">
                  {money(item.monthlyPriceFloor)}
                </td>
                <td className="px-3 py-2.5 tabular-nums font-medium text-emerald-300">
                  {item.demandScore.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
