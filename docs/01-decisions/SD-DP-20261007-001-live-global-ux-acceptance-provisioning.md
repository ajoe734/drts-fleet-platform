# SD-DP-20261007-001 — Live global-UX acceptance provisioning, not a spec decision

- Date: 2026-10-07
- Owner: Claude2; reviewer: Claude
- Task: `SR-LIVE-GLOBAL-UX-20261007-UNBLOCK-PLANNING-DECISION`
- Parent: `SR-LIVE-GLOBAL-UX-20261007`
- Disposition: confirms no product/contract ambiguity requires interpretation;
  routes the parent's remaining three `required_acceptance` keys to external
  provisioning and human-QA execution. Grants no credentials, no scope cut and
  no live acceptance.
- Audited source: parent candidate/merge `555a7f697f1a8aad07c56ceab2b1d836f7903313`
  / `e7e6b85f98561e6b419d198c657018e038f2eefe` via PR #2396; parent contract
  `docs/04-uat/system-remediation-20260906/SR-LIVE-GLOBAL-UX-20261007.md`.

## Decision and authority

The chairman's blocked-task triage generates this helper class whenever a
parent sits blocked past its cooldown, on the assumption that a missing
product/contract decision is the cause. That assumption does not hold here.

Reading the parent's own canonical contract
([UAT §Supervisor／Operator 執行契約](../../docs/04-uat/system-remediation-20260906/SR-LIVE-GLOBAL-UX-20261007.md),
items 1–7) shows the execution contract is already fully specified: runtime
manifest freeze procedure, `global-ux-input` artifact shape (`Plan`, `Recipe`,
`Step`, `ManualEvidence` in `model.ts`/`guards.ts`), the `GLOBAL_UX_SESSIONS_JSON`
session contract, the nine-service manifest/readback check, and the invoker-token
isolation rules. Role/state/locale/viewport denominators are fixed by source
(`packages/contracts/src/iam-policy-catalog.ts` for 15 tenant/platform/ops roles,
`apps/bank-console-web/.../lib/session.ts::BankConsoleRole` for 3 bank roles — 18
total) and by the UAT doc's own state/locale/viewport matrix (8 × 2 × 3 = 48
combinations per screen, 190 screens → 20,160 case obligations). None of this is
ambiguous or open to a design call; it is a large, already-agreed acceptance
contract that has not yet been executed because its prerequisites do not exist
in this environment.

**The missing thing is not a decision — it is provisioning and human labor.**
Per the UAT contract's own precedence, the authorities that already settle
every open question are:

1. [Service contracts §2.2](../../phase1_service_contracts_v1.md): UTC storage,
   user/tenant-locale display; format probes already specify this.
2. [Design handoff §5](../../docs/05-ui/design-handoff-20260525-implementation-plan.md)
   and `packages/ui-web/src/management-*`/canvas primitives: the design-mapping
   acceptance key's authority for "adopted design" per screen/state.
3. [`iam-policy-catalog.ts`](../../packages/contracts/src/iam-policy-catalog.ts)
   and the bank console's `BankConsoleRole`: the 18 app-role identity set.
4. `.github/workflows/deploy-dev.yml`: the eight web services + API deployment
   authority and the nine-service runtime manifest.

No L1 requirement, role, state, viewport, or acceptance key is reinterpreted by
this decision.

## Source diagnosis and required external actions

