# Phase 1 v3 — Final Resolution of Open Questions (2026-05-19)

**Date:** 2026-05-19
**Status:** APPROVED / authoritative
**Supersedes:** the recommended defaults in [`phase1-v3-conflicts-and-open-questions-20260519.md`](phase1-v3-conflicts-and-open-questions-20260519.md) §6.
**Companion:** [`phase1-v3-design-blueprint-completion-wave-planning-20260519.md`](../03-runbooks/phase1-v3-design-blueprint-completion-wave-planning-20260519.md)

User explicitly approved the 4 reconciliation decisions for the Phase 1 v3 wave on 2026-05-19. The wave was already running on recommended defaults at the time of approval; this document is the formal record.

---

## Q1 — E2E shell-script numbering: **A**

**Decision:** Keep existing dev E2E numbering. Do not rename shipped E2E files.

```text
E2E-007  Partner Airport Transfer            (UNCHANGED, shipped)
E2E-008  Partner Booking Cutover             (UNCHANGED, shipped)
E2E-009  Production Rail Dry-Run             (UNCHANGED, shipped via PR #162)

E2E-010  Governance-aware Billing / Reporting (NEW, per directive's §3.7)
E2E-011  Platform Admin Control Plane        (NEW, per directive's §3.8)
```

**Rationale:**

- `origin/dev` is the canonical source of truth; branch strategy is dev → publish/v\* → main → prod/v\*.
- E2E numbers are not just filenames — they're referenced by UAT matrix, release gates, sidecars, evidence packs, task closeouts.
- Renaming shipped E2E files would create churn AND risk breaking existing release evidence (release gate matrix requires every workflow family to have a named verification path).

**Mandatory updates:**

- `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`
- `docs/04-uat/fbp-014a-e2e-matrix.md`
- `support/sidecars/*` references

**Prohibited:**

- Renaming any shipped E2E file.
- Modifying historical evidence numbers in completed sidecars.
- Breaking dev's existing evidence trail to match directive numbering.

---

## Q2 — `WF-PARTNER-001` vs `WF-PRT-001`: **A**

**Decision:** Rename `WF-PRT-001` → `WF-PARTNER-001`. No alias.

**Rationale:**

- Same scope, different ID — keeping an alias would split documentation/UAT/E2E/sidecar references across two names.
- Phase 1's Partner Booking App cutover topology covers partner booking + eligibility + booking-create + minimal tracking under one partner-entry semantic; the workflow family ID should be fully spelled "PARTNER", not the abbreviation "PRT".

**Mandatory updates:**

- 1 matrix row (`WF-PRT-001` → `WF-PARTNER-001`)
- 1 sidecar reference (the single sidecar that names `WF-PRT-001` directly)
- Related closeout / evidence wording

**Final ID:**

```text
WF-PARTNER-001  Partner Eligibility / Airport Transfer Flow
```

---

## Q3 — `WF-FIN-GOV-001` vs `WF-FIN-001`: **B**

**Decision:** Keep BOTH rows.

```text
WF-FIN-001      Baseline Billing / Invoice / Report Export
WF-FIN-GOV-001  Governance-aware Billing / Reporting / Settlement
```

**Rationale:**

- `WF-FIN-001` already exists in the release gate matrix and represents baseline billing / invoice / report export / permissioned download. Its current gate read is `PASS (static evidence)`. Renaming would break existing release-gate semantics.
- The post-v2 governance work (cost center, approval rules, quota, approval workflow, billing/reporting enrichment, cost-center linkage, quota/approval/audit) extends beyond baseline finance. This belongs in a NEW row, not as a rewrite of the old.

### Dependency

```text
WF-FIN-GOV-001 depends on:
- WF-TGV-001 (Tenant Governance — supplies cost-center / quota / approval semantics)
- WF-FIN-001 (Baseline Finance — supplies invoice / report / settlement carrier)
```

### Gate scope

**`WF-FIN-001` (unchanged) verifies:**

- invoice generation
- report export
- sensitive artifact access
- download audit
- basic tenant billing profile

**`WF-FIN-GOV-001` (new) verifies:**

- `costCenterCode` appears in billing / reporting
- `costCenterName` / `owner` metadata enrichment
- `legacy_unmapped` flag
- approval evaluation snapshot reference
- quota usage reference
- partner program / eligibility reference when applicable
- audit trail for governance-aware finance output

### Corresponding E2E

```text
E2E-010-governance-aware-billing-reporting.sh
```

---

## Q4 — 17 directive design docs: **C** (hybrid)

**Decision:** 5 substantive net-new docs + 12 thin stubs pointing at existing canonical artifacts.

**Rationale:**

- Full 17 substantive docs would duplicate large amounts of existing closeout / execution-packet / release-gate / UI-parity content (churn risk).
- A single reconciliation map might be rejected by the design team as "not what was asked for".
- Hybrid: substantive docs only where capabilities are genuinely missing; stubs everywhere else, with explicit pointers to canonical artifacts.
- `origin/dev` already has Tenant Governance closeout, Tenant Console closeout, Platform Admin closeout, Driver App closeout, Partner Booking topology, branch strategy, etc. These must be indexed and gap-filled, not rewritten.

### 5 substantive net-new docs

