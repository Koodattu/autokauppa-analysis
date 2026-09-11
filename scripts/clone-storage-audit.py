"""Create a new local audit DB from a binary-safe, read-only production dump.

No production file is created. Private backup artifacts stay under ignored backups/.
The database password is generated in memory and passed through the Docker client's
environment, never printed or written to a credential file.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import sys
import tarfile
import time


ROOT = Path(__file__).resolve().parents[1]
SOURCE = "nettiauto-analytics-postgres-1"
IMAGE = "postgres:18.4-alpine"
DATABASE = "nettiauto_audit_test"
ROLE = "nettiauto"
LABEL = "dev.koodattu.nettiauto-storage-audit"


def run(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def capture(args):
    return subprocess.check_output(args, text=True)


def stream_backup(command, destination):
    partial = destination.with_suffix(destination.suffix + ".partial")
    if destination.exists() or partial.exists():
        raise RuntimeError(f"Refusing to overwrite {destination.name}")
    digest = hashlib.sha256()
    total = 0
    started = last_report = time.monotonic()
    with partial.open("xb") as output, destination.with_suffix(".stderr.log").open("xb") as errors:
        process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=errors)
        try:
            while block := process.stdout.read(1024 * 1024):
                output.write(block)
                digest.update(block)
                total += len(block)
                if time.monotonic() - last_report >= 20:
                    print(json.dumps({"stage": destination.name, "bytes": total,
                                      "elapsed_seconds": round(time.monotonic() - started)}), flush=True)
                    last_report = time.monotonic()
            code = process.wait()
            if code:
                raise RuntimeError(f"Source stream failed with exit code {code}; partial file retained")
        finally:
            process.stdout.close()
    if total == 0:
        raise RuntimeError("Empty backup stream")
    partial.rename(destination)
    destination.with_suffix(destination.suffix + ".sha256").write_text(
        f"{digest.hexdigest()}  {destination.name}\n", encoding="ascii")
    print(json.dumps({"stage": destination.name, "complete": True, "bytes": total,
                      "sha256": digest.hexdigest()}), flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--container", required=True)
    parser.add_argument("--port", type=int, default=55433)
    parser.add_argument("--directory", required=True)
    parser.add_argument("--resume-restore", action="store_true")
    parser.add_argument("--reset-failed-audit-db", action="store_true")
    options = parser.parse_args()
    if options.reset_failed_audit_db and not options.resume_restore:
        raise RuntimeError("Reset requires --resume-restore")
    directory = (ROOT / "backups" / options.directory).resolve()
    if directory.parent != (ROOT / "backups").resolve():
        raise RuntimeError("Backup directory must be an immediate child of backups/")
    if not options.container.startswith("nettiauto-storage-audit-"):
        raise RuntimeError("Container name must start with nettiauto-storage-audit-")
    if not options.resume_restore:
        if shutil.disk_usage(ROOT).free < 80 * 1024**3:
            raise RuntimeError("At least 80 GiB local disk headroom is required")
        if options.container in capture(["docker", "ps", "-a", "--format", "{{.Names}}"]).splitlines():
            raise RuntimeError("Refusing to reuse an existing container")
        volume = options.container + "-data"
        if volume in capture(["docker", "volume", "ls", "-q"]).splitlines():
            raise RuntimeError("Refusing to reuse an existing volume")
        directory.mkdir(parents=True, exist_ok=False)
        source_command = (
            "docker exec -e 'PGOPTIONS=-c default_transaction_read_only=on' "
            f"{SOURCE} pg_dump -U nettiauto -d nettiauto_analytics "
            "--format=custom --compress=1 --no-owner --no-privileges --lock-wait-timeout=5s"
        )
        stream_backup(["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10",
                       "vaarattu-server", source_command], directory / "production.dump")
        with (directory / "production.dump").open("rb") as file:
            if file.read(5) != b"PGDMP":
                raise RuntimeError("Backup is not a PostgreSQL custom archive")
        stream_backup(["ssh", "-o", "BatchMode=yes", "vaarattu-server",
                       "docker exec nettiauto-analytics-worker-1 tar -C /data/hero-images -cf - ."],
                      directory / "heroes.tar")
        environment = os.environ.copy()
        environment["POSTGRES_PASSWORD"] = secrets.token_urlsafe(32)
        run(["docker", "run", "-d", "--name", options.container,
             "--label", f"{LABEL}=true", "--memory", "4g", "--cpus", "4", "--shm-size", "256m",
             "-p", f"127.0.0.1:{options.port}:5432", "-e", "POSTGRES_PASSWORD",
             "-e", f"POSTGRES_USER={ROLE}", "-e", f"POSTGRES_DB={DATABASE}",
             "-v", f"{volume}:/var/lib/postgresql", IMAGE], env=environment, stdout=subprocess.DEVNULL)
        for _ in range(60):
            result = subprocess.run(["docker", "exec", options.container, "pg_isready", "-h", "127.0.0.1", "-U", ROLE,
                                     "-d", DATABASE], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if result.returncode == 0:
                break
            time.sleep(1)
        else:
            raise RuntimeError("Local audit database did not become ready")
        manifest = {"container": options.container, "database": DATABASE, "port": options.port,
                    "role": ROLE, "volume": volume, "source": SOURCE, "image": IMAGE,
                    "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
        (directory / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    else:
        manifest = json.loads((directory / "manifest.json").read_text())
        if manifest["container"] != options.container or manifest["database"] != DATABASE:
            raise RuntimeError("Restore manifest does not match the requested audit container")
        container = json.loads(capture(["docker", "inspect", options.container]))[0]
        if container["Config"]["Labels"].get(LABEL) != "true":
            raise RuntimeError("Container is not marked as an audit container")
        for name in ("production.dump", "heroes.tar"):
            artifact = directory / name
            expected = artifact.with_suffix(artifact.suffix + ".sha256").read_text().split()[0]
            with artifact.open("rb") as file:
                actual = hashlib.file_digest(file, "sha256").hexdigest()
            if actual != expected:
                raise RuntimeError(f"Checksum mismatch: {name}")
        if options.reset_failed_audit_db:
            if (directory / "hero-manifest.json").exists():
                raise RuntimeError("Refusing to reset a previously verified clone")
            run(["docker", "exec", options.container, "dropdb", "-U", ROLE, DATABASE])
            run(["docker", "exec", options.container, "createdb", "-U", ROLE, DATABASE])
        tables = capture(["docker", "exec", options.container, "psql", "-X", "-At", "-U", ROLE,
                          "-d", DATABASE, "-c", "select count(*) from pg_tables where schemaname='public'"]).strip()
        if tables != "0":
            raise RuntimeError("Refusing to resume a restore into a nonempty database")
    available_kib = int(capture(["docker", "exec", options.container, "df", "-Pk",
                                 "/var/lib/postgresql"]).splitlines()[-1].split()[3])
    if available_kib < 30 * 1024**2:
        raise RuntimeError("Docker needs at least 30 GiB free before restoring the audit database")
    print(json.dumps({"stage": "restore", "container": options.container}), flush=True)
    with (directory / "production.dump").open("rb") as backup, (directory / "restore.log").open("ab") as log:
        restore = subprocess.Popen(["docker", "exec", "-i", options.container, "pg_restore", "-U", ROLE,
                                    "-d", DATABASE, "--exit-on-error", "--no-owner", "--no-privileges"],
                                   stdin=backup, stdout=log, stderr=log)
        while restore.poll() is None:
            time.sleep(20)
            print(json.dumps({"stage": "restore", "running": restore.poll() is None}), flush=True)
        if restore.returncode:
            raise RuntimeError(f"Local restore failed with exit code {restore.returncode}; inspect private restore.log")
    sql = "select object_key from listing_hero_images order by object_key;"
    keys = capture(["docker", "exec", options.container, "psql", "-X", "-At", "-U", ROLE,
                    "-d", DATABASE, "-v", "ON_ERROR_STOP=1", "-c", sql]).splitlines()
    with tarfile.open(directory / "heroes.tar") as archive:
        objects = {m.name.removeprefix("./"): m for m in archive.getmembers() if m.isfile()}
        missing = [key for key in keys if key not in objects]
        if missing:
            raise RuntimeError(f"Hero archive is missing {len(missing)} database-referenced objects")
        hero_manifest = {}
        for key, member in objects.items():
            digest = hashlib.sha256(archive.extractfile(member).read()).hexdigest()
            hero_manifest[key] = {"bytes": member.size, "sha256": digest}
    (directory / "hero-manifest.json").write_text(json.dumps(hero_manifest, indent=2), encoding="utf-8")
    print(json.dumps({"stage": "clone_verified", "referenced_hero_objects": len(keys),
                      "archived_objects": len(objects), "missing": 0}), flush=True)


if __name__ == "__main__":
    main()
