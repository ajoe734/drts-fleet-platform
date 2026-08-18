#!/usr/bin/env python3
"""L1 product-truth edit gate.

`SD-DP-20260422-003` reserves rewrites of the L1 files to a controlled design
revision that a human has accepted, and lists "unrestricted engineer edits to L1
product-truth files" as out of scope. Nothing enforced that. On 2026-08-17 an
execution wave amended `phase1_service_contracts_v1.md` three times and
`phase1_prd_detailed_v1.md` once in a single day -- against a repository baseline
of two edits in total -- and nobody noticed until a later audit went looking.
Each edit was accurate; that is not the point. A wave whose purpose is measuring
the distance between specification and implementation must not be able to close
that distance by moving the specification.

This gate makes an L1 edit impossible to land silently. When a change touches an
L1 file it must also carry, in the same change, a decision packet under
`docs/01-decisions/` that is accepted and that names the touched file.

Visibility is the whole design, and that is not a compromise. `docs/ops/branch-strategy.md`
section 6 sets `main` and `dev` to zero required reviewers deliberately -- the
provisioning script states the rationale as "0 approvals (CI is the gate)". A
fleet of agents is the product here, so a blocking human review is the wrong
shape of control; a CI check is the documented one, and it can be scoped to four
files where branch protection could only be repo-wide.

So this gate does not try to prove a human accepted anything. It makes an L1 edit
loud: an agent that wants to change product truth has to write an accepted
decision packet naming the file, which then shows up in audit and in the
acceptance request that asks a human the questions it raises. The human answers
once, in one message, and nothing stops running while they do.

The L1 list is read from `CANONICAL_DOCUMENT_MAP.md` rather than hardcoded, so it
cannot drift out of date the way a hand-maintained allowlist does.

Usage:
  python3 tools/ci/git/check_l1_product_truth_guard.py --base origin/dev --head HEAD

Exit 0 if clean; exit 1 with the offending files and what to do about them.
Bypass: L1_GUARD_BYPASS=1 (logged loudly; for a human-accepted controlled revision
that predates this gate).
"""
from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
from pathlib import Path

def _repo_root() -> Path:
    """The repository the gate is inspecting.

    Resolved from the caller's working directory, not from this file's location,
    so the gate examines the checkout it was invoked in. Tests rely on this to
    run it against a throwaway repo instead of the one it happens to live in.
    """
    override = os.environ.get("L1_GUARD_ROOT")
    if override:
        return Path(override).resolve()
    proc = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True, check=False
    )
    if proc.returncode == 0 and proc.stdout.strip():
        return Path(proc.stdout.strip()).resolve()
    return Path(__file__).resolve().parents[3]


REPO_ROOT = _repo_root()
MAP_FILE = "CANONICAL_DOCUMENT_MAP.md"
DECISIONS_DIR = "docs/01-decisions/"
ACCEPTED_STATUSES = {"accepted", "accepted-for-execution"}

STATUS_RE = re.compile(r"^-\s+`status`:\s*`([^`]+)`", re.MULTILINE)
BULLET_PATH_RE = re.compile(r"^-\s+`([^`]+)`\s*$", re.MULTILINE)


def run(args: list[str]) -> str:
    proc = subprocess.run(
        args, cwd=str(REPO_ROOT), capture_output=True, text=True, check=False
    )
    if proc.returncode != 0:
        raise SystemExit(
            f"[l1-guard] command failed: {' '.join(args)}\n{proc.stderr.strip()}"
        )
    return proc.stdout


def l1_files(ref: str) -> set[str]:
    """The L1 Product Truth list, read from the canonical map at `ref`.

    Hardcoding this list is the same defect class as the classification
    allowlist that broke `dev` earlier the same day: a second place to update
    that nothing reminds you about.
    """
    try:
        text = run(["git", "show", f"{ref}:{MAP_FILE}"])
    except SystemExit:
        text = (REPO_ROOT / MAP_FILE).read_text(encoding="utf-8")

    section = re.search(
        r"^###\s+L1 Product Truth\s*$(.*?)^###\s", text, re.MULTILINE | re.DOTALL
    )
    if not section:
        raise SystemExit(
            f"[l1-guard] could not find the 'L1 Product Truth' section in {MAP_FILE}. "
            "The gate refuses to pass rather than guess which files it protects."
        )
    return set(BULLET_PATH_RE.findall(section.group(1)))


def changed_files(base: str, head: str) -> list[str]:
    out = run(["git", "diff", "--name-only", f"{base}...{head}"])
    return [line for line in out.splitlines() if line.strip()]


def accepted_packets(head: str, touched: list[str]) -> dict[str, str]:
    """Accepted decision packets among the changed files, mapped to their body."""
    found: dict[str, str] = {}
    for path in touched:
        if not path.startswith(DECISIONS_DIR) or not path.endswith(".md"):
            continue
        try:
            body = run(["git", "show", f"{head}:{path}"])
        except SystemExit:
            continue
        match = STATUS_RE.search(body)
        if match and match.group(1).strip().lower() in ACCEPTED_STATUSES:
            found[path] = body
    return found


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", default="origin/dev")
    parser.add_argument("--head", default="HEAD")
    args = parser.parse_args()

    if os.environ.get("L1_GUARD_BYPASS") == "1":
        print("[l1-guard] BYPASSED via L1_GUARD_BYPASS=1. This is recorded in CI logs.")
        return 0

    protected = l1_files(args.head)
    touched = changed_files(args.base, args.head)
    offending = sorted(set(touched) & protected)
    if not offending:
        print(f"[l1-guard] OK: no L1 product-truth file changed ({len(protected)} protected).")
        return 0

    packets = accepted_packets(args.head, touched)
    unjustified = [
        path
        for path in offending
        if not any(path in body for body in packets.values())
    ]

    if not unjustified:
        print(
            f"[l1-guard] OK: {len(offending)} L1 file(s) changed, each named by an "
            f"accepted decision packet in the same change "
            f"({', '.join(sorted(packets))})."
        )
        return 0

    print("[l1-guard] FAIL: L1 product-truth file(s) changed without an accepted decision packet naming them.\n")
    for path in unjustified:
        print(f"  - {path}")
    print(
        "\n`SD-DP-20260422-003` reserves L1 rewrites for a controlled design revision a\n"
        "human has accepted. Execution tasks must not edit these files.\n\n"
        "To resolve, either:\n"
        "  1. revert the L1 change and record the proposed wording for acceptance, or\n"
        "  2. include in this same change a packet under docs/01-decisions/ whose\n"
        "     `status` is one of "
        + ", ".join(f"`{s}`" for s in sorted(ACCEPTED_STATUSES))
        + " and whose body names the file.\n\n"
        "The protected list is read from CANONICAL_DOCUMENT_MAP.md section 2, not\n"
        "hardcoded here. Changing what is protected means changing that map.\n"
    )
    if packets:
        print(
            "Decision packets present in this change but not naming the file(s) above: "
            + ", ".join(sorted(packets))
        )
    return 1


if __name__ == "__main__":
    sys.exit(main())
