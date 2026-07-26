# P5-PAX-001-SIDECAR-REVIEW — Reviewer Findings (R2)

- Sidecar Task: `P5-PAX-001-SIDECAR-REVIEW`
- Reviewer: `Claude` (chairman reassigned reviewer `Gemini2` → `Claude`)
- Owner: `Gemini`
- Packet under review: `support/sidecars/P5-PAX-001/P5-PAX-001-SIDECAR-REVIEW.md` @ `origin/gemini/p5-pax-001-sidecar-review` (`9d014119b`)
- Review baseline: `origin/dev` (`9648aed6d`)
- Verdict: **REOPEN** — substance sound; delta-catalog accuracy defects (A1–A4) plus a routing/anchor refresh (B1–B3)
- Date: 2026-07-25

Live task status, owner/reviewer assignment, and `last_update` are deferred to
`ai-status.json`; this file records only durable review findings.

## Verdict Summary

The packet's analytical substance is correct and independently reproducible. All
seven parent acceptance verdicts were re-verified against the **delivered**
parent commit and hold. The reopen is not for a rewrite.

Two distinct classes of finding, and the distinction matters for how the owner
should read this:

- **B1–B3 are staleness, not owner error.** The reviewer identity, parent
  owner/reviewer, and parent commit anchor were all correct or consistent with
  recorded routing when the packet was authored; chairman reassignment and the
  parent merge landed afterwards. Acceptance item 3 was satisfied at the time.
  They need a refresh because this is the archived artifact.
- **A1–A4 are genuine accuracy defects** in the delta-file catalog and two line
  anchors, independent of any staleness: one cited path does not exist, one
  modified file is described as deleted, `maskOpaqueToken` is anchored 81 lines
  off, and eight per-file counts disagree with `--numstat`. For a packet whose
  stated purpose is precise citation, these are the substantive reason to
  reopen.

## What Verified Clean

| Check | Result |
|---|---|
| Support-only scope | PASS — branch diff is exactly 1 file, `support/sidecars/P5-PAX-001/P5-PAX-001-SIDECAR-REVIEW.md` (+118) |
| No canonical-truth mutation | PASS — no `phase1_*`, contracts, migration plan, or parent implementation files touched |
| Parent delta totals | PASS — 24 files, +1999 / -204 confirmed against baseline `a03e32ea2` |
| Anchored tree fidelity | PASS — `git diff 6d9230d20 ff6a64ac3041` is empty; the anchored lane tip and the delivered commit are byte-identical trees |
| Declared dependency | PASS — `P5-RATE-001` is `done` in machine truth |
| Acceptance criteria 1–7 | PASS — all seven re-verified on delivered commit `ff6a64ac3041` (details below) |
| Parent test-result claims | PASS — typecheck/lint/vitest/playwright figures match `preflight-and-acceptance.md:68-80` verbatim |
| Cited preflight line refs | PASS — `:43-58` (bundle A/B), `:68-80` (commands/results), `:94-96` (`blocked_ext`) all resolve to the claimed content |

Acceptance re-verification anchors confirmed on `ff6a64ac3041`:

1. raw token never persisted/logged — `multi-taxi.service.ts:1157-1166` destructures
   `{ accessToken, ...tokenRecord }` before `persistRideAccessToken`; `:1272-1277`
   is SHA-256 over `${pepper}\0${accessToken}`; `:1192` caches by digest only.
2. wrong/expired token denied — `multi-taxi.service.ts:1232-1270`: length/blank
   guard, `revokedAt`/`expiresAt` check → invalid-token throw; scope miss →
   forbidden throw.
3. stale event ignored — `passenger-live.ts:121` gates on `isFreshPassengerEvent`
   (defined `:142`) against `appliedEventVersion`; server allocates
   `eventVersion` at `multi-taxi.service.ts:1023` via `nextPassengerEventVersion`
   (`:1043`).
