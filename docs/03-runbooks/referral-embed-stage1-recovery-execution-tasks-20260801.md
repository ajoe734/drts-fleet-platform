# Referral Embed Stage 1 Recovery — Execution Tasks (2026-08-01)

## 1. Objective

Restore the formal Yuhe Referral Embed as a real Stage 1 passenger surface,
using the uploaded HTML design bundle and the paired functional specification as
the source of truth. Work is dispatched by the repository supervisor and its
auto workers. Chat-created ad-hoc subagents are not part of this execution wave.

The delivery target is not a route-only smoke test. Completion requires:

- the 15 Phase 1 artboards to match the uploaded HTML canvas;
- the later four Phase 2 passenger fallback artboards to remain supported;
- browser-safe server-to-server handoff and persistent passenger identity;
- real booking, active-trip recovery, history, cancellation, receipt, and
  rating authority;
- fail-closed entry-host security with no credentials or PII in URLs;
- independent Playwright visual/behavior/security acceptance;
- reviewed PR, merge to `dev`, successful dev deployment, and live URL proof.

Real property-app deployment and other external partner systems remain external
integration gates. This wave must complete the DRTS-owned contracts, runtime,
fixtures, and acceptance rails without pretending that an external host has
already integrated them.

## 2. Mandatory source chain

Workers must read these files before editing. The HTML and JSX files are the
visual authority; the specification files are the functional authority.

1. `docs/05-ui/drts-design-canvas/Passenger Embed.html`
2. `docs/05-ui/drts-design-canvas/passenger-embed-screens.jsx`
3. `docs/05-ui/drts-design-canvas/pe-data.jsx`
4. `docs/05-ui/drts-design-canvas/ent-kit.jsx`
5. `docs/05-ui/drts-design-canvas/ent-shell.jsx`
6. `docs/05-ui/drts-design-canvas/pe-fallback.jsx`
7. `docs/05-ui/community-app-referral-channel-spec-20260613.md`
8. `docs/05-ui/community-app-referral-channel-screen-requirements-20260613.md`
9. `docs/02-architecture/app-entry-url-index-20260616.md`
10. `apps/referral-embed-web/README.md`
11. `support/sidecars/P2-V9-UI-VERIFY-001/P2-V9-UI-VERIFY-001-EVIDENCE.md`
12. `support/sidecars/P2-V9-UI-VERIFY-001/P2-V9-UI-VERIFY-001-BACKEND-GAPS.md`

Historical provenance:

- initial functional spec: commit `138e3997`;
- initial screen requirements: commit `26904c0d`;
- uploaded Passenger Embed canvas: commit `e1bce87d`, PR #688;
- Phase 2 four-artboard extension: commit `7a99c347`;
- the two functional specification files were later removed by commit
  `a9e57a8b` and must be restored byte-exact before implementation claims use
  them.

## 3. Locked visual matrix

The uploaded HTML defines a 392×812 phone canvas. The original Phase 1 delivery
contains exactly 15 artboards in this order:

|   # | Artboard         | Runtime presentation                                  |
| --: | ---------------- | ----------------------------------------------------- |
|   1 | `handoff`        | Handoff · 已交接帶入                                  |
|   2 | `reauth`         | Reauth · 重新認證                                     |
|   3 | `unsupported`    | Unsupported · 非授權宿主                              |
|   4 | `consent`        | Consent · 同意範圍                                    |
|   5 | `fallback`       | Fallback · 回獨立站／current truthful recovery action |
|   6 | `book`           | 叫車表單                                              |
|   7 | `neg-nosupply`   | no-supply                                             |
|   8 | `neg-ineligible` | ineligible                                            |
|   9 | `neg-denied`     | denied                                                |
|  10 | `neg-degraded`   | degraded                                              |
|  11 | `active`         | 進行中行程（持久）                                    |
|  12 | `trips`          | 行程歷史                                              |
|  13 | `receipt`        | 收據（PII 遮罩）                                      |
|  14 | `completed`      | 完成 + 評分                                           |
|  15 | `cancelled`      | 取消                                                  |

The current HTML also contains four later Phase 2 artboards:

- `fb-vehicle-change`
- `fb-human-assigned`
- `fb-service-continuing`
- `fb-eta-updated`

Pixel-critical rules from the source:

- phone frame: black `#05070C` bezel, 46px outer radius, 11px padding,
  116×26 island, 36px inner radius;
- light surface: `#F4F6FA`, white cards, Inter/Noto Sans TC and JetBrains Mono;
- host status/header chrome uses `primaryHi=#1A45AD` in the uploaded light
  theme; Yuhe brand mark and primary CTA use authority accent `#0F766E`;
- therefore Yuhe is intentionally blue host chrome plus teal brand/CTA, not an
  all-teal redesign;
- compact webview only: no standalone navigation, debug route chips, test-state
  controls, or fallback-review menus in the passenger UI;
- branding comes from partner authority metadata, never from slug-specific UI
  hardcoding;
