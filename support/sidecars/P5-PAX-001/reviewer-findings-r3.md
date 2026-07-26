# P5-PAX-001-SIDECAR-REVIEW — Reviewer Findings (R3, final)

- Sidecar Task: `P5-PAX-001-SIDECAR-REVIEW`
- Reviewer: `Claude`
- Owner: `Gemini`
- Packet under review: `support/sidecars/P5-PAX-001/P5-PAX-001-SIDECAR-REVIEW.md` @ `origin/gemini/p5-pax-001-sidecar-review` (`d97f4d9d7`)
- Review baseline: `origin/dev` (`9648aed6d`)
- Prior round: [`reviewer-findings-r2.md`](./reviewer-findings-r2.md) (REOPEN — B1–B3 refresh, A1–A4 accuracy)
- Verdict: **APPROVE**
- Date: 2026-07-26

Live task status, owner/reviewer assignment, and `last_update` are deferred to
`ai-status.json`; this file records only durable review findings.

## Verdict

All seven R2 items are fixed and independently re-verified against the delivered
parent commit. No new findings. The packet is accurate as an archived evidence
artifact for `P5-PAX-001`.

## R2 Disposition

| R2 item | Requested | Verified in `d97f4d9d7` |
|---|---|---|
| B1 reviewer identity | `Claude2` → `Claude` | FIXED — header, Purpose, `Cross-Cuts For Sidecar Reviewer (Claude)` heading + sub-items, checklist, and commit trailer `Reviewer: Claude`. No `Claude2` reviewer reference remains |
| B2 parent owner/reviewer | → `Claude` / `Gemini` | FIXED — matches machine truth for `P5-PAX-001` (owner `Claude`, reviewer `Gemini`) |
| B3 evidence anchor | re-anchor to delivered commit | FIXED — primary anchor is `ff6a64ac30418f3281f3f0d1a4b33e1751110980` on `origin/dev`, matching `P5-PAX-001.commit_hash` exactly; `6d9230d20` retained only as a byte-identical pre-merge note |
| A1 `passenger-ride-page.tsx` path | correct the path | FIXED — catalog item 10 reads `apps/passenger-web/components/passenger-ride-page.tsx` (+26 / -9); the non-existent `app/passenger-rides/components/…` path is gone |
| A2 `passenger-fixtures.ts` | stop describing as deleted | FIXED — item 12 reads `+24 / -120` and is explicitly described as a net reduction, not a removal |
| A3 line anchors | `maskOpaqueToken` → `:131`, `resolvePassengerSubjectRef` → `:52` | FIXED — `maskOpaqueToken` cited `:131-149` (defined at line 131), `resolvePassengerSubjectRef` cited `:52-67` (defined at line 52) |
| A4 per-file counts | regenerate from `--numstat`, one convention | FIXED — all 24 entries reproduce `git diff --numstat a03e32ea2 ff6a64ac3041` exactly under a uniform `+added / -deleted` convention (table below) |

## Independent Re-Verification

| Check | Result |
|---|---|
| Support-only scope | PASS — branch diff vs merge-base is exactly 1 file, `support/sidecars/P5-PAX-001/P5-PAX-001-SIDECAR-REVIEW.md` (+123 / -0) |
| No canonical-truth mutation | PASS — no `phase1_*` specs, contracts, migration plan, or parent implementation files touched |
| Parent delta totals | PASS — `git diff --shortstat a03e32ea2 ff6a64ac3041` = 24 files, +1999 / -204, as claimed |
| Delta catalog, all 24 rows | PASS — every path and every `+added / -deleted` pair matches `--numstat`; zero discrepancies |
| Primary anchor is the delivered commit | PASS — `ff6a64ac3041` is on `origin/dev` and equals `P5-PAX-001.commit_hash` (`push_branch: dev`, status `done`) |
| Declared dependency | PASS — `P5-RATE-001` is `done` in machine truth |
| Acceptance criteria 1–7 | PASS — carried forward from R2, all seven re-verified on `ff6a64ac3041` |
| Acceptance-table code anchors | PASS — all resolve to the cited construct (details below) |
| Cited preflight line refs | PASS — `:43-58`, `:68-80`, `:94-96` still resolve to the bundle A/B table, the commands/results block, and the `blocked_ext` note |
| Owner branch pushed | PASS — `origin/gemini/p5-pax-001-sidecar-review` at `d97f4d9d7` |

### Delta catalog, re-derived

All 24 rows below were regenerated from `git diff --numstat a03e32ea2 ff6a64ac3041`
and compared against the packet. Every row matches.

