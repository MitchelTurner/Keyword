type VerdictLabel = "build" | "watch" | "kill";

export default function VerdictBadge({
  verdict,
  score,
  compact = false,
}: {
  verdict: VerdictLabel;
  score: number;
  compact?: boolean;
}) {
  const styles =
    verdict === "build"
      ? "bg-emerald-950 text-emerald-300 ring-1 ring-emerald-800/60"
      : verdict === "watch"
        ? "bg-amber-950 text-amber-300 ring-1 ring-amber-800/50"
        : "bg-rose-950 text-rose-300 ring-1 ring-rose-900/50";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide ${styles}`}
      title={`Decision score ${score.toFixed(1)}/100`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          verdict === "build"
            ? "bg-emerald-400"
            : verdict === "watch"
              ? "bg-amber-400"
              : "bg-rose-400"
        }`}
        aria-hidden
      />
      {verdict}
      {!compact && (
        <span className="tabular-nums opacity-80">{score.toFixed(0)}</span>
      )}
    </span>
  );
}
