# PH1GC-ADM-001 — Sidecar Acceptance Packet

**Sidecar task**: `PH1GC-ADM-001-SIDECAR-ACCEPTANCE`  
**Parent task**: `PH1GC-ADM-001` — Phase 1 gap closure — platform admin control plane UAT  
**Helper kind**: `acceptance_packet`  
**Parent owner / reviewer**: `Codex2` / `Codex`  
**Sidecar owner / reviewer**: `Codex` / `Codex2`  
**Date prepared**: `2026-05-22`  
**Scope statement**: Support-only material. Does **not** mutate canonical truth. This packet does not edit `docs/04-uat/platform-admin-control-plane-uat-20260519.md`, `tests/e2e/E2E-011-platform-admin-control-plane.sh`, or the workflow matrix. Parent owner may absorb pieces of this packet into the implementation closeout.  
**Canonical machine-truth root**: `/home/edna/workspace/drts-fleet-platform`

**Authority cross-refs**

- Gap-closure implementation spec: `docs/00-context/phase1-origin-dev-gap-closure-implementation-spec-20260520.md` §I `ADM-001`, §7, §8, §9, §10.
- Gap-closure status truth: `docs/00-context/phase1-origin-dev-gap-closure-status-truth-20260522.md` §2.1, §2.3, §2.5, §4, §5.
- Canonical task entries in `/home/edna/workspace/drts-fleet-platform/ai-status.json`:
  - `PH1GC-ADM-001`
  - `PH1GC-E2E-011`
  - `PH1GC-MATRIX-001`
- Recovery anchors from prior v3 work that never landed on `origin/dev`:
  - `ADM-UAT-001` content commit `64abc10`, closeout anchor `41334df9e01142c0fd053b44d603e59cc1353bb0`
  - `WF-ADM-001-E2E` closeout commit `0d666298f51166712bfbf9a6ac2973117a169792`
  - `WF-ADM-001-MATRIX` closeout commit `91f8f1e49b9bc51d90ed578047cb7597f20df540`

---

## 1. Acceptance checklist

The parent task is `done`-eligible only when every row below resolves to `PASS`
against `origin/dev`. This packet deliberately follows the fresh `PH1GC-*`
authority, not the older `ADM-UAT-001` / `WF-ADM-001-*` `done` markers.

| # | Acceptance requirement | Verification command / oracle | PASS criterion | Source |
| --- | --- | --- | --- | --- |
| 1 | `docs/04-uat/platform-admin-control-plane-uat-20260519.md` is present on `origin/dev`. | `git fetch origin && git ls-tree -r origin/dev -- docs/04-uat/platform-admin-control-plane-uat-20260519.md` | Exactly one tree entry is returned for the path. | Parent acceptance row 1; status truth §5 |
| 2 | The landed UAT covers all 11 directive §I control-plane areas: tenant create, module enablement, tenant quotas, partner entry setup, partner credential issue/revoke, adapter health, pricing publish, feature flag toggle, rollout stage, rollback hold, audit verification. | Review the landed doc against the implementation-spec §I checklist. A quick static oracle is `grep -n "tenant\\|module\\|quota\\|partner\\|credential\\|adapter\\|pricing\\|flag\\|rollout\\|rollback\\|audit" docs/04-uat/platform-admin-control-plane-uat-20260519.md`. | Every required control-plane area is explicitly named, not implied. | Parent acceptance row 2; implementation spec §I |
| 3 | The landed UAT stays aligned with the current `origin/dev` platform-admin surfaces instead of depending on non-landed branch-only paths. | Review citations in the landed doc against the baseline anchor inventory in §2.2 of this packet. | The UAT cites current tenant, partner, pricing, adapter, flag, and audit surfaces that are actually visible from `origin/dev`. | Status truth §2.1; baseline anchors in this packet |
| 4 | The UAT explicitly treats `PH1GC-E2E-011` as the companion automation that must assert every area, include RBAC negatives, preserve pricing version semantics, and prove rollback-hold blocks production promotion. | Compare the landed UAT wording to the `PH1GC-E2E-011` acceptance in canonical `ai-status.json`; optionally inspect recovery script commit `0d666298f51166712bfbf9a6ac2973117a169792`. | The UAT does not downscope the companion script below the machine-truth acceptance bar. | Parent acceptance row 3; `PH1GC-E2E-011` acceptance |
| 5 | Parent closeout does not over-claim the matrix uplift. `WF-ADM-001` row creation and gate-read update belong to `PH1GC-MATRIX-001`. | Review the parent handoff / closeout note. | Closeout says the UAT artifact is ready for matrix consumption; it does not pretend the matrix row already changed. | Parent acceptance row 4; `PH1GC-MATRIX-001` acceptance |
| 6 | Parent closeout follows directive §7 format exactly. | Compare closeout text to the template in §5 of this packet. | All 13 required fields are present. | Parent acceptance row 5; implementation spec §7 |

---

## 2. Dependency map

