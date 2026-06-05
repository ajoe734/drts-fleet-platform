# E2E-SVC-013 Unblock Planning Decision

## Scope

- Task: `E2E-SVC-013-UNBLOCK-PLANNING-DECISION`
- Parent: `E2E-SVC-013`
- Owner: `Codex2`
- Reviewer: `Codex`
- Decision date: `2026-06-05`

## Diagnosis

`E2E-SVC-013` is not blocked by a missing product or contract decision.

The current canonical planning stack already defines the service-product /
vehicle-eligibility workflow and its acceptance path:

1. `docs/02-architecture/phase1_final_sa_for_dev_team_20260604.md`
   defines `WF-SVC-ELIG-001` as the accepted Service Product / Vehicle
   Eligibility flow.
2. `docs/02-architecture/phase1_final_sd_for_dev_team_20260604.md` §9 binds
   `WF-SVC-ELIG-001` to `E2E-013-service-product-eligibility.sh` and fixes the
   required flow:
   create service product → configure vehicle eligibility → create booking
   requiring airport transfer → ineligible taxi rejected → eligible airport
   vehicle accepted → dispatch eligible supply returned.
3. `BE-SVC-003` is already `done` and records the runtime contract for
   dispatch eligibility enforcement plus `eligible-supply` and
   `eligible-products` APIs.
4. `origin/codex2/e2e-svc-013` already carries the parent implementation /
   E2E work under commits `c5ea669aa03d94743459a569c4b18540e55efd38` and
   `8af42fa6d10726836fd358874e8d660fad8e54b2`.

The parent's present blocker in machine truth is operational, not semantic:
the assigned worker cannot mint a staging IAP token, so staging rerun evidence
cannot be produced in this environment.

## Decision

No new product or contract decision is required.

The canonical decision is:

1. `WF-SVC-ELIG-001` is already the accepted planning source of truth for this
   workflow family.
2. `BE-SVC-003` already resolves the required runtime contract for eligibility
   enforcement and eligible-supply resolution.
3. `E2E-SVC-013` should execute against that existing contract; it does not
   need a new scope-semantic clarification, open-question entry, or contract
   addendum.

## Scope Cut And Routing

- This unblock is routing-only. It does not create a new planning artifact
  beyond this decision record.
- No entry is added to `PHASE1_OPEN_QUESTIONS.md` because nothing remains
  unresolved at the product-semantics level.
- No contract expansion is required for partner airport-transfer semantics;
  those remain owned by the accepted service-product / eligibility workflow and
  the already-landed backend eligibility enforcement slice.

Remaining work stays routed to execution:

1. Rebase / integrate `origin/codex2/e2e-svc-013` onto current `dev` as
   needed because commit `8af42fa6d10726836fd358874e8d660fad8e54b2` is not on
   `origin/dev`.
2. Run `tests/e2e/E2E-013-service-product-eligibility.sh` in an environment
   with working staging IAP credentials.
3. Capture the staging pass evidence required by the parent acceptance.

## Parent Unblocked Next Step

`E2E-SVC-013` should stop treating planning as the blocker.

Concrete next step:

1. Resume from `origin/codex2/e2e-svc-013`, which already contains the parent
   implementation and E2E script.
2. Re-run the staging flow once a valid bearer token or a worker with
   functional `gcloud` / IAP access is available.
3. If the rerun passes, finalize the parent with staging evidence.
4. If the rerun fails, route any failure as execution or environment follow-up,
   not as a missing product/contract decision.

## Verification Basis

- `docs/02-architecture/phase1_final_sa_for_dev_team_20260604.md`
- `docs/02-architecture/phase1_final_sd_for_dev_team_20260604.md`
- `AI_NAME=Codex2 scripts/ai-status.sh show BE-SVC-003`
- `AI_NAME=Codex2 scripts/ai-status.sh show E2E-SVC-013`
- `git show --stat --summary --name-only 8af42fa6d10726836fd358874e8d660fad8e54b2`
- `git log --oneline origin/dev..origin/codex2/e2e-svc-013`

## Closeout Evidence

- Parent implementation branch: `origin/codex2/e2e-svc-013`
- Parent closeout-style commit on that branch:
  `8af42fa6d10726836fd358874e8d660fad8e54b2`
  (`E2E-SVC-013: align runtime service-product eligibility`)
- Current machine blocker for the parent remains staging IAP access, as
  recorded in `ai-status` on `2026-06-05`.
