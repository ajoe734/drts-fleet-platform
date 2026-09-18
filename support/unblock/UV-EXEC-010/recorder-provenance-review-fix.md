# UV-EXEC-010 recorder provenance review fix

Owner: Codex (supervisor fallback assignment); reviewer: Codex2.

Addresses the P1 rejection of candidate `36b171c503f65fd89527dc39843b6b1a6fa90ae8`:
a valid inbound object could be relabelled outbound without recording outbound audio.

The recorder now uses a dedicated `putRecordingImmutable` storage capability after
ingress authorization. Its adapter contract requires atomic, immutable persistence
of bytes and recorder metadata, including scope, channel, media offsets, UTC,
integrity, object identity and durability. Generic object writers must not have
this capability. Every audio read verifies that independently stored metadata
against the segment. Missing metadata fails closed, including legacy objects
whose provenance cannot be established. Manifest JSON is never provenance.

Regression coverage includes speech and DTMF manifests with a valid independent
receipt but reused inbound audio labelled outbound, both at sealing and trusted
retrieval. Retrieval uploads forged, correctly checksummed manifest JSON directly
to storage to exercise the reader independently of sealing. Further cases cover
scope/time/channel relabelling, generic or synthesized uploads, and provenance
loss across reader instances.

Validation on 2026-09-08:

- `pnpm exec vitest run tests/unit/uv-exec-010.test.ts`: 59 passed.
- `pnpm exec vitest run tests/unit/callcenter.test.ts`: 9 passed.
- `pnpm exec vitest run tests/unit/sandbox-webhook.adapter.test.ts`: 2 passed.
- `pnpm --filter @drts/api typecheck`: passed.
- `pnpm --filter @drts/voice-media-worker typecheck`: passed.
- ESLint for the two changed TypeScript files: passed.
- `git diff --check`: passed.

These are adapter-contract and local regression results; they do not establish
production recorder storage/IAM configuration or real PSTN audio acceptance.
Production adapters must enforce the documented write capability and return
persisted provenance, never reconstruct it from caller claims. CI, independent
review, merge and external acceptance remain candidate-lifecycle responsibilities.

`git rebase origin/dev` encountered a historical index export conflict. It was
aborted, and origin/dev was merged instead to preserve published candidate history
and permit a normal non-force push. No stash or force push was used.