```text
 29    0  apps/api/src/common/sensitive-data-policy.ts
 52    0  apps/api/src/modules/multi-taxi/masked-call.port.ts
  1    1  apps/api/src/modules/multi-taxi/multi-taxi.controller.ts
 16    1  apps/api/src/modules/multi-taxi/multi-taxi.module.ts
 33    0  apps/api/src/modules/multi-taxi/multi-taxi.repository.ts
199   16  apps/api/src/modules/multi-taxi/multi-taxi.service.ts
 55    0  apps/api/src/modules/multi-taxi/passenger-push.port.ts
  4    2  apps/api/src/modules/owned-mobility/owned-mobility.service.ts
529    0  apps/api/tests/unit/multi-taxi-passenger-authority.test.ts
 26    9  apps/passenger-web/components/passenger-ride-page.tsx
 29    0  apps/passenger-web/lib/passenger-fixture-loader.ts
 24  120  apps/passenger-web/lib/passenger-fixtures.ts
 26    1  apps/passenger-web/lib/passenger-live.ts
  5   31  apps/passenger-web/lib/passenger-presentation.ts
138    0  apps/passenger-web/lib/passenger-view-model.ts
 22    4  apps/passenger-web/lib/runtime-config.tsx
  2    4  apps/passenger-web/tests/unit/passenger-fixtures.test.ts
192    0  apps/passenger-web/tests/unit/passenger-live-stream.test.ts
  2    4  apps/passenger-web/tests/unit/passenger-live.test.ts
132    0  apps/passenger-web/tests/unit/passenger-production-fixture-gate.test.ts
 52    0  packages/contracts/src/phase1-p5-s3-multi-taxi.ts
 33   11  playwright.config.ts
114    0  support/sidecars/P5-PAX-001/preflight-and-acceptance.md
284    0  tests/e2e/p5-passenger-live-authority.spec.ts
```

The four entries R2 flagged as most misleading are now correct: item 12
`passenger-fixtures.ts` is `+24 / -120` (not "+144 deleted"), item 14
`passenger-presentation.ts` is `+5 / -31` and labelled a net reduction (not
"+36" of added mapping code), item 16 `runtime-config.tsx` is `+22 / -4`, and
item 22 `playwright.config.ts` is `+33 / -11` on a pre-existing file.

### Acceptance-table anchors resolved on `ff6a64ac3041`

- Row 1 — `multi-taxi.service.ts:1157-1166` contains the
  `const { accessToken, ...tokenRecord } = passengerAccess;` destructure at
  `:1159` feeding `persistRideAccessToken(tokenRecord, digest)`; `:1192` is the
  digest-keyed cache write; `:1272-1277` is SHA-256 over
  `` `${pepper}\0${accessToken}` ``; `sensitive-data-policy.ts:131` is
  `maskOpaqueToken`.
- Row 2 — `requireAccessToken` is defined at `:1229`; the
  missing/revoked/expired guard throws `invalidPassengerToken()`
  (`PASSENGER_RIDE_TOKEN_INVALID`, 404, defined `:1264-1270`) and the scope
  miss throws `PASSENGER_RIDE_SCOPE_FORBIDDEN` (403) — both inside the cited
  `:1229-1270` region.
- Row 3 — `passenger-live.ts:121` gates on `isFreshPassengerEvent` (defined
  `:142`) against `appliedEventVersion` (`:115`, advanced `:124`); the server
  allocates `eventVersion` at `multi-taxi.service.ts:1023` via
  `nextPassengerEventVersion` (`:1043`) — inside the cited `:1013-1047`.
- Row 5 — `getPassengerContact` is defined at `:797` and returns
  `mode: "unavailable"` / masked-proxy / support-fallback shapes through `:850`;
  `masked-call.port.ts` is 52 lines total, matching the cited `:1-52`.
- Row 6 — `UnavailableMaskedCallPort` (`masked-call.port.ts:40`,
  `isAvailable()` `:41`) and `UnavailablePassengerPushPort`
  (`passenger-push.port.ts:39`, `isAvailable()` `:40`) both fall inside their
  cited ranges; `multi-taxi.module.ts:34-35` binds both as DI defaults, inside
  the cited `:32-36`.

Residual imprecision: a few sub-anchors in rows 2, 5, and 6 are loose by a
handful of lines at one bound (e.g. the scope-forbidden throw begins at `:1249`
rather than the cited `:1254`, and the port ranges start inside the preceding
doc comment). Every one resolves unambiguously to the cited construct, so these
are not defects of the R2/A3 class, where the anchor pointed at a different
function entirely. Recorded for accuracy, not actioned.

## Advisory Carried Forward (Non-Blocking)

### N1 — Legacy commit subject prefixes on this branch

The correction commit `d97f4d9d7` correctly uses the compliant
`wip(P5-PAX-001-SIDECAR-REVIEW): …` prefix, which resolves the R2 advisory going
forward. The two earlier commits on the branch (`9e1d6e80a`, `9d014119b`) still
carry `docs(P5-PAX-001-SIDECAR-REVIEW): …`, which the repo's Commit-trailers CI
gate does not accept.

This does not block sidecar closeout — the task finalizes with
`INTEGRATION_STATUS=not_applicable` and no PR to `dev`. It only matters if the
parent later absorbs this file through a canonical PR, in which case the range
must be collapsed to a single compliant commit rather than merged as-is.

### N2 — Trailer casing

`9e1d6e80a` and `9d014119b` carry `Reviewer: Claude2` / `Reviewer: claude2`
while `d97f4d9d7` reads `Reviewer: Claude`. Historical, cosmetic, not actioned.

## Owner Closeout Guidance

Sidecar-only closeout — the whole branch diff is under `support/sidecars/`:

- finalize with `INTEGRATION_STATUS=not_applicable` (`branch_pushed` is
  gate-rejected for support-only slices);
- `COMMIT_HASH=d97f4d9d7…`, `PUSH_REMOTE=origin`,
  `PUSH_BRANCH=gemini/p5-pax-001-sidecar-review`;
- no PR to `dev` is required or expected for this task.
