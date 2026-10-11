"""Bounded, opt-in experiment; never clones a database or touches existing containers.

python scripts/observation-storage/run.py profile
python scripts/observation-storage/run.py benchmark
python scripts/observation-storage/run.py structure
python scripts/observation-storage/run.py catalog
python scripts/observation-storage/run.py similarity
Private results live under ignored backups/observation-prototype/ (original study)
and backups/observation-structure/ (structure, catalog and similarity commands).
"""
import argparse
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import time

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
PRIVATE = ROOT / "backups" / "observation-prototype"
IMAGE = "postgres:18.4-alpine"


def validate_similarity(value):
    """Reject unexpected text even in nested keys before saving or printing output."""
    counter_keys = ("sqlQueries bundleReads decodedBytes selectedBytes candidateRows acceptedRows "
                    "skippedRows compressionInputBytes roundTrips seedListings currentRuns soldRuns").split()
    limit_keys = ("selectedRows selectedBytes bundles decodedBytes compressionInputBytes "
                  "sqlQueries runtimeSeconds").split()
    panel_shape = dict.fromkeys(("rows", "identities", "repeatedIdentities", "singletonIdentities"))
    panel_shape["layouts"] = {
        f"{order}{size}": dict.fromkeys(("bytes", "bundles", "verifiedRows"))
        for order in ("uuid", "temporal") for size in (16, 64, 250)
    }
    shape = {"version": None, "exportedObservationRows": None,
             "limits": dict.fromkeys(limit_keys), "counters": dict.fromkeys(counter_keys),
             "panels": dict.fromkeys(("all", "current", "sold", "detail"), panel_shape)}

    def matches(item, expected):
        if expected is None:
            return type(item) is int and item >= 0
        return (isinstance(item, dict) and set(item) == set(expected) and
                all(matches(item[key], child) for key, child in expected.items()))

    if not matches(value, shape) or value["version"] != 1 or value["exportedObservationRows"] != 0:
        raise RuntimeError("Non-aggregate response rejected")


def similarity():
    """One bounded on-server comparison; only numeric aggregates cross SSH."""
    private = ROOT / "backups" / "observation-structure"
    private.mkdir(parents=True, exist_ok=True)
    destination = private / "production-similarity.json"
    ledger_path = private / "similarity-budget.json"
    if destination.exists() or ledger_path.exists():
        raise RuntimeError("Similarity check already attempted; inspect existing aggregates before any new work.")
    attempt = {"state": "reserved", "selectedRows": 300, "selectedBytes": 8 * 1024**2,
               "bundleReads": 80, "decodedBytes": 256 * 1024**2,
               "compressionInputBytes": 128 * 1024**2, "exportedObservationRows": 0}
    # Exclusive creation also prevents two simultaneous invocations from sampling.
    with ledger_path.open("x") as ledger:
        json.dump(attempt, ledger, indent=2)
    script = (HERE / "similarity.ts").read_text().replace('"../../packages/', '"/app/packages/')
    command = ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=15", "vaarattu-server",
               "docker exec -i -w /app nettiauto-analytics-worker-1 bun run -"]
    # A server watchdog and per-statement timeout also bound work if SSH disconnects.
    try:
        result = subprocess.run(command, input=script.encode(), capture_output=True, timeout=110)
        if result.returncode or len(result.stdout) > 16384:
            raise RuntimeError("Bounded similarity check failed; no production contents emitted")
        value = json.loads(result.stdout)
        validate_similarity(value)
        destination.write_bytes(result.stdout)
        attempt.update(state="completed", aggregateBytes=len(result.stdout))
        print(json.dumps(value))
    except Exception:
        attempt.update(state="failed")
        raise
    finally:
        ledger_path.write_text(json.dumps(attempt, indent=2))


def catalog():
    """One bounded catalog refresh; never exports records, identifiers or payloads."""
    private = ROOT / "backups" / "observation-structure"
    private.mkdir(parents=True, exist_ok=True)
    destination = private / "catalog.json"
    if destination.exists():
        raise RuntimeError("Catalog already exists; reuse the recorded aggregate evidence.")
    command = ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=15", "vaarattu-server",
               "docker exec -i -w /app nettiauto-analytics-worker-1 bun run -"]
    result = subprocess.run(command, input=(HERE / "catalog.ts").read_bytes(),
                            capture_output=True, timeout=45)
    if result.returncode or len(result.stdout) > 65536:
        raise RuntimeError("Bounded catalog query failed; no production contents emitted")
    value = json.loads(result.stdout)
    if value.get("exportedObservationRows") != 0 or set(value) != {
        "tables", "indexes", "widths", "panel", "info", "exportedObservationRows"
    }:
        raise RuntimeError("Unexpected catalog response")
    destination.write_bytes(result.stdout)
    print(json.dumps({"aggregateBytes": len(result.stdout), "exportedObservationRows": 0}))


