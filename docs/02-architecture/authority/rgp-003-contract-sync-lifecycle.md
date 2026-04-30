# RGP-003 Cross-Repo Contract Sync Lifecycle

Status: execution guardrail for `OPX-GV-001`  
Task: OPX-GV-001 — Cross-repo authority-drift guardrail and contract lifecycle  
Owner: Codex2 • Reviewer: Claude2  
Created: 2026-04-29

Primary citations:

- `phase1_service_contracts_v1.md` §§3.1–3.13, §7.1
- `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/03_api_examples_and_error_contracts.md` §§3.2, 3.18, 3.19
- `docs/02-architecture/authority/rgp-002-authority-map.md` §§4–6
- `docs/02-architecture/tenant-commute-hub-boundary.md` §5
- `docs/02-architecture/authority/fbp-006-tenant-commute-hub-cutover-spec.md` §§4–7

## 1. Purpose

This document defines the only allowed lifecycle for sharing `@drts/contracts`
into `tenant-commute-hub` standalone builds.

Goals:

- keep `drts-fleet-platform` as the only contract source of truth
- make snapshot refresh work repeatable instead of ad hoc
- force explicit compatibility notes before breaking changes land
- provide a repo-owned smoke path that proves the consumer snapshot can still be
  regenerated

## 2. Scope

Applies to:

- `drts-fleet-platform/packages/contracts/src/*`
- `tenant-commute-hub/src/lib/drts-shim/generated/*`
- `tenant-commute-hub/src/lib/drts-shim/contracts.ts`
- `tenant-commute-hub/scripts/sync-drts-contract-snapshot.mjs`
- `scripts/tenant-hub-contract-sync-smoke.sh`

This lifecycle is about contract portability only. It does not grant
`tenant-commute-hub` any authority to redefine DTOs, enums, state machines, or
backend semantics.

## 3. Normal Lifecycle

1. Change canonical contracts in `drts-fleet-platform` first.
2. Decide whether the change is additive, behavior-tightening, or breaking.
3. If the change is breaking for an existing consumer, create or update a
   compatibility note before asking reviewers to approve the contract change.
4. Refresh the managed snapshot in `tenant-commute-hub` by running
   `npm run sync:contracts`.
5. If `tenant-commute-hub/src/lib/drts-shim` is already dirty, switch to a
   clean clone or clear that local drift before validation.
6. Run the core-owned smoke command:
   `scripts/tenant-hub-contract-sync-smoke.sh`.
7. Review the resulting diff in `tenant-commute-hub/src/lib/drts-shim/`.
8. Land the contract change and the refreshed snapshot together, or explicitly
   document why the snapshot update is deferred.

## 4. Change Classification

### Additive

Safe by default if all of the following are true:

- only new exported types, fields, or enum members are added
- existing field names and wire casing stay unchanged
- existing required fields do not become stricter without a documented rollout

Additive changes still require a snapshot refresh.

### Behavior-tightening

Examples:

- a field becomes semantically narrower but keeps the same TypeScript shape
- an enum member remains but its allowed workflow meaning changes
- client fallback behavior is removed in favor of stricter server enforcement

Behavior-tightening changes require:

- a compatibility note if a consumer flow may need updates
- authority doc updates if the consumer obligations changed

### Breaking

Treat a contract change as breaking if any of the following happen:

- exported type or enum names are removed or renamed
- required fields are removed or renamed
- wire casing, envelope shape, or endpoint payload semantics change
- a previously accepted value becomes invalid without a backward-compatible
  rollout window

Breaking changes require a compatibility note under:

- `docs/02-architecture/authority/compatibility-notes/`
- `docs/02-architecture/authority/compatibility-notes/README.md`

Use the template:

- `docs/02-architecture/authority/templates/tenant-hub-compatibility-note-template.md`

## 5. Consumer Guardrails

`tenant-commute-hub` must not:

- hand-edit files in `src/lib/drts-shim/generated/`
- define a parallel `@drts/contracts` surface for production behavior
- patch canonical enums or DTOs locally to "make builds pass"
- merge snapshot drift without tracing it back to the core contract source
- introduce page-local fallback mappers that silently bypass shared-client
  envelope or casing rules

Allowed consumer actions:

- refresh the managed snapshot from the core repo
- consume the generated snapshot for standalone builds
- add a compatibility note reference in a PR or handoff when waiting on a core
  rollout

## 6. Review And Ownership Rules

- Contract truth owner: `drts-fleet-platform`
- Snapshot mechanism owner: shared between the core repo guardrail script and
  `tenant-commute-hub` sync script
- Current `OPX-GV-001` reviewer: `Claude2`
- Any proposal that changes consumer obligations must update one or more of:
  `RGP-002`, `tenant-commute-hub-boundary.md`, `FBP-006`, or a compatibility
  note

## 7. Required Evidence

Minimum evidence for `OPX-GV-001`-class changes:

- contract diff in `packages/contracts/src/*`
- refreshed snapshot diff in
  `tenant-commute-hub/src/lib/drts-shim/generated/*` when applicable
- clean-target execution of `scripts/tenant-hub-contract-sync-smoke.sh`
  - contract-refresh closeout expects exit `0`
  - guardrail-only proof may capture a non-zero drift result if the consumer
    snapshot is intentionally behind, but the diff must be attached
  - guardrail-only proof is valid only when the target checkout started clean,
    so the reported drift is attributable to the current contract snapshot gap
- compatibility note for breaking changes

## 8. Smoke Command

Core repo operators should use:

```sh
scripts/tenant-hub-contract-sync-smoke.sh
```

Behavior:

- locates the sibling `tenant-commute-hub` checkout or uses
  `TENANT_HUB_REPO_PATH`
- fails early if `tenant-commute-hub/src/lib/drts-shim` already has local drift,
  so smoke evidence is not polluted by unrelated edits
- runs `npm run sync:contracts`
- fails if the snapshot cannot be regenerated
- fails if regeneration leaves post-sync drift in `src/lib/drts-shim`
- prints the drift stat and patch when review/commit is still required

## 9. Compatibility Note Index Rule

Compatibility notes use this filename shape:

`YYYYMMDD-<consumer>-<topic>.md`

Current consumer:

- `tenant-hub`

Example:

- `20260429-tenant-hub-partner-entry-contract.md`

## 10. Non-Negotiable Outcome

If a contract change would require `tenant-commute-hub` to invent local
authority to stay working, the change is not ready. Rework the core contract,
stage a compatibility rollout, or escalate the semantic conflict back into
discussion mode.
