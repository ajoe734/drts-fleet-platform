# SD-DP-20261007-002 — CI-DEPLOY-DEV-PRIVATE-CONSOLES acceptance provisioning, not a spec decision

- Date: 2026-10-07
- Owner: Claude2; reviewer: Codex
- Task: `CI-DEPLOY-DEV-PRIVATE-CONSOLES-20261005-UNBLOCK-PLANNING-DECISION`
- Parent: `CI-DEPLOY-DEV-PRIVATE-CONSOLES-20261005`
- Disposition: confirms no product/contract ambiguity requires interpretation;
  routes the parent's sole open `required_acceptance` key
  (`真實deploy-dev綠燈`) through an already-tracked, already-owned
  infrastructure-activation chain. Grants no scope cut, no credential, and no
  live acceptance.
- Audited source: parent candidate `13656eb14818edc0c9ed85358d360e2fa588c764`
  / merge `f8725220d0ee67e90b185cf0dd339b250bcb3d2b` via PR #2331; parent's
  own acceptance text (`ai-status.sh show CI-DEPLOY-DEV-PRIVATE-CONSOLES-20261005`);
  sibling helpers `CI-DEPLOY-DEV-PRIVATE-CONSOLES-20261005-UNBLOCK-HISTORY-REPAIR`
  (2026-10-06, done) and `CI-DEPLOY-DEV-PRIVATE-CONSOLES-20261005-UNBLOCK-MANUAL-UNBLOCK`
  (2026-10-07, done).

## Decision and authority

The chairman's blocked-task triage generates a `planning_decision` helper
whenever a parent sits blocked past its cooldown, on the assumption that a
missing product/contract decision is the cause. That assumption does not hold
here, for the same reason the two prior sibling helpers on this parent already
found and the parent's own acceptance text confirms:

The parent's acceptance criteria
(`一、...身分 token... 二、...移除 allUsers... 三、推薦嵌入頁與 API 維持現狀。
四、同候選SHA CI... Supervisor 觸發真實 deploy-dev...`) are fully specified and
unambiguous — four enumerated items, each with one concrete, checkable outcome.
Item 3 explicitly settles the one question that could have been a product
scope call (keep `referral-embed-web` and the API public) by stating the
answer directly; nothing in the candidate's diff or the parent's own history
reopens that call. Items 1 and 3 (identity-token wiring for the four private
consoles; same-SHA CI green plus independent Codex review) are complete and
unchanged since merge, evidenced by `candidate_sha=reviewed_sha=ci_sha=
13656eb14818edc0c9ed85358d360e2fa588c764`, `merge_sha=f8725220d0ee67e90b185cf0dd339b250bcb3d2b`,
and CI runs `37334127377`/`37334127381` (`success`).

