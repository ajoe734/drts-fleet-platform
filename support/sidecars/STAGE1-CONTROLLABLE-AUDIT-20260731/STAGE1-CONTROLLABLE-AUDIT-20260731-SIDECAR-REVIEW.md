# STAGE1-CONTROLLABLE-AUDIT-20260731 Sidecar Review Packet

> **Parent Task:** `STAGE1-CONTROLLABLE-AUDIT-20260731`
> **Parent Owner / Reviewer:** `Codex` / `Codex2`
> **Sidecar Owner / Reviewer:** `Codex2` / `Codex`
> **Helper Kind:** `review_packet`
> **Mutates Canonical:** `false`
> **Created:** `2026-07-31`
> **Source of task truth:** `scripts/ai-status.sh show`, parent owner handoff text, parent branch commits `b149badc536665ded68a867c94f728b3a46e2e4c` and `1d7e1274a60462713089995bffaa9b23a6348392`

This packet is a support artifact only. It does not modify L1 product truth, runtime contracts, or the main Stage 1 audit output. Its purpose is to give the assigned reviewer a compact evidence map for the already-produced parent audit and to clarify where that audit currently lives.

---

## 1. Parent Task Posture

### 1.1 Shared-truth status

- As of `2026-07-31T15:07:21Z` machine truth reports parent task `STAGE1-CONTROLLABLE-AUDIT-20260731` as `done`.
- As of `2026-07-31T15:07:21Z` machine truth reports parent owner / reviewer as `Codex` / `Codex2`.
- As of `2026-07-31T15:07:48Z` machine truth reports this sidecar task `STAGE1-CONTROLLABLE-AUDIT-20260731-SIDECAR-REVIEW` as `in_progress`, with owner `Codex2` and reviewer `Codex`.
- The parent task `next` field now carries the formal closeout record: `COMMIT_HASH=1d7e1274a60462713089995bffaa9b23a6348392 COMMIT_SUBJECT=STAGE1-CONTROLLABLE-AUDIT-20260731: finalize approved controllable audit closeout PUSH_REMOTE=origin PUSH_BRANCH=codex/stage1-controllable-audit-20260731 INTEGRATION_STATUS=branch_pushed ...`.
- Parent machine truth still leaves `commit_hash` as `-` / `commit_subject` as `no-commit closeout`, so reviewers should treat the `next` field plus pushed branch state as the authoritative closeout pointer for this packet.
- Earlier parent handoff evidence in this packet is historical and remains cited with its original timestamps instead of being restated as current machine truth.

### 1.2 Why this packet is still needed after parent closeout

- The parent branch now points at the corrected audit commit `b149badc536665ded68a867c94f728b3a46e2e4c`, which superseded the earlier `48d319fe` draft.
- The parent branch subsequently added formal closeout commit `1d7e1274a60462713089995bffaa9b23a6348392`, but that closeout commit still points reviewers back to the same corrected audit artifact content.
- That audit report file is not present in this isolated sidecar worktree, so a reviewer working only from the sidecar branch would otherwise miss the primary evidence artifact.
- This packet preserves the review context without rewriting the parent report or touching canonical truth.

### 1.3 Parent artifact location

| Item | Location |
| --- | --- |
| Parent pushed branch | `origin/codex/stage1-controllable-audit-20260731` |
| Parent branch HEAD / closeout commit | `1d7e1274a60462713089995bffaa9b23a6348392` |
| Corrected audit content commit | `b149badc536665ded68a867c94f728b3a46e2e4c` |
| Audit report path on parent branch | `docs/04-uat/stage1-controllable-audit-20260731.md` |
| Parent base audited in report | `origin/dev @ 8a40248967bdc37a60a22e6d37c8ad5dca02bd41` |

`git ls-remote --heads origin 'refs/heads/codex/stage1-controllable-audit-20260731'` now confirms the remote branch currently points at `1d7e1274a60462713089995bffaa9b23a6348392`.

---

## 2. Evidence Timeline

