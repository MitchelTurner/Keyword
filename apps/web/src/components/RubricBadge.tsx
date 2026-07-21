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
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide ${
        pass
          ? "bg-emerald-950 text-emerald-300"
          : pct >= 50
            ? "bg-amber-950 text-amber-300"
            : "bg-rose-950 text-rose-300"
      }`}
      title={`${pct}% of rubric checks passed`}
    >
      {pass ? "Pass" : "Fail"} · {pct}%
    </span>
  );
}
