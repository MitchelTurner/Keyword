import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Anthropic from "@anthropic-ai/sdk";
import {
  ClaudeClassificationSchema,
  ClaudeKeywordExpandSchema,
  ClaudeMergeSchema,
  ClaudeSeedMonetizationReviewSchema,
  type ClaudeClassification,
  type ClaudeMerge,
  type ClaudeSeedMonetizationReview,
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

const SEED_MONETIZE_SYSTEM = `You review seed keywords for a solo founder / indie hacker who wants to build a website or software product that can monetize relatively easily (SaaS, tools, directories, content sites with clear monetization, digital products, marketplaces, lead-gen sites they can operate).

Approve ONLY keywords where someone without a professional license could plausibly ship a digital product or content business around the demand.

REJECT examples (do not approve):
- Licensed / in-person professions as the product itself: doctor, dentist, lawyer, attorney, CPA, therapist, plumber as a service business you must perform
- Pure local "near me" fulfillment that requires being on-site
- Job-seeking / hiring-only intent with no product angle
- Brand-only terms with no productizable niche
- Illegal, adult, or scammy topics

APPROVE examples:
- Software/tools: invoice software, habit tracker app, meal planning app
- Vertical software ABOUT a profession (not being the profession): medical billing software, law firm CRM, dental practice scheduling
- Directories, comparison sites, calculators, niche content + affiliate/ads with clear monetization
- Digital products / templates / courses around a skill (not requiring you to be a licensed practitioner)

Respond ONLY with JSON:
{"reviews":[{"keyword":string,"approve":boolean,"reason":string}]}

Rules:
- Include EVERY input keyword exactly once in reviews (match the keyword string)
- Be strict: when unsure, reject
- reason: short (under 200 chars)
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
  ): Promise<ClaudeSeedMonetizationReview> {
    const unique = [
      ...new Set(
        keywords
          .map((k) => k.trim().replace(/\s+/g, " "))
          .filter((k) => k.length > 0),
      ),
    ].slice(0, 80);

    if (unique.length === 0) {
      return { reviews: [] };
    }

    const user = `Review these seed keywords for buildable + easily monetizable website/software niches:\n${JSON.stringify(unique)}`;

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

    let text = await this.complete(SEED_MONETIZE_SYSTEM, user);
    let parsed = tryParse(text);

    if (!parsed.success) {
      this.logger.warn(`Claude seed monetize review parse failed, retrying once`);
      text = await this.complete(
        SEED_MONETIZE_SYSTEM,
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
