const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "or",
  "the",
  "to",
  "for",
  "of",
  "in",
  "on",
  "at",
  "by",
  "with",
  "from",
  "is",
  "are",
  "be",
  "as",
  "vs",
  "near",
  "me",
  "my",
  "your",
  "how",
  "what",
  "best",
  "top",
]);

export function significantSeedTokens(seed: string): string[] {
  return seed
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s+-]/gu, " ")
    .split(/[\s/+-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

/**
 * Keep keywords that clearly relate to the seed:
 * - contains the full seed phrase, or
 * - contains enough significant seed tokens (all if ≤2 tokens, else ≥2/3).
 */
export function isRelevantToSeed(term: string, seed: string): boolean {
  const t = term.toLowerCase().trim().replace(/\s+/g, " ");
  const s = seed.toLowerCase().trim().replace(/\s+/g, " ");
  if (!t || !s) return false;
  if (t === s || t.includes(s)) return true;

  const tokens = significantSeedTokens(s);
  if (tokens.length === 0) {
    return t.includes(s);
  }

  const hits = tokens.filter((tok) => t.includes(tok)).length;
  const needed =
    tokens.length <= 2 ? tokens.length : Math.ceil(tokens.length * (2 / 3));
  return hits >= needed;
}

export function filterRelevantKeywords(
  terms: string[],
  seed: string,
  limit = 200,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const seedNorm = seed.trim();
  if (seedNorm) {
    seen.add(seedNorm.toLowerCase());
    out.push(seedNorm);
  }

  for (const raw of terms) {
    const term = raw.trim().replace(/\s+/g, " ");
    if (!term) continue;
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    if (!isRelevantToSeed(term, seedNorm)) continue;
    seen.add(key);
    out.push(term);
    if (out.length >= limit) break;
  }
  return out;
}
