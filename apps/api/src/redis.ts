import type { ConnectionOptions } from "bullmq";

/** Resolve Redis URL from common Railway / local env names. */
export function resolveRedisUrl(
  explicit?: string | null,
): string {
  const fromEnv =
    explicit ||
    process.env.REDIS_URL ||
    process.env.REDIS_PRIVATE_URL ||
    process.env.REDIS_PUBLIC_URL;

  if (fromEnv) return fromEnv;

  // Railway sometimes exposes discrete vars instead of a URL.
  const host = process.env.REDISHOST || process.env.REDIS_HOST;
  const port = process.env.REDISPORT || process.env.REDIS_PORT || "6379";
  const user = process.env.REDISUSER || process.env.REDIS_USER || "";
  const password =
    process.env.REDISPASSWORD || process.env.REDIS_PASSWORD || "";

  if (host) {
    const auth =
      user || password
        ? `${encodeURIComponent(user)}:${encodeURIComponent(password)}@`
        : "";
    return `redis://${auth}${host}:${port}`;
  }

  return "redis://localhost:6379";
}

export function redisConnection(
  redisUrl = resolveRedisUrl(),
): ConnectionOptions {
  const url = new URL(redisUrl);
  const isTls = url.protocol === "rediss:";

  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    ...(isTls ? { tls: {} } : {}),
  };
}
