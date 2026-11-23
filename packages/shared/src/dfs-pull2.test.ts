import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildDfsPull2Plan,
  dfsPull2Window,
  isDfsPull2Source,
  nextTrendsJob,
  trendsResponseInfo,
  trendsRunStatus,
  trendsSpent,
  utcYmd,
} from "./dfs-pull2";

const pull2Path = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../apps/web/public/dfs_pull2.py",
);
const pull1Path = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../apps/web/public/dfs_pull.py",
);

describe("dfs_pull2 plan", () => {
  const source = readFileSync(pull2Path, "utf8");
  const fixed = new Date("2026-11-23T15:00:00Z");

  it("matches the Python script's request list for a fixed day", () => {
    const raw = execFileSync("python3", ["-c", PYTHON], {
      encoding: "utf8",
      env: { ...process.env, DFS_SCRIPT: pull2Path },
    });
    const fromPython = JSON.parse(raw) as unknown[];
    const plan = buildDfsPull2Plan(source, "dfs_pull2.py", fixed);
    expect(plan.anchor).toBe("taylor swift");
    expect(plan.today).toBe("2026-11-23");
    expect(plan.jobs).toEqual(fromPython);
    expect(plan.endpoints).toEqual([
      { path: "keywords_data/google_trends/explore/live", count: 120 },
      { path: "serp/google/organic/live/advanced", count: 24 },
      { path: "serp/google/autocomplete/live/advanced", count: 24 },
    ]);
  });

  it("uses the script's date window", () => {
    expect(dfsPull2Window(2026, utcYmd(fixed))).toEqual(["2025-01-01", "2026-11-22"]);
    expect(dfsPull2Window(2025, utcYmd(fixed))).toEqual(["2024-01-01", "2025-11-25"]);
  });

  it("recognizes dfs_pull2.py and not the volume script", () => {
    expect(isDfsPull2Source(source)).toBe(true);
    expect(isDfsPull2Source(readFileSync(pull1Path, "utf8"))).toBe(false);
  });
});

describe("trends run control", () => {
  const plan = buildDfsPull2Plan(
    readFileSync(pull2Path, "utf8"),
    "dfs_pull2.py",
    new Date("2026-11-23T15:00:00Z"),
  );

  it("skips finished tasks and stops at the cost cap", () => {
    const first = plan.jobs[0];
    const second = plan.jobs[1];
    expect(first && second).toBeTruthy();
    if (!first || !second) return;
    const responses = { [first.key]: { status_code: 20000, cost: 0.2 } };
    expect(nextTrendsJob(plan.jobs, responses, {}, new Set(), 0.2, 5)?.key).toBe(
      second.key,
    );
    expect(nextTrendsJob(plan.jobs, responses, {}, new Set(), 5, 5)).toBeNull();
    expect(trendsSpent(responses)).toBeCloseTo(0.2);
    expect(trendsRunStatus(plan.jobs, responses, {}, 5, 5)).toBe("capped");
    expect(
      trendsRunStatus(
        plan.jobs,
        Object.fromEntries(plan.jobs.map((job) => [job.key, { status_code: 20000, cost: 0 }])),
        {},
        1,
        5,
      ),
    ).toBe("done");
  });

  it("does not immediately retry a settled failure", () => {
    const first = plan.jobs[0];
    if (!first) return;
    const responses = { [first.key]: { status_code: -1, cost: 0, status_message: "failed" } };
    expect(
      nextTrendsJob(
        plan.jobs,
        responses,
        { [first.key]: { settled: true } },
        new Set(),
        0,
        5,
      )?.key,
    ).not.toBe(first.key);
    expect(trendsResponseInfo(responses[first.key])).toMatchObject({
      statusCode: -1,
      message: "failed",
    });
  });
});

const PYTHON = String.raw`
import datetime as real_dt, io, json, os, sys, types
class FakeDate(real_dt.date):
    @classmethod
    def today(cls):
        return cls(2026, 11, 23)
fake = types.ModuleType("datetime")
fake.date = FakeDate
fake.timedelta = real_dt.timedelta
sys.modules["datetime"] = fake
os.environ["DRY_RUN"] = "1"
path = os.environ["DFS_SCRIPT"]
ns = {"__name__": "dfs", "__file__": path}
sys.stdout = io.StringIO()
try:
    exec(compile(open(path).read(), path, "exec"), ns)
except SystemExit:
    pass
sys.stdout = sys.__stdout__
print(json.dumps([
    {"key": key, "path": path, "payload": payload}
    for key, path, payload in ns["jobs"]
], ensure_ascii=False))
`;
