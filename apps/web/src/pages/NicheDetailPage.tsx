import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Link, useParams } from "react-router-dom";
import { priceFloors } from "@prospector/shared";
import {
  adsCompPct,
  api,
  money,
  num,
  type NicheDetail,
  type OpportunityDetail,
  type OpportunityRow,
  type RubricConfig,
} from "../api";
import { CURATED_NICHES } from "@prospector/shared";
import StatusBadge from "../components/StatusBadge";
import Sparkline from "../components/Sparkline";
import TrendBadge from "../components/TrendBadge";
import RubricBadge from "../components/RubricBadge";
import VerdictBadge from "../components/VerdictBadge";
import PipelineProgress from "../components/PipelineProgress";
import Panel from "../components/Panel";

type SortKey =
  | "demandScore"
  | "verdictScore"
  | "totalVolume"
  | "avgCpc"
  | "impliedCac"
  | "monthlyPriceFloor"
  | "painSeverity"
  | "productDescription"
  | "buyerType"
  | "reviewStatus"
  | "trendScore";

const IN_FLIGHT = new Set([
  "PENDING",
  "EXPANDING",
  "ENRICHING",
  "CLASSIFYING",
  "SCORING",
]);

const REVIEW_OPTIONS = [
  { value: "none", label: "—" },
  { value: "watching", label: "Watching" },
  { value: "building", label: "Building" },
  { value: "passed", label: "Passed" },
] as const;

const inputClass =
  "mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950/80 px-2 py-1.5 text-sm text-zinc-100 outline-none ring-emerald-500/25 focus:border-emerald-700 focus:ring";

