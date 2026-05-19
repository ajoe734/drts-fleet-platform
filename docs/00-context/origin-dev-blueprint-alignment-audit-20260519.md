# Origin/dev Blueprint Alignment Audit

Date: 2026-05-19  
Method: repo-first audit against the current `origin/dev` design-closure wave,
using the Phase 1 v3 directive as the evaluation baseline.

## Scope

This audit answers one narrow question:

> Does current `origin/dev` already match the Phase 1 v3 design blueprint
> intent, or does it only contain the implementation fragments that still need
> to be formalized into workflow-family release gates and release-truth docs?

The review used:

- `docs/00-context/phase1-design-blueprint-completion-directive-20260519.md`
- `docs/00-context/phase1-v3-conflicts-and-open-questions-20260519.md`
- `docs/03-runbooks/phase1-v3-design-blueprint-completion-wave-planning-20260519.md`
- `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`
- `docs/ops/branch-strategy.md`
- `.github/workflows/nightly-publish.yml`
- `.github/workflows/hourly-promote.yml`
- `.github/workflows/deploy-prod.yml`
- `tests/e2e/*`
- `support/sidecars/*` anchors referenced by the release-gate matrix
- repo application surfaces under `apps/api`, `apps/driver-app`,
  `apps/platform-admin-web`, and `apps/partner-booking-web`

## Executive Verdict

`origin/dev` is materially ahead of the directive's starting assumption.
Most of the underlying implementation and several verification rails already
exist, but the repo is not yet aligned with the v3 blueprint at the
documentation-and-governance layer.

The practical verdict is:

- implementation reality is **substantially aligned**
- workflow-family release-language is **partially aligned**
- v3 design-blueprint deliverables are **not yet complete**
- release-truth synchronization is **not yet fully formalized**

So the correct claim is not "v3 blueprint complete." The correct claim is:

> `origin/dev` already contains much of the product and verification substrate
> that the v3 directive asks for, but several business-flow families still need
> explicit workflow-gate framing, release-truth documentation, or external
> evidence before the directive's completion standard is satisfied.

## Snapshot Of What `origin/dev` Already Has

The directive's §1.1 summary is directionally correct.

| Area from directive §1.1 | `origin/dev` reality | Audit verdict |
| --- | --- | --- |
| Canonical backend / BFF | `apps/api` remains the repo's backend and contract authority surface, with workflow-family references already anchored in the release-gate matrix. | `aligned` |
| Tenant Governance backend | `tests/e2e/E2E-005-tenant-governance.sh` exists and `WF-TGV-001` is already referenced by the matrix's negative-path expansion. | `mostly_aligned_but_formal_runbook_missing` |
| Tenant Console UI | Prior closeout state is consistent with the directive's "UI largely done" claim; the v3 issue is business-flow framing, not UI absence. | `aligned` |
| Platform Admin UI | `apps/platform-admin-web/app` exists and is no longer a stub-only shell. | `aligned` |
| Driver App UI | `apps/driver-app/app` exists; the driver app is present as a real surface, not only a design shell. | `aligned` |
| Partner Booking Web | `apps/partner-booking-web/app` exists repo-locally as the white-label booking surface. | `aligned_with_non_claim` |
| Branch strategy | `docs/ops/branch-strategy.md` and the corresponding GitHub workflows implement the nightly `publish/v*` and hourly `main`/`prod/v*` model. | `aligned` |

## Directive §1.2 Gaps That Still Prevent Over-Claim

The directive's §1.2 summary is also directionally correct. The missing pieces
are no longer broad product absence; they are release-gate closure, evidence
classification, and release-truth synchronization.

| Area from directive §1.2 | Current `origin/dev` evidence | Why it still cannot be over-claimed |
| --- | --- | --- |
| Tenant Governance | `E2E-005` exists, but the named v3 runbook `docs/03-runbooks/tenant-governance-workflow-release-gate-20260519.md` does not yet exist. | Tenant governance cannot be treated as fully v3-closed until the business-flow gate and non-claim language are explicit. |
| Driver Multi-Platform | `tests/e2e/E2E-006-driver-multi-platform.sh` exists, while mobile distribution remains anchored under `support/sidecars/EXT-003/EXT-003-MOBILE-DISTRIBUTION-GATE.md`. | UI and repo-local E2E are not enough to claim device-distribution or live-platform completion. |
| Forwarder | `WF-FWD-001` is already `EXTERNAL-GATED` in the release-gate matrix; `tests/e2e/E2E-002-forwarded-order.sh` exists. | The repo explicitly does not yet prove partner sandbox/live adapter closure. |
| Partner Booking | `WF-PBK-001` has a named runbook anchor in the matrix via `docs/03-runbooks/partner-booking-pilot-cutover-runbook-20260519.md`. | Repo-local app presence is not the same as pilot cutover proof. |
| CTI / Recording / Filing | `tests/e2e/E2E-003-phone-recording-filing.sh` exists and `WF-COM-001` is already `PASS (sandbox evidence)`. | Live CTI/provider activation remains an explicit external gate and must stay a non-claim. |
| Billing / Reporting | `WF-FIN-001` is already present in the matrix and `support/sidecars/FIN-GOV-001/FIN-GOV-001-EVIDENCE-PACK.md` exists. | Governance-aware reporting still lacks the v3 formal spec/doc layer and should not be collapsed into generic billing closure. |
| Production Rail | `WF-PROD-001` is already `PASS (dry-run contract evidence)` with `E2E-009` and `deploy-prod.yml`. | Dry-run contract wiring is not the same as live production execution or rollback-drill evidence. |

