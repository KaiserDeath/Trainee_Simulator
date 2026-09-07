#!/usr/bin/env bash
# Provision a Trez Training Hub database on a locally installed PostgreSQL,
# without Docker and without the Supabase CLI.
#
# It creates the database if missing, creates the anon/authenticated/
# service_role roles the schema grants expect, creates the minimal auth.users
# table the hub_identities foreign key references, applies every migration in
# supabase/migrations in filename order, and optionally applies supabase/seed.sql.
#
# Usage:
#   ./scripts/setup-local-database.sh \
#     --target 'postgresql://postgres@127.0.0.1:5432/trez_local' \
#     --confirm-local-overwrite
#
#   --with-seed        also apply supabase/seed.sql
#   --skip-existing    leave an existing database in place instead of recreating
#
# Do not put a password in the URL. The script prompts for it and never writes
# it to disk. Re-running is safe: the database is recreated from scratch unless
# --skip-existing is given.

set -euo pipefail
umask 077

target_url=''
confirm_local_overwrite=false
with_seed=false
skip_existing=false

usage() {
  sed -n '2,20p' "$0"
}

while (($#)); do
  case "$1" in
    --target) target_url=${2:?Missing target URL}; shift 2 ;;
    --confirm-local-overwrite) confirm_local_overwrite=true; shift ;;
    --with-seed) with_seed=true; shift ;;
    --skip-existing) skip_existing=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) printf 'Unknown argument: %s\n' "$1" >&2; usage >&2; exit 2 ;;
  esac
done

[[ -n $target_url ]] || { usage >&2; exit 2; }