| Time (UTC) | Source | Meaning |
| --- | --- | --- |
| `2026-07-31T14:46:46Z` | parent commit metadata | `Codex` created commit `48d319fe` titled `STAGE1-CONTROLLABLE-AUDIT-20260731: add controllable Stage 1 audit report`. |
| `2026-07-31T14:46:59Z` | parent handoff record summarized in this packet | At that timestamp the parent task was handed to review with a summary citing `origin/dev` HEAD, GitHub issues `#71-#74`, GitHub variables, latest dev deploy run, and live URL probes. |
| `2026-07-31T14:50:05Z` | `scripts/ai-status.sh show STAGE1-CONTROLLABLE-AUDIT-20260731-SIDECAR-REVIEW` | This sidecar helper was created to prepare a review packet and evidence summary. |
| `2026-07-31T14:50:35Z` | `AI_NAME=Codex2 scripts/ai-status.sh start ...` | Sidecar owner moved this helper to `in_progress` to produce the packet below. |
| `2026-07-31T14:55:04Z` | parent commit metadata | `Codex` created commit `b149badc` titled `STAGE1-CONTROLLABLE-AUDIT-20260731: correct current controllable gaps`, updating the report to remove stale findings and align with current `origin/dev`. |
| `2026-07-31T14:57:23Z` | `scripts/ai-status.sh show STAGE1-CONTROLLABLE-AUDIT-20260731` | Parent machine truth at that point reported the task in `review` with owner / reviewer `Codex` / `Codex2`. |
| `2026-07-31T14:58:04Z` | `AI_NAME=Codex2 scripts/ai-status.sh reopen ...` | Sidecar owner reopened this helper after finding the packet still described the superseded parent draft instead of the corrected report now in review. |
| `2026-07-31T15:04:06Z` | parent commit metadata | `Codex` created closeout commit `1d7e1274` titled `STAGE1-CONTROLLABLE-AUDIT-20260731: finalize approved controllable audit closeout`. |
| `2026-07-31T15:07:21Z` | `scripts/ai-status.sh show STAGE1-CONTROLLABLE-AUDIT-20260731` | Parent machine truth now reports the task as `done`, and its `next` field records closeout metadata for pushed branch `origin/codex/stage1-controllable-audit-20260731` at `1d7e1274`. |
| `2026-07-31T15:07:48Z` | `scripts/ai-status.sh show STAGE1-CONTROLLABLE-AUDIT-20260731-SIDECAR-REVIEW` | Sidecar machine truth remains `in_progress`, still assigned to `Codex2` with reviewer `Codex`, pending this packet refresh and handoff. |

The practical implication is simple: sidecar review should validate that the support packet accurately points to the parent audit evidence, distinguishes historical handoff moments from current machine truth, and does not overstate what exists on this branch.

---

## 3. Parent Audit Summary

The parent audit report is a read-only controllable-gap audit over `origin/dev`, workflow/config surfaces, and observable dev runtime/domain state. It explicitly excludes all four external gates:

- real bank / issuer live credentials
- live forwarded-platform adapter proof
- mobile store / distribution
- live CTI / recording / filing activation

### 3.1 Highest-signal findings captured by the parent report

| Priority | Gap | Parent evidence anchor | Dispatchable slices named by parent |
| --- | --- | --- | --- |
| `P1` | Governed billing / quota lifecycle truth remains internally inconsistent, and current `origin/dev` has not absorbed the known closure candidate | GitHub issues `#72`, `#73`, `#74`; candidate commit `0cfe1e03`; `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`; `tests/e2e/README.md`; `apps/api/src/modules/tenant-partner/tenant-quota-ledger.ts`; `apps/api/src/modules/owned-mobility/owned-mobility.service.ts` | `STAGE1-FIN-GOV-LIFECYCLE-001`, `STAGE1-FIN-GOV-AUDIT-001`, `STAGE1-FIN-GOV-DOC-001` |
| `P1` | Regulatory dispatch recovery exists as an explicit operator action, but the intended policy is not stated consistently in tests, UAT wording, or runbooks | GitHub issue `#71`; `docs/04-uat/phase1-uat-checklist.md` rows `OC-013` and `OC-014`; `apps/api/src/modules/regulatory-registry/regulatory-registry.service.ts`; `apps/platform-admin-web/app/fleet/page.tsx` | `STAGE1-REG-DSP-POLICY-001` |
| `P1` | Official dev URL truth is stale and lacks executable acceptance gating | `docs/03-runbooks/smarttransport-tw-custom-domains.md`; `.github/workflows/domain-mappings-dev.yml`; `.github/workflows/deploy-dev.yml`; live probes dated `2026-07-31` | `STAGE1-URL-TRUTH-001` through `STAGE1-URL-TRUTH-003` |
| `P1` | Passenger / concierge / assisted-entry topology truth has drifted across docs, deploy config, and repo vars | `docs/02-architecture/app-entry-url-index-20260616.md`; `apps/concierge-portal-web/README.md`; `apps/assisted-entry-web/README.md`; workflow/config inventory | `STAGE1-TOPOLOGY-TRUTH-001` through `STAGE1-TOPOLOGY-TRUTH-003` |
| `P2` | Runtime verification does not cover every shipped or counted web surface | `tests/e2e/dev-runtime-matrix.spec.ts`; deploy/runtime inventory | `STAGE1-RUNTIME-MATRIX-001` |
| `P2` | Release wording compresses mixed evidence states too aggressively | release gates runbook, E2E README, verification dashboard | `STAGE1-RELEASE-TRUTH-001` |