## Release-Truth Alignment Findings

The directive's new requirement is not just more docs. It is the requirement
that branch state, publish state, prod-tag state, workflow-gate state, and
closeout language all tell the same story.

Current `origin/dev` is partway there:

- `docs/ops/branch-strategy.md` clearly defines the authoritative
  `dev -> publish/v* -> main -> prod/v*` model.
- `.github/workflows/nightly-publish.yml`,
  `.github/workflows/hourly-promote.yml`, and
  `.github/workflows/deploy-prod.yml` are present and match that model.
- `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` already
  records named gate reads for `WF-PROD-001`, `WF-FWD-001`, `WF-COM-001`,
  `WF-FIN-001`, and other pre-v3 families.

But the synchronization layer is still incomplete:

- `docs/03-runbooks/release-truth-sync-runbook-20260519.md` does not exist yet.
- `WF-REL-001` does not yet have its own row in the release-gate matrix.
- `docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md` did not
  exist before this task, so the directive's named audit artifact was missing.
- Several v3 deliverables depend on explicit "see also" or formalized docs to
  map already-shipped implementation onto the design team's required language.

## Reconciliation Against The v3 Planning Runbook

The planning runbook's central claim is correct:

> v3 is mostly a formalization wave, not a reimplementation wave.

This audit confirms that claim.

### Already present in `origin/dev`

- `E2E-005-tenant-governance.sh`
- `E2E-006-driver-multi-platform.sh`
- `E2E-002-forwarded-order.sh`
- `E2E-003-phone-recording-filing.sh`
- `E2E-009-prod-rail-dry-run.sh`
- `docs/03-runbooks/partner-booking-pilot-cutover-runbook-20260519.md`
- `docs/03-runbooks/prod-deploy-rollback-runbook-20260519.md`
- production-rail workflow wiring in `.github/workflows/deploy-prod.yml`
- branch-governance wiring in `docs/ops/branch-strategy.md`,
  `.github/workflows/nightly-publish.yml`, and
  `.github/workflows/hourly-promote.yml`

### Still missing or only partially formalized

- `docs/03-runbooks/release-truth-sync-runbook-20260519.md`
- `WF-REL-001` matrix row
- `WF-ADM-001` matrix row
- `WF-DRV-MP-001` matrix row
- the v3-named tenant-governance release-gate runbook
- the governance-aware billing/reporting formal spec
- the platform-admin control-plane UAT doc
- the explicit v3 "thin stub" set for already-shipped equivalent artifacts

## Non-Claim Rules Confirmed By This Audit

The repo already contains enough evidence to support stricter closeout
language, and it should keep doing so.

The following claims would still be incorrect on current `origin/dev`:

- "Driver multi-platform is complete" without real-device/distribution proof.
- "Forwarder is complete" while `WF-FWD-001` remains `EXTERNAL-GATED`.
- "Partner booking is production-cutover complete" based only on repo-local app
  presence.
- "Production deploy rail is live-ready" based only on dry-run contract wiring.
- "Phase 1 v3 blueprint is complete" before the release-truth sync documents and
  matrix rows are added.

## Practical Conclusion

`origin/dev` is not missing the core system that the design team wants. It is
missing the final alignment layer that turns existing implementation and
evidence into the design team's required v3 release-truth model.

The repo therefore stands in this state:

- business-flow substrate: **present**
- evidence substrate: **partly present**
- workflow-family formalization: **incomplete**
- release-truth synchronization docs: **incomplete**

That is why the correct next wave is:

1. add the missing v3 design artifacts
2. map every closeout statement to workflow-family gate language
3. keep external gates explicit instead of silently upgrading them to "done"
4. ensure every `done` claim points to a named evidence artifact and matrix row

## Recommended Reading Order

1. `docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md`
2. `docs/03-runbooks/phase1-v3-design-blueprint-completion-wave-planning-20260519.md`
3. `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`
4. `docs/ops/branch-strategy.md`
5. `docs/00-context/phase1-v3-conflicts-and-open-questions-20260519.md`
