# PH1GC-FWD-001 Manual Unblock

## Scope

- Task: `PH1GC-FWD-001-UNBLOCK-MANUAL-UNBLOCK`
- Parent: `PH1GC-FWD-001`
- Owner: `Codex`
- Reviewer: `Codex2`
- Audit date: `2026-05-24`

## Diagnosis

`PH1GC-FWD-001` is not blocked by a missing repo-local code change.
It remains blocked because the parent acceptance requires real forwarder sandbox
proof that this workspace cannot synthesize from the existing stub or local
harnesses.

1. The parent acceptance requires `support/sidecars/FWD-LIVE-001/` to contain
   all 11 directive `§D` sandbox proof items on `origin/dev`: platform name and
   classification, masked credential reference, inbound proof, accept proof,
   lost-race proof, cancel proof, complete proof, settlement proof,
   no-owned-assignment proof, replay/idempotency proof, and signature proof.
   The same acceptance explicitly rejects purely local fixtures as a stand-in.
2. `support/sidecars/FWD-LIVE-001/FWD-LIVE-001-EVIDENCE-PACK.md` still records
   only a dated partial evidence snapshot. Its latest probe set never reached a
   real partner path because non-interactive identity-token minting failed, the
   older `run.app` host returned `404`, and the documented internal staging host
   returned `NXDOMAIN`.
3. `support/sidecars/EXT-002/EXT-002-FORWARDER-ADAPTER-GATE.md` still keeps
   `EXT-002-BLK-001` through `EXT-002-BLK-007` open for the real adapter path:
   contract authority, sandbox credentials, webhook signing/replay rules, live
   seed, callback lifecycle, lost-race/duplicate evidence, and
   no-owned-assignment proof.
4. `docs/02-architecture/forwarder-sandbox-provider.md` documents the local
   `forwarder_sandbox` harness as non-production only. It is useful for local
   flow coverage, but it must never be presented as the parent's sandbox
   evidence.
5. The remaining blocker is therefore an external enablement bundle, not a repo
   bug: the parent is dependency-ready on the code side and blocked only on the
   real sandbox path needed to promote `WF-FWD-001` out of `EXTERNAL-GATED`.

## Missing External Enablement Bundle

The parent can resume only after the forwarder technical owner or integration
owner provides a complete sandbox bundle with enough detail to reproduce the 11
required proofs.

Required minimum bundle:

1. Named sandbox platform and classification to use for the evidence packet.
2. Reachable base URL or ingress host that serves the forwarder sandbox from
   this environment.
3. Masked credential references for the sandbox auth path: client id, client
   secret or bearer-token source, owning system, and expiry or rotation note.
4. Webhook signing metadata: header names, secret reference, canonical payload
   rules, timestamp window, and replay-denial/idempotency behavior.
5. Allowlist or routing instructions for the DRTS callback endpoint if the
   partner must push to a registered webhook URL.
6. Seed procedure for at least one inbound forwarded task that can be observed
   in staging, including any test merchant, store, or order trigger needed to
   produce the task.
7. Replay recipe for the callback lifecycle so DRTS can capture accept,
   lost-race, cancel, and complete proofs with correlation identifiers.
8. Settlement or earnings sample retrieval instructions that match the sandbox
   provider's billing/export surface.

Without this bundle the team cannot produce evidence that is both real and
repeatable, so the parent must stay externally blocked.

## Parent Proof Checklist Once Bundle Arrives

The next parent attempt should not start until all items below are planned for
capture in `support/sidecars/FWD-LIVE-001/`:

1. Sandbox platform name plus classification.
2. Masked credential reference.
3. Inbound forwarded-order sample.
4. Accept relay plus partner confirm or reject result.
5. Lost-race proof.
6. Cancel proof.
7. Complete proof.
8. Settlement sample.
9. No-owned-assignment proof.
10. Replay/idempotency proof.
11. Webhook signature proof.

## Parent Resume Sequence

Once the external bundle is available:

1. Confirm the sandbox host is reachable from the evidence-capture environment
   and that non-interactive auth can mint the token or otherwise authenticate.
2. Record the masked credential references and sandbox classification in
   `support/sidecars/FWD-LIVE-001/README.md` or the equivalent top-level packet
   summary before collecting request/response artifacts.
3. Run the real forwarder flow end to end: inbound order, mirrored task
   creation, driver accept, partner confirm or reject, lost-race, cancel,
   complete, and settlement sample capture.
4. Capture signed callback evidence and replay-denial/idempotency evidence with
   correlation IDs or equivalent audit handles.
5. Confirm that the forwarded task never creates an owned
   `dispatch_assignment`, then update the sidecar packet, closeout report, and
   matrix wording so `WF-FWD-001` can move from `EXTERNAL-GATED` to
   `PASS (sandbox evidence)`.

## Conclusion

This helper does not unblock the parent by changing product code. It records
that `PH1GC-FWD-001` is correctly blocked on an external forwarder sandbox
bundle: a reachable endpoint, masked credentials, webhook signing rules, live
seed procedure, replay recipe, and settlement sample instructions. Once that
bundle is delivered, the concrete next step is to resume `PH1GC-FWD-001` and
populate `support/sidecars/FWD-LIVE-001/` with the 11 directive `§D` proofs.

## Verification Performed For This Helper

- Read `AI_COLLABORATION_GUIDE.md`
- Inspected canonical `/home/edna/workspace/drts-fleet-platform/ai-status.json`
- Inspected canonical `/home/edna/workspace/drts-fleet-platform/ai-activity-log.jsonl`
- Reviewed `support/sidecars/FWD-LIVE-001/FWD-LIVE-001-EVIDENCE-PACK.md`
- Reviewed `support/sidecars/EXT-002/EXT-002-FORWARDER-ADAPTER-GATE.md`
- Reviewed `docs/02-architecture/forwarder-sandbox-provider.md`
- Reviewed `docs/00-context/phase1-design-blueprint-completion-directive-20260519.md` §3.3

No runtime test was executed for this helper because the diagnosed blocker is
the absence of the external sandbox bundle itself, not a local code-path
failure.
