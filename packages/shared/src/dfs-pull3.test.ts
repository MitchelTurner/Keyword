import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isDfsPull2Source } from "./dfs-pull2";
import { buildDfsPull3Plan, buildTrendsPlan, isDfsPull3Source } from "./dfs-pull3";

const here = dirname(fileURLToPath(import.meta.url));
const pull3Path = join(here, "../../../apps/web/public/dfs_pull3.py");
const pull2Path = join(here, "../../../apps/web/public/dfs_pull2.py");
const pull1Path = join(here, "../../../apps/web/public/dfs_pull.py");

describe("dfs_pull3 plan", () => {
  const source = readFileSync(pull3Path, "utf8");
  const fixed = new Date("2026-11-23T15:00:00Z");

  it("matches the Python script's request list for a fixed day", () => {
    const raw = execFileSync("python3", ["-c", PYTHON], {
      encoding: "utf8",
      env: { ...process.env, DFS_SCRIPT: pull3Path },
    });
    const fromPython = JSON.parse(raw) as unknown[];
    const plan = buildDfsPull3Plan(source, "dfs_pull3.py", fixed);
    expect(plan.anchor).toBe("taylor swift");
    expect(plan.today).toBe("2026-11-23");
    expect(plan.resultsFile).toBe("dfs_results3.json");
    expect(plan.jobs).toEqual(fromPython);
    expect(plan.endpoints).toEqual([
      { path: "keywords_data/google_trends/explore/live", count: 52 },
    ]);
    const headToHead = plan.jobs.filter((job) => job.key.startsWith("h2h_"));
    expect(headToHead.map((job) => job.key)).toEqual([
      "h2h_ww_0",
      "h2h_us_0",
      "h2h_ww_1",
      "h2h_us_1",
    ]);
    expect(headToHead[0]?.payload).not.toHaveProperty("type");
    expect(plan.jobs[0]?.payload).toMatchObject({ type: "web" });
  });

  it("recognizes dfs_pull3.py and leaves the other scripts alone", () => {
    expect(isDfsPull3Source(source)).toBe(true);
    expect(isDfsPull3Source(readFileSync(pull2Path, "utf8"))).toBe(false);
    expect(isDfsPull3Source(readFileSync(pull1Path, "utf8"))).toBe(false);
    expect(isDfsPull2Source(source)).toBe(false);
    expect(buildTrendsPlan(source, "notes.py", fixed).resultsFile).toBe("dfs_results3.json");
    expect(buildTrendsPlan(readFileSync(pull2Path, "utf8"), "dfs_pull2.py", fixed).jobs).toHaveLength(
      168,
    );
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
