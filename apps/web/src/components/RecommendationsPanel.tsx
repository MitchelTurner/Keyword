import { useMemo } from "react";
import type { RecommendedKeyword, RecommendedNiche } from "../api";
import { num } from "../api";
import Panel from "./Panel";

export default function RecommendationsPanel({
  niches,
  keywords,
  selectedSeed,
  onPick,
}: {
  niches: RecommendedNiche[];
  keywords: RecommendedKeyword[];
  selectedSeed: string;
  onPick: (term: string) => void;
}) {
  const openNiches = useMemo(
    () => niches.filter((n) => !n.alreadyRun).slice(0, 8),
    [niches],
  );
  const openKeywords = useMemo(() => {
    const selected = selectedSeed.trim().toLowerCase();
    return keywords
      .filter((k) => k.term.trim().toLowerCase() !== selected)
      .slice(0, 18);
  }, [keywords, selectedSeed]);

  const followOnCount = openKeywords.filter((k) => k.source === "follow_on")
    .length;

  if (openNiches.length === 0 && openKeywords.length === 0) {
    return null;
  }

  return (
    <Panel
      title="Recommended seeds"
      hint={
        followOnCount > 0
          ? `${followOnCount} from your existing keyword data`
          : "Curated niches with strong software buyer intent"
      }
    >
      {openNiches.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-wide text-zinc-500">
            Niches
          </p>
          <ul className="divide-y divide-zinc-800/80 border-y border-zinc-800/80">
            {openNiches.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => onPick(n.seed)}
                  className={`flex w-full flex-col gap-0.5 px-1 py-2.5 text-left transition hover:bg-zinc-900/70 ${
                    selectedSeed === n.seed ? "bg-emerald-950/25" : ""
                  }`}
                >
                  <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-sm font-medium text-emerald-300">
                      {n.seed}
                    </span>
                    <span className="text-[11px] uppercase tracking-wide text-zinc-600">
                      {n.category}
                    </span>
                  </span>
                  <span className="text-xs leading-relaxed text-zinc-500">
                    {n.why}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {openKeywords.length > 0 && (
        <div className={openNiches.length > 0 ? "mt-4" : undefined}>
          <p className="mb-2 text-[11px] uppercase tracking-wide text-zinc-500">
            Keywords
          </p>
          <div className="flex flex-wrap gap-1.5">
            {openKeywords.map((k) => (
              <button
                key={`${k.source}-${k.term}`}
                type="button"
                title={k.reason ?? k.term}
                onClick={() => onPick(k.term)}
                className={`rounded border px-2 py-1 text-xs transition ${
                  selectedSeed === k.term
                    ? "border-emerald-700 bg-emerald-950/40 text-emerald-200"
                    : k.source === "follow_on"
                      ? "border-zinc-700 bg-zinc-950/60 text-zinc-200 hover:border-emerald-800 hover:text-emerald-300"
                      : "border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
                }`}
              >
                {k.term}
                {k.source === "follow_on" && k.volume != null && (
                  <span className="ml-1.5 tabular-nums text-zinc-600">
                    {num(k.volume)}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}
