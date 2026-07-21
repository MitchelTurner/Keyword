import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { RecommendedKeyword, RecommendedNiche } from "../api";
import { num } from "../api";
import Panel from "./Panel";

const NICHE_PAGE = 4;
const KEYWORD_PAGE = 10;

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

function SectionHeader({
  label,
  page,
  pageCount,
  total,
  onPrev,
  onNext,
  extra,
}: {
  label: string;
  page: number;
  pageCount: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  extra?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-[11px] uppercase tracking-wide text-zinc-500">
        {label}
        {total > 0 && (
          <span className="ml-2 normal-case tracking-normal text-zinc-600">
            {pageCount > 1 ? `${page + 1}/${pageCount} · ` : ""}
            {total}
          </span>
        )}
      </p>
      <div className="flex items-center gap-1">
        {pageCount > 1 && (
          <>
            <button
              type="button"
              onClick={onPrev}
              className="rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100"
              aria-label={`Previous ${label.toLowerCase()}`}
            >
              ←
            </button>
            <button
              type="button"
              onClick={onNext}
              className="rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100"
              aria-label={`Next ${label.toLowerCase()}`}
            >
              →
            </button>
          </>
        )}
        {extra}
      </div>
    </div>
  );
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
  const openNiches = useMemo(
    () => niches.filter((n) => !n.alreadyRun),
    [niches],
  );
  const openKeywords = useMemo(() => {
    const selected = selectedSeed.trim().toLowerCase();
    return keywords.filter((k) => k.term.trim().toLowerCase() !== selected);
  }, [keywords, selectedSeed]);

  const nicheCycle = useCyclePage(
    openNiches.length,
    NICHE_PAGE,
    openNiches.map((n) => n.id).join("|"),
  );
  const keywordCycle = useCyclePage(
    openKeywords.length,
    KEYWORD_PAGE,
    // Don't reset page when only the selected seed changes — keep browsing position.
    openKeywords.length.toString(),
  );

  const nichePage = openNiches.slice(
    nicheCycle.start,
    nicheCycle.start + NICHE_PAGE,
  );
  const keywordPage = openKeywords.slice(
    keywordCycle.start,
    keywordCycle.start + KEYWORD_PAGE,
  );

  const followOnCount = openKeywords.filter((k) => k.source === "follow_on")
    .length;

  if (openNiches.length === 0 && openKeywords.length === 0) {
    return null;
  }

  function pickNextKeyword() {
    const pool = keywords;
    if (pool.length === 0) return;
    const selected = selectedSeed.trim().toLowerCase();
    const idx = pool.findIndex(
      (k) => k.term.trim().toLowerCase() === selected,
    );
    const nextIdx = (idx + 1) % pool.length;
    const next = pool[nextIdx]!;
    onPick(next.term);
    // Align the visible page to the picked term among currently open chips.
    const openIdx = openKeywords.findIndex(
      (k) => k.term.trim().toLowerCase() === next.term.trim().toLowerCase(),
    );
    if (openIdx >= 0) {
      keywordCycle.setPage(Math.floor(openIdx / KEYWORD_PAGE));
    }
  }

  return (
    <Panel
      title="Recommended seeds"
      hint={
        followOnCount > 0
          ? `${followOnCount} ranked by high volume + low competition · use ← → to cycle`
          : "General search seeds — not limited to software"
      }
    >
      {openNiches.length > 0 && (
        <div className="space-y-2">
          <SectionHeader
            label="Niches"
            page={nicheCycle.page}
            pageCount={nicheCycle.pageCount}
            total={openNiches.length}
            onPrev={nicheCycle.prev}
            onNext={nicheCycle.next}
          />
          <ul className="divide-y divide-zinc-800/80 border-y border-zinc-800/80">
            {nichePage.map((n) => (
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
        <div className={openNiches.length > 0 ? "mt-4 space-y-2" : "space-y-2"}>
          <SectionHeader
            label="Keywords"
            page={keywordCycle.page}
            pageCount={keywordCycle.pageCount}
            total={openKeywords.length}
            onPrev={keywordCycle.prev}
            onNext={keywordCycle.next}
            extra={
              <button
                type="button"
                onClick={pickNextKeyword}
                className="rounded border border-emerald-800/70 bg-emerald-950/30 px-2 py-0.5 text-xs text-emerald-300 transition hover:bg-emerald-950/55"
                title="Fill the seed input with the next recommended keyword"
              >
                Next keyword →
              </button>
            }
          />
          <div className="flex flex-wrap gap-1.5">
            {keywordPage.map((k) => (
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
                    {k.competition != null && (
                      <span className="text-zinc-700">
                        {" "}
                        · {k.competition.toFixed(2)}
                      </span>
                    )}
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
