import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import { resolveRedisUrl } from "../redis";

export type SeedSearchMode = "default" | "low_cpc";

export type SeedSearchJobRecord = {
  id: string;
  status: "idle" | "running" | "done" | "error";
  progress: string;
  mode: SeedSearchMode;
  error?: string;
  /** Serialized recommendations payload when done. */
  result?: unknown;
  updatedAt: number;
};

const REDIS_KEY = "prospector:seed-search-job:v1";
const REDIS_TTL_SEC = 60 * 60; // 1 hour

/**
 * Shared seed-search job state. In-memory alone breaks on multi-instance
 * deploys (POST starts on A, poll hits B and returns a stale default job).
 */
@Injectable()
export class SeedSearchJobStore implements OnModuleDestroy {
  private readonly logger = new Logger(SeedSearchJobStore.name);
  private redis: Redis | null = null;
  private memory: SeedSearchJobRecord = {
    id: "",
    status: "idle",
    progress: "",
    mode: "default",
    updatedAt: Date.now(),
  };

  constructor(private readonly config: ConfigService) {
    try {
      const url = resolveRedisUrl(this.config.get<string>("REDIS_URL"));
      this.redis = new Redis(url, {
        maxRetriesPerRequest: 1,
        enableReadyCheck: false,
        lazyConnect: true,
      });
      void this.redis.connect().catch((err) => {
        this.logger.warn(
          `Seed job Redis unavailable, using memory: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        void this.redis?.disconnect();
        this.redis = null;
      });
    } catch (err) {
      this.logger.warn(
        `Seed job Redis init failed, using memory: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      this.redis = null;
    }
  }

  async onModuleDestroy() {
    if (this.redis) {
      try {
        await this.redis.quit();
      } catch {
        /* ignore */
      }
    }
  }

  async get(): Promise<SeedSearchJobRecord> {
    if (this.redis) {
      try {
        const raw = await this.redis.get(REDIS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as SeedSearchJobRecord;
          this.memory = parsed;
          return parsed;
        }
      } catch (err) {
        this.logger.warn(
          `Seed job Redis get failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    return this.memory;
  }

  async set(job: SeedSearchJobRecord): Promise<void> {
    this.memory = job;
    if (this.redis) {
      try {
        await this.redis.set(
          REDIS_KEY,
          JSON.stringify(job),
          "EX",
          REDIS_TTL_SEC,
        );
      } catch (err) {
        this.logger.warn(
          `Seed job Redis set failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }

  async patch(
    jobId: string,
    patch: Partial<SeedSearchJobRecord>,
  ): Promise<SeedSearchJobRecord | null> {
    const current = await this.get();
    if (current.id !== jobId || current.status !== "running") return null;
    const next = { ...current, ...patch, updatedAt: Date.now() };
    await this.set(next);
    return next;
  }
}
