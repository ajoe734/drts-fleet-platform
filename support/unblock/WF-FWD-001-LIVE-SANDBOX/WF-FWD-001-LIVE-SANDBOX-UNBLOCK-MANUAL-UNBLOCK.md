# WF-FWD-001-LIVE-SANDBOX Manual Unblock

- Task: `WF-FWD-001-LIVE-SANDBOX-UNBLOCK-MANUAL-UNBLOCK`
- Parent: `WF-FWD-001-LIVE-SANDBOX`
- Owner: `Codex2`
- Reviewer: `Codex`
- Date: `2026-05-19`
- Status: `documented remaining blockers`

## Diagnosis

`WF-FWD-001-LIVE-SANDBOX` is still blocked for two separate reasons:

1. The declared dependency is not actually complete in current machine truth.
   - `ai-status.json` still records `FWD-SPEC-001` as `backlog`.
   - `current-work.md` still lists `FWD-SPEC-001` as `backlog`.
   - The declared artifact `docs/02-architecture/forwarder-adapter-proof-spec-20260519.md`
     is not present in the repo.
2. Even after the spec dependency is closed, the live partner sandbox gate
   remains external.
   - `WF-FWD-001` is still `EXTERNAL-GATED` in
     `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`.
   - `support/sidecars/EXT-002/EXT-002-FORWARDER-ADAPTER-GATE.md` still keeps
     `EXT-002-BLK-001` through `EXT-002-BLK-007` open.
   - `support/sidecars/FWD-LIVE-001/FWD-LIVE-001-EVIDENCE-PACK.md` records only
     partial evidence and explicitly keeps `WF-FWD-001` external-gated.

This means the parent is not "dependency-ready but externally blocked." It is
currently blocked by both an unfinished internal dependency and the already
documented external sandbox package gap.

## Remaining Blockers

### Internal dependency blocker

`FWD-SPEC-001` must finish before the parent can claim its dependency gate is
satisfied.

Required minimum closeout for `FWD-SPEC-001`:

1. Create `docs/02-architecture/forwarder-adapter-proof-spec-20260519.md`.
2. Capture the forwarder proof boundary now established by
   `FWD-VERIF-001`, `FWD-LIVE-001`, and `EXT-002`.
3. Update machine truth so `FWD-SPEC-001` is actually `done`.

### External sandbox blocker

After `FWD-SPEC-001` is done, the parent still needs the live partner sandbox
package already tracked by `EXT-002-BLK-001` through `EXT-002-BLK-007`:

1. Approved live API contract and callback payload authority.
2. Sandbox credentials, webhook signing secret, and network allowlist.
3. Signature verification and replay-protection details.
4. At least one real forwarded-task seed or inbound order in staging.
5. Lifecycle callback, race-handling, and no-owned-assignment evidence.

## Concrete Parent Next Step

Resume `WF-FWD-001-LIVE-SANDBOX` in this order:

1. Complete `FWD-SPEC-001` and mark that dependency `done` in machine truth.
2. Once the dependency is closed, wait for or obtain the partner sandbox
   package tracked by `EXT-002-BLK-001` through `EXT-002-BLK-007`.
3. Re-run the live forwarder proof flow in staging with
   `support/sidecars/FWD-LIVE-001/FWD-LIVE-001-EVIDENCE-PACK.md` as the
   checklist.

Recommended parent wording:

> `WF-FWD-001-LIVE-SANDBOX` remains blocked. First complete `FWD-SPEC-001`
> because the spec artifact is still missing and the dependency is still
> `backlog` in machine truth. After that, await the partner sandbox package
> required by `EXT-002-BLK-001` through `EXT-002-BLK-007`, then rerun the FWD
> live evidence pack in staging.

## Why No Runtime Code Change Was Needed

The blocker is not a repo bug in the forwarder implementation surface. The
missing work is:

- one still-open documentation/spec dependency, and
- one already-known external partner sandbox package.

The unblock action is therefore to correct the dependency diagnosis and point
the parent at the actual next step.

## Source Pointers

- `ai-status.json` entry for `FWD-SPEC-001`
- `ai-status.json` entry for `WF-FWD-001-LIVE-SANDBOX`
- `current-work.md`
- `support/sidecars/EXT-002/EXT-002-FORWARDER-ADAPTER-GATE.md`
- `support/sidecars/FWD-VERIF-001/FWD-VERIF-001-VERIFICATION.md`
- `support/sidecars/FWD-LIVE-001/FWD-LIVE-001-EVIDENCE-PACK.md`
- `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`
