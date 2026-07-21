/**
 * CLI: create a niche and enqueue expand. Requires API worker OR this process
 * only enqueues — run `pnpm dev:api` to process.
 *
 *   pnpm --filter @prospector/api cli:niche -- --seed "invoice software"
 *   pnpm --filter @prospector/api cli:niche -- --seed "invoice software" --wait
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { Queue } from "bullmq";
import { NICHE_PIPELINE_QUEUE } from "../src/pipeline/pipeline.constants";
import { redisConnection } from "../src/redis";

config({ path: resolve(__dirname, "../../../.env") });

async function main() {
  const args = process.argv.slice(2);
  const seedIdx = args.findIndex((a) => a === "--seed");
  const wait = args.includes("--wait");
  const seed = seedIdx >= 0 ? args[seedIdx + 1] : undefined;

  if (!seed) {
    console.error('Usage: pnpm cli:niche -- --seed "term" [--wait]');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const queue = new Queue(NICHE_PIPELINE_QUEUE, {
    connection: redisConnection(),
  });

  try {
    const niche = await prisma.niche.create({
      data: { seedTerm: seed, status: "EXPANDING" },
    });
    console.log(`Created niche ${niche.id} for "${seed}"`);

    await queue.add(
      "expand",
      { nicheId: niche.id },
      { removeOnComplete: 50, removeOnFail: 50 },
    );
    console.log("Enqueued expand job");

    if (!wait) {
      console.log("Start the API (`pnpm dev:api`) to process jobs.");
      return;
    }

    console.log("Waiting for DONE/FAILED...");
    for (;;) {
      await new Promise((r) => setTimeout(r, 2000));
      const current = await prisma.niche.findUniqueOrThrow({
        where: { id: niche.id },
        include: {
          _count: { select: { keywords: true, opportunities: true } },
        },
      });
      console.log(
        `  status=${current.status} keywords=${current._count.keywords} opps=${current._count.opportunities}`,
      );
      if (current.status === "DONE" || current.status === "FAILED") {
        if (current.error) console.error(`Error: ${current.error}`);
        break;
      }
    }
  } finally {
    await queue.close();
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
