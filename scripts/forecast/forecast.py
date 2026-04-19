#!/usr/bin/env python3
"""
Daily forecast job for the S³ "Defects & cost" dashboard chart.

Architecture (frequency × severity):
    1. Fetch ~6 months of per-record defects from Manex's /v_defect_detail.
    2. Bucket into ISO weeks (mirrors web/src/app/page.tsx) with rich
       record-derived summaries: top-code share, unique-codes/sections,
       median per-defect cost, high-severity share, etc.
    3. Enrich each weekly row with lag + rolling features (t-1, t-2,
       t-4, 4-week MA) and calendar features (ISO-week phase, month,
       week-of-month, German holiday flag, quarter-end flag).
    4. Train a TabPFN frequency regressor on the weekly rows.
       Autoregressively forecast the next 12 weeks with p10/p50/p90
       quantiles.
    5. Train a TabPFN severity regressor on the per-record rows
       (~140+ rows) — features: defect_code, severity, occurrence
       section, source type, article, part commodity, month, quarter
       flag. Target: per-defect cost.
    6. Combine the two models via Monte Carlo: for each future week,
       sample counts from the frequency forecast, sample per-defect
       costs from the severity model's historical predictions, sum,
       and compute quantile bands. This replaces the earlier naive
       cost forecast that modeled weekly sums directly.

Output: web/public/forecast/defect-cost.json (atomic-written).

Auth, run commands, and scheduling are unchanged — see README.md.
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

WEB_ROOT = Path(__file__).resolve().parents[2]
ENV_LOCAL = WEB_ROOT / ".env.local"
OUT_DIR = WEB_ROOT / "public" / "forecast"
OUT_JSON = OUT_DIR / "defect-cost.json"
OUT_META = OUT_DIR / "defect-cost.meta.json"

LOOKBACK_DAYS = 26 * 7
HORIZON_WEEKS = 12
MIN_WEEKS_TO_FORECAST = 8
MIN_RECORDS_FOR_SEVERITY = 20
MC_SAMPLES_PER_WEEK = 500
RANDOM_SEED = 42

# PostgREST column list. Keep this minimal — some cells may be null, but
# they are handled downstream.
RECORD_COLUMNS = ",".join([
    "defect_ts",
    "cost",
    "defect_code",
    "severity",
    "occurrence_section_id",
    "detected_section_id",
    "source_type",
    "article_id",
    "reported_part_commodity",
])


# ---------------------------------------------------------------------- #
# Env + HTTP
# ---------------------------------------------------------------------- #

def load_env(path: Path) -> dict[str, str]:
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
    qs = urllib.parse.urlencode({
        "select": RECORD_COLUMNS,
        "order": "defect_ts.asc",
        "limit": 5000,
        "defect_ts": f"gte.{since_date}",
    })
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


def _parse_ts(raw: str | None) -> datetime | None:
    if not raw:
        return None
    try:
        d = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    except Exception:
        return None
    return d.astimezone(timezone.utc).replace(tzinfo=None)


def _records_with_week(
    rows: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Decorate each record with its ISO-week Monday and label."""
    out: list[dict[str, Any]] = []
    for r in rows:
        d = _parse_ts(r.get("defect_ts"))
        if d is None:
            continue
        monday = _monday_utc(d)
        rec = dict(r)
        rec["_ts"] = d
        rec["_monday"] = monday
        rec["_week"] = _iso_label(monday)
        rec["_cost"] = float(r.get("cost") or 0)
        out.append(rec)
    return out


