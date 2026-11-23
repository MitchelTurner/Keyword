#!/usr/bin/env python3
"""Second DataForSEO pull for the Year in Search research.

Part 1  Google Trends (worldwide + Brazil/US), weekly, every person 2021-2026,
        each batch anchored on "taylor swift" so batches can be compared.
        Also: country maps for 2025/2026 names, accent-pair comparisons,
        and Google's topic for each accent pair.
Part 2  Google results pages + autocomplete for accent pairs (US and Brazil):
        which knowledge panel each spelling shows, and whether Google autocorrects.

Run on your own computer:
    export DATAFORSEO_LOGIN="you@example.com"
    export DATAFORSEO_PASSWORD="your API password"
    python3 dfs_pull2.py              # MAX_COST defaults to $5; stops if reached
    MAX_COST=2 python3 dfs_pull2.py   # lower cap
    DRY_RUN=1 python3 dfs_pull2.py    # just count requests, spend nothing

Writes dfs_results2.json (raw API responses) next to this script.
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
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dfs_results2.json")

ANCHOR = "taylor swift"
SEASONS = {
    2021: ["alec baldwin", "kyle rittenhouse", "christian eriksen", "tiger woods", "simone biles",
           "joe biden", "emma raducanu", "derek chauvin", "henry ruggs", "pete davidson",
           "elon musk", "britney spears", "kim kardashian"],
    2022: ["johnny depp", "will smith", "amber heard", "vladimir putin", "chris rock",
           "novak djokovic", "anna delvey", "andrew tate", "rishi sunak", "simon leviev",
           "elon musk", "zelensky", "cristiano ronaldo"],
    2023: ["damar hamlin", "jeremy renner", "andrew tate", "mbappe", "travis kelce",
           "jenna ortega", "lil tay", "danny masterson", "david beckham", "pedro pascal",
           "elon musk", "lionel messi", "shakira"],
    2024: ["donald trump", "kate middleton", "kamala harris", "imane khelif", "joe biden",
           "mike tyson", "jd vance", "lamine yamal", "simone biles", "diddy",
           "elon musk", "cristiano ronaldo", "sabrina carpenter"],
    2025: ["d4vd", "kendrick lamar", "jimmy kimmel", "tyler robinson", "pope leo xiv",
           "shedeur sanders", "bianca censori", "zohran mamdani", "greta thunberg", "sanae takaichi",
           "elon musk", "donald trump", "luigi mangione"],
    2026: ["lindsay clancy", "flavio bolsonaro", "nancy guthrie", "savannah guthrie", "jensen huang",
           "erling haaland", "nicolas maduro", "bad bunny", "lula", "alysa liu", "lamine yamal",
           "jude bellingham", "neymar", "donald trump", "elon musk", "zohran mamdani"],
}
ACCENT_PAIRS = [("flavio bolsonaro", "flávio bolsonaro"), ("mbappe", "mbappé"),
                ("kylian mbappe", "kylian mbappé"), ("guilherme de padua", "guilherme de pádua"),
                ("jo soares", "jô soares"), ("nicolas maduro", "nicolás maduro")]
PAIR_YEAR = {"flavio bolsonaro": 2026, "mbappe": 2023, "kylian mbappe": 2023,
             "guilherme de padua": 2022, "jo soares": 2022, "nicolas maduro": 2026}
MAP_NAMES = SEASONS[2025][:10] + [n for n in SEASONS[2026] if n not in ("donald trump", "elon musk")]

today = dt.date.today()
def window(y):
    start = dt.date(y - 1, 1, 1)
    end = min(dt.date(y, 11, 25), today - dt.timedelta(days=1))
    return start.isoformat(), end.isoformat()

# ---------- build the request list ----------
jobs = []  # (key, path, payload)
for y, names in SEASONS.items():
    f, t = window(y)
    for geo_tag, loc in [("ww", None), ("br", 2076), ("us", 2840)]:
        for i in range(0, len(names), 4):
            batch = [ANCHOR] + names[i:i + 4]
            p = {"keywords": batch, "date_from": f, "date_to": t, "type": "web",
                 "item_types": ["google_trends_graph"], "tag": f"graph_{y}_{geo_tag}_{i}"}
            if loc: p["location_code"] = loc
            jobs.append((p["tag"], "keywords_data/google_trends/explore/live", p))

for n in MAP_NAMES:
    y = 2025 if n in SEASONS[2025] else 2026
    f, t = dt.date(y, 1, 1).isoformat(), window(y)[1]
    p = {"keywords": [n], "date_from": f, "date_to": t, "item_types": ["google_trends_map"],
         "tag": f"map_{y}_{n}"}
    jobs.append((p["tag"], "keywords_data/google_trends/explore/live", p))

for a, b in ACCENT_PAIRS:
    y = PAIR_YEAR[a]
    f, t = dt.date(y, 1, 1).isoformat(), window(y)[1]
    for geo_tag, loc in [("ww", None), ("br", 2076)]:
        p = {"keywords": [a, b], "date_from": f, "date_to": t, "item_types": ["google_trends_graph"],
             "tag": f"pair_{geo_tag}_{a}"}
        if loc: p["location_code"] = loc
        jobs.append((p["tag"], "keywords_data/google_trends/explore/live", p))
    for kw in (a, b):  # Google's related topics for each spelling (shows the entity it maps to)
        p = {"keywords": [kw], "date_from": f, "date_to": t, "item_types": ["google_trends_topics_list"],
             "tag": f"topics_{kw}"}
        jobs.append((p["tag"], "keywords_data/google_trends/explore/live", p))

for a, b in ACCENT_PAIRS:
    for kw in (a, b):
        for geo_tag, loc, lang in [("br", 2076, "pt"), ("us", 2840, "en")]:
            jobs.append((f"serp_{geo_tag}_{kw}", "serp/google/organic/live/advanced",
                         {"keyword": kw, "location_code": loc, "language_code": lang,
                          "device": "desktop", "depth": 10, "tag": f"serp_{geo_tag}_{kw}"}))
            jobs.append((f"ac_{geo_tag}_{kw}", "serp/google/autocomplete/live/advanced",
                         {"keyword": kw, "location_code": loc, "language_code": lang,
                          "client": "gws-wiz-serp", "tag": f"ac_{geo_tag}_{kw}"}))

print(f"{len(jobs)} requests planned; cost cap ${MAX_COST:.2f}")
if DRY:
    from collections import Counter
    print(Counter(j[1] for j in jobs))
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
