# SD-DP-20260819-011 One Fact, One Document

## Decision Record

- `decision_id`: `SD-DP-20260819-011`
- `title`: `A fact recorded in two canonical documents is a defect; contracts section 10 stops listing what PHASE1_OPEN_QUESTIONS.md owns`
- `owner`: `Claude / conformance follow-up`
- `date`: `2026-08-19`
- `status`: `accepted`
- `approval`:
  - accepted by the repository owner on 2026-08-19, on the instruction to fix the
    root cause rather than keep handling instances
- `affected_docs`:
  - `phase1_service_contracts_v1.md` section `10`
- `superseding_decision`:
  - contracts section 10 no longer lists the five review questions, their owners, or their
    decision routes. It names `PHASE1_OPEN_QUESTIONS.md` as the single place those are tracked
  - where any two canonical documents would hold the same fact, one of them links instead
- `scope`:
  - `phase1_service_contracts_v1.md` section `10`
  - the general single-source rule, recorded in `CANONICAL_DOCUMENT_MAP.md`
- `out_of_scope`:
  - the content of the questions themselves, which `PHASE1_OPEN_QUESTIONS.md` owns
  - consolidating other duplicated pairs, which needs finding them first
- `completion_bar`:
  - contracts section 10 contains a pointer and no question list
  - `CANONICAL_DOCUMENT_MAP.md` states the rule
  - nothing is lost: every question, owner, decision route, and interim default already exists
    in `PHASE1_OPEN_QUESTIONS.md`

## Problem

The five contract review questions existed in two documents at once. Contracts section 10
listed them with owners and decision routes; `PHASE1_OPEN_QUESTIONS.md` listed the same five as
Q-001 to Q-005 with owners, decision routes, and interim defaults.

`CONF-DOC-001` did not create that duplication so much as complete it, by copying the interim
defaults across as well. Removing the defaults again treated the symptom. Two documents holding
one fact will drift, and the only question is when.

That is the same shape as every other finding in the 2026-08-17 audit: a contract requiring
idempotency that no controller read, a config naming labels the repository did not have, a task
marked done whose commit was on no branch. Two places that must agree, and nothing checking that
they do.

## Decision

Contracts section 10 keeps a pointer and drops the list.

The general rule: where two canonical documents would carry the same fact, one links to the
other. Prefer keeping the fact where it changes -- an open question changes as it is answered,
so it belongs with the questions, not in the contract that raised it.

## Why not the other direction

Contracts section 10 is L1 product truth and changes under controlled revision.
`PHASE1_OPEN_QUESTIONS.md` is a Provisional Design Input and is meant to be edited as answers
arrive. Tracking live question state in an L1 file would mean an L1 revision every time a
question moves, which is precisely the friction `SD-DP-20260422-003` exists to avoid.

## Related

- `docs/02-architecture/phase1-prd-service-contracts-conformance-audit-20260817.md`
- `tools/ci/git/check_canonical_consistency.py` -- the checks that catch this class mechanically
