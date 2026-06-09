#!/usr/bin/env bash
#
# backup-sis.sh — point-in-time backup of the Skyline SIS.
#
# Captures the things that are NOT in git: the Postgres database (skyline_sis)
# and the runtime secrets (.env). The application code itself lives in git, so
# only the commit HEAD is recorded here, not the source.
#
# Output: /root/skyline-backups/<YYYYMMDD-HHMMSS>-sis/
#   sis-db.dump        pg_dump custom format (-Fc)   -> restore with pg_restore
#   sis-db.sql.gz      plain SQL dump, gzipped        -> restore with zcat | psql
#   sis.env            repo .env (chmod 600)
#   ecosystem.config.js  pm2 process config
#   git-HEAD.txt / git-status.txt   repo state at backup time
#   MANIFEST.txt       human summary + table row counts
#   SHA256SUMS.txt     checksums of the artifacts
#
# Restore the schema+data:
#   pg_restore -d skyline_sis --no-owner --clean --if-exists sis-db.dump
#
# Usage: scripts/backup-sis.sh [--keep N]   (default: keep last 14 *-sis backups)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_ROOT="${SKYLINE_BACKUP_ROOT:-/root/skyline-backups}"
KEEP=14

while [[ $# -gt 0 ]]; do
  case "$1" in
    --keep) KEEP="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

cd "$REPO_ROOT"

# --- connection string -------------------------------------------------------
# DATABASE_URL carries a Prisma-only "?schema=public" suffix that libpq rejects;
# strip the query string before handing it to pg_dump/psql.
raw="$(grep -E '^DATABASE_URL' .env | head -1 | sed -E 's/^DATABASE_URL=//; s/^"//; s/"$//')"
conn="${raw%%\?*}"
if [[ -z "$conn" ]]; then
  echo "ERROR: could not read DATABASE_URL from $REPO_ROOT/.env" >&2
  exit 1
fi
export PGCONNECT_TIMEOUT=8

# --- destination -------------------------------------------------------------
TS="$(date +%Y%m%d-%H%M%S)"
DEST="$BACKUP_ROOT/${TS}-sis"
mkdir -p "$DEST"
echo "Backing up Skyline SIS -> $DEST"

# --- database ---------------------------------------------------------------
pg_dump "$conn" --no-owner --no-privileges -Fc -f "$DEST/sis-db.dump"
pg_dump "$conn" --no-owner --no-privileges | gzip > "$DEST/sis-db.sql.gz"

# --- secrets / config (not in git) ------------------------------------------
cp .env "$DEST/sis.env"; chmod 600 "$DEST/sis.env"
[[ -f ecosystem.config.js ]] && cp ecosystem.config.js "$DEST/ecosystem.config.js"

# --- repo state -------------------------------------------------------------
git rev-parse HEAD > "$DEST/git-HEAD.txt"
git status --porcelain > "$DEST/git-status.txt" || true

# --- verify ------------------------------------------------------------------
n_tables="$(pg_restore -l "$DEST/sis-db.dump" | grep -c 'TABLE DATA' || true)"
gzip -t "$DEST/sis-db.sql.gz"

# --- checksums ---------------------------------------------------------------
( cd "$DEST" && sha256sum sis-db.dump sis-db.sql.gz sis.env \
    $( [[ -f ecosystem.config.js ]] && echo ecosystem.config.js ) > SHA256SUMS.txt )

# --- manifest ----------------------------------------------------------------
rows="$(psql "$conn" -tAF $'\t' -c "
  select relname, n_live_tup from pg_stat_user_tables
  where schemaname='public' order by n_live_tup desc, relname;")"
{
  echo "Skyline SIS backup - ${TS}-sis"
  echo "Date: $(date -Iseconds)"
  echo "Host: $(hostname)   DB: skyline_sis   pg_dump: $(pg_dump --version | awk '{print $3}')"
  echo "Git HEAD: $(cat "$DEST/git-HEAD.txt")   table-data sections: ${n_tables}"
  echo
  echo "Restore: pg_restore -d skyline_sis --no-owner --clean --if-exists sis-db.dump"
  echo
  echo "Row counts (pg_stat_user_tables, public schema):"
  echo "$rows" | sed 's/^/  /'
} > "$DEST/MANIFEST.txt"

# --- retention ---------------------------------------------------------------
mapfile -t old < <(ls -1d "$BACKUP_ROOT"/*-sis 2>/dev/null | sort | head -n -"$KEEP")
for d in "${old[@]:-}"; do
  [[ -n "$d" ]] && { echo "Pruning old backup: $d"; rm -rf "$d"; }
done

echo "OK. $(du -sh "$DEST" | cut -f1) in $DEST"
cat "$DEST/MANIFEST.txt"