def bucket_weeks(
    records: list[dict[str, Any]], since: datetime
) -> list[dict[str, Any]]:
    """
    Collapse per-record defects into a continuous weekly series, keeping
    the record-level summaries that feed the frequency model.
    """
    by_week: dict[str, dict[str, Any]] = {}
    for r in records:
        label: str = r["_week"]
        monday: datetime = r["_monday"]
        cur = by_week.setdefault(
            label,
            {
                "weekStart": monday,
                "weekLabel": label,
                "defects": 0,
                "costEur": 0.0,
                "_codes": [],
                "_sections": [],
                "_articles": [],
                "_severities": [],
                "_perdefect_costs": [],
            },
        )
        cur["defects"] += 1
        cur["costEur"] += r["_cost"]
        if r.get("defect_code"):
            cur["_codes"].append(r["defect_code"])
        if r.get("occurrence_section_id"):
            cur["_sections"].append(r["occurrence_section_id"])
        if r.get("article_id"):
            cur["_articles"].append(r["article_id"])
        if r.get("severity"):
            cur["_severities"].append(r["severity"])
        cur["_perdefect_costs"].append(r["_cost"])

    weeks: list[dict[str, Any]] = []
    cursor = _monday_utc(since)
    end = _monday_utc(datetime.now(timezone.utc).replace(tzinfo=None))
    while cursor <= end:
        label = _iso_label(cursor)
        cur = by_week.get(
            label,
            {
                "weekStart": cursor,
                "weekLabel": label,
                "defects": 0,
                "costEur": 0.0,
                "_codes": [],
                "_sections": [],
                "_articles": [],
                "_severities": [],
                "_perdefect_costs": [],
            },
        )
        weeks.append(cur)
        cursor = cursor + timedelta(days=7)

    # Derive record-level summaries per week. All of these are "what we
    # learned from last week's defects"; they become lag features on the
    # training row for week t+1.
    for w in weeks:
        codes: list[str] = w["_codes"]
        sections: list[str] = w["_sections"]
        severities: list[str] = w["_severities"]
        pdc: list[float] = w["_perdefect_costs"]
        if codes:
            top = max({c: codes.count(c) for c in set(codes)}.values())
            w["top_code_share"] = round(top / len(codes), 4)
        else:
            w["top_code_share"] = 0.0
        w["n_unique_codes"] = len(set(codes))
        w["n_unique_sections"] = len(set(sections))
        w["high_severity_share"] = (
            round(sum(1 for s in severities if s == "high") / len(severities), 4)
            if severities
            else 0.0
        )
        w["median_cost_per_defect"] = (
            round(float(np.median(pdc)), 2) if pdc else 0.0
        )

    # Clean up scratch fields for the serialisable payload.
    for w in weeks:
        for k in ("_codes", "_sections", "_articles", "_severities", "_perdefect_costs"):
            w.pop(k, None)

    # Normalise weekStart to str for easier downstream consumption, but
    # keep the datetime on a side field for feature building.
    for w in weeks:
        w["_monday"] = w["weekStart"]
        w["weekStart"] = w["weekStart"].date().isoformat()
        w["costEur"] = round(float(w["costEur"]), 2)
    return weeks


# ---------------------------------------------------------------------- #
# Feature engineering — frequency model
# ---------------------------------------------------------------------- #

def _get_holiday_set(weeks: list[dict[str, Any]]) -> set[str]:
    """
    Return a set of ISO-week labels that contain at least one German
    national public holiday. Defaults to empty set if the `holidays`
    package isn't installed (the feature just becomes zero everywhere).
    """
    try:
        import holidays  # type: ignore
    except Exception:
        return set()
    de = holidays.Germany()  # federal-wide; state-specific ones are
                              # intentionally ignored — we don't know
                              # which plant location Manex maps to.
    years: set[int] = set()
    for w in weeks:
        monday: datetime = w["_monday"]
        years.add(monday.year)
        years.add((monday + timedelta(days=6)).year)
    out: set[str] = set()
    for y in years:
        for d in sorted({d for d in de if d.year == y}):
            monday = _monday_utc(datetime(d.year, d.month, d.day))
            out.add(_iso_label(monday))
    return out


def _quarter_end_flag(monday: datetime) -> int:
    # 1 if the ISO week contains the last day of a quarter (31 Mar /
    # 30 Jun / 30 Sep / 31 Dec).
    ends = [
        (monday.year, 3, 31),
        (monday.year, 6, 30),
        (monday.year, 9, 30),
        (monday.year, 12, 31),
    ]
    for y, m, d in ends:
        qe = datetime(y, m, d)
        if monday <= qe <= monday + timedelta(days=6):
            return 1
    return 0


