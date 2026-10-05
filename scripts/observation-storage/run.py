"""Bounded, opt-in experiment; never clones a database or touches existing containers.

python scripts/observation-storage/run.py profile
python scripts/observation-storage/run.py benchmark
Private input, logs, and aggregate results live in ignored backups/observation-prototype/.
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


def benchmark():
    PRIVATE.mkdir(parents=True, exist_ok=True)
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
                   PROTOTYPE_DIRECTORY=str(PRIVATE))
        env.pop("DATABASE_URL", None)
        env.pop("TEST_DATABASE_URL", None)
        bun = shutil.which("bun")
        if not bun:
            raise RuntimeError("Bun is required")
        with (PRIVATE / "benchmark-errors.log").open("wb") as errors:
            result = subprocess.run([bun, "--no-env-file", str(HERE / "benchmark.ts")],
                                    cwd=ROOT, env=env, stderr=errors)
        if result.returncode:
            raise RuntimeError("Benchmark failed; details retained only in private benchmark-errors.log")
    finally:
        subprocess.run(["docker", "stop", name], check=True, stdout=subprocess.DEVNULL)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=["profile", "benchmark"])
    args = parser.parse_args()
    profile() if args.operation == "profile" else benchmark()
