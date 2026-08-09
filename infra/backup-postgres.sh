#!/bin/sh
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_DIR:?BACKUP_DIR must point to persistent or off-server-backed storage}"

umask 077
mkdir -p "$BACKUP_DIR"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_path="$BACKUP_DIR/nettiauto-analytics-$timestamp.dump"
checksum_path="$backup_path.sha256"

pg_dump \
  --dbname="$DATABASE_URL" \
  --format=custom \
  --compress=6 \
  --no-owner \
  --no-privileges \
  --file="$backup_path"

sha256sum "$backup_path" > "$checksum_path"
printf '%s\n' "$backup_path"
