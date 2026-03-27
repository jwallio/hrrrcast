import unittest

from pipelines.ingest.idx import parse_idx_text


class ParseIdxTextTests(unittest.TestCase):
    def test_parse_idx_text_extracts_field_keys(self) -> None:
        raw = "\n".join(
            [
                "1:0:d=2026032401:APCP:surface:anl:",
                "2:196406:d=2026032401:CAPE:surface:anl:",
                "76:137811590:d=2026032401:TMP:2 m above ground:anl:",
            ]
        )
        records = parse_idx_text(raw)
        self.assertEqual(3, len(records))
        self.assertEqual("APCP:surface", records[0].field_key)
        self.assertEqual("TMP:2 m above ground", records[2].field_key)
        self.assertEqual("2026032401", records[1].reference_time)


if __name__ == "__main__":
    unittest.main()
