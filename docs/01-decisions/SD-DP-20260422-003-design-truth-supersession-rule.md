# SD-DP-20260422-003 Design Truth Supersession Rule

## Decision Record

- `decision_id`: `SD-DP-20260422-003`
- `title`: `Accepted decision packets temporarily supersede conflicting L1 wording during execution`
- `owner`: `Human / system-design via accepted 2026-04-22 review`
- `date`: `2026-04-22`
- `status`: `accepted`
- `affected_docs`:
  - `CANONICAL_DOCUMENT_MAP.md`
  - `PHASE1_OPEN_QUESTIONS.md`
  - `docs/02-architecture/system-design-input-requests-20260422.md`
  - execution runbooks that need scoped superseding guidance
- `old_wording_or_conflicting_anchor`:
  - `PHASE1_OPEN_QUESTIONS.md` `Q-012`
  - `docs/02-architecture/system-design-input-requests-20260422.md` `SD-004`
  - prior repo guidance that lacked an explicit accepted-decision layer
- `superseding_decision`:
  - when human/system-design has answered a scoped product-semantic conflict, an accepted decision packet may temporarily supersede older conflicting L1 wording within that scope
  - execution docs, backlog wording, and implementation guidance may follow the accepted decision packet
  - L1 PRD / SA files are not rewritten ad hoc during active execution; they are synchronized later in a controlled design revision
- `scope`:
  - scoped product-semantic conflicts during execution
  - repo precedence rules
  - runbooks and backlog wording
- `out_of_scope`:
  - unrestricted engineer edits to L1 product-truth files
  - using implementation behavior alone as product truth
- `implementation_implications`:
  - execution docs should cite accepted decision packets when they differ from older L1 wording
  - repo-orientation docs must expose the accepted-decision layer explicitly
- `migration_tasks`:
  - add accepted decision packets to the canonical document map
  - mark answered system-design questions as resolved rather than still-open
- `completion_bar`:
  - the repo has one explicit place to look when scoped system-design decisions temporarily outrank older wording
  - execution docs no longer present resolved design questions as still unanswered
- `rollback_or_revisit_conditions`:
  - a later controlled design revision merges the accepted decision into L1 canonical files
  - a newer accepted decision packet replaces this scoped guidance
- `approval`:
  - accepted for implementation-blueprint use after the 2026-04-22 human instruction to review the decision feedback and integrate it if there were no objections

## References

- Source synthesis:
  - `docs/02-architecture/phase1_system_design_decision_packet_for_dev_team_20260422.md`
