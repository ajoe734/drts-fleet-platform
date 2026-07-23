# S3-VERIFY-001 Unblock Planning Decision

## Scope

- Task: `S3-VERIFY-001-UNBLOCK-PLANNING-DECISION`
- Parent: `S3-VERIFY-001`
- Owner: `Codex`
- Reviewer: `Gemini`
- Decision date: `2026-07-23`

## Diagnosis

`S3-VERIFY-001` was auto-routed as though Fleet G still needed a missing product
or contract decision before verification could continue. The canonical Phase 1
planning stack already fixes the S-3 verification contract:

1. `docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/03_gap_closure_implementation_plan.md`
   defines `S3-VERIFY-001..005` as the accepted S-3 production-closure
   verification split.
2. `docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/07_fleets_execution_tasks_20260723.md`
   classifies Fleet G as verification-only work and explicitly says not to
   rebuild the S-3 domain or screens.
3. `docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/06_multi_taxi_runtime_execution_register_20260723.md`
   keeps `S3-VERIFY-002..005` as downstream evidence lanes after
   `S3-VERIFY-001`.
4. `docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/source_specs/01_system_development_team_spec_20260720.md`
   already fixes the binding S-3 semantics:
   - online Ops alert p95 <= 5 sec
   - offline replay idempotent
   - attachments retry
   - exactly one Incident per SOS
   - no multi-platform / AV data in SOS projection
5. The only directly discoverable repo-backed current-head executable artifact
   for this slice is `tests/e2e/E2E-017-driver-sos-incident.sh`, which covers
   driver SOS submission, self-scoping, correlated incident receipt, and driver
   incident-list denial. That is execution evidence, not a missing contract.
6. The expected evidence/scaffold path under `support/sidecars/S3-VERIFY-001/`
   is absent on this branch, and the unblock artifact itself had not yet been
   created. Those are evidence-packaging gaps, not new product semantics.

The real blocker is therefore narrower than the helper title suggests:

1. `S3-VERIFY-001` needs a canonical current-head evidence packet and any
   missing E2E coverage for Ops acknowledge / resolve / close flow.
2. Remaining acceptance gaps that require physical devices, security proof, or
   production observability are already routed to `S3-VERIFY-002..005`.

## Canonical sources consulted

Higher-precedence first per `AI_COLLABORATION_GUIDE.md`:

1. `docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/03_gap_closure_implementation_plan.md`
2. `docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/07_fleets_execution_tasks_20260723.md`
3. `docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/06_multi_taxi_runtime_execution_register_20260723.md`
4. `docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/source_specs/01_system_development_team_spec_20260720.md`
5. `docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/04_standard_taxi_vs_multi_taxi_dispatch_compliance_review_20260721.md`
6. `tests/e2e/E2E-017-driver-sos-incident.sh`
7. `ai-status.json` task slices for `S3-VERIFY-001` and
   `S3-VERIFY-001-UNBLOCK-PLANNING-DECISION`

## Decision

`S3-VERIFY-001` is unblocked on product and contract interpretation.

The binding decisions are:

1. Keep the accepted S-3 verification split exactly as planned:
   `S3-VERIFY-001` for current-head API/Driver/Ops E2E,
   `S3-VERIFY-002` for Android/iOS offline replay,
   `S3-VERIFY-003` for attachment security,
   `S3-VERIFY-004` for alert p95 measurement,
   `S3-VERIFY-005` for forbidden vocabulary and screenshots.
2. Do not reopen S-3 domain semantics, UI behavior, or contract shape in the
   parent task. Fleet G is a verification lane, not a redesign lane.
3. Treat missing `support/sidecars/S3-VERIFY-001/*` evidence packaging and any
   missing current-head E2E scenario coverage as execution work owned by the
   parent task.
4. Treat physical-device proof, attachment security proof, and production
   observability proof as already-routed downstream evidence work, not unresolved
   planning semantics.

## Scope cut and routing

This unblock does **not** claim that `S3-VERIFY-001` acceptance is satisfied on
`2026-07-23`.

Out of scope for this helper task:

1. Producing Android or iOS device/simulator evidence.
2. Producing attachment malware-scan evidence.
3. Producing production p95 observability evidence.
4. Rebuilding SOS backend, Driver UI, or Ops UI.

Remaining routed work for the parent task:

1. Create or restore the canonical `support/sidecars/S3-VERIFY-001/` evidence
   packet expected by machine truth.
2. Run or document current-head API/Driver/Ops E2E against the accepted S-3
   flow:
   create SOS, exactly one Incident, event number, outbox, Ops stream,
   first-ack wins, resolve, and close.
3. Reuse `tests/e2e/E2E-017-driver-sos-incident.sh` as one current-head proof
   input, then fill any missing Ops-side E2E assertions needed for the full
   parent acceptance packet.
4. Keep `S3-VERIFY-002..005` as the follow-on evidence lanes for device,
   security, observability, and forbidden-vocabulary proof.

## Parent unblocked next step

The parent task should replace any vague "missing product / contract decision"
wording with this concrete next step:

1. Keep the accepted S-3 verification contract fixed to the 2026-07-20
   implementation plan and 2026-07-23 fleet execution register.
2. Resume `S3-VERIFY-001` as current-head evidence assembly:
   - create `support/sidecars/S3-VERIFY-001/` canonical evidence files
   - capture API/Driver/Ops E2E proof for create, incident creation, outbox,
     Ops stream, first-ack wins, resolve, and close
   - include current-head commit SHA in the packet
3. Leave Android/iOS offline replay, attachment scan, p95 measurement, and
   forbidden-vocabulary proof routed to `S3-VERIFY-002..005` instead of
   relabeling them as planning gaps.
4. If physical-device or observability access is still unavailable after the
   parent evidence packet is assembled, keep those gaps explicitly blocked as
   execution evidence limits rather than reopening planning.

Recommended parent status after this helper closes: `blocked` with the concrete
execution-evidence next step above, not a planning-decision blocker.

## Acceptance mapping

| Acceptance item                                                                             | Result                                                                                                                                             |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resolve or route the missing product/contract decision through canonical planning artifacts | Resolved as routing-only: canonical Phase 1 planning artifacts already define the S-3 verification contract and task split.                       |
| Record the decision                                                                         | Recorded here: no new product or contract decision is needed for `S3-VERIFY-001`.                                                                 |
| scope cut                                                                                   | Recorded in `Scope cut and routing`: this helper does not claim device, security, or observability proof.                                         |
| or explicit follow-up needed by the parent task                                             | Recorded in `Parent unblocked next step`: assemble the current-head E2E evidence packet and keep `S3-VERIFY-002..005` as downstream proof lanes. |
| Produce task-scoped commit/push/PR evidence for any canonical change                        | To be attached on this task branch via the task-scoped commit and push for this unblock artifact plus machine-truth updates.                      |
| Update the parent task with the concrete unblocked next step                                | The concrete blocked next step is recorded above and should replace the planning-gap wording on the parent task.                                  |

## Verification basis

- `docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/03_gap_closure_implementation_plan.md`
- `docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/07_fleets_execution_tasks_20260723.md`
- `docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/06_multi_taxi_runtime_execution_register_20260723.md`
- `docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/source_specs/01_system_development_team_spec_20260720.md`
- `docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/04_standard_taxi_vs_multi_taxi_dispatch_compliance_review_20260721.md`
- `tests/e2e/E2E-017-driver-sos-incident.sh`
