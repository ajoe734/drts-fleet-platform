# Stage 1 release finalization system design (2026-08-21)

## Goal

Finish the minimum release lifecycle without changing Stage 1 product
behaviour. The design separates evidence repair, source preflight,
infrastructure readiness, deployment, runtime acceptance, and closeout so the
supervisor can run independent work in parallel.

## Work boundaries

### Evidence lane

Reads orchestrator state, Git history, pull requests, workflows, and UAT files.
It produces a discrepancy ledger but cannot claim deployment success.

### Candidate lane

Selects one immutable SHA and proves dependency reachability, workflow syntax,
manifest validity, and required CI. It does not deploy or alter product code.

### Infrastructure lane

Checks whether the configured GCP project can use Artifact Registry and records
the exact external blocker. It must not substitute a legacy project or weaken
authentication.

### Deployment lane

Dispatches the normal `Deploy - Dev` workflow for the locked SHA once the
candidate and infrastructure gates pass. It captures workflow and job URLs,
image tag, migration result, revisions, and resolved URLs.

### Acceptance lane

Runs the repository's operational browser and HTTP assertions against those
resolved URLs. It verifies SHA headers, required journeys, and retired-surface
404 responses.

### Closeout lane

Reconciles all evidence into one final pack. It may mark the follow-up complete
only when every required acceptance field points to real deployment evidence.

## Dependency graph

```text
AUDIT -----------\
                  +--------------------------> CLOSEOUT
PREFLIGHT --> DEPLOY --> OPERATIONAL-UAT -----/
GCP-GATE ---/
```

`AUDIT`, `PREFLIGHT`, and `GCP-GATE` are independent roots. The external billing
gate therefore does not prevent the two internal lanes from finishing.

## Data contract

The handoff record must contain:

- candidate source SHA and branch or tag;
- reviewed dependency reachability results;
- PR and CI run URLs with CI SHA;
- merge or deployable SHA and the reason it differs from the PR head;
- Dev deploy run URL and deployed SHA;
- image tag, migration job, service revisions, and service URLs;
- operational acceptance job URL and accepted SHA;
- active-surface candidate-header results;
- paused and retired surface 404 results;
- final G1-G8 mapping without unsupported claims.

## Failure behaviour

- Billing unavailable: keep `GCP-GATE` non-complete with the current failing run
  URL and provider error. Do not repeatedly dispatch deploy runs.
- Candidate mismatch: return to `PREFLIGHT`; do not edit evidence to hide it.
- Deploy failure: preserve the failed run URL and rerun only after its cause is
  corrected.
- Runtime mismatch or browser failure: keep `OPERATIONAL-UAT` non-complete and
  report the exact surface and expected versus observed SHA or HTTP result.
- Missing evidence: `CLOSEOUT` fails closed even if implementation CI is green.

