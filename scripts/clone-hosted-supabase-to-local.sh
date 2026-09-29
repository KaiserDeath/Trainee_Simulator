#!/usr/bin/env bash
# Clone a hosted Supabase public schema and its data into a local PostgreSQL
# database. This is intended for an Ubuntu development/PM2 host.
#
# Usage:
#   ./scripts/clone-hosted-supabase-to-local.sh \
#     --source 'postgresql://postgres.PROJECT_REF@aws-0-REGION.pooler.supabase.com:6543/postgres' \
#     --target 'postgresql://postgres@127.0.0.1:5432/trez_local' \
#     --confirm-local-overwrite
#
# Do not put passwords in either URL. The script prompts for them and never
# writes them to disk. It copies the public schema and data only; it does not
# copy Supabase Auth users, password hashes, or storage objects.

set -euo pipefail
umask 077

source_url=''
target_url=''
confirm_local_overwrite=false

usage() {
  sed -n '2,15p' "$0"
}

while (($#)); do
  case "$1" in
    --source) source_url=${2:?Missing source URL}; shift 2 ;;
    --target) target_url=${2:?Missing target URL}; shift 2 ;;
    --confirm-local-overwrite) confirm_local_overwrite=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) printf 'Unknown argument: %s\n' "$1" >&2; usage >&2; exit 2 ;;
  esac
done

require_command() {
  command -v "$1" >/dev/null || {
    printf 'Missing required command: %s\n' "$1" >&2
    exit 1
  }
}

validate_url() {
  local value=$1 label=$2
  [[ $value =~ ^postgres(ql)?:// ]] || {
    printf '%s must use postgres:// or postgresql://\n' "$label" >&2
    exit 2
  }
  [[ ! $value =~ ^postgres(ql)?://[^/@:]+:[^@/]+@ ]] || {
    printf '%s must not contain a password. The script will prompt for it.\n' "$label" >&2
    exit 2
  }
}

[[ -n $source_url && -n $target_url ]] || { usage >&2; exit 2; }
[[ $confirm_local_overwrite == true ]] || {
  printf 'Refusing to overwrite local data. Add --confirm-local-overwrite.\n' >&2
  exit 2
}
validate_url "$source_url" 'Source URL'
validate_url "$target_url" 'Target URL'

# Accept only a physical-local PostgreSQL target. A remote host, Docker service
# hostname, or a Supabase pooler is intentionally rejected.
[[ $target_url =~ ^postgres(ql)?://([^/@]+@)?(localhost|127\.0\.0\.1|\[::1\])(:[0-9]+)?/ ]] || {
  printf 'Target URL must point to localhost, 127.0.0.1, or [::1].\n' >&2
  exit 2
}

require_command pg_dump
require_command psql

work_dir=$(mktemp -d "${TMPDIR:-/tmp}/trez-db-clone.XXXXXX")
schema_dump="$work_dir/schema.sql"
data_dump="$work_dir/data.sql"

cleanup() {
  local status=$?
  unset source_password target_password PGPASSWORD
  rm -rf -- "$work_dir"
  exit "$status"
}
trap cleanup EXIT

read -r -s -p 'Hosted Supabase database password: ' source_password
printf '\n'
PGPASSWORD=$source_password pg_dump \
  --no-owner --no-privileges --schema=public --file="$schema_dump" "$source_url"
PGPASSWORD=$source_password pg_dump \
  --no-owner --no-privileges --data-only --schema=public --file="$data_dump" "$source_url"
unset source_password

read -r -s -p 'Local PostgreSQL password (leave blank for peer/.pgpass auth): ' target_password
printf '\n'

# Schema drop and restore share one transaction. If restore validation fails,
# PostgreSQL rolls back the local schema drop instead of leaving a partial clone.
{
  cat <<'SQL'
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
DO $$
DECLARE role_name text;
BEGIN
  EXECUTE format('GRANT ALL ON SCHEMA public TO %I', current_user);
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', role_name);
      IF role_name = 'service_role' THEN
        EXECUTE format('GRANT ALL ON ALL TABLES IN SCHEMA public TO %I', role_name);
        EXECUTE format('GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO %I', role_name);
        EXECUTE format('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO %I', role_name);
      END IF;
    END IF;
  END LOOP;
END $$;
SQL
  cat "$schema_dump"
  cat "$data_dump"
} | PGPASSWORD=$target_password psql \
  --set ON_ERROR_STOP=1 --single-transaction --dbname="$target_url"
unset target_password

printf 'Local public schema and data now match the hosted source.\n'
printf 'Supabase Auth users were not copied; provision a local first admin separately if needed.\n'
