import { useEffect, useMemo, useState } from "react";
import type { RecommendedKeyword, RecommendedNiche } from "../api";
import { num } from "../api";
import Panel from "./Panel";

const PAGE_SIZE = 6;

function useCyclePage(itemCount: number, pageSize: number, resetKey: string) {
  const pageCount = Math.max(1, Math.ceil(itemCount / pageSize) || 1);
  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage(0);
  }, [resetKey, pageSize]);

  useEffect(() => {
    if (page > pageCount - 1) setPage(0);
  }, [page, pageCount]);

  return {
    page,
    pageCount,
    start: page * pageSize,
    setPage,
    prev: () => setPage((p) => (p - 1 + pageCount) % pageCount),
    next: () => setPage((p) => (p + 1) % pageCount),
  };
}

export default function RecommendationsPanel({
  niches: _niches,
  keywords,
  selectedSeed,
  onPick,
  onSearchNew,
  onReject,
  searching = false,
  progress,
  aiReviewError,
}: {
  niches: RecommendedNiche[];
  keywords: RecommendedKeyword[];
  selectedSeed: string;
  onPick: (term: string) => void;
  onSearchNew?: () => void | Promise<void>;
  onReject?: (term: string) => void | Promise<void>;
  searching?: boolean;
  progress?: string;
  aiReviewError?: string;
}) {
  const apiSeeds = useMemo(() => {
    const selected = selectedSeed.trim().toLowerCase();
    return keywords.filter(
      (k) =>
        k.source === "api" &&
        k.term.trim().toLowerCase() !== selected &&
        k.competition != null &&
        k.competition <= 0.35,
    );
  }, [keywords, selectedSeed]);

  const cycle = useCyclePage(
    apiSeeds.length,
    PAGE_SIZE,
    apiSeeds.map((k) => k.term).join("|"),
  );
  const pageItems = apiSeeds.slice(cycle.start, cycle.start + PAGE_SIZE);

  const searchButton = onSearchNew ? (
    <button
      type="button"
      onClick={() => void onSearchNew()}
      disabled={searching}
      className="rounded border border-emerald-800/70 bg-emerald-950/30 px-2.5 py-1 text-xs font-medium text-emerald-300 transition hover:bg-emerald-950/55 disabled:cursor-wait disabled:opacity-50"
      title="Run a fresh DataForSEO search, then AI-review for buildable monetizable niches"
    >
      {searching ? "Searching…" : "Search new seeds"}
    </button>
  ) : null;

  if (apiSeeds.length === 0) {
    return (
      <Panel
        title="Recommended seeds"
        hint="High volume · low competition · AI-reviewed for buildable monetizable niches"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-zinc-500">
            {searching
              ? progress ||
                "Searching DataForSEO and AI-reviewing niches — this can take a minute…"
              : aiReviewError
                ? `AI review unavailable — seeds hidden until review works. ${aiReviewError}`
                : "No buildable niches yet. Click Search new seeds (volume ≥ 500, competition ≤ 35%, then AI filters out professions like “doctor”)."}
          </p>
          {searchButton}
        </div>
      </Panel>
    );
  }

  function pickNext() {
    if (apiSeeds.length === 0) return;
    const selected = selectedSeed.trim().toLowerCase();
    const idx = apiSeeds.findIndex(
      (k) => k.term.trim().toLowerCase() === selected,
    );
    const next = apiSeeds[(idx + 1) % apiSeeds.length]!;
    onPick(next.term);
    const openIdx = apiSeeds.findIndex(
      (k) => k.term.trim().toLowerCase() === next.term.trim().toLowerCase(),
    );
    if (openIdx >= 0) cycle.setPage(Math.floor(openIdx / PAGE_SIZE));
  }

  return (
    <Panel
      title="Recommended seeds"
      hint={
        searching
          ? progress || "Searching live API + AI review for a fresh mix…"
          : `${apiSeeds.length} AI-reviewed niches · volume ≥ 500 · competition ≤ 35%`
      }
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-wide text-zinc-500">
          Suggested niches
          <span className="ml-2 normal-case tracking-normal text-zinc-600">
            {cycle.pageCount > 1 ? `${cycle.page + 1}/${cycle.pageCount} · ` : ""}
            {apiSeeds.length}
          </span>
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {searchButton}
          {cycle.pageCount > 1 && (
            <>
              <button
                type="button"
                onClick={cycle.prev}
                className="rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100"
              >
                ←
              </button>
              <button
                type="button"
                onClick={cycle.next}
                className="rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100"
              >
                →
              </button>
            </>
          )}
          <button
            type="button"
            onClick={pickNext}
            className="rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100"
          >
            Next seed →
          </button>
        </div>
      </div>

      <ul className="divide-y divide-zinc-800/80 border-y border-zinc-800/80">
        {pageItems.map((k) => (
          <li key={k.term} className="group">
            <div className="flex items-start gap-2 px-1 py-2.5">
              <button
                type="button"
                onClick={() => onPick(k.term)}
                title={k.aiReason ?? k.reason ?? k.term}
                className={`min-w-0 flex-1 flex-col gap-0.5 text-left transition hover:bg-zinc-900/70 ${
                  selectedSeed === k.term ? "bg-emerald-950/25" : ""
                }`}
              >
                <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-sm font-medium text-emerald-300">
                    {k.term}
                  </span>
                  {k.category && (
                    <span className="text-[11px] uppercase tracking-wide text-zinc-600">
                      {k.category}
                    </span>
                  )}
                </span>
                <span className="block text-xs text-zinc-500">
                  <span className="tabular-nums text-zinc-400">
                    {k.volume != null ? num(k.volume) : "—"}/mo
                  </span>
                  <span className="mx-1.5 text-zinc-700">·</span>
                  <span className="tabular-nums text-zinc-400">
                    {k.competition != null
                      ? `${Math.round(k.competition * 100)}% comp`
                      : "comp n/a"}
                  </span>
                  {k.cpc != null && k.cpc > 0 && (
                    <>
                      <span className="mx-1.5 text-zinc-700">·</span>
                      <span className="tabular-nums text-zinc-400">
                        ${k.cpc.toFixed(2)} CPC
                      </span>
                    </>
                  )}
                </span>
                {k.aiReason && (
                  <span className="mt-0.5 block text-xs leading-snug text-zinc-400">
                    {k.aiReason}
                  </span>
                )}
                {k.serp && k.serp.length > 0 && (
                  <span className="mt-1 block text-[11px] leading-snug text-zinc-600">
                    SERP:{" "}
                    {k.serp
                      .slice(0, 3)
                      .map((s) => s.domain)
                      .join(" · ")}
                  </span>
                )}
              </button>
              {onReject && (
                <button
                  type="button"
                  onClick={() => void onReject(k.term)}
                  title="Not buildable for me — hide permanently"
                  className="shrink-0 rounded border border-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-500 opacity-70 transition hover:border-rose-900/60 hover:text-rose-300 group-hover:opacity-100"
                >
                  Hide
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
