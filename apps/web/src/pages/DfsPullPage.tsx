import {
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  DFS_MARKETS,
  DFS_PULL2_DEFAULT_MAX_COST,
  buildTrendsPlan,
  dfsAdsDateRange,
  dfsPull2EndpointLabel,
  isDfsPull2Source,
  isDfsPull3Source,
  labelRank,
  parseDfsPullSource,
  parsePlainKeywordList,
  sectionTitle,
  type DfsMarketId,
  type DfsParsedScript,
  type DfsPull2Plan,
  type DfsPullResult,
  type DfsPullRow,
  type DfsPullSummary,
  type DfsTrendsPull,
  type DfsVolumePoint,
} from "@prospector/shared";
import { api, money, num } from "../api";
import EmptyState from "../components/EmptyState";
import PageHeader from "../components/PageHeader";
import Panel from "../components/Panel";
import Sparkline from "../components/Sparkline";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const primaryBtn =
  "rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-45";
const ghostBtn =
  "rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-45";

function explain(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const trimmed = raw.replace(/^Error:\s*/, "");
  if (trimmed === "Failed to fetch" || trimmed.includes("<html") || trimmed.length > 400) {
    return "Could not reach the API.";
  }
  try {
    const parsed = JSON.parse(trimmed) as { message?: unknown };
    if (typeof parsed.message === "string") return parsed.message;
    if (Array.isArray(parsed.message)) return parsed.message.map(String).join("; ");
  } catch {
    /* body was not JSON */
  }
  return trimmed;
}

function formatAlaska(iso: string): string {
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Anchorage",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
  return `${formatted} Alaska`;
}

function formatIsoMonth(iso: string): string {
  const [year, month] = iso.split("-");
  const name = MONTHS[Number(month) - 1];
  return name && year ? `${name} ${year}` : iso;
}

function monthLabel(year: number, month: number): string {
  return `${MONTHS[month - 1] ?? month} ${year}`;
}

function toneOf(
  monthly: DfsVolumePoint[],
): "rising" | "flat" | "declining" | "unknown" {
  const values = monthly
    .map((point) => point.searchVolume)
    .filter((value): value is number => value != null);
  if (values.length < 4) return "unknown";
  const avg = (slice: number[]) =>
    slice.reduce((sum, value) => sum + value, 0) / slice.length;
  const first = avg(values.slice(0, 3));
  const last = avg(values.slice(-3));
  if (first <= 0) return last > 0 ? "rising" : "flat";
  const change = (last - first) / first;
  if (change > 0.15) return "rising";
  if (change < -0.15) return "declining";
  return "flat";
}

function summaryOf(result: DfsPullResult | DfsTrendsPull): DfsPullSummary {
  if (result.kind === "trends") {
    return {
      id: result.id,
      sourceName: result.sourceName,
      pulledAt: result.pulledAt,
      cost: result.cost,
      keywordCount: result.jobTotal,
      markets: [],
      warnings: result.warnings,
      kind: "trends",
      status: result.status,
      jobDone: result.jobDone,
      jobTotal: result.jobTotal,
      maxCost: result.maxCost,
    };
  }
  return {
    id: result.id,
    sourceName: result.sourceName,
    pulledAt: result.pulledAt,
    cost: result.cost,
    keywordCount: result.keywordCount,
    markets: result.markets,
    warnings: result.warnings,
    kind: "volume",
    status: result.status,
    jobDone: result.jobDone,
    jobTotal: result.jobTotal,
    maxCost: result.maxCost,
  };
}

function isTrends(pull: DfsPullResult | DfsTrendsPull): pull is DfsTrendsPull {
  return pull.kind === "trends";
}

