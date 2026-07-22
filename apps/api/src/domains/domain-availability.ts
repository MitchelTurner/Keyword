import { promises as dns } from "dns";

export type DomainAvailability = {
  domain: string;
  /** true = likely available, false = taken, null = unknown */
  available: boolean | null;
  method: "dns" | "dns-error";
  detail?: string;
};

/**
 * Lightweight availability probe via DNS.
 * - A/AAAA/NS/CNAME present → treated as taken
 * - ENOTFOUND / ENODATA across lookups → likely available to register
 *
 * Not a registrar quote — reserved/premium names can still be unavailable.
 */
export async function checkDomainAvailability(
  domain: string,
): Promise<DomainAvailability> {
  const host = domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");

  if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(host)) {
    return {
      domain: host,
      available: null,
      method: "dns-error",
      detail: "invalid domain",
    };
  }

  const lookups: Array<() => Promise<unknown>> = [
    () => dns.resolve4(host),
    () => dns.resolve6(host),
    () => dns.resolveNs(host),
    () => dns.resolveCname(host),
  ];

  let sawNotFound = 0;
  let lastError: string | undefined;

  for (const lookup of lookups) {
    try {
      await lookup();
      return { domain: host, available: false, method: "dns", detail: "dns-record" };
    } catch (err) {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code?: string }).code)
          : "";
      if (code === "ENOTFOUND" || code === "ENODATA") {
        sawNotFound += 1;
        continue;
      }
      // ENOTIMP / ESERVFAIL / etc. — keep going; don't treat as taken.
      lastError = code || (err instanceof Error ? err.message : String(err));
    }
  }

  if (sawNotFound > 0) {
    return { domain: host, available: true, method: "dns", detail: "nxdomain" };
  }

  return {
    domain: host,
    available: null,
    method: "dns-error",
    detail: lastError || "unknown",
  };
}

export async function checkDomainsAvailability(
  domains: string[],
  concurrency = 8,
): Promise<DomainAvailability[]> {
  const unique = [...new Set(domains.map((d) => d.trim().toLowerCase()))];
  const out: DomainAvailability[] = [];
  for (let i = 0; i < unique.length; i += concurrency) {
    const batch = unique.slice(i, i + concurrency);
    const settled = await Promise.all(batch.map(checkDomainAvailability));
    out.push(...settled);
  }
  return out;
}