### 2.1 Formal upstream dependencies

`PH1GC-ADM-001.depends_on=[]` in canonical machine truth. There is no formal
blocker before the parent owner can write the UAT file.

### 2.2 Practical baseline anchors on current `origin/dev`

These are the safest current-source anchors for the parent UAT because they are
already present on `origin/dev` today.

| Surface | Current anchor | Why it matters to `PH1GC-ADM-001` |
| --- | --- | --- |
| Tenant create / settings / onboarding / rollout / rollback-hold API | `apps/api/src/modules/platform-admin/tenants.controller.ts:17-103` | Confirms create, settings, onboarding, rollout, rollback-hold, activate, and suspend are real platform-admin mutation routes. |
| Tenant rollout + rollback-hold UI | `apps/platform-admin-web/app/tenants/[tenantId]/page.tsx:380-403` | Shows the page actually calls rollout promotion and rollback-hold actions. |
| Partner credential one-time plaintext UI | `apps/platform-admin-web/app/partners/[entrySlug]/page.tsx:1198-1223` | Shows issuance action and transient plaintext credential banner. |
| Pricing publish validation + submit | `apps/platform-admin-web/app/pricing/page.tsx:748-764` | Shows effective-window validation and `publishPlatformPricingRule()` call. |
| Adapter health / rollout / credential posture | `apps/platform-admin-web/app/adapter-registry/components/AdapterList.tsx:313-375` | Gives the adapter-health surface the parent UAT must cite for the `adapter health` control-plane area. |
| Feature-flag toggle surface | `apps/platform-admin-web/app/feature-flags/page.tsx:584-620` | Shows the platform-default flag state and toggle action UI. |
| Audit table surface | `apps/platform-admin-web/app/audit/page.tsx:340-380` | Shows actor / module / action / resource / tenant / timestamp visibility needed for audit verification. |
| API client control-plane methods | `packages/api-client/src/index.ts:1889-2143` | Confirms create tenant, create partner entry, issue credential, publish pricing rule, set rollout stage, and rollback hold calls exist in the shared client. |

### 2.3 Recovery anchors from the prior v3 branch-only work

Canonical status truth says `origin/dev` is still missing the required UAT and
E2E files even though older tasks were marked `done`. The following commits are
useful recovery inputs but are **not** themselves proof of PH1GC completion.

| Historical task | Branch-only anchor | What the parent owner can safely reuse |
| --- | --- | --- |
| `ADM-UAT-001` | `git show 64abc10:docs/04-uat/platform-admin-control-plane-uat-20260519.md` on `origin/codex2/adm-uat-001` | A complete draft UAT with gate framing plus eight scenario sections `ADM-001`..`ADM-008`. It already covers tenant create, RBAC denial, partner credential issuance, one-time plaintext, pricing publish, invalid publish window, rollout / rollback hold, and audit. |
| `WF-ADM-001-E2E` | `git show 0d666298f51166712bfbf9a6ac2973117a169792:tests/e2e/E2E-011-platform-admin-control-plane.sh` on `origin/codex2/wf-adm-001-e2e` | A finished E2E shell whose pass criteria already include partner credential, pricing version, rollback-hold-blocks-promote, and audit action counts. |
| `WF-ADM-001-E2E` aux files | `git show 0d666298f51166712bfbf9a6ac2973117a169792:tests/e2e/README.md` and `...:docs/04-uat/fbp-014a-e2e-matrix.md` | Existing README / E2E-matrix wording for suite `011` and the WF-ADM-001 mapping. |
| `WF-ADM-001-MATRIX` | `git show 91f8f1e49b9bc51d90ed578047cb7597f20df540:docs/03-runbooks/phase1-workflow-acceptance-release-gates.md | grep WF-ADM-001` | The earlier HOLD row wording. Useful for consistency, but PH1GC closeout still needs the fresh matrix task. |

### 2.4 Downstream consumers

| Consumer | Relationship after `PH1GC-ADM-001` lands |
| --- | --- |
| `PH1GC-E2E-011` | Formal dependency. Canonical `ai-status.json` says `PH1GC-E2E-011.depends_on=["PH1GC-ADM-001"]`. The script should treat the landed UAT as its scenario oracle. |
| `PH1GC-MATRIX-001` | Practical dependency. The matrix task adds `WF-ADM-001` and needs the landed UAT path as part of the named verification chain. |
| `PH1GC-MATRIX-002` | Practical dependency. The E2E/UAT matrix reconciliation task should point suite `011` at the landed UAT and script paths once both exist on `origin/dev`. |

### 2.5 Explicit non-scope

- This parent task does **not** land `tests/e2e/E2E-011-platform-admin-control-plane.sh`; that is `PH1GC-E2E-011`.
- This parent task does **not** mutate `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`; that is `PH1GC-MATRIX-001`.
- This parent task does **not** claim staging execution, production rollout readiness, live partner traffic, or external adapter proof.
- This parent task does **not** reopen product semantics. It is a gap-closure delivery task for a missing file on `origin/dev`.

