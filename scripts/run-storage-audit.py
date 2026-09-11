"""Run local audit tools without exposing the audit database password."""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import time
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--directory", default="reduction-20260911")
    parser.add_argument("--fixture", action="store_true")
    parser.add_argument("--worker-image")
    parser.add_argument("command", nargs=argparse.REMAINDER)
    options = parser.parse_args()
    directory = (ROOT / "backups" / options.directory).resolve()
    if directory.parent != (ROOT / "backups").resolve():
        raise RuntimeError("Expected a direct child of backups/")
    manifest = json.loads((directory / "manifest.json").read_text())
    container = json.loads(subprocess.check_output(["docker", "inspect", manifest["container"]], text=True))[0]
    if container["Config"]["Labels"].get("dev.koodattu.nettiauto-storage-audit") != "true":
        raise RuntimeError("Not an isolated storage-audit container")
    environment = os.environ.copy()
    settings = dict(value.split("=", 1) for value in container["Config"]["Env"] if "=" in value)
    database = "nettiauto_storage_fixture_test" if options.fixture else manifest["database"]
    if options.fixture:
        result = subprocess.check_output(["docker", "exec", manifest["container"], "psql", "-X", "-At",
            "-U", manifest["role"], "-d", "postgres", "-c",
            "select count(*) from pg_database where datname='nettiauto_storage_fixture_test'"], text=True).strip()
        if result == "0":
            subprocess.run(["docker", "exec", manifest["container"], "createdb", "-U", manifest["role"], database], check=True)
    port = 5432 if options.worker_image else manifest["port"]
    url = f"postgresql://{manifest['role']}:{quote(settings['POSTGRES_PASSWORD'], safe='')}@127.0.0.1:{port}/{database}"
    environment.update(DATABASE_URL=url, APP_ENV="test", CRAWLER_ENABLED="false", CRAWLER_PAUSED="true",
                       CRAWLER_DETAIL_ENABLED="false", HERO_IMAGE_ARCHIVE_ENABLED="false", SENTRY_DSN="")
    environment["STORAGE_AUDIT_DIRECTORY"] = str(directory)
    environment.pop("TEST_DATABASE_URL", None)
    if options.fixture:
        environment["TEST_DATABASE_URL"] = url
    command = options.command
    if command and command[0] == "--":
        command = command[1:]
    if not command:
        raise RuntimeError("A command is required")
    if not options.fixture and any(x == "vitest" or x.startswith("test") for x in command):
        raise RuntimeError("Tests must use --fixture, never the production clone")
    operation = command[-1] if command[-1] in ("v2", "images", "raw", "verify-images", "verify-raw") else "probe"
    if options.worker_image:
        image = json.loads(subprocess.check_output(["docker", "image", "inspect", options.worker_image], text=True))[0]
        if image["Config"]["Labels"].get("dev.koodattu.nettiauto-storage-audit") != "true":
            raise RuntimeError("Worker image is not marked for this isolated audit")
        docker_command = ["docker", "run", "--rm", "--memory", "1g", "--cpus", "1",
                          "--label", "dev.koodattu.nettiauto-storage-audit=true",
                          "--network", f"container:{manifest['container']}"]
        for key in ("DATABASE_URL", "APP_ENV", "CRAWLER_ENABLED", "CRAWLER_PAUSED",
                    "CRAWLER_DETAIL_ENABLED", "HERO_IMAGE_ARCHIVE_ENABLED", "SENTRY_DSN"):
            docker_command.extend(["--env", key])
        command = [*docker_command, options.worker_image, *command]
    executable = shutil.which(command[0])
    if not executable:
        raise RuntimeError("Command executable not found")
    started = time.monotonic()
    result = subprocess.run([executable, *command[1:]], env=environment, cwd=ROOT)
    if options.worker_image:
        timing = {"image": options.worker_image, "operation": operation,
                  "elapsedSeconds": time.monotonic() - started, "exitCode": result.returncode}
        (directory / f"worker-{operation}-result.json").write_text(json.dumps(timing, indent=2) + "\n")
    raise SystemExit(result.returncode)


if __name__ == "__main__":
    main()
