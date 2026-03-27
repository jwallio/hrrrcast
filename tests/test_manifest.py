from pathlib import Path
import tempfile
import unittest

from pipelines.ingest.manifest import (
    ManifestThresholds,
    infer_run_status,
    normalize_run_id,
    write_latest_manifest_alias,
)


class ManifestLogicTests(unittest.TestCase):
    def test_normalize_run_id(self) -> None:
        self.assertEqual(("20260323", "00"), normalize_run_id("2026032300"))

    def test_ready_status(self) -> None:
        discovered = {f"m0{i}": list(range(0, 19)) for i in range(6)}
        status, reasons = infer_run_status(
            discovered,
            ManifestThresholds(required_member_count=6, required_min_forecast_hour=18),
        )
        self.assertEqual("ready", status)
        self.assertEqual(
            ["All discovered members meet the configured Phase 1 completeness thresholds."],
            reasons,
        )

    def test_partial_status_for_missing_members_and_hours(self) -> None:
        discovered = {
            "m00": list(range(0, 19)),
            "m01": list(range(0, 10)),
        }
        status, reasons = infer_run_status(
            discovered,
            ManifestThresholds(required_member_count=6, required_min_forecast_hour=18),
        )
        self.assertEqual("partial", status)
        self.assertTrue(any("Only 2 members discovered" in reason for reason in reasons))
        self.assertTrue(any("f009" in reason for reason in reasons))

    def test_write_latest_manifest_alias(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            manifest = {"run": {"run_id": "2026032614", "status": "partial"}}
            path = write_latest_manifest_alias(manifest, tmpdir)
            self.assertEqual(Path(tmpdir) / "latest.json", path)
            self.assertEqual('{\n  "run": {\n    "run_id": "2026032614",\n    "status": "partial"\n  }\n}', path.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
