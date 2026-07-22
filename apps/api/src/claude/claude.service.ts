import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Anthropic from "@anthropic-ai/sdk";
import {
  ClaudeClassificationSchema,
  ClaudeDomainIdeasSchema,
  ClaudeKeywordExpandSchema,
  ClaudeMergeSchema,
  ClaudeSeedMonetizationReviewSchema,
  ClaudeThemeBuildBriefSchema,
  type ClaudeClassification,
  type ClaudeDomainIdeas,
  type ClaudeMerge,
  type ClaudeSeedMonetizationReview,
  type ClaudeThemeBuildBrief,
} from "@prospector/shared";
import { CostService } from "../cost/cost.service";

export type ClassifiableKeyword = {
  term: string;
  searchVolume: number;
  cpc: number;
  competition: number;
};

const CLASSIFY_SYSTEM = `You analyze Google Ads keyword research data. Group related search terms into topical themes / search intents — not limited to software.

Given keywords with monthly volume, CPC (USD), and competition (0-1), cluster them into distinct themes a researcher would want to explore. CPC is a commercial-value signal, not a filter.

Respond ONLY with JSON matching:
{"clusters":[{"product_description":string,"buyer_type":"SMB"|"enterprise"|"government"|"consumer"|"prosumer","intent":"transactional"|"comparison"|"informational","pain_severity":1-5,"reasoning":string,"keywords":[string,...]}]}

Field guidance:
- product_description: short theme label (e.g. "best running shoes", "hoa fee disputes", "keto meal plans") — any topic, product, service, content, or local intent
- buyer_type: who is most likely searching
- intent: transactional / comparison / informational
- pain_severity: 1-5 how commercially acute the need feels
- keywords: exact input terms belonging to the theme

Rules:
- Every input keyword appears in exactly one cluster.
- Do NOT discard non-software terms. Keep jobs, how-to, definitions, local, ecommerce, services, content, etc. in normal theme clusters.
- Only use product_description "NOISE" for empty/gibberish/unusable tokens.
- No markdown, no prose outside the JSON.`;

const MERGE_SYSTEM = `You reconcile keyword theme labels that were produced independently from keyword chunks. Some labels describe the same theme under different wording.

Respond ONLY with JSON matching:
{"merges":[{"canonical":string,"aliases":[string,...]}]}

Rules:
- Every input label appears exactly once: either as a canonical or inside some aliases list.
- Labels that are unique stay as {"canonical":"<label>","aliases":[]}.
- Keep "NOISE" as its own canonical when present; do not merge it into real themes.
- No markdown, no prose outside the JSON.`;

const EXPAND_SYSTEM = `You generate Google-search keyword lists for market research.

Given a seed topic, return real search queries people type that are clearly relevant to that topic. Relevance matters more than lexical overlap — synonyms, related intents, comparisons, problems, and adjacent demand are good. The seed words do NOT need to appear in every keyword.

Respond ONLY with JSON:
{"keywords":["phrase one","phrase two",...]}

Rules:
- 40–80 keywords, English, lowercase when natural
- Each keyword 2–7 words, realistic search queries (not marketing slogans)
- Stay on-topic for the seed; drop unrelated category bleed
- Include a mix of head terms, long-tails, comparisons, and commercial/informational intents
- If a candidate list is provided, include every candidate that is relevant and invent additional relevant keywords
- Do not include duplicates
- No markdown, no prose outside the JSON`;

