/**
 * Normalize Railway / local env before Nest boots.
 * Prefer private networking URLs when present (more reliable inside Railway).
 */
export function normalizeEnv() {
  if (process.env.DATABASE_PRIVATE_URL) {
    process.env.DATABASE_URL = process.env.DATABASE_PRIVATE_URL;
  } else if (process.env.DATABASE_PUBLIC_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.DATABASE_PUBLIC_URL;
  }

  if (process.env.REDIS_PRIVATE_URL) {
    process.env.REDIS_URL = process.env.REDIS_PRIVATE_URL;
  } else if (process.env.REDIS_PUBLIC_URL && !process.env.REDIS_URL) {
    process.env.REDIS_URL = process.env.REDIS_PUBLIC_URL;
  }

  // Keep Prisma from hanging forever on a bad DB route.
  if (process.env.DATABASE_URL && !/[?&]connect_timeout=/.test(process.env.DATABASE_URL)) {
    const join = process.env.DATABASE_URL.includes("?") ? "&" : "?";
    process.env.DATABASE_URL = `${process.env.DATABASE_URL}${join}connect_timeout=10`;
  }

  process.env.HOST = process.env.HOST || "0.0.0.0";
  process.env.NODE_ENV = process.env.NODE_ENV || "production";
}
