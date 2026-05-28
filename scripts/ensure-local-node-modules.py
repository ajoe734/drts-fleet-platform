#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
MODULES_YAML = Path("node_modules/.modules.yaml")


@dataclass
class HealthCheck:
    healthy: bool
    status: str
    details: list[str]


def _parse_virtual_store_dir(modules_yaml: Path) -> str | None:
    try:
        text = modules_yaml.read_text(encoding="utf-8")
    except FileNotFoundError:
        return None
    for pattern in (
        re.compile(r'"virtualStoreDir"\s*:\s*"([^"]+)"'),
        re.compile(r"virtualStoreDir:\s*([^\n]+)"),
    ):
        match = pattern.search(text)
        if match:
            return match.group(1).strip().strip('"').strip("'")
    return None


def _candidate_pnpm_symlinks(root: Path) -> list[Path]:
    node_modules = root / "node_modules"
    if not node_modules.exists():
        return []
    candidates: list[Path] = []
    for entry in node_modules.iterdir():
        if entry.name == ".pnpm":
            continue
        if entry.is_symlink():
            candidates.append(entry)
            continue
        if entry.is_dir() and entry.name.startswith("@"):
            for scoped_entry in entry.iterdir():
                if scoped_entry.is_symlink():
                    candidates.append(scoped_entry)
    return candidates


def _external_virtual_store_links(root: Path) -> list[str]:
    local_virtual_store = (root / "node_modules/.pnpm").resolve(strict=False)
    offenders: list[str] = []
    for candidate in _candidate_pnpm_symlinks(root):
        try:
            resolved = candidate.resolve(strict=False)
        except OSError:
            continue
        if ".pnpm" not in resolved.parts:
            continue
        try:
            resolved.relative_to(local_virtual_store)
        except ValueError:
            offenders.append(f"{candidate.relative_to(root)} -> {resolved}")
    return offenders


def check_node_modules_health(root: Path) -> HealthCheck:
    node_modules = root / "node_modules"
    modules_yaml = root / MODULES_YAML
    if not node_modules.exists():
        return HealthCheck(False, "missing", ["node_modules directory is missing"])
    if not modules_yaml.exists():
        return HealthCheck(False, "missing", [f"{MODULES_YAML} is missing"])

    details: list[str] = []
    virtual_store_dir = _parse_virtual_store_dir(modules_yaml)
    if virtual_store_dir != ".pnpm":
        details.append(
            "node_modules/.modules.yaml points virtualStoreDir at "
            f"{virtual_store_dir or '<missing>'} instead of .pnpm"
        )

    external_links = _external_virtual_store_links(root)
    if external_links:
        preview = "; ".join(external_links[:5])
        suffix = f" (+{len(external_links) - 5} more)" if len(external_links) > 5 else ""
        details.append(f"node_modules symlinks escape the local virtual store: {preview}{suffix}")

    if details:
        return HealthCheck(False, "polluted", details)
    return HealthCheck(True, "healthy", ["node_modules uses the local .pnpm virtual store"])


def repair_node_modules(root: Path) -> int:
    env = dict(os.environ)
    env["CI"] = "true"
    result = subprocess.run(
        ["pnpm", "install", "--frozen-lockfile"],
        cwd=root,
        env=env,
        check=False,
    )
    return result.returncode


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Check or repair canonical-root node_modules so its virtual store stays local."
    )
    parser.add_argument(
        "mode",
        choices=("check", "repair"),
        nargs="?",
        default="check",
        help="check reports drift; repair re-runs `CI=true pnpm install --frozen-lockfile` when unhealthy",
    )
    parser.add_argument(
        "--root",
        default=str(ROOT),
        help="workspace root to inspect (defaults to this repository root)",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    root = Path(args.root).resolve()

    health = check_node_modules_health(root)
    if health.healthy:
        print(f"[node-modules-health] OK: {health.details[0]}")
        return 0

    for detail in health.details:
        print(f"[node-modules-health] WARN: {detail}", file=sys.stderr)

    if args.mode == "check":
        return 1

    print("[node-modules-health] Repairing with `CI=true pnpm install --frozen-lockfile`...", file=sys.stderr)
    exit_code = repair_node_modules(root)
    if exit_code != 0:
        print(f"[node-modules-health] ERROR: pnpm install failed with exit code {exit_code}", file=sys.stderr)
        return exit_code

    healed = check_node_modules_health(root)
    if not healed.healthy:
        for detail in healed.details:
            print(f"[node-modules-health] ERROR: {detail}", file=sys.stderr)
        return 1

    print(f"[node-modules-health] OK: {healed.details[0]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
