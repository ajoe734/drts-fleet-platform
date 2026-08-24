# S1F Live Deploy Incident Review and Prevention Plan

Task ID: `S1F-REL-FIN-UAT-001`  
Created: `2026-08-22`  
Updated: `2026-08-24`  
Status: **billing incident resolved; prevention controls active**

## 1. Decision

GCP billing is not required to complete program code or CI. It is required only
when GCP Cloud Run and Cloud SQL are selected as the live deployment and UAT
target. Deployment to another VM is valid only if that target supplies the same
runtime dependencies and becomes the declared acceptance environment.

The billing account was linked to the active dev project and the original image
push gate was removed. A release is nevertheless complete only when the exact
candidate SHA passes build, migration, deploy, health, retired-surface cleanup,
and operational browser acceptance in one `Deploy - Dev` run.

## 2. Incident Inventory

| Area                   | Failure mode                                                                  | Durable control                                                                                                                                           |
| ---------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source selection       | A stale/non-canonical remote can select the wrong candidate.                  | Manual dispatch requires an immutable SHA or release/publish ref; checkout and image labels remain candidate-bound.                                       |
| Billing interpretation | A GCP project prerequisite was confused with application readiness.           | Deploy outcome distinguishes pre-deploy failure from a candidate already serving on Cloud Run; this runbook records the target-specific billing boundary. |
| Tenant authority       | Static environment tenant IDs could disagree with the authenticated user.     | Tenant Console derives `tenantId` from the API-verified bearer session. Browser headers and environment defaults are not identity authorities.            |
| Acceptance identities  | Caller-provided scopes could imply authority that durable roles do not grant. | Deploy issues seeded users without `x-scopes`, then verifies tenant, realm, and durable role through `/api/auth/session`.                                 |
| Seed ownership         | Tenant users were written by both migration and demo seed.                    | `V0029__tenant_user_roles_demo_seed.sql` is the sole writer; a unit guard prevents the IDs from returning to `S0002`.                                     |
| Browser readiness      | `networkidle` treated background traffic as business readiness.               | Operational acceptance uses deterministic DOM/navigation and authority readback; a unit guard forbids `networkidle` in the suite.                         |
| Release diagnosis      | A red workflow could mean either no deploy or post-deploy acceptance failure. | The outcome job records `deployed=yes/no`, the first failed stage, candidate SHA, and API URL.                                                            |

## 3. Single-Mechanism Rules

1. API-verified bearer identity is the Tenant Console tenant authority. Do not
   add a tenant cookie, local JWT decoder, browser-selected tenant, or static
   production fallback.
2. Flyway migrations own durable acceptance users. Demo seeds may reference
   those users but must not rewrite their roles.
3. Durable tenant roles own token scopes. Deployment callers must not provide a
   second scope list.
4. Candidate acceptance owns the live release verdict. Local browser runs and
   historical deploys are diagnostic evidence, not substitutes.
5. Business state and API readback own readiness. Network silence does not.

## 4. Release Definition of Done

1. The candidate is an immutable SHA from the canonical GitHub repository.
2. Lint, typecheck, unit, integration, build, and repository policy checks pass.
3. If GCP is the target, project identity, billing, APIs, secrets, Cloud SQL,
   Artifact Registry, and runtime identities pass before acceptance.
4. Database migration and all nine active Cloud Run service deployments pass.
5. Health checks confirm the candidate SHA on every active service.
6. Partner Booking remains paused and Concierge/Passenger remain retired.
7. Both candidate-surface and operational browser suites pass.
8. The workflow run, deployed SHA, health result, and acceptance artifact are
   retained as one evidence set.

## 5. Remaining Improvements

| Priority | Improvement                                                    | Completion condition                                                                                        |
| -------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| P1       | Compute a Cloud SQL connection budget before deployment.       | Declared API instance/pool and listener capacity stay under the project limit.                              |
| P1       | Add candidate image promotion or a canary replay path.         | Browser-contract failures can be reproduced before a full rollout while final promotion remains SHA-pinned. |
| P1       | Add a completed referral trip acceptance fixture.              | Acceptance verifies the successful rating path in addition to the cancelled-state negative path.            |
| P2       | Upgrade deprecated GitHub action runtimes and Next middleware. | CI/deploy output no longer carries those deprecation warnings.                                              |

These improvements reduce time-to-diagnosis. They do not create alternate
identity, seed, deployment, or acceptance mechanisms.

## 6. Operating Sequence

1. Verify remote, source ref, and candidate SHA.
2. Complete code and CI validation without treating billing as a code gate.
3. Run target-specific infrastructure preflight.
4. Verify database capacity and durable acceptance identities.
5. Build and deploy once from the pinned SHA.
6. Run health, retired-surface, and browser acceptance gates.
7. Classify failures as source, configuration, data, application, or browser
   contract before changing infrastructure.
8. Record the candidate SHA and workflow evidence before closing the release.
