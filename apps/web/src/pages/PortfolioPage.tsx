import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, money, num, type PortfolioItem } from "../api";
import Sparkline from "../components/Sparkline";
import TrendBadge from "../components/TrendBadge";
import RubricBadge from "../components/RubricBadge";

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-100">Portfolio</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Pinned, watching, and building opportunities across all niches —
          sorted by demand score.
        </p>
      </div>

      {error && (
        <div className="rounded border border-rose-900 bg-rose-950/40 px-3 py-2 text-sm text-rose-300">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded border border-zinc-800">
        <table className="w-full min-w-[1080px] text-left text-sm">
          <thead className="bg-zinc-900/80 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2">Niche</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Rubric</th>
              <th className="px-3 py-2">Trend</th>
              <th className="px-3 py-2">12-mo</th>
              <th className="px-3 py-2">Volume</th>
              <th className="px-3 py-2">Mo. floor</th>
              <th className="px-3 py-2">Demand</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-zinc-500">
                  Loading portfolio…
                </td>
              </tr>
            )}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-zinc-500">
                  No watchlist items yet. Pin an opportunity or set status to
                  watching/building.
                </td>
              </tr>
            )}
            {items.map((item) => (
              <tr key={item.id} className="border-t border-zinc-800/80">
                <td className="px-3 py-2">
                  <Link
                    to={`/niches/${item.nicheId}`}
                    className="font-medium text-emerald-300 hover:underline"
                  >
                    {item.pinned && (
                      <span className="mr-1 text-amber-400">★</span>
                    )}
                    {item.productDescription}
                  </Link>
                  <div className="text-[11px] text-zinc-500">
                    {item.buyerType} · {item.intent}
                  </div>
                </td>
                <td className="px-3 py-2 text-zinc-300">{item.nicheSeedTerm}</td>
                <td className="px-3 py-2 text-zinc-400">
                  {item.reviewStatus === "none" ? "pinned" : item.reviewStatus}
                </td>
                <td className="px-3 py-2">
                  <RubricBadge
                    pass={item.decision.rubric.pass}
                    score={item.decision.rubric.score}
                  />
                </td>
                <td className="px-3 py-2">
                  <TrendBadge trend={item.trend} />
                </td>
                <td className="px-3 py-2">
                  <Sparkline data={item.trend.series} />
                </td>
                <td className="px-3 py-2 tabular-nums">{num(item.totalVolume)}</td>
                <td className="px-3 py-2 tabular-nums">
                  {money(item.monthlyPriceFloor)}
                </td>
                <td className="px-3 py-2 tabular-nums font-medium text-emerald-300">
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
