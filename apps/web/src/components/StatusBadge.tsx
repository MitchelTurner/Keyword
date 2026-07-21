const STYLES: Record<string, string> = {
  PENDING: "bg-zinc-800 text-zinc-300",
  EXPANDING: "bg-sky-950 text-sky-300",
  ENRICHING: "bg-indigo-950 text-indigo-300",
  CLASSIFYING: "bg-violet-950 text-violet-300",
  SCORING: "bg-amber-950 text-amber-300",
  DONE: "bg-emerald-950 text-emerald-300",
  FAILED: "bg-rose-950 text-rose-300",
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex rounded px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${STYLES[status] ?? STYLES.PENDING}`}
    >
      {status}
    </span>
  );
}