const SEED_MONETIZE_SYSTEM = `You review seed keywords for a solo founder / indie hacker who wants to build a management platform / SaaS that makes an ongoing task or workflow easier to run and can monetize (subscription SaaS preferred).

Approve keywords where someone could ship software that people use repeatedly to manage work, clients, inventory, schedules, operations, or a vertical process.

REJECT examples (do not approve):
- Calculators, generators, converters, counters, and other one-shot utility tools (mortgage calculator, QR code generator, password generator, tip calculator, etc.)
- Licensed / in-person professions as the product itself: doctor, dentist, lawyer, attorney, CPA, therapist, plumber as a service YOU perform
- Pure local "near me" fulfillment that requires being on-site
- Job-seeking / hiring-only intent with no product angle
- Brand-only terms, pure content/how-to with no management product angle
- Illegal, adult, or scammy topics

APPROVE examples:
- Management platforms & ops software: inventory management, practice management, field service management, membership management, project/task management
- Vertical software ABOUT a workflow (not being the profession): dental practice scheduling, law firm CRM, HOA management, salon booking management
- Client portals, scheduling platforms, CRM/pipeline tools, work-order systems

Respond ONLY with JSON:
{"reviews":[{"keyword":string,"approve":boolean,"reason":string}]}

Rules:
- Include EVERY input keyword exactly once in reviews (match the keyword string)
- Prefer management platforms over gadgets/utilities; when unsure, reject
- reason: short (under 200 chars) — name the management job-to-be-done
- No markdown, no prose outside the JSON`;

const SEED_MONETIZE_LOW_CPC_SYSTEM = `You review solid-volume (≥5k/mo) low-CPC seed keywords for a solo founder building a management platform / SaaS that makes an ongoing task easier.

These keywords already cleared a cheap Ads CPC filter (≤ $1). Approve only management-oriented software niches with a clear SaaS/subscription path.

APPROVE only when the product is an ongoing management platform:
- Practice / clinic / salon / gym / daycare management
- Inventory, warehouse, vendor, fleet, maintenance, work-order management
- Team/project/task management, staff scheduling, booking management
- Client/tenant/member portals and CRM/pipeline tools for a vertical

REJECT even if popular:
- Calculators, generators, converters, counters, tip/BMI/age/GPA calculators, QR/password/name generators
- One-shot makers/builders with no ongoing management workflow
- Pure curiosity / trivia / how-to content with no ops product
- Licensed professions you would perform in person, local "near me" services
- Brand-only terms, jobs-only intent, illegal/adult/scam topics

In each approve reason, name the management workflow + monetization (e.g. "salon ops SaaS subscription", "inventory management freemium").

Respond ONLY with JSON:
{"reviews":[{"keyword":string,"approve":boolean,"reason":string}]}

Rules:
- Include EVERY input keyword exactly once in reviews (match the keyword string)
- Prefer fewer strong management niches over many weak utility terms
- When unsure, reject
- reason: short (under 200 chars)
- No markdown, no prose outside the JSON`;

const DOMAIN_IDEAS_SYSTEM = `You suggest brandable domain names for a solo founder building a management platform / SaaS around a topic.

Goals:
- SEO-friendly: prefer including a meaningful keyword root when it still sounds like a brand
- Short, memorable, pronounceable labels (ideally 6–14 chars before the TLD)
- Prefer .com, then .io / .co / .app / .dev
- No hyphens, no numbers, no trademarked mega-brands
- Suitable for an ongoing management product (not a one-shot calculator)

Respond ONLY with JSON:
{"domains":[{"domain":"example.com","keyword":"related keyword","rationale":"why this fits"}]}

Rules:
- 12–24 unique domains
- domain must include a TLD
- keyword should be the SEO phrase the domain targets (from the topic or provided keywords)
- rationale under 160 chars
- No markdown, no prose outside the JSON`;

const THEME_BUILD_SYSTEM = `You turn keyword research themes into concrete build briefs for a solo founder.

For each theme, propose:
- product_angle: what website/software to build (1 short sentence)
- monetization_model: how it makes money (e.g. SaaS subscription, affiliate, lead-gen, freemium, ads+newsletter, digital product)
- wedge: the narrow first customer/use-case to win

Respond ONLY with JSON:
{"themes":[{"product_description":string,"product_angle":string,"monetization_model":string,"wedge":string}]}

Rules:
- Include every input theme exactly once (match product_description)
- Stay realistic for a solo founder — no enterprise sales teams required on day one
- Prefer digital products over licensed/in-person services
- No markdown, no prose outside the JSON`;

@Injectable()
export class ClaudeService {
  private readonly logger = new Logger(ClaudeService.name);
  private readonly client: Anthropic;
  private readonly model = "claude-sonnet-4-6";

  constructor(
    private readonly config: ConfigService,
    private readonly costService: CostService,
  ) {
    const apiKey = this.config.get<string>("ANTHROPIC_API_KEY") ?? "";
    this.client = new Anthropic({ apiKey });
  }

