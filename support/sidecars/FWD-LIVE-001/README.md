# FWD-LIVE-001 Sidecar Classification

Date: 2026-05-23
Task: `PH1GC-FWD-001`
Workflow family: `WF-FWD-001`
Directive anchor: `docs/00-context/phase1-origin-dev-gap-closure-implementation-spec-20260520.md` §D, §7

## Classification

- Current sidecar classification: `repo-local harness + partial external blocker evidence`
- Real provider sandbox classification: `not proven`
- Current gate read: `EXTERNAL-GATED`

## What This Sidecar Can Prove

- `tests/e2e/E2E-002-forwarded-order.sh` proves the repo-local
  `forwarder_sandbox` mirror flow.
- `docs/02-architecture/forwarder-sandbox-provider.md` explicitly classifies
  `forwarder_sandbox` as non-production and stub-only.
- `support/sidecars/FWD-LIVE-001/FWD-LIVE-001-EVIDENCE-PACK.md` records the
  latest external-access attempt and why it did not reach a real partner
  sandbox.
- `support/sidecars/FWD-LIVE-001/FWD-LIVE-001-PROVIDER-PROOF.md` maps the 11
  directive-§D proof items and marks which remain missing from a real sandbox
  endpoint.

## Non-Claim

Do not describe this sidecar as:

- `PASS (sandbox evidence)`
- `PASS (live staging evidence)`
- real partner sandbox proof
- production-ready forwarder adapter proof

The strongest truthful reading on 2026-05-23 is:

- repo-local forwarder harness exists and is executable
- real partner sandbox proof is still absent
- `WF-FWD-001` must remain `EXTERNAL-GATED`

## Required Future Inputs For Sandbox Claim

To move this sidecar beyond repo-local classification, a real partner sandbox
must provide:

1. provider/platform identity and adapter classification
2. masked credential reference
3. reachable sandbox endpoint
4. inbound order sample
5. accept confirmation sample
6. lost-race sample
7. cancel sample
8. complete sample
9. settlement sample
10. no-owned-assignment proof
11. webhook signature and replay/idempotency proof
