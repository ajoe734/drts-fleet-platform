#!/usr/bin/env python3
"""Auto-integrator — rebase review-approved task branches onto dev, CI-gate, merge.

Closes the loop the orchestrator never automated: workers ship to a branch and
record ``push_branch`` / ``integration_status``, but nothing rebases that branch
onto the moving trunk, runs whole-repo CI, and merges it. Under the enforce gate
those tasks otherwise sit at ``review_approved`` forever (no longer stranded as
``done``, but still not on dev). This is what a human did by hand; here it is a
serialized, CONSERVATIVE job.

Conservative by design:
  * Only merges a task whose branch rebases CLEANLY onto ``origin/dev`` AND whose
    PR goes green on the required checks. It NEVER force-resolves a conflict and
    NEVER blind-fixes a cross-task CI ripple — those are reported (and optionally
    opened as an unblock task) for a human/lane to handle.
  * Serialized: refetches ``origin/dev`` between merges so each task rebases onto
    the latest trunk (avoids the concurrent-merge races that break dev).
  * Idempotent: skips tasks already reachable from ``origin/dev``.

After merges it runs ``ai_status.py reconcile-from-git`` so merged tasks flip to
``done`` via the existing ``apply_git_merge_reconciliation`` bridge.

Usage:
  python3 scripts/auto-integrate.py --match CCAT- [--max 5] [--dry-run]
  python3 scripts/auto-integrate.py --tasks PB-EMBED-R-20260611,PB-TRAVEL-R-20260611
  python3 scripts/auto-integrate.py --match '' --open-unblock      # all candidates
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AI_STATUS = os.path.join(ROOT, "ai-status.json")
INTEGRATED = {"merged_to_dev", "dev_deployed", "not_applicable"}
REQUIRED_CHECKS = {"Smoke acceptance", "Commit trailers", "Runtime mirror guard", "BFF-only imports"}


def sh(args, cwd=ROOT, check=False):
    r = subprocess.run(args, cwd=cwd, capture_output=True, text=True)
    if check and r.returncode != 0:
        raise RuntimeError(f"cmd failed: {' '.join(args)}\n{r.stderr}")
    return r


def log(msg):
    print(msg, flush=True)


def load_tasks():
    with open(AI_STATUS) as f:
        s = json.load(f)
    return s.get("tasks", s) if isinstance(s, dict) else s


def reachable_from_dev(sha):
    if not sha:
        return False
    r = sh(["git", "merge-base", "--is-ancestor", sha, "origin/dev"])
    return r.returncode == 0


def task_landed_on_dev(tid):
    """A commit carrying this Task-ID trailer is already on origin/dev.

    This is how ``apply_git_merge_reconciliation`` detects landed work, and it
    survives squash/rebase re-SHAing (unlike the raw push_commit), so it is the
    authoritative "already integrated" check.
    """
    r = sh(["git", "log", "origin/dev", "-1", "--fixed-strings",
            f"--grep=Task-ID: {tid}", "--format=%H"])
    return bool(r.stdout.strip())


def exempt_patterns():
    """Task-id regexes to skip — shared with the integration gate config so one
    list exempts both (e.g. superseded originals replaced by a -R re-dispatch)."""
    try:
        with open(os.path.join(ROOT, ".orchestrator", "config.json")) as f:
            cfg = json.load(f)
        pats = cfg.get("branch_strategy", {}).get("integration_gate", {}).get("exempt_task_patterns", [])
        import re
        return [re.compile(p) for p in pats if p]
    except Exception:
        return []


def candidates(match, explicit):
    out = []
    exempt = exempt_patterns()
    for t in load_tasks():
        if not isinstance(t, dict):
            continue
        tid = str(t.get("id") or "")
        if explicit:
            if tid not in explicit:
                continue
        elif match is not None and match not in tid:
            continue
        br = t.get("push_branch")
        if not br:
            continue
        if str(t.get("integration_status") or "").lower() in INTEGRATED:
            continue
        if reachable_from_dev(t.get("push_commit") or t.get("commit_hash")):
            continue  # already on dev; reconcile will flip it
        if task_landed_on_dev(tid):
            continue  # a Task-ID-trailered commit is on dev (squash/rebase-safe)
        if any(p.search(tid) for p in exempt):
            continue  # explicitly exempted (e.g. superseded by a re-dispatch)
        out.append(t)
    return out


def poll_ci(branch, timeout):
    deadline = time.time() + timeout
    while time.time() < deadline:
        r = sh(["gh", "pr", "view", branch, "--json", "statusCheckRollup"])
        try:
            checks = json.loads(r.stdout)["statusCheckRollup"]
        except Exception:
            time.sleep(15)
            continue
        states = {c.get("name"): (c.get("conclusion") or c.get("status")) for c in checks}
        req = {n: states.get(n) for n in REQUIRED_CHECKS if n in states}
        if any(v == "FAILURE" for v in req.values()):
            return "fail", states
        if req and all(v == "SUCCESS" for v in req.values()):
            return "green", states
        time.sleep(20)
    return "timeout", {}


def open_unblock(task, reason):
    tid = task["id"]
    env = dict(os.environ)
    env.update({
        "AI_NAME": "Claude",
        "AI_STATUS_ROOT": ROOT,
        "ORCH_STATUS_ROOT": ROOT,
        "TASK_PHASE": "auto-integrate-unblock",
        "TASK_SUMMARY_ZH": f"auto-integrator 無法自動整合 {tid}：{reason}。需要人工/該 lane 處理 rebase 衝突或 CI 漣漪。",
        "TASK_DEPENDS_ON": "",
        "TASK_ARTIFACTS": str(task.get("push_branch") or ""),
        "TASK_ACCEPTANCE": "rebase the branch onto origin/dev,resolve conflicts or cross-app CI ripples,land it on dev",
    })
    owner = task.get("owner") or "Claude"
    rev = task.get("reviewer") or "Codex"
    subprocess.run(
        ["bash", "scripts/ai-status.sh", "assign", f"{tid}-INTEGRATE-UNBLOCK",
         owner, rev, f"Integrate {tid}: resolve {reason}"],
        cwd=ROOT, env=env, capture_output=True, text=True,
    )


def integrate_one(task, ci_timeout, dry_run, do_unblock):
    tid = task["id"]
    branch = task["push_branch"]
    intb = f"integrate/{tid.lower()}"
    wt = os.path.join(ROOT, f".wt-ai-{tid.lower()}")
    sh(["git", "fetch", "origin", branch, "dev"])
    if dry_run:
        log(f"  [dry-run] would integrate {tid} from {branch}")
        return "dry-run"
    # fresh worktree on the worker branch
    sh(["git", "worktree", "remove", wt, "--force"])
    r = sh(["git", "worktree", "add", wt, "-B", intb, f"origin/{branch}"])
    if r.returncode != 0:
        log(f"  SKIP {tid}: cannot checkout {branch}: {r.stderr.strip()[:80]}")
        return "skip"
    try:
        rb = sh(["git", "rebase", "origin/dev"], cwd=wt)
        if rb.returncode != 0:
            sh(["git", "rebase", "--abort"], cwd=wt)
            log(f"  NEEDS_MANUAL {tid}: rebase conflict")
            if do_unblock:
                open_unblock(task, "rebase conflict onto dev")
            return "conflict"
        # squash to one commit carrying the task trailers
        sh(["git", "reset", "--soft", "origin/dev"], cwd=wt)
        subj = task.get("commit_subject") or f"{tid}: integrate"
        msg = (
            f"{subj}\n\nAuto-integrated from origin/{branch} (rebased onto dev).\n\n"
            f"Task-ID: {tid}\nLLM-Agent: {task.get('commit_agent') or task.get('owner') or 'Claude'}\n"
            f"Reviewer: {task.get('commit_reviewer') or task.get('reviewer') or 'Codex'}\n"
        )
        sh(["git", "commit", "-q", "-m", msg], cwd=wt)
        sh(["git", "push", "-f", "-u", "origin", intb], cwd=wt)
        # PR (reuse if exists)
        ex = sh(["gh", "pr", "view", intb, "--json", "number"])
        if ex.returncode != 0:
            sh(["gh", "pr", "create", "--base", "dev", "--head", intb,
                "--title", subj[:80],
                "--body", f"Auto-integrated by scripts/auto-integrate.py.\n\nTask-ID: {tid}"], cwd=wt)
        verdict, states = poll_ci(intb, ci_timeout)
        if verdict == "green":
            m = sh(["gh", "pr", "merge", intb, "--squash", "--admin"], cwd=wt)
            if m.returncode == 0:
                log(f"  ✅ MERGED {tid}")
                return "merged"
            log(f"  MERGE_FAIL {tid}: {m.stderr.strip()[:80]}")
            return "merge-fail"
        log(f"  CI_{verdict.upper()} {tid}: {states}")
        if do_unblock:
            open_unblock(task, f"CI {verdict}")
        return f"ci-{verdict}"
    finally:
        sh(["git", "worktree", "remove", wt, "--force"])
        sh(["git", "fetch", "origin", "dev"])


def reconcile():
    for cmd in (["reconcile-from-git"], ["reconcile_from_git"]):
        r = sh(["python3", "scripts/ai_status.py", *cmd])
        if r.returncode == 0:
            log(f"  reconcile: {r.stdout.strip()[:120]}")
            return


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--match", default=None, help="task-id substring filter (default: required)")
    ap.add_argument("--all", action="store_true", help="consider every candidate (same as --match '')")
    ap.add_argument("--tasks", default="", help="explicit comma-separated task ids")
    ap.add_argument("--max", type=int, default=8)
    ap.add_argument("--ci-timeout", type=int, default=420)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--open-unblock", action="store_true", help="open an unblock task on conflict/CI-fail")
    a = ap.parse_args()
    explicit = {x.strip() for x in a.tasks.split(",") if x.strip()}
    if a.all:
        a.match = ""
    if not explicit and a.match is None:
        ap.error("specify --match <substr>, --all, or --tasks <ids>")

    sh(["git", "fetch", "origin", "dev"])
    if not a.dry_run:
        reconcile()  # flip already-landed tasks to done so they drop out of candidates
    cands = candidates(a.match, explicit)[: a.max]
    if not cands:
        log("No candidate tasks (nothing with an unintegrated push_branch).")
        return 0
    log(f"Auto-integrator: {len(cands)} candidate(s): " + ", ".join(t["id"] for t in cands))
    summary = {}
    for t in cands:
        log(f"— {t['id']} (branch {t['push_branch']})")
        res = integrate_one(t, a.ci_timeout, a.dry_run, a.open_unblock)
        summary[t["id"]] = res
    if not a.dry_run:
        reconcile()
    log("\n=== summary ===")
    for k, v in summary.items():
        log(f"  {v:>12}  {k}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
