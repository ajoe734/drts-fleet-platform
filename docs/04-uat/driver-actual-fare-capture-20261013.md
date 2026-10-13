# DRIVER-ACTUAL-FARE-CAPTURE-20261013 — upstream actual-fare capture

Owner: **Pi**. Independent reviewer: **Codex**. Base: `116132df18b6bc0b64bb3311a44a84697c653985`.

This is an additive upstream source unit for `PAX-RECEIPT-COMPLAINT-20261009`, not a replacement for its Codex2/Codex ownership, downstream implementation, history floor or acceptance. Registration/spec/evidence are under `.local/pi-can-finish-20261013/`; frozen current spec is `driver-actual-fare-capture-task-spec-v2.json`.

## Gap and implementation

E-04 requires the **actual** start/distance/delay/night components. The existing completion command/task/certificate event carried aggregate fare, distance and time but did not capture those four facts. Reconstructing them from a quote or inserting zero-valued defaults would not satisfy the requirement.

The existing driver-completion command now accepts optional `actualFareBreakdown`:

- `startMinor`, `distanceMinor`, `delayMinor`, `nightMinor` are all explicitly supplied nonnegative safe integer NTD amounts.
- A safely representable component sum and canonical effective NTD fare are required when the extra facts are supplied. Arrays, missing/invalid values, nonfinite/fractional/unsafe amounts and incompatible currency are rejected before a completion write or effects.
- **No aggregate/toll convention is inferred.** In particular, the implementation does not assert that the component sum equals aggregate fare, decide whether aggregate fare includes toll, or change either amount. Spec revision 2 removes an initially proposed equality constraint before any candidate was published; the original Receipt's outstanding authoritative-total-convention requirement remains.
- Existing fixed-price fare authority, settlement/payment behavior and legacy callers are preserved. Missing actual components stay absent; supplied real zeros are retained, never synthesized.
- Incoming components are copied before database-lock waits. Completed task records and certificate events get separate copies; returned/listed task records cannot mutate stored facts.
- The existing transaction, task JSON record and completion outbox carry the optional facts. Failed transactions do not publish them or change committed memory; existing immutable request replay returns its original captured facts rather than replacing them.

Only `DriverCompleteTaskCommand`, `DriverTaskRecord`, their additive shared type, completion/event/clone hunks and the focused tests/document are changed. No renderer, Driver UI, SDK, registry, schema, pricing formula, provider, IAM, workflow or security mechanism is added or changed.

## Repository checks — not live/legal receipt acceptance

The focused test executes actual public `OwnedMobilityService.completeDriverTask` in both in-memory and transactional paths and actual certificate-event/outbox construction. Database and event **transports** are unit fixtures; business completion/validation/persistence decisions are not replacement processors. A fixture selects the multi-taxi completion branch after the standard dispatch lifecycle; this is not a licensed multi-taxi admission, genuine PG commit, PSP capture or authorized-role journey witness.

The following table preserves the initial pre-R2 candidate checks (`b964ec613a6f4a7fb4335170e7f273cf705a0d8c`). The independent finding and repaired results follow below.

| Check                                                              | Evidence/result                                                                                                                                                                                                                       |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Old immutable source, actual public completion in both paths       | Two genuine assertions fail because supplied `actualFareBreakdown` is lost; two legacy controls pass. `actual-fare-old-source-red-qualified.json`. The other 96 cases were deliberately not selected; they are not counted as passes. |
| New capture regressions                                            | 102 cases, no skips: both completion paths, explicit zeros, invalid fields/currency/overflow, fixed-price controls, unknown aggregate/toll convention, copying, locked ingress, rollback and replay.                                  |
| Capture + existing root completion/proof/outbox/certificate suites | 155 passed, zero failed/skipped in `NODE_ENV=test`; final candidate rerun recorded in `.local/pi-can-finish-20261013/`.                                                                                                               |
| Existing API service/repository/certificate/task-event suites      | 147 passed, zero failed/skipped; includes existing durable completion/commit/outbox controls.                                                                                                                                         |
| Static checks                                                      | Contracts/control-plane package builds; API `typecheck`; scoped ESLint and Prettier; `git diff --check`.                                                                                                                              |

An initial probe had zero tests because a root test import could not resolve the API-only Nest dependency; a later fixture attempt failed on event-transport/reconciliation setup. These artifacts are retained and **not** treated as reproductions. The qualified old-source evidence above is an actual business assertion failure after both legacy controls pass.

The first broad root run inherited this VM's `NODE_ENV=production`, which disables unrelated partner demo entries, yielding 144 passes and nine existing partner-fixture failures. No partner source or policy was changed. Explicit command-local `NODE_ENV=test`, matching repository unit-fixture execution, runs all selected cases successfully. Both reports are retained; production-profile fixture failures are not silently relabeled green.

Reproduce repository-only checks in the isolated task worktree:

