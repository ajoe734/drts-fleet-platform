# Claude Status Audit Readout

Status: complete

## non-negotiables

- This audit must distinguish `baseline_complete` from `target_complete`. The repo can legitimately have executable Phase 1 baseline slices while still being incomplete against the canonical product target.
- Machine truth discipline now applies to audit outcomes too. If the audit confirms official remaining work beyond the recorded board, those items must be added to `ai-status.json` before we report externally that Phase 1 is still open.
- Discussion-planning is the correct mode for this checkpoint. The repo should not jump back into implementation fan-out until the mismatch inventory and backlog corrections are documented.
- Latest explicit user instruction still outranks PRD when scope conflicts exist. That matters most for Passenger App / Web, because the product docs mention it but the user’s initial bootstrap scope did not include it as a required repo surface.

## source of truth / ownership

- `ai-status.json`, `current-work.md`, and `docs-site/current-work.md` are currently synchronized. So the problem is not mirror drift; the problem is backlog completeness relative to the canonical target.
- The current task board accurately records the already-known productionization backlog W7/W8, but it does not yet cover all target-state gaps surfaced by the audit.
- Canonical ownership for the audit comes from L1/L2 product truth, not from stale README summaries or bootstrap controller copy. That means stale local docs must yield to PRD, service contracts, migration plan, and execution rules when judging completeness.

## state machine / enum constraints

- The audit confirms that the repo is preserving the most dangerous semantics correctly: `owned` vs `forwarded` are separate, Phase 1 buckets are still `standard_taxi` and `business_dispatch`, complaint is still separate from incident, and forwarder mirror state is not being written back into owned assignment.
- The largest remaining conformance risks are cross-cutting rather than localized: wire serialization shape, async job boundaries, auth/RBAC enforcement, and persistence-backed state ownership.
- There is also a second class of mismatch where whole canonical feature families are still shells or missing surfaces rather than incorrect implementations. Those should be tracked as scope-completion backlog, not just as bugs.

## open questions

- Passenger App / Web: keep as `human_required` because repo scope and PRD are not fully aligned.
- Missing `phase1_system_design_v1.md`: keep as `human_required` or documentation-alignment work, not as silent assumption.
- Forwarder GA timing remains an open rollout question, but the repo already carries the baseline forwarder slice, so this does not block the mismatch inventory itself.

## implementation impact

- The supervisor should keep the repo in `discussion_planning` until the audit artifacts are written and the task board is corrected.
- The accepted audit result should add official backlog for gaps that are clearly in-scope under the canonical docs and not yet represented in `ai-status.json`.
- After the backlog correction is written, the repo can either run another short discussion round or switch back into `supervisor_managed_execution` with a fuller board. The important thing is that the machine truth reflects the actual remaining work before that switch happens.
