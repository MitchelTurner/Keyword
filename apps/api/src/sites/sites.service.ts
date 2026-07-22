import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  MIN_KEYWORD_VOLUME,
  type AddTrackedKeywordsDto,
  type CreateTrackedSiteDto,
  type FetchKeywordIdeasDto,
  type UpdateTrackedKeywordDto,
  type UpdateTrackedSiteDto,
} from "@prospector/shared";
import { Prisma } from "@prisma/client";
import { DataForSeoService } from "../dataforseo/dataforseo.service";
import { PrismaService } from "../prisma/prisma.service";

function normalizeTerm(term: string): string {
  return term.trim().replace(/\s+/g, " ");
}

@Injectable()
export class SitesService {
  private readonly logger = new Logger(SitesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dataForSeo: DataForSeoService,
  ) {}

  async listSites() {
    const sites = await this.prisma.trackedSite.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        _count: {
          select: {
            keywords: { where: { status: { not: "dismissed" } } },
          },
        },
      },
    });
    return {
      count: sites.length,
      sites: sites.map((s) => ({
        id: s.id,
        name: s.name,
        domain: s.domain,
        notes: s.notes,
        keywordCount: s._count.keywords,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      })),
    };
  }

  async createSite(dto: CreateTrackedSiteDto) {
    const site = await this.prisma.trackedSite.create({
      data: {
        name: dto.name.trim(),
        domain: dto.domain?.trim() || null,
        notes: dto.notes?.trim() || "",
      },
    });
    return {
      id: site.id,
      name: site.name,
      domain: site.domain,
      notes: site.notes,
      keywordCount: 0,
      createdAt: site.createdAt,
      updatedAt: site.updatedAt,
    };
  }

  async getSite(siteId: string) {
    const site = await this.prisma.trackedSite.findUnique({
      where: { id: siteId },
      include: {
        keywords: {
          orderBy: [{ status: "asc" }, { searchVolume: "desc" }, { term: "asc" }],
        },
      },
    });
    if (!site) throw new NotFoundException("Site not found");

    const keywords = site.keywords.map((k) => this.serializeKeyword(k));
    const tracking = keywords.filter((k) => k.status === "tracking" || k.status === "targeting");
    const ideas = keywords.filter((k) => k.status === "idea");
    const dismissed = keywords.filter((k) => k.status === "dismissed");

    return {
      id: site.id,
      name: site.name,
      domain: site.domain,
      notes: site.notes,
      createdAt: site.createdAt,
      updatedAt: site.updatedAt,
      stats: {
        tracking: tracking.length,
        ideas: ideas.length,
        targeting: keywords.filter((k) => k.status === "targeting").length,
        dismissed: dismissed.length,
      },
      keywords,
    };
  }

  async updateSite(siteId: string, dto: UpdateTrackedSiteDto) {
    await this.requireSite(siteId);
    const site = await this.prisma.trackedSite.update({
      where: { id: siteId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.domain !== undefined
          ? { domain: dto.domain?.trim() || null }
          : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes.trim() } : {}),
      },
    });
    return {
      id: site.id,
      name: site.name,
      domain: site.domain,
      notes: site.notes,
      createdAt: site.createdAt,
      updatedAt: site.updatedAt,
    };
  }

  async deleteSite(siteId: string) {
    await this.requireSite(siteId);
    await this.prisma.trackedSite.delete({ where: { id: siteId } });
    return { ok: true as const };
  }

  async addKeywords(siteId: string, dto: AddTrackedKeywordsDto) {
    await this.requireSite(siteId);
    const terms = [
      ...new Set(dto.terms.map(normalizeTerm).filter(Boolean)),
    ].slice(0, 100);
    if (terms.length === 0) {
      throw new BadRequestException("No valid keywords provided");
    }

    const createdIds: string[] = [];
    for (const term of terms) {
      const row = await this.prisma.trackedKeyword.upsert({
        where: {
          siteId_term: { siteId, term },
        },
        create: {
          siteId,
          term,
          source: "manual",
          status: "tracking",
        },
        update: {
          // Re-adding a dismissed/idea term promotes it back to tracking.
          status: "tracking",
          source: "manual",
          parentId: null,
        },
      });
      createdIds.push(row.id);
    }

    await this.prisma.trackedSite.update({
      where: { id: siteId },
      data: { updatedAt: new Date() },
    });

    if (dto.enrich !== false) {
      await this.enrichKeywordIds(createdIds);
    }

    return this.getSite(siteId);
  }

  async updateKeyword(
    siteId: string,
    keywordId: string,
    dto: UpdateTrackedKeywordDto,
  ) {
    const kw = await this.requireKeyword(siteId, keywordId);
    const updated = await this.prisma.trackedKeyword.update({
      where: { id: kw.id },
      data: {
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes.trim() } : {}),
      },
    });
    await this.prisma.trackedSite.update({
      where: { id: siteId },
      data: { updatedAt: new Date() },
    });
    return this.serializeKeyword(updated);
  }

  async deleteKeyword(siteId: string, keywordId: string) {
    await this.requireKeyword(siteId, keywordId);
    await this.prisma.trackedKeyword.delete({ where: { id: keywordId } });
    return { ok: true as const };
  }

  async enrichSite(siteId: string) {
    await this.requireSite(siteId);
    const rows = await this.prisma.trackedKeyword.findMany({
      where: {
        siteId,
        status: { in: ["tracking", "targeting", "idea"] },
      },
      select: { id: true },
    });
    const enriched = await this.enrichKeywordIds(rows.map((r) => r.id));
    return {
      enriched,
      site: await this.getSite(siteId),
    };
  }

  /**
   * Expand related keyword ideas for an existing tracked term, enrich metrics,
   * and store them as status=idea children.
   */
  async fetchIdeas(
    siteId: string,
    keywordId: string,
    dto: FetchKeywordIdeasDto,
  ) {
    const parent = await this.requireKeyword(siteId, keywordId);
    if (parent.status === "dismissed") {
      throw new BadRequestException("Cannot expand ideas from a dismissed keyword");
    }

    const limit = dto.limit ?? 30;
    let expanded: string[] = [];
    try {
      expanded = await this.dataForSeo.expandKeywords(parent.term);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Idea expand failed for ${parent.term}: ${message}`);
      throw new BadRequestException(`Keyword ideas failed: ${message}`);
    }

    const parentKey = parent.term.trim().toLowerCase();
    const existing = await this.prisma.trackedKeyword.findMany({
      where: { siteId },
      select: { term: true, status: true },
    });
    const existingKeys = new Set(
      existing.map((e) => e.term.trim().toLowerCase()),
    );

    const candidates = expanded
      .map(normalizeTerm)
      .filter((t) => {
        const key = t.toLowerCase();
        if (!t || key === parentKey) return false;
        // Skip terms already tracking/targeting; allow re-suggesting dismissed.
        const hit = existing.find((e) => e.term.trim().toLowerCase() === key);
        if (hit && (hit.status === "tracking" || hit.status === "targeting")) {
          return false;
        }
        return true;
      })
      .slice(0, Math.max(limit * 2, 40));

    if (candidates.length === 0) {
      return {
        parentId: parent.id,
        added: 0,
        ideas: [] as ReturnType<SitesService["serializeKeyword"]>[],
        site: await this.getSite(siteId),
      };
    }

    let enrichedRows: Awaited<
      ReturnType<DataForSeoService["enrichKeywords"]>
    > = [];
    try {
      enrichedRows = await this.dataForSeo.enrichKeywords(candidates);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Idea enrich failed for ${parent.term}: ${message}`);
      // Still store bare terms so the operator sees suggestions.
    }

    const byTerm = new Map<
      string,
      Awaited<ReturnType<DataForSeoService["enrichKeywords"]>>[number]
    >();
    for (const row of enrichedRows) {
      const key = (row.requestedKeyword ?? row.keyword).trim().toLowerCase();
      byTerm.set(key, row);
      byTerm.set(row.keyword.trim().toLowerCase(), row);
    }

    const ranked = candidates
      .map((term) => {
        const row = byTerm.get(term.toLowerCase());
        return {
          term,
          searchVolume: row?.searchVolume ?? null,
          cpc: row?.cpc ?? null,
          competition: row?.competition ?? null,
          monthlyTrend: row?.monthlyTrend ?? null,
          raw: row?.raw ?? null,
        };
      })
      .filter(
        (r) =>
          r.searchVolume == null || r.searchVolume >= MIN_KEYWORD_VOLUME,
      )
      .sort((a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0))
      .slice(0, limit);

    const addedIds: string[] = [];
    for (const r of ranked) {
      const term = r.term;
      const key = term.toLowerCase();
      if (
        existingKeys.has(key) &&
        existing.some(
          (e) =>
            e.term.trim().toLowerCase() === key &&
            (e.status === "tracking" || e.status === "targeting"),
        )
      ) {
        continue;
      }
      const row = await this.prisma.trackedKeyword.upsert({
        where: { siteId_term: { siteId, term } },
        create: {
          siteId,
          term,
          source: "idea",
          status: "idea",
          parentId: parent.id,
          searchVolume: r.searchVolume,
          cpc: r.cpc,
          competition: r.competition,
          monthlyTrend:
            r.monthlyTrend === null
              ? Prisma.DbNull
              : (r.monthlyTrend as Prisma.InputJsonValue),
          raw:
            r.raw === null ? Prisma.DbNull : (r.raw as Prisma.InputJsonValue),
          lastEnrichedAt: r.searchVolume != null ? new Date() : null,
        },
        update: {
          source: "idea",
          status: "idea",
          parentId: parent.id,
          searchVolume: r.searchVolume,
          cpc: r.cpc,
          competition: r.competition,
          monthlyTrend:
            r.monthlyTrend === null
              ? Prisma.DbNull
              : (r.monthlyTrend as Prisma.InputJsonValue),
          raw:
            r.raw === null ? Prisma.DbNull : (r.raw as Prisma.InputJsonValue),
          lastEnrichedAt: r.searchVolume != null ? new Date() : undefined,
        },
      });
      addedIds.push(row.id);
      existingKeys.add(key);
    }

    await this.prisma.trackedSite.update({
      where: { id: siteId },
      data: { updatedAt: new Date() },
    });

    const ideas = await this.prisma.trackedKeyword.findMany({
      where: { id: { in: addedIds } },
      orderBy: [{ searchVolume: "desc" }, { term: "asc" }],
    });

    this.logger.log(
      JSON.stringify({
        event: "site_keyword_ideas",
        siteId,
        parent: parent.term,
        expanded: expanded.length,
        candidates: candidates.length,
        added: ideas.length,
      }),
    );

    return {
      parentId: parent.id,
      added: ideas.length,
      ideas: ideas.map((k) => this.serializeKeyword(k)),
      site: await this.getSite(siteId),
    };
  }

  private async enrichKeywordIds(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const rows = await this.prisma.trackedKeyword.findMany({
      where: { id: { in: ids } },
    });
    if (rows.length === 0) return 0;

    let enriched: Awaited<ReturnType<DataForSeoService["enrichKeywords"]>> = [];
    try {
      enriched = await this.dataForSeo.enrichKeywords(rows.map((r) => r.term));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Tracked keyword enrich failed: ${message}`);
      throw new BadRequestException(`Enrich failed: ${message}`);
    }

    const byTerm = new Map<
      string,
      Awaited<ReturnType<DataForSeoService["enrichKeywords"]>>[number]
    >();
    for (const row of enriched) {
      byTerm.set(
        (row.requestedKeyword ?? row.keyword).trim().toLowerCase(),
        row,
      );
      byTerm.set(row.keyword.trim().toLowerCase(), row);
    }

    let updated = 0;
    for (const kw of rows) {
      const row = byTerm.get(kw.term.trim().toLowerCase());
      if (!row) continue;
      await this.prisma.trackedKeyword.update({
        where: { id: kw.id },
        data: {
          searchVolume: row.searchVolume,
          cpc: row.cpc,
          competition: row.competition,
          monthlyTrend:
            row.monthlyTrend == null
              ? Prisma.DbNull
              : (row.monthlyTrend as Prisma.InputJsonValue),
          raw:
            row.raw == null
              ? Prisma.DbNull
              : (row.raw as Prisma.InputJsonValue),
          lastEnrichedAt: new Date(),
        },
      });
      updated += 1;
    }
    return updated;
  }

  private async requireSite(siteId: string) {
    const site = await this.prisma.trackedSite.findUnique({
      where: { id: siteId },
    });
    if (!site) throw new NotFoundException("Site not found");
    return site;
  }

  private async requireKeyword(siteId: string, keywordId: string) {
    const kw = await this.prisma.trackedKeyword.findFirst({
      where: { id: keywordId, siteId },
    });
    if (!kw) throw new NotFoundException("Keyword not found");
    return kw;
  }

  private serializeKeyword(k: {
    id: string;
    siteId: string;
    term: string;
    source: string;
    status: string;
    parentId: string | null;
    searchVolume: number | null;
    cpc: number | null;
    competition: number | null;
    monthlyTrend: Prisma.JsonValue | null;
    notes: string;
    lastEnrichedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: k.id,
      siteId: k.siteId,
      term: k.term,
      source: k.source,
      status: k.status,
      parentId: k.parentId,
      searchVolume: k.searchVolume,
      cpc: k.cpc,
      competition: k.competition,
      monthlyTrend: (k.monthlyTrend as Array<{
        year: number;
        month: number;
        search_volume: number;
      }> | null) ?? null,
      notes: k.notes,
      lastEnrichedAt: k.lastEnrichedAt,
      createdAt: k.createdAt,
      updatedAt: k.updatedAt,
    };
  }
}
