import unittest

from pipelines.ingest.field_catalog import (
    build_field_overlay_lookup,
    build_layers_payload,
    collect_manifest_field_keys,
    format_field_label,
    native_overlay_id,
)
from tests.fixture_data import sample_manifest


class FieldCatalogTests(unittest.TestCase):
    def test_native_overlay_id(self) -> None:
        self.assertEqual("field_tmp_2_m_above_ground", native_overlay_id("TMP:2 m above ground"))

    def test_format_field_label(self) -> None:
        self.assertEqual("Temperature (2 m above ground)", format_field_label("TMP:2 m above ground"))

    def test_collect_manifest_field_keys_for_sample_run(self) -> None:
        manifest = sample_manifest(run_id="2026032300")
        field_keys = collect_manifest_field_keys(manifest)
        self.assertIn("TMP:2 m above ground", field_keys)
        self.assertIn("VVEL:500 mb", field_keys)
        self.assertEqual(172, len(field_keys))

    def test_build_layers_payload_includes_native_fields(self) -> None:
        static_layers = {
            "defaults": {"weatherOverlay": "composite_reflectivity"},
            "weatherOverlays": [{"id": "composite_reflectivity", "label": "Composite Reflectivity"}],
        }
        payload = build_layers_payload(static_layers, {"TMP:2 m above ground", "VGRD:10 m above ground"})
        self.assertEqual(3, len(payload["weatherOverlays"]))
        self.assertEqual(2, payload["nativeFieldCount"])
        lookup = build_field_overlay_lookup({"TMP:2 m above ground"})
        self.assertIn("field_tmp_2_m_above_ground", lookup)


if __name__ == "__main__":
    unittest.main()
