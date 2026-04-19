#!/usr/bin/env python3
"""
Daily forecast job for the S³ "Defects & cost" dashboard chart.

Pulls the last ~6 months of defect rows from the Manex PostgREST API,
bins them into ISO weeks (matching the Node logic in
web/src/app/page.tsx), fits two TabPFN regressors (one for defect
count, one for cost), and writes a 12-week forecast with p10/p50/p90
quantiles to web/public/forecast/defect-cost.json.

Run out-of-band (cron / Windows Task Scheduler / `npm run
forecast:refresh`) once a day. The Next.js app reads the JSON at SSR;
if the file is missing or older than ~14 days the chart silently falls
back to historical-only rendering, so the web app has no runtime
dependency on Python.

Auth:
    • First run: interactive browser login via `tabpfn_client.init()`.
      A token is cached under your home dir after that.
    • Headless / CI: set `TABPFN_ACCESS_TOKEN` in the environment or in
      web/.env.local — the script calls `set_access_token(...)` and
      skips the prompt. Grab the token from a prior interactive run
      with:
          python -c "from tabpfn_client import get_access_token; print(get_access_token())"

Usage:
    python scripts/forecast/forecast.py              # fetch + fit + write
    python scripts/forecast/forecast.py --dry-run    # print payload, no write
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
import tempfile
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import numpy as np

# Resolve repo layout: this file lives at web/scripts/forecast/forecast.py,
# so three parents up is the `web/` directory.
WEB_ROOT = Path(__file__).resolve().parents[2]
ENV_LOCAL = WEB_ROOT / ".env.local"
OUT_DIR = WEB_ROOT / "public" / "forecast"
OUT_JSON = OUT_DIR / "defect-cost.json"
OUT_META = OUT_DIR / "defect-cost.meta.json"

# Match the chart's 26-week window exactly so training data lines up
# with what the user sees on screen.
LOOKBACK_DAYS = 26 * 7
HORIZON_WEEKS = 12
MIN_WEEKS_TO_FORECAST = 8   # TabPFN is happy on small data, but below this
                            # the forecast is mostly noise; skip instead.


# ---------------------------------------------------------------------- #
# Env + HTTP
# ---------------------------------------------------------------------- #

def load_env(path: Path) -> dict[str, str]:
    """Minimal KEY=VALUE parser for the repo's .env.local — no extra dep."""
    env: dict[str, str] = {}
    if not path.exists():
        return env
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        env[key.strip()] = value.strip().strip('"').strip("'")
    return env


def fetch_defect_rows(
    api_url: str, api_key: str, since_date: str
) -> list[dict[str, Any]]:
    qs = urllib.parse.urlencode(
        {
            "select": "defect_ts,cost",
            "order": "defect_ts.desc",
            "limit": 5000,
            "defect_ts": f"gte.{since_date}",
        }
    )
    url = f"{api_url.rstrip('/')}/v_defect_detail?{qs}"
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


# ---------------------------------------------------------------------- #
# ISO-week bucketing (mirrors web/src/app/page.tsx)
# ---------------------------------------------------------------------- #

def _monday_utc(d: datetime) -> datetime:
    m = d.astimezone(timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0, tzinfo=None
    )
    return m - timedelta(days=m.weekday())


def _iso_label(monday: datetime) -> str:
    iso_year, iso_week, _ = monday.isocalendar()
    return f"{iso_year}-W{iso_week:02d}"


def bucket_weeks(rows: list[dict[str, Any]], since: datetime) -> list[dict[str, Any]]:
    buckets: dict[str, dict[str, Any]] = {}
    for r in rows:
        ts = r.get("defect_ts")
        if not ts:
            continue
        try:
            # PostgREST returns ISO timestamps, sometimes with 'Z' suffix.
            d = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
        except Exception:
            continue
        monday = _monday_utc(d)
        label = _iso_label(monday)
        cur = buckets.setdefault(
            label,
            {
                "weekStart": monday,
                "weekLabel": label,
                "defects": 0,
                "costEur": 0.0,
            },
        )
        cur["defects"] += 1
        cur["costEur"] += float(r.get("cost") or 0)

    # Fill zeros for missing weeks so the training series is continuous —
    # same behaviour as the Node loader, so training mirrors what the
    # chart renders.
    out: list[dict[str, Any]] = []
    cursor = _monday_utc(since)
    end = _monday_utc(datetime.now(timezone.utc).replace(tzinfo=None))
    while cursor <= end:
        label = _iso_label(cursor)
        cur = buckets.get(
            label,
            {"weekStart": cursor, "weekLabel": label, "defects": 0, "costEur": 0.0},
        )
        out.append(
            {
                "weekStart": cur["weekStart"].date().isoformat(),
                "weekLabel": cur["weekLabel"],
                "defects": int(cur["defects"]),
                "costEur": round(float(cur["costEur"]), 2),
            }
        )
        cursor = cursor + timedelta(days=7)
    return out


