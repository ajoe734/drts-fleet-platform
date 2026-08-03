# IAM-MFA-001 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `IAM-MFA-001` — Enforce MFA and fresh step-up for privileged actions  
**Sidecar Owner:** `Codex`  
**Assigned Reviewer:** `Codex2`  
**Parent Owner / Reviewer:** `Codex2` / `Gemini`  
**Generated:** `2026-08-03` (UTC)  
**Mutates Canonical Truth:** `false`

This packet is a support artifact only. It does not change L1 product truth, canonical contracts, or the parent implementation branch. It exists to help the reviewer and parent owner close the MFA step-up slice with a focused acceptance pass.

---

## 1) Scope Boundary

本 sidecar 只整理 `IAM-MFA-001` 的 acceptance checklist、dependency map、current-state evidence、以及 reviewer handoff 指引，不代替 parent 實作，也不修改 machine truth 以外的 canonical surface。

- **In scope:** support-only acceptance framing, dependency completion snapshot, parent block context, reviewer checklist, evidence anchors, handoff / approve guidance.
- **Out of scope:** 修改 `apps/api`、`packages/contracts`、`tests` 或任何主線 runtime / contract 實作；替 parent 任務做 closeout；改寫 integration gate 規則。

---

## 2) Current State Baseline (Machine Truth + Repo Evidence)

以 `scripts/ai-status.sh show <task>`、執行 runbook 與 repo 現況為準：

- Parent `IAM-MFA-001`
  - Owner=`Codex2`
  - Reviewer=`Gemini`
  - Status=`blocked`
  - Depends on: `IAM-IDP-001`, `IAM-IDP-002`, `IAM-SES-002`
  - Current machine-truth note (`2026-08-03T02:45:25Z`): owner closeout commit `c317d836` 已存在並已 push，但 `done` 被 integration gate 擋下，因為 `.orchestrator/config.json` 不接受 `INTEGRATION_STATUS=branch_pushed`；需要更高等級的 integration evidence。
- 本 sidecar `IAM-MFA-001-SIDECAR-ACCEPTANCE`
  - Owner=`Codex`
  - Reviewer=`Codex2`
  - Status=`in_progress` after `2026-08-03T07:23:32Z` start update
  - Artifact target: `support/sidecars/IAM-MFA-001/IAM-MFA-001-SIDECAR-ACCEPTANCE.md`

### Dependency Snapshot

| Dependency | Status | Integration note | Why it matters |
| --- | --- | --- | --- |
| `IAM-IDP-001` | `done` | `merged_to_dev` at commit `bc47d313cbe7` | Supplies tenant / partner-human managed OIDC PKCE BFF login and trusted session source for MFA policy evaluation. |
| `IAM-IDP-002` | `done` | machine truth records PR `#1253`, reconciled from `origin/dev` commit `d0d4cbd91d85` | Supplies verified workforce subject resolution and trusted workforce `amr` / `acr` posture. |
| `IAM-SES-002` | `done` | `merged_to_dev` at commit `276a499d5940`, CI success recorded | Supplies durable JWT session claims including `auth_time`, `amr`, `acr`, `sid`, `jti`, and revocation semantics required by step-up enforcement. |

### Parent Implementation Evidence Snapshot

Machine truth already records an implementation closeout commit on the parent owner branch:

- Commit: `c317d836`
- Subject: `feat(IAM-MFA-001): enforce trusted step-up proof for privileged actions`
- Diff summary from `git show --stat`:
  - new `apps/api/src/common/auth/step-up-proof.service.ts`
  - new `apps/api/src/common/auth/step-up.policy.ts`
  - updates in `bootstrap-auth.guard.ts`, `auth.constants.ts`, `identity.controller.ts`, `identity.module.ts`
  - additive contract changes in `packages/contracts/src/iam-contracts.ts`
  - tests added in `tests/unit/step-up-proof-policy.test.ts`
  - audit-matrix / helper updates in `security-event-matrix.ts`, `tests/unit/security-events.test.ts`, `tests/e2e/lib/helpers.sh`

This sidecar does **not** re-implement or alter those files. It freezes the reviewer checklist around them.

---

## 3) Canonical Acceptance Framing

The parent acceptance bullets in machine truth are:

1. Every privileged action has a declared step-up rule
2. Client MFA booleans cannot satisfy policy
3. Stale wrong-session and wrong-action proof fails
4. Fresh trusted proof succeeds only inside policy window
5. Negative matrix and audit events pass

The checklist below expands those bullets into reviewer-facing checks without changing product meaning.

### AC-1 — Every privileged action has a declared step-up rule

- [ ] `step-up.policy.ts` defines a server-owned catalog for named privileged actions rather than ad hoc per-controller booleans.
- [ ] The policy covers the high-risk platform / ops / finance / compliance / tenant / partner / driver mutations named by the parent slice, or the code clearly centralizes their mapping through one reviewed policy surface.
- [ ] Route protection is wired through backend authority enforcement, not UI hints or request-body flags.
- [ ] Reviewer can identify one stable policy lookup path from request -> action classification -> step-up requirement.

