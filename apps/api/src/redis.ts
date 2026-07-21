import type { ConnectionOptions } from "bullmq";

export function redisConnection(
  redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379",
): ConnectionOptions {
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    maxRetriesPerRequest: null,
  };
}
