# S1F-UIX-001 — Cross-Surface Operational Browser Acceptance Evidence

Task ID: `S1F-UIX-001`
Owner: `Gemini2`
Reviewer: `Claude`
Status: `release gate active; each candidate records its own deploy verdict`
Candidate SHA: recorded only by the post-deploy workflow artifact
Candidate Source: the release candidate merged to `dev`
Created: `2026-08-13T14:35:47Z`

## 1. Purpose

This document records the formal acceptance evidence for the release-blocking
cross-surface operational browser suite (S1F-UIX-001). The suite runs every
Stage 1 create, read, update, cancel, submit, approve, download, and
cross-product intent journey. JSON mutations assert backend IDs and states;
artifact actions assert authenticated, non-empty downloads; and the route gate
rejects fixture fallback. Partner Booking and Concierge remain 404.

The acceptance gate is executable only against a deployed candidate. The
workflow records that candidate's immutable SHA in its uploaded evidence; this
source document intentionally does not predeclare a SHA.

---

## 2. Test Artifacts

The release candidate contains the test artifacts below. Their final commit SHA
is established by the Deploy - Dev workflow, not by this document.

| Artifact                              | Path                                                                         | Status              |
| ------------------------------------- | ---------------------------------------------------------------------------- | ------------------- |
| Operational browser acceptance spec   | `tests/e2e/operational-browser-acceptance.spec.ts`                           | v2 candidate branch |
| Candidate surface health spec         | `tests/e2e/operational-candidate.spec.ts`                                    | candidate branch    |
| Journey manifest fixture (template)   | `tests/e2e/fixtures/operational-browser-journeys.json`                       | v2 candidate branch |
| Candidate surface manifest (template) | `tests/e2e/fixtures/candidate-journey-manifest.json`                         | candidate branch    |
| Playwright config (acceptance)        | `playwright.operational-browser-acceptance.config.ts`                        | candidate branch    |
| Playwright config (candidate)         | `playwright.operational-candidate.config.ts`                                 | candidate branch    |
| Acceptance runner shell script        | `operations/verification/run-operational-browser-acceptance.sh`              | candidate branch    |
| Runbook                               | `docs/04-uat/operational-browser-acceptance-runbook.md`                      | candidate branch    |
| CI job integration                    | `.github/workflows/deploy-dev.yml` (job: `operational-candidate-acceptance`) | candidate branch    |

---

## 3. Journey Coverage

The fixture manifest at `tests/e2e/fixtures/operational-browser-journeys.json`
declares **7 formal journeys** covering all Stage 1 surfaces:

| Journey ID                             | Surface                | Actor Scope                       | Contract                                   |
| -------------------------------------- | ---------------------- | --------------------------------- | ------------------------------------------ |
| `referral-create-read-cancel-receipt`  | Referral Embed         | partner-scoped referral passenger | mutation and API state readback            |
| `enterprise-create-read-update-cancel` | Enterprise Dispatch    | tenant_admin                      | review intent, mutation, and API readback  |
| `fleet-submit-read-withdraw-resubmit`  | Fleet Partner Portal   | fleet partner                     | mutation and API state readback            |
| `admin-review-approve-readback`        | Platform Admin         | platform_admin                    | mutation and API state readback            |
| `tenant-ops-dispatch-intent`           | Tenant Console         | tenant_admin                      | authorised cross-app Ops detail intent     |
| `bank-statement-download`              | Bank Console           | bank_program_admin                | authenticated artifact attachment          |
| `channel-statement-download`           | Channel Partner Portal | channel partner                   | partner-authorised CSV artifact attachment |

Each operation asserts:

- Every setup request, route response, operation response, and readback is bound
  to the pinned `x-drts-candidate-sha`.
- JSON mutations return an ID and their declared API readback has the expected
  ID and state.
- Artifact downloads must return a non-empty attachment with the declared
  content type.
- Cross-app links are verified as intents to the correct product origin and
  resource detail route; they are not misrepresented as a tenant mutation.

---

## 4. Fixture Integrity and Control Scope

The route gate rejects `/design sample data|preview fixture mode|fixture mode|demo fallback/i`.
It does not scan every enabled control: language selectors, address choices, and
other ordinary UI controls are not operational mutations. The manifest is the
complete release contract, and every declared operation must be either a real
HTTP request, an authenticated artifact download, or an explicit cross-app
intent.

---

## 5. Retired/Paused Surface Enforcement

**3 retired surfaces** are declared in the fixture:

| Surface                 | Env Var                             | Path                  | Expected Status |
| ----------------------- | ----------------------------------- | --------------------- | --------------- |
| `partner-booking-site`  | `DRTS_DEV_PARTNER_BOOKING_BASE_URL` | `/ctbc/program/site`  | `404`           |
| `partner-booking-embed` | `DRTS_DEV_PARTNER_BOOKING_BASE_URL` | `/ctbc/program/embed` | `404`           |
| `concierge`             | `DRTS_DEV_CONCIERGE_BASE_URL`       | `/`                   | `404`           |