### AC-2 — Client MFA booleans cannot satisfy policy

- [ ] No frontend-provided boolean, header, or request field can mark a session as step-up satisfied on its own.
- [ ] The proof source is trusted server-owned session context using `auth_time`, `amr`, `acr`, and session identity from prior dependency slices.
- [ ] Any new contract fields in `packages/contracts/src/iam-contracts.ts` describe server-evaluated state or proof references, not client-authoritative MFA truth.
- [ ] Failure path returns stable step-up error codes from the IAM contract surface, anchored to `AUTH_STEP_UP_REQUIRED` and/or `IAM_STEP_UP_REQUIRED` as appropriate.

### AC-3 — Stale, wrong-session, and wrong-action proof fails

- [ ] Proof binding includes the current principal session, not just the actor identifier.
- [ ] Proof binding includes the privileged action or policy key so one action cannot replay against another.
- [ ] Freshness is evaluated on the server against `auth_time` and/or issued proof timestamps.
- [ ] Negative tests cover at least stale proof, wrong action, wrong session, and missing trusted `amr` / `acr`.

### AC-4 — Fresh trusted proof succeeds only inside policy window

- [ ] Trusted proof acceptance is time-bounded and encoded in policy, not open-ended.
- [ ] The allowed success path requires valid session claims populated by `IAM-SES-002`.
- [ ] Reviewer can trace how the step-up success is attached to the current session and action scope.
- [ ] Expired or absent proof degrades to the stable step-up error path instead of partial success.

### AC-5 — Negative matrix and audit events pass

- [ ] Unit/integration coverage exists for the policy evaluator and proof service, including both allow and deny paths.
- [ ] Audit/security event wiring was extended for step-up denials and/or privileged proof usage where the parent diff claims it.
- [ ] The negative matrix explicitly covers client-side spoof attempts, stale proof replay, wrong-session replay, wrong-action replay, and missing-trust claims.
- [ ] Any E2E helper updates remain support code for verification and do not become runtime authority.

---

## 4) Dependency Map

### Formal Upstream Dependencies

| ID | Status | What it provides to `IAM-MFA-001` |
| --- | --- | --- |
| `IAM-IDP-001` | `done` | Managed tenant / partner-human identity session bootstrap with trusted auth context. |
| `IAM-IDP-002` | `done` | Verified workforce identity resolution with trusted group and `aal2`-style context for platform / ops users. |
| `IAM-SES-002` | `done` | Durable session/JWT claims and revocation semantics for `auth_time`, `amr`, `acr`, `sid`, `jti`, `tokenVersion`. |

### Practical Review Dependencies

| Ref | Source | Why reviewer should check it |
| --- | --- | --- |
| `D-P-1` | `docs/03-runbooks/stage1-5-identity-access-account-security-execution-tasks-20260801.md` §5.3 | Confirms the parent execution contract: trusted `amr` / `acr` / `auth_time`, server-owned policy, stable step-up errors, frontend booleans ignored. |
| `D-P-2` | `packages/contracts/src/iam-contracts.ts` | Confirms stable IAM error code surface already includes `AUTH_STEP_UP_REQUIRED` and `IAM_STEP_UP_REQUIRED`. |
| `D-P-3` | `apps/api/src/common/auth/jwt-auth.service.ts` | Confirms dependency slice already emits and reads `auth_time`, `amr`, and `acr`. |
| `D-P-4` | parent commit `c317d836` stat | Confirms the claimed implementation surfaces for proof service, policy service, contract additions, guard wiring, and tests. |

### Current Blocking Context

| Blocker | Layer | Meaning |
| --- | --- | --- |
| Parent `IAM-MFA-001` is `blocked` | integration closeout | This is **not** a functional dependency gap. Machine truth says implementation and closeout commit exist, but formal `done` is blocked by insufficient integration-status evidence. |
| Reviewer wait on parent (`Gemini`) | task lifecycle | Parent owner/reviewer still need to resolve the integration gate and final closeout path. |

---

## 5) Evidence Inventory

| ID | Evidence | Anchor |
| --- | --- | --- |
| `E-1` | Parent machine-truth status and block reason | `AI_NAME=Codex scripts/ai-status.sh show IAM-MFA-001` |
| `E-2` | Sidecar machine-truth ownership and artifact path | `AI_NAME=Codex scripts/ai-status.sh show IAM-MFA-001-SIDECAR-ACCEPTANCE` |
| `E-3` | Execution contract naming trusted `amr` / `acr` / `auth_time` and stable step-up errors | `docs/03-runbooks/stage1-5-identity-access-account-security-execution-tasks-20260801.md` §5.3 row `IAM-MFA-001` |
| `E-4` | Stable IAM error codes include step-up errors | `packages/contracts/src/iam-contracts.ts` |
| `E-5` | Durable session claims already exist in runtime and tests | `apps/api/src/common/auth/jwt-auth.service.ts`, `apps/api/tests/integration/jwt-session-claims.integration.test.ts` |
| `E-6` | Parent implementation commit surfaces | `git show --stat --oneline c317d836 --` |
| `E-7` | Parent dependencies completed | `AI_NAME=Codex scripts/ai-status.sh show IAM-IDP-001`, `IAM-IDP-002`, `IAM-SES-002` |

