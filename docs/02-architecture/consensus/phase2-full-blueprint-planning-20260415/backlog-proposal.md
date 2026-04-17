# Full Blueprint Development Plan

## Planning Closeout Disposition

- `FBP-001` is complete in this planning session via `scope-matrix.md`.
- `FBP-002` is complete in this planning session by superseding the narrower gap-only baselines and freezing the implemented baseline as the new planning start point.
- `FBP-003` is resolved for this packet: `Passenger App / Web` and `Call Point / Concierge Portal` stay visible as deferred roadmap families, while `Complaint Hotline Console` folds into the operator-completion family instead of blocking execution on a separate app landing.
- `FBP-004` is complete in this planning session via the accepted tenant-portal topology and cutover/decommission direction.

Execution therefore starts with the tenant-convergence and blueprint-completion families, not by reopening already-closed planning slices.

## Layer 0 — Planning / Governance

| ID        | Priority | Type                 | 說明                                                                                                                                    | Depends On | Success Definition                                                                                                       |
| --------- | -------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------ |
| `FBP-001` | P0       | planning             | Produce the authoritative full blueprint scope matrix and classify every blueprint slice                                                | —          | All blueprint slices are tagged `implemented`, `partial`, `missing`, `blocked_external`, or `future_gated`               |
| `FBP-002` | P0       | planning             | Supersede stale planning baselines and freeze the implemented baseline                                                                  | `FBP-001`  | Narrower outdated sessions are clearly marked superseded                                                                 |
| `FBP-003` | P0       | planning-human-gated | Decide repo topology and landing zones for missing blueprint surfaces (`Passenger App/Web`, `Call Point / Concierge`, hotline topology) | `FBP-001`  | Human-approved landing decision exists for absent surfaces                                                               |
| `FBP-004` | P0       | planning-blocked     | Capture the tenant portal topology decision and produce the repo B cutover / decommission master spec                                   | `FBP-001`  | `tenant-commute-hub` is recorded as sole UI, `drts-fleet-platform` as BFF, and `apps/tenant-portal-web` as retire target |

## Layer 1 — Tenant Portal Convergence

| ID        | Priority | Type               | 說明                                                                                             | Depends On           | Success Definition                                                                                            |
| --------- | -------- | ------------------ | ------------------------------------------------------------------------------------------------ | -------------------- | ------------------------------------------------------------------------------------------------------------- |
| `FBP-005` | P1       | execution          | Complete / verify tenant-facing BFF authority in `drts-fleet-platform`                           | `FBP-004`            | `/api/tenant/*` parity, auth, envelopes, idempotency, downloads, webhook/audit/billing authority are complete |
| `FBP-006` | P1       | execution-external | Cut `tenant-commute-hub` over to `drts-fleet-platform` BFF and delete Supabase/backend authority | `FBP-004`, `FBP-005` | Lovable repo uses BFF only; Supabase authority, edge functions, and direct backend truth are removed          |
| `FBP-007` | P1       | execution-cleanup  | Retire / decommission `apps/tenant-portal-web` as a production target                            | `FBP-006`            | Internal tenant portal is frozen, documented as retired, and removed from active product topology             |

### Detailed Work Breakdown — Tenant Portal Convergence

#### `FBP-005` — `drts-fleet-platform` tenant BFF parity

| Child ID   | 說明                                                                         | Acceptance                                                                                                                                      |
| ---------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `FBP-005A` | Inventory all tenant portal authority surfaces that must remain in core repo | A page/API matrix exists for bookings, passengers, addresses, reports, API keys, webhooks, billing, notifications, SLA, users, roles, and audit |
| `FBP-005B` | Verify route parity and missing endpoint inventory for `/api/tenant/*`       | Every required surface is tagged `implemented`, `partial`, or `missing`, with explicit endpoint references                                      |
| `FBP-005C` | Verify BFF contract obligations                                              | Authorization, `X-Request-Id`, `Idempotency-Key`, envelope shape, signed downloads, and snake_case semantics are explicitly covered             |
| `FBP-005D` | Close remaining core-repo authority gaps                                     | Any missing tenant-facing authority endpoints are added or explicitly listed as blockers before external cutover starts                         |

