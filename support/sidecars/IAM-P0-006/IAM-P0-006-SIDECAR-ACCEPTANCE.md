# IAM-P0-006 Acceptance Packet

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `IAM-P0-006` - remove bootstrap identity and mock authority from stage and production  
**Current Owner:** `Codex2`  
**Assigned Reviewer:** `Gemini2`  
**Parent Owner At Snapshot:** `Gemini2`  
**Parent Reviewer At Snapshot:** `Codex`  
**Last Revised:** `2026-08-02 (UTC)`  
**Status:** `REVIEW-STAGE SUPPORT ARTIFACT — reviewer-ready acceptance framing for IAM-P0-006; support-only and non-canonical.`

---

## 1) Scope Boundary

本 sidecar 只整理 `IAM-P0-006` 的 acceptance checklist、dependency map、baseline risk anchors、與 reviewer handoff 指引。

- In scope: support-only acceptance framing, upstream dependency state, parent closeout gate notes, repo evidence anchors, reviewer checklist.
- Out of scope: 修改 L1 canonical truth、改寫 parent 正式 closeout 結論、直接更動 runtime / registry / governance / contracts 主線實作。

---

## 2) Machine-Truth Snapshot

Snapshot 依據：`scripts/ai-status.sh show` 輸出、task brief、既有 repo evidence。

### Parent `IAM-P0-006`

| Field | Value |
| --- | --- |
| Status | `in_progress` |
| Owner / Reviewer | `Gemini2` / `Codex` |
| Summary | remove bootstrap identity headers, mock principals, default tenant and scope override from stage/prod paths; keep only explicit test harness support and prove direct production requests are rejected |
| Recorded acceptance | `Stage and production reject every bootstrap header path`; `Missing identity or internal proof fails closed`; `No production demo seed or default tenant authority remains`; `Local test adapter remains explicit`; `Deployment and direct-path E2E pass` |
| Parent next | task still in progress; parent record also notes `IAM-IDP-002` PR #1253 / CI as a final-closeout dependency |

### Sidecar `IAM-P0-006-SIDECAR-ACCEPTANCE`

| Field | Value |
| --- | --- |
| Status at dispatch | `backlog` -> owner started work on `2026-08-02` |
| Owner / Reviewer | `Codex2` / `Gemini2` |
| Helper kind | `acceptance_packet` |
| Support artifact | `support/sidecars/IAM-P0-006/IAM-P0-006-SIDECAR-ACCEPTANCE.md` |
| `mutates_canonical` | `false` |

---

## 3) Dependency Map

### Direct dependencies from machine truth

| Dep ID | Status | Why it matters to `IAM-P0-006` |
| --- | --- | --- |
| `IAM-P0-002` | `done` | `/auth/token` must already reject caller-supplied bootstrap claims before `IAM-P0-006` can claim stage/prod no longer trust bootstrap identity. |
| `IAM-P0-003` | `done` | Route inventory + default-deny is the guardrail that prevents stray unclassified bootstrap paths from surviving in production. |
| `IAM-P0-004` | `done` | Production startup validation is the prerequisite for forbidding `DRTS_INTERNAL_KEY_ENFORCED=false` and other unsafe auth controls in stage/prod. |
| `IAM-P0-005` | `done` | Browser-facing staging/prod traffic already moved toward explicit allowlists and security headers, reducing reliance on bootstrap-header browser trust. |
| `IAM-IDP-001` | `done` | Tenant / partner-human flows now have a verified OIDC/PKCE BFF path, so bootstrap headers no longer need to remain the claimed production user-auth path. |

### Parent closeout gate outside declared sidecar deps

| Task ID | Status | Why reviewer should care |
| --- | --- | --- |
| `IAM-IDP-002` | `review` | Parent `IAM-P0-006` record explicitly says final closeout should not overstate completion until verified IAP workforce subject resolution lands from PR `#1253`. This does not block this sidecar handoff, but it affects the parent's final wording. |

---

## 4) Why This Task Exists

The baseline hardening packet names `IAM-P0-006` as the containment item that removes bootstrap identity from production trust paths rather than treating bootstrap headers as a permanent auth model.

