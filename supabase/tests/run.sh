#!/usr/bin/env bash
#
# Applies every migration to a real PostgreSQL 16 and runs the SQL tests.
#
#   supabase/tests/run.sh                  # all tests
#   supabase/tests/run.sh service-areas    # one of them
#
# AGENTS.md: migrations are validated against real PostgreSQL before delivery,
# not reasoned about. This is what does that. It is not Supabase — it is a
# plain server plus `bootstrap.sql`, which stands in for the parts of a Supabase
# project that migrations depend on: the auth and storage schemas, `auth.uid()`,
# the anon/authenticated/service_role roles, and the default table grants that
# Supabase applies and a bare server does not. Without those grants a policy
# test fails on "permission denied" before any policy is consulted, which looks
# like a broken policy and is not.
#
# `initdb` refuses to run as root, hence the `su postgres`.
set -euo pipefail

BIN=${PG_BIN:-/usr/lib/postgresql/16/bin}
DATA=${PG_DATA:-/tmp/pgdata16}
SOCK=${PG_SOCK:-/tmp/pgsock}
PORT=${PG_PORT:-5599}
DB=medosha
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if ! "$BIN/pg_isready" -h "$SOCK" -p "$PORT" >/dev/null 2>&1; then
  rm -rf "$DATA"; mkdir -p "$DATA" "$SOCK"
  chown postgres:postgres "$DATA" "$SOCK"
  su postgres -c "PATH=$BIN:\$PATH initdb -D $DATA -U postgres --auth=trust" >/dev/null
  su postgres -c "PATH=$BIN:\$PATH pg_ctl -D $DATA -o '-k $SOCK -p $PORT -c listen_addresses=' -l $SOCK/pg.log start" >/dev/null
  sleep 2
fi

run() { "$BIN/psql" -h "$SOCK" -p "$PORT" -U postgres -d "$1" -v ON_ERROR_STOP=1 -q "${@:2}"; }

run postgres -c "drop database if exists $DB;" -c "create database $DB;" >/dev/null
run "$DB" -f "$ROOT/supabase/tests/bootstrap.sql" >/dev/null 2>&1

for migration in "$ROOT"/supabase/migrations/*.sql; do
  if ! run "$DB" -f "$migration" >/dev/null 2>/tmp/pg-migrate-err; then
    echo "migration failed: $(basename "$migration")"; head -20 /tmp/pg-migrate-err; exit 1
  fi
done
echo "$(ls "$ROOT"/supabase/migrations/*.sql | wc -l) migrations applied"

# A test leaves rows behind, so each one gets the schema as the migrations left
# it — a savepoint would not cover the ones that commit.
failed=0
if [ $# -gt 0 ]; then
  tests="$ROOT/supabase/tests/$1.sql"
else
  tests=$(ls "$ROOT"/supabase/tests/*.sql | grep -v '/bootstrap.sql$')
fi

for test in $tests; do
  name=$(basename "$test" .sql)
  run postgres -c "drop database if exists ${DB}_t;" -c "create database ${DB}_t template $DB;" >/dev/null 2>&1
  if run "${DB}_t" -f "$test" >/dev/null 2>/tmp/pg-test-err; then
    echo "  ok   $name"
  else
    echo "  FAIL $name"; grep ERROR /tmp/pg-test-err | head -3; failed=1
  fi
done

exit $failed
