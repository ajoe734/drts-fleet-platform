# PH1GC-FWD-001 External Sandbox Blocker

Date: `2026-05-24`
Task: `PH1GC-FWD-001`
Owner: `Codex2`
Reviewer: `Codex`
Workflow family: `WF-FWD-001`
Directive anchor: `docs/00-context/phase1-design-blueprint-completion-directive-20260519.md` §3.3, §7

## Current Status

`PH1GC-FWD-001` remains blocked on a real forwarder sandbox handoff.

The current repo can only prove the repo-local `forwarder_sandbox` fallback.
That is sufficient for `PASS (repo-local)` only. It is not sufficient for the
parent acceptance, which explicitly requires all 11 directive-§D proof items to
come from a real sandbox endpoint and explicitly forbids purely local fixture
substitution.

## Why The Task Is Still Blocked

1. `support/sidecars/FWD-LIVE-001/FWD-LIVE-001-EVIDENCE-PACK.md` still records
   only a dated partial external attempt plus today's blocker revalidation. A
   second same-day rerun at `2026-05-24T16:31Z` to `2026-05-24T16:32Z` still
   never reached a real partner path because non-interactive identity-token
   minting failed, the older `run.app` staging host returned `404`, and the
   documented internal staging host returned `NXDOMAIN`.
2. `support/sidecars/EXT-002/EXT-002-FORWARDER-ADAPTER-GATE.md` still keeps
   `EXT-002-BLK-001` through `EXT-002-BLK-007` open for the real adapter path:
   contract authority, sandbox credentials, webhook signing/replay rules, live
   seed, callback lifecycle, lost-race/duplicate evidence, and
   no-owned-assignment proof.
3. `docs/02-architecture/forwarder-sandbox-provider.md` still classifies
   `forwarder_sandbox` as the internal mock harness only. It must not be
   promoted to sandbox evidence.

## 2026-05-24 Revalidation Snapshot

Commands rerun today:

```bash
gcloud auth list --filter=status:ACTIVE --format='value(account)'
gcloud auth print-identity-token
curl -I -sS --max-time 15 https://drts-api-kdhu6wzufa-uc.a.run.app/
curl -I -sS --max-time 15 https://drts-api-kdhu6wzufa-uc.a.run.app/health
curl -I -sS --max-time 15 https://drts-api-kdhu6wzufa-uc.a.run.app/api/health
nslookup api-staging.drts.internal
curl -I -sS --max-time 15 https://api-staging.drts.internal/
curl -I -sS --max-time 15 https://api-staging.drts.internal/api/health
```

Observed results:

- active `gcloud` account still resolves to `bobo.du@cctech-support.com`
- `gcloud auth print-identity-token` still fails with reauthentication
  required and non-interactive execution blocked
- all three `drts-api-kdhu6wzufa-uc.a.run.app` probes still return HTTP `404`
  at `2026-05-24T15:58:55Z`
- `nslookup api-staging.drts.internal` still returns `NXDOMAIN`
- direct `curl` probes to `api-staging.drts.internal` still fail with
  `Could not resolve host`

Second same-day rerun observed at `2026-05-24T16:31:23Z` to
`2026-05-24T16:32:00Z`:

- active `gcloud` account still resolves to `bobo.du@cctech-support.com`
- `gcloud auth print-identity-token` still fails with reauthentication
  required, non-interactive execution blocked, and instructs
  `gcloud auth login`
- all three `drts-api-kdhu6wzufa-uc.a.run.app` probes still return HTTP `404`
  at `2026-05-24T16:31:23Z`
- `nslookup api-staging.drts.internal` still returns `NXDOMAIN`

## Required External Handoff Bundle

The parent can resume only after the forwarder technical owner or integration
owner provides a concrete sandbox bundle with enough detail to capture the 11
directive-§D proofs repeatably.

Required minimum bundle:

1. Named sandbox platform and classification to use in `FWD-LIVE-001`.
2. Reachable base URL or ingress host that serves the partner sandbox from the
   evidence-capture environment.
3. Masked credential references for the sandbox auth path: client id, secret or
   bearer-token source, owning system, and expiry or rotation note.
4. Webhook signing metadata: header names, secret reference, canonical payload
   rules, timestamp window, and replay-denial or idempotency behavior.
5. Allowlist or routing instructions for the DRTS callback endpoint if the
   partner must push to a registered webhook URL.
6. Seed procedure for at least one inbound forwarded task that can be observed
   in staging, including any test merchant, store, or order trigger needed to
   produce the task.
7. Replay recipe for the callback lifecycle so DRTS can capture accept,
   lost-race, cancel, and complete proofs with correlation identifiers.
8. Settlement or earnings sample retrieval instructions that match the sandbox
   provider billing or export surface.

## Capture Checklist Once Bundle Arrives

The next parent run should capture and store all of the following in
`support/sidecars/FWD-LIVE-001/`:

1. Platform name plus classification.
2. Masked credential reference.
3. Inbound sample.
4. Accept sample.
5. Lost-race sample.
6. Cancel sample.
7. Complete sample.
8. Settlement sample.
9. No-owned-assignment proof.
10. Replay or idempotency proof.
11. Signature proof.

## Non-Claim

Until the bundle above arrives and the proofs are captured from a reachable real
sandbox, this task must not be described as:

- `PASS (sandbox evidence)`
- `PASS (live staging evidence)`
- real partner sandbox closure
- completed forwarder live proof

The strongest truthful read remains:

- `WF-FWD-001` is `PASS (repo-local)` only
- `PH1GC-FWD-001` is blocked on external sandbox enablement
