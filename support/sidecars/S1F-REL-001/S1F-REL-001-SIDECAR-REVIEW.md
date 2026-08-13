# S1F-REL-001 — review packet and evidence summary

Task: `S1F-REL-001-SIDECAR-REVIEW`  
Parent: `S1F-REL-001`  
Prepared by: `Codex2`  
Assigned reviewer: `Codex`  
Prepared: 2026-08-13

## Scope and review boundary

This is a support-only packet. It summarizes the machine-truth task slices and
repository evidence available at preparation time; it does not alter the
release candidate, canonical product truth, deployment record, or acceptance
result.

The parent task is currently in `review` with its locked candidate:

| Item | Value |
| --- | --- |
| Candidate SHA | `444121b9a97a0ffa949841bc6761c162dd0c703d` |
| Candidate branch | `codex/s1f-rel-001` |
| Parent reviewer | `Claude` |
| Parent machine-truth state | `review` |

The candidate commit is an anchor-formatting commit and changes only the
Enterprise Dispatch booking submit component, the S1F UIX evidence document,
and the referral-embed authority fixture. Its commit message explicitly says
it formats the reviewed UIX integration files for repository formatting
checks. This packet does **not** treat an anchor commit as deployment or live
acceptance proof.

## Dependency and lineage summary

| Dependency | Machine-truth result | Evidence / relationship to parent candidate |
| --- | --- | --- |
| `S1F-REL-001-PREDEPLOY` | `done`; merged to `dev` at `f9c720fa49df888ea4761f167d16c96b64a9481f` | The merge commit is an ancestor of the parent candidate. Its deployment evidence record remains a template with all runtime values pending. |
| `S1F-UIX-001` | `done`; reviewed candidate `5ef8259682ae8167234c64604a16478ffb13d6e4` | That reviewed SHA is an ancestor of the parent candidate. The completed task’s own handoff states that deployed-candidate browser acceptance still requires deployment URLs. |
| `S1F-DRV-001` | `done`; merged to `dev` through `6a43f1a9423c14d9b232770222a7f5aebaa7b5b5` | Its recorded owner commit `048a5d328a1cb2349694157eff3b44749f7bea5c` is an ancestor of the parent candidate. |

Lineage checks performed while preparing this packet:

```text
f9c720fa49df888ea4761f167d16c96b64a9481f ancestor of 444121b9...: yes
5ef8259682ae8167234c64604a16478ffb13d6e4 ancestor of 444121b9...: yes
048a5d328a1cb2349694157eff3b44749f7bea5c ancestor of 444121b9...: yes
```

## Evidence available now

| Release requirement | Present evidence | Current conclusion |
| --- | --- | --- |
| Reviewed dependency commits reach the candidate | Git ancestry checks above; task slices for PREDEPLOY, UIX, and Driver | **Supported** for the three declared dependencies. |
| Candidate-bound operational gate exists | [operational-browser-acceptance-runbook.md](../../../docs/04-uat/operational-browser-acceptance-runbook.md), [run-operational-browser-acceptance.sh](../../../scripts/run-operational-browser-acceptance.sh), [deploy-dev.yml](../../../.github/workflows/deploy-dev.yml) `operational-candidate-acceptance` job | **Supported as implemented gate**, not as a successful live run. |
| Immutable SHA is checked across active surfaces | Runbook requires `x-drts-candidate-sha` for active routes, mutations, and readbacks; runner requires a full SHA plus all deployed URLs | **Pending live evidence**. |
| Mutations receive backend/API or DB readback | Runbook requires each manifest operation to record returned ID and API/database readback state | **Pending successful candidate-specific execution**. |
| Paused/retired surfaces are proven unavailable | Runbook requires 404 for Partner Booking, Concierge, and retired Passenger; candidate manifest lists those surfaces | **Pending deployed URL results**. |

## Explicit missing evidence and release blockers

`docs/04-uat/s1f-rel-001-predeploy-candidate-evidence.md` labels itself a
run-record template, not deployment proof. Its source SHA, image tag,
migration execution, workflow URLs, and all surface URL/result rows are still
`pending`.

Accordingly, the following parent acceptance claims must remain unapproved
until the normal Dev workflow produces evidence for the *same locked SHA*:

1. CI/API/native/operational suites for the final candidate.
2. Dev deployment, image/migration, and deployed-revision identity.
3. Candidate-specific operational browser journeys, mutation readbacks, and
   active-surface candidate headers.
4. 404 results for Partner Booking, Concierge, and retired Passenger.
5. The parent’s GAP gates `G1` through `G8` completion evidence.

No earlier UIX review or historical Dev run may substitute for these
candidate-bound results.

## Reviewer handoff checklist

For a read-only review, `Codex` should:

1. Confirm the parent candidate SHA remains
   `444121b9a97a0ffa949841bc6761c162dd0c703d`; do not review a later branch
   head under this handoff.
2. Re-run the three ancestry checks in this packet against that SHA.
3. Confirm the runner and Deploy — Dev workflow still bind a full immutable SHA
   and require every active and retired URL before operational acceptance runs.
4. Treat the PREDEPLOY evidence file’s pending fields as blockers, rather than
   inferring deployment completion from the merged PREDEPLOY task.
5. If deployment evidence appears, verify its workflow URL, deployed revision,
   browser evidence JSON, mutation readbacks, and retired-surface 404 results
   all name the same candidate SHA.
6. Record pass only for the scope actually evidenced. If any item above is
   absent or references another SHA, reopen or block the parent release task;
   this sidecar packet itself requires no canonical change.

## Source index

- Machine truth: `scripts/ai-status.sh show S1F-REL-001` and its three
  dependencies, inspected 2026-08-13.
- `docs/04-uat/s1f-rel-001-predeploy-candidate-evidence.md`.
- `docs/04-uat/operational-browser-acceptance-runbook.md`.
- `scripts/run-operational-browser-acceptance.sh`.
- `.github/workflows/deploy-dev.yml`, `operational-candidate-acceptance` job.
- `tests/e2e/fixtures/candidate-journey-manifest.json`.