### 3.2 Parent report also records areas that were not new controllable blockers

- Driver SOS / incident routing is explicitly no longer a current controllable gap in the corrected parent report:
  - `origin/dev` uses `POST /api/driver/sos-events`, not `POST /api/incidents`, for the driver safety flow.
  - `apps/api/tests/unit/driver-sos-incident.test.ts` proves driver access to `/api/driver/sos-events` and forbids the driver realm from `POST /api/incidents` and `GET /api/incidents`.
  - `tests/e2e/E2E-017-driver-sos-incident.sh` covers the dedicated driver SOS path end to end.
- CI/deploy foundations exist and have recent successful `Deploy — Dev` runs on `2026-07-31`.
- DB migration rails exist for dev/staging/prod and are wired through workflow/job paths.
- Referral entry evidence is materially stronger than several other web surfaces, including live `refer.smarttransport.tw` redirect behavior.

---

## 4. Reviewer Checks For This Sidecar

This sidecar is ready if the reviewer can confirm all of the following:

1. The packet points at a real pushed parent branch and commit.
2. The packet does not claim the parent audit file exists in this sidecar worktree when it does not.
3. The summarized findings match the corrected parent report content at commit `b149badc`, and the parent branch HEAD `1d7e1274` is only the formal closeout wrapper around that report.
4. The packet explicitly notes the current machine-truth nuance: closeout commit metadata is recorded in the parent task `next` field even though `commit_hash` / `commit_subject` remain placeholder values.
5. The sidecar itself only adds support material under `support/sidecars/STAGE1-CONTROLLABLE-AUDIT-20260731/`.

Recommended verification commands:

```bash
AI_NAME=Codex2 scripts/ai-status.sh show STAGE1-CONTROLLABLE-AUDIT-20260731
AI_NAME=Codex2 scripts/ai-status.sh show STAGE1-CONTROLLABLE-AUDIT-20260731-SIDECAR-REVIEW
git ls-remote --heads origin 'refs/heads/codex/stage1-controllable-audit-20260731'
git show --stat --format=fuller 1d7e1274a60462713089995bffaa9b23a6348392
git show --stat --format=fuller b149badc536665ded68a867c94f728b3a46e2e4c
git show b149badc536665ded68a867c94f728b3a46e2e4c:docs/04-uat/stage1-controllable-audit-20260731.md
git diff --stat
```

What this sidecar did not do:

- it did not rerun the parent live probes
- it did not reproduce GitHub issue state independently
- it did not modify or republish the parent audit report

Those remain part of the parent task's own review scope.

---

## 5. Reviewer Handoff To Codex

The assigned reviewer for this helper should review the sidecar as a support-only packet, not as a re-audit.

Suggested review order:

1. Confirm current machine-truth state and reviewer routing for the parent and sidecar tasks.
2. Confirm the parent branch `origin/codex/stage1-controllable-audit-20260731` now exists at `1d7e1274`, and that the closeout commit still wraps corrected audit content from `b149badc`.
3. Spot-check the parent audit file at `b149badc` and verify that the gap summary in section 3 is faithful to the corrected report, especially the removal of the stale driver SOS blocker.
4. Confirm the sidecar branch only introduces this support artifact.

If those checks hold, this sidecar should be approved and handed back as a valid reviewer support packet for `STAGE1-CONTROLLABLE-AUDIT-20260731`.
