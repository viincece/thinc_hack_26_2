"""
Smoke test for the data pipeline only — fetch + ISO-week bucketing.
Skips the TabPFN call so it can run without tabpfn-client installed.

Run:
    python scripts/forecast/_smoke_test.py
"""
from datetime import datetime, timedelta, timezone
import sys

# Import from the sibling module.
sys.path.insert(0, __file__.rsplit("/", 1)[0].rsplit("\\", 1)[0])

from forecast import (  # type: ignore
    ENV_LOCAL,
    LOOKBACK_DAYS,
    bucket_weeks,
    build_future_matrix,
    build_training_matrix,
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
    weeks = bucket_weeks(rows, since)
    X, y_def, y_cost, origin = build_training_matrix(weeks)
    X_future, future_rows = build_future_matrix(weeks[-1]["weekStart"], origin, 12)

    print(f"rows fetched:    {len(rows)}")
    print(f"weekly buckets:  {len(weeks)}")
    print(f"non-empty weeks: {sum(1 for w in weeks if w['defects'] or w['costEur'])}")
    print(f"X train shape:   {X.shape}")
    print(f"y_def head:      {y_def[:6].tolist()}")
    print(f"y_cost head:     {y_cost[:6].tolist()}")
    print(f"X_future shape:  {X_future.shape}")
    print(f"future first:    {future_rows[0]}")
    print(f"future last:     {future_rows[-1]}")


if __name__ == "__main__":
    main()
