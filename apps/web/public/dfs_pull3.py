#!/usr/bin/env python3
"""Third DataForSEO pull (bigger backtest sample) for the Year in Search research.

Pulls weekly Google Trends (taylor swift anchor) for:
  - Google's global People top 10s 2014-2020, plus famous non-winners
  - Google's US People top 10s 2021-2025, plus famous non-winners
  - 2026 head-to-heads: Lula, Clancy, Nancy Guthrie, both Flavio spellings

Run on your own computer:
    export DATAFORSEO_LOGIN="you@example.com"
    export DATAFORSEO_PASSWORD="your API password"
    python3 dfs_pull3.py              # MAX_COST defaults to $5; stops if reached
    MAX_COST=2 python3 dfs_pull3.py   # lower cap
    DRY_RUN=1 python3 dfs_pull3.py    # just count requests, spend nothing

Writes dfs_results3.json (raw API responses) next to this script.
Please attach that raw file as-is.
"""
import base64, datetime as dt, json, os, sys, time, urllib.request, urllib.error

DRY = os.environ.get("DRY_RUN") == "1"
MAX_COST = float(os.environ.get("MAX_COST", "5"))
LOGIN, PASSWORD = os.environ.get("DATAFORSEO_LOGIN"), os.environ.get("DATAFORSEO_PASSWORD")
if not DRY and (not LOGIN or not PASSWORD):
    sys.exit("Set DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD first (or DRY_RUN=1).")
AUTH = "Basic " + base64.b64encode(f"{LOGIN}:{PASSWORD}".encode()).decode() if not DRY else ""
BASE = "https://api.dataforseo.com/v3/"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dfs_results3.json")

ANCHOR = "taylor swift"
# Google's global People top 10s, 2014-2020 (from trends.withgoogle.com), then famous non-winners
GLOBAL = {
    2014: ["jennifer lawrence", "kim kardashian", "julie gayet", "tracy morgan", "renee zellweger",
           "jared leto", "lorde", "matthew mcconaughey", "amal alamuddin", "donald sterling",
           "barack obama", "justin bieber", "cristiano ronaldo", "beyonce", "lionel messi"],
    2015: ["lamar odom", "ronda rousey", "caitlyn jenner", "adele", "charlie sheen",
           "ruby rose", "donald trump", "sia", "dakota johnson", "jeremy clarkson",
           "kim kardashian", "justin bieber", "cristiano ronaldo", "barack obama", "lionel messi"],
    2016: ["donald trump", "hillary clinton", "michael phelps", "melania trump", "simone biles",
           "bernie sanders", "steven avery", "celine dion", "ryan lochte", "tom hiddleston",
           "kim kardashian", "justin bieber", "cristiano ronaldo", "barack obama", "lionel messi"],
    2017: ["matt lauer", "meghan markle", "nadia toffa", "harvey weinstein", "kevin spacey",
           "gal gadot", "melania trump", "floyd mayweather", "michael flynn", "philippe coutinho",
           "donald trump", "kim kardashian", "justin bieber", "cristiano ronaldo", "lionel messi"],
    2018: ["meghan markle", "demi lovato", "sylvester stallone", "logan paul", "khloe kardashian",
           "jair bolsonaro", "brett kavanaugh", "hailey baldwin", "stormy daniels", "cardi b",
           "donald trump", "kim kardashian", "justin bieber", "cristiano ronaldo", "lionel messi"],
    2019: ["antonio brown", "neymar", "james charles", "jussie smollett", "kevin hart",
           "billie eilish", "greta thunberg", "r kelly", "joaquin phoenix", "jordyn woods",
           "donald trump", "kim kardashian", "justin bieber", "cristiano ronaldo", "lionel messi"],
    2020: ["joe biden", "kim jong un", "boris johnson", "kamala harris", "tom hanks",
           "jacob blake", "kanye west", "ghislaine maxwell", "august alsina", "ryan newman",
           "donald trump", "kim kardashian", "justin bieber", "cristiano ronaldo", "lionel messi"],
}
# Google's US People top 10s, 2021-2025, then famous non-winners
US = {
    2021: ["kyle rittenhouse", "tiger woods", "alec baldwin", "travis scott", "simone biles",
           "derek chauvin", "morgan wallen", "henry ruggs", "pete davidson", "shailene woodley",
           "elon musk", "britney spears", "kim kardashian", "donald trump", "lebron james"],
    2022: ["johnny depp", "will smith", "amber heard", "antonio brown", "kari lake",
           "anna delvey", "chris rock", "andrew tate", "adam levine", "serena williams",
           "elon musk", "donald trump", "kim kardashian", "joe biden", "lebron james"],
    2023: ["damar hamlin", "jeremy renner", "travis kelce", "tucker carlson", "lil tay",
           "andrew tate", "carlee russell", "jamie foxx", "danny masterson", "matt rife",
           "elon musk", "donald trump", "kim kardashian", "joe biden", "lebron james"],
    2024: ["donald trump", "kamala harris", "jd vance", "joe biden", "kate middleton",
           "tim walz", "mike tyson", "jill stein", "usher", "imane khelif",
           "elon musk", "kim kardashian", "sabrina carpenter", "lebron james", "travis kelce"],
    2025: ["zohran mamdani", "tyler robinson", "d4vd", "erika kirk", "pope leo xiv",
           "shedeur sanders", "bonnie blue", "karoline leavitt", "andy byron", "jimmy kimmel",
           "elon musk", "donald trump", "kim kardashian", "luigi mangione", "lebron james"],
}
# 2026 head-to-heads in one batch (both Flavio spellings), worldwide and US
H2H = [["lula", "lindsay clancy", "nancy guthrie", "flávio bolsonaro"],
       ["lula", "flavio bolsonaro", "bad bunny", "erling haaland"]]