- `御和?峰` in the prototype fixture is an encoding typo; runtime uses
  `御和雲峰`.

## 4. Functional and security invariants

1. The property-app backend owns the long-lived ingress credential. It must
   never appear in an iframe URL, browser history, logs, referrers, HTML, React
   props, or client navigation.
2. Browser handoff uses a short-lived, single-use artifact bound to the exact
   `entrySlug`, authority `entryHost`, partner user reference, expiry, and
   consent bundle.
3. Consumption is atomic and durable across Cloud Run instances. In-memory-only
   replay protection is not production acceptance.
4. First-use consent records the versioned bundle for `trip.manage`, `pii.trip`,
   and `identity.bind` before persistent identity linking is activated.
5. The resulting bearer is held in a Secure, HttpOnly, appropriately partitioned
   cookie. Production state comes from verified session/backend state, never a
   query-string preview.
6. `state`/`screen` query previews are allowed only when an explicit demo/test
   rail is enabled and are restricted to the typed 15+4 matrix.
7. `entrySlug` must be bound to its own authority `entryHost`; a host allowed for
   one partner cannot open another partner's entry.
8. Unauthorized host requests fail closed, reveal no PII, and retain CSP
   `frame-ancestors 'none'` plus `X-Frame-Options: DENY`.
9. Booking and mutation outcomes come from APIs. Static fixtures may support
   canvas preview/tests only and cannot back production success states.
10. Reloading through a fresh short-term session for the same partner user must
    resolve the same DRTS passenger and recover active/history/receipt data.
11. The generic standalone passenger site was retired by the later app topology.
    Do not ship a fake `ride.drts.com.tw` CTA. Preserve the fallback artboard's
    visual composition but bind actions to current truthful host return, retry,
    or support behavior unless a newer canonical decision restores a real site.

## 5. Existing checkpoints (review before reuse)

These are evidence and starting material, not automatically accepted output:

- green security checkpoint commit:
  `949e40ffb89873c1295c7d173b87bd5a3907f5df` on
  `codex/referral-embed-p0-security-20260801`;
- interrupted UI worktree:
  `/home/lupin/drts-fleet-platform/workspace/referral-passenger-parity-20260801`;
- interrupted handoff/action worktree:
  `/tmp/drts-referral-stage1-actions.20260801`.

The supervisor-assigned owner must inspect and selectively reuse these changes.
Dirty worktree content must not be treated as reviewed, committed, or complete.

## 6. Execution tasks

### `REF-DOC-001` — Restore and lock the source chain

Scope:

- restore the two deleted 2026-06-13 functional documents byte-exact;
- add this execution packet and a short source-authority note to the Referral
  Embed README;
- verify the HTML registry is 15 Phase 1 + 4 Phase 2, not “15 total”;
- record the later topology decision that supersedes only the obsolete
  standalone passenger-site action, not the canvas layout.

Acceptance:

- both restored files compare byte-for-byte with their original commits;
- all 12 mandatory source-chain paths resolve;
- documentation distinguishes visual authority, functional authority, and
  later topology overrides;
- docs lint / `git diff --check` pass.

### `UI-CANVAS-REF-001` — Implement exact Passenger Embed canvas parity

Depends on: `REF-DOC-001`.

Scope:

- rebuild `apps/referral-embed-web` from the uploaded HTML/JSX, not from chat
  screenshots;
- implement all 15 Phase 1 compositions and retain the four Phase 2 states;
- consume generic authority branding (`appName`, `mark`, `community`,
  `operator`, accent, support) with safe generic fallbacks;
- remove production debug/test navigation and all passenger-visible review
  controls;
- centralize zh-TW copy; no inline hardcoded production copy where the app's
  translation contract applies;
- expose typed deterministic previews only on the explicit demo/test rail.

Acceptance:

- reproducible Playwright renders the authoritative HTML and runtime at 392×812;
- 15 Phase 1 runtime screenshots are reviewed against their matching HTML
  artboards, with no route-only substitute;
- blue host chrome / teal Yuhe brand split, phone frame, fixed footer, internal
  scroll, cards, exact fields, status rows, CTAs, four history rows, receipt
  breakdown, five-star result, and cancellation detail are present;
- `state=handoff` renders artboard 1; `screen=book` renders artboard 6;
- no slug-specific Yuhe conditional in the UI;
- no debug/test controls in production build;
- referral app lint, typecheck, build, accessibility smoke, and visual tests pass.

### `BE-REF-HANDOFF-001` — Durable S2S handoff, consent, and session

Depends on: `REF-DOC-001`.

Scope:

- add a server-to-server endpoint that authenticates the partner credential and
  issues a two-minute single-use browser handoff artifact;
- bind it to exact entry slug, authority host, partner user reference, expiry,
  and versioned consent bundle;
- consume atomically in durable storage and reject replay, expiry, wrong host,
  wrong slug, missing/extra consent scope, revoked entry, and revoked identity;
