# Phase 1 v3 — Conflicts and Open Questions

**Date:** 2026-05-19
**Author:** Claude
**Source directive:** [`phase1-design-blueprint-completion-directive-20260519.md`](phase1-design-blueprint-completion-directive-20260519.md)
**Companion runbook:** [`phase1-v3-design-blueprint-completion-wave-planning-20260519.md`](../03-runbooks/phase1-v3-design-blueprint-completion-wave-planning-20260519.md)

This document captures **all the points where the directive conflicts with or duplicates what is already in `origin/dev`** after PR #161 (wave merge campaign) and PR #162 (production rail closeout) landed. Each conflict needs a human decision before the affected tasks can be dispatched cleanly.

---

## 1. E2E shell-script numbering conflicts

The directive picks E2E numbers that conflict with what already shipped in dev.

| Directive says                                                         | Existing dev has                                                                           | Conflict             |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------- |
| `tests/e2e/E2E-007-partner-booking-pilot.sh` (PBK pilot cutover, §3.4) | `tests/e2e/E2E-007-partner-airport-transfer.sh` (`TST-E2E-007-PRT`, partner eligibility)   | **Numbers swapped**  |
| `tests/e2e/E2E-008-partner-eligibility-airport-transfer.sh` (§3.5)     | `tests/e2e/E2E-008-partner-booking-cutover.sh` (`TST-E2E-008-PBK-CUTOVER`)                 | **Numbers swapped**  |
| `tests/e2e/E2E-009-governance-billing-reporting.sh` (§3.7)             | `tests/e2e/E2E-009-prod-rail-dry-run.sh` (`TST-E2E-009-PROD-RAIL`, just landed in PR #162) | **Direct collision** |

### Question 1: which numbering wins?

**Option A — keep existing dev numbering (recommended):**

- `E2E-007` = partner-airport-transfer (unchanged)
- `E2E-008` = partner-booking-cutover (unchanged)
- `E2E-009` = prod-rail-dry-run (unchanged)
- New: `E2E-010` = governance-billing-reporting (was directive's E2E-009)
- New: `E2E-011` = platform-admin-control-plane (was directive's E2E-010)
- **Cost:** directive's text doesn't match shipped reality; need to footnote
- **Benefit:** no rename of shipped artifacts, no broken matrix refs, no broken sidecar refs

**Option B — re-renumber to match directive:**

- Rename `E2E-007-partner-airport-transfer.sh` → `E2E-008-partner-eligibility-airport-transfer.sh`
- Rename `E2E-008-partner-booking-cutover.sh` → `E2E-007-partner-booking-pilot.sh`
- Rename `E2E-009-prod-rail-dry-run.sh` → e.g. `E2E-011-prod-rail-dry-run.sh`
- New: `E2E-009-governance-billing-reporting.sh`
- New: `E2E-010-platform-admin-control-plane.sh`
- **Cost:** rename 3 shipped files, update matrix rows, update sidecars, update task briefs, update all PR descriptions. PR #162 just merged — re-renumbering it within 24h is messy.
- **Benefit:** directive text matches shipped reality exactly.

---

## 2. Workflow-family ID conflicts

| Directive ID            | Existing matrix ID                                                | Same scope?                                                                          | Action              |
| ----------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------- |
| `WF-PARTNER-001` (§3.5) | `WF-PRT-001` (already in matrix, status `PASS (static evidence)`) | YES — both cover partner eligibility + airport transfer                              | **Rename or alias** |
| `WF-FIN-GOV-001` (§3.7) | `WF-FIN-001` (already in matrix, status `PASS (static evidence)`) | Mostly — directive adds explicit governance dimensions to existing billing/reporting | **Rename or split** |

### Question 2: WF-PARTNER-001 vs WF-PRT-001 — which name wins?

**Option A — rename existing `WF-PRT-001` → `WF-PARTNER-001` (recommended):**

- Match directive
- Update the one matrix row + any sidecar refs
- Low cost since only 1 sidecar mentions `WF-PRT-001` directly
- **Cost:** small rename
- **Benefit:** directive consistency

**Option B — keep `WF-PRT-001`, treat `WF-PARTNER-001` as an alias:**

- Add note in matrix: "WF-PARTNER-001 is an alias for WF-PRT-001"
- **Cost:** semantic confusion for future readers
- **Benefit:** zero rename cost

### Question 3: WF-FIN-GOV-001 vs WF-FIN-001 — rename, split, or alias?

The existing `WF-FIN-001` covers "billing, invoice, report export, sensitive artifact access" — generic finance. The directive's `WF-FIN-GOV-001` is more specific: "governance-aware billing including cost-center / quota / approval / partner-program / platform-earnings dimensions."

**Option A — rename `WF-FIN-001` → `WF-FIN-GOV-001` (matches directive):**

- Lose the generic-finance framing
- New row name better reflects what's actually in scope post-Phase-1-v2

**Option B — keep both, with `WF-FIN-001` as parent and `WF-FIN-GOV-001` as governance dimension (recommended):**

- `WF-FIN-001` = base billing/reporting (existing PASS (static evidence))
- `WF-FIN-GOV-001` = governance-aware enrichment (new row, depends on `WF-FIN-001` + `WF-TGV-001`)
- Cleaner conceptual model

---

## 3. The "design team must produce 17 specs FIRST" gate

The directive §6 lists 17 specific design docs the design team must produce before dev work proceeds. **All 17 are missing** from `origin/dev`.

However, the underlying capabilities are mostly **already shipped** in dev:

| Directive demands (§6)                            | Equivalent existing artifact                                                                                                                                                                               |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `origin-dev-blueprint-alignment-audit`            | none (genuinely new)                                                                                                                                                                                       |
| `tenant-governance-workflow-release-gate` runbook | `WF-TGV-001` row in matrix + `support/sidecars/BE-*` + `tests/e2e/E2E-005-tenant-governance.sh` (all in dev, but no named runbook)                                                                         |
| `partner-booking-live-cutover-plan` runbook       | `docs/03-runbooks/partner-booking-pilot-cutover-runbook-20260519.md` (slightly different name; created by `PBK-CUTOVER-001`)                                                                               |
| `production-deploy-rail-spec` runbook             | `docs/03-runbooks/prod-deploy-rollback-runbook-20260519.md` (created by `PROD-RAIL-001`) + `support/sidecars/PROD-RAIL-CLOSEOUT-20260519/PROD-RAIL-CLOSEOUT-EVIDENCE.md` (created by `PROD-RAIL-CLOSEOUT`) |
| `production-rollback-drill` runbook               | partial — rollback section exists in prod-deploy-rollback-runbook, but no formal drill doc                                                                                                                 |
| `release-truth-sync-runbook`                      | none (genuinely new, but `WF-REL-001` scope)                                                                                                                                                               |
| `forwarder-adapter-proof-spec`                    | `docs/02-architecture/forwarder-sandbox-provider.md` (created by `FWD-SBX-001`) covers similar ground                                                                                                      |
| `partner-eligibility-airport-transfer-spec`       | none (capabilities exist via TGV + PRT artifacts, but no consolidated spec)                                                                                                                                |
| `cti-recording-filing-blueprint`                  | partial — `support/sidecars/COM-LIVE-001/COM-LIVE-001-EVIDENCE-PACK.md` + `apps/api/src/modules/callcenter/sandbox-webhook.adapter.ts` cover the runtime; no formal blueprint                              |
| `governance-aware-billing-reporting-spec`         | none (capabilities partly exist in `support/sidecars/FIN-GOV-001/`, no formal spec)                                                                                                                        |
| 7 UAT scenario docs                               | none (E2E shell scripts encode scenarios; no separate UAT prose doc)                                                                                                                                       |

### Question 4: how should we treat the 17 design docs?

**Option A — produce them all as a documentation wave (recommended):**

- Most are formalizations of existing artifacts; can be written quickly by referencing what's already shipped
- Auto-workers can parallelize across the 17
- Defer the truly net-new docs (`origin-dev-blueprint-alignment-audit`, `release-truth-sync-runbook`, `governance-aware-billing-reporting-spec`, `platform-admin-control-plane-uat`) for direct design-team authorship
- **Cost:** ~17 small PRs or one bundled PR with 17 docs
- **Benefit:** matches directive verbatim; gives design team a single artifact to review

**Option B — formally close the gap by adding 1 "reconciliation map" doc:**

- Skip producing 17 separate docs
- Instead produce one consolidated reconciliation doc that, for each of the 17, points at the existing artifact that satisfies its purpose
- **Cost:** minimal
- **Benefit:** no duplicate documentation
- **Risk:** design team may reject as "not what we asked for"

**Option C — hybrid (recommended for actual execution):**

- Auto-workers produce the 5 genuinely-missing docs (blueprint alignment, release truth sync, partner-eligibility spec, governance-aware billing spec, platform-admin UAT)
- For the other 12, file thin "see also" stubs that point at existing artifacts and assert the existing artifacts close the directive's intent
- **Cost:** ~5 substantial docs + 12 stubs
- **Benefit:** practical compromise

---

## 4. Genuinely net-new work (no conflicts)

These items are unambiguous, dispatch-ready:

| Task                                                                                 | Why net-new                                                                                                                        |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `DEV-SYNC-001`                                                                       | New audit doc — `origin-dev-blueprint-alignment-audit`                                                                             |
| `WF-ADM-001` matrix row + UAT doc + (new) E2E shell for platform-admin control plane | Not in existing matrix; not in existing E2E suite                                                                                  |
| `WF-REL-001` matrix row + release-truth-sync runbook                                 | Not in existing matrix; not in existing runbook set                                                                                |
| Real-device proof preparation for `WF-DRV-MP-001`                                    | Existing `DRV-DEVICE-001` is a placeholder evidence packet; physical Android + iPhone evidence still HOLD pending hardware + human |
| Production rollback drill doc + actual drill run                                     | Existing prod-deploy-rollback-runbook covers commands; no separate "drill" doc + no drill run evidence                             |
| Live forwarder sandbox / partner-eligibility issuer / CTI provider activation        | All three remain `EXTERNAL-GATED` / `HOLD` pending external credentials                                                            |

### Resolved routing note: live forwarder sandbox partner authority

This item does not need a new in-repo product contract before the v3 docs wave
continues.

- `FWD-SPEC-001` is the design-doc formalization task for the generic
  `forwarder_sandbox` proof boundary.
- `WF-FWD-001-LIVE-SANDBOX` stays `HELD` and routes through
  `support/sidecars/EXT-002/EXT-002-FORWARDER-ADAPTER-GATE.md`.
- "Grab Taiwan or equivalent" remains acceptable planning shorthand until the
  external owner names the concrete partner contract authority, but no live
  proof claim may be made from sandbox/stub evidence alone.

## 5. Phase 1 v2 completion status (for context)

Before answering Phase 1 v3's questions, note where v2 actually got us:

| WF family                       | Current gate read (post-PR #162)            | Directive's target                                   |
| ------------------------------- | ------------------------------------------- | ---------------------------------------------------- |
| `WF-RLS-001`                    | `PASS (live staging evidence)`              | unchanged                                            |
| `WF-PROD-001`                   | `PASS (dry-run contract evidence)`          | `PASS (production dry-run / drill evidence)`         |
| `WF-TEN-001`                    | `PASS (live staging evidence)`              | unchanged                                            |
| `WF-ORD-001`                    | `PASS (live staging evidence)`              | unchanged                                            |
| `WF-DSP-001`                    | `PASS (live staging evidence)`              | unchanged                                            |
| `WF-DRV-001`                    | `PASS (static evidence)`                    | unchanged                                            |
| `WF-TGV-001`                    | row present                                 | `PASS (live staging evidence)`                       |
| `WF-DRV-MP-001`                 | row missing                                 | `PASS (sandbox/live staging) + Android/iOS evidence` |
| `WF-FWD-001`                    | `EXTERNAL-GATED`                            | `PASS (sandbox evidence)` minimum                    |
| `WF-PBK-001`                    | row present                                 | `PASS (pilot evidence)` for ≥1 partner entry         |
| `WF-PRT-001` / `WF-PARTNER-001` | `PASS (static evidence)` under `WF-PRT-001` | resolved in §2 above                                 |
| `WF-COM-001`                    | `PASS (sandbox evidence)`                   | unchanged (already meets directive)                  |
| `WF-FIN-001` / `WF-FIN-GOV-001` | `PASS (static evidence)` under `WF-FIN-001` | resolved in §2 above                                 |
| `WF-ADM-001`                    | row missing                                 | `PASS (E2E)`                                         |
| `WF-REL-001`                    | row missing                                 | sync runbook + audit                                 |

Most of v3's "gate uplift" goals depend on environment-external steps (real GCP project, real partner credentials, physical devices, real CTI provider) that are out of repo-only control. The directive acknowledges this in its "Evidence classification" §2.3 but the work-list §4 treats some of them as immediately dispatchable. **In practice, several are HOLD-pending-human.**

---

## 6. Recommended decisions (for user approval)

| #   | Question                         | Recommended                                                                             |
| --- | -------------------------------- | --------------------------------------------------------------------------------------- |
| 1   | E2E numbering                    | **Option A: keep existing dev numbering; remap directive's E2E-009/010 → E2E-010/011**  |
| 2   | `WF-PARTNER-001` vs `WF-PRT-001` | **Option A: rename `WF-PRT-001` → `WF-PARTNER-001`**                                    |
| 3   | `WF-FIN-GOV-001` vs `WF-FIN-001` | **Option B: keep both — `WF-FIN-001` baseline, `WF-FIN-GOV-001` governance enrichment** |
| 4   | The 17 design docs               | **Option C: hybrid — 5 net-new docs + 12 thin "see also" stubs**                        |

If you approve these recommendations as-is, the dispatch list in §5 of the planning runbook is ready to fire. If you prefer different choices, the planning runbook's task list needs to be re-shaped before dispatch.

---

## 7. Final resolution (2026-05-19, APPROVED)

**User approved `A / A / B / C` on 2026-05-19.** Authoritative record + 12 stub-to-canonical mappings: [`phase1-v3-resolution-20260519.md`](phase1-v3-resolution-20260519.md). The recommended defaults this wave was running on are now formally adopted. No further open questions; this document is closed for revision.
