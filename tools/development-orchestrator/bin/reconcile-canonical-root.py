#!/usr/bin/env python3
"""Create a machine-readable, non-destructive canonical-root reconciliation inventory."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path


SOURCE_ROOT = Path(__file__).resolve().parents[3]


def git_status(repo_root: Path) -> list[tuple[str, str]]:
    result = subprocess.run(
        ["git", "-C", str(repo_root), "status", "--porcelain=v1", "-z"],
        check=True, capture_output=True,
    )
    entries = result.stdout.decode().split("\0")
    return [(entry[:2], entry[3:]) for entry in entries if entry]


def classify(path: str, manifest: dict) -> tuple[str, str]:
    for rule in manifest.get("rules", []):
        if re.search(rule["pattern"], path):
            return rule["classification"], rule["id"]
    return "unmatched", "unmatched"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", type=Path, default=SOURCE_ROOT)
    parser.add_argument("--output", type=Path, help="write JSON inventory to this path")
    args = parser.parse_args()
    repo_root = args.repo_root.resolve()
    manifest_path = repo_root / "repo-classification.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    changes = []
    for status, path in git_status(repo_root):
        classification, rule_id = classify(path, manifest)
        action = "preserve_runtime_state" if path.startswith(".orchestrator/") else "review_and_anchor"
        changes.append({"path": path, "status": status, "classification": classification, "rule_id": rule_id, "recommended_action": action})
    payload = {"schema_version": 1, "generated_at": datetime.now(timezone.utc).isoformat(), "repo_root": str(repo_root), "change_count": len(changes), "changes": changes}
    rendered = json.dumps(payload, indent=2, sort_keys=True) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered, encoding="utf-8")
    else:
        print(rendered, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
