#!/usr/bin/env python3
"""Scraper simples para sdbeachinfo.com.

Coleta:
- Last Updated da página principal
- Advisories, Warnings, Closures via endpoint interno Home/GetData

Uso:
  python3 scripts/sdbeachinfo_scraper.py
  python3 scripts/sdbeachinfo_scraper.py --json
"""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
from dataclasses import dataclass, asdict
from html.parser import HTMLParser
from typing import Dict, List
from urllib.parse import urlencode
from urllib.request import Request, urlopen

BASE_URL = "https://sdbeachinfo.com/"
GETDATA_URL = "https://sdbeachinfo.com/Home/GetData"

PARTIALS = {
    "advisories": "_AdvisoryPartialView",
    "warnings": "_WarningPartialView",
    "closures": "_ClosurePartialView",
}


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: List[str] = []

    def handle_data(self, data: str) -> None:
        if data and data.strip():
            self.parts.append(data.strip())

    def get_text(self) -> str:
        # normaliza múltiplos espaços/quebras
        text = "\n".join(self.parts)
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text.strip()


@dataclass
class SectionResult:
    section: str
    count: int
    lines: List[str]


@dataclass
class BeachStatus:
    source: str
    last_updated: str | None
    advisories: SectionResult
    warnings: SectionResult
    closures: SectionResult


def fetch_text(url: str, data: bytes | None = None, timeout: int = 30) -> str:
    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; sdbeachinfo-scraper/1.0)",
        "Accept": "text/html, */*;q=0.8",
    }
    req = Request(url, data=data, headers=headers)
    with urlopen(req, timeout=timeout) as resp:
        raw = resp.read()
        charset = resp.headers.get_content_charset() or "utf-8"
    return raw.decode(charset, errors="replace")


def html_to_lines(fragment: str) -> List[str]:
    # remove scripts/styles
    fragment = re.sub(r"<script[\s\S]*?</script>", "", fragment, flags=re.I)
    fragment = re.sub(r"<style[\s\S]*?</style>", "", fragment, flags=re.I)

    parser = _TextExtractor()
    parser.feed(fragment)
    text = html.unescape(parser.get_text())

    lines: List[str] = []
    for line in text.splitlines():
        clean = re.sub(r"\s+", " ", line).strip()
        if clean:
            lines.append(clean)
    return lines


def parse_last_updated(home_html: str) -> str | None:
    m = re.search(r"Last\s+Updated:\s*([^<\n]+)", home_html, flags=re.I)
    return m.group(1).strip() if m else None


def fetch_section(partial_name: str, label: str, count: int | None = None) -> SectionResult:
    payload = urlencode({"name": partial_name}).encode("utf-8")
    fragment = fetch_text(GETDATA_URL, data=payload)
    lines = html_to_lines(fragment)

    # remove título repetido (ex: "Advisories") se vier na 1a linha
    if lines and lines[0].lower() == label.lower():
        lines = lines[1:]

    return SectionResult(section=label, count=count if count is not None else 0, lines=lines)


def parse_counters(home_html: str) -> Dict[str, int]:
    patterns = {
        "advisories": r'id="advisoriesButton"[\s\S]*?<span[^>]*>(\d+)</span>',
        "warnings": r'id="warningsButton"[\s\S]*?<span[^>]*>(\d+)</span>',
        "closures": r'id="closuresButton"[\s\S]*?<span[^>]*>(\d+)</span>',
    }
    out: Dict[str, int] = {}
    for key, pattern in patterns.items():
        m = re.search(pattern, home_html, flags=re.I)
        out[key] = int(m.group(1)) if m else 0
    return out


def scrape() -> BeachStatus:
    home_html = fetch_text(BASE_URL)
    last_updated = parse_last_updated(home_html)
    counters = parse_counters(home_html)

    advisories = fetch_section(PARTIALS["advisories"], "Advisories", counters.get("advisories"))
    warnings = fetch_section(PARTIALS["warnings"], "Warnings", counters.get("warnings"))
    closures = fetch_section(PARTIALS["closures"], "Closures", counters.get("closures"))

    return BeachStatus(
        source=BASE_URL,
        last_updated=last_updated,
        advisories=advisories,
        warnings=warnings,
        closures=closures,
    )


def format_human(data: BeachStatus) -> str:
    out: List[str] = []
    out.append(f"Fonte: {data.source}")
    out.append(f"Last Updated: {data.last_updated or 'não encontrado'}")

    for sec in [data.advisories, data.warnings, data.closures]:
        out.append("")
        out.append(f"{sec.section}: {sec.count}")
        if sec.lines:
            for line in sec.lines:
                out.append(f"- {line}")
        else:
            out.append("- (sem itens)")

    return "\n".join(out)


def main() -> int:
    parser = argparse.ArgumentParser(description="Scraper de condições de água de San Diego")
    parser.add_argument("--json", action="store_true", help="Saída em JSON")
    args = parser.parse_args()

    try:
        data = scrape()
    except Exception as e:
        print(f"Erro ao coletar dados: {e}", file=sys.stderr)
        return 1

    if args.json:
        print(json.dumps(asdict(data), ensure_ascii=False, indent=2))
    else:
        print(format_human(data))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
