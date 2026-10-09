#!/usr/bin/env bash
# Applies all migrations + seed to a throw-away PostgreSQL database (with a
# minimal Supabase shim) and runs the SQL test suite in supabase/tests.
#
#   PGHOST=/tmp PGPORT=5432 PGUSER=postgres ./scripts/db-test.sh
#
# Requires PostgreSQL >= 15 with pgcrypto and btree_gist available.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="${SHIFTCARE_TEST_DB:-shiftcare_test}"
PSQL=(psql -v ON_ERROR_STOP=1 -X -q -d "$DB")

dropdb --if-exists "$DB"
createdb "$DB"

echo "→ shim"
"${PSQL[@]}" -f "$ROOT/supabase/tests/support/supabase_shim.sql"

for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "→ $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done

echo "→ seed.sql"
"${PSQL[@]}" -f "$ROOT/supabase/seed.sql"

for f in "$ROOT"/supabase/tests/*.test.sql; do
  echo "→ $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done

echo "✓ database tests passed"
