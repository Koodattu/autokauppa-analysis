"""Local-only tests of the production profiler's no-export and no-repeat guards."""
import contextlib
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import run as runner


class SimilarityGuards(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        root = patch.object(runner, "ROOT", Path(temporary.name))
        root.start()
        self.addCleanup(root.stop)
        self.private = Path(temporary.name) / "backups" / "observation-structure"

    def invoke(self, response=None, error=None):
        with patch.object(runner.subprocess, "run", return_value=response, side_effect=error) as remote:
            with contextlib.redirect_stdout(io.StringIO()) as output:
                with self.assertRaises(RuntimeError):
                    runner.similarity()
            self.assertEqual(output.getvalue(), "")
            return remote.call_count

    def test_existing_attempt_prevents_any_remote_call(self):
        self.private.mkdir(parents=True)
        (self.private / "similarity-budget.json").write_text('{"state":"failed"}')
        self.assertEqual(self.invoke(), 0)

    def test_raw_response_is_not_saved_printed_or_retried(self):
        response = subprocess.CompletedProcess([], 0, b'{"observations":[{"payload":"private"}]}', b'')
        self.assertEqual(self.invoke(response), 1)
        self.assertFalse((self.private / "production-similarity.json").exists())
        ledger = json.loads((self.private / "similarity-budget.json").read_text())
        self.assertEqual(ledger["state"], "failed")
        self.assertEqual(ledger["exportedObservationRows"], 0)
        self.assertEqual(self.invoke(response), 0)

    def test_output_cap_and_remote_errors_are_redacted(self):
        for code, output in [(0, b'x' * 16385), (1, b'private')]:
            with self.subTest(code=code):
                # Separate roots represent independent local test executions.
                with tempfile.TemporaryDirectory() as directory, patch.object(runner, "ROOT", Path(directory)):
                    self.assertEqual(self.invoke(subprocess.CompletedProcess([], code, output, b'private')), 1)

    def test_budget_is_reserved_before_contact_and_timeout_stays_charged(self):
        def timeout(*args, **kwargs):
            ledger = json.loads((self.private / "similarity-budget.json").read_text())
            self.assertEqual(ledger["state"], "reserved")
            self.assertEqual(kwargs["timeout"], 110)
            raise subprocess.TimeoutExpired(args[0], 110)

        with patch.object(runner.subprocess, "run", side_effect=timeout):
            with self.assertRaises(subprocess.TimeoutExpired):
                runner.similarity()
        self.assertEqual(json.loads((self.private / "similarity-budget.json").read_text())["state"], "failed")
        self.assertEqual(self.invoke(), 0)

    def test_nested_text_cannot_hide_in_numeric_response(self):
        value = {
            "version": 1, "exportedObservationRows": 0,
            "limits": {"selectedRows": 300, "selectedBytes": 8388608, "bundles": 80,
                       "decodedBytes": 268435456, "compressionInputBytes": 134217728,
                       "sqlQueries": 260, "runtimeSeconds": 90},
            "counters": {"sqlQueries": 0, "bundleReads": 0, "decodedBytes": 0, "selectedBytes": 0,
                         "candidateRows": 0, "acceptedRows": 0, "skippedRows": 0,
                         "compressionInputBytes": 0, "roundTrips": 0, "seedListings": 0,
                         "currentRuns": 0, "soldRuns": 0},
            "panels": {kind: {"rows": 0, "identities": 0, "repeatedIdentities": 0, "singletonIdentities": 0,
                              "layouts": {f"{order}{size}": {"bytes": 0, "bundles": 0, "verifiedRows": 0}
                                          for order in ("uuid", "temporal") for size in (16, 64, 250)}}
                       for kind in ("all", "current", "sold", "detail")},
        }
        runner.validate_similarity(value)
        value["panels"]["all"]["layouts"]["uuid16"]["raw record hidden in key"] = 123
        with self.assertRaisesRegex(RuntimeError, "Non-aggregate"):
            runner.validate_similarity(value)


if __name__ == "__main__":
    unittest.main()
