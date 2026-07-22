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
  const apiSeeds = useMemo(() => {
    const selected = selectedSeed.trim().toLowerCase();
    return keywords.filter(
      (k) =>
        (k.source === "api" || k.source === "follow_on") &&
        k.term.trim().toLowerCase() !== selected,
    );
  }, [keywords, selectedSeed]);

  const starterNiches = useMemo(
    () => niches.filter((n) => !n.alreadyRun),
    [niches],
  );

  const usingApi = apiSeeds.length > 0;
  const items = usingApi ? apiSeeds : starterNiches;
  const cycle = useCyclePage(
    items.length,
    PAGE_SIZE,
    usingApi
      ? apiSeeds.map((k) => k.term).join("|")
      : starterNiches.map((n) => n.id).join("|"),
  );
  const pageItems = items.slice(cycle.start, cycle.start + PAGE_SIZE);

  if (items.length === 0) {
    return (
      <Panel
        title="Recommended seeds"
        hint="Live high volume · low competition niches across diverse topics"
      >
        <p className="text-xs text-zinc-500">
          No live suggestions yet. Check DataForSEO credentials, then refresh.
        </p>
      </Panel>
    );
  }

  function pickNext() {
    if (usingApi) {
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
      return;
    }
    if (starterNiches.length === 0) return;
    const next = starterNiches[(cycle.start + 1) % starterNiches.length]!;
    onPick(next.seed);
  }

  return (
    <Panel
      title="Recommended seeds"
      hint={
        usingApi
          ? `${apiSeeds.length} niches from live API · high volume, low competition, wide topic mix`
          : "Starter ideas (live API unavailable)"
      }
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-wide text-zinc-500">
          {usingApi ? "Suggested niches" : "Starter niches"}
          <span className="ml-2 normal-case tracking-normal text-zinc-600">
            {cycle.pageCount > 1 ? `${cycle.page + 1}/${cycle.pageCount} · ` : ""}
            {items.length}
          </span>
        </p>
        <div className="flex items-center gap-1">
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
            className="rounded border border-emerald-800/70 bg-emerald-950/30 px-2 py-0.5 text-xs text-emerald-300 transition hover:bg-emerald-950/55"
          >
            Next seed →
          </button>
        </div>
      </div>

      <ul className="divide-y divide-zinc-800/80 border-y border-zinc-800/80">
        {usingApi
          ? (pageItems as RecommendedKeyword[]).map((k) => (
              <li key={k.term}>
                <button
                  type="button"
                  onClick={() => onPick(k.term)}
                  title={k.reason ?? k.term}
                  className={`flex w-full flex-col gap-0.5 px-1 py-2.5 text-left transition hover:bg-zinc-900/70 ${
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
                  <span className="text-xs text-zinc-500">
                    <span className="tabular-nums text-zinc-400">
                      {k.volume != null ? num(k.volume) : "—"}/mo
                    </span>
                    <span className="mx-1.5 text-zinc-700">·</span>
                    <span className="tabular-nums text-zinc-400">
                      {k.competition != null
                        ? `${Math.round(k.competition * 100)}% comp`
                        : "comp n/a"}
                    </span>
                  </span>
                </button>
              </li>
            ))
          : (pageItems as RecommendedNiche[]).map((n) => (
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
    </Panel>
  );
}
