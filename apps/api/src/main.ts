import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import type { NextFunction, Request, Response } from "express";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { normalizeEnv } from "./env";
import { AppModule } from "./app.module";

// compression is CJS — import defensively for Nest's CommonJS emit
// eslint-disable-next-line @typescript-eslint/no-require-imports
const compression = require("compression") as typeof import("compression");

normalizeEnv();

async function bootstrap() {
  const bootStarted = Date.now();

  if (!process.env.DATABASE_URL) {
    console.error(
      "Missing DATABASE_URL. Add the Railway Postgres plugin (or set DATABASE_URL).",
    );
    process.exit(1);
  }
  if (
    !process.env.REDIS_URL &&
    !process.env.REDIS_PRIVATE_URL &&
    !process.env.REDISHOST &&
    !process.env.REDIS_HOST
  ) {
    console.error(
      "Missing Redis connection. Add the Railway Redis plugin (REDIS_URL) or set REDISHOST.",
    );
    process.exit(1);
  }

  const isProd = process.env.NODE_ENV === "production";
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: false,
    logger: isProd ? ["error", "warn", "log"] : undefined,
  });

  app.use(compression());

  const origin = process.env.CORS_ORIGIN ?? true;
  app.enableCors({ origin, credentials: true });

  const webDistCandidates = [
    resolve(__dirname, "../../web/dist"),
    resolve(process.cwd(), "../web/dist"),
    resolve(process.cwd(), "apps/web/dist"),
    resolve(process.cwd(), "dist/web"),
  ];
  const webDist = webDistCandidates.find((p) =>
    existsSync(join(p, "index.html")),
  );

  // Keep in sync with @Controller() paths — SPA fallback must not steal these.
  const API_PREFIXES = [
    "/niches",
    "/health",
    "/portfolio",
    "/recommendations",
    "/sites",
  ];

  function isApiRequest(req: Request): boolean {
    if (req.method !== "GET" && req.method !== "HEAD") return true;
    const path = req.path || "/";
    if (API_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) {
      return true;
    }
    // fetch() JSON clients send Accept: application/json
    const accept = req.headers.accept ?? "";
    if (accept.includes("application/json")) return true;
    return false;
  }

  if (webDist) {
    console.log(`Serving web UI from ${webDist}`);
    app.useStaticAssets(webDist, {
      index: false,
      maxAge: isProd ? "365d" : 0,
      immutable: isProd,
      setHeaders(res, filePath) {
        if (filePath.endsWith(".html")) {
          res.setHeader("Cache-Control", "no-cache");
        }
      },
    });

    app.use((req: Request, res: Response, next: NextFunction) => {
      if (isApiRequest(req) || req.path.includes(".")) {
        next();
        return;
      }
      if (req.method === "GET" || req.method === "HEAD") {
        res.setHeader("Cache-Control", "no-cache");
        res.sendFile(join(webDist, "index.html"));
        return;
      }
      next();
    });
  } else {
    console.warn("Web dist not found — API-only mode");
  }

  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? "0.0.0.0";

  // Bind immediately on 0.0.0.0 so Railway's edge proxy can reach us.
  await app.listen(port, host);
  console.log(
    `Prospector API listening on http://${host}:${port} (boot ${Date.now() - bootStarted}ms)`,
  );
}

bootstrap().catch((err) => {
  console.error("Fatal bootstrap error:", err);
  process.exit(1);
});
