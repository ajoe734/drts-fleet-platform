# Stage 1 release finalization GAP (2026-08-21)

## Scope

This GAP covers only the remaining minimum work needed to make the completed
Stage 1 implementation a truthful deployed Dev release. It does not add product
features or broaden the IAM scope.

## Current milestone decision (2026-08-22)

The immediate milestone is **Stage 1 code and required CI complete**, not a live
GCP Dev release. For this milestone:

- F1 evidence truth and F2 candidate lock are required.
- F3 infrastructure readiness, F4 Dev deployment, F5 operational acceptance,
  and the live-release portion of F6 are deferred until GCP billing is enabled
  or a separately reviewed deployment target is adopted.
- Deferred work remains explicitly incomplete. It is not waived, converted to
  a pass, or represented by PR CI.

The code/CI milestone is pinned to merge SHA
`4012b10c0cd4990bd238eaed6ddc23252bc0c8d4`, which is reachable from current
`dev`. Its trunk integration run `31997773400` completed successfully. Live
deployment and same-SHA runtime acceptance remain a separate future milestone.

## Verified current state

- All tasks in `stage1-functional-completion-20260808` are recorded as `done`.
- `S1F-REL-001` merged through PR #1451 as
  `4012b10c0cd4990bd238eaed6ddc23252bc0c8d4` and its PR CI passed.
- The recorded `dev_deploy_run_url` and `operational_acceptance_run_url` point to
  PR CI run `31997270480`, not to a `Deploy - Dev` workflow.
- The active task records candidate `4b4c61d9b4794d50d45fb1119788aa574f307f90`;
  the evidence pack records `527a3d403464806ea1d4f417c60ac3e4fa8f17d6`;
  the recorded deployment acceptance SHA is merge SHA
  `4012b10c0cd4990bd238eaed6ddc23252bc0c8d4`.
- Deploy run `32444483620` on 2026-08-21 failed while pushing the API image
  because billing is not enabled for GCP project number `952590575714`.
  Migration, service deployment, health checks, and candidate operational
  acceptance were therefore skipped.

## Remaining gaps

| GAP | Minimum completion condition |
| --- | --- |
| F1 Evidence truth | One ledger identifies the candidate, CI, merge, deploy, and acceptance SHAs and explains every SHA transition. |
| F2 Candidate lock | One immutable deployable SHA is selected, reachable from reviewed dependencies, and green in required CI. |
| F3 Infrastructure readiness | GCP billing permits Artifact Registry push and the Dev workflow can proceed past image publication. |
| F4 Dev deployment | The locked SHA completes image publication, migration, deployment, and health checks in `Deploy - Dev`. |
| F5 Operational acceptance | Active surfaces return the deployed SHA, required browser journeys pass, and paused or retired surfaces return 404. |
| F6 Truthful closeout | Final evidence contains real workflow/job URLs and the release is not declared complete before F1-F5 pass. |

## Non-gaps

- No additional login, account, RBAC, MFA, or session feature is required for
  this closeout. Their minimum-scope execution tasks are already complete.
- A new design system, production deployment, store distribution, penetration
  test, or compliance certification is not required.
- A successful PR CI run is not a substitute for deployed operational
  acceptance.

## Completion rule

The release is complete only when one traceable chain exists:

`reviewed candidate -> CI success -> merged/deployable SHA -> Deploy - Dev success -> same-SHA operational acceptance -> final evidence`

Billing unavailability is an external gate. It must remain explicit and must
not be converted into a passing acceptance record.
