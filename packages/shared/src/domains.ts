/** Preferred TLDs for brandable/SEO management-platform domains. */
export const DOMAIN_IDEA_TLDS = ["com", "io", "co", "app", "dev"] as const;
export type DomainIdeaTld = (typeof DOMAIN_IDEA_TLDS)[number];

const STOP = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "for",
  "of",
  "to",
  "in",
  "on",
  "with",
  "software",
  "app",
  "apps",
  "platform",
  "tool",
  "tools",
  "online",
  "best",
  "free",
]);

/** Collapse a phrase into a domain-safe slug (letters/numbers only). */
export function slugifyDomainLabel(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 40);
}

/** Meaningful tokens from a topic/keyword for compounding domain labels. */
export function domainTokens(phrase: string): string[] {
  return phrase
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP.has(t))
    .slice(0, 6);
}

export type DomainSeoSignals = {
  length: number;
  hasHyphen: boolean;
  hasNumber: boolean;
  keywordMatch: boolean;
  preferredTld: boolean;
  label: string;
  tld: string;
};

export function parseDomain(domain: string): { label: string; tld: string } {
  const cleaned = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const parts = cleaned.split(".").filter(Boolean);
  if (parts.length < 2) return { label: cleaned, tld: "com" };
  const tld = parts[parts.length - 1]!;
  const label = parts.slice(0, -1).join(".");
  return { label, tld };
}

export function domainSeoSignals(
  domain: string,
  relatedKeyword?: string | null,
): DomainSeoSignals {
  const { label, tld } = parseDomain(domain);
  const keywordSlug = relatedKeyword ? slugifyDomainLabel(relatedKeyword) : "";
  const tokens = relatedKeyword ? domainTokens(relatedKeyword) : [];
  const keywordMatch =
    (keywordSlug.length >= 4 && label.includes(keywordSlug)) ||
    tokens.some((t) => t.length >= 4 && label.includes(t));

  return {
    length: label.length,
    hasHyphen: label.includes("-"),
    hasNumber: /\d/.test(label),
    keywordMatch,
    preferredTld: (DOMAIN_IDEA_TLDS as readonly string[]).includes(tld),
    label,
    tld,
  };
}

/**
 * Higher = better SEO/brand fit for a management-product domain.
 * Does not include availability — rank available domains with this after.
 */
export function scoreDomainIdea(
  domain: string,
  opts: {
    relatedKeyword?: string | null;
    keywordVolume?: number | null;
    available?: boolean | null;
  } = {},
): number {
  const s = domainSeoSignals(domain, opts.relatedKeyword);
  let score = 40;

  // Ideal label length ~6–14
  if (s.length >= 6 && s.length <= 14) score += 25;
  else if (s.length >= 4 && s.length <= 18) score += 15;
  else if (s.length <= 22) score += 5;
  else score -= 15;

  if (!s.hasHyphen) score += 12;
  else score -= 18;
  if (!s.hasNumber) score += 8;
  else score -= 10;

  if (s.tld === "com") score += 20;
  else if (s.tld === "io" || s.tld === "co") score += 10;
  else if (s.preferredTld) score += 6;
  else score -= 8;

  if (s.keywordMatch) score += 18;

  const vol = opts.keywordVolume ?? 0;
  if (vol >= 5000) score += 12;
  else if (vol >= 1000) score += 8;
  else if (vol >= 500) score += 4;

  if (opts.available === true) score += 15;
  else if (opts.available === false) score -= 25;

  return Math.max(0, Math.round(score));
}

/** Deterministic candidate labels from a topic + related keywords. */
export function buildDomainLabels(
  topic: string,
  keywords: string[],
  limit = 40,
): Array<{ label: string; relatedKeyword: string }> {
  const suffixes = ["", "hq", "hub", "base", "desk", "ops", "ly", "io"];
  const prefixes = ["get", "use", "try", "my"];
  const out: Array<{ label: string; relatedKeyword: string }> = [];
  const seen = new Set<string>();

  const phrases = [topic, ...keywords].map((p) => p.trim()).filter(Boolean);

  for (const phrase of phrases) {
    const tokens = domainTokens(phrase);
    if (tokens.length === 0) continue;
    const compounds = [
      tokens.join(""),
      tokens.slice(0, 2).join(""),
      tokens.slice(0, 3).join(""),
    ].filter((c) => c.length >= 4);

    for (const base of compounds) {
      for (const suf of suffixes) {
        const label = slugifyDomainLabel(base + suf);
        if (label.length < 4 || label.length > 22) continue;
        if (seen.has(label)) continue;
        seen.add(label);
        out.push({ label, relatedKeyword: phrase });
        if (out.length >= limit) return out;
      }
      for (const pre of prefixes) {
        const label = slugifyDomainLabel(pre + base);
        if (label.length < 5 || label.length > 22) continue;
        if (seen.has(label)) continue;
        seen.add(label);
        out.push({ label, relatedKeyword: phrase });
        if (out.length >= limit) return out;
      }
    }
  }
  return out;
}

export function expandLabelsToDomains(
  labels: Array<{ label: string; relatedKeyword: string }>,
  tlds: readonly string[] = DOMAIN_IDEA_TLDS,
): Array<{ domain: string; relatedKeyword: string }> {
  const out: Array<{ domain: string; relatedKeyword: string }> = [];
  const seen = new Set<string>();
  for (const row of labels) {
    for (const tld of tlds) {
      const domain = `${row.label}.${tld}`;
      if (seen.has(domain)) continue;
      seen.add(domain);
      out.push({ domain, relatedKeyword: row.relatedKeyword });
    }
  }
  return out;
}