[[ $target_url =~ ^postgres(ql)?:// ]] || {
  printf 'Target URL must use postgres:// or postgresql://\n' >&2
  exit 2
}

[[ ! $target_url =~ ^postgres(ql)?://[^/@:]+:[^@/]+@ ]] || {
  printf 'Target URL must not contain a password. The script will prompt.\n' >&2
  exit 2
}

# Accept only a physically local target. A remote host, a Docker service
# hostname, or a Supabase pooler is intentionally rejected.
[[ $target_url =~ ^postgres(ql)?://([^/@]+@)?(localhost|127\.0\.0\.1|\[::1\])(:[0-9]+)?/ ]] || {
  printf 'Target URL must point to localhost, 127.0.0.1, or [::1].\n' >&2
  exit 2
}

repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
migrations_dir="$repo_root/supabase/migrations"
seed_file="$repo_root/supabase/seed.sql"

[[ -d $migrations_dir ]] || {
  printf 'Missing migrations directory: %s\n' "$migrations_dir" >&2
  exit 1
}

find_psql() {
  if [[ -n ${PSQL_PATH:-} && -x ${PSQL_PATH} ]]; then
    printf '%s' "$PSQL_PATH"
    return
  fi

  if command -v psql >/dev/null 2>&1; then
    command -v psql
    return
  fi

  # Windows installs psql outside PATH. Prefer the highest installed version.
  local candidate
  candidate=$(ls -d "/c/Program Files/PostgreSQL"/*/bin/psql.exe 2>/dev/null | sort -Vr | head -n 1 || true)
  [[ -n $candidate ]] || {
    printf 'Could not find psql. Install PostgreSQL or set PSQL_PATH.\n' >&2
    exit 1
  }
  printf '%s' "$candidate"
}

psql_bin=$(find_psql)

# Split the target into a maintenance URL and a database name. CREATE DATABASE
# cannot run inside the database it creates.
target_database=${target_url##*/}
target_database=${target_database%%\?*}
maintenance_url="${target_url%/*}/postgres"

[[ -n $target_database ]] || {
  printf 'Target URL must include a database name.\n' >&2
  exit 2
}

case "${target_database,,}" in
  postgres|template0|template1)
    printf 'Refusing to target the shared database "%s".\n' "$target_database" >&2
    exit 2
    ;;
esac

if [[ $skip_existing == false && $confirm_local_overwrite == false ]]; then
  printf 'This drops and recreates "%s". Add --confirm-local-overwrite.\n' \
    "$target_database" >&2
  exit 2
fi

read -r -s -p "PostgreSQL password for ${target_url} (blank for peer/.pgpass): " db_password
printf '\n'

cleanup() {
  local status=$?
  unset db_password PGPASSWORD
  exit "$status"
}
trap cleanup EXIT

export PGPASSWORD=$db_password

run_sql_file() {
  # A file with its own BEGIN/COMMIT manages its transaction. Wrapping it in
  # --single-transaction makes psql warn and leaves the nesting ambiguous, so
  # let those files drive their own boundaries.
  local wrap=(--single-transaction)
  if grep -qiE '^[[:space:]]*BEGIN[[:space:]]*;' "$1"; then
    wrap=()
  fi

  "$psql_bin" -X -w -v ON_ERROR_STOP=1 "${wrap[@]}" \
    --dbname="$target_url" --file="$1" >/dev/null
}

run_sql_stdin() {
  "$psql_bin" -X -w -v ON_ERROR_STOP=1 --single-transaction \
    --dbname="$target_url" >/dev/null
}

database_exists() {
  local found
  found=$("$psql_bin" -X -w -t -A --dbname="$maintenance_url" \
    -c "SELECT 1 FROM pg_database WHERE datname = '${target_database}'" 2>/dev/null || true)
  [[ $found == '1' ]]
}

if database_exists; then
  if [[ $skip_existing == true ]]; then
    printf 'Database "%s" already exists; leaving it in place.\n' "$target_database"
  else
    printf 'Recreating database "%s".\n' "$target_database"
    "$psql_bin" -X -w -v ON_ERROR_STOP=1 --dbname="$maintenance_url" \
      -c "DROP DATABASE \"${target_database}\" WITH (FORCE)" >/dev/null
    "$psql_bin" -X -w -v ON_ERROR_STOP=1 --dbname="$maintenance_url" \
      -c "CREATE DATABASE \"${target_database}\"" >/dev/null
  fi
else
  printf 'Creating database "%s".\n' "$target_database"
  "$psql_bin" -X -w -v ON_ERROR_STOP=1 --dbname="$maintenance_url" \
    -c "CREATE DATABASE \"${target_database}\"" >/dev/null
fi

# Roles are cluster-wide, so create them only when missing. They are NOLOGIN:
# nothing connects as them here, but the migrations grant to them by name.
printf 'Ensuring roles and the auth schema.\n'
run_sql_stdin <<'SQL'
DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN', role_name);
    END IF;
  END LOOP;
END $$;

-- The Supabase-managed auth schema is not present on a stock PostgreSQL.
-- hub_identities.auth_user_id references auth.users(id), so provide the
-- minimum GoTrue-compatible shape. A local identity provider owns these rows.
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE,
  encrypted_password TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT USAGE ON SCHEMA auth TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA auth TO service_role;
SQL

shopt -s nullglob
migrations=("$migrations_dir"/*.sql)
shopt -u nullglob

((${#migrations[@]})) || {
  printf 'No migrations found in %s\n' "$migrations_dir" >&2
  exit 1
}

# Filename order is the applied order, matching supabase db reset.
IFS=$'\n' migrations=($(printf '%s\n' "${migrations[@]}" | sort))
unset IFS

for migration in "${migrations[@]}"; do
  printf '  applying %s\n' "$(basename "$migration")"
  run_sql_file "$migration"
done

if [[ $with_seed == true ]]; then
  [[ -f $seed_file ]] || {
    printf 'Missing seed file: %s\n' "$seed_file" >&2
    exit 1
  }
  printf 'Applying seed.sql\n'
  run_sql_file "$seed_file"
fi

# Grants run last so they cover everything the migrations created.
printf 'Applying service_role grants.\n'
run_sql_stdin <<'SQL'
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
SQL

table_count=$("$psql_bin" -X -w -t -A --dbname="$target_url" \
  -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'")

printf 'Done. public schema holds %s tables in "%s".\n' "$table_count" "$target_database"
printf 'Supabase Auth users were not created; provision a local admin separately.\n'
