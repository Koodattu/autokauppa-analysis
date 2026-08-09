# Operations helpers

`backup-postgres.sh` creates a private custom-format PostgreSQL dump and SHA-256
checksum in `BACKUP_DIR`. Production should point `BACKUP_DIR` at storage that is
copied off the application server and monitored independently.

```sh
DATABASE_URL=... BACKUP_DIR=/srv/backups ./infra/backup-postgres.sh
```

`verify-postgres-restore.sh` verifies the checksum, restores into a disposable
database whose URL contains `test`, and checks the migration table. It deliberately
refuses other database names because the restore uses `--clean`.

```sh
TEST_DATABASE_URL=... BACKUP_FILE=/srv/backups/nettiauto-analytics-....dump \
  ./infra/verify-postgres-restore.sh
```

Schedule backups with the host's service manager or backup platform, alert when
the command fails, and run the restore verification regularly. The scripts do not
delete old backups; retention belongs to the external backup destination.
