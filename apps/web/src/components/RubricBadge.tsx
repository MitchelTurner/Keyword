export default function RubricBadge({
  pass,
  checks,
}: {
  pass: boolean;
  checks: Array<{ pass: boolean }>;
}) {
  const passed = checks.filter((c) => c.pass).length;
  const total = checks.length;
  const near = !pass && total > 0 && passed / total >= 0.6;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide ${
        pass
          ? "bg-emerald-950 text-emerald-300 ring-1 ring-emerald-800/60"
          : near
            ? "bg-amber-950 text-amber-300 ring-1 ring-amber-800/50"
            : "bg-rose-950 text-rose-300 ring-1 ring-rose-900/50"
      }`}
      title={
        pass
          ? "All rubric checks passed"
          : `${passed}/${total} checks passed — must clear every threshold to pass`
      }
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          pass ? "bg-emerald-400" : near ? "bg-amber-400" : "bg-rose-400"
        }`}
        aria-hidden
      />
      {pass ? "Pass" : near ? "Near" : "Fail"} · {passed}/{total}
    </span>
  );
}
