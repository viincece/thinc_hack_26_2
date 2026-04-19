# Forecast job

Generates a 12-week forecast for the "Defects & cost" chart on the
dashboard (`/`) using [TabPFN](https://github.com/PriorLabs/TabPFN) via
the remote [tabpfn-client](https://github.com/PriorLabs/tabpfn-client).

## Design

- **Input.** Last 26 weeks of `/v_defect_detail` rows from Manex, bucketed
  into ISO weeks (identical logic to `getWeeklyTrend` in
  `web/src/app/page.tsx`).
- **Model.** Two `TabPFNRegressor` instances — one for defect count, one
  for cost. Features: linear trend index, sin/cos of ISO-week position,
  month, week-of-month. Output: p10/p50/p90 quantiles.
- **Output.** `web/public/forecast/defect-cost.json` (atomic-written) plus
  a sibling `defect-cost.meta.json` for debugging.
- **Consumption.** The Next.js home page reads the JSON at SSR and renders
  dashed-line medians + a shaded ribbon beyond the last historical week.
  If the file is missing, invalid, or older than ~14 days, the chart
  silently falls back to historical-only — **the web app has no runtime
  dependency on Python**.

## One-time setup

Python 3.10+ required (tabpfn-client constraint).

```bash
cd web
python -m venv .venv-forecast
source .venv-forecast/bin/activate     # Windows: .venv-forecast\Scripts\activate
pip install -r scripts/forecast/requirements.txt
```

First run will open a browser window for PriorLabs auth and cache a
token under your home directory.

## Headless / CI auth

After one successful interactive run, copy the token out of the cache:

```bash
python -c "from tabpfn_client import get_access_token; print(get_access_token())"
```

…and drop it into `web/.env.local`:

```
TABPFN_ACCESS_TOKEN=<paste here>
```

Future runs will skip the prompt and authenticate via `set_access_token`.

## Running

```bash
# Dry-run — prints the payload, writes nothing
python scripts/forecast/forecast.py --dry-run

# Real run — writes public/forecast/defect-cost.json
python scripts/forecast/forecast.py

# Or via npm (same thing)
npm run forecast:refresh
```

## Scheduling daily

### Linux / macOS cron

```cron
# Every day at 04:15 local
15 4 * * * cd /path/to/thinc_hack_ant/web && .venv-forecast/bin/python scripts/forecast/forecast.py >> /tmp/s3-forecast.log 2>&1
```

### Windows Task Scheduler

1. Action → Start a program
2. Program: `C:\path\to\web\.venv-forecast\Scripts\python.exe`
3. Arguments: `scripts\forecast\forecast.py`
4. Start in: `C:\path\to\web`
5. Trigger: Daily, 04:15

## Troubleshooting

| Symptom | Fix |
|---|---|
| `MANEX_API_URL / MANEX_API_KEY missing` | Confirm `web/.env.local` has both; env vars override the file. |
| `only N weeks have data — need ≥8` | Not enough history; forecast is skipped, chart stays historical-only. |
| Chart shows no dashed lines | `public/forecast/defect-cost.json` missing, malformed, or older than 14 days. Re-run the script. |
| `ModuleNotFoundError: tabpfn_client` | `pip install -r scripts/forecast/requirements.txt` inside the venv. |
| Interactive login loops | Delete the cached token (`~/.tabpfn_client/config.json` or similar) and re-login. |
