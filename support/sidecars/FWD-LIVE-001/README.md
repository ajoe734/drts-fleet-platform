# FWD-LIVE-001 Sidecar Classification

Date: 2026-05-24
Task: `PH1GC-FWD-001`
Workflow family: `WF-FWD-001`
Directive anchor: `docs/00-context/phase1-design-blueprint-completion-directive-20260519.md` §D, §7

## Classification

- Current sidecar classification: `repo-local`
- Current packet read: `PASS (repo-local)`
- Internal-mock fallback: `forwarder_sandbox`
- Real provider sandbox classification: `pending / not proven`

## What This Sidecar Proves

This sidecar is the directive-§D internal-mock fallback packet for
`WF-FWD-001`.

- `docs/02-architecture/forwarder-sandbox-provider.md` names
  `forwarder_sandbox`, its stub-only classification, and the covered flow
  steps.
- `tests/e2e/E2E-002-forwarded-order.sh` provides the repo-local inbound,
  accept, confirm, cancel, complete, settlement-shadow, and
  no-owned-assignment evidence path.
- `support/sidecars/FWD-VERIF-001/FWD-VERIF-001-VERIFICATION.md` provides the
  repo-local verification anchors for signature failure handling,
  replay/idempotency, and sync-failure recovery.
- `support/sidecars/FWD-LIVE-001/FWD-LIVE-001-PROVIDER-PROOF.md` maps all 11
  directive-§D proof items as present in repo-local form and records the
  non-claim boundary for real sandbox promotion.
- `support/sidecars/FWD-LIVE-001/FWD-LIVE-001-EVIDENCE-PACK.md` remains the
  dated external-attempt appendix; it is historical blocker evidence, not the
  packet verdict.

## Non-Claim

Do not describe this sidecar as:

- `PASS (sandbox evidence)`
- `PASS (live staging evidence)`
- real partner sandbox proof
- production-ready forwarder adapter proof

The strongest truthful reading on 2026-05-24 is:

- the 11-item proof packet is complete as `forwarder_sandbox` repo-local
  evidence
- the packet verdict is `PASS (repo-local)`
- real partner sandbox classification is still pending

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

For the current concrete external handoff request, see
`support/sidecars/FWD-LIVE-001/PH1GC-FWD-001-BLOCKER-20260524.md`.