**The missing thing is not a decision — it is a dependency chain of
infrastructure activation that is already identified, already scoped, and
already assigned to named owners.** Per the sibling `UNBLOCK-MANUAL-UNBLOCK`
helper's root-cause diagnosis (independently re-verified below), the only open
item, `真實deploy-dev綠燈`, needs a real `deploy-dev.yml` run whose full
16/16 operational-acceptance suite passes — not just the health checks — and
that suite currently fails 4/16 on `upload-url` → `503` because the shared
`DOCUMENT_ARTIFACT_STORE` dependency it now exercises (added by a sibling
task, `C125-REAL-UPLOAD-STORAGE-20261005`, after this candidate's own merge)
is not yet backed by a provisioned GCS bucket and ClamAV scanner.

## Source diagnosis and required chain (independently re-verified 2026-10-07)

| Node                                                    | Status (re-checked)                                      | Gates                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Owner / reviewer  |
| ------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `SR-GCP-SCANNER-COLD-READINESS-20261007`                | `todo`                                                   | Must land a cold-start/bounded-readiness fix for the private ClamAV scanner's CPU/startup contract in `operations/deployment/provision-dev-artifact-backends.py` / `operations/verification/verify-dev-artifact-backends.py`, with its own exact-SHA review, CI and merge, before any hosted retest. Latest `next`: an independent counterexample found the current draft's deadline/sleep-budget check lets a late scan finish after its declared deadline; needs a tightened pre-attempt/post-response deadline check before fresh handoff. | Claude / Claude2  |
| `SR-GCP-ARTIFACT-ACTIVATION-20261004`                   | `blocked` (`depends_on` includes the scanner task above) | Code candidate `0be15c0ad` (PR #2384) already merged and CI-green; remaining `required_acceptance` keys (`private_resources_iam_and_image_provenance`, `genuine_scan_storage_positive_negative`, `shared_dev_provider_activation_readback`) need the scanner fix above, then a real hosted provisioning run whose first clean attempt already returned `503 scan_engine_not_ready` (Cloud Run "ready" ≠ engine ready) — exactly what the scanner task is scoped to repair.                                                                    | Claude / Claude2  |
| `C125-REAL-UPLOAD-STORAGE-20261005`                     | `blocked`                                                | Needs the real GCS/ClamAV activation above, then its own positive/negative scan, role-ownership and readback verification against the live store, per its own acceptance text. Must not weaken the fail-closed 503 or return fake upload URLs to pass.                                                                                                                                                                                                                                                                                        | Gemini2 / Claude2 |
| `CI-DEPLOY-DEV-PRIVATE-CONSOLES-20261005` (this parent) | `blocked`                                                | Items 1 and 3 complete; item 2 (`真實deploy-dev綠燈`) needs a fresh Supervisor-dispatched `deploy-dev.yml` run against an immutable full SHA/pinned ref verified to contain the parent merge plus the scanner, artifact-activation, and upload-storage chain fixes (not the bare parent merge SHA alone — see §4 below), with the full 16/16 operational-acceptance suite green, once the chain above is live. No defect exists in this parent's own diff.                                                                                                                                                                                                                                                    | Claude2 / Codex   |

Production/contract sources read for this table: `ai-status.sh show` on all
four tasks above (fresh, 2026-10-07); `.github/workflows/deploy-dev.yml`
(identity-token steps ~1438-1480); the sibling `UNBLOCK-MANUAL-UNBLOCK`
artifact's source-level trace (`fleet-partner.controller.ts` →
`supply-document.service.ts` → `fleet-document-storage.service.ts` →
`document-artifact-runtime.config.ts`) of the `upload-url` 503 to the
unprovisioned `DOCUMENT_ARTIFACT_STORE` fail-closed default.

## Scope cut and executable follow-up

1. **No scope cut is authorized by this helper.** All four acceptance items on
   the parent stay as specified. Reducing the 16/16 operational-acceptance bar
   to health-only, or weakening the fail-closed `503` on the document store,
   would weaken an already-agreed acceptance bar and needs explicit user
   authorization, not an agent's unilateral call — consistent with both
   `SR-GCP-ARTIFACT-ACTIVATION-20261004`'s and `C125-REAL-UPLOAD-STORAGE-20261005`'s
   own `next` fields, which already state this explicitly.
2. **Claude2 (this task's own disposition):** confirms the parent's `blocked`
   status is correct and that no implementation reopen is warranted on this
   parent's own candidate; the `upload-url` failures are a dependency-surface
   change from a sibling task's later merge, not a regression here.
3. **Owners, in dependency order:** (a) Claude (reviewer Claude2) lands the
   scanner cold-readiness fix on `SR-GCP-SCANNER-COLD-READINESS-20261007`;
   (b) Claude (reviewer Claude2) completes the real GCS/IAM/scanner activation
   on `SR-GCP-ARTIFACT-ACTIVATION-20261004` once (a) merges and a fresh hosted
   retest passes engine-ready, not just Cloud-Run-ready; (c) Gemini2
   (reviewer Claude2) verifies real upload/scan/readback on
   `C125-REAL-UPLOAD-STORAGE-20261005` once (b) is live.
4. **After (a)–(c) above land:** Supervisor dispatches `deploy-dev.yml`
   against an **immutable full commit SHA (or a publish/release ref pinned to
   one)** that is verified, at dispatch time, to contain all of: this
   parent's merged fix (`f8725220d0ee67e90b185cf0dd339b250bcb3d2b`), the
   scanner cold-readiness fix from (a), the artifact-activation code from (b),
   and the real-upload-storage code from (c) — with ancestry evidence (e.g.
   `git log --oneline <parent_merge>..<selected_sha>` showing each chain
   commit, or `git merge-base --is-ancestor <each_chain_sha> <selected_sha>`)
   and source evidence (confirming the real, non-stub implementation file for
   each, e.g. `apps/api/src/modules/fleet-partner/fleet-document-storage.service.ts`,
   exists at that SHA via `git ls-tree`) recorded before the run. The bare
   parent merge SHA alone is **not** a valid dispatch target: it predates the
   real upload-storage implementation entirely (re-verified 2026-10-07 —
   `git ls-tree -r f8725220d0ee67e90b185cf0dd339b250bcb3d2b -- apps/api/src/modules/fleet-partner/`
   has no `fleet-document-storage.service.ts`; that file only lands via
   `446228cbc` on `origin/dev`), so dispatching against it cannot validate the
   delivered chain and must not be offered as an alternative. `deploy-dev.yml`
   checks out the selected `source_ref` verbatim for build/deploy/acceptance
   (see `.github/workflows/deploy-dev.yml:383-385,632-634,1788-1790`), so an
   under-scoped ref silently rolls back the required implementation instead of
   testing it. Records the full 16/16 operational-acceptance result as
   `真實deploy-dev綠燈` evidence. No new code is implied by this decision on
   the parent itself.

## Parent disposition and acceptance

The parent remains **blocked**, waiting on the chain above; this document
records that the wait is for infrastructure activation and downstream
verification, not for a design decision. Do not resume the parent to `todo`
merely because this helper merges — nothing in the parent's own diff has
changed, and reopening its candidate would not address the actual gap.

*(The following required metadata rewrite and `assign` command block is now superseded history. The routing has already been correctly established and verified. Expected current guidance: read back and preserve the already-correct routing, with no prerequisite re-write. The parent retains its `blocked` disposition, `waiting_for=Pi`, and current `Gemini`/`Codex2` assignments. Do not overwrite the current state by re-running these historic `assign` or `note` commands.)*

Before this helper merges, canonical helper metadata must contain:

```json
{
  "resolved_parent_status": "blocked",
  "resolved_parent_waiting_for": "Claude2",
  "resolved_parent_next": "SD-DP-20261007-002 confirms no product/contract ambiguity. required_acceptance items 1 and 3 (identity-token wiring; same-SHA CI green + independent Codex review) remain fully evidenced on candidate 13656eb14818edc0c9ed85358d360e2fa588c764 / merge f8725220d0ee67e90b185cf0dd339b250bcb3d2b. The sole open item, 真實deploy-dev綠燈, waits on: SR-GCP-SCANNER-COLD-READINESS-20261007 (todo, Claude/Claude2) lands its cold-start/bounded-readiness fix -> unblocks SR-GCP-ARTIFACT-ACTIVATION-20261004 (blocked, Claude/Claude2) to complete real GCS/IAM/ClamAV-scanner activation (private_resources_iam_and_image_provenance, genuine_scan_storage_positive_negative, shared_dev_provider_activation_readback) -> unblocks C125-REAL-UPLOAD-STORAGE-20261005 (blocked, Gemini2/Claude2) to verify real upload/scan/readback -> only then should Supervisor dispatch a fresh deploy-dev.yml run and confirm the full 16/16 operational-acceptance suite (not health-only) before recording 真實deploy-dev綠燈. Dispatch target must be an immutable full commit SHA (or a publish/release ref pinned to one) verified by ancestry (git log/merge-base showing each chain commit reachable) and source check (real non-stub fleet-document-storage.service.ts present) to contain the parent merge plus all three chain fixes; the bare parent merge SHA f8725220d0ee67e90b185cf0dd339b250bcb3d2b alone is not a valid dispatch target because it predates real upload storage (no fleet-document-storage.service.ts until 446228cbc on origin/dev). Do not reopen this parent's own candidate; its diff is not the cause of the upload-url/scanner gap."
}
```

As a dispatched worker (`ORCH_DISPATCH_ROLE=owner`, `ORCH_RUN_ID` set), this
helper cannot write that metadata itself or `note` the parent directly;
reproduced empirically below. Supervisor must write it and the parent note
through the active-release CLI before/at this candidate's merge
reconciliation; otherwise the default `transition_after_merge` resolution
(`resolved_parent_status` defaulting to `todo`) would wrongly resume the
parent for fresh owner dispatch despite none of the chain's prerequisites
existing yet.

```bash
STATUS_CLI=/home/lupin/workspace/drts-fleet-platform/.artifacts/releases/orchestrator-d4cb3eb62a8d/tools/development-orchestrator/bin/ai-status.sh
HELPER_ID=CI-DEPLOY-DEV-PRIVATE-CONSOLES-20261005-UNBLOCK-PLANNING-DECISION
PARENT_ID=CI-DEPLOY-DEV-PRIVATE-CONSOLES-20261005
PARENT_NEXT='SD-DP-20261007-002 confirms no product/contract ambiguity. required_acceptance items 1 and 3 remain fully evidenced on candidate 13656eb14818edc0c9ed85358d360e2fa588c764 / merge f8725220d0ee67e90b185cf0dd339b250bcb3d2b. The sole open item, 真實deploy-dev綠燈, waits on: SR-GCP-SCANNER-COLD-READINESS-20261007 lands its cold-start/bounded-readiness fix -> unblocks SR-GCP-ARTIFACT-ACTIVATION-20261004 real GCS/IAM/ClamAV-scanner activation -> unblocks C125-REAL-UPLOAD-STORAGE-20261005 real upload/scan/readback verification -> then Supervisor dispatches a fresh deploy-dev.yml run against an immutable full SHA (or pinned publish/release ref) verified by ancestry+source check to contain the parent merge plus all three chain fixes, and confirms the full 16/16 operational-acceptance suite before recording 真實deploy-dev綠燈. The bare parent merge SHA f8725220d0ee67e90b185cf0dd339b250bcb3d2b alone is not a valid dispatch target (predates real upload storage; no fleet-document-storage.service.ts until 446228cbc on origin/dev). Do not reopen this parent'\''s own candidate.'
AI_NAME=Supervisor TASK_METADATA_JSON="$(jq -cn --arg next "$PARENT_NEXT" '{resolved_parent_status:"blocked",resolved_parent_waiting_for:"Claude2",resolved_parent_next:$next}')" \
  bash "$STATUS_CLI" assign "$HELPER_ID" Claude2 Codex
AI_NAME=Supervisor bash "$STATUS_CLI" note "$PARENT_ID" "$PARENT_NEXT"
bash "$STATUS_CLI" show "$HELPER_ID"
bash "$STATUS_CLI" show "$PARENT_ID"
```

Do not set `resolved_parent_at` manually; merge lifecycle owns that field. The
parent keeps its merged candidate and all `required_acceptance` keys
unchanged; this decision authorizes no code, scope, or acceptance-bar change.