export default function NicheDetailPage() {
  const { id = "" } = useParams();
  const [niche, setNiche] = useState<NicheDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [convRate, setConvRate] = useState("");
  const [ltvCacRatio, setLtvCacRatio] = useState("");
  const [rubricConfig, setRubricConfig] = useState<RubricConfig>({
    minMonthlyFloor: 19,
    minVolume: 500,
    minPain: 3,
    maxCompetition: 0.75,
    rejectDeclining: true,
  });
  const [saving, setSaving] = useState(false);
  const [savingDecision, setSavingDecision] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("verdictScore");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selectedOppId, setSelectedOppId] = useState<string | null>(null);
  const [oppDetail, setOppDetail] = useState<OpportunityDetail | null>(null);
  const [decisionOpen, setDecisionOpen] = useState(false);
  const [resultsView, setResultsView] = useState<"keywords" | "themes">(
    "keywords",
  );

  async function refresh() {
    const data = await api.getNiche(id);
    setNiche(data);
    setConvRate(String(data.convRate));
    setLtvCacRatio(String(data.ltvCacRatio));
    setRubricConfig({ ...data.rubricConfig });
  }

  useEffect(() => {
    refresh().catch((e) => setError(String(e)));
  }, [id]);

  useEffect(() => {
    if (!niche || !IN_FLIGHT.has(niche.status)) return;
    const timer = window.setInterval(() => {
      refresh().catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [niche?.status, id]);

  useEffect(() => {
    if (!selectedOppId) {
      setOppDetail(null);
      return;
    }
    api
      .getOpportunity(id, selectedOppId)
      .then(setOppDetail)
      .catch((e) => setError(String(e)));
  }, [selectedOppId, id]);

  useEffect(() => {
    if (!selectedOppId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedOppId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedOppId]);

  const liveConv = Number(convRate) || 0.015;
  const liveLtv = Number(ltvCacRatio) || 3;
  const assumptionsDirty =
    !!niche &&
    (Math.abs(liveConv - niche.convRate) > 1e-9 ||
      Math.abs(liveLtv - niche.ltvCacRatio) > 1e-9);

  const rows = useMemo(() => {
    if (!niche) return [];
    const enriched = niche.opportunities.map((o) => {
      const floors = priceFloors(o.avgCpc, liveConv, liveLtv);
      return {
        ...o,
        impliedCac: floors.impliedCac,
        annualPriceFloor: floors.annualPriceFloor,
        monthlyPriceFloor: floors.monthlyPriceFloor,
        trendScore: o.trend.score,
        verdictScore: o.decision.verdict.score,
      };
    });

    enriched.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc"
          ? av.localeCompare(bv)
          : bv.localeCompare(av);
      }
      const an = Number(av);
      const bn = Number(bv);
      return sortDir === "asc" ? an - bn : bn - an;
    });
    return enriched;
  }, [niche, sortKey, sortDir, liveConv, liveLtv]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(
        key === "productDescription" ||
          key === "buyerType" ||
          key === "reviewStatus"
          ? "asc"
          : "desc",
      );
    }
  }

  async function onSaveAssumptions(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.updateAssumptions(id, {
        convRate: Number(convRate),
        ltvCacRatio: Number(ltvCacRatio),
      });
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  async function onSaveDecisionConfig(e: FormEvent) {
    e.preventDefault();
    if (!niche) return;
    setSavingDecision(true);
    setError(null);
    try {
      await api.updateAssumptions(id, {
        rubricConfig,
        rescore: false,
      });
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setSavingDecision(false);
    }
  }

  const [resuming, setResuming] = useState(false);

  async function onRetry() {
    setResuming(true);
    setError(null);
    try {
      await api.retry(id);
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setResuming(false);
    }
  }

  async function onReclassify() {
    if (
      !confirm(
        "Re-cluster themes from stored keyword data? This uses Claude (no DataForSEO re-fetch). Pins/notes are kept when theme labels match.",
      )
    ) {
      return;
    }
    setError(null);
    try {
      await api.reclassify(id);
      await refresh();
    } catch (err) {
      setError(String(err));
    }
  }

  async function onOppUpdated(updated: OpportunityRow) {
    setNiche((prev) =>
      prev
        ? {
            ...prev,
            opportunities: prev.opportunities.map((o) =>
              o.id === updated.id ? { ...o, ...updated } : o,
            ),
          }
        : prev,
    );
    setOppDetail((prev) =>
      prev && prev.id === updated.id ? { ...prev, ...updated } : prev,
    );
  }

  if (!niche) {
    return (
      <div className="animate-fade-up space-y-3">
        <div className="skeleton h-4 w-24" />
        <div className="skeleton h-8 w-64" />
        <div className="skeleton h-24 w-full" />
        <p className="text-sm text-zinc-500">{error ?? "Loading niche…"}</p>
      </div>
    );
  }

  const canReclassify =
    (niche.status === "DONE" || niche.status === "FAILED") &&
    niche.enrichedKeywordCount > 0;

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            to="/"
            className="text-xs text-zinc-500 transition hover:text-zinc-300"
          >
            ← All niches
          </Link>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-zinc-50">
            {niche.seedTerm}
          </h1>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-zinc-400">
            <StatusBadge status={niche.status} />
            <MetaStat label="keywords" value={num(niche.keywordCount)} />
            <MetaStat label="enriched" value={num(niche.enrichedKeywordCount)} />
            <MetaStat
              label="verdict"
              value={`${niche.decisionSummary.buildCount ?? 0} build · ${niche.decisionSummary.watchCount ?? 0} watch · ${niche.decisionSummary.killCount ?? 0} kill`}
            />
            <MetaStat
              label="rubric"
              value={`${niche.decisionSummary.passCount} pass / ${niche.decisionSummary.failCount} fail`}
            />
            <MetaStat
              label="cost"
              value={
                <>
                  {money(niche.costs.total, 4)}
                  <span className="text-zinc-600">
                    {" "}
                    · {money(niche.costs.perOpportunity, 4)}/opp
                    {niche.enrichedKeywordCount > 0 && (
                      <> · {money(niche.costs.perEnrichedKeyword, 4)}/kw</>
                    )}
                  </span>
                </>
              }
            />
          </div>
          {niche.error && (
            <p className="mt-2 text-sm text-rose-400">{niche.error}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={api.exportCsvUrl(id)}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100"
          >
            Export CSV
          </a>
          {canReclassify && (
            <button
              type="button"
              onClick={onReclassify}
              className="rounded-md border border-emerald-800/80 bg-emerald-950/40 px-3 py-1.5 text-sm text-emerald-300 transition hover:bg-emerald-950/70"
            >
              Re-classify
            </button>
          )}
          {(niche.status === "FAILED" ||
            (IN_FLIGHT.has(niche.status) &&
              Date.now() - new Date(niche.updatedAt).getTime() > 75_000)) && (
            <button
              type="button"
              onClick={onRetry}
              disabled={resuming}
              className="rounded-md bg-amber-500 px-3 py-1.5 text-sm font-semibold text-zinc-950 transition hover:bg-amber-400 disabled:opacity-50"
            >
              {niche.status === "FAILED"
                ? resuming
                  ? "Retrying…"
                  : "Retry failed stage"
                : resuming
                  ? "Resuming…"
                  : "Resume pipeline"}
            </button>
          )}
        </div>
      </div>

      <PipelineProgress
        status={niche.status}
        keywordCount={niche.keywordCount}
        enrichedKeywordCount={niche.enrichedKeywordCount}
        opportunityCount={niche.opportunities.length}
        updatedAt={niche.updatedAt}
        onResume={onRetry}
        resuming={resuming}
      />

      <RelatedSeeds seedTerm={niche.seedTerm} />

      <Panel
        title="Economics assumptions"
        hint={
          assumptionsDirty
            ? "Live preview — save to persist & re-score"
            : "Sliders preview floors without API spend"
        }
      >
        <form onSubmit={onSaveAssumptions} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <label className="block text-xs text-zinc-500">
              Conversion rate (click → customer)
              <input
                type="number"
                step="0.001"
                min="0.0001"
                max="1"
                value={convRate}
                onChange={(e) => setConvRate(e.target.value)}
                className={inputClass}
              />
              <input
                type="range"
                min={0.005}
                max={0.05}
                step={0.001}
                value={liveConv}
                onChange={(e) => setConvRate(e.target.value)}
                className="mt-2 w-full accent-emerald-500"
              />
            </label>
            <label className="block text-xs text-zinc-500">
              LTV / CAC ratio
              <input
                type="number"
                step="0.1"
                min="0.1"
                value={ltvCacRatio}
                onChange={(e) => setLtvCacRatio(e.target.value)}
                className={inputClass}
              />
              <input
                type="range"
                min={1}
                max={8}
                step={0.1}
                value={liveLtv}
                onChange={(e) => setLtvCacRatio(e.target.value)}
                className="mt-2 w-full accent-emerald-500"
              />
            </label>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={saving || IN_FLIGHT.has(niche.status)}
                className="w-full rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save & re-score"}
              </button>
            </div>
          </div>
        </form>
      </Panel>

      <details
        className="rounded-lg border border-zinc-800/90 bg-zinc-900/40 open:pb-1"
        open={decisionOpen}
        onToggle={(e) => setDecisionOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-zinc-200 marker:content-none [&::-webkit-details-marker]:hidden">
          <span className="inline-flex w-full items-center justify-between gap-2">
            <span>Decision config</span>
            <span className="text-xs font-normal text-zinc-500">
              {decisionOpen ? "Hide" : "Pass/fail rubric thresholds"}
            </span>
          </span>
        </summary>
        <form
          onSubmit={onSaveDecisionConfig}
          className="space-y-4 border-t border-zinc-800/80 px-4 py-3"
        >
          <p className="text-xs text-zinc-500">
            Themes must clear every threshold to pass. Demand score uses volume,
            CPC, and competition only.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block text-xs text-zinc-500">
              Min monthly floor ($)
              <input
                type="number"
                step="1"
                min="0"
                value={rubricConfig.minMonthlyFloor}
                onChange={(e) =>
                  setRubricConfig((prev) => ({
                    ...prev,
                    minMonthlyFloor: Number(e.target.value),
                  }))
                }
                className={inputClass}
              />
            </label>
            <label className="block text-xs text-zinc-500">
              Min theme volume
              <input
                type="number"
                step="1"
                min="0"
                value={rubricConfig.minVolume}
                onChange={(e) =>
                  setRubricConfig((prev) => ({
                    ...prev,
                    minVolume: Number(e.target.value),
                  }))
                }
                className={inputClass}
              />
            </label>
            <label className="block text-xs text-zinc-500">
              Min pain (1–5)
              <input
                type="number"
                step="1"
                min="1"
                max="5"
                value={rubricConfig.minPain}
                onChange={(e) =>
                  setRubricConfig((prev) => ({
                    ...prev,
                    minPain: Number(e.target.value),
                  }))
                }
                className={inputClass}
              />
            </label>
            <label className="block text-xs text-zinc-500">
              Max Ads competition (0–1 index)
              <input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={rubricConfig.maxCompetition}
                onChange={(e) =>
                  setRubricConfig((prev) => ({
                    ...prev,
                    maxCompetition: Number(e.target.value),
                  }))
                }
                className={inputClass}
              />
            </label>
            <label className="flex items-end gap-2 pb-2 text-xs text-zinc-500 sm:col-span-2 lg:col-span-2">
              <input
                type="checkbox"
                checked={rubricConfig.rejectDeclining}
                onChange={(e) =>
                  setRubricConfig((prev) => ({
                    ...prev,
                    rejectDeclining: e.target.checked,
                  }))
                }
                className="accent-emerald-500"
              />
              Fail themes with a declining trend
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={savingDecision || IN_FLIGHT.has(niche.status)}
              className="rounded-md border border-zinc-600 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-100 transition hover:bg-zinc-700 disabled:opacity-50"
            >
              {savingDecision ? "Saving…" : "Save decision config"}
            </button>
            <p className="text-xs text-zinc-500">
              Rubric edits refresh pass/fail without a full pipeline re-run.
            </p>
          </div>
        </form>
      </details>

      {error && (
        <div className="rounded-md border border-rose-900 bg-rose-950/40 px-3 py-2 text-sm text-rose-300">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-md border border-zinc-800 bg-zinc-950/50 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setResultsView("keywords")}
            className={`rounded px-3 py-1.5 transition ${
              resultsView === "keywords"
                ? "bg-zinc-800 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Keywords
            <span className="ml-1.5 tabular-nums text-zinc-500">
              {niche.keywords?.length ?? niche.keywordCount}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setResultsView("themes")}
            className={`rounded px-3 py-1.5 transition ${
              resultsView === "themes"
                ? "bg-zinc-800 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Themes
            <span className="ml-1.5 tabular-nums text-zinc-500">
              {rows.length}
            </span>
          </button>
        </div>
        <span className="text-xs text-zinc-600">
          {resultsView === "keywords"
            ? "Normal keyword results — volume, CPC, Ads competition index"
            : "Clustered themes — click a row for details"}
          {assumptionsDirty && resultsView === "themes" && (
            <span className="ml-2 text-amber-300/90">· preview floors</span>
          )}
        </span>
      </div>

      {resultsView === "keywords" ? (
        <div className="table-scroll max-h-[62vh]">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2.5 font-medium">Keyword</th>
                <th className="px-3 py-2.5 font-medium">Volume</th>
                <th className="px-3 py-2.5 font-medium">CPC</th>
                <th className="px-3 py-2.5 font-medium">Ads comp</th>
                <th className="px-3 py-2.5 font-medium">12-mo</th>
              </tr>
            </thead>
            <tbody>
              {(niche.keywords?.length ?? 0) === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-10 text-center text-zinc-500"
                  >
                    {IN_FLIGHT.has(niche.status)
                      ? `Still ${niche.status.toLowerCase()} — keywords appear after expand/enrich.`
                      : niche.status === "FAILED"
                        ? "Pipeline failed before keywords were ready. Use Retry."
                        : "No keywords yet."}
                  </td>
                </tr>
              )}
              {(niche.keywords ?? []).map((k) => (
                <tr key={k.id} className="border-t border-zinc-800/80">
                  <td className="px-3 py-2.5 text-zinc-100">{k.term}</td>
                  <td className="px-3 py-2.5 tabular-nums text-zinc-300">
                    {k.searchVolume == null ? "—" : num(k.searchVolume)}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-zinc-300">
                    {k.cpc == null ? "—" : money(k.cpc)}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-zinc-300">
                    {adsCompPct(k.competition)}
                  </td>
                  <td className="px-3 py-2.5">
                    <Sparkline data={k.monthlyTrend} tone="flat" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="table-scroll max-h-[62vh]">
          <table className="w-full min-w-[1280px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                {(
                  [
                    ["productDescription", "Theme"],
                    ["buyerType", "Buyer"],
                    ["reviewStatus", "Status"],
                  ] as Array<[SortKey, string]>
                ).map(([key, label]) => (
                  <th key={key} className="px-3 py-2.5 font-medium">
                    <button
                      type="button"
                      onClick={() => toggleSort(key)}
                      className="hover:text-zinc-300"
                    >
                      {label}
                      {sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                    </button>
                  </th>
                ))}
                <th className="px-3 py-2.5 font-medium">
                  <button
                    type="button"
                    onClick={() => toggleSort("verdictScore")}
                    className="hover:text-zinc-300"
                  >
                    Verdict
                    {sortKey === "verdictScore"
                      ? sortDir === "asc"
                        ? " ↑"
                        : " ↓"
                      : ""}
                  </button>
                </th>
                <th className="px-3 py-2.5 font-medium">Rubric</th>
                {(
                  [
                    ["trendScore", "Trend"],
                    ["totalVolume", "Volume"],
                    ["avgCpc", "Avg CPC"],
                    ["impliedCac", "Implied CAC"],
                    ["monthlyPriceFloor", "Mo. floor"],
                    ["demandScore", "Demand"],
                  ] as Array<[SortKey, string]>
                ).map(([key, label]) => (
                  <th key={key} className="px-3 py-2.5 font-medium">
                    <button
                      type="button"
                      onClick={() => toggleSort(key)}
                      className="hover:text-zinc-300"
                    >
                      {label}
                      {sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={11}
                    className="px-3 py-10 text-center text-zinc-500"
                  >
                    {IN_FLIGHT.has(niche.status)
                      ? `Still ${niche.status.toLowerCase()} — ${niche.keywordCount} keywords, ${niche.enrichedKeywordCount} enriched. Themes appear after scoring.`
                      : niche.status === "FAILED"
                        ? "Pipeline failed before themes were created. Use Retry or Re-classify."
                        : "No themes yet."}
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <OpportunityTableRow
                  key={row.id}
                  row={row}
                  selected={selectedOppId === row.id}
                  preview={assumptionsDirty}
                  onSelect={() =>
                    setSelectedOppId((cur) => (cur === row.id ? null : row.id))
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {oppDetail && (
        <OpportunityDrawer
          nicheId={id}
          detail={oppDetail}
          onClose={() => setSelectedOppId(null)}
          onUpdated={onOppUpdated}
        />
      )}
    </div>
  );
}

function MetaStat({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="tabular-nums text-zinc-300">{value}</span>
      <span className="text-[11px] uppercase tracking-wide text-zinc-600">
        {label}
      </span>
    </span>
  );
}

function RelatedSeeds({ seedTerm }: { seedTerm: string }) {
  const curated = CURATED_NICHES.find(
    (n) => n.seed.toLowerCase() === seedTerm.trim().toLowerCase(),
  );
  const neighbors = useMemo(() => {
    if (curated) {
      const sameCategory = CURATED_NICHES.filter(
        (n) => n.category === curated.category,
      ).flatMap((n) =>
        n.id === curated.id
          ? n.keywords
          : [n.seed, ...n.keywords],
      );
      return [...new Set(sameCategory)];
    }
    return CURATED_NICHES.flatMap((n) => [n.seed, ...n.keywords]).filter(
      (t) => t.toLowerCase() !== seedTerm.trim().toLowerCase(),
    );
  }, [curated, seedTerm]);

  const pageSize = 8;
  const pageCount = Math.max(1, Math.ceil(neighbors.length / pageSize));
  const [page, setPage] = useState(0);
  const pageItems = neighbors.slice(page * pageSize, page * pageSize + pageSize);

  useEffect(() => {
    setPage(0);
  }, [seedTerm]);

  if (neighbors.length === 0) return null;

  return (
    <Panel
      title="Related seeds to try next"
      hint={
        curated
          ? `Angles adjacent to ${curated.seed}`
          : "Curated niches worth expanding"
      }
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] text-zinc-600">
          {pageCount > 1 ? `${page + 1}/${pageCount} · ` : ""}
          {neighbors.length} seeds
        </span>
        {pageCount > 1 && (
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => (p - 1 + pageCount) % pageCount)}
              className="rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-300 hover:border-zinc-500"
            >
              ←
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => (p + 1) % pageCount)}
              className="rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-300 hover:border-zinc-500"
            >
              →
            </button>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {pageItems.map((term) => (
          <Link
            key={term}
            to={`/?seed=${encodeURIComponent(term)}`}
            className="rounded border border-zinc-800 bg-zinc-950/50 px-2 py-1 text-xs text-zinc-300 transition hover:border-emerald-800 hover:text-emerald-300"
          >
            {term}
          </Link>
        ))}
      </div>
    </Panel>
  );
}

function OpportunityTableRow({
  row,
  selected,
  preview,
  onSelect,
}: {
  row: OpportunityRow & { trendScore: number; verdictScore: number };
  selected: boolean;
  preview: boolean;
  onSelect: () => void;
}) {
  return (
    <tr
      onClick={onSelect}
      className={`cursor-pointer border-t border-zinc-800/80 ${
        selected ? "bg-emerald-950/20 ring-1 ring-inset ring-emerald-800/40" : ""
      }`}
    >
      <td className="px-3 py-2.5 font-medium text-zinc-100">
        <span className="inline-flex items-center gap-1.5">
          {row.pinned && (
            <span className="text-amber-400" title="Pinned">
              ★
            </span>
          )}
          {row.productDescription}
        </span>
        <div className="text-[11px] text-zinc-500">
          #{row.decision.rank} · {row.keywordCount} keywords · {row.intent}
          {row.notes ? " · has notes" : ""}
        </div>
      </td>
      <td className="px-3 py-2.5 text-zinc-300">{row.buyerType}</td>
      <td className="px-3 py-2.5 text-zinc-400">
        {row.reviewStatus === "none" ? (
          "—"
        ) : (
          <span className="rounded bg-zinc-800/80 px-1.5 py-0.5 text-[11px] capitalize text-zinc-300">
            {row.reviewStatus}
          </span>
        )}
      </td>
      <td className="px-3 py-2.5">
        <VerdictBadge
          verdict={row.decision.verdict.verdict}
          score={row.decision.verdict.score}
        />
      </td>
      <td className="px-3 py-2.5">
        <RubricBadge
          pass={row.decision.rubric.pass}
          checks={row.decision.rubric.checks}
        />
      </td>
      <td className="px-3 py-2.5">
        <div className="flex flex-col gap-1">
          <TrendBadge trend={row.trend} />
          <Sparkline
            data={row.trend.series}
            width={72}
            height={18}
            tone={row.trend.direction}
          />
        </div>
      </td>
      <td className="px-3 py-2.5 tabular-nums text-zinc-300">
        {num(row.totalVolume)}
      </td>
      <td className="px-3 py-2.5 tabular-nums text-zinc-300">
        {money(row.avgCpc)}
      </td>
      <td
        className={`px-3 py-2.5 tabular-nums ${preview ? "text-amber-200" : "text-zinc-300"}`}
      >
        {money(row.impliedCac)}
      </td>
      <td
        className={`px-3 py-2.5 tabular-nums ${preview ? "text-amber-200" : "text-zinc-300"}`}
      >
        {money(row.monthlyPriceFloor)}
      </td>
      <td className="px-3 py-2.5 tabular-nums font-medium text-emerald-300">
        {row.demandScore.toFixed(2)}
      </td>
    </tr>
  );
}

function OpportunityDrawer({
  nicheId,
  detail,
  onClose,
  onUpdated,
}: {
  nicheId: string;
  detail: OpportunityDetail;
  onClose: () => void;
  onUpdated: (row: OpportunityRow) => void;
}) {
  const [notes, setNotes] = useState(detail.notes);
  const [saving, setSaving] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [promoteLinks, setPromoteLinks] = useState<{
    site: string;
    domains: string;
  } | null>(null);
  const { decision } = detail;
  const verdict = decision.verdict;

  useEffect(() => {
    setNotes(detail.notes);
    setPromoteLinks(null);
  }, [detail.id, detail.notes]);

  async function patch(body: {
    pinned?: boolean;
    notes?: string;
    reviewStatus?: string;
  }) {
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await api.updateOpportunity(nicheId, detail.id, body);
      onUpdated(updated);
    } catch (err) {
      setSaveError(String(err));
    } finally {
      setSaving(false);
    }
  }

  async function onPromote() {
    setPromoting(true);
    setSaveError(null);
    try {
      const result = await api.promoteOpportunity(nicheId, detail.id, {
        keywordLimit: 12,
      });
      setPromoteLinks(result.links);
      onUpdated({
        ...detail,
        pinned: true,
        reviewStatus: "building",
      });
    } catch (err) {
      setSaveError(String(err));
    } finally {
      setPromoting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="drawer-overlay"
        aria-label="Close opportunity detail"
        onClick={onClose}
      />
      <aside className="drawer-panel" role="dialog" aria-modal="true">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-zinc-800/90 bg-zinc-950/90 px-4 py-3 backdrop-blur">
          <div className="min-w-0">
            <h2 className="text-base font-semibold leading-snug text-zinc-50">
              {detail.pinned && (
                <span className="mr-1 text-amber-400" title="Pinned">
                  ★
                </span>
              )}
              {detail.productDescription}
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              #{decision.rank} · {detail.buyerType} · {detail.intent} · pain{" "}
              {detail.painSeverity}/5
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md px-2 py-1 text-sm text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200"
          >
            Esc
          </button>
        </div>

        <div className="space-y-4 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <VerdictBadge verdict={verdict.verdict} score={verdict.score} />
            <RubricBadge
              pass={decision.rubric.pass}
              checks={decision.rubric.checks}
            />
            <TrendBadge trend={detail.trend} />
            <Sparkline
              data={detail.trend.series}
              width={100}
              tone={detail.trend.direction}
            />
          </div>

          <p className="rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-300">
            {verdict.rationale}
          </p>

          <div className="flex flex-wrap items-end gap-3">
            <button
              type="button"
              disabled={saving}
              onClick={() => patch({ pinned: !detail.pinned })}
              className={`rounded-md border px-3 py-1.5 text-sm transition ${
                detail.pinned
                  ? "border-amber-700 bg-amber-950/40 text-amber-300"
                  : "border-zinc-700 text-zinc-300 hover:border-zinc-500"
              }`}
            >
              {detail.pinned ? "Unpin" : "Pin"}
            </button>
            <button
              type="button"
              disabled={promoting || saving}
              onClick={() => void onPromote()}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-40"
            >
              {promoting ? "Promoting…" : "Promote → My Sites"}
            </button>
            <label className="text-xs text-zinc-500">
              Review status
              <select
                value={detail.reviewStatus}
                disabled={saving}
                onChange={(e) => patch({ reviewStatus: e.target.value })}
                className={inputClass}
              >
                {REVIEW_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {promoteLinks && (
            <div className="flex flex-wrap gap-3 text-sm">
              <Link
                to={promoteLinks.site}
                className="text-emerald-300 hover:underline"
              >
                Open tracked site →
              </Link>
              <Link
                to={promoteLinks.domains}
                className="text-emerald-300 hover:underline"
              >
                Domain ideas →
              </Link>
            </div>
          )}

          <label className="block text-xs text-zinc-500">
            Notes
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className={inputClass}
              placeholder="Why this matters, competitors, next steps…"
            />
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={saving || notes === detail.notes}
              onClick={() => patch({ notes })}
              className="rounded-md bg-zinc-200 px-3 py-1 text-xs font-semibold text-zinc-900 disabled:opacity-40"
            >
              Save notes
            </button>
            {saveError && (
              <span className="text-xs text-rose-400">{saveError}</span>
            )}
          </div>

          <section className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-medium text-zinc-200">
                Decision support
              </h3>
              <VerdictBadge verdict={verdict.verdict} score={verdict.score} />
            </div>
            <div className="space-y-2 text-sm leading-relaxed text-zinc-300">
              <p>{decision.brief.summary}</p>
              <p className="text-zinc-400">{decision.brief.whyRanks}</p>
              <p className="rounded-md border border-emerald-900/50 bg-emerald-950/30 px-2.5 py-1.5 text-emerald-300/95">
                Next: {decision.brief.nextStep}
              </p>
            </div>

            <div>
              <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                TAM / money model
              </p>
              <p className="mt-1 text-sm text-zinc-300">{verdict.tam.summary}</p>
              <p className="mt-1 text-xs text-zinc-500">
                Ad market {money(verdict.tam.adMarketUsd)} · SaaS ARR hint{" "}
                {money(verdict.tam.saasArrHintUsd, 0)}
              </p>
            </div>

            {(detail.serp?.length || verdict.organicSoftness != null) && (
              <div>
                <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                  Organic SERP
                  {detail.serpQuery ? ` · “${detail.serpQuery}”` : ""}
                  {verdict.organicSoftness != null
                    ? ` · softness ${(verdict.organicSoftness * 100).toFixed(0)}%`
                    : ""}
                </p>
                {detail.serp && detail.serp.length > 0 ? (
                  <ul className="mt-1.5 space-y-1">
                    {detail.serp.map((item) => (
                      <li
                        key={`${item.rank}-${item.domain}`}
                        className="flex flex-wrap items-baseline gap-x-2 rounded px-1.5 py-1 text-sm hover:bg-zinc-900/80"
                      >
                        <span className="tabular-nums text-zinc-500">
                          #{item.rank}
                        </span>
                        <span className="font-medium text-zinc-200">
                          {item.domain}
                        </span>
                        {item.pageType && (
                          <span className="rounded bg-zinc-800/80 px-1 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400">
                            {item.pageType}
                          </span>
                        )}
                        <span className="w-full text-xs text-zinc-500 sm:w-auto">
                          {item.title}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-xs text-zinc-500">
                    No SERP snapshot yet — re-run the niche pipeline to fetch
                    organic results.
                  </p>
                )}
              </div>
            )}

            <div>
              <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                Verdict factors
              </p>
              <ul className="mt-1.5 space-y-1">
                {verdict.factors.map((f) => (
                  <li
                    key={f.id}
                    className="flex flex-wrap items-baseline gap-x-2 rounded px-1.5 py-1 text-sm hover:bg-zinc-900/80"
                  >
                    <span className="tabular-nums text-emerald-300/90">
                      {(f.score * 100).toFixed(0)}
                    </span>
                    <span className="text-zinc-200">{f.label}</span>
                    <span className="text-xs text-zinc-500">{f.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
            {(detail.productAngle ||
              detail.monetizationModel ||
              detail.wedge) && (
              <div className="space-y-1.5 rounded-md border border-zinc-800 bg-zinc-950/40 px-2.5 py-2 text-sm">
                <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                  Build brief
                </p>
                {detail.productAngle && (
                  <p className="text-zinc-200">
                    <span className="text-zinc-500">Angle · </span>
                    {detail.productAngle}
                  </p>
                )}
                {detail.monetizationModel && (
                  <p className="text-zinc-200">
                    <span className="text-zinc-500">Monetize · </span>
                    {detail.monetizationModel}
                  </p>
                )}
                {detail.wedge && (
                  <p className="text-zinc-300">
                    <span className="text-zinc-500">Wedge · </span>
                    {detail.wedge}
                  </p>
                )}
              </div>
            )}
            <div>
              <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                Demand breakdown
              </p>
              <p className="mt-1 font-mono text-sm text-zinc-200">
                vol {decision.breakdown.volumeFactor} × comp{" "}
                {decision.breakdown.competitionFactor} × cpc̃{" "}
                {decision.breakdown.cpcFactor} ={" "}
                <span className="text-emerald-300">
                  {decision.breakdown.demandScore}
                </span>
              </p>
              <ul className="mt-1.5 space-y-0.5 text-xs text-zinc-400">
                {decision.breakdown.drivers.map((d) => (
                  <li key={d} className="flex gap-2">
                    <span className="text-zinc-600">·</span>
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                Rubric checks
              </p>
              <ul className="mt-1.5 space-y-1">
                {decision.rubric.checks.map((c) => (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-baseline gap-x-2 rounded px-1.5 py-1 text-sm hover:bg-zinc-900/80"
                  >
                    <span
                      className={
                        c.pass
                          ? "text-[11px] font-medium uppercase text-emerald-400"
                          : "text-[11px] font-medium uppercase text-rose-400"
                      }
                    >
                      {c.pass ? "Pass" : "Fail"}
                    </span>
                    <span className="text-zinc-200">{c.label}</span>
                    <span className="text-xs text-zinc-500">{c.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <p className="text-sm leading-relaxed text-zinc-400">
            {detail.reasoning}
          </p>

          <div className="table-scroll">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2">Term</th>
                  <th className="px-3 py-2">Volume</th>
                  <th className="px-3 py-2">CPC</th>
                  <th className="px-3 py-2">Ads comp</th>
                  <th className="px-3 py-2">12-mo</th>
                </tr>
              </thead>
              <tbody>
                {detail.keywords.map((k) => (
                  <tr key={k.id} className="border-t border-zinc-800/80">
                    <td className="px-3 py-2 text-zinc-200">{k.term}</td>
                    <td className="px-3 py-2 tabular-nums text-zinc-300">
                      {k.searchVolume == null ? "—" : num(k.searchVolume)}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-zinc-300">
                      {k.cpc == null ? "—" : money(k.cpc)}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-zinc-300">
                      {adsCompPct(k.competition)}
                    </td>
                    <td className="px-3 py-2">
                      <Sparkline data={k.monthlyTrend} tone="flat" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </aside>
    </>
  );
}
