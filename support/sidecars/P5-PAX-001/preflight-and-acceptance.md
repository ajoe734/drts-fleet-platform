# P5-PAX-001 — Fleet E live passenger authority

Task-ID: P5-PAX-001
Depends-On: P5-RATE-001
Baseline-SHA: `a03e32ea2` (`origin/dev` tip at dispatch)
Design-Source: existing approved P5 passenger canvas — no UI redesign; the only
visual change is that fixture preview data now loads asynchronously.

## 1. Preflight

Fleet E is a single board record (`P5-PAX-002/003`, `P5-PAX-WEB-001`,
`P5-PAX-GATE-001`, `P5-PUSH-001`, `P5-CALL-001` do not exist as tasks), so this
task carries the whole Fleet E acceptance boundary.

Already present at baseline from #1122 — reused, not rewritten:

- opaque 32-byte `base64url` token; only a peppered SHA-256 digest is persisted
  (`ops.passenger_ride_access_tokens.token_digest`, no raw column);
- token-scope guards on read / cancel / rating / contact / receipt;
- wrong or expired token → `404 PASSENGER_RIDE_TOKEN_INVALID`;
- `@OpenRoute()` short-circuits `BootstrapAuthGuard`, so the token in the URL
  path is not written to an audit/deny record;
- `PassengerDispatchDisclosureSnapshot` carries no driver phone field;
- passenger-web live adapter (authority fetch + `EventSource`) behind an
  allowlisting `/control-plane-proxy` route;
- `next.config.ts` refuses a production build configured for fixture data.

Gaps found and closed by this task:

| # | Gap at baseline | Resolution |
|---|---|---|
| 1 | `eventVersion` was `assignment.assignmentVersion ?? 1` — resets to 1 when unassigned and stays flat across status changes, so it could not order a stream; the web client ignored it entirely | server allocates a strictly increasing per-order sequence; `assignmentVersion` moved to its own envelope field; client drops any envelope that does not advance the applied version |
| 2 | Production fixture prohibition was runtime-only, `window.__DRTS_PASSENGER_WEB_CONFIG__.dataMode` could force `fixture` in production, and the 564-line fixture payload module was statically imported into the client bundle | view-model types split into `passenger-view-model.ts`; payloads reachable only via a production-gated dynamic `import()`; `getPassengerRideFixture` fails closed; injected global ignored in production |
| 3 | no masked-call provider port — contact only read `MULTI_TAXI_SUPPORT_TEL_URI` | `MaskedCallPort` + `UnavailableMaskedCallPort`; `unavailableReason` added to `PassengerRideContactOption` |
| 4 | no passenger push provider port; `ops.consumer_notification_outbox` rows were never dispatched | `PassengerPushPort` + `UnavailablePassengerPushPort`; `deliverPassengerNotification` records an explicit per-attempt outcome |
| 5 | `owned-mobility` wrote the **raw passenger phone** into `consumer_notification_outbox.passenger_subject_ref` while the token path hashed it — PII at rest plus two identities for one phone-only ride | shared `resolvePassengerSubjectRef` in `common/sensitive-data-policy.ts`, used by both paths |
| 6 | found while writing tests: the full `PassengerRideAccessGrant` (**including the raw token**) was passed to `repository.persistRideAccessToken`, whose declared parameter type does not contain it. Nothing wrote it today, but it sat one logged error or one added column away from persisting the secret | raw token destructured off before the persistence boundary |

## 2. Acceptance evidence

| Acceptance | Evidence |
|---|---|
| raw token never persisted or logged | `multi-taxi-passenger-authority.test.ts` → "persists only a peppered digest and never the raw token" asserts the persisted object has no `accessToken` key and the raw value appears nowhere in it; error envelopes asserted free of the raw token |
| wrong/expired token denied | same file → expired and unknown tokens produce byte-identical envelopes apart from `traceId` |
| stale event ignored | API: `eventVersion` strictly increasing (unit); web: `passenger-live-stream.test.ts` 7 cases; E2E: an out-of-order SSE frame does not rewind the rendered ride state |
| production bundle cannot resolve fixture data | **A/B production build** — see §3. Plus static-graph guard, fail-closed accessor, and injected-global test |
| raw driver phone never reaches passenger | port is identifier-only (`driverId`, no phone), so the service never holds the number; a provider error message containing a phone is reduced to its error class before auditing; E2E scans the whole rendered document for dialable numbers and `tel:` hrefs |
| provider absence explicit, not simulated | `unavailable` + `masked_call_provider_not_configured`; push returns `failed` + `provider_not_configured` and leaves `delivered_at` NULL |
| unit+integration+e2e green | see §4 |

## 3. Production-bundle A/B (fixture prohibition)

`NODE_ENV=production next build --webpack`, then grep the emitted bundle for
strings that exist **only** in the fixture payloads:

| sentinel | baseline `a03e32ea2` | this branch |
|---|---|---|
| `snap-p5-demo-001` | 3 files | **0** |
| `吳明翰` (fixture driver) | 3 files | **0** |
| `BKR-2208` (fixture plate) | 3 files | **0** |
| `珍珠白` (fixture colour) | 3 files | **0** |
| `P5_RATING_STATE_UNINITIALIZED` | 3 files | **0** |

Not vacuous — the same build still contains the live path: `passenger-rides`
in 27 files, `Live SSE` in 13, `PASSENGER_AUTHORITY_UNAVAILABLE` in 3.

The static-graph guard was replayed against the pre-split sources: it flags
`passenger-presentation.ts`, `passenger-ride-page.tsx` and `passenger-live.ts`
at `a03e32ea2` and passes on the current ones, so it can actually fail.

## 4. Commands and results

```text
pnpm --filter @drts/api typecheck                     PASS
pnpm --filter @drts/api lint                          PASS
pnpm --filter @drts/passenger-web typecheck           PASS
pnpm --filter @drts/passenger-web lint                PASS
apps/api      vitest run          140 files / 986 tests PASS  (baseline 971 + 15 new)
passenger-web vitest run            5 files /  37 tests PASS  (baseline 21 + 16 new)
playwright test --project=passenger-web        5 tests  PASS
```

E2E non-vacuousness: with the client version guard removed, "ignores a stale SSE
event instead of rewinding the ride state" fails (`行程進行中` never appears);
restored, all 5 pass.

## 5. Migration replay

None. No schema change — `ops.consumer_notification_outbox` (V0056) already has
`status`, `attempt_count`, `next_attempt_at`, `delivered_at`.

## 6. Residual external blockers

`P5-CALL-001` and `P5-PUSH-001` remain **`blocked_ext`**. Both ports ship bound
only to their `Unavailable*` implementation. Unblocking each needs provider
credentials plus contract tests; no adapter may be written that fabricates a
proxy number or a delivery receipt.

## 7. Rollback / disable

- SSE: `eventVersion` is additive and monotonic; a client that ignores it
  behaves as before. Reverting the two service hunks restores prior behaviour.
- Fixture split: revert `passenger-fixture-loader.ts` + the component effect to
  restore the synchronous fixture render (and the bundle leak).
- Ports: no behaviour change while unbound beyond the added
  `unavailableReason` field and the outbox status write.

## 8. Repo-hygiene note (not part of the diff)

The canonical root's `node_modules` had ~140 dangling symlinks pointing into a
pruned worktree (`claude2-s3-verify-001`), including `typescript` and
`@types/node`, which made every workspace `typecheck`/`build` fail. Repaired
against the intact local `.pnpm` store, and `@drts/*` in this worktree pointed at
this branch's own packages so the gates test this branch's contracts.
