#!/usr/bin/env python3
"""Spec source-archive encoding & integrity gate.

Guards against the failure mode where an inbound spec is ingested via a
mis-encoded (mojibake) attachment and a DERIVED summary is archived in place of
the real source bytes.

For each archive that ships a `source_specs/source_manifest.json`, this checks:

  1. every listed source file exists (a missing one fails);
  2. each decodes as STRICT UTF-8 (decode error fails);
  3. no U+FFFD replacement character is present;
  4. byte length and SHA-256 match the manifest;
  5. the derived index (00_source_specs_index.md), if present, carries the
     "DERIVED" / non-canonical marker so it cannot masquerade as source-of-truth.

Usage:
  python3 scripts/check_spec_source_archive.py [ARCHIVE_DIR ...]
  # default: scan docs/ for any source_specs/source_manifest.json

Exit 0 if all pass; exit 1 with a list of offenses otherwise.
"""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
DERIVED_MARKER = "DERIVED"  # must appear in 00_source_specs_index.md


def find_manifests(args: list[str]) -> list[Path]:
    if args:
        out = []
        for a in args:
            p = Path(a)
            if p.is_dir():
                m = p / "source_specs" / "source_manifest.json"
                if m.exists():
                    out.append(m)
                else:
                    print(f"  [FAIL] {p}: no source_specs/source_manifest.json")
                    out.append(None)  # sentinel → forces failure
            elif p.name == "source_manifest.json":
                out.append(p)
        return out
    return sorted((REPO_ROOT / "docs").rglob("source_specs/source_manifest.json"))


def check_manifest(manifest_path: Path) -> list[str]:
    offenses: list[str] = []
    base = manifest_path.parent.parent  # the archive dir
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except Exception as e:  # noqa: BLE001
        return [f"{manifest_path}: manifest not readable/UTF-8: {e}"]

    sources = manifest.get("sources", [])
    if not sources:
        offenses.append(f"{manifest_path}: manifest lists no sources")

    for entry in sources:
        rel = entry.get("path")
        f = base / rel
        if not f.exists():
            offenses.append(f"{rel}: MISSING source file (expected full UTF-8 original)")
            continue
        raw = f.read_bytes()
        try:
            text = raw.decode("utf-8")  # strict
        except UnicodeDecodeError as e:
            offenses.append(f"{rel}: not strict UTF-8 ({e})")
            continue
        if "�" in text:
            offenses.append(f"{rel}: contains U+FFFD replacement character (mojibake)")
        if entry.get("bytes") is not None and len(raw) != entry["bytes"]:
            offenses.append(f"{rel}: byte length {len(raw)} != manifest {entry['bytes']}")
        digest = hashlib.sha256(raw).hexdigest()
        if entry.get("sha256") and digest != entry["sha256"]:
            offenses.append(f"{rel}: sha256 {digest} != manifest {entry['sha256']}")
        if not entry.get("sourceOfTruth"):
            offenses.append(f"{rel}: manifest entry must set sourceOfTruth=true")

    # derived index must declare itself derived, not canonical
    idx = base / "00_source_specs_index.md"
    if idx.exists():
        if DERIVED_MARKER not in idx.read_text(encoding="utf-8"):
            offenses.append(
                "00_source_specs_index.md: must carry a 'DERIVED' / non-canonical "
                "marker so it cannot masquerade as the source of truth"
            )
    return offenses


def main(argv: list[str]) -> int:
    manifests = find_manifests(argv[1:])
    if not manifests:
        print("No source_specs/source_manifest.json found — nothing to verify.")
        return 0
    all_offenses: list[str] = []
    checked = 0
    for m in manifests:
        if m is None:
            all_offenses.append("missing source_manifest.json in a requested archive dir")
            continue
        checked += 1
        all_offenses.extend(check_manifest(m))
    if all_offenses:
        print("Spec source-archive gate: FAIL")
        for o in all_offenses:
            print(f"  - {o}")
        return 1
    print(f"Spec source-archive gate: OK ({checked} archive(s) verified)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
