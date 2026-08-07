#!/usr/bin/env python3
"""Register the Referral Embed Stage 1 recovery wave for supervisor dispatch.

This script only records canonical execution tasks. The continuously running
supervisor decides when dependencies are ready and dispatches auto workers.

Usage:
    AI_NAME=Codex python3 scripts/dispatch-referral-embed-stage1-recovery-20260801.py
"""

from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path


REPO = Path(__file__).resolve().parents[1]
PHASE = "referral-embed-stage1-recovery-20260801"
PLANNING_REF = (
    "docs/03-runbooks/referral-embed-stage1-recovery-execution-tasks-20260801.md"
)
INTER_ASSIGN_SLEEP_SECONDS = 3

# id, owner hint, reviewer, title, summary, dependencies, artifacts, acceptance
TASKS = [
    (
        "REF-DOC-001",
        "Codex2",
        "Gemini2",
        "Restore and lock Referral Embed design + functional source chain",
        "Restore the deleted 2026-06-13 functional spec and screen requirements byte-exact from their original commits; lock the uploaded Passenger Embed HTML/JSX as visual authority; document the later standalone-site topology override and the 15 Phase 1 + 4 Phase 2 registry. Do not implement UI in this task.",
        "",
        "docs/05-ui/community-app-referral-channel-spec-20260613.md,docs/05-ui/community-app-referral-channel-screen-requirements-20260613.md,docs/03-runbooks/referral-embed-stage1-recovery-execution-tasks-20260801.md,apps/referral-embed-web/README.md",
        "Both functional docs are byte-exact to original commits; all mandatory source paths resolve; authority/supersession note is explicit; docs checks and git diff --check pass",
    ),
    (
        "UI-CANVAS-REF-001",
        "Codex",
        "Codex2",
        "Passenger Embed exact 15-page HTML canvas parity + Phase 2 retention",
        "Read Passenger Embed.html and every loaded JSX dependency before editing. Rebuild referral-embed-web to the exact 392x812 core-15 compositions, retain four Phase 2 states, consume generic authority branding, and remove all production debug/test navigation. The source HTML, not chat screenshots, is the visual authority. Production state is session-driven; typed previews are demo/test-only.",
        "REF-DOC-001",
        "apps/referral-embed-web/components/passenger-embed.tsx,apps/referral-embed-web/app/globals.css,apps/referral-embed-web/lib/embed-fixtures.ts,apps/referral-embed-web/lib/embed-context.ts,apps/referral-embed-web/lib/translations.ts,tests/e2e/",
        "15 HTML-derived runtime screenshots reviewed at 392x812; blue #1A45AD host chrome + Yuhe #0F766E brand/CTA; state=handoff is artboard 1; no production debug controls or slug hardcoding; lint/typecheck/build/a11y/visual tests pass",
    ),
    (
        "BE-REF-HANDOFF-001",
        "Codex2",
        "Gemini2",
        "Durable S2S single-use handoff, consent ledger, entry-host binding, and HttpOnly session",
        "Implement the DRTS-owned server-to-server handoff defined by the recovered spec. Long-lived partner credentials stay backend-only. Issue a two-minute single-use artifact; bind exact slug/host/user/consent; consume atomically in durable storage; establish Secure HttpOnly session; activate persistent identity only after exact trip.manage/pii.trip/identity.bind consent; keep entry-scoped CSP fail-closed and block legacy credential query. Review checkpoint 949e40ff and interrupted /tmp/drts-referral-stage1-actions.20260801 before reuse.",
        "REF-DOC-001",
        "packages/contracts/src/,apps/api/src/modules/tenant-partner/,infra/migrations/,apps/referral-embed-web/app/api/referral/session/,apps/referral-embed-web/lib/embed-partner-session.ts,apps/referral-embed-web/lib/embed-security.ts,apps/referral-embed-web/middleware.ts,tests/",
        "No browser credential URLs; Postgres atomic replay/expiry/wrong-host tests; exact versioned consent bundle recorded before identity activation; Secure HttpOnly session; production query spoof ignored; cross-entry 403; contract/API/app lint/typecheck/build and security E2E pass",
    ),
    (
        "BE-REF-PASSENGER-001",
        "Gemini2",
        "Codex2",
        "Referral passenger booking, recovery, history, cancel, receipt, and rating authority",
        "Complete real partner-passenger lifecycle contracts and endpoints. Authorize by referral bearer passenger+entry+tenant; wire Referral Embed server routes; make create/cancel/rating idempotent; expose PII-masked history/receipt; remove production 501 placeholders and fixture-backed success. Reuse owned-mobility services only with explicit passenger/partner isolation guards.",
        "BE-REF-HANDOFF-001",
        "packages/contracts/src/,apps/api/src/modules/owned-mobility/,apps/referral-embed-web/app/api/referral/,apps/referral-embed-web/lib/embed-booking-api.ts,tests/",
        "Handoff-consent-create-active-reload-history-receipt-cancel/completion-rating flows pass; cross-passenger/cross-partner/forged-tenant fail; retries do not duplicate; PII mask/download ownership pass; no production fixture success or 501 capability routes; lint/typecheck/build pass",
    ),
    (
        "E2E-REF-EMBED-001",
        "Codex",
        "Gemini2",
        "Independent Referral Embed 15+4 visual, lifecycle, and security acceptance",
        "Independently compare runtime against Passenger Embed.html, not screenshots supplied in chat. Commit 19-page screenshot inventory and cited comparison; run real session lifecycle without query forcing; verify iframe/CSP, cross-entry denial, expired/replayed handoff, consent, idempotency, reload persistence, cancel/completion, history, receipt, rating, and URL/log secret/PII scan.",
        "UI-CANVAS-REF-001,BE-REF-PASSENGER-001",
        "tests/e2e/,support/sidecars/E2E-REF-EMBED-001/",
        "19-page visual report committed; core-15 visual/content assertions pass; real lifecycle passes with no fixture success; security and secret/PII scans pass; focused unit/API/app lint/typecheck/build pass; cited reviewer decision recorded",
    ),
    (
        "REL-REF-EMBED-001",
        "Codex2",
        "Gemini2",
        "Integrate, review, merge, deploy dev, and prove formal Referral Embed live",
        "Integrate only review-approved commits on current origin/dev, open PR, wait for required CI and review, merge, publish once, deploy dev once, and verify refer.smarttransport.tw/embed/yuhe-residence plus authorized/unauthorized iframe behavior. Do not restart Partner Booking or Concierge. Record PR/CI/merge/tag/deploy/live SHA evidence in machine truth.",
        "E2E-REF-EMBED-001",
        ".github/workflows/,docs/02-architecture/app-entry-url-index-20260616.md,support/sidecars/REL-REF-EMBED-001/",
        "PR approved and merged; exact reviewed tree deployed; live formal URL is session-driven and canvas-correct; authorized iframe passes; unauthorized/cross-entry fail; paused services stay down; INTEGRATION_STATUS=dev_deployed with PR/run/SHA evidence",
    ),
]