| #   | Path                                                                         | Purpose                                                                                                                                                                                                                                                                                                                                    |
| --- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md`           | Unify origin/dev's latest implementation with Phase 1 blueprint reality. Must list per-area state: `repo-local done` / `UI done` / `backend contract done` / `staging evidence` / `sandbox evidence` / `external-gated` / `production-gated` / `deferred Phase 2`. Resolves the date drift between 2026-05-14 / 2026-05-18 / current-work. |
| 2   | `docs/03-runbooks/phase1-release-truth-sync-20260519.md`                     | Unify workflow gate / E2E numbering / sidecar evidence / publish/main/prod tag release truth. Must include: E2E numbering decision (Q1), WF ID decision (Q2), release gate row mapping, sidecar reference mapping, publish/v* and prod/v* source-of-truth rule, non-claim language.                                                        |
| 3   | `docs/02-architecture/partner-eligibility-airport-transfer-spec-20260519.md` | Complete WF-PARTNER-001 spec. Must include: entrySlug / partner entry identity, eligibility mode, issuer/bank sandbox requirement, cardLast4 / reference token masking, manual review, booking linkage, flight / terminal / luggage, billing / reporting linkage, audit / evidence retention, negative paths.                              |
| 4   | `docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md`   | Define WF-FIN-GOV-001. Must include: costCenterCode reporting authority, costCenterName / owner enrichment, legacy_unmapped flag, quota usage summary, approval evaluation snapshot, approval request reference, partner eligibility reference, invoice / report / settlement export fields, audit requirements.                           |
| 5   | `docs/04-uat/platform-admin-control-plane-uat-20260519.md`                   | UAT for WF-ADM-001. Must include: tenant creation, module enablement, tenant quotas, partner entry setup, partner credentials, adapter health, pricing publish, feature flags, rollout stage, rollback hold, audit verification. Corresponds to `tests/e2e/E2E-011-platform-admin-control-plane.sh`.                                       |

### 12 thin stubs

Each stub must do **only three things**:

1. Declare itself as a "directive-required thin stub".
2. Point to the canonical existing artifact.
3. State the restate-prohibition (do not redefine product semantics).

**Required format:**

```markdown
# <Stub Title>

Status: directive-required thin stub
Canonical artifact: <path>

This file does not redefine product semantics. It points reviewers to the current source of truth.

## Do not restate

...

## Current source of truth

...
```

**Stub-to-canonical mapping:**

| Stub topic                    | Canonical artifact                                                             |
| ----------------------------- | ------------------------------------------------------------------------------ |
| Tenant Governance backend     | `docs/03-runbooks/tenant-governance-wave-closeout-20260514.md`                 |
| Tenant Governance execution   | `docs/03-runbooks/tenant-governance-wave-execution-packet-20260513.md`         |
| Tenant Console UI             | `docs/05-ui/tenant-console-redesign-closeout-20260514.md`                      |
| Platform Admin UI             | `docs/05-ui/platform-admin-redesign-closeout-20260518.md`                      |
| Driver App UI                 | `docs/05-ui/driver-app-redesign-closeout-20260512.md`                          |
| Partner Booking topology      | `docs/01-decisions/SD-DP-20260512-006-partner-booking-app-cutover-topology.md` |
| Partner Booking repo-local UI | `apps/partner-booking-web/README.md`                                           |
| Branch strategy               | `docs/ops/branch-strategy.md`                                                  |
| Workflow acceptance matrix    | `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`                 |
| Tenant contracts              | `packages/contracts/src/index.ts`                                              |
| UI design canvas              | `docs/05-ui/drts-design-canvas/`                                               |
| Driver App design canvas      | `docs/05-ui/driver-app-design-20260507/`                                       |

The above 12 stubs satisfy directive §6's literal demand for 17 named files while avoiding redundant rewrite of canonical artifacts.

---

## Summary (one-screen for dev team)

```text
Q1 = A   keep dev's E2E-007/008/009 unchanged
         + add E2E-010 (gov-billing) + E2E-011 (admin)

Q2 = A   rename WF-PRT-001 → WF-PARTNER-001 (no alias)

Q3 = B   keep WF-FIN-001 baseline + new WF-FIN-GOV-001 enrichment row
         (depends on WF-TGV-001 + WF-FIN-001; covered by E2E-010)

Q4 = C   5 substantive net-new docs + 12 thin stubs pointing at canonical
         (do not rewrite shipped closeout artifacts)
```

## Files to update (final list)

```text
docs/03-runbooks/phase1-workflow-acceptance-release-gates.md       (rename + 2 new rows)
docs/04-uat/fbp-014a-e2e-matrix.md                                  (add E2E-010 + E2E-011)

docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md    (NEW substantive)
docs/03-runbooks/phase1-release-truth-sync-20260519.md              (NEW substantive)
docs/02-architecture/partner-eligibility-airport-transfer-spec-20260519.md  (NEW substantive)
docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md    (NEW substantive)
docs/04-uat/platform-admin-control-plane-uat-20260519.md            (NEW substantive)

tests/e2e/E2E-010-governance-aware-billing-reporting.sh             (NEW E2E)
tests/e2e/E2E-011-platform-admin-control-plane.sh                   (NEW E2E)

# Plus 12 thin stubs per the table above.
```

## Final resolution

These four decisions are no longer open for discussion. Dev team executes per `A / A / B / C` as detailed above. This preserves origin/dev's existing implementation + evidence trail while completing the directive's Phase 1 design blueprint.