| Concern | Evidence |
| --- | --- |
| `IAM-P0-006` acceptance definition | `docs/02-architecture/stage1-5-identity-access-account-security-hardening-plan-20260801.md:567-575` |
| Stage/prod must disable demo seed users, default tenant fallback, mock identity, bootstrap scope override, and internal-key fail-open | `docs/02-architecture/stage1-5-identity-access-account-security-hardening-plan-20260801.md:538-540` |
| Baseline gaps: `/auth/token`, internal-key gate, and bootstrap guard still allow bootstrap-oriented trust paths | `docs/02-architecture/stage1-5-identity-access-account-security-hardening-plan-20260801.md:99-101` |
| Execution contract for `IAM-P0-006` | `docs/03-runbooks/stage1-5-identity-access-account-security-execution-tasks-20260801.md:96-104` |
| Negative bar: production bootstrap headers, caller roles/scopes, and demo principals must fail | `docs/03-runbooks/stage1-5-identity-access-account-security-execution-tasks-20260801.md:168-171` |

---

## 5) Repo Evidence Anchors Reviewer Should Spot-Check

These anchors show the baseline surfaces that `IAM-P0-006` must fence or replace on the parent branch. They are not a claim that the current `dev` baseline already satisfies the parent acceptance.

### Runtime / contract surfaces

| Area | Evidence |
| --- | --- |
| Bootstrap auth remains a first-class auth mode | `apps/api/src/common/auth/auth.types.ts:34-59` |
| Unclassified protected routes still fall back to anonymous/bootstrap extraction when no route policy resolves | `apps/api/src/common/auth/bootstrap-auth.guard.ts:211-220` |
| SSE routes can still merge bootstrap identity from query params | `apps/api/src/common/auth/bootstrap-auth.guard.ts:49-87`, `:201-209` |
| `validateInternalKey()` currently skips enforcement when no expected key is configured and also allows validated non-system bootstrap identities through | `apps/api/src/common/auth/internal-key.middleware.ts:100-116` |
| `/api/auth/token` still requires internal key but then signs directly from extracted bootstrap identity | `apps/api/src/modules/auth/auth.controller.ts:73-99` |
| Tenant bootstrap endpoint still contains fixture/default-tenant fallback logic on the baseline surface | `apps/api/src/modules/auth/auth.controller.ts:58-61`, `:147-176` |

### Production-path expectation anchors

| Area | Evidence |
| --- | --- |
| Auth realm matrix already states bootstrap headers are local/direct-path fallback only for system/platform/ops production notes | `apps/api/src/common/auth/auth.matrix.ts:3-35` |
| Startup config forbids `DRTS_INTERNAL_KEY_ENFORCED=false` in staging/production | `apps/api/src/config/auth-startup-config.ts:542-558` |
| Startup config requires `DRTS_INTERNAL_KEY` in staging/production | `apps/api/src/config/auth-startup-config.ts:560-565` |
| Startup integration test covers unsafe staging/prod auth config rejection | `apps/api/tests/integration/auth-startup-config.integration.test.ts:12-29`, `:79-97` |
| Smoke README already documents Bearer/IAP first and bootstrap headers as local/direct non-IAP fallback only | `tests/smoke/README.md:70-96` |

### Unit-test baseline anchors

| Area | Evidence |
| --- | --- |
| Bootstrap extraction still parses actor/realm/roles/scopes directly from headers | `apps/api/tests/unit/auth-bootstrap.test.ts:77-112` |
| Internal-key tests still permit validated non-system bootstrap identities without the internal key | `apps/api/tests/unit/auth-bootstrap.test.ts:1044-1059` |
| Internal-key tests still permit tenant/partner bootstrap-session issuance without the internal key | `apps/api/tests/unit/auth-bootstrap.test.ts:1102-1125` |
| Internal-key tests still reject uncovered admin routes without the internal key, which is the fail-closed floor `IAM-P0-006` must preserve | `apps/api/tests/unit/auth-bootstrap.test.ts:1143-1217` |

---

## 6) Acceptance Expansion For Parent Review

