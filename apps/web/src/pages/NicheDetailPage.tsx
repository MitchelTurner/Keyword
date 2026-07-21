import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  api,
  money,
  num,
  type NicheDetail,
  type OpportunityDetail,
  type OpportunityRow,
} from "../api";
import StatusBadge from "../components/StatusBadge";
import Sparkline from "../components/Sparkline";

type SortKey =
  | "demandScore"
  | "totalVolume"
  | "avgCpc"
  | "impliedCac"
  | "monthlyPriceFloor"
  | "painSeverity"
  | "productDescription"
  | "buyerType";

const IN_FLIGHT = new Set([
  "PENDING",
  "EXPANDING",
  "ENRICHING",
  "CLASSIFYING",
  "SCORING",
]);

export default function NicheDetailPage() {
  const { id = "" } = useParams();
  const [niche, setNiche] = useState<NicheDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [convRate, setConvRate] = useState("");
  const [ltvCacRatio, setLtvCacRatio] = useState("");
  const [saving, setSaving] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("demandScore");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selectedOppId, setSelectedOppId] = useState<string | null>(null);
  const [oppDetail, setOppDetail] = useState<OpportunityDetail | null>(null);

  async function refresh() {
    const data = await api.getNiche(id);
    setNiche(data);
    setConvRate(String(data.convRate));
    setLtvCacRatio(String(data.ltvCacRatio));
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

  const rows = useMemo(() => {
    if (!niche) return [];
    const sorted = [...niche.opportunities];
    sorted.sort((a, b) => {
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
    return sorted;
  }, [niche, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "productDescription" || key === "buyerType" ? "asc" : "desc");
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

  async function onRetry() {
    await api.retry(id);
    await refresh();
  }

  if (!niche) {
    return (
      <div className="text-sm text-zinc-500">
        {error ?? "Loading niche…"}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/" className="text-xs text-zinc-500 hover:text-zinc-300">
            ← All niches
          </Link>
          <h1 className="mt-1 text-xl font-semibold">{niche.seedTerm}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-zinc-400">
            <StatusBadge status={niche.status} />
            <span>{num(niche.keywordCount)} keywords</span>
            <span>
              cost {money(niche.costs.total, 4)}
              {Object.keys(niche.costs.byProvider).length > 0 && (
                <span className="text-zinc-600">
                  {" "}
                  (
                  {Object.entries(niche.costs.byProvider)
                    .map(([p, c]) => `${p} ${money(c, 4)}`)
                    .join(" · ")}
                  )
                </span>
              )}
            </span>
          </div>
          {niche.error && (
            <p className="mt-2 text-sm text-rose-400">{niche.error}</p>
          )}
        </div>
        {niche.status === "FAILED" && (
          <button
            type="button"
            onClick={onRetry}
            className="rounded bg-amber-600 px-3 py-1.5 text-sm font-medium text-zinc-950"
          >
            Retry failed stage
          </button>
        )}
      </div>

      <form
        onSubmit={onSaveAssumptions}
        className="grid gap-3 rounded border border-zinc-800 bg-zinc-900/40 p-4 sm:grid-cols-[1fr_1fr_auto]"
      >
        <label className="block text-xs text-zinc-500">
          Conversion rate (click → customer)
          <input
            type="number"
            step="0.001"
            min="0.0001"
            max="1"
            value={convRate}
            onChange={(e) => setConvRate(e.target.value)}
            className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100"
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
            className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100"
          />
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={saving || IN_FLIGHT.has(niche.status)}
            className="w-full rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-zinc-950 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save & re-score"}
          </button>
        </div>
      </form>

      {error && (
        <div className="rounded border border-rose-900 bg-rose-950/40 px-3 py-2 text-sm text-rose-300">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded border border-zinc-800">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-zinc-900/80 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              {(
                [
                  ["productDescription", "Product"],
                  ["buyerType", "Buyer"],
                  ["painSeverity", "Pain"],
                  ["totalVolume", "Volume"],
                  ["avgCpc", "Avg CPC"],
                  ["impliedCac", "Implied CAC"],
                  ["monthlyPriceFloor", "Mo. floor"],
                  ["demandScore", "Demand"],
                ] as Array<[SortKey, string]>
              ).map(([key, label]) => (
                <th key={key} className="px-3 py-2 font-medium">
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
                  colSpan={8}
                  className="px-3 py-8 text-center text-zinc-500"
                >
                  {IN_FLIGHT.has(niche.status)
                    ? "Pipeline running…"
                    : "No opportunities yet."}
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <OpportunityTableRow
                key={row.id}
                row={row}
                selected={selectedOppId === row.id}
                onSelect={() =>
                  setSelectedOppId((cur) => (cur === row.id ? null : row.id))
                }
              />
            ))}
          </tbody>
        </table>
      </div>

      {oppDetail && (
        <OpportunityDrawer
          detail={oppDetail}
          onClose={() => setSelectedOppId(null)}
        />
      )}
    </div>
  );
}

function OpportunityTableRow({
  row,
  selected,
  onSelect,
}: {
  row: OpportunityRow;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <tr
      onClick={onSelect}
      className={`cursor-pointer border-t border-zinc-800/80 hover:bg-zinc-900/60 ${selected ? "bg-zinc-900" : ""}`}
    >
      <td className="px-3 py-2 font-medium text-zinc-100">
        {row.productDescription}
        <div className="text-[11px] text-zinc-500">
          {row.keywordCount} keywords · {row.intent}
        </div>
      </td>
      <td className="px-3 py-2 text-zinc-300">{row.buyerType}</td>
      <td className="px-3 py-2 tabular-nums">{row.painSeverity}</td>
      <td className="px-3 py-2 tabular-nums">{num(row.totalVolume)}</td>
      <td className="px-3 py-2 tabular-nums">{money(row.avgCpc)}</td>
      <td className="px-3 py-2 tabular-nums">{money(row.impliedCac)}</td>
      <td className="px-3 py-2 tabular-nums">{money(row.monthlyPriceFloor)}</td>
      <td className="px-3 py-2 tabular-nums font-medium text-emerald-300">
        {row.demandScore.toFixed(2)}
      </td>
    </tr>
  );
}

function OpportunityDrawer({
  detail,
  onClose,
}: {
  detail: OpportunityDetail;
  onClose: () => void;
}) {
  return (
    <div className="rounded border border-zinc-700 bg-zinc-950/90 p-4 shadow-2xl shadow-black/40">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{detail.productDescription}</h2>
          <p className="mt-1 text-sm text-zinc-400">
            {detail.buyerType} · {detail.intent} · pain {detail.painSeverity}/5
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-zinc-500 hover:text-zinc-200"
        >
          Close
        </button>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-zinc-300">
        {detail.reasoning}
      </p>

      <div className="mt-4 overflow-x-auto rounded border border-zinc-800">
        <table className="w-full min-w-[700px] text-left text-sm">
          <thead className="bg-zinc-900/80 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2">Term</th>
              <th className="px-3 py-2">Volume</th>
              <th className="px-3 py-2">CPC</th>
              <th className="px-3 py-2">Comp</th>
              <th className="px-3 py-2">12-mo</th>
            </tr>
          </thead>
          <tbody>
            {detail.keywords.map((k) => (
              <tr key={k.id} className="border-t border-zinc-800/80">
                <td className="px-3 py-2">{k.term}</td>
                <td className="px-3 py-2 tabular-nums">
                  {k.searchVolume == null ? "—" : num(k.searchVolume)}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {k.cpc == null ? "—" : money(k.cpc)}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {k.competition == null ? "—" : k.competition.toFixed(2)}
                </td>
                <td className="px-3 py-2">
                  <Sparkline data={k.monthlyTrend} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
