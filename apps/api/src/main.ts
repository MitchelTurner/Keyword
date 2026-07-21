import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import type { NextFunction, Request, Response } from "express";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: false,
  });
  const origin = process.env.CORS_ORIGIN ?? "http://localhost:5173";
  app.enableCors({ origin, credentials: true });

  // In production (Railway), serve the Vite build from the same process.
  const webDistCandidates = [
    resolve(__dirname, "../../web/dist"),
    resolve(process.cwd(), "../web/dist"),
    resolve(process.cwd(), "apps/web/dist"),
  ];
  const webDist = webDistCandidates.find((p) => existsSync(p));
  if (webDist) {
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
  }

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Prospector API listening on :${port}`);
}

bootstrap();
