# Phase 1 Decision Ledger

This file records seed design decisions proposed inside the repo before consensus. It does not override the PRD or any other higher-precedence product source.

## Seed Decisions For Review

| ID    | Status        | Decision                                                                                                                                                              | Why                                                                                                              |
| ----- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| D-001 | seed_proposed | Keep the current monorepo and implement Phase 1 as a modular NestJS host before considering multi-service deployment.                                                 | Product semantics are still stabilizing, and service contracts are clearer than deployment boundaries right now. |
| D-002 | seed_proposed | Treat `phase1_prd_detailed_v1.md` as the top product-semantics authority inside the repo.                                                                             | The extracted glossary explicitly places PRD above SA, service contracts, OpenAPI, and DB drafts.                |
| D-003 | seed_proposed | Preserve strict domain separation between `owned` and `forwarded`.                                                                                                    | This is the most repeated hard rule across SA, PRD, contracts, decision tables, and acceptance scenarios.        |
| D-004 | seed_proposed | Preserve formal Phase 1 service buckets as `standard_taxi` and `business_dispatch`; keep `av_pilot` as future-only.                                                   | This keeps Phase 2 extension points without polluting Phase 1 execution.                                         |
| D-005 | seed_proposed | Introduce `packages/contracts` as the TypeScript landing zone for canonical envelopes, enums, and DTO placeholders.                                                   | The repo needs a single implementation-facing contract package before feature work begins.                       |
| D-006 | seed_proposed | Introduce `infra/migrations` and `infra/seeds` as the repo's long-term execution landing zones, while keeping the extracted DB bundle as imported reference material. | This avoids permanent dual source-of-truth drift.                                                                |
| D-007 | seed_proposed | Keep supervisor and auto workers out of implementation task allocation until the consensus packet is accepted by the human.                                           | The user asked for consensus first and supervisor-managed execution second.                                      |

## Promotion Rule

Only promote a seed decision into the consensus packet after at least one cited review round has accepted it or the human has explicitly approved it.
