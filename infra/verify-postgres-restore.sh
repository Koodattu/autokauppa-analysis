#!/bin/sh
set -eu

: "${TEST_DATABASE_URL:?TEST_DATABASE_URL is required}"
: "${BACKUP_FILE:?BACKUP_FILE is required}"

case "$TEST_DATABASE_URL" in
  *test*) ;;
  *)
    printf '%s\n' "Refusing to restore into a database URL that does not contain 'test'." >&2
    exit 2
    ;;
esac

test -f "$BACKUP_FILE"
test -f "$BACKUP_FILE.sha256"
sha256sum --check "$BACKUP_FILE.sha256"

pg_restore \
  --dbname="$TEST_DATABASE_URL" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  "$BACKUP_FILE"

psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -c \
  "select count(*) as applied_migrations from drizzle.__drizzle_migrations;"
