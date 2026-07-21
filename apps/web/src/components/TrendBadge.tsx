import type { TrendInfo } from "../api";

const STYLES: Record<TrendInfo["direction"], string> = {
  rising: "text-emerald-400",
  flat: "text-zinc-400",
  declining: "text-rose-400",
  unknown: "text-zinc-600",
};

const ARROWS: Record<TrendInfo["direction"], string> = {
  rising: "↑",
  flat: "→",
  declining: "↓",
  unknown: "·",
};

export default function TrendBadge({ trend }: { trend: TrendInfo }) {
  const pct =
    trend.changePct == null
      ? ""
      : ` ${trend.changePct > 0 ? "+" : ""}${trend.changePct.toFixed(0)}%`;

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs tabular-nums ${STYLES[trend.direction]}`}
      title={`Trend score ${trend.score}`}
    >
      <span aria-hidden>{ARROWS[trend.direction]}</span>
      <span className="capitalize">{trend.direction}</span>
      {pct && <span className="text-zinc-500">{pct}</span>}
    </span>
  );
}