4. production bundle cannot resolve fixture data — `passenger-fixture-loader.ts`,
   static-graph guard test, plus the A/B sentinel table in the parent preflight.
5. raw driver phone never reaches passenger — `getPassengerContact` at
   `multi-taxi.service.ts:797` through ~`:849`; `MaskedCallSubject` is
   identifier-only.
6. provider absence explicit not simulated — `masked-call.port.ts:34-48`
   `UnavailableMaskedCallPort.isAvailable() === false` and `createSession` throws;
   push port mirrors it; both bound as DI defaults.
7. unit+integration+e2e green — matches parent preflight command block.

## Required Refresh (Staleness, Not Owner Error)

The three items below were accurate — or at minimum consistent with recorded
routing — when the packet was authored on 2026-07-25 at ~13:5x. They went stale
through chairman reassignment and the parent merge that followed within the hour.
They must still be corrected, because this packet is the archived evidence
artifact and has to name the lane that signs it off and the commit that shipped.
None of them is an owner accuracy failure.

### B1 — Reviewer identity now stale

The packet names `Claude2` as sidecar reviewer in the header, in the Purpose
list, in the `Cross-Cuts For Sidecar Reviewer (Claude2)` heading and its four
sub-items, and in the acceptance checklist. The commit trailer reads
`Reviewer: claude2`.

