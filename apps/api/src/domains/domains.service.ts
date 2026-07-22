import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import {
  DOMAIN_IDEA_TLDS,
  buildDomainLabels,
  expandLabelsToDomains,
  parseDomain,
  scoreDomainIdea,
  type SuggestDomainsDto,
} from "@prospector/shared";
import { ClaudeService } from "../claude/claude.service";
import { DataForSeoService } from "../dataforseo/dataforseo.service";
import { checkDomainsAvailability } from "./domain-availability";

export type DomainIdeaResult = {
  domain: string;
  label: string;
  tld: string;
  available: boolean | null;
  availabilityMethod: string;
  seoScore: number;
  relatedKeyword: string | null;
  keywordVolume: number | null;
  rationale: string;
  source: "ai" | "keyword";
};

@Injectable()
export class DomainsService {
  private readonly logger = new Logger(DomainsService.name);

  constructor(
    private readonly claude: ClaudeService,
    private readonly dataForSeo: DataForSeoService,
  ) {}

  async suggest(dto: SuggestDomainsDto) {
    const topic = dto.topic.trim();
    if (!topic) throw new BadRequestException("Topic is required");

    const tlds = (dto.tlds?.length ? dto.tlds : [...DOMAIN_IDEA_TLDS]).map((t) =>
      t.replace(/^\./, "").toLowerCase(),
    );
    const limit = dto.limit ?? 24;

    // SEO backbone: related keywords + volumes from DataForSEO when available.
    let relatedKeywords: string[] = [];
    const volumeByKeyword = new Map<string, number>();

    try {
      relatedKeywords = await this.dataForSeo.expandKeywords(topic);
      relatedKeywords = relatedKeywords.slice(0, 40);
    } catch (err) {
      this.logger.warn(
        `Domain keyword expand failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      relatedKeywords = [];
    }

    if (relatedKeywords.length > 0) {
      try {
        const enriched = await this.dataForSeo.enrichKeywords(
          [topic, ...relatedKeywords.slice(0, 25)],
        );
        for (const row of enriched) {
          const key = (row.requestedKeyword ?? row.keyword)
            .trim()
            .toLowerCase();
          if (row.searchVolume != null) {
            volumeByKeyword.set(key, row.searchVolume);
          }
        }
      } catch (err) {
        this.logger.warn(
          `Domain keyword enrich failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const topKeywords = [...relatedKeywords]
      .sort(
        (a, b) =>
          (volumeByKeyword.get(b.toLowerCase()) ?? 0) -
          (volumeByKeyword.get(a.toLowerCase()) ?? 0),
      )
      .slice(0, 20);

    // AI brandable names + deterministic keyword-rooted candidates.
    let aiDomains: Array<{
      domain: string;
      keyword?: string;
      rationale: string;
    }> = [];
    try {
      aiDomains = await this.claude.suggestDomains(topic, topKeywords);
    } catch (err) {
      this.logger.warn(
        `Claude domain suggest failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const keywordLabels = buildDomainLabels(topic, topKeywords, 30);
    const keywordDomains = expandLabelsToDomains(keywordLabels, tlds).slice(
      0,
      80,
    );

    type Candidate = {
      domain: string;
      relatedKeyword: string | null;
      rationale: string;
      source: "ai" | "keyword";
    };
    const merged = new Map<string, Candidate>();

    for (const row of aiDomains) {
      const domain = row.domain.toLowerCase();
      const { tld } = parseDomain(domain);
      if (tlds.length && !tlds.includes(tld)) {
        // Still keep .com AI ideas even if filtered set omitted it.
        if (tld !== "com") continue;
      }
      merged.set(domain, {
        domain,
        relatedKeyword: row.keyword?.trim() || topic,
        rationale: row.rationale,
        source: "ai",
      });
    }

    for (const row of keywordDomains) {
      if (merged.has(row.domain)) continue;
      merged.set(row.domain, {
        domain: row.domain,
        relatedKeyword: row.relatedKeyword,
        rationale: `Keyword-rooted from “${row.relatedKeyword}”`,
        source: "keyword",
      });
    }

    // Cap before DNS to control latency.
    const candidates = [...merged.values()].slice(0, Math.max(limit * 3, 60));

    const availability = await checkDomainsAvailability(
      candidates.map((c) => c.domain),
    );
    const availByDomain = new Map(
      availability.map((a) => [a.domain, a] as const),
    );

    const results: DomainIdeaResult[] = candidates.map((c) => {
      const avail = availByDomain.get(c.domain);
      const kw = c.relatedKeyword;
      const volume = kw
        ? (volumeByKeyword.get(kw.toLowerCase()) ?? null)
        : null;
      const { label, tld } = parseDomain(c.domain);
      const seoScore = scoreDomainIdea(c.domain, {
        relatedKeyword: kw,
        keywordVolume: volume,
        available: avail?.available ?? null,
      });
      return {
        domain: c.domain,
        label,
        tld,
        available: avail?.available ?? null,
        availabilityMethod: avail?.method ?? "dns-error",
        seoScore,
        relatedKeyword: kw,
        keywordVolume: volume,
        rationale: c.rationale,
        source: c.source,
      };
    });

    results.sort((a, b) => {
      // Available first, then SEO score.
      const av = (x: DomainIdeaResult) =>
        x.available === true ? 2 : x.available == null ? 1 : 0;
      if (av(b) !== av(a)) return av(b) - av(a);
      if (b.seoScore !== a.seoScore) return b.seoScore - a.seoScore;
      return a.domain.localeCompare(b.domain);
    });

    const trimmed = results.slice(0, limit);
    const availableCount = trimmed.filter((r) => r.available === true).length;

    this.logger.log(
      JSON.stringify({
        event: "domain_ideas",
        topic,
        keywords: topKeywords.length,
        ai: aiDomains.length,
        candidates: candidates.length,
        returned: trimmed.length,
        available: availableCount,
      }),
    );

    return {
      topic,
      tlds,
      keywords: topKeywords.slice(0, 12).map((term) => ({
        term,
        volume: volumeByKeyword.get(term.toLowerCase()) ?? null,
      })),
      count: trimmed.length,
      availableCount,
      domains: trimmed,
      note: "Availability is estimated via DNS (no A/NS record ≈ likely available). Confirm at your registrar before buying.",
    };
  }
}
