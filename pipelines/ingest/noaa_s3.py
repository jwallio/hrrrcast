"""Lightweight NOAA S3 bucket discovery helpers."""

from __future__ import annotations

from dataclasses import dataclass
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

from .models import S3Object
from .settings import NOAA_HRRRCAST_BUCKET_URL, NOAA_HRRRCAST_ROOT_PREFIX

S3_XML_NS = {"s3": "http://s3.amazonaws.com/doc/2006-03-01/"}


@dataclass
class NOAAHrrrCastClient:
    bucket_url: str = NOAA_HRRRCAST_BUCKET_URL
    root_prefix: str = NOAA_HRRRCAST_ROOT_PREFIX
    timeout_seconds: int = 60

    def list_common_prefixes(self, prefix: str, delimiter: str = "/") -> list[str]:
        prefixes: list[str] = []
        continuation_token: str | None = None
        while True:
            query = {
                "list-type": "2",
                "prefix": prefix,
                "delimiter": delimiter,
            }
            if continuation_token:
                query["continuation-token"] = continuation_token
            xml_text = self._http_get_text(self._build_url(query))
            root = ET.fromstring(xml_text)
            prefixes.extend(
                node.text or ""
                for node in root.findall("s3:CommonPrefixes/s3:Prefix", S3_XML_NS)
            )
            is_truncated = (root.findtext("s3:IsTruncated", default="false", namespaces=S3_XML_NS) or "").lower() == "true"
            if not is_truncated:
                break
            continuation_token = root.findtext("s3:NextContinuationToken", namespaces=S3_XML_NS)
            if not continuation_token:
                break
        return prefixes

    def list_objects(self, prefix: str) -> list[S3Object]:
        objects: list[S3Object] = []
        continuation_token: str | None = None
        while True:
            query = {
                "list-type": "2",
                "prefix": prefix,
            }
            if continuation_token:
                query["continuation-token"] = continuation_token
            xml_text = self._http_get_text(self._build_url(query))
            root = ET.fromstring(xml_text)
            for node in root.findall("s3:Contents", S3_XML_NS):
                key = node.findtext("s3:Key", default="", namespaces=S3_XML_NS)
                size = int(node.findtext("s3:Size", default="0", namespaces=S3_XML_NS))
                last_modified = node.findtext("s3:LastModified", namespaces=S3_XML_NS)
                objects.append(S3Object(key=key, size=size, last_modified=last_modified))
            is_truncated = (root.findtext("s3:IsTruncated", default="false", namespaces=S3_XML_NS) or "").lower() == "true"
            if not is_truncated:
                break
            continuation_token = root.findtext("s3:NextContinuationToken", namespaces=S3_XML_NS)
            if not continuation_token:
                break
        return objects

    def fetch_text(self, key: str) -> str:
        encoded_key = urllib.parse.quote(key)
        url = f"{self.bucket_url}/{encoded_key}"
        return self._http_get_text(url)

    def list_dates(self) -> list[str]:
        prefixes = self.list_common_prefixes(self.root_prefix)
        return [prefix.rstrip("/").split("/")[-1] for prefix in prefixes]

    def list_cycles(self, date: str) -> list[str]:
        prefixes = self.list_common_prefixes(f"{self.root_prefix}{date}/")
        return [prefix.rstrip("/").split("/")[-1] for prefix in prefixes]

    def latest_run_id(self) -> str:
        dates = sorted(self.list_dates())
        if not dates:
            raise RuntimeError("No HRRRCast dates found in the NOAA bucket.")
        latest_date = dates[-1]
        cycles = sorted(self.list_cycles(latest_date))
        if not cycles:
            raise RuntimeError(f"No cycles found under HRRRCast/{latest_date}/")
        return f"{latest_date}{cycles[-1]}"

    def recent_run_ids(self, limit: int = 8) -> list[str]:
        run_ids: list[str] = []
        for date in sorted(self.list_dates(), reverse=True):
            for cycle in sorted(self.list_cycles(date), reverse=True):
                run_ids.append(f"{date}{cycle}")
                if len(run_ids) >= limit:
                    return run_ids
        return run_ids

    def _build_url(self, query: dict[str, str]) -> str:
        return f"{self.bucket_url}/?{urllib.parse.urlencode(query)}"

    def _http_get_text(self, url: str) -> str:
        with urllib.request.urlopen(url, timeout=self.timeout_seconds) as response:
            return response.read().decode("utf-8")
