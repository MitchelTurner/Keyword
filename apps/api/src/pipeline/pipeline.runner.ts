import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { NicheStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PipelineProcessor } from "./pipeline.processor";
import type { PipelineJobName } from "./pipeline.constants";

const IN_FLIGHT: NicheStatus[] = [
  "PENDING",
  "EXPANDING",
  "ENRICHING",
  "CLASSIFYING",
  "SCORING",
];

const STUCK_AFTER_MS = 90_000;
const SWEEP_EVERY_MS = 30_000;

/**
 * Runs pipeline stages in-process so niches don't depend on BullMQ/Redis
 * delivery. BullMQ remains optional durability / multi-instance backup.
 */
@Injectable()
export class PipelineRunner implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PipelineRunner.name);
  /** nicheId → monotonic generation for cancellation */
  private readonly generation = new Map<string, number>();
  private readonly activeStartedAt = new Map<string, number>();
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PipelineProcessor) private readonly processor: PipelineProcessor,
  ) {}

  onModuleInit() {
    this.logger.log("In-process pipeline runner online (with stuck sweeper)");
    this.timer = setInterval(() => {
      void this.sweepStuck();
    }, SWEEP_EVERY_MS);
    setTimeout(() => void this.sweepStuck(), 3_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  isActive(nicheId: string): boolean {
    return this.activeStartedAt.has(nicheId);
  }

  /**
   * Start a pipeline run in the background. Returns false if already running
   * unless force=true (cancels the prior generation between stages).
   */
  start(
    nicheId: string,
    stage: PipelineJobName,
    opts: { force?: boolean } = {},
  ): boolean {
    if (this.isActive(nicheId) && !opts.force) {
      return false;
    }

    const nextGen = (this.generation.get(nicheId) ?? 0) + 1;
    this.generation.set(nicheId, nextGen);
    this.activeStartedAt.set(nicheId, Date.now());

    this.logger.log(
      JSON.stringify({
        event: "pipeline_runner_start",
        nicheId,
        stage,
        generation: nextGen,
        force: Boolean(opts.force),
      }),
    );

    void this.execute(nicheId, stage, nextGen);
    return true;
  }

  private async execute(
    nicheId: string,
    stage: PipelineJobName,
    gen: number,
  ) {
    try {
      await this.processor.runFrom(
        nicheId,
        stage,
        () => this.generation.get(nicheId) !== gen,
      );
      if (this.generation.get(nicheId) === gen) {
        this.logger.log(
          JSON.stringify({
            event: "pipeline_runner_done",
            nicheId,
            stage,
            generation: gen,
          }),
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `In-process pipeline failed for ${nicheId} (${stage}): ${message}`,
      );
      // Only mark FAILED if this generation is still current.
      if (this.generation.get(nicheId) === gen) {
        try {
          await this.prisma.niche.update({
            where: { id: nicheId },
            data: { status: "FAILED", error: message },
          });
        } catch (updateErr) {
          this.logger.error(
            `Failed to mark niche ${nicheId} FAILED: ${
              updateErr instanceof Error ? updateErr.message : String(updateErr)
            }`,
          );
        }
      }
    } finally {
      if (this.generation.get(nicheId) === gen) {
        this.activeStartedAt.delete(nicheId);
      }
    }
  }

  /** Infer the best stage to resume from DB progress. */
  async inferStage(nicheId: string): Promise<PipelineJobName> {
    const [keywordCount, enrichedCount, oppCount] = await Promise.all([
      this.prisma.keyword.count({ where: { nicheId } }),
      this.prisma.keyword.count({
        where: { nicheId, searchVolume: { not: null } },
      }),
      this.prisma.opportunity.count({ where: { nicheId } }),
    ]);

    if (oppCount > 0) return "score";
    if (enrichedCount > 0) return "classify";
    if (keywordCount > 0) return "enrich";
    return "expand";
  }

  async sweepStuck() {
    const cutoff = new Date(Date.now() - STUCK_AFTER_MS);
    try {
      const stuck = await this.prisma.niche.findMany({
        where: {
          status: { in: IN_FLIGHT },
          updatedAt: { lt: cutoff },
        },
        orderBy: { updatedAt: "asc" },
        take: 3,
        select: { id: true, status: true, updatedAt: true, seedTerm: true },
      });

      for (const niche of stuck) {
        // If we think it's active but DB hasn't updated in 90s, force resume.
        const stage = await this.inferStage(niche.id);
        this.logger.warn(
          JSON.stringify({
            event: "pipeline_sweep_resume",
            nicheId: niche.id,
            seedTerm: niche.seedTerm,
            status: niche.status,
            stage,
            wasActive: this.isActive(niche.id),
            updatedAt: niche.updatedAt.toISOString(),
          }),
        );
        this.start(niche.id, stage, { force: true });
      }
    } catch (err) {
      this.logger.error(
        `Stuck niche sweep failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
