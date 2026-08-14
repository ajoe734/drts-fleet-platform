#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import subprocess
from pathlib import Path
from typing import Iterable


NON_PRODUCT_PREFIXES = (
    ".orchestrator/",
    "docs/",
    "tools/development-orchestrator/",
)


def is_non_product_path(path: str) -> bool:
    normalized = path.strip().removeprefix("./")
    return normalized.startswith(NON_PRODUCT_PREFIXES) or (
        "/" not in normalized and normalized.lower().endswith(".md")
    )


def is_orchestrator_path(path: str) -> bool:
    normalized = path.strip().removeprefix("./")
    return normalized.startswith((".orchestrator/", "tools/development-orchestrator/"))


def classify_paths(paths: Iterable[str], *, force_full: bool = False) -> dict[str, str]:
    changed = sorted({path.strip() for path in paths if path.strip()})
    if force_full or not changed:
        return {
            "scope": "full",
            "product": "true",
            "orchestrator": "true",
            "e2e": "true",
        }

    product = any(not is_non_product_path(path) for path in changed)
    orchestrator = any(is_orchestrator_path(path) for path in changed)
    if product and orchestrator:
        scope = "mixed"
    elif product:
        scope = "product"
    elif orchestrator:
        scope = "tool-only"
    else:
        scope = "non-product"

    return {
        "scope": scope,
        "product": str(product).lower(),
        "orchestrator": str(orchestrator).lower(),
        "e2e": str(product).lower(),
    }


def changed_paths(base_sha: str, head_sha: str) -> list[str]:
    if not base_sha or not head_sha:
        return []
    result = subprocess.run(
        ["git", "diff", "--name-only", "-z", base_sha, head_sha],
        check=True,
        capture_output=True,
    )
    return [path.decode("utf-8") for path in result.stdout.split(b"\0") if path]


def write_github_outputs(path: Path, outputs: dict[str, str]) -> None:
    with path.open("a", encoding="utf-8") as handle:
        for key, value in outputs.items():
            handle.write(f"{key}={value}\n")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Classify a PR diff for CI scope selection.")
    parser.add_argument("--event-name", required=True)
    parser.add_argument("--base-ref", default="")
    parser.add_argument("--base-sha", default="")
    parser.add_argument("--head-sha", default="")
    parser.add_argument("--github-output", default=os.environ.get("GITHUB_OUTPUT", ""))
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    force_full = args.event_name != "pull_request" or args.base_ref != "dev"
    paths = changed_paths(args.base_sha, args.head_sha) if not force_full else []
    outputs = classify_paths(paths, force_full=force_full)

    print(f"CI scope: {outputs['scope']}")
    for path in paths:
        print(f"- {path}")
    if not args.github_output:
        raise SystemExit("GITHUB_OUTPUT is required")
    write_github_outputs(Path(args.github_output), outputs)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