export default function DfsPullPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const [scriptText, setScriptText] = useState("");
  const [sourceName, setSourceName] = useState("dfs_pull.py");
  const [parsed, setParsed] = useState<DfsParsedScript | null>(null);
  const [trendsPlan, setTrendsPlan] = useState<DfsPull2Plan | null>(null);
  const [trendsResult, setTrendsResult] = useState<DfsTrendsPull | null>(null);
  const [maxCost, setMaxCost] = useState(String(DFS_PULL2_DEFAULT_MAX_COST));
  const [unchecked, setUnchecked] = useState<Set<string>>(() => new Set());
  const [extraDraft, setExtraDraft] = useState("");
  const [markets, setMarkets] = useState<DfsMarketId[]>(
    DFS_MARKETS.map((market) => market.id),
  );
  const [parseError, setParseError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedUnavailable, setSavedUnavailable] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [reading, setReading] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<DfsPullResult | null>(null);
  const [pulls, setPulls] = useState<DfsPullSummary[]>([]);
  const [query, setQuery] = useState("");
  const [labelFilter, setLabelFilter] = useState("all");
  const [sort, setSort] = useState<{ key: "keyword" | DfsMarketId; dir: "asc" | "desc" }>({
    key: "ads_worldwide",
    dir: "desc",
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [fullHistory, setFullHistory] = useState(false);

  const range = dfsAdsDateRange();

  useEffect(() => {
    if (!result) return;
    setSort((prev) => {
      if (prev.key !== "keyword" && !result.markets.includes(prev.key)) {
        const first = result.markets[0];
        return first ? { key: first, dir: "desc" } : { key: "keyword", dir: "asc" };
      }
      return prev;
    });
  }, [result]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [latest, list] = await Promise.all([
          api.latestDfsPull(),
          api.listDfsPulls(),
        ]);
        if (cancelled) return;
        setPulls(list.pulls);
        if (latest.pull && isTrends(latest.pull)) setTrendsResult(latest.pull);
        else if (latest.pull) setResult(latest.pull);
      } catch (err) {
        if (!cancelled) setSavedUnavailable(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const sections = useMemo(() => {
    if (!parsed) return [];
    const buckets = new Map<string, DfsParsedScript["groups"]>();
    for (const group of parsed.groups) {
      const primary = group.labels[0] ?? "custom";
      const list = buckets.get(primary) ?? [];
      list.push(group);
      buckets.set(primary, list);
    }
    return [...buckets.entries()].sort(
      (a, b) => labelRank(a[0]) - labelRank(b[0]) || a[0].localeCompare(b[0]),
    );
  }, [parsed]);

  const selectedKeywords = useMemo(() => {
    if (!parsed) return [];
    return parsed.keywords.filter((keyword) => !unchecked.has(keyword.toLowerCase()));
  }, [parsed, unchecked]);

  const labelOptions = useMemo(() => {
    const labels = new Set<string>();
    for (const row of result?.rows ?? []) {
      for (const label of row.labels) labels.add(label);
    }
    return [...labels].sort(
      (a, b) => labelRank(a) - labelRank(b) || a.localeCompare(b),
    );
  }, [result]);

  const visibleRows = useMemo(() => {
    if (!result) return [];
    const q = query.trim().toLowerCase();
    const rows = result.rows.filter((row) => {
      if (labelFilter !== "all" && !row.labels.includes(labelFilter)) return false;
      if (q && !row.keyword.toLowerCase().includes(q)) return false;
      return true;
    });
    const dir = sort.dir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      if (sort.key === "keyword") return a.keyword.localeCompare(b.keyword) * dir;
      const left = a.markets[sort.key]?.searchVolume;
      const right = b.markets[sort.key]?.searchVolume;
      if (left == null && right == null) return a.keyword.localeCompare(b.keyword);
      if (left == null) return 1;
      if (right == null) return -1;
      if (left === right) return a.keyword.localeCompare(b.keyword);
      return (left - right) * dir;
    });
    return rows;
  }, [result, query, labelFilter, sort]);

  const selectedRow =
    result?.rows.find((row) => row.keyword === selected) ?? null;

  const detailMonths = useMemo(() => {
    if (!selectedRow || !result) return [];
    const keys = new Set<string>();
    for (const market of result.markets) {
      for (const point of selectedRow.markets[market]?.monthly ?? []) {
        keys.add(`${point.year}-${String(point.month).padStart(2, "0")}`);
      }
    }
    return [...keys]
      .map((key) => {
        const [yearText, monthText] = key.split("-");
        return { year: Number(yearText), month: Number(monthText) };
      })
      .filter((point) => point.year > 0 && point.month >= 1 && point.month <= 12)
      .sort((a, b) => b.year - a.year || b.month - a.month);
  }, [selectedRow, result]);

  function applySource(text: string, name: string) {
    setScriptText(text);
    setSourceName(name);
    setParseError(null);
    if (isDfsPull3Source(text) || isDfsPull2Source(text)) {
      try {
        const plan = buildTrendsPlan(text, name);
        setTrendsPlan(plan);
        setParsed(null);
      } catch (err) {
        setTrendsPlan(null);
        setParseError(explain(err));
      }
      return;
    }
    setTrendsPlan(null);
    try {
      const next = parseDfsPullSource(text, name);
      setParsed(next);
      setUnchecked(new Set());
    } catch (err) {
      setParseError(explain(err));
    }
  }

  async function readFile(file: File) {
    setReading(true);
    setError(null);
    try {
      applySource(await file.text(), file.name || "dfs_pull.py");
    } catch (err) {
      setParseError(explain(err));
    } finally {
      setReading(false);
    }
  }

  async function loadIncluded(path: string, name: string) {
    setReading(true);
    setError(null);
    try {
      const res = await fetch(path);
      const text = await res.text();
      if (!res.ok || text.trim().startsWith("<")) {
        throw new Error(`Included ${name} was not found.`);
      }
      applySource(text, name);
    } catch (err) {
      setParseError(explain(err));
    } finally {
      setReading(false);
    }
  }

  function toggleMarket(id: DfsMarketId) {
    setMarkets((prev) => {
      if (prev.includes(id)) {
        if (prev.length === 1) return prev;
        return prev.filter((market) => market !== id);
      }
      return DFS_MARKETS.map((market) => market.id).filter(
        (market) => prev.includes(market) || market === id,
      );
    });
  }

  function toggleKeyword(keyword: string) {
    const key = keyword.toLowerCase();
    setUnchecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function addKeywords(raw: string) {
    const terms = parsePlainKeywordList(raw);
    if (terms.length === 0) return;
    const groups = [...(parsed?.groups ?? [])];
    const keywords = [...(parsed?.keywords ?? [])];
    const enable: string[] = [];
    for (const term of terms) {
      const key = term.toLowerCase();
      const existing = groups.find((group) => group.keyword.toLowerCase() === key);
      if (existing) {
        enable.push(key);
        continue;
      }
      groups.push({ keyword: term, labels: ["custom"] });
      keywords.push(term);
    }
    keywords.sort((a, b) => a.localeCompare(b));
    setParsed({
      sourceName: parsed?.sourceName ?? sourceName,
      keywords,
      groups,
    });
    if (enable.length > 0) {
      setUnchecked((prev) => {
        const next = new Set(prev);
        for (const key of enable) next.delete(key);
        return next;
      });
    }
    setExtraDraft("");
    setParseError(null);
  }

  function toggleSort(key: "keyword" | DfsMarketId) {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "keyword" ? "asc" : "desc" },
    );
  }

  async function onPull(e: FormEvent) {
    e.preventDefault();
    if (!parsed || selectedKeywords.length === 0 || markets.length === 0) return;
    if (selectedKeywords.length > 700) {
      setError("DataForSEO accepts 700 keywords per pull. Uncheck some.");
      return;
    }
    const marketLabels = DFS_MARKETS.filter((market) => markets.includes(market.id))
      .map((market) => market.label)
      .join(", ");
    const ok = confirm(
      `Pull ${selectedKeywords.length} keywords from ${parsed.sourceName}?\n\nMarkets: ${marketLabels}\n\nThis runs the same DataForSEO calls as dfs_pull.py (usually a few cents).`,
    );
    if (!ok) return;
    setPulling(true);
    setError(null);
    try {
      const selectedSet = new Set(selectedKeywords.map((keyword) => keyword.toLowerCase()));
      setTrendsResult(null);
      const created = await api.createDfsPull({
        sourceName: parsed.sourceName,
        keywords: selectedKeywords,
        groups: parsed.groups.filter((group) =>
          selectedSet.has(group.keyword.toLowerCase()),
        ),
        markets,
      });
      setResult(created);
      setLabelFilter("all");
      setQuery("");
      setSelected(null);
      setFullHistory(false);
      setPulls((prev) =>
        [summaryOf(created), ...prev.filter((item) => item.id !== created.id)].slice(0, 12),
      );
      const firstMarket = created.markets[0];
      if (firstMarket) setSort({ key: firstMarket, dir: "desc" });
      requestAnimationFrame(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (err) {
      setError(explain(err));
    } finally {
      setPulling(false);
    }
  }

  function parsedMaxCost(): number | null {
    const value = Number(maxCost);
    if (!Number.isFinite(value) || value <= 0 || value > 100) return null;
    return value;
  }

  async function runTrends(mode: "start" | "continue" | "retry") {
    const cap = parsedMaxCost();
    if (cap == null) {
      setError("Cost cap must be a number from 0.01 to 100.");
      return;
    }
    if (mode === "start" && !trendsPlan) return;
    if (mode !== "start" && !trendsResult) return;
    if (mode === "start" && trendsPlan) {
      const ok = confirm(
        `Run ${trendsPlan.jobs.length} DataForSEO requests from ${trendsPlan.sourceName}?\n\nCost cap: $${cap.toFixed(2)}. The pull stops when that is reached. Login lines in the script are ignored.`,
      );
      if (!ok) return;
    }
    setPulling(true);
    setError(null);
    setResult(null);
    try {
      let current =
        mode === "start"
          ? await api.startDfsTrends({
              source: scriptText,
              sourceName: trendsPlan?.sourceName ?? sourceName,
              maxCost: cap,
            })
          : await api.continueDfsTrends(trendsResult!.id, {
              maxCost: cap,
              retryFailed: mode === "retry",
            });
      setTrendsResult(current);
      setPulls((prev) =>
        [summaryOf(current), ...prev.filter((item) => item.id !== current.id)].slice(0, 12),
      );
      while (current.status === "running") {
        current = await api.continueDfsTrends(current.id, { maxCost: cap });
        setTrendsResult(current);
      }
      requestAnimationFrame(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (err) {
      setError(explain(err));
    } finally {
      setPulling(false);
    }
  }

  async function openPull(id: string) {
    if (!id || id === result?.id || id === trendsResult?.id) return;
    setError(null);
    setPulling(true);
    try {
      const next = await api.getDfsPull(id);
      if (isTrends(next)) {
        setTrendsResult(next);
        setResult(null);
        setTrendsPlan(null);
      } else {
        setResult(next);
        setTrendsResult(null);
        setSelected(null);
        setLabelFilter("all");
        setFullHistory(false);
      }
    } catch (err) {
      setError(explain(err));
    } finally {
      setPulling(false);
    }
  }

  async function downloadTrends(id: string) {
    const raw = await api.rawDfsPull(id);
    const blob = new Blob([JSON.stringify(raw)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = trendsResult?.resultsFile || "dfs_results2.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  function download(current: DfsPullResult) {
    const blob = new Blob([JSON.stringify(current, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "dfs_results.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  const shownMonths = fullHistory ? detailMonths : detailMonths.slice(0, 24);

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="DFS pull"
        description="Enter dfs_pull.py for monthly search volumes, dfs_pull2.py for Trends plus results pages, or dfs_pull3.py for the longer Trends backtest."
      />

      {error && (
        <div className="rounded-md border border-rose-900 bg-rose-950/40 px-3 py-2 text-sm text-rose-300">
          {error}
        </div>
      )}
      {savedUnavailable && !error && (
        <div className="rounded-md border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-400">
          Saved pulls could not be loaded. You can still enter a script.
        </div>
      )}

      <Panel
        title="Enter a script"
        hint="Volume scripts send keyword lists. dfs_pull2.py and dfs_pull3.py send their request lists. Login lines are ignored."
      >
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files[0];
            if (file) void readFile(file);
          }}
          className={`rounded-md border border-dashed px-3 py-4 transition ${
            dragging
              ? "border-emerald-600 bg-emerald-950/20"
              : "border-zinc-700 bg-zinc-950/30"
          }`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={primaryBtn}
              disabled={reading || pulling}
              onClick={() => fileRef.current?.click()}
            >
              {reading ? "Reading…" : "Enter script"}
            </button>
            <button
              type="button"
              className={ghostBtn}
              disabled={reading || pulling}
              onClick={() => void loadIncluded("/dfs_pull.py", "dfs_pull.py")}
            >
              Load dfs_pull.py
            </button>
            <button
              type="button"
              className={ghostBtn}
              disabled={reading || pulling}
              onClick={() => void loadIncluded("/dfs_pull2.py", "dfs_pull2.py")}
            >
              Load dfs_pull2.py
            </button>
            <button
              type="button"
              className={ghostBtn}
              disabled={reading || pulling}
              onClick={() => void loadIncluded("/dfs_pull3.py", "dfs_pull3.py")}
            >
              Load dfs_pull3.py
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".py,.txt,text/x-python,text/plain"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void readFile(file);
              }}
            />
            <span className="text-xs text-zinc-500">
              or drop the file here
            </span>
          </div>
          <label className="mt-3 block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-zinc-500">
              Or paste a script
            </span>
            <textarea
              value={scriptText}
              onChange={(e) => setScriptText(e.target.value)}
              placeholder={"PAST = {\n    2024: [\"example name\"],\n}\nCONTROLS = [\"taylor swift\"]"}
              spellCheck={false}
              className="h-36 w-full resize-y rounded-md border border-zinc-700 bg-zinc-950/80 px-3 py-2 font-mono text-xs text-zinc-100 outline-none ring-emerald-500/30 transition focus:border-emerald-700 focus:ring"
            />
          </label>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={ghostBtn}
              disabled={reading || pulling || !scriptText.trim()}
              onClick={() => applySource(scriptText, sourceName || "dfs_pull.py")}
            >
              Read script
            </button>
            {parsed && (
              <span className="text-xs text-zinc-400">
                {parsed.sourceName}: {parsed.keywords.length} keywords
                {selectedKeywords.length !== parsed.keywords.length &&
                  ` · ${selectedKeywords.length} selected`}
              </span>
            )}
            {trendsPlan && (
              <span className="text-xs text-zinc-400">
                {trendsPlan.sourceName}: {trendsPlan.jobs.length} requests · anchor{" "}
                {trendsPlan.anchor}
              </span>
            )}
          </div>
          {parseError && (
            <p className="mt-2 text-sm text-rose-300">{parseError}</p>
          )}
        </div>

        {trendsPlan && (
          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void runTrends("start");
            }}
          >
            <div className="flex flex-wrap gap-2 text-xs text-zinc-300">
              {trendsPlan.endpoints.map((item) => (
                <span
                  key={item.path}
                  className="rounded border border-zinc-800 bg-zinc-950/60 px-2 py-1"
                >
                  {dfsPull2EndpointLabel(item.path)}{" "}
                  <span className="tabular-nums text-zinc-500">{item.count}</span>
                </span>
              ))}
            </div>
            <p className="text-xs text-zinc-500">
              Anchor {trendsPlan.anchor}. Dates use UTC, the same window as the script.
              Requests run in short batches so a long pull can resume. Raw download:{" "}
              {trendsPlan.resultsFile}
            </p>
            <label className="block max-w-xs text-xs text-zinc-400">
              Cost cap (USD)
              <input
                value={maxCost}
                onChange={(e) => setMaxCost(e.target.value)}
                inputMode="decimal"
                className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-100 outline-none ring-emerald-500/30 transition focus:border-emerald-700 focus:ring"
              />
            </label>
            <button type="submit" className={primaryBtn} disabled={pulling}>
              {pulling
                ? "Pulling…"
                : `Run ${trendsPlan.jobs.length} requests`}
            </button>
          </form>
        )}

        {parsed && (
          <form onSubmit={onPull} className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-medium text-zinc-200">Keywords</h3>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="text-xs text-zinc-400 hover:text-zinc-200"
                  onClick={() => setUnchecked(new Set())}
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="text-xs text-zinc-400 hover:text-zinc-200"
                  onClick={() =>
                    setUnchecked(
                      new Set(parsed.keywords.map((keyword) => keyword.toLowerCase())),
                    )
                  }
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="max-h-72 space-y-3 overflow-auto pr-1">
              {sections.map(([label, groups]) => (
                <div key={label}>
                  <div className="mb-1 text-[11px] uppercase tracking-wide text-zinc-500">
                    {sectionTitle(label)}
                    <span className="ml-2 tabular-nums text-zinc-600">{groups.length}</span>
                  </div>
                  <ul className="grid gap-1 sm:grid-cols-2">
                    {groups.map((group) => {
                      const on = !unchecked.has(group.keyword.toLowerCase());
                      const extra = group.labels.slice(1);
                      return (
                        <li key={group.keyword}>
                          <label className="flex items-start gap-2 text-sm text-zinc-200">
                            <input
                              type="checkbox"
                              className="mt-1 accent-emerald-500"
                              checked={on}
                              onChange={() => toggleKeyword(group.keyword)}
                            />
                            <span>
                              {group.keyword}
                              {extra.length > 0 && (
                                <span className="ml-2 text-[11px] text-zinc-500">
                                  {extra.join(" · ")}
                                </span>
                              )}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={extraDraft}
                onChange={(e) => setExtraDraft(e.target.value)}
                placeholder="Add a keyword"
                className="w-full rounded-md border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-100 outline-none ring-emerald-500/30 transition focus:border-emerald-700 focus:ring"
              />
              <button
                type="button"
                className={ghostBtn}
                disabled={!extraDraft.trim()}
                onClick={() => addKeywords(extraDraft)}
              >
                Add
              </button>
            </div>

            <div>
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-zinc-500">
                Markets
              </span>
              <div className="flex flex-wrap gap-1.5">
                {DFS_MARKETS.map((market) => {
                  const on = markets.includes(market.id);
                  return (
                    <button
                      key={market.id}
                      type="button"
                      onClick={() => toggleMarket(market.id)}
                      className={`rounded border px-2.5 py-1 text-xs transition ${
                        on
                          ? "border-emerald-800/70 bg-emerald-950/40 text-emerald-300"
                          : "border-zinc-800 text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      {market.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-zinc-500">
                Worldwide Google Ads {formatIsoMonth(range.dateFrom)} –{" "}
                {formatIsoMonth(range.dateTo)}. Labs history runs back to 2019 for the
                US, Brazil, and the UK. Server DataForSEO credentials are used; login
                lines in the script are ignored.
              </p>
            </div>

            <button
              type="submit"
              className={primaryBtn}
              disabled={pulling || selectedKeywords.length === 0}
            >
              {pulling
                ? "Pulling volumes…"
                : `Pull volumes (${selectedKeywords.length})`}
            </button>
            {pulling && (
              <p className="text-xs text-zinc-500">
                Worldwide Ads, then the US, Brazil, and the UK. This usually takes under a minute.
              </p>
            )}
          </form>
        )}
      </Panel>

      {(loading || result || trendsResult || pulls.length > 0) && (
      <div ref={resultsRef}>
        <Panel
          title={trendsResult ? "Trends pull" : "Volumes"}
          hint={
            trendsResult
              ? `${formatAlaska(trendsResult.pulledAt)} · ${money(trendsResult.cost, 2)} of ${money(trendsResult.maxCost, 2)} · ${trendsResult.sourceName}`
              : result
                ? `${formatAlaska(result.pulledAt)} · ${money(result.cost, 2)} · ${result.sourceName}`
                : undefined
          }
        >
          {pulls.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <label className="text-xs text-zinc-500">
                Previous pulls
                <select
                  className="ml-2 rounded-md border border-zinc-700 bg-zinc-950/80 px-2 py-1 text-xs text-zinc-200"
                  value={trendsResult?.id ?? result?.id ?? ""}
                  disabled={pulling}
                  onChange={(e) => void openPull(e.target.value)}
                >
                  {pulls.map((pull) => (
                    <option key={pull.id} value={pull.id}>
                      {formatAlaska(pull.pulledAt)} ·{" "}
                      {pull.kind === "trends"
                        ? `${pull.jobDone}/${pull.jobTotal || pull.keywordCount} requests`
                        : `${pull.keywordCount} keywords`}{" "}
                      · {money(pull.cost, 2)}
                    </option>
                  ))}
                </select>
              </label>
              {trendsResult && (
                <>
                  <button
                    type="button"
                    className={ghostBtn}
                    onClick={() => void downloadTrends(trendsResult.id).catch((err) => setError(explain(err)))}
                  >
                    Download raw JSON
                  </button>
                  {trendsResult.failed > 0 && (
                    <button
                      type="button"
                      className={ghostBtn}
                      disabled={pulling}
                      onClick={() => void runTrends("retry")}
                    >
                      Retry failed
                    </button>
                  )}
                  {(trendsResult.status === "capped" || trendsResult.status === "running") && (
                    <button
                      type="button"
                      className={ghostBtn}
                      disabled={pulling}
                      onClick={() => void runTrends("continue")}
                    >
                      Continue
                    </button>
                  )}
                </>
              )}
              {result && !trendsResult && (
                <button
                  type="button"
                  className={ghostBtn}
                  onClick={() => download(result)}
                >
                  Download JSON
                </button>
              )}
            </div>
          )}

          {loading && !result && (
            <p className="text-sm text-zinc-500">Loading saved pulls…</p>
          )}

          {!loading && !result && !trendsResult && (
            <EmptyState
              title="No pull yet"
              description="Enter dfs_pull.py for volumes, dfs_pull2.py for Trends and results, or dfs_pull3.py for the longer Trends backtest."
            />
          )}

          {trendsResult && (
            <div className="space-y-3">
              <p className="text-sm text-zinc-300">
                {trendsResult.jobDone} of {trendsResult.jobTotal} finished
                {trendsResult.failed > 0 ? ` · ${trendsResult.failed} failed` : ""}
                {" · "}
                {trendsResult.status === "running"
                  ? "still running"
                  : trendsResult.status === "capped"
                    ? "stopped at the cost cap"
                    : "finished"}
              </p>
              {trendsResult.warnings.length > 0 && (
                <div className="rounded-md border border-amber-900/40 bg-amber-950/20 px-3 py-2 text-xs text-amber-200/90">
                  {trendsResult.warnings.join(" ")}
                </div>
              )}
              <div className="max-h-80 overflow-auto rounded-md border border-zinc-800">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-zinc-900 text-zinc-500">
                    <tr>
                      <th className="px-2 py-1.5 font-medium">Request</th>
                      <th className="px-2 py-1.5 font-medium">Endpoint</th>
                      <th className="px-2 py-1.5 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trendsResult.jobs.map((job, index) => (
                      <tr key={`${job.key}-${index}`} className="border-t border-zinc-800/80">
                        <td className="px-2 py-1.5 text-zinc-200">{job.key}</td>
                        <td className="px-2 py-1.5 text-zinc-400">
                          {dfsPull2EndpointLabel(job.path)}
                        </td>
                        <td className="px-2 py-1.5 text-zinc-400">
                          {job.statusCode == null
                            ? "waiting"
                            : job.ok
                              ? "ok"
                              : `${job.statusCode}${job.message ? ` ${job.message}` : ""}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {result && !trendsResult && (
            <div className="space-y-3">
              {result.warnings.length > 0 && (
                <div className="rounded-md border border-amber-900/40 bg-amber-950/20 px-3 py-2 text-xs text-amber-200/90">
                  {result.warnings.join(" ")}
                </div>
              )}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter keywords"
                  className="w-full rounded-md border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-100 outline-none ring-emerald-500/30 transition focus:border-emerald-700 focus:ring sm:max-w-xs"
                />
                <div className="flex flex-wrap gap-1">
                  <FilterChip
                    label="All"
                    on={labelFilter === "all"}
                    onClick={() => setLabelFilter("all")}
                  />
                  {labelOptions.map((label) => (
                    <FilterChip
                      key={label}
                      label={sectionTitle(label)}
                      on={labelFilter === label}
                      onClick={() => setLabelFilter(label)}
                    />
                  ))}
                </div>
              </div>

              <div className="table-scroll max-h-[32rem]">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-zinc-500">
                      <th className="px-3 py-2 font-medium">
                        <SortButton
                          label="Keyword"
                          active={sort.key === "keyword"}
                          dir={sort.dir}
                          onClick={() => toggleSort("keyword")}
                        />
                      </th>
                      {result.markets.map((market) => {
                        const meta = DFS_MARKETS.find((item) => item.id === market);
                        return (
                          <th key={market} className="px-3 py-2 font-medium">
                            <SortButton
                              label={meta?.label ?? market}
                              active={sort.key === market}
                              dir={sort.dir}
                              onClick={() => toggleSort(market)}
                            />
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((row) => (
                      <tr
                        key={row.keyword}
                        className={`cursor-pointer border-t border-zinc-800/80 ${
                          selected === row.keyword ? "bg-emerald-950/20" : ""
                        }`}
                        onClick={() => {
                          setSelected(row.keyword);
                          setFullHistory(false);
                        }}
                      >
                        <td className="px-3 py-2 align-middle">
                          <div className="text-zinc-100">{row.keyword}</div>
                          {row.labels.length > 0 && (
                            <div className="text-[11px] text-zinc-500">
                              {row.labels.map(sectionTitle).join(" · ")}
                            </div>
                          )}
                        </td>
                        {result.markets.map((market) => (
                          <td key={market} className="px-3 py-2 align-middle">
                            <VolumeCell series={row.markets[market]} />
                          </td>
                        ))}
                      </tr>
                    ))}
                    {visibleRows.length === 0 && (
                      <tr>
                        <td
                          colSpan={1 + result.markets.length}
                          className="px-3 py-8 text-center text-sm text-zinc-500"
                        >
                          No keywords match this filter.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {selectedRow && (
                <KeywordHistory
                  row={selectedRow}
                  markets={result.markets}
                  months={shownMonths}
                  truncated={detailMonths.length > shownMonths.length}
                  onShowAll={() => setFullHistory(true)}
                  onClose={() => setSelected(null)}
                />
              )}
            </div>
          )}
        </Panel>
      </div>
      )}
    </div>
  );
}

function FilterChip({
  label,
  on,
  onClick,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded border px-2 py-1 text-[11px] transition ${
        on
          ? "border-emerald-800/70 bg-emerald-950/40 text-emerald-300"
          : "border-zinc-800 text-zinc-500 hover:text-zinc-300"
      }`}
    >
      {label}
    </button>
  );
}

function SortButton({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 uppercase tracking-wide ${
        active ? "text-zinc-200" : "text-zinc-500 hover:text-zinc-300"
      }`}
    >
      {label}
      {active && <span aria-hidden>{dir === "asc" ? "↑" : "↓"}</span>}
    </button>
  );
}

function VolumeCell({
  series,
}: {
  series: DfsPullRow["markets"][DfsMarketId];
}) {
  if (!series || (series.searchVolume == null && series.monthly.length === 0)) {
    return <span className="text-zinc-600">—</span>;
  }
  return (
    <div className="flex items-center gap-2">
      <span className="tabular-nums text-zinc-100">
        {series.searchVolume == null ? "—" : num(series.searchVolume)}
      </span>
      <Sparkline
        data={series.monthly.map((point) => ({
          year: point.year,
          month: point.month,
          search_volume: point.searchVolume,
        }))}
        tone={toneOf(series.monthly)}
      />
    </div>
  );
}

function KeywordHistory({
  row,
  markets,
  months,
  truncated,
  onShowAll,
  onClose,
}: {
  row: DfsPullRow;
  markets: DfsMarketId[];
  months: Array<{ year: number; month: number }>;
  truncated: boolean;
  onShowAll: () => void;
  onClose: () => void;
}) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/40 p-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium text-zinc-100">{row.keyword}</h3>
        <button type="button" className="text-xs text-zinc-500 hover:text-zinc-300" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="mb-3 flex flex-wrap gap-3 text-xs text-zinc-400">
        {markets.map((market) => {
          const series = row.markets[market];
          const meta = DFS_MARKETS.find((item) => item.id === market);
          return (
            <span key={market}>
              {meta?.label ?? market}:{" "}
              <span className="tabular-nums text-zinc-200">
                {series?.searchVolume == null ? "—" : num(series.searchVolume)}
              </span>
              {series?.cpc != null && (
                <span className="text-zinc-500"> · CPC {money(series.cpc, 2)}</span>
              )}
            </span>
          );
        })}
      </div>
      {months.length === 0 ? (
        <p className="text-sm text-zinc-500">No monthly history came back for this keyword.</p>
      ) : (
        <div className="table-scroll max-h-80">
          <table className="min-w-full text-left text-xs">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-zinc-500">
                <th className="px-3 py-2 font-medium">Month</th>
                {markets.map((market) => (
                  <th key={market} className="px-3 py-2 font-medium">
                    {DFS_MARKETS.find((item) => item.id === market)?.label ?? market}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {months.map((point) => (
                <tr
                  key={`${point.year}-${point.month}`}
                  className="border-t border-zinc-800/80"
                >
                  <td className="px-3 py-1.5 text-zinc-300">
                    {monthLabel(point.year, point.month)}
                  </td>
                  {markets.map((market) => {
                    const value = row.markets[market]?.monthly.find(
                      (item) => item.year === point.year && item.month === point.month,
                    )?.searchVolume;
                    return (
                      <td key={market} className="px-3 py-1.5 tabular-nums text-zinc-200">
                        {value == null ? "—" : num(value)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {truncated && (
        <button
          type="button"
          className="mt-2 text-xs text-emerald-300 hover:text-emerald-200"
          onClick={onShowAll}
        >
          Show full history
        </button>
      )}
    </div>
  );
}
