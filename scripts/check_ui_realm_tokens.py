#!/usr/bin/env python3
"""UI realm-token guard.

Catches the recurring failure where a web app invents its own visual palette by
hardcoding raw hex into its theme custom properties instead of consuming the
canonical `@drts/ui-tokens` realm colors (which mirror the human design canvas in
`docs/05-ui/drts-design-canvas/`). Example caught: tenant-console shipping
`--accent: #b85c38` (terracotta) when the `tenant` realm is teal `#0F766E`.

It builds an allowlist of every hex defined in `packages/ui-tokens/src/*` and then
flags brand/realm theme variables in `apps/*-web/**/globals.css` whose value is a
raw hex NOT in that allowlist. Neutral surfaces (white/black) are tolerated.

Report-only by default (prints findings, exit 0); pass `--enforce` to exit 1 on
any finding — supports staged report-only to enforce rollout.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UI_TOKENS_DIR = ROOT / "packages" / "ui-tokens" / "src"

HEX_RE = re.compile(r"#[0-9a-fA-F]{6}\b")
# Theme custom properties that define brand/realm identity — these MUST come from
# ui-tokens, not a hand-picked hex. Neutral util vars (gray/line/shadow) are skipped.
BRAND_VAR_RE = re.compile(
    r"--(?:accent|accent-soft|shell|brand|primary|secondary|bg|surface|panel|fg|text)\b[^:]*:\s*([^;]+);",
    re.IGNORECASE,
)
# Hexes always acceptable regardless of tokens (pure neutrals).
NEUTRAL_ALLOW = {"#ffffff", "#000000"}


def ui_tokens_allowlist() -> set[str]:
    allow: set[str] = set(NEUTRAL_ALLOW)
    for path in sorted(UI_TOKENS_DIR.glob("*.ts")):
        for hex_value in HEX_RE.findall(path.read_text(encoding="utf-8")):
            allow.add(hex_value.lower())
    return allow


def web_app_theme_files() -> list[Path]:
    apps_dir = ROOT / "apps"
    files: list[Path] = []
    for app in sorted(apps_dir.glob("*-web")):
        files.extend(sorted(app.rglob("globals.css")))
    return files


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--enforce", action="store_true", help="exit 1 on any finding")
    args = parser.parse_args()

    allow = ui_tokens_allowlist()
    findings: list[str] = []

    for css in web_app_theme_files():
        rel = css.relative_to(ROOT)
        for raw_line in css.read_text(encoding="utf-8").splitlines():
            match = BRAND_VAR_RE.search(raw_line)
            if not match:
                continue
            for hex_value in HEX_RE.findall(match.group(1)):
                if hex_value.lower() not in allow:
                    findings.append(f"{rel}: `{raw_line.strip()}` -> {hex_value} is not a @drts/ui-tokens realm color")

    if not findings:
        print(f"ui-realm-token guard: OK ({len(allow)} canonical hexes; no off-token brand colors)")
        return 0

    print("ui-realm-token guard: found hardcoded brand colors NOT sourced from @drts/ui-tokens:")
    for finding in findings:
        print(f"  - {finding}")
    print(
        "\nFix: use the app's realm tokens from `@drts/ui-tokens` (see packages/ui-tokens/src/realms.ts)\n"
        "and the design canvas in docs/05-ui/drts-design-canvas/. Do not hand-pick a palette."
    )
    return 1 if args.enforce else 0


if __name__ == "__main__":
    raise SystemExit(main())