def register(task: tuple[str, ...]) -> bool:
    task_id, owner, reviewer, title, summary, deps, artifacts, acceptance = task
    env = os.environ.copy()
    env.setdefault("AI_NAME", "Codex")
    env["TASK_TITLE"] = title
    env["TASK_SUMMARY_ZH"] = f"[依據 {PLANNING_REF}] {summary}"
    env["TASK_PHASE"] = PHASE
    env["TASK_DEPENDS_ON"] = deps
    env["TASK_ARTIFACTS"] = artifacts
    env["TASK_ACCEPTANCE"] = acceptance
    env["TASK_PLANNING_REF"] = PLANNING_REF
    result = subprocess.run(
        [
            "bash",
            "scripts/ai-status.sh",
            "assign",
            task_id,
            owner,
            reviewer,
            title,
        ],
        env=env,
        cwd=REPO,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        sys.stderr.write(f"FAILED {task_id}: {result.stderr}\n")
        return False
    dep_note = f"deps=[{deps}]" if deps else "deps=[]"
    print(f"{task_id:24s} {owner:>8s} -> {reviewer:>8s} | {dep_note}")
    return True


def main() -> int:
    print(
        f"Registering {len(TASKS)} tasks for supervisor-managed execution\n"
        f"Phase: {PHASE}\nPlanning ref: {PLANNING_REF}\n"
    )
    registered = 0
    for index, task in enumerate(TASKS):
        registered += int(register(task))
        if index < len(TASKS) - 1:
            time.sleep(INTER_ASSIGN_SLEEP_SECONDS)
    print(
        f"Registered {registered}/{len(TASKS)}. "
        "The supervisor will dispatch ready auto workers on its next scan."
    )
    return 0 if registered == len(TASKS) else 1


if __name__ == "__main__":
    sys.exit(main())
