const STAGES = [
  "PENDING",
  "EXPANDING",
  "ENRICHING",
  "CLASSIFYING",
  "SCORING",
  "DONE",
] as const;

export default function PipelineProgress({ status }: { status: string }) {
  if (status === "FAILED") {
    return (
      <div className="rounded-lg border border-rose-900/70 bg-rose-950/30 px-3 py-2 text-xs text-rose-300">
        Pipeline failed — retry the failed stage or re-classify from stored data.
      </div>
    );
  }

  const idx = STAGES.indexOf(status as (typeof STAGES)[number]);
  if (idx < 0 || status === "DONE") return null;

  return (
    <div className="animate-fade-up rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-3">
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="font-medium text-zinc-300">Pipeline running</span>
        <span className="tabular-nums text-zinc-500">
          {Math.max(idx, 0) + 1}/{STAGES.length - 1}
        </span>
      </div>
      <div className="flex gap-1">
        {STAGES.slice(0, -1).map((stage, i) => {
          const done = i < idx;
          const current = i === idx;
          return (
            <div
              key={stage}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                done
                  ? "bg-emerald-500"
                  : current
                    ? "animate-pulse-soft bg-emerald-400/80"
                    : "bg-zinc-800"
              }`}
              title={stage}
            />
          );
        })}
      </div>
      <p className="mt-2 text-[11px] uppercase tracking-wide text-zinc-500">
        {status.toLowerCase().replace("_", " ")}…
      </p>
    </div>
  );
}
