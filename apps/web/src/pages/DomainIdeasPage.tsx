import { FormEvent, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  num,
  type DomainIdea,
  type DomainSuggestResponse,
} from "../api";
import EmptyState from "../components/EmptyState";
import PageHeader from "../components/PageHeader";
import Panel from "../components/Panel";

const DEFAULT_TLDS = ["com", "io", "co", "app", "dev"];

function availabilityBadge(available: boolean | null) {
  if (available === true) {
    return (
      <span className="rounded border border-emerald-900/60 bg-emerald-950/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-emerald-300">
        Likely available
      </span>
    );
  }
  if (available === false) {
    return (
      <span className="rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-500">
        Taken
      </span>
    );
  }
  return (
    <span className="rounded border border-amber-900/50 bg-amber-950/30 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-300/90">
      Unknown
    </span>
  );
}

export default function DomainIdeasPage() {
  const [topic, setTopic] = useState("");
  const [tlds, setTlds] = useState<string[]>(["com", "io", "app"]);
  const [result, setResult] = useState<DomainSuggestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<"all" | "available">("all");
  const [savingDomain, setSavingDomain] = useState<string | null>(null);

  const rows = useMemo(() => {
    const list = result?.domains ?? [];
    if (filter === "available") {
      return list.filter((d) => d.available === true);
    }
    return list;
  }, [result, filter]);

  function toggleTld(tld: string) {
    setTlds((prev) => {
      if (prev.includes(tld)) {
        if (prev.length === 1) return prev;
        return prev.filter((t) => t !== tld);
      }
      return [...prev, tld];
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!topic.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const data = await api.suggestDomains({
        topic: topic.trim(),
        tlds,
        limit: 30,
      });
      setResult(data);
      setFilter("all");
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function trackAsSite(idea: DomainIdea) {
    setSavingDomain(idea.domain);
    setError(null);
    try {
      const name =
        idea.relatedKeyword?.trim() ||
        idea.label.replace(/([a-z])([A-Z])/g, "$1 $2") ||
        idea.domain;
      await api.createSite({
        name: name.slice(0, 120),
        domain: idea.domain,
      });
    } catch (err) {
      setError(String(err));
    } finally {
      setSavingDomain(null);
    }
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="Domain ideas"
        description="Enter a topic to get SEO-rooted domain suggestions, scored for brand/SEO fit, with a quick DNS availability check."
      />

      {error && (
        <div className="rounded-md border border-rose-900 bg-rose-950/40 px-3 py-2 text-sm text-rose-300">
          {error}
        </div>
      )}

      <Panel>
        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-zinc-500">
              Topic / niche
            </span>
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. salon management, HOA management, field service"
              autoFocus
              className="w-full rounded-md border border-zinc-700 bg-zinc-950/80 px-3 py-2.5 text-sm text-zinc-100 outline-none ring-emerald-500/30 transition focus:border-emerald-700 focus:ring"
            />
          </label>

          <div>
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-zinc-500">
              TLDs
            </span>
            <div className="flex flex-wrap gap-1.5">
              {DEFAULT_TLDS.map((tld) => {
                const on = tlds.includes(tld);
                return (
                  <button
                    key={tld}
                    type="button"
                    onClick={() => toggleTld(tld)}
                    className={`rounded border px-2.5 py-1 text-xs transition ${
                      on
                        ? "border-emerald-800/70 bg-emerald-950/40 text-emerald-300"
                        : "border-zinc-800 text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    .{tld}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-zinc-600">
              Uses related keywords for SEO roots, then checks DNS for likely
              availability.
            </p>
            <button
              type="submit"
              disabled={busy || !topic.trim()}
              className="rounded-md bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {busy ? "Generating…" : "Suggest domains"}
            </button>
          </div>
        </form>
      </Panel>

      {result && (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-zinc-100">
                Results for “{result.topic}”
              </h2>
              <p className="mt-1 text-xs text-zinc-600">
                {result.availableCount} likely available · {result.count} shown
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ["all", "All"],
                  ["available", "Available"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilter(id)}
                  className={`rounded border px-2.5 py-1 text-xs transition ${
                    filter === id
                      ? "border-zinc-600 bg-zinc-800 text-zinc-100"
                      : "border-zinc-800 text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {result.keywords.length > 0 && (
            <p className="text-xs text-zinc-500">
              SEO keywords:{" "}
              {result.keywords
                .slice(0, 8)
                .map(
                  (k) =>
                    `${k.term}${k.volume != null ? ` (${num(k.volume)})` : ""}`,
                )
                .join(" · ")}
            </p>
          )}

          <p className="text-[11px] text-zinc-600">{result.note}</p>

          <div className="table-scroll max-h-[70vh]">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2.5">Domain</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">SEO</th>
                  <th className="px-3 py-2.5">Keyword</th>
                  <th className="px-3 py-2.5">Why</th>
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <EmptyState
                        title="No domains in this filter"
                        description="Try showing all results, or run another topic."
                      />
                    </td>
                  </tr>
                )}
                {rows.map((d) => (
                  <tr key={d.domain} className="border-t border-zinc-800/80">
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-emerald-300">
                        {d.domain}
                      </div>
                      <div className="mt-0.5 text-[11px] uppercase tracking-wide text-zinc-600">
                        .{d.tld} · {d.source}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      {availabilityBadge(d.available)}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-zinc-300">
                      {d.seoScore}
                    </td>
                    <td className="px-3 py-2.5 text-zinc-400">
                      {d.relatedKeyword ?? "—"}
                      {d.keywordVolume != null && (
                        <span className="ml-1 text-zinc-600">
                          ({num(d.keywordVolume)}/mo)
                        </span>
                      )}
                    </td>
                    <td className="max-w-xs px-3 py-2.5 text-xs text-zinc-500">
                      {d.rationale}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <a
                          href={`https://www.godaddy.com/domainsearch/find?domainToCheck=${encodeURIComponent(d.domain)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-sky-300 hover:underline"
                        >
                          Check registrar
                        </a>
                        <button
                          type="button"
                          disabled={savingDomain === d.domain}
                          onClick={() => void trackAsSite(d)}
                          className="text-xs text-emerald-300 hover:underline disabled:opacity-50"
                        >
                          {savingDomain === d.domain
                            ? "Saving…"
                            : "Track site"}
                        </button>
                        <Link
                          to={`/?seed=${encodeURIComponent(d.relatedKeyword || topic)}`}
                          className="text-xs text-amber-300/90 hover:underline"
                        >
                          Research
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!result && !busy && (
        <EmptyState
          title="No domain ideas yet"
          description="Enter a management niche topic to generate SEO-friendly domains and see which ones look available."
        />
      )}
    </div>
  );
}
