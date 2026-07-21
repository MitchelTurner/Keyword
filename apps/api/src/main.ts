import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import type { NextFunction, Request, Response } from "express";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { AppModule } from "./app.module";

async function bootstrap() {
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

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: false,
  });

  // Same-origin dashboard in prod; allow override for local Vite.
  const origin = process.env.CORS_ORIGIN ?? true;
  app.enableCors({ origin, credentials: true });

  // In production (Railway), serve the Vite build from the same process.
  const webDistCandidates = [
    resolve(__dirname, "../../web/dist"),
    resolve(process.cwd(), "../web/dist"),
    resolve(process.cwd(), "apps/web/dist"),
    resolve(process.cwd(), "dist/web"),
  ];
  const webDist = webDistCandidates.find((p) => existsSync(join(p, "index.html")));
  if (webDist) {
    console.log(`Serving web UI from ${webDist}`);
    app.useStaticAssets(webDist);
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (
        req.method === "GET" &&
        !req.path.startsWith("/niches") &&
        !req.path.startsWith("/health") &&
        !req.path.includes(".")
      ) {
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
  await app.listen(port, host);
  console.log(`Prospector API listening on http://${host}:${port}`);
}

bootstrap().catch((err) => {
  console.error("Fatal bootstrap error:", err);
  process.exit(1);
});