| Gap (from Codex2's 2026-10-07T08:34:11Z acceptance audit, independently re-read here)  | Current state                                                                                                                                                                                                  | Who must act and how                                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared-dev-acceptance` GitHub environment                                             | Absent: `gh api .../environments` lists it as 404                                                                                                                                                              | Operator creates the environment and binds the protected secret below; no agent lane can create GitHub environments                                                                                                     |
| `GLOBAL_UX_SESSIONS_JSON` secret                                                       | Absent at repo and environment scope                                                                                                                                                                           | Operator provisions `Session[]` per UAT §4: one approved reference per app-role, sandbox alias, origin-bound `storageState`, authoritative readback path. This is credential material; no worker may author or guess it |
| `global-ux-input` artifact (`plan.json`, `manual.json`, `artifacts/`)                  | Zero uploaded artifacts named `global-ux-input`                                                                                                                                                                | Operator assembles per UAT §2–3 after the plan below exists; worker-run `runner.ts scaffold` only drafts, it does not approve                                                                                           |
| Workflow on default branch                                                             | `live-global-ux-acceptance.yml` returns 404 at `ref=main`; only exists on dev-branch history                                                                                                                   | Follow the existing publish/promote lifecycle (no worker edits `main` or starts a VM service to force this)                                                                                                             |
| Reviewed `plan.json` recipes                                                           | 4 draft recipes (source-derived Enterprise `/auth-required` defaults) exist; 3,356 of 3,360 `screen.id`/`role`/`state` obligations are undecided; draft `approvalRef` is blank and `expiresAt` is `1970-01-01` | Operator must review and approve real recipes with a genuine `approvalRef`/expiry per UAT §3; this is a judgment-and-authorization step, not a code change                                                              |
| Manual evidence: keyboard, screen-reader, contrast, design-mapping                     | None recorded; UAT §"證據、人工程序與限制" requires named tester, device/AT/browser version, and matched runtime/harness/plan SHA per applicable case                                                          | Operator arranges actual human testers with real assistive-technology devices across the ~20,160 case obligations; no worker on this VM may run a browser, screen reader, or device                                     |
| CI-INTEG-01 (`uv-exec-006.integration.test.ts:2236`, unordered `readState` trace rows) | Hosted merge-ref run failed 1/314 at the old candidate; not reproduced against this VM; outside this task's `write_scopes`                                                                                     | Supervisor confirms ownership/conflicts and schedules a scoped repair or hosted re-run; this helper and the parent QA task must not edit that shared integration test                                                   |

Production/contract sources read for this table:
[SR-LIVE-GLOBAL-UX-20261007.md](../../docs/04-uat/system-remediation-20260906/SR-LIVE-GLOBAL-UX-20261007.md),
[iam-policy-catalog.ts](../../packages/contracts/src/iam-policy-catalog.ts),
[live-global-ux-acceptance.yml](../../.github/workflows/live-global-ux-acceptance.yml),
[deploy-dev.yml](../../.github/workflows/deploy-dev.yml),
[runner.ts](../../tests/e2e/system-remediation/sr-live-global-ux-20261007/runner.ts).

## Scope cut and executable follow-up

1. **No scope cut is authorized by this helper.** All four `required_acceptance`
   keys stay as specified; `reviewed_same_sha_global_ux_harness` is already
   recorded, the other three remain open. Reducing the 20,160-case denominator,
   the 18-role set, or the four manual-evidence categories would weaken an
   already-agreed acceptance bar and needs explicit user authorization, not an
   agent's unilateral call.
2. **Claude2 (this task's own disposition):** confirms the parent's `blocked`
   status and `waiting_for: Claude2` already reflect the correct state — no
   implementation reopen is warranted, because nothing in source or harness is
   defective. Codex2's harness candidate stands as merged, reviewed evidence.
3. **Operator/Supervisor, in order:** (a) create the `shared-dev-acceptance`
   environment and `GLOBAL_UX_SESSIONS_JSON` secret; (b) promote
   `live-global-ux-acceptance.yml` to `main` through the existing publish/promote
   lifecycle; (c) review and approve the remaining 3,356 recipe decisions with a
   real `approvalRef`/expiry; (d) commission named human testers with actual
   AT/devices for the four manual-evidence categories; (e) decide CI-INTEG-01
   ownership/scope for a Supervisor-coordinated repair.
4. **After (a)–(d) above exist:** Operator dispatches the hosted workflow with
   `harness_sha`, `runtime_sha`, `bundle_run_id`, `plan_sha256` per UAT §7; the
   existing harness (candidate `555a7f697f1a8aad07c56ceab2b1d836f7903313`) reads
   them back. No new harness code is implied by this decision.

## Parent disposition and acceptance

The parent remains **blocked**, waiting on Claude2 to coordinate the Operator
checklist above; this document records that the wait is for provisioning and
human execution, not for a design decision. Do not resume the parent to `todo`
merely because this helper merges — nothing has changed that lets implementation
or acceptance proceed.

Before this helper merges, canonical helper metadata must contain:

```json
{
  "resolved_parent_status": "blocked",
  "resolved_parent_waiting_for": "Claude2",
  "resolved_parent_next": "SD-DP-20261007-001 confirms no product/contract ambiguity; the three open acceptance keys (same_release_role_screen_state_coverage, accessibility_keyboard_focus_responsive_evidence, zh_tw_en_locale_content_and_design_mapping) wait on Operator provisioning: shared-dev-acceptance environment + GLOBAL_UX_SESSIONS_JSON secret, workflow promotion to main, reviewed plan.json covering the remaining 3,356 recipes, and named human testers for keyboard/screen-reader/contrast/design-mapping evidence. CI-INTEG-01 (uv-exec-006.integration.test.ts:2236) needs separate Supervisor-scoped repair outside this task's write_scopes. Keep candidate 555a7f697f1a8aad07c56ceab2b1d836f7903313 / merge e7e6b85f98561e6b419d198c657018e038f2eefe and all four acceptance keys as recorded; no implementation reopen."
}
```

As a dispatched worker (`ORCH_DISPATCH_ROLE=owner`, `ORCH_RUN_ID` set), this
helper cannot write that metadata itself or `note` the parent directly; both are
reproduced below. Supervisor must write it and the parent note through the
active-release CLI before/at this candidate's merge reconciliation; otherwise
the default `transition_after_merge` resolution (`resolved_parent_status`
defaulting to `todo`) would wrongly resume the parent for fresh owner dispatch
despite none of the external prerequisites existing yet.

```bash
STATUS_CLI=/home/lupin/workspace/drts-fleet-platform/.artifacts/releases/orchestrator-d4cb3eb62a8d/tools/development-orchestrator/bin/ai-status.sh
HELPER_ID=SR-LIVE-GLOBAL-UX-20261007-UNBLOCK-PLANNING-DECISION
PARENT_ID=SR-LIVE-GLOBAL-UX-20261007
PARENT_NEXT='SD-DP-20261007-001 confirms no product/contract ambiguity; the three open acceptance keys wait on Operator provisioning (shared-dev-acceptance environment + GLOBAL_UX_SESSIONS_JSON secret, workflow promotion to main, reviewed plan.json for the remaining 3,356 recipes, named human testers for keyboard/screen-reader/contrast/design-mapping). CI-INTEG-01 needs separate Supervisor-scoped repair outside write_scopes. Keep candidate 555a7f697f1a8aad07c56ceab2b1d836f7903313 and all four acceptance keys as recorded; no implementation reopen.'
AI_NAME=Supervisor TASK_METADATA_JSON="$(jq -cn --arg next "$PARENT_NEXT" '{resolved_parent_status:"blocked",resolved_parent_waiting_for:"Claude2",resolved_parent_next:$next}')" \
  bash "$STATUS_CLI" assign "$HELPER_ID" Claude2 Claude
AI_NAME=Supervisor bash "$STATUS_CLI" note "$PARENT_ID" "$PARENT_NEXT"
bash "$STATUS_CLI" show "$HELPER_ID"
bash "$STATUS_CLI" show "$PARENT_ID"
```

Do not set `resolved_parent_at` manually; merge lifecycle owns that field. The
parent keeps its merged candidate and all four live-acceptance keys unchanged;
this decision authorizes no code, harness, scope, or acceptance-bar change.
