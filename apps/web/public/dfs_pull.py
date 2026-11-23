#!/usr/bin/env python3
"""Pull monthly search volumes from DataForSEO for the Year in Search backtest.

Run on your own computer:
    export DATAFORSEO_LOGIN="you@example.com"
    export DATAFORSEO_PASSWORD="your API password (from the DataForSEO dashboard)"
    python3 dfs_pull.py

Writes dfs_results.json next to this script. Standard library only.
Makes 4 requests (cost is a few cents total; check your dashboard).
"""
import base64, datetime as dt, json, os, sys, time, urllib.request

LOGIN = os.environ.get("DATAFORSEO_LOGIN")
PASSWORD = os.environ.get("DATAFORSEO_PASSWORD")
if not LOGIN or not PASSWORD:
    sys.exit("Set DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD first.")
AUTH = "Basic " + base64.b64encode(f"{LOGIN}:{PASSWORD}".encode()).decode()
BASE = "https://api.dataforseo.com/v3/"

# Past Year in Search global top 10s (2021-2025) plus famous non-winners
PAST = {
    2021: ["alec baldwin", "kyle rittenhouse", "christian eriksen", "tiger woods", "simone biles",
           "joe biden", "emma raducanu", "derek chauvin", "henry ruggs", "pete davidson"],
    2022: ["johnny depp", "will smith", "amber heard", "vladimir putin", "chris rock",
           "novak djokovic", "anna delvey", "andrew tate", "rishi sunak", "simon leviev"],
    2023: ["damar hamlin", "jeremy renner", "andrew tate", "mbappe", "travis kelce",
           "jenna ortega", "lil tay", "danny masterson", "david beckham", "pedro pascal"],
    2024: ["donald trump", "kate middleton", "kamala harris", "imane khelif", "joe biden",
           "mike tyson", "jd vance", "lamine yamal", "simone biles", "diddy"],
    2025: ["d4vd", "kendrick lamar", "jimmy kimmel", "tyler robinson", "pope leo xiv",
           "shedeur sanders", "bianca censori", "zohran mamdani", "greta thunberg", "sanae takaichi"],
}
CONTROLS = ["elon musk", "britney spears", "taylor swift", "kim kardashian", "zelensky",
            "cristiano ronaldo", "lionel messi", "shakira", "sabrina carpenter", "luigi mangione"]
# 2026 candidates
CANDIDATES = ["lindsay clancy", "flavio bolsonaro", "nancy guthrie", "savannah guthrie", "jensen huang",
              "erling haaland", "nicolas maduro", "bad bunny", "lula", "alysa liu", "lamine yamal",
              "jude bellingham", "neymar", "benjamin netanyahu", "chuck norris", "dolly parton"]
# Accent / spelling pairs (to see how Google Ads groups them)
VARIANTS = ["flávio bolsonaro", "nicolás maduro", "mbappé", "kylian mbappe", "kylian mbappé",
            "guilherme de padua", "guilherme de pádua", "jo soares", "jô soares", "haaland",
            "clancy", "bolsonaro", "sean combs", "p diddy", "pope leo", "leo xiv"]

KEYWORDS = sorted({k for v in PAST.values() for k in v} | set(CONTROLS) | set(CANDIDATES) | set(VARIANTS))


def post(path, payload):
    req = urllib.request.Request(BASE + path, data=json.dumps(payload).encode(),
                                 headers={"Authorization": AUTH, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=180) as r:
        out = json.load(r)
    print(f"{path}: status {out.get('status_code')} {out.get('status_message')} cost ${out.get('cost')}")
    for t in out.get("tasks", []):
        if t.get("status_code") != 20000:
            print("  task error:", t.get("status_code"), t.get("status_message"))
    return out


today = dt.date.today()
four_years_ago = today.replace(year=today.year - 4) + dt.timedelta(days=1)
last_month_end = today.replace(day=1) - dt.timedelta(days=1)

results = {"pulled": today.isoformat(), "keywords": KEYWORDS, "responses": {}}

# 1) Google Ads volumes, worldwide (no location), back 4 years
results["responses"]["ads_worldwide"] = post("keywords_data/google_ads/search_volume/live", [{
    "keywords": KEYWORDS,
    "date_from": four_years_ago.isoformat(),
    "date_to": last_month_end.isoformat(),
    "tag": "yis_ads_worldwide",
}])
time.sleep(6)

# 2-4) DataForSEO Labs historical volume (back to 2019) for US, Brazil, UK
for tag, loc, lang in [("labs_us", 2840, "en"), ("labs_br", 2076, "pt"), ("labs_gb", 2826, "en")]:
    results["responses"][tag] = post("dataforseo_labs/google/historical_search_volume/live", [{
        "keywords": KEYWORDS,
        "location_code": loc,
        "language_code": lang,
        "tag": f"yis_{tag}",
    }])
    time.sleep(6)

out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dfs_results.json")
with open(out_path, "w") as f:
    json.dump(results, f)
print("Saved", out_path)