That was correct at authoring time: `ai-status.json` handoffs record
`Gemini -> Claude2` at `2026-07-25T13:54:03Z`, so `Claude2` genuinely held the
sidecar reviewer role when the packet was written, and acceptance item 3 ("hand
off the packet to the assigned reviewer") **was satisfied**. The reviewer was
subsequently reassigned to **`Claude`**.

Fix: refresh every `Claude2` reviewer reference to `Claude`. No acceptance
criterion is in breach.

### B2 — Parent owner/reviewer now stale

Packet states `Parent Owner / Reviewer: Claude2 / Codex2`. The delivered parent
tree does live on `origin/claude2/p5-pax-001`, which is consistent with `Claude2`
having carried the parent when this packet was written.

Current machine truth for `P5-PAX-001`: owner **`Claude`**, reviewer
**`Gemini`** (`commit_agent: Claude`, `commit_reviewer: Gemini`). The activity
log records `chair_reassignment_applied` moving parent owner `Gemini2 -> Claude`
at `2026-07-25T14:23:30Z`, i.e. after this packet was authored.

Fix: refresh to `Claude` / `Gemini`.

### B3 — Evidence anchored to a branch that never reached `dev`

The packet pins `Parent Ref & Commit SHA: origin/claude2/p5-pax-001`
(`6d9230d20`) and instructs the reviewer, in cross-cut item 2, to verify all 24
delta files against it.

`6d9230d20` is **not** an ancestor of `origin/dev`. The parent shipped as
`ff6a64ac30418f3281f3f0d1a4b33e1751110980` — `P5-PAX-001: live passenger
authority with monotonic SSE and honest provider ports (#1154)` — and
`P5-PAX-001` is now `done` with `push_branch: dev`.

The finding is anchor hygiene, not substance: the two trees are byte-identical,
so every line anchor in the packet still resolves. But an archived evidence
packet must point at the delivered artifact.

Fix: re-anchor to `ff6a64ac3041` on `origin/dev` as the primary reference, and
keep `6d9230d20` only as a note that the pre-merge lane tip carried a
byte-identical tree.

## Accuracy Findings

Unlike B1–B3, these are not staleness. The anchored lane tip `6d9230d20` and the
delivered `ff6a64ac3041` have byte-identical trees, so each item below was
already inaccurate against the packet's own stated anchor at authoring time.

### A1 — Delta catalog cites a path that does not exist

Catalog item 16 lists
`apps/passenger-web/app/passenger-rides/components/passenger-ride-page.tsx`.
That path does not exist on the delivered commit. The actual file is
`apps/passenger-web/components/passenger-ride-page.tsx` (+26 / -9).

### A2 — A modified file is described as deleted

Catalog item 12 lists `apps/passenger-web/lib/passenger-fixtures.ts`
"(+144 deleted)". The file still exists on the delivered commit; the change is
+24 / -120. It was reduced, not removed.

### A3 — `maskOpaqueToken` anchored 81 lines off

Acceptance row 1 cites `apps/api/src/common/sensitive-data-policy.ts:50-58` for
`maskOpaqueToken`. That function is defined at **line 131**. Lines 50-58 are
`resolvePassengerSubjectRef`.

Related: acceptance rows 1 and 5 cite `resolvePassengerSubjectRef` as `:30-58`;
it actually starts at line **52**. The cited range mostly covers unrelated
helper code.

### A4 — Per-file line counts inconsistent with the diff

Several catalog entries do not match `git diff --numstat a03e32ea2 ff6a64ac3041`.
Some entries appear to use added+removed as a single `+N`, others use `+N / -M`;
the mixed convention makes the catalog unverifiable line by line.

| Item | Packet | Actual |
|---|---|---|
| 4 `multi-taxi.module.ts` | +17 / -2 | +16 / -1 |
| 6 `multi-taxi.service.ts` | +215 / -10 | +199 / -16 |
| 8 `owned-mobility.service.ts` | +6 / -2 | +4 / -2 |
| 12 `passenger-fixtures.ts` | +144 deleted | +24 / -120 |
| 13 `passenger-live.ts` | +27 / -12 | +26 / -1 |
| 14 `passenger-presentation.ts` | +36 | +5 / -31 (net reduction) |
| 15 `runtime-config.tsx` | +26 | +22 / -4 |
| 22 `playwright.config.ts` | +44 | +33 / -11 (pre-existing file) |

Item 14 is the most misleading: the packet presents it as +36 of added "UI state
mapping", but the change is predominantly deletion.

Fix: regenerate the catalog mechanically from
`git diff --numstat a03e32ea2 ff6a64ac3041` and state one convention.

## Advisory (Non-Blocking)

### N1 — Commit subject prefix will not pass the Commit-trailers gate

Both sidecar commits use `docs(P5-PAX-001-SIDECAR-REVIEW): …`. The repo's
Commit-trailers CI gate accepts only `<TASK-ID>: …` or `wip(<TASK-ID>): …`.

This does not block sidecar closeout, which finalizes with
`INTEGRATION_STATUS=not_applicable` and no PR to `dev`. It only matters if the
parent later absorbs this file through a canonical PR. Worth using the compliant
prefix on the correction commit.

### N2 — Trailer casing

Trailers read `LLM-Agent: gemini` / `Reviewer: claude2`. Lane names elsewhere in
machine truth are capitalised (`Gemini`, `Claude`). Cosmetic.

## Requested Owner Actions

Refresh (mechanical, no re-analysis):

1. B1 — reviewer reference `Claude2` → `Claude` (all occurrences).
2. B2 — parent owner/reviewer → `Claude` / `Gemini`.
3. B3 — re-anchor evidence to delivered `ff6a64ac3041` on `origin/dev`; retain
   `6d9230d20` only as a byte-identical pre-merge note.

Accuracy fixes (the substantive ones):

4. A1 — correct the `passenger-ride-page.tsx` path to
   `apps/passenger-web/components/passenger-ride-page.tsx`.
5. A2 — stop describing `passenger-fixtures.ts` as deleted; it is +24 / -120.
6. A3 — re-anchor `maskOpaqueToken` to `:131` and `resolvePassengerSubjectRef`
   to `:52`.
7. A4 — regenerate per-file counts from
   `git diff --numstat a03e32ea2 ff6a64ac3041` under one stated convention.

Then re-handoff to `Claude`. No re-verification of acceptance substance is
needed — items 1–7 are confirmed on the delivered commit and recorded above, so
this reopen should be a short edit pass.
