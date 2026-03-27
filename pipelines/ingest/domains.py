"""Load named map domains from shared config."""

from __future__ import annotations

import json
from pathlib import Path


def load_domains(config_path: str | Path = "config/domains.json") -> dict[str, dict[str, object]]:
    path = Path(config_path)
    payload = json.loads(path.read_text(encoding="utf-8"))
    return {domain["id"]: domain for domain in payload["domains"]}