```bash
NODE_ENV=test pnpm exec vitest run \
  tests/unit/driver-actual-fare-capture-20261013/actual-fare-capture.test.ts \
  tests/unit/owned-mobility.test.ts \
  tests/unit/driver-app-completion-proof.test.ts \
  tests/unit/driver-completion-outbox-migrations.test.ts \
  tests/unit/system-remediation/sr-qa-reports-001/c098-electronic-ride-certificate.test.ts
NODE_ENV=test pnpm --filter @drts/api exec vitest run \
  tests/unit/owned-mobility.service.test.ts \
  tests/unit/owned-mobility.repository.test.ts \
  tests/unit/certificate-support.service.test.ts \
  tests/unit/owned-mobility-task-events.service.test.ts
pnpm --filter @drts/contracts build
pnpm --filter @drts/control-plane-auth build
pnpm --filter @drts/api typecheck
```

## Independent findings and repair — retained, not overwritten

### R1: owner delivery trailers

The first published `edb5c18648981db1aec83cc8127f222f8f12f964` / PR #2612 had `Task`/`LLM` aliases rather than required `Task-ID`/`LLM-Agent`/`Reviewer` trailers. The owner corrected this engineering delivery error with a separately named publication, `b964ec613a6f4a7fb4335170e7f273cf705a0d8c` / PR #2613. Both old published refs remain intact; the two source trees are exactly identical. No amend, rebase, force-push, gate waiver or published-history rewrite occurred. The actual checker reports **one commit OK** for the new publication. Original Codex independently verified that result and exact tree equivalence; R1 is resolved, not falsely attributed to external inputs.

### R2: public task stream aliased stored actual facts

Codex independently reopened exact candidate `b964ec613a6f4a7fb4335170e7f273cf705a0d8c`, generation `d58ed191389d4d68ac4881ed25e1ca3d`, for a genuine P2 correctness defect. After actual public completion, `OwnedMobilityTaskEventsService` shallow-spread the additive breakdown from the stored task into its event. Mutating `envelope.data.task.actualFareBreakdown.startMinor` from **3500 to 999** through the public observable also changed `getDriverTask` and the original request's immutable replay. This is a supported in-process publication alias, **not** a claim that a remote HTTP client can mutate server memory.

The exact Codex executable probe, adjacent SHA/source and original finding are retained in the canonical reopen message and `.local/pi-can-finish-20261013/actual-fare-r2-independent-review-record.json`. New owner regressions execute the real public completion, real task-event publisher and public observable, with mutations both during and after publication. On unchanged `b964` production source they yield **three genuine assertion failures and three passing controls** (102 other cases deliberately unselected), recorded as `actual-fare-r2-b964-stream-red.json`. The controls include transactional late mutation and both legacy-absence paths; neither setup failures nor unselected cases are credited as passes.

Repair stays inside the already-authorized completion/clone producer scope:

- Detach only the actual-fare fields before both direct completion task-stream publications, including the transactional committed-return path. Do not add recomputed compliance fields or change unrelated event semantics.
- Reuse that narrow detachment in the existing task-record clone. Existing completion outbox construction/delivery already invokes that clone, so its captured facts remain separated from public event objects.
- `owned-mobility-task-events.service.ts` is read-only and unchanged; no extra module scope was assumed or granted.
- Real stream regressions verify returned/get/list/replay facts, no republish on replay, legacy absence and unchanged persisted/outbox snapshots. Existing fixed-price, currency, missing/zero, unknown total-convention, rollback and ingress-lock controls remain.

Repaired repository-only verification: **108** focused actual-production regressions; **161** selected root cases plus **147** existing API service/repository/certificate/task-event cases, **308 passed / zero failed / zero skipped**. API typecheck, scoped ESLint/Prettier and diff checks pass in the owner's isolated dependency-local worktree. New candidate exact-SHA review/hosted CI/protected merge are still required; this local repair is not self-approval or genuine PG/native/E04 acceptance.

The independent review's API typecheck separately found missing `nodemailer` symlink targets in its detached dependency workspace, so that check was honestly recorded failed/unavailable rather than relabeled green. The owner's dependency-local typecheck passes; a source import workaround or weakening the compiler is not introduced.

## Explicitly not closed

Independent exact-SHA review, matching hosted CI and protected integration are mandatory after normal handoff; the owner does not self-approve or mark done. A future release must include the accepted source before any runtime credit.

This unit does **not** fabricate a complete `e04Snapshot`, lawful issuer/surname/credential, captured payment method, real fare/PSP witness or accepted receipt. Driver UI capture and downstream consumption of these facts remain to be implemented/coordinated through their original scopes. The original Receipt remains blocked/open on its full factual/source/adoption requirements; its acceptance keys are not satisfied by this unit. Real PG, producer-to-writer HTML/PDF, browser, Android/iOS, provider, role and full-system acceptance remain separate genuine gates.

No product/API/browser/PG/Docker/Metro server is started on this VM. Root dirty files, other agents' source/locks and existing user data are preserved.