# ---------------------------------------------------------------------- #
# Feature engineering
# ---------------------------------------------------------------------- #

def _week_features(monday: datetime, origin: datetime) -> list[float]:
    """
    Calendar + trend features. Chosen to work well on ≤26 training rows
    without burning rows on lag warmup:
      - linear week index (captures trend)
      - sin/cos of ISO week position (annual seasonality)
      - month (1–12)
      - position-in-month (1–5)
    """
    week_index = (monday - origin).days / 7.0
    _, iso_week, _ = monday.isocalendar()
    phase = 2.0 * math.pi * iso_week / 52.0
    return [
        week_index,
        math.sin(phase),
        math.cos(phase),
        float(monday.month),
        float((monday.day - 1) // 7 + 1),
    ]


def build_training_matrix(
    weeks: list[dict[str, Any]],
) -> tuple[np.ndarray, np.ndarray, np.ndarray, datetime]:
    origin = datetime.fromisoformat(weeks[0]["weekStart"])
    X = np.array(
        [
            _week_features(datetime.fromisoformat(w["weekStart"]), origin)
            for w in weeks
        ],
        dtype=float,
    )
    y_def = np.array([w["defects"] for w in weeks], dtype=float)
    y_cost = np.array([w["costEur"] for w in weeks], dtype=float)
    return X, y_def, y_cost, origin


def build_future_matrix(
    last_week_start: str, origin: datetime, horizon: int
) -> tuple[np.ndarray, list[dict[str, str]]]:
    last_monday = datetime.fromisoformat(last_week_start)
    feats: list[list[float]] = []
    rows: list[dict[str, str]] = []
    for i in range(1, horizon + 1):
        monday = last_monday + timedelta(days=7 * i)
        feats.append(_week_features(monday, origin))
        rows.append(
            {
                "weekStart": monday.date().isoformat(),
                "weekLabel": _iso_label(monday),
            }
        )
    return np.array(feats, dtype=float), rows


# ---------------------------------------------------------------------- #
# TabPFN client
# ---------------------------------------------------------------------- #

def init_tabpfn_auth(env_token: str | None) -> str:
    """
    Resolve auth in this order:
      1. TABPFN_ACCESS_TOKEN (env or .env.local) — headless-safe.
      2. Interactive login via tabpfn_client.init() — uses cached token
         if one exists from a previous run.
    """
    token = (env_token or "").strip()
    if token:
        from tabpfn_client import set_access_token  # type: ignore

        set_access_token(token)
        return "env-token"

    from tabpfn_client import init as tabpfn_init  # type: ignore

    tabpfn_init()  # cached or interactive
    return "interactive"


def forecast_quantiles(
    X_train: np.ndarray,
    y_train: np.ndarray,
    X_future: np.ndarray,
) -> dict[str, list[float]]:
    """
    Fit a TabPFN regressor and return {p10, p50, p90} forecasts for the
    future rows. Falls back to a point prediction + synthetic band if
    the client's quantile output isn't available.
    """
    from tabpfn_client import TabPFNRegressor  # type: ignore

    reg = TabPFNRegressor()
    reg.fit(X_train, y_train)

    p10: np.ndarray
    p50: np.ndarray
    p90: np.ndarray
    try:
        bands = reg.predict(
            X_future, output_type="quantiles", quantiles=[0.1, 0.5, 0.9]
        )
        # The client returns a list/tuple of arrays in the requested
        # quantile order.
        p10 = np.asarray(bands[0], dtype=float)
        p50 = np.asarray(bands[1], dtype=float)
        p90 = np.asarray(bands[2], dtype=float)
    except Exception as e:
        print(
            f"[forecast] quantile output unavailable ({e}); "
            f"falling back to point prediction with synthetic band",
            file=sys.stderr,
        )
        point = np.asarray(reg.predict(X_future), dtype=float)
        spread = max(float(np.std(y_train)) * 0.5, 1.0)
        p10, p50, p90 = point - spread, point, point + spread

    # Counts and money cannot go negative. Clamp so the ribbon looks
    # sane on near-zero series.
    p10 = np.clip(p10, 0.0, None)
    p50 = np.clip(p50, 0.0, None)
    p90 = np.clip(p90, 0.0, None)
    # Guarantee p10 ≤ p50 ≤ p90 even if quantile crossing slipped through.
    p10 = np.minimum(p10, p50)
    p90 = np.maximum(p90, p50)
    return {"p10": p10.tolist(), "p50": p50.tolist(), "p90": p90.tolist()}


# ---------------------------------------------------------------------- #
# Entry point
# ---------------------------------------------------------------------- #

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--dry-run",
        action="store_true",
        help="Run fetch + fit + predict, print payload to stdout, write nothing.",
    )
    args = ap.parse_args()

    env = load_env(ENV_LOCAL)
    # Environment variables override .env.local — standard 12-factor order.
    env.update({k: v for k, v in os.environ.items() if v})

    api_url = env.get("MANEX_API_URL", "").rstrip("/")
    api_key = env.get("MANEX_API_KEY", "")
    if not api_url or not api_key:
        print(
            "[forecast] MANEX_API_URL / MANEX_API_KEY missing — "
            "set them in web/.env.local or the environment",
            file=sys.stderr,
        )
        sys.exit(2)

    since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(
        days=LOOKBACK_DAYS
    )
    since_date = since.date().isoformat()

    print(
        f"[forecast] fetching defects since {since_date} from {api_url}",
        file=sys.stderr,
    )
    rows = fetch_defect_rows(api_url, api_key, since_date)
    print(f"[forecast] received {len(rows)} defect rows", file=sys.stderr)

    weeks = bucket_weeks(rows, since)
    non_empty = sum(1 for w in weeks if w["defects"] > 0 or w["costEur"] > 0)
    if non_empty < MIN_WEEKS_TO_FORECAST:
        print(
            f"[forecast] only {non_empty} weeks have data — "
            f"need ≥{MIN_WEEKS_TO_FORECAST}. Skipping forecast write.",
            file=sys.stderr,
        )
        sys.exit(3)

    X, y_def, y_cost, origin = build_training_matrix(weeks)
    X_future, future_rows = build_future_matrix(
        weeks[-1]["weekStart"], origin, HORIZON_WEEKS
    )

    print("[forecast] authenticating tabpfn-client", file=sys.stderr)
    mode = init_tabpfn_auth(env.get("TABPFN_ACCESS_TOKEN"))
    print(f"[forecast] auth via {mode}", file=sys.stderr)

    print("[forecast] fitting defects regressor", file=sys.stderr)
    def_band = forecast_quantiles(X, y_def, X_future)
    print("[forecast] fitting cost regressor", file=sys.stderr)
    cost_band = forecast_quantiles(X, y_cost, X_future)

    forecast: list[dict[str, Any]] = []
    for i, row in enumerate(future_rows):
        forecast.append(
            {
                "weekStart": row["weekStart"],
                "weekLabel": row["weekLabel"],
                "defects": {
                    "p10": round(def_band["p10"][i], 2),
                    "p50": round(def_band["p50"][i], 2),
                    "p90": round(def_band["p90"][i], 2),
                },
                "costEur": {
                    "p10": round(cost_band["p10"][i], 2),
                    "p50": round(cost_band["p50"][i], 2),
                    "p90": round(cost_band["p90"][i], 2),
                },
            }
        )

    payload: dict[str, Any] = {
        "generatedAt": datetime.now(timezone.utc)
        .replace(microsecond=0, tzinfo=None)
        .isoformat()
        + "Z",
        "lookbackWeeks": len(weeks),
        "horizonWeeks": HORIZON_WEEKS,
        "rowsUsed": len(rows),
        "forecast": forecast,
    }

    if args.dry_run:
        print(json.dumps(payload, indent=2))
        return

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    # Atomic write: temp in the same dir, then rename.
    with tempfile.NamedTemporaryFile(
        "w",
        dir=OUT_DIR,
        delete=False,
        suffix=".json",
        encoding="utf-8",
    ) as tmp:
        json.dump(payload, tmp, indent=2)
        tmp_path = Path(tmp.name)
    tmp_path.replace(OUT_JSON)

    OUT_META.write_text(
        json.dumps(
            {
                "generatedAt": payload["generatedAt"],
                "lookbackWeeks": payload["lookbackWeeks"],
                "horizonWeeks": payload["horizonWeeks"],
                "rowsUsed": payload["rowsUsed"],
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(
        f"[forecast] wrote {OUT_JSON.relative_to(WEB_ROOT)} ({len(forecast)} weeks)",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
