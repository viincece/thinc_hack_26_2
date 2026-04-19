"""
Smoke test for the data pipeline — fetch + bucket + feature assembly.
Skips the TabPFN calls so it runs without tabpfn-client installed.

Run:
    python scripts/forecast/_smoke_test.py
"""
from datetime import datetime, timedelta, timezone
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from forecast import (  # type: ignore
    ENV_LOCAL,
    LOOKBACK_DAYS,
    WEEKLY_FEATURE_NAMES,
    _get_holiday_set,
    _records_with_week,
    bucket_weeks,
    build_severity_matrix,
    build_weekly_feature_matrix,
    fetch_defect_rows,
    load_env,
)


def main() -> None:
    env = load_env(ENV_LOCAL)
    api_url = env.get("MANEX_API_URL", "").rstrip("/")
    api_key = env.get("MANEX_API_KEY", "")
    if not api_url or not api_key:
        print("MANEX_API_URL / MANEX_API_KEY missing in .env.local", file=sys.stderr)
        sys.exit(2)

    since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(
        days=LOOKBACK_DAYS
    )
    rows = fetch_defect_rows(api_url, api_key, since.date().isoformat())
    records = _records_with_week(rows)
    weeks = bucket_weeks(records, since)
    origin = weeks[0]["_monday"]
    holiday_weeks = _get_holiday_set(weeks)

    X, y_def, y_cost = build_weekly_feature_matrix(weeks, origin, holiday_weeks)
    X_sev, y_sev, cat_idx, vocabs = build_severity_matrix(records)

    print(f"rows fetched:        {len(rows)}")
    print(f"records kept:        {len(records)}")
    print(f"weekly buckets:      {len(weeks)}")
    print(f"non-empty weeks:     {sum(1 for w in weeks if w['defects'] > 0)}")
    print(f"holiday weeks seen:  {sorted(holiday_weeks)[:6]}...")
    print(f"weekly X shape:      {X.shape}   (features: {len(WEEKLY_FEATURE_NAMES)})")
    print(f"y_def head:          {y_def[:6].tolist()}")
    print(f"y_cost head:         {y_cost[:6].tolist()}")
    print()
    print(f"severity X shape:    {X_sev.shape}")
    print(f"severity cat cols:   {cat_idx}")
    print(f"severity cat vocab sizes: {[len(v) for v in vocabs]}")
    print(f"severity y head:     {y_sev[:6].tolist()}")
    print()
    print("Sample weekly features (last week):")
    last = X[-1]
    for name, val in zip(WEEKLY_FEATURE_NAMES, last):
        print(f"  {name:32s} {val:.3f}")


if __name__ == "__main__":
    main()
