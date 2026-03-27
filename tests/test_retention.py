from pathlib import Path
import tempfile
import unittest

from services.shared.retention import prune_processed_runs, select_runs_to_keep
from services.shared.store import list_run_manifests


class RetentionTests(unittest.TestCase):
    def test_select_runs_to_keep_uses_ready_and_partial_limits(self) -> None:
        keep = select_runs_to_keep("data/processed", keep_ready_runs=1, keep_partial_runs=1)
        manifests = list_run_manifests("data/processed")
        latest_ready = next(manifest for manifest in reversed(manifests) if manifest["run"]["status"] == "ready")
        self.assertIn(str(latest_ready["run"]["run_id"]), keep)

        partial_runs = [manifest for manifest in manifests if manifest["run"]["status"] == "partial"]
        if partial_runs:
            latest_partial = partial_runs[-1]
            self.assertIn(str(latest_partial["run"]["run_id"]), keep)

    def test_prune_processed_runs_removes_unkept_artifacts(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            (root / "manifests").mkdir()
            (root / "products").mkdir()
            (root / "tile_cache").mkdir()
            for run_id in ("2026032300", "2026032400"):
                (root / "manifests" / f"{run_id}.json").write_text("{}", encoding="utf-8")
                (root / "products" / run_id).mkdir()
                (root / "tile_cache" / run_id).mkdir()
            (root / "manifests" / "latest.json").write_text("{}", encoding="utf-8")

            removed = prune_processed_runs(root, {"2026032300"})
            self.assertEqual(["2026032400"], removed["manifests"])
            self.assertEqual(["2026032400"], removed["products"])
            self.assertEqual(["2026032400"], removed["tile_cache"])
            self.assertTrue((root / "manifests" / "latest.json").exists())


if __name__ == "__main__":
    unittest.main()