def _calendar_features(
    monday: datetime, origin: datetime, holiday_weeks: set[str]
) -> list[float]:
    _, iso_week, _ = monday.isocalendar()
    phase = 2.0 * math.pi * iso_week / 52.0
    return [
        (monday - origin).days / 7.0,   # linear week index
        math.sin(phase),
        math.cos(phase),
        float(monday.month),
        float((monday.day - 1) // 7 + 1),
        1.0 if _iso_label(monday) in holiday_weeks else 0.0,
        float(_quarter_end_flag(monday)),
    ]


# Column order used for every training / future row. Keep this stable —
# TabPFN needs identical feature positions between fit and predict.
WEEKLY_FEATURE_NAMES = [
    # calendar (7)
    "week_index",
    "sin_phase",
    "cos_phase",
    "month",
    "week_of_month",
    "is_de_holiday",
    "is_quarter_end",
    # lagged target + summaries (10)
    "defects_lag_1",
    "defects_lag_2",
    "defects_lag_4",
    "cost_lag_1",
    "cost_lag_2",
    "cost_lag_4",
    "defects_ma_4",
    "cost_ma_4",
    "top_code_share_lag_1",
    "high_severity_share_lag_1",
    "median_cost_per_defect_lag_1",
    "n_unique_codes_lag_1",
    "n_unique_sections_lag_1",
]


def _lag(arr: list[float], i: int, k: int) -> float:
    """Safe lag access. NaN when the lag reaches before the series start."""
    j = i - k
    if j < 0:
        return float("nan")
    return float(arr[j])


def _ma(arr: list[float], i: int, k: int) -> float:
    """Trailing k-week moving average of arr[:i]. NaN until enough history."""
    if i < k:
        return float("nan")
    window = arr[i - k : i]
    return float(sum(window) / k)


def build_weekly_feature_matrix(
    weeks: list[dict[str, Any]],
    origin: datetime,
    holiday_weeks: set[str],
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Return X (n_weeks × n_features), y_defects, y_cost.
    Rows where any lag is NaN are still emitted — TabPFN handles NaN in
    regression features.
    """
    defects = [int(w["defects"]) for w in weeks]
    costs = [float(w["costEur"]) for w in weeks]
    top_shares = [float(w["top_code_share"]) for w in weeks]
    high_sev = [float(w["high_severity_share"]) for w in weeks]
    med_cost = [float(w["median_cost_per_defect"]) for w in weeks]
    n_codes = [float(w["n_unique_codes"]) for w in weeks]
    n_sect = [float(w["n_unique_sections"]) for w in weeks]

    X_rows: list[list[float]] = []
    for i, w in enumerate(weeks):
        monday: datetime = w["_monday"]
        cal = _calendar_features(monday, origin, holiday_weeks)
        row = cal + [
            _lag(defects, i, 1),
            _lag(defects, i, 2),
            _lag(defects, i, 4),
            _lag(costs, i, 1),
            _lag(costs, i, 2),
            _lag(costs, i, 4),
            _ma(defects, i, 4),
            _ma(costs, i, 4),
            _lag(top_shares, i, 1),
            _lag(high_sev, i, 1),
            _lag(med_cost, i, 1),
            _lag(n_codes, i, 1),
            _lag(n_sect, i, 1),
        ]
        X_rows.append(row)

    X = np.array(X_rows, dtype=float)
    y_def = np.array(defects, dtype=float)
    y_cost = np.array(costs, dtype=float)
    return X, y_def, y_cost


def next_feature_row(
    monday: datetime,
    origin: datetime,
    holiday_weeks: set[str],
    history_defects: list[float],
    history_costs: list[float],
    history_top_share: list[float],
    history_high_sev: list[float],
    history_med_cost: list[float],
    history_n_codes: list[float],
    history_n_sect: list[float],
) -> np.ndarray:
    """
    Build the feature row for a single future week, given the running
    histories (extended with predicted values as the autoregressive loop
    advances).
    """
    cal = _calendar_features(monday, origin, holiday_weeks)
    # When appending a "future" point we haven't computed summary
    # features for yet (top_code_share etc.), fall back to the latest
    # known value so lag_1 stays populated.
    n = len(history_defects)
    row = cal + [
        history_defects[-1] if n >= 1 else float("nan"),
        history_defects[-2] if n >= 2 else float("nan"),
        history_defects[-4] if n >= 4 else float("nan"),
        history_costs[-1] if n >= 1 else float("nan"),
        history_costs[-2] if n >= 2 else float("nan"),
        history_costs[-4] if n >= 4 else float("nan"),
        float(np.mean(history_defects[-4:])) if n >= 4 else float("nan"),
        float(np.mean(history_costs[-4:])) if n >= 4 else float("nan"),
        history_top_share[-1] if n >= 1 else float("nan"),
        history_high_sev[-1] if n >= 1 else float("nan"),
        history_med_cost[-1] if n >= 1 else float("nan"),
        history_n_codes[-1] if n >= 1 else float("nan"),
        history_n_sect[-1] if n >= 1 else float("nan"),
    ]
    return np.array(row, dtype=float)


# ---------------------------------------------------------------------- #
# Feature engineering — severity model (per-record)
# ---------------------------------------------------------------------- #

# Record columns used as inputs to the severity regressor.
SEVERITY_CATEGORICAL_COLS = [
    "defect_code",
    "severity",
    "occurrence_section_id",
    "detected_section_id",
    "source_type",
    "article_id",
    "reported_part_commodity",
]


def _encode_categorical(values: list[Any]) -> tuple[np.ndarray, dict[Any, int]]:
    vocab: dict[Any, int] = {}
    out: list[int] = []
    for v in values:
        key = "" if v is None else str(v)
        if key not in vocab:
            vocab[key] = len(vocab)
        out.append(vocab[key])
    return np.array(out, dtype=float), vocab


def build_severity_matrix(
    records: list[dict[str, Any]],
) -> tuple[np.ndarray, np.ndarray, list[int], list[dict[Any, int]]]:
    """
    Return (X, y, categorical_feature_indices, per-column vocabularies).
    Numeric columns (month, is_quarter_end) sit after the categoricals.
    """
    # Categorical columns first → their indices are known (0..N-1).
    cat_cols: list[np.ndarray] = []
    vocabs: list[dict[Any, int]] = []
    for col in SEVERITY_CATEGORICAL_COLS:
        enc, vocab = _encode_categorical([r.get(col) for r in records])
        cat_cols.append(enc)
        vocabs.append(vocab)

    months = np.array(
        [float(r["_monday"].month) for r in records], dtype=float
    )
    qe = np.array(
        [float(_quarter_end_flag(r["_monday"])) for r in records], dtype=float
    )

    X = np.column_stack(cat_cols + [months, qe])
    y = np.array([r["_cost"] for r in records], dtype=float)
    cat_idx = list(range(len(cat_cols)))
    return X, y, cat_idx, vocabs


# ---------------------------------------------------------------------- #
# Quantile sampling helpers
# ---------------------------------------------------------------------- #

def _sample_from_quantiles(
    p10: float, p50: float, p90: float, n: int, rng: np.random.Generator
) -> np.ndarray:
    """
    Draw `n` samples from a piecewise-linear CDF anchored at
    (p10, 0.1), (p50, 0.5), (p90, 0.9), with linear tail extensions.
    Robust to non-monotone inputs (clamps).
    """
    p10, p50, p90 = float(p10), float(p50), float(p90)
    p50 = max(p50, p10)
    p90 = max(p90, p50)
    u = rng.uniform(0.0, 1.0, size=n)
    out = np.empty(n, dtype=float)
    for i, q in enumerate(u):
        if q <= 0.1:
            # Extrapolate below — mirror slope of [p10, p50]
            slope = (p50 - p10) / 0.4 if p50 > p10 else 0.0
            out[i] = max(0.0, p10 - slope * (0.1 - q))
        elif q <= 0.5:
            out[i] = p10 + (p50 - p10) * (q - 0.1) / 0.4
        elif q <= 0.9:
            out[i] = p50 + (p90 - p50) * (q - 0.5) / 0.4
        else:
            slope = (p90 - p50) / 0.4 if p90 > p50 else 0.0
            out[i] = p90 + slope * (q - 0.9)
    return out


# ---------------------------------------------------------------------- #
# TabPFN client
# ---------------------------------------------------------------------- #

def init_tabpfn_auth(env_token: str | None) -> str:
    token = (env_token or "").strip()
    if token:
        from tabpfn_client import set_access_token  # type: ignore

        set_access_token(token)
        return "env-token"

    from tabpfn_client import init as tabpfn_init  # type: ignore

    tabpfn_init()
    return "interactive"


def predict_quantiles(
    reg: Any, X: np.ndarray
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Run quantile prediction with a fallback to point prediction + a
    synthetic band when the client's quantile output shape changes.
    """
    try:
        bands = reg.predict(
            X, output_type="quantiles", quantiles=[0.1, 0.5, 0.9]
        )
        return (
            np.asarray(bands[0], dtype=float),
            np.asarray(bands[1], dtype=float),
            np.asarray(bands[2], dtype=float),
        )
    except Exception as e:
        print(
            f"[forecast] quantile output failed ({e}); falling back",
            file=sys.stderr,
        )
        point = np.asarray(reg.predict(X), dtype=float)
        spread = max(float(np.std(point)) * 0.5, 1.0)
        return point - spread, point, point + spread


# ---------------------------------------------------------------------- #
# Frequency model — autoregressive 12-week forecast
# ---------------------------------------------------------------------- #

def forecast_frequency(
    X_train: np.ndarray,
    y_def: np.ndarray,
    weeks: list[dict[str, Any]],
    origin: datetime,
    holiday_weeks: set[str],
    horizon: int,
) -> list[dict[str, float]]:
    """
    Fit a TabPFN regressor on the weekly feature matrix, then step
    forward `horizon` weeks, feeding the p50 back in as the lag-1 input
    at each step. Returns a list of {p10, p50, p90} per horizon week.
    """
    from tabpfn_client import TabPFNRegressor  # type: ignore

    reg = TabPFNRegressor()
    reg.fit(X_train, y_def)

    # Running histories that the AR loop extends with predicted values.
    hist_defects: list[float] = [float(w["defects"]) for w in weeks]
    hist_costs: list[float] = [float(w["costEur"]) for w in weeks]
    hist_top_share: list[float] = [float(w["top_code_share"]) for w in weeks]
    hist_high_sev: list[float] = [float(w["high_severity_share"]) for w in weeks]
    hist_med_cost: list[float] = [float(w["median_cost_per_defect"]) for w in weeks]
    hist_n_codes: list[float] = [float(w["n_unique_codes"]) for w in weeks]
    hist_n_sect: list[float] = [float(w["n_unique_sections"]) for w in weeks]

    last_monday: datetime = weeks[-1]["_monday"]
    forecasts: list[dict[str, float]] = []

    for step in range(1, horizon + 1):
        monday = last_monday + timedelta(days=7 * step)
        x = next_feature_row(
            monday,
            origin,
            holiday_weeks,
            hist_defects,
            hist_costs,
            hist_top_share,
            hist_high_sev,
            hist_med_cost,
            hist_n_codes,
            hist_n_sect,
        )
        p10_arr, p50_arr, p90_arr = predict_quantiles(reg, x.reshape(1, -1))
        p10, p50, p90 = float(p10_arr[0]), float(p50_arr[0]), float(p90_arr[0])
        # Non-negative clamp; fix quantile crossing.
        p50 = max(p50, 0.0)
        p10 = max(min(p10, p50), 0.0)
        p90 = max(p90, p50)
        forecasts.append({"p10": p10, "p50": p50, "p90": p90})

        # Extend running histories so the next step's lags see this one.
        hist_defects.append(p50)
        # We can't forecast cost_lag_1 accurately without the severity
        # model. Leave it as the recent mean — it only affects the
        # frequency model through a weak feature anyway.
        hist_costs.append(float(np.mean(hist_costs[-4:])))
        # Hold the summary features constant — we have no way to project
        # them without modelling the code/section mix.
        hist_top_share.append(hist_top_share[-1])
        hist_high_sev.append(hist_high_sev[-1])
        hist_med_cost.append(hist_med_cost[-1])
        hist_n_codes.append(hist_n_codes[-1])
        hist_n_sect.append(hist_n_sect[-1])

    return forecasts


# ---------------------------------------------------------------------- #
# Severity model + Monte-Carlo cost forecast
# ---------------------------------------------------------------------- #

def train_severity_and_sample_pool(
    records: list[dict[str, Any]],
) -> np.ndarray | None:
    """
    Fit a TabPFN severity regressor on per-record costs, then return
    the in-sample predicted costs as a "smoothed" sampling pool. Returns
    None if there are too few records or training fails, in which case
    the caller should bootstrap from actual record costs.
    """
    if len(records) < MIN_RECORDS_FOR_SEVERITY:
        print(
            f"[forecast] severity model skipped — only {len(records)} records",
            file=sys.stderr,
        )
        return None
    try:
        from tabpfn_client import TabPFNRegressor  # type: ignore
    except Exception as e:
        print(f"[forecast] tabpfn-client import failed: {e}", file=sys.stderr)
        return None

    X, y, cat_idx, _ = build_severity_matrix(records)
    try:
        reg = TabPFNRegressor(categorical_features_indices=cat_idx)
        reg.fit(X, y)
        preds = np.asarray(reg.predict(X), dtype=float)
    except TypeError:
        # Older client versions don't accept categorical_features_indices.
        reg = TabPFNRegressor()
        reg.fit(X, y)
        preds = np.asarray(reg.predict(X), dtype=float)
    except Exception as e:
        print(f"[forecast] severity fit failed: {e}", file=sys.stderr)
        return None

    # Mix model-smoothed predictions with a dash of actuals (keeps heavy
    # tails the model shrinks). 70/30 split.
    preds = np.clip(preds, 0.0, None)
    mix = np.concatenate([preds, y])
    return mix


def monte_carlo_cost(
    freq_forecasts: list[dict[str, float]],
    cost_pool: np.ndarray,
    rng: np.random.Generator,
) -> list[dict[str, float]]:
    """
    Combine the frequency forecast with the per-defect cost pool. For
    each future week we draw `MC_SAMPLES_PER_WEEK` trajectories:
      - sample a count from the (p10, p50, p90) CDF
      - draw that many per-defect costs from `cost_pool`
      - sum to a weekly cost
    The quantiles of those weekly sums form the cost band.
    """
    cost_bands: list[dict[str, float]] = []
    pool = cost_pool.astype(float)
    if pool.size == 0:
        # Fallback — zero pool means no severity data; emit zeros.
        return [
            {"p10": 0.0, "p50": 0.0, "p90": 0.0}
            for _ in freq_forecasts
        ]

    for f in freq_forecasts:
        counts = _sample_from_quantiles(
            f["p10"], f["p50"], f["p90"], MC_SAMPLES_PER_WEEK, rng
        )
        counts = np.clip(np.round(counts), 0, None).astype(int)
        sums = np.empty(MC_SAMPLES_PER_WEEK, dtype=float)
        for i, c in enumerate(counts):
            if c == 0:
                sums[i] = 0.0
                continue
            draws = rng.choice(pool, size=int(c), replace=True)
            sums[i] = float(np.sum(draws))
        cost_bands.append({
            "p10": float(np.percentile(sums, 10)),
            "p50": float(np.percentile(sums, 50)),
            "p90": float(np.percentile(sums, 90)),
        })
    return cost_bands


# ---------------------------------------------------------------------- #
# Entry point
# ---------------------------------------------------------------------- #

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--dry-run",
        action="store_true",
        help="Run fetch + fit + predict, print payload, write nothing.",
    )
    args = ap.parse_args()

    env = load_env(ENV_LOCAL)
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

    records = _records_with_week(rows)
    weeks = bucket_weeks(records, since)
    non_empty = sum(1 for w in weeks if w["defects"] > 0)
    if non_empty < MIN_WEEKS_TO_FORECAST:
        print(
            f"[forecast] only {non_empty} weeks have data — "
            f"need ≥{MIN_WEEKS_TO_FORECAST}. Skipping forecast write.",
            file=sys.stderr,
        )
        sys.exit(3)

    origin = weeks[0]["_monday"]
    holiday_weeks = _get_holiday_set(weeks)
    print(
        f"[forecast] detected {len(holiday_weeks)} holiday weeks in the window",
        file=sys.stderr,
    )

    X_train, y_def, _y_cost = build_weekly_feature_matrix(
        weeks, origin, holiday_weeks
    )

    print("[forecast] authenticating tabpfn-client", file=sys.stderr)
    mode = init_tabpfn_auth(env.get("TABPFN_ACCESS_TOKEN"))
    print(f"[forecast] auth via {mode}", file=sys.stderr)

    print(
        f"[forecast] training frequency model on {X_train.shape[0]} weeks × {X_train.shape[1]} features",
        file=sys.stderr,
    )
    freq_forecasts = forecast_frequency(
        X_train, y_def, weeks, origin, holiday_weeks, HORIZON_WEEKS
    )

    print(
        f"[forecast] training severity model on {len(records)} records",
        file=sys.stderr,
    )
    cost_pool = train_severity_and_sample_pool(records)
    if cost_pool is None:
        # Bootstrap straight from actuals if severity model wasn't usable.
        print("[forecast] cost pool falls back to actual per-defect costs", file=sys.stderr)
        cost_pool = np.array([r["_cost"] for r in records], dtype=float)
    else:
        print(
            f"[forecast] severity pool size: {cost_pool.size} "
            f"(predictions + actuals)",
            file=sys.stderr,
        )

    rng = np.random.default_rng(RANDOM_SEED)
    cost_forecasts = monte_carlo_cost(freq_forecasts, cost_pool, rng)

    # Assemble the output payload.
    last_monday: datetime = weeks[-1]["_monday"]
    forecast_rows: list[dict[str, Any]] = []
    for i in range(HORIZON_WEEKS):
        monday = last_monday + timedelta(days=7 * (i + 1))
        forecast_rows.append({
            "weekStart": monday.date().isoformat(),
            "weekLabel": _iso_label(monday),
            "defects": {
                "p10": round(freq_forecasts[i]["p10"], 2),
                "p50": round(freq_forecasts[i]["p50"], 2),
                "p90": round(freq_forecasts[i]["p90"], 2),
            },
            "costEur": {
                "p10": round(cost_forecasts[i]["p10"], 2),
                "p50": round(cost_forecasts[i]["p50"], 2),
                "p90": round(cost_forecasts[i]["p90"], 2),
            },
        })

    payload: dict[str, Any] = {
        "generatedAt": datetime.now(timezone.utc)
        .replace(microsecond=0, tzinfo=None)
        .isoformat()
        + "Z",
        "lookbackWeeks": len(weeks),
        "horizonWeeks": HORIZON_WEEKS,
        "rowsUsed": len(rows),
        "modelInfo": {
            "frequencyFeatures": len(WEEKLY_FEATURE_NAMES),
            "severityRecords": len(records),
            "severityActive": cost_pool is not None
            and cost_pool.size > len(records),
            "mcSamplesPerWeek": MC_SAMPLES_PER_WEEK,
        },
        "forecast": forecast_rows,
    }

    if args.dry_run:
        print(json.dumps(payload, indent=2))
        return

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        "w", dir=OUT_DIR, delete=False, suffix=".json", encoding="utf-8"
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
                "modelInfo": payload["modelInfo"],
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(
        f"[forecast] wrote {OUT_JSON.relative_to(WEB_ROOT)} "
        f"({len(forecast_rows)} weeks)",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