The candidate surface manifest (`candidate-journey-manifest.json`) additionally
declares `passenger-web` as retired (expected `404`).

---

## 6. Candidate SHA Binding

The runner script (`operations/verification/run-operational-browser-acceptance.sh`):

1. Validates `DRTS_CANDIDATE_SHA` is a 40-character hex SHA.
2. Materializes `operational-browser-journeys.json` with `__SET_DRTS_CANDIDATE_SHA__` replaced by the actual SHA.
3. Materializes `candidate-journey-manifest.json` with `__DRTS_CANDIDATE_SHA__` replaced by the actual SHA.
4. Exports `DRTS_CANDIDATE_SHA` and both materialized file paths.
5. Runs `playwright.operational-candidate.config.ts` (surface health + SHA header assertions).
6. Runs `playwright.operational-browser-acceptance.config.ts` (declared JSON operations, downloads, intents, route checks, and retired-404 suite).

The suite fails if `DRTS_CANDIDATE_SHA` is missing, a non-40-hex value, or any
active surface response header does not return exactly the SHA supplied by the
Deploy - Dev workflow.

---

## 7. CI Integration

The `Deploy — Dev` workflow (`deploy-dev.yml`) includes the job:

```yaml
operational-candidate-acceptance:
  name: Candidate SHA operational acceptance
  needs: [prepare, build-push, health-check, retired-service-cleanup]
  if: always() && health-check == success && retired-service-cleanup == success
```

The job:

- Checks out the exact candidate SHA
- Installs pnpm + Playwright Chromium
- Passes all deployed surface URLs from the `health-check` job outputs
- Derives paused/retired Cloud Run hostnames from the API URL suffix
- Runs `operations/verification/run-operational-browser-acceptance.sh --sha <candidate_sha>`
- Uploads `test-results/operational-browser/` as `operational-browser-evidence-<sha>`

This job is the release gate. Its workflow run and uploaded
`operational-browser-evidence-<candidate_sha>` artifact are the only
authoritative execution context for a release candidate.

---

## 8. Local Verification (Pre-Handoff)

The following candidate-branch checks were performed before handoff:

| Check                                                                                     | Result            |
| ----------------------------------------------------------------------------------------- | ----------------- |
| Journey manifest JSON parse                                                               | Pass              |
| `pnpm exec vitest run tests/unit/operational-browser-manifest.test.ts`                    | 2/2               |
| `pnpm exec playwright test -c playwright.operational-browser-acceptance.config.ts --list` | 16 declared tests |
| `pnpm typecheck:root`                                                                     | Pass              |
| API targeted unit tests                                                                   | 97/97             |
| API, Ops, Tenant, Enterprise, and Channel typecheck                                       | Pass              |
| Root, API, Ops, Tenant, Enterprise, and Channel lint                                      | Pass              |

---

## 9. Acceptance Criteria Mapping

| Acceptance Criterion                                            | Met By                                                                               | Evidence                                                                       |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| All formal cross-surface journeys bind to one candidate SHA     | 7 journeys covering referral, enterprise, fleet, admin, tenant, bank, and channel    | Journey manifest + `operational-candidate-acceptance` CI job                   |
| Every declared JSON mutation records an API readback            | `responseKind: json` operations declare a result ID and `readback` contract          | `operational-browser-acceptance.spec.ts` — declared operational contract tests |
| Artifact operations prove an authenticated non-empty attachment | `responseKind: download` requires content type and `Content-Disposition: attachment` | Bank and Channel journey contracts                                             |
| Cross-app links preserve least authority                        | Tenant verifies an Ops detail intent rather than pretending a tenant mutation        | Tenant journey contract                                                        |
| Fixture fallback and retired routes fail the suite              | Route regex rejects fallback text; 3 retired surface paths must return 404           | Route and retired-surface tests                                                |

---

## 10. Evidence Outputs

When the `operational-candidate-acceptance` CI job succeeds, the uploaded artifact
`operational-browser-evidence-<candidate_sha>` contains:

- `operational-browser-evidence.json` — machine-readable setup, operation, route, and retired-surface record per journey
- `report.json` — Playwright JSON reporter output
- Traces and screenshots retained on failure only

---

## 11. Open Items / Handoff Notes

- **Per-candidate execution is required**: Do not reuse a historical deploy,
  image build, or SHA as evidence for a new candidate. The CI job is the
  authoritative execution path; local sandbox execution is not release
  evidence.

- **Actor authentication**: The acceptance suite uses the BFF cookie jar
  (`page.context().request`) for readback, not the global `request` fixture,
  which correctly shares the authenticated browser session. No test-credential
  injection is needed for the suite structure.

- **Control scope**: The runner validates declared release operations only.
  Ordinary UI controls are not forced to carry an operational marker, so the
  release gate cannot reject valid selectors, language controls, or navigation.

- **Reviewer (Claude)**: Review the v2 contract completeness, the seven
  journeys, and the candidate CI result. A deployed candidate run remains the
  release evidence; local verification is not a release substitute.