---

## 3. Reviewer support packet

### 3.1 Minimum safe content to recover from prior work

If the parent owner chooses to recover rather than rewrite from scratch, the
branch-only `ADM-UAT-001` draft already contains a conservative baseline:

- Gate framing with `WF-ADM-001` `HOLD` wording and explicit non-claims.
- Eight scenario rows: `ADM-001` through `ADM-008`.
- Positive tenant bootstrap coverage.
- Negative RBAC coverage for low-privilege actors.
- Partner credential issuance and one-time plaintext visibility.
- Pricing publish with versioned effective window and invalid-window rejection.
- Rollout stage promotion plus rollback hold.
- Audit review with actor / module / action lineage.

That baseline appears in `git show 64abc10:docs/04-uat/platform-admin-control-plane-uat-20260519.md`.

### 3.2 Minimum companion-script expectations already encoded elsewhere

The prior branch-only `WF-ADM-001-E2E` script already proves the acceptance bar
the parent should point to:

- Pass criteria explicitly name tenant create, partner credential, pricing
  version, rollback-hold-blocks-promote, and audit checks.
- The script writes a unique tenant code, partner entry slug, and pricing
  version per run.
- It verifies credential plaintext is only returned on issue, then hidden on
  list read-back.
- It asserts audit counts for tenant, partner, credential, pricing, and rollout
  mutation families.

Primary recovery command:

```bash
git show 0d666298f51166712bfbf9a6ac2973117a169792:tests/e2e/E2E-011-platform-admin-control-plane.sh
```

Auxiliary references:

```bash
git show 0d666298f51166712bfbf9a6ac2973117a169792:tests/e2e/README.md
git show 0d666298f51166712bfbf9a6ac2973117a169792:docs/04-uat/fbp-014a-e2e-matrix.md
```

### 3.3 Matrix alignment note

`WF-ADM-001` was previously drafted as a `HOLD` row that pointed to the UAT and
E2E artifacts as forthcoming. That wording is still a good non-overclaim guard,
but it is not canonical until `PH1GC-MATRIX-001` lands the fresh matrix update
on `origin/dev`.

Reference command:

```bash
git show 91f8f1e49b9bc51d90ed578047cb7597f20df540:docs/03-runbooks/phase1-workflow-acceptance-release-gates.md | grep -n -A2 -B2 "WF-ADM-001"
```

---

## 4. Risks and guardrails

1. Do not mark the parent `done` from machine truth alone. Status truth §1 and
   §3 exist because prior v3 `done` markers did not land the required files on
   `origin/dev`.
2. Do not treat the branch-only `ADM-UAT-001` artifact as canonical closure.
   It is a recovery source, not proof of delivery.
3. Do not let the parent UAT downscope `adapter health` or `feature flag`
   coverage just because the earlier v3 draft kept those areas mostly in source
   anchors. `PH1GC-ADM-001` acceptance explicitly names all 11 areas.
4. Do not let the parent closeout imply the matrix row already changed. Matrix
   uplift belongs to `PH1GC-MATRIX-001`.
5. Do not let the parent closeout imply the E2E already landed. Script landing
   belongs to `PH1GC-E2E-011`.

---

## 5. Closeout report template

Parent owner can reuse this block directly when handing off and finalizing the
parent task. It mirrors directive §7 verbatim.

```text
Task ID: PH1GC-ADM-001
Owner: Codex2
Reviewer: Codex
Branch:
PR:
Commit:
Files changed:
Verification commands:
Evidence artifact:
Workflow family affected:
Gate read before:
Gate read after:
Remaining non-claim:
External dependencies, if any:
```

Recommended notes for the `Gate read after` / `Remaining non-claim` lines:

- `Gate read after`: `WF-ADM-001` UAT artifact landed on `origin/dev`; matrix uplift still owned by `PH1GC-MATRIX-001`.
- `Remaining non-claim`: `tests/e2e/E2E-011-platform-admin-control-plane.sh` not shipped by this task; no live staging claim unless the separate E2E task lands and is rerun.

---

## 6. Reviewer notes

- This sidecar should be approved only if the diff adds or updates
  `support/sidecars/PH1GC-ADM-001/PH1GC-ADM-001-SIDECAR-ACCEPTANCE.md` and
  nothing else task-owned.
- The packet's job is to make the parent closeout precise. It does not change
  the parent acceptance bar.
- If `PH1GC-E2E-011` or `PH1GC-MATRIX-001` changes its acceptance wording
  before the parent closes, refresh §1 rows 4-5 and §2.4 before approving the
  parent closeout.

---

## 7. Provenance

- Author lane: `Codex`.
- Generated under task `PH1GC-ADM-001-SIDECAR-ACCEPTANCE` on `2026-05-22`.
- No canonical truth was mutated by this sidecar. The missing UAT file, the
  missing E2E script, and the missing matrix reconciliation remain parent or
  sibling-task work.
