export default function RubricBadge({
  pass,
  score,
}: {
  pass: boolean;
  score: number;
}) {
  const pct = Math.round(score * 100);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide ${
        pass
          ? "bg-emerald-950 text-emerald-300 ring-1 ring-emerald-800/60"
          : pct >= 50
            ? "bg-amber-950 text-amber-300 ring-1 ring-amber-800/50"
            : "bg-rose-950 text-rose-300 ring-1 ring-rose-900/50"
      }`}
      title={`${pct}% of rubric checks passed`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          pass ? "bg-emerald-400" : pct >= 50 ? "bg-amber-400" : "bg-rose-400"
        }`}
        aria-hidden
      />
      {pass ? "Pass" : "Fail"} · {pct}%
    </span>
  );
}