#### `FBP-006` — `tenant-commute-hub` BFF cutover and authority deletion

| Child ID   | 說明                                               | Acceptance                                                                                                             |
| ---------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `FBP-006A` | Produce page-by-page cutover spec for Lovable repo | Every repo B page is mapped to its target BFF endpoint(s), auth model, and expected error/envelope handling            |
| `FBP-006B` | Remove Supabase / backend authority from repo B    | Supabase direct truth, edge functions, local authority logic, and direct production writes are deleted or disabled     |
| `FBP-006C` | Rewire UI data flows to BFF                        | Portal pages read and write via `drts-fleet-platform` BFF only                                                         |
| `FBP-006D` | Validate repo B boundary contract                  | No forbidden authority remains for booking truth, billing truth, API keys, webhooks, audit, reports, or auth authority |

#### `FBP-007` — retire `apps/tenant-portal-web`

| Child ID   | 說明                                                | Acceptance                                                                                 |
| ---------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `FBP-007A` | Freeze internal portal as non-production            | Docs and topology records state it is no longer the product tenant portal                  |
| `FBP-007B` | Remove it from active planning and rollout topology | No active master-plan or rollout gate assumes it as the production tenant portal           |
| `FBP-007C` | Decide cleanup mode                                 | Either hard-delete it or keep it as a short-lived reference shell with a named sunset rule |

## Layer 2 — Phase 1 Blueprint Completion

| ID        | Priority | Type      | 說明                                                        | Depends On           | Success Definition                                                                        |
| --------- | -------- | --------- | ----------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------- |
| `FBP-008` | P1       | execution | Platform Admin blueprint completion                         | `FBP-001`            | Admin UI breadth is backed by correct authority and API parity                            |
| `FBP-009` | P1       | execution | Ops / Host / OpCo / ROC Phase 1 completion                  | `FBP-001`            | Dashboard, dispatch, revenue, maintenance, incidents, reports meet PRD breadth            |
| `FBP-010` | P1       | execution | Callcenter / complaint / dispatch-trace operator completion | `FBP-001`, `FBP-009` | Operator workflows are end-to-end, auditable, and role-correct                            |
| `FBP-011` | P1       | execution | Finance / billing / reimbursement / filing completion       | `FBP-001`            | Tenant billing, driver fee, reimbursement, report and filing flows reach blueprint parity |
| `FBP-012` | P1       | execution | Public Info / Placard / Regulatory report completion        | `FBP-001`, `FBP-011` | Disclosure, placard, report, and filing outputs are operator-complete                     |

## Layer 3 — Verification / Delivery Evidence

| ID        | Priority | Type               | 說明                                              | Depends On                                 | Success Definition                                                         |
| --------- | -------- | ------------------ | ------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------- |
| `FBP-013` | P1       | execution-evidence | staging / smoke / UAT evidence closeout           | `FBP-008`, `FBP-009`, `FBP-011`, `FBP-012` | deploy, smoke, UAT, and sign-off evidence exists                           |
| `FBP-014` | P2       | execution-evidence | integrated cross-surface and cross-repo E2E suite | `FBP-006`, `FBP-013`                       | booking → dispatch → driver → billing/audit happy path verified end to end |

Verification rule:

- every major execution family (`FBP-005` through `FBP-012`) should carry paired verification child slices while implementation is underway
- `FBP-013` remains the final integrated closeout family that consolidates staging, smoke, UAT, sign-off, and rollout evidence

## Layer 4 — Future-Gated Master Plan

| ID        | Priority | Type             | 說明                                                                          | Depends On | Success Definition                                        |
| --------- | -------- | ---------------- | ----------------------------------------------------------------------------- | ---------- | --------------------------------------------------------- |
| `FBP-015` | P3       | planning-roadmap | Preserve AV / ODD / Tesla / ROC live-board scope in a deferred roadmap packet | `FBP-001`  | Future-gated scope is visible in master plan and not lost |

## Recommended Wave Order

1. Planning session closes `FBP-001` through `FBP-004`
2. `FBP-005` through `FBP-007`
3. `FBP-008` through `FBP-012`, with paired verification children started alongside each family
4. `FBP-013` and `FBP-014`
5. `FBP-015`