  private ensureKey() {
    const apiKey = this.config.get<string>("ANTHROPIC_API_KEY") ?? "";
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required");
  }

  private extractText(content: Anthropic.Messages.ContentBlock[]): string {
    return content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
  }

  private stripFences(text: string): string {
    const trimmed = text.trim();
    if (trimmed.startsWith("```")) {
      return trimmed
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "")
        .trim();
    }
    return trimmed;
  }

  private estimateCost(usage?: {
    input_tokens?: number;
    output_tokens?: number;
  }): number {
    const inTok = usage?.input_tokens ?? 0;
    const outTok = usage?.output_tokens ?? 0;
    return (inTok / 1_000_000) * 3 + (outTok / 1_000_000) * 15;
  }

  private async complete(
    system: string,
    user: string,
    nicheId?: string,
  ): Promise<string> {
    this.ensureKey();
    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system,
      messages: [{ role: "user", content: user }],
    });

    await this.costService.logCost({
      provider: "anthropic",
      endpoint: this.model,
      cost: this.estimateCost(message.usage),
      nicheId,
      meta: {
        input_tokens: message.usage?.input_tokens,
        output_tokens: message.usage?.output_tokens,
      },
    });

    return this.stripFences(this.extractText(message.content));
  }

  /**
   * Suggest brandable, SEO-aware domain names for a topic + related keywords.
   */
  async suggestDomains(
    topic: string,
    keywords: string[] = [],
  ): Promise<ClaudeDomainIdeas["domains"]> {
    const seed = topic.trim();
    const uniqueKeywords = [
      ...new Set(
        keywords
          .map((k) => k.trim().replace(/\s+/g, " "))
          .filter((k) => k.length > 0),
      ),
    ].slice(0, 40);

    const user = uniqueKeywords.length
      ? `Topic: ${JSON.stringify(seed)}\n\nRelated SEO keywords (prefer roots from these when natural):\n${JSON.stringify(uniqueKeywords)}\n\nSuggest domain names for a management platform in this space.`
      : `Topic: ${JSON.stringify(seed)}\n\nSuggest domain names for a management platform in this space.`;

    const tryParse = (raw: string) => {
      try {
        return ClaudeDomainIdeasSchema.safeParse(JSON.parse(raw));
      } catch (err) {
        return {
          success: false as const,
          error: {
            message:
              err instanceof Error ? err.message : "JSON parse failed",
          },
        };
      }
    };

    let text = await this.complete(DOMAIN_IDEAS_SYSTEM, user);
    let parsed = tryParse(text);
    if (!parsed.success) {
      this.logger.warn(`Claude domain ideas parse failed, retrying once`);
      text = await this.complete(
        DOMAIN_IDEAS_SYSTEM,
        `${user}\n\nPrevious response failed validation: ${parsed.error.message}. Return corrected JSON only.`,
      );
      parsed = tryParse(text);
      if (!parsed.success) {
        throw new Error(
          `Claude domain ideas JSON invalid: ${parsed.error.message}`,
        );
      }
    }

    const seen = new Set<string>();
    const out: ClaudeDomainIdeas["domains"] = [];
    for (const row of parsed.data.domains) {
      const domain = row.domain
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/\/.*$/, "");
      if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(domain)) continue;
      if (seen.has(domain)) continue;
      seen.add(domain);
      out.push({
        domain,
        keyword: row.keyword?.trim(),
        rationale: row.rationale.trim(),
      });
    }
    return out;
  }

  /**
   * Generate relevant keywords for a seed. Optionally cherry-pick from DFS candidates.
   * Seed phrase is NOT required inside each keyword — topical relevance is.
   */
  async expandKeywords(
    seedTerm: string,
    candidates: string[] = [],
    nicheId?: string,
  ): Promise<string[]> {
    const seed = seedTerm.trim();
    const uniqueCandidates = [
      ...new Set(
        candidates
          .map((c) => c.trim().replace(/\s+/g, " "))
          .filter((c) => c.length > 0),
      ),
    ].slice(0, 120);

    const user = uniqueCandidates.length
      ? `Seed topic: ${JSON.stringify(seed)}\n\nCandidate keywords from keyword databases (keep only relevant ones, then add more):\n${JSON.stringify(uniqueCandidates)}`
      : `Seed topic: ${JSON.stringify(seed)}\n\nGenerate a relevant keyword list for this topic.`;

    const tryParse = (raw: string) => {
      try {
        return ClaudeKeywordExpandSchema.safeParse(JSON.parse(raw));
      } catch (err) {
        return {
          success: false as const,
          error: {
            message:
              err instanceof Error ? err.message : "JSON parse failed",
          },
        };
      }
    };

    let text = await this.complete(EXPAND_SYSTEM, user, nicheId);
    let parsed = tryParse(text);

    if (!parsed.success) {
      this.logger.warn(`Claude keyword expand parse failed, retrying once`);
      text = await this.complete(
        EXPAND_SYSTEM,
        `${user}\n\nPrevious response failed validation: ${parsed.error.message}. Return corrected JSON only.`,
        nicheId,
      );
      parsed = tryParse(text);
      if (!parsed.success) {
        throw new Error(
          `Claude keyword expand JSON invalid: ${parsed.error.message}`,
        );
      }
    }

    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of parsed.data.keywords) {
      const term = raw.trim().replace(/\s+/g, " ");
      if (!term) continue;
      const key = term.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(term);
      if (out.length >= 120) break;
    }
    return out;
  }

  async classifyChunk(
    keywords: ClassifiableKeyword[],
    nicheId?: string,
  ): Promise<ClaudeClassification> {
    const payload = keywords.map((k) => ({
      term: k.term,
      search_volume: k.searchVolume,
      cpc: k.cpc,
      competition: k.competition,
    }));

    const user = `Cluster these keywords into research themes:\n${JSON.stringify(payload)}`;
    let text = await this.complete(CLASSIFY_SYSTEM, user, nicheId);
    let parsed = ClaudeClassificationSchema.safeParse(JSON.parse(text));

    if (!parsed.success) {
      this.logger.warn(`Claude classify parse failed, retrying once`);
      text = await this.complete(
        CLASSIFY_SYSTEM,
        `${user}\n\nPrevious response failed validation: ${parsed.error.message}. Return corrected JSON only.`,
        nicheId,
      );
      parsed = ClaudeClassificationSchema.safeParse(JSON.parse(text));
      if (!parsed.success) {
        throw new Error(
          `Claude classification JSON invalid: ${parsed.error.message}`,
        );
      }
    }

    return parsed.data;
  }

  /**
   * Filter seed keyword candidates to those suitable for a buildable,
   * monetizable website/software product (reject licensed professions, etc.).
   */
  async reviewMonetizableSeeds(
    keywords: string[],
    opts?: { mode?: "default" | "low_cpc" },
  ): Promise<ClaudeSeedMonetizationReview> {
    const unique = [
      ...new Set(
        keywords
          .map((k) => k.trim().replace(/\s+/g, " "))
          .filter((k) => k.length > 0),
      ),
    ].slice(0, 120);

    if (unique.length === 0) {
      return { reviews: [] };
    }

    const lowCpc = opts?.mode === "low_cpc";
    const system = lowCpc ? SEED_MONETIZE_LOW_CPC_SYSTEM : SEED_MONETIZE_SYSTEM;
    const user = lowCpc
      ? `Review these low-CPC seed keywords for management platforms that make an ongoing task easier (reject calculators/generators):\n${JSON.stringify(unique)}`
      : `Review these seed keywords for buildable management platforms / SaaS (reject calculators/generators):\n${JSON.stringify(unique)}`;

    const tryParse = (raw: string) => {
      try {
        return ClaudeSeedMonetizationReviewSchema.safeParse(JSON.parse(raw));
      } catch (err) {
        return {
          success: false as const,
          error: {
            message:
              err instanceof Error ? err.message : "JSON parse failed",
          },
        };
      }
    };

    let text = await this.complete(system, user);
    let parsed = tryParse(text);

    if (!parsed.success) {
      this.logger.warn(`Claude seed monetize review parse failed, retrying once`);
      text = await this.complete(
        system,
        `${user}\n\nPrevious response failed validation: ${parsed.error.message}. Return corrected JSON only.`,
      );
      parsed = tryParse(text);
      if (!parsed.success) {
        throw new Error(
          `Claude seed monetize review JSON invalid: ${parsed.error.message}`,
        );
      }
    }

    // Keep only reviews for known inputs; drop hallucinated keywords.
    const allowed = new Set(unique.map((k) => k.toLowerCase()));
    const byKey = new Map<string, (typeof parsed.data.reviews)[number]>();
    for (const r of parsed.data.reviews) {
      const key = r.keyword.trim().toLowerCase();
      if (!allowed.has(key) || byKey.has(key)) continue;
      byKey.set(key, { ...r, keyword: r.keyword.trim() });
    }

    // Any input Claude omitted → treat as rejected (strict gate).
    const reviews = unique.map((keyword) => {
      const existing = byKey.get(keyword.toLowerCase());
      if (existing) return { ...existing, keyword };
      return {
        keyword,
        approve: false,
        reason: "Omitted from model response; rejected by default",
      };
    });

    return { reviews };
  }

  /**
   * Second-pass brief for scored themes: product angle, monetization, wedge.
   */
  async reviewThemeBuildAngles(
    themes: Array<{
      productDescription: string;
      buyerType: string;
      intent: string;
      totalVolume: number;
      avgCpc: number;
      avgCompetition: number;
      painSeverity: number;
    }>,
    nicheId?: string,
  ): Promise<ClaudeThemeBuildBrief> {
    const payload = themes.slice(0, 24).map((t) => ({
      product_description: t.productDescription,
      buyer_type: t.buyerType,
      intent: t.intent,
      total_volume: t.totalVolume,
      avg_cpc: t.avgCpc,
      avg_competition: t.avgCompetition,
      pain_severity: t.painSeverity,
    }));

    if (payload.length === 0) return { themes: [] };

    const user = `Write build briefs for these themes:\n${JSON.stringify(payload)}`;

    const tryParse = (raw: string) => {
      try {
        return ClaudeThemeBuildBriefSchema.safeParse(JSON.parse(raw));
      } catch (err) {
        return {
          success: false as const,
          error: {
            message:
              err instanceof Error ? err.message : "JSON parse failed",
          },
        };
      }
    };

    let text = await this.complete(THEME_BUILD_SYSTEM, user, nicheId);
    let parsed = tryParse(text);

    if (!parsed.success) {
      this.logger.warn(`Claude theme build brief parse failed, retrying once`);
      text = await this.complete(
        THEME_BUILD_SYSTEM,
        `${user}\n\nPrevious response failed validation: ${parsed.error.message}. Return corrected JSON only.`,
        nicheId,
      );
      parsed = tryParse(text);
      if (!parsed.success) {
        throw new Error(
          `Claude theme build brief JSON invalid: ${parsed.error.message}`,
        );
      }
    }

    const allowed = new Set(
      payload.map((t) => t.product_description.trim().toLowerCase()),
    );
    return {
      themes: parsed.data.themes.filter((t) =>
        allowed.has(t.product_description.trim().toLowerCase()),
      ),
    };
  }

  async mergeClusterLabels(
    labels: string[],
    nicheId?: string,
  ): Promise<ClaudeMerge> {
    const unique = [...new Set(labels.map((l) => l.trim()).filter(Boolean))];
    if (unique.length <= 1) {
      return {
        merges: unique.map((canonical) => ({ canonical, aliases: [] })),
      };
    }

    const user = `Theme labels:\n${JSON.stringify(unique)}`;
    let text = await this.complete(MERGE_SYSTEM, user, nicheId);
    let parsed = ClaudeMergeSchema.safeParse(JSON.parse(text));

    if (!parsed.success) {
      text = await this.complete(
        MERGE_SYSTEM,
        `${user}\n\nPrevious response failed validation: ${parsed.error.message}. Return corrected JSON only.`,
        nicheId,
      );
      parsed = ClaudeMergeSchema.safeParse(JSON.parse(text));
      if (!parsed.success) {
        throw new Error(`Claude merge JSON invalid: ${parsed.error.message}`);
      }
    }

    return parsed.data;
  }
}