This section translates the parent acceptance bullets into a reviewer checklist. Because parent `IAM-P0-006` is still `in_progress` as of `2026-08-02`, these rows should be treated as the review target, not as a pass declaration.

| Parent acceptance | Reviewer should verify | Baseline anchors / notes |
| --- | --- | --- |
| Stage and production reject every bootstrap header path | Protected stage/prod flows for platform/ops/system no longer accept free-form bootstrap headers as the primary trust path; direct bootstrap requests fail in focused E2E/smoke coverage. | Execution contract: `docs/03-runbooks/stage1-5-identity-access-account-security-execution-tasks-20260801.md:103`, `:168-171`; production notes: `apps/api/src/common/auth/auth.matrix.ts:3-35`; baseline bootstrap surfaces: `bootstrap-auth.guard.ts`, `auth.controller.ts`. |
| Missing identity or internal proof fails closed | Missing Bearer / verified proof / required internal key produces denial, not fallback acceptance; stage/prod cannot run with `DRTS_INTERNAL_KEY_ENFORCED=false` or missing key. | `internal-key.middleware.ts:100-116`; `auth-startup-config.ts:542-565`; `auth-startup-config.integration.test.ts:79-97`. |
| No production demo seed or default tenant authority remains | Parent branch removes or technically fences default tenant fallback, demo/mock principal use, and scope override from stage/prod runtime and deployment paths. | Design bar: `hardening-plan...md:538-540`; baseline tenant fallback: `auth.controller.ts:170-176`. |
| Local test adapter remains explicit | Local/test-only harness support is still possible, but behind explicit fixture/test controls rather than silently reusing production-like defaults. | `tests/smoke/README.md:70-96`; tenant bootstrap fixture mode constants in `auth.controller.ts:58-61`; related `IAM-P0-001`/`IAM-IDP-001` outputs are upstream. |
| Deployment and direct-path E2E pass | Reviewer should see concrete commands/results for startup validation plus direct-path negative auth proof on the parent branch, not just unit coverage. | Parent artifacts listed in machine truth include `apps/api/src/config/`, `infra/`, and `tests/e2e/`; the sidecar does not invent commands absent from the parent implementation branch. |

---

## 7) Reviewer Hotspots For `Gemini2`

1. Confirm the packet stays support-only and does not claim `IAM-P0-006` is already complete on `dev`.
2. Check whether the parent branch materially removes production bootstrap trust, not merely updates docs or test wording.
3. Verify the parent closes the specific baseline holes named in §5: bootstrap fallback in `BootstrapAuthGuard`, bootstrap-derived `/auth/token`, default-tenant fallback in tenant bootstrap, and permissive `validateInternalKey()` behavior for production-like paths.
4. Make sure the parent closeout message mentions `IAM-IDP-002` truthfully if PR `#1253` is still open or CI is still pending at the time of review.
5. Require explicit negative-path evidence for direct bootstrap rejection in stage/prod-like execution, not only unit tests.

---

## 8) Residual Risks / Non-Blocking Notes

- This sidecar intentionally does not edit canonical truth or runtime code; it packages the acceptance map only.
- The current baseline still contains bootstrap-oriented code paths and tests because the parent implementation is on a separate branch/task lifecycle.
- The sidecar did not run parent-branch auth/E2E verification itself; reviewer should rely on the parent branch's verification log for final acceptance, using this packet as the checklist.

---

## 9) Handoff Command

### Owner -> Reviewer (`Codex2` -> `Gemini2`)

```bash
AI_NAME=Codex2 python3 scripts/ai_status.py handoff IAM-P0-006-SIDECAR-ACCEPTANCE Gemini2 "IAM-P0-006 acceptance packet is ready at support/sidecars/IAM-P0-006/IAM-P0-006-SIDECAR-ACCEPTANCE.md. It freezes machine-truth dependencies on IAM-P0-002/003/004/005 and IAM-IDP-001, flags IAM-IDP-002 PR #1253 as a parent closeout gate, maps the baseline bootstrap/internal-key/default-tenant trust surfaces that the parent branch must fence, and expands the five parent acceptance bullets into a reviewer checklist. Support artifact only; no canonical truth changed."
```