today = dt.date.today()
def window(y):
    start = dt.date(y - 1, 1, 1)
    end = min(dt.date(y, 11, 25), today - dt.timedelta(days=1))
    return start.isoformat(), end.isoformat()

jobs = []
def add_batches(prefix, y, names, loc):
    f, t = window(y)
    for i in range(0, len(names), 4):
        p = {"keywords": [ANCHOR] + names[i:i + 4], "date_from": f, "date_to": t, "type": "web",
             "item_types": ["google_trends_graph"], "tag": f"{prefix}_{y}_{i}"}
        if loc: p["location_code"] = loc
        jobs.append((p["tag"], "keywords_data/google_trends/explore/live", p))
for y, names in GLOBAL.items(): add_batches("gl", y, names, None)
for y, names in US.items(): add_batches("us", y, names, 2840)
for j, b in enumerate(H2H):
    for geo, loc in [("ww", None), ("us", 2840)]:
        f, t = window(2026)
        p = {"keywords": [ANCHOR] + b, "date_from": f, "date_to": t, "item_types": ["google_trends_graph"],
             "tag": f"h2h_{geo}_{j}"}
        if loc: p["location_code"] = loc
        jobs.append((p["tag"], "keywords_data/google_trends/explore/live", p))

print(f"{len(jobs)} requests planned; cost cap ${MAX_COST:.2f}")
if DRY:
    sys.exit(0)

# ---------- run ----------
def post(path, payload):
    req = urllib.request.Request(BASE + path, data=json.dumps([payload]).encode(),
                                 headers={"Authorization": AUTH, "Content-Type": "application/json"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                return json.load(r)
        except (urllib.error.URLError, TimeoutError) as e:
            print("  retry after error:", e); time.sleep(5 * (attempt + 1))
    return {"status_code": -1, "status_message": "failed after retries", "cost": 0, "tasks": []}

results = {"pulled": today.isoformat(), "anchor": ANCHOR, "responses": {}}
if os.path.exists(OUT):  # resume a partial run
    try:
        results = json.load(open(OUT))
    except Exception:
        pass
spent = sum(r.get("cost") or 0 for r in results["responses"].values())

for n, (key, path, payload) in enumerate(jobs, 1):
    if key in results["responses"] and results["responses"][key].get("status_code") == 20000:
        continue
    if spent >= MAX_COST:
        print(f"Stopped at cost cap ${spent:.2f}. Re-run with a higher MAX_COST to continue.")
        break
    out = post(path, payload)
    spent += out.get("cost") or 0
    task = (out.get("tasks") or [{}])[0]
    print(f"[{n}/{len(jobs)}] {key}: {task.get('status_code', out.get('status_code'))} "
          f"{task.get('status_message', out.get('status_message'))}  total ${spent:.3f}")
    results["responses"][key] = out
    if n % 10 == 0:
        json.dump(results, open(OUT, "w"))
    time.sleep(0.4)

json.dump(results, open(OUT, "w"))
print(f"Saved {OUT}  (spent about ${spent:.2f})")
