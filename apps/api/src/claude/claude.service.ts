import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Anthropic from "@anthropic-ai/sdk";
import {
  ClaudeClassificationSchema,
  ClaudeMergeSchema,
  type ClaudeClassification,
  type ClaudeMerge,
} from "@prospector/shared";
import { CostService } from "../cost/cost.service";

export type ClassifiableKeyword = {
  term: string;
  searchVolume: number;
  cpc: number;
  competition: number;
};

const CLASSIFY_SYSTEM = `You analyze Google Ads keyword data to identify software products people are searching for. Given a list of search terms with monthly volume, CPC (USD), and competition (0-1), group them into distinct software products being sought. CPC reflects what advertisers pay per click — treat high CPC as a signal of commercial value and buyer pain.

Respond ONLY with JSON matching:
{"clusters":[{"product_description":string,"buyer_type":"SMB"|"enterprise"|"government"|"consumer"|"prosumer","intent":"transactional"|"comparison"|"informational","pain_severity":1-5,"reasoning":string,"keywords":[string,...]}]}

Rules: every input keyword appears in exactly one cluster. Keywords that are not seeking software (jobs, definitions, news) go in a cluster with product_description "NOT_SOFTWARE". No markdown, no prose outside the JSON.`;

const MERGE_SYSTEM = `You reconcile software product cluster labels that were produced independently from keyword chunks. Some labels describe the same product under different wording.

Respond ONLY with JSON matching:
{"merges":[{"canonical":string,"aliases":[string,...]}]}

Rules:
- Every input label appears exactly once: either as a canonical or inside some aliases list.
- Labels that are unique stay as {"canonical":"<label>","aliases":[]}.
- Use "NOT_SOFTWARE" as its own canonical when present; do not merge it into real products.
- No markdown, no prose outside the JSON.`;

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
    // Approximate Sonnet pricing for cost logging (USD).
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

    const user = `Classify these keywords:\n${JSON.stringify(payload)}`;
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

    const user = `Cluster labels:\n${JSON.stringify(unique)}`;
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
