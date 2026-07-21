const STAGES = [
  "PENDING",
  "EXPANDING",
  "ENRICHING",
  "CLASSIFYING",
  "SCORING",
  "DONE",
] as const;

const STAGE_HINT: Record<string, string> = {
  PENDING: "Queued — waiting for a worker",
  EXPANDING: "Expanding keyword ideas from DataForSEO",
  ENRICHING: "Fetching search volume / CPC",
  CLASSIFYING: "Clustering keywords into products (Claude)",
  SCORING: "Scoring opportunities",
};

export default function PipelineProgress({
  status,
  keywordCount = 0,
  enrichedKeywordCount = 0,
  opportunityCount = 0,
  updatedAt,
  onResume,
  resuming,
}: {
  status: string;
  keywordCount?: number;
  enrichedKeywordCount?: number;
  opportunityCount?: number;
  updatedAt?: string;
  onResume?: () => void;
  resuming?: boolean;
}) {
  if (status === "FAILED") {
    return (
      <div className="rounded-lg border border-rose-900/70 bg-rose-950/30 px-3 py-2 text-xs text-rose-300">
        Pipeline failed — retry the failed stage or re-classify from stored data.
      </div>
    );
  }

  const idx = STAGES.indexOf(status as (typeof STAGES)[number]);
  if (idx < 0 || status === "DONE") return null;

  const ageMs = updatedAt ? Date.now() - new Date(updatedAt).getTime() : 0;
  // Match server sweeper (~90s); show resume a bit sooner for operators.
  const stuck = ageMs > 75_000;

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
        {STAGE_HINT[status] ?? `${status.toLowerCase()}…`}
      </p>
      <p className="mt-1 text-[11px] tabular-nums text-zinc-600">
        {keywordCount} keywords · {enrichedKeywordCount} enriched ·{" "}
        {opportunityCount} opportunities
        {ageMs > 0 && (
          <> · last update {Math.max(1, Math.round(ageMs / 1000))}s ago</>
        )}
      </p>
      {stuck && onResume && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-amber-300/90">
            No progress for ~75s — click resume to force an in-process run.
          </span>
          <button
            type="button"
            disabled={resuming}
            onClick={onResume}
            className="rounded border border-amber-700 bg-amber-950/40 px-2 py-0.5 text-[11px] font-medium text-amber-200 disabled:opacity-50"
          >
            {resuming ? "Resuming…" : "Resume pipeline"}
          </button>
        </div>
      )}
    </div>
  );
}