def profile():
    PRIVATE.mkdir(parents=True, exist_ok=True)
    destination = PRIVATE / "production-profile.json"
    if destination.exists():
        raise RuntimeError("Profile already exists; reuse it. Refusing another production sample.")
    ledger_path = PRIVATE / "extraction-budget.json"
    ledger = json.loads(ledger_path.read_text()) if ledger_path.exists() else {"attempts": []}
    # Charge the full possible output BEFORE contacting production, including failed attempts.
    rows, size = 300, 8 * 1024**2
    if sum(x["reservedRows"] for x in ledger["attempts"]) + rows > 100_000 or sum(
        x["reservedBytes"] for x in ledger["attempts"]
    ) + size > 100 * 1024**2:
        raise RuntimeError("Cumulative extraction budget exhausted")
    attempt = {"reservedRows": rows, "reservedBytes": size, "state": "reserved"}
    ledger["attempts"].append(attempt)
    ledger_path.write_text(json.dumps(ledger, indent=2))
    command = ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=15", "vaarattu-server",
               "docker exec -i -w /app nettiauto-analytics-worker-1 bun run -"]
    script = (HERE / "sample.ts").read_bytes()
    # Source code is stdin. No remote file, export table, dump, or credentials are created.
    with (PRIVATE / "sample-errors.log").open("wb") as errors:
        proc = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=errors)
        proc.stdin.write(script)
        proc.stdin.close()
        output = proc.stdout.read(size + 1)
        if len(output) > size:
            proc.kill()
            raise RuntimeError("Output exceeded independent client byte cap")
        code = proc.wait(timeout=120)
    if code:
        attempt.update(state="failed", extractedObservationRows=0, actualBytes=len(output))
        ledger_path.write_text(json.dumps(ledger, indent=2))
        raise RuntimeError("Sample failed; private log retained, full budget remains charged")
    result = json.loads(output)
    if "observations" in result or result["selection"]["observations"] > rows:
        raise RuntimeError("Only aggregate output is allowed")
    destination.write_bytes(output)
    attempt.update(state="completed", sampledRows=result["selection"]["observations"],
                   extractedObservationRows=0, actualBytes=len(output))
    ledger_path.write_text(json.dumps(ledger, indent=2))
    print(json.dumps({"profile": result, "budget": ledger}))


def benchmark(script="benchmark.ts", private=PRIVATE):
    private.mkdir(parents=True, exist_ok=True)
    name = "nettiauto-observation-prototype-" + secrets.token_hex(4)
    password = secrets.token_urlsafe(24)
    env = dict(os.environ, POSTGRES_PASSWORD=password)
    subprocess.run(["docker", "run", "--detach", "--rm", "--name", name,
                    "--label", "dev.koodattu.observation-prototype=true", "--memory=1536m", "--cpus=2",
                    "--publish", "127.0.0.1::5432", "--mount", "type=tmpfs,destination=/var/lib/postgresql",
                    "--env", "POSTGRES_PASSWORD", "--env", "POSTGRES_USER=prototype",
                    "--env", "POSTGRES_DB=nettiauto_observation_prototype_test", IMAGE],
                   env=env, check=True, stdout=subprocess.DEVNULL)
    try:
        for _ in range(30):
            if subprocess.run(["docker", "exec", name, "pg_isready", "-U", "prototype"],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
                break
            time.sleep(1)
        else:
            raise RuntimeError("Disposable database did not become ready")
        port = subprocess.check_output(["docker", "port", name, "5432/tcp"], text=True).strip().rsplit(":", 1)[1]
        env.update(PROTOTYPE_DATABASE_URL=f"postgres://prototype:{password}@127.0.0.1:{port}/nettiauto_observation_prototype_test",
                   PROTOTYPE_DIRECTORY=str(private))
        env.pop("DATABASE_URL", None)
        env.pop("TEST_DATABASE_URL", None)
        bun = shutil.which("bun")
        if not bun:
            raise RuntimeError("Bun is required")
        with (private / "benchmark-errors.log").open("wb") as errors:
            result = subprocess.run([bun, "--no-env-file", str(HERE / script)],
                                    cwd=ROOT, env=env, stderr=errors)
        if result.returncode:
            raise RuntimeError("Benchmark failed; details retained only in private benchmark-errors.log")
    finally:
        subprocess.run(["docker", "stop", name], check=True, stdout=subprocess.DEVNULL)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=["profile", "benchmark", "structure", "catalog", "similarity"])
    args = parser.parse_args()
    if args.operation == "profile":
        profile()
    elif args.operation == "structure":
        benchmark("structure.ts", ROOT / "backups" / "observation-structure")
    elif args.operation == "catalog":
        catalog()
    elif args.operation == "similarity":
        similarity()
    else:
        benchmark()
