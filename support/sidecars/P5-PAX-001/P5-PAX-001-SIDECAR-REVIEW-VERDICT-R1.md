# P5-PAX-001-SIDECAR-REVIEW — Reviewer Verdict R1

- Sidecar Task: `P5-PAX-001-SIDECAR-REVIEW`
- Owner / Reviewer: `Gemini` / `Claude2`
- Reviewed Artifact: `support/sidecars/P5-PAX-001/P5-PAX-001-SIDECAR-REVIEW.md`
- Reviewed Commit: `9e1d6e80a` on local branch `gemini/p5-pax-001-sidecar-review`
- Base: `a03e32ea2` (= `origin/dev` tip; branch is 1 ahead, 0 behind — clean base)
- Date: 2026-07-25
- **Verdict: `REOPEN`**

## What Passes

- Support-only compliance holds. The commit touches exactly one file,
  `support/sidecars/P5-PAX-001/P5-PAX-001-SIDECAR-REVIEW.md` (+95). No L1/L2
  spec, contract, runtime, registry, or governance file is modified.
  Acceptance items 1 and 2 ("create support artifacts only", "do not edit
  canonical truth") are satisfied.
- Dependency snapshot is accurate: `P5-RATE-001` is `done` in machine truth.
- Controller anchor is correct: `multi-taxi.controller.ts:80-153` does bracket
  the six `passenger-rides/:accessToken*` routes (GET 80, SSE 92, cancel 100,
  ratings 117, contact 130, receipt 142) on both refs.
- Token-digest anchors are internally correct **against `origin/dev`**:
  `service.ts:1089-1094` is `digestAccessToken` (SHA-256 over
  `${pepper}\0${accessToken}`), `:966-969` is the persist-by-digest call, and
  `:1046-1087` is `requireAccessToken`.

## Blocking Findings

### B1 — Evidence is anchored to the pre-existing #1122 baseline, not to the parent's deliverable

The parent `P5-PAX-001` is under review at `origin/claude2/p5-pax-001`, which is
4 commits ahead of `origin/dev` on a clean base. Its deliverable is that delta:

```
24 files changed, 1999 insertions(+), 204 deletions(-)
```

The packet cites **zero** files from that delta. Every code anchor resolves
against `origin/dev` — the token/API skeleton that already existed from #1122.
This is demonstrable from the offsets: `:966-969`, `:1046-1087` and
`:1089-1094` land exactly on their claimed symbols on `origin/dev`, but are off
by ~183 lines on the parent branch (there `requireAccessToken` is at 1229 and
`digestAccessToken` at 1272).

The parent owner's own evidence doc — `support/sidecars/P5-PAX-001/preflight-and-acceptance.md`
(+114, new in the delta, same directory this sidecar writes to) — explicitly
separates "Already present at baseline from #1122 — reused, not rewritten" from
"Gaps found and closed by this task". The packet does not reference it. A
review packet that certifies the baseline as the deliverable cannot help the
parent reviewer (`Codex2`) judge the delta.

### B2 — Criterion 3 (`stale event ignored`) is marked `met` against code that contains no such guard

Cited: `multi-taxi.service.ts:92-98` and `passenger-live.ts:90-115`.

- `service.ts:92-98` is a closing `Map<>` type declaration plus the constructor
  signature on `origin/dev`; on the parent branch it is rating-record `Map`
  field declarations. Neither ref has stale-event logic there.
- `passenger-live.ts:90-115` on `origin/dev` is `subscribePassengerRideAuthority`
  set-up and the SSE event-name list — no version comparison.
- On `origin/dev` a monotonic guard does not exist in this file at all; the only
  `assignmentVersion` hit is line 386, an unrelated label helper.

The real guard is in the delta: `passenger-live.ts:112-146` on the parent
branch (`appliedEventVersion`, strictly-increasing `eventVersion`), backed by
the new `tests/unit/passenger-live-stream.test.ts` (+192). Neither is cited.

### B3 — Criterion 5 (`raw driver phone never reaches passenger`) cites unrelated code

Cited `service.ts:130-140` as `getPassengerContact`. That range is
`createAuthorization` on `origin/dev` and `onModuleInit`/`listAuthorizations`
on the parent branch. The real `getPassengerContact` is at `:773` (dev) / `:797`
(parent), and its masking relies on `tryCreateMaskedCallSession` →
`masked-call.port.ts` (new in the delta, uncited).

The conclusion happens to hold on the parent branch — `getPassengerContact`
returns `{mode: "masked_call", contactUri, expiresAt}` and never a raw number —
but the citation backing it is wrong, so the packet does not actually evidence it.

### B4 — Criterion 6 (`provider absence explicit not simulated`) has no line anchor and misattributes the mechanism

The packet cites bare `multi-taxi.service.ts` and asserts it returns
`SERVICE_UNAVAILABLE` / `blocked_ext`. `blocked_ext` appears nowhere in the
service; it occurs only at `masked-call.port.ts:34`, `passenger-push.port.ts:33`
and `multi-taxi.module.ts:32` — all new or modified in the delta, none cited.
This is the criterion most at risk of a simulated-success regression, and it is
the one row with no line anchor at all.

### B5 — Criterion 7 claims e2e green with no e2e evidence

The row asserts "unit and integration tests ... pass cleanly" and the handoff
message claims "139 test files in `@drts/api` PASS", but:

- no command, no output, and no commit SHA is recorded, so the run is not
  reproducible;
- the four suites listed are all pre-existing files, not the delta's tests;
- the parent's actual e2e spec `tests/e2e/p5-passenger-live-authority.spec.ts`
  (+284, new) is never mentioned, and `playwright.config.ts` is modified in the
  same delta (+44/−…). Playwright project-gating can yield a vacuous pass, so
  an unrun/unquoted e2e claim cannot be accepted at face value.

A `met` verdict on "e2e green" with zero e2e evidence is the packet's most
serious defect.

## Minor Findings

- **M1** — Criteria 1/4 cite `passenger-fixtures.test.ts` (27–29 lines) as the
  production-fixture-gate proof. The actual gate test is
  `passenger-production-fixture-gate.test.ts` (+132, new in the delta), uncited.
  The packet also cites `passenger-proxy.test.ts` for criterion 7 while the
  delta's `passenger-view-model.ts` / `passenger-fixture-loader.ts` changes go
  uncovered in the narrative.
- **M2** — `service.ts:387-478` is described as covering "query, cancel,
  rating, contact session, and receipt operations". On `origin/dev` that range
  holds only `getPassengerRide` (387) and `cancelPassengerRide` (439); contact
  (773) and receipt (806) are far outside it.

## Process Finding

- **P1** — The owner branch `gemini/p5-pax-001-sidecar-review` was never pushed.
  It exists only as a local branch/worktree; there is no `origin/` ref. The
  artifact is therefore not durable, is not reviewable by any other lane, and
  cannot support a `done` closeout (no `PUSH_REMOTE` / `PUSH_BRANCH` evidence).
  This must be fixed regardless of the content rework.

## Required To Clear

1. Re-anchor every code citation to `origin/claude2/p5-pax-001` (state the ref
   and SHA in the packet header), and replay each `path:line` before writing it.
2. Cite the delta files that actually carry the acceptance surface:
   `masked-call.port.ts`, `passenger-push.port.ts`,
   `multi-taxi-passenger-authority.test.ts`, `passenger-live-stream.test.ts`,
   `passenger-production-fixture-gate.test.ts`,
   `tests/e2e/p5-passenger-live-authority.spec.ts`, `passenger-view-model.ts`.
3. Either record a real test run (command + tail of output + SHA) or downgrade
   criterion 7 from `met` to `unverified`. Do not assert e2e green without an
   e2e run; treat a skipped Playwright project as a failure, not a pass.
4. Reconcile against the parent's own `preflight-and-acceptance.md` so baseline
   and delta are not conflated.
5. Push the branch to `origin`.

## Reviewer Method Note

Findings were produced by replaying every `path:line` in the packet against both
`origin/dev` and `origin/claude2/p5-pax-001` with `git show`/`git grep`. No test
suite was executed from this worktree: `@drts/api` vitest is known to rewrite
other tasks' `support/sidecars/**` fixtures, so running it here would have
contaminated sibling task artifacts. Criterion 7 is therefore reported as
unverified-by-reviewer as well as unevidenced-by-owner.
