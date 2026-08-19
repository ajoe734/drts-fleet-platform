# L1 Amendment Acceptance Request (2026-08-17)

**For:** whoever owns Phase 1 product truth
**Status:** **RESOLVED 2026-08-19.** All four answered by the repository owner; the answers are recorded below and applied.
**Governing rule:** `docs/01-decisions/SD-DP-20260422-003-design-truth-supersession-rule.md`

## Why this exists

`SD-DP-20260422-003` makes a human/system-design answer the precondition for a decision packet to
supersede L1 wording. The `phase1-contract-conformance-20260817` wave amended two L1 files —
`phase1_service_contracts_v1.md` and `phase1_prd_detailed_v1.md` — without that answer, because the
task briefs listed those files under "owned artifacts". That was a planning error; the workers
followed their briefs exactly.

The amendments are **left in place**, because each was checked line by line and each makes the
document more accurate than it was. Reverting them would put the specification back to describing
forty event topics that do not exist, thirteen forwarded-order states that do not exist, and an
eleven-state driver enum that does not exist. Accuracy is the thing these documents are for.

What is missing is not correctness. It is your answer. This file asks for it once, for all four.

## The four amendments

| #   | File and section         | What changed                                                                                                                             | Decision packet      |
| :-- | :----------------------- | :--------------------------------------------------------------------------------------------------------------------------------------- | :------------------- |
| 1   | contracts §10            | five review questions gained an owner, a decision route, and an **interim default**                                                      | none                 |
| 2   | contracts §5.2, §6, §7.1 | event topic list marked unimplemented; three real mechanisms documented; §6 rewritten synchronously; §7.1 matrix aligned to real modules | `SD-DP-20260817-009` |
| 3   | contracts §4.1           | five error codes replaced with implemented names, each annotated with the specified name it maps from                                    | none                 |
| 4   | PRD §11.2, §11.4         | forwarded lifecycle 13 → 8 states; driver enum 11 states → four orthogonal dimensions                                                    | `SD-DP-20260817-010` |

Recover any original wording with `git show <commit>^:<file>`: `48a96183d` (1), `0872d4a0a` (2),
`9438fd52a` (3), `7ff344446` (4).

## Answers (2026-08-19)

| #   | Answer                                                                                                       | What was done                                                                                                                                                                                                                                                                                                          |
| :-- | :----------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | interim defaults do **not** belong in the contract                                                           | removed from contracts §10; the working assumptions already live in `PHASE1_OPEN_QUESTIONS.md` Q-001..Q-005, which is now the only place they appear. Owner and decision-route columns stay in the contract                                                                                                            |
| 2   | **accept** — Phase 1 builds no event bus                                                                     | `SD-DP-20260817-009` → `accepted`; §5.2 stands as a target contract; reversal trigger unchanged                                                                                                                                                                                                                        |
| 3   | **accept** — the spec adopts the implemented error-code names                                                | `SD-DP` not required; the §4.1 register stands as amended                                                                                                                                                                                                                                                              |
| 4a  | **accept** — eight forwarded states are canonical                                                            | `SD-DP-20260817-010` → `accepted`                                                                                                                                                                                                                                                                                      |
| 4b  | acceptable dispatch types are **set by the platform at driver registration**; drivers have no self-selection | `SD-DP-20260817-010` → `accepted`, and PRD 11.4 now states the rule explicitly rather than only describing the four-dimension model. Verified already implemented: `CreateDriverMasterCommand.supportedServiceBuckets`, default `["standard_taxi"]`. Follow-up logged: no admin endpoint adjusts it after registration |

## What each one needed (original request)

**1 — contracts §10 interim defaults.** The owner and decision-route columns are administrative. The
interim defaults are not: they take a position on all five open questions (no flight-tracking runtime
in Phase 1, no real-time driver wallet, mirror-only forwarded completion, immutable manifest instead
of storage object lock). The task said it would not close these questions and then wrote provisional
answers into L1. **Question:** do interim defaults belong in the contract, or beside the questions in
`PHASE1_OPEN_QUESTIONS.md`?

**2 — the event contract.** The only amendment that sets an architectural position rather than
recording an observation. Note the correction now recorded in `SD-DP-20260817-009`: the accepted
consensus packet takes no position on deployment topology, so accepting this establishes one for the
first time. **Question:** is Phase 1 committing to no event bus, with §5.2 demoted to a target
document for a future service split?

**3 — error-code register.** Lowest risk of the four: the mapping is accurate and each entry keeps
the specified name as an annotation. **Question:** does the spec adopt implemented names, or should
the implementation converge on the specified ones? Note `TOO_SOON_TO_BOOK` needs no answer —
`CONF-CODE-001` implemented the lead-time rule the spec asked for rather than renaming the code, so
there the implementation moved to the spec.

**4 — state models.** The best-argued of the four. `SD-DP-20260817-010` justifies each removal
individually and checkably: `MAPPED` and `ELIGIBLE` are in-memory pipeline stages, `NATIVE_IN_PROGRESS`
is expressed by `confirmed_by_platform` plus `authoritativeSnapshot.nativeStatus`, `REJECTED` is a
per-driver action leaving the order broadcastable, `EXPIRED` is covered by `lost_race` and
`cancelled_by_platform`. It nonetheless closes `GAP-CONF-04` and `GAP-CONF-05` by amending the
standard rather than changing the system. **Question:** are the implemented models the intended
product design, or does the PRD describe capability still wanted?

## How to answer

Accepting all four: set `status: accepted` on `SD-DP-20260817-009` and `-010`, move both into
`CANONICAL_DOCUMENT_MAP.md` section 2's L1.5 layer, and mark this file resolved. Amendments 1 and 3
have no packet; record the acceptance here.

Rejecting any: revert that amendment from the L1 file and reopen the matching GAP in
`docs/02-architecture/phase1-prd-service-contracts-conformance-audit-20260817.md`.

## The part worth fixing regardless of the answer

A wave whose purpose is measuring the distance between specification and implementation should not be
able to close that distance by moving the specification. Two changes prevent a repeat:

- execution packets must not list an L1 file under a task's owned artifacts — now stated as dispatch
  rule 5 in `docs/03-runbooks/phase1-contract-conformance-execution-tasks-20260817.md` and in
  `CANONICAL_DOCUMENT_MAP.md` section 6
- nothing distinguishes an L1 file from any other Markdown file at commit time, so April's
  prohibition was enforced only by whoever happened to have read it. A CI check that fails when an L1
  file changes without an accepted packet in the same change is the durable fix, and is not yet
  written
