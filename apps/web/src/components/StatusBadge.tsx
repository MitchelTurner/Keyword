const STYLES: Record<string, string> = {
  PENDING: "bg-zinc-800 text-zinc-300",
  EXPANDING: "bg-sky-950 text-sky-300",
  ENRICHING: "bg-teal-950 text-teal-300",
  CLASSIFYING: "bg-cyan-950 text-cyan-300",
  SCORING: "bg-amber-950 text-amber-300",
  DONE: "bg-emerald-950 text-emerald-300",
  FAILED: "bg-rose-950 text-rose-300",
};

const IN_FLIGHT = new Set([
  "PENDING",
  "EXPANDING",
  "ENRICHING",
  "CLASSIFYING",
  "SCORING",
]);

export default function StatusBadge({ status }: { status: string }) {
  const running = IN_FLIGHT.has(status);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${STYLES[status] ?? STYLES.PENDING}`}
    >
      {running && (
        <span
          className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-current"
          aria-hidden
        />
      )}
      {status}
    </span>
  );
}
