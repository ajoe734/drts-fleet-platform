# Phase 1 Decision Ledger

This file records architecture and execution decisions that are accepted locally in the repo. It does not override the PRD.

## Accepted Decisions

| ID    | Status   | Decision                                                                                                                                                              | Why                                                                                                              |
| ----- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| D-001 | accepted | Keep the current monorepo and implement Phase 1 as a modular NestJS host before considering multi-service deployment.                                                 | Product semantics are still stabilizing, and service contracts are clearer than deployment boundaries right now. |
| D-002 | accepted | Treat `phase1_prd_detailed_v1.md` as the top product-semantics authority inside the repo.                                                                             | The extracted glossary explicitly places PRD above SA, service contracts, OpenAPI, and DB drafts.                |
| D-003 | accepted | Preserve strict domain separation between `owned` and `forwarded`.                                                                                                    | This is the most repeated hard rule across SA, PRD, contracts, decision tables, and acceptance scenarios.        |
| D-004 | accepted | Preserve formal Phase 1 service buckets as `standard_taxi` and `business_dispatch`; keep `av_pilot` as future-only.                                                   | This keeps Phase 2 extension points without polluting Phase 1 execution.                                         |
| D-005 | accepted | Introduce `packages/contracts` as the TypeScript landing zone for canonical envelopes, enums, and DTO placeholders.                                                   | The repo needs a single implementation-facing contract package before feature work begins.                       |
| D-006 | accepted | Introduce `infra/migrations` and `infra/seeds` as the repo's long-term execution landing zones, while keeping the extracted DB bundle as imported reference material. | This avoids permanent dual source-of-truth drift.                                                                |
| D-007 | accepted | Keep supervisor and auto workers out of development task allocation until the work breakdown is human-approved.                                                       | The user asked for architecture first and supervised execution second.                                           |

## Pending Confirmation

- See `PHASE1_OPEN_QUESTIONS.md` for unresolved product or rollout choices that still need explicit human confirmation.