- activate the persistent identity link only after accepted consent;
- establish a Secure/HttpOnly referral session and remove legacy credential
  query propagation;
- preserve the entry-scoped CSP/origin fail-closed security checkpoint;
- extend authority branding metadata with the canvas-required generic fields.

Acceptance:

- no API key/access token/partner user reference appears in URLs or navigation;
- replay and cross-instance consume tests pass against Postgres-backed storage;
- consent ledger records exact `trip.manage`, `pii.trip`, `identity.bind` bundle,
  version, timestamp, partner entry, and passenger link;
- cross-entry host attempt returns 403 before PII rendering;
- production ignores query-forced state/screen; demo/test typed previews remain;
- contracts, API tests, migration tests, referral app tests, lint, typecheck, and
  production builds pass.

### `BE-REF-PASSENGER-001` — Real passenger booking lifecycle authority

Depends on: `BE-REF-HANDOFF-001`.

Scope:

- complete partner-passenger APIs for create booking, active-trip recovery,
  passenger-scoped history, booking/order detail, cancellation, completed
  receipt/download, and rating;
- authorize every read/mutation by bearer `drtsPassengerId`, partner entry, and
  tenant; never trust browser-supplied tenant/passenger IDs;
- use idempotency for booking/cancel/rating mutations and map authoritative
  errors to denied/ineligible/no-supply/degraded without duplicate booking;
- expose only PII-masked receipt/history fields required by the canvas;
- wire Referral Embed server routes to those APIs; remove all production 501
  placeholders and fixture-backed success screens.

Acceptance:

- one end-to-end API test proves handoff → consent → create → active read →
  reload/re-handoff same passenger → cancel or complete → history → receipt;
- separate completion flow records rating exactly once;
- passenger A cannot read/mutate passenger B, even within the same tenant or
  partner;
- cross-partner and forged tenant headers fail closed;
- degraded retries are idempotent and do not duplicate orders;
- receipt PII masking and download ownership tests pass;
- contract, service, controller, migration, lint, typecheck, and build gates pass.

### `E2E-REF-EMBED-001` — Independent 15+4 visual, behavior, and security acceptance

Depends on: `UI-CANVAS-REF-001`, `BE-REF-PASSENGER-001`.

Scope:

- independently review against the HTML and functional packet;
- run 15 Phase 1 and four Phase 2 screenshot routes in demo/test mode;
- run the real session-driven lifecycle without state/screen query forcing;
- test authorized iframe, unauthorized iframe, cross-entry host, expired code,
  replay, reauth, consent, idempotent degraded retry, reload persistence,
  cancellation, history, receipt, rating, and error boundary;
- scan URLs, HTML, logs, and referrers for credentials and unmasked PII.

Acceptance:

- 19-page screenshot inventory and comparison report are committed;
- exact core-15 content assertions and visual thresholds pass;
- real lifecycle tests pass with no static fixture success path;
- security and secret/PII scans pass;
- app lint/typecheck/build and focused API/unit suites pass;
- reviewer records cited findings and either approves or reopens the owning task.

### `REL-REF-EMBED-001` — Integration, PR, dev deploy, and live proof

Depends on: `E2E-REF-EMBED-001`.

Scope:

- integrate only review-approved commits on a clean branch from current
  `origin/dev`;
- resolve conflicts without dropping source docs, security guards, visual
  parity, or real API wiring;
- open PR, wait for required CI, obtain reviewer approval, merge to `dev`;
- publish the verified snapshot and run one dev deployment after the integrated
  wave is green;
- validate `https://refer.smarttransport.tw/embed/yuhe-residence` and the
  authorized iframe contract against the deployed SHA.

Acceptance:

- PR URL, reviewed commits, merge SHA, publish tag, deploy run URL, and deployed
  image/SHA are recorded;
- deploy is green and includes the exact reviewed tree;
- live formal URL renders the authority/session-driven state, not the old debug
  booking page;
- authorized iframe/CSP passes; unauthorized and cross-entry hosts fail closed;
- no Partner Booking or Concierge service is restarted;
- machine truth records `INTEGRATION_STATUS=dev_deployed` before any completion
  claim.

## 7. Dependency graph

```text
REF-DOC-001
├── UI-CANVAS-REF-001
└── BE-REF-HANDOFF-001
    └── BE-REF-PASSENGER-001

UI-CANVAS-REF-001 + BE-REF-PASSENGER-001
└── E2E-REF-EMBED-001
    └── REL-REF-EMBED-001
```

The supervisor may parallelize UI and handoff work after `REF-DOC-001`. It must
not parallelize release integration ahead of independent acceptance.

## 8. Completion language

No worker, reviewer, or supervisor may say “Stage 1 complete”, “ready on dev”,
or “all services normal” for this slice until `REL-REF-EMBED-001` records a
successful dev deployment and live evidence. Branch commits, HTTP 200, or
route-only smoke are not equivalent to completion.