---

## 6) Reviewer Hotspots (`Codex2`)

Reviewer should prioritize these checks:

1. Confirm the packet does not confuse the parent block reason.
   The current parent blocker is integration closeout policy, not missing upstream identity/session dependencies.

2. Confirm the implementation really stays server-owned.
   The parent slice must reject any client-side MFA boolean shortcut and rely only on trusted session/proof state.

3. Confirm the parent diff covers both policy definition and enforcement wiring.
   The `step-up.policy.ts` and `step-up-proof.service.ts` additions are not enough unless the guard/controller path actually consults them.

4. Confirm the error surface is stable.
   Review whether the deny path consistently emits the IAM step-up error codes already defined in the shared contract.

5. Confirm proof replay is bounded correctly.
   Wrong-session, wrong-action, stale, and missing-claim cases should be explicit tests, not inferred behavior.

6. Confirm audit coverage exists where the diff claims it.
   The security event matrix changed; reviewer should verify the step-up slice is represented in emitted or asserted events.

7. Keep closeout and integration evidence separate.
   Even if the parent implementation is functionally acceptable, `done` still requires the integration-status policy to be satisfied with recorded evidence.

---

## 7) Suggested Review Outcome Language

**Approve wording:**

> `IAM-MFA-001 acceptance packet ready: the packet keeps machine truth aligned on completed upstream identity/session dependencies, correctly distinguishes the parent's current integration-closeout blocker from functional acceptance, and freezes a reviewer checklist around server-owned step-up policy, trusted amr/acr/auth_time enforcement, stable IAM step-up error codes, wrong-session/wrong-action/stale-proof negatives, and audit-event coverage without mutating canonical truth.`

**Reopen wording:**

> `packet needs revision: [specify machine-truth mismatch / dependency status error / acceptance framing gap / incorrect parent blocker characterization / scope drift beyond support-only sidecar]`

---

## 8) Handoff Commands

Owner (`Codex`) -> Reviewer (`Codex2`):

```bash
AI_NAME=Codex scripts/ai-status.sh handoff IAM-MFA-001-SIDECAR-ACCEPTANCE Codex2 "IAM-MFA-001 acceptance packet prepared at support/sidecars/IAM-MFA-001/IAM-MFA-001-SIDECAR-ACCEPTANCE.md. It freezes machine truth on completed upstream dependencies (IAM-IDP-001, IAM-IDP-002, IAM-SES-002), distinguishes the parent's current integration-closeout blocker from functional dependency gaps, and provides a reviewer checklist for server-owned step-up policy, trusted amr/acr/auth_time enforcement, stable IAM step-up errors, stale/wrong-session/wrong-action proof negatives, and audit-event coverage."
```

Reviewer (`Codex2`) approve:

```bash
AI_NAME=Codex2 scripts/ai-status.sh approve IAM-MFA-001-SIDECAR-ACCEPTANCE "IAM-MFA-001 acceptance packet ready: the packet keeps machine truth aligned on completed upstream identity/session dependencies, correctly distinguishes the parent's current integration-closeout blocker from functional acceptance, and freezes a reviewer checklist around server-owned step-up policy, trusted amr/acr/auth_time enforcement, stable IAM step-up error codes, wrong-session/wrong-action/stale-proof negatives, and audit-event coverage without mutating canonical truth."
```

Reviewer (`Codex2`) reopen:

```bash
AI_NAME=Codex2 scripts/ai-status.sh reopen IAM-MFA-001-SIDECAR-ACCEPTANCE "packet needs revision: [specify machine-truth mismatch / dependency status error / acceptance framing gap / incorrect parent blocker characterization / scope drift beyond support-only sidecar]"
```

---

## 9) Owner Closeout

If this sidecar reaches `review_approved`, the owner can finalize it without claiming parent integration closeout:

```bash
export NO_COMMIT_REQUIRED=1
AI_NAME=Codex scripts/ai-status.sh done IAM-MFA-001-SIDECAR-ACCEPTANCE "Owner finalized approved support-only acceptance packet for IAM-MFA-001 at support/sidecars/IAM-MFA-001/IAM-MFA-001-SIDECAR-ACCEPTANCE.md. The packet preserves machine truth on completed upstream dependencies, parent integration-closeout blocker context, reviewer hotspots for server-owned step-up enforcement and stable error handling, and handoff guidance without changing canonical truth."
```

---

## 10) Sidecar AC

- [x] Only support artifact content was added.
- [x] No canonical truth, runtime implementation, or shared contract behavior was modified in this sidecar branch.
- [x] Packet cites machine-truth task state rather than reading `ai-status.json` wholesale.
- [x] Packet distinguishes dependency completion from parent integration closeout.
- [x] Packet includes executable handoff / approve / reopen / done commands.

