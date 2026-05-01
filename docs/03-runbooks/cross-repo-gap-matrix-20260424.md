# Cross-Repo Gap Matrix — 2026-04-25

Status: closeout-sync artifact — updated 2026-04-28 after P1PX productization wave  
Owner: Codex  
Reviewer: Claude  
Updated: 2026-04-28

## Purpose

This matrix records the real gap state across:

- `drts-fleet-platform`
- `tenant-commute-hub`

It separates:

1. work already closed on remote baseline
2. work that remains a true blocker
3. repo-local cleanup that was directly actionable in the current branch
4. external-gated or intentionally deferred scope

Baseline references used for this matrix:

- `drts-fleet-platform` `origin/main` at `1ab33fc87ff9a3bd5e5f83bb3fa80167923d1408` (original audit baseline)
- `tenant-commute-hub` `origin/main` at `2a3acf2736b5e37eea82998c58f5466a0bc7ca78` (original audit baseline)
- `drts-fleet-platform` local branch HEAD at `c11e159` after full P1PX productization wave (2026-04-28); wave commits include `83a3e4c` (P1PX-DRV-001), `4a99bdd` (P1PX-DRV-002), `0519485` (P1PX-BE-003), and `c11e159` (P1PX-DOC-001 docs sync)

---

## Matrix

| Class            | Item                                                 | Repos                 | Current status                            | Notes / next action                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------- | ---------------------------------------------------- | --------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `closed`         | Tenant BFF cutover                                   | both                  | closed on remote baseline                 | Landed through `ajoe734/tenant-commute-hub#1` plus companion backend/client compatibility in `ajoe734/drts-fleet-platform#1`.                                                                                                                                                                                                                                                       |
| `closed`         | Tenant identity hardening                            | both                  | closed on remote baseline                 | Landed through `ajoe734/tenant-commute-hub#3` plus backend auth alignment in `ajoe734/drts-fleet-platform#12`. Tenant remote `main` is now email-only bootstrap with server-issued Bearer session; no local role picker or `localStorage` session restore remains.                                                                                                                  |
| `closed`         | `GAP-P2S3-001` protected control-plane trust cleanup | `drts-fleet-platform` | closed on remote baseline                 | Protected staging verifies `platform-admin-web` / `ops-console-web` through server-issued inner Bearer auth on the control-plane proxy path, and merged staging run `#24891433989` passed build, migration, deploy, and IAP-protected API verification.                                                                                                                             |
| `closed`         | Tenant standalone contract snapshot drift            | both                  | closed with managed fallback path         | `tenant-commute-hub` still prefers the live sibling core checkout for local pair-dev, but standalone builds now consume a managed snapshot synced from `drts-fleet-platform` contracts instead of a hand-maintained drift-prone shim.                                                                                                                                               |
| `closed`         | Staging deploy verifier token path                   | `drts-fleet-platform` | closed on remote baseline                 | GitHub Actions health-check now mints an IAP ID token directly instead of relying on the broken `gcloud auth print-identity-token --audiences` path.                                                                                                                                                                                                                                |
| `closed`         | Tenant bootstrap JWT `authMode` drift                | `drts-fleet-platform` | closed on remote baseline                 | Tenant bootstrap session tokens now carry `authMode: jwt_bearer` consistently in both the response identity and the signed JWT payload.                                                                                                                                                                                                                                             |
| `closed`         | Ops driver earnings drilldown parity (`OC-017`)      | `drts-fleet-platform` | closed on remote baseline                 | `ops-console-web` now supports `Drivers -> select driver -> Earnings`, and revenue rows link into the same read-only drilldown.                                                                                                                                                                                                                                                     |
| `closed`         | Authority / boundary / closeout doc truth sync       | `drts-fleet-platform` | closed on remote baseline                 | Historical split-state docs now distinguish the `2026-04-22` / `2026-04-23` audit snapshot from current merged remote-main truth.                                                                                                                                                                                                                                                   |
| `productization` | Partner-channel bank entry topology                  | both                  | baseline landed; productization remains   | Partner registry, eligibility persistence, partner-authenticated ingress, and partner-only tenant UI shell are now implemented in the P1PX wave (P1PX-BE-001, P1PX-BE-002, P1PX-FE-001). Bank-specific branding assets, host/subdomain strategy, and real bank/issuer credentials remain external-gated. See `docs/03-runbooks/phase1-productization-execution-packet-20260428.md`. |
| `productization` | Partner ingress plus card-eligibility verification   | both                  | baseline landed; external-gated remainder | Partner-authenticated ingress and credit-card airport transfer eligibility verification baseline is now implemented (P1PX-BE-002, P1PX-BE-003). Real bank/issuer API contract, sandbox credentials, and verification rules remain external-gated (`EMC-X1-004`). Demo eligibility in dev bootstrap only.                                                                            |
| `productization` | Driver app production identity and native release    | `drts-fleet-platform` | baseline landed; production-release gaps  | Driver app hardened for production identity and device provisioning (P1PX-DRV-001). EAS internal build baseline documented with external credential blockers explicit (P1PX-DRV-002). Expo account access, Apple team, Android keystore policy, and internal tester groups remain external-gated.                                                                                   |
| `external-gated` | Grab Taiwan real adapter (`EMC-X1-001`)              | `drts-fleet-platform` | still external-gated                      | Requires partner API contract, credentials, sandbox, webhook signature, callback, status sync, lost-race, and no-owned-assignment evidence. Tracked in `support/sidecars/EXT-002/EXT-002-FORWARDER-ADAPTER-GATE.md` blocker records `EXT-002-BLK-001` to `EXT-002-BLK-007`.                                                                                                         |
| `deferred`       | Passenger App / Web                                  | strategy-level        | intentionally deferred                    | Remains outside the current completion bar unless product strategy changes.                                                                                                                                                                                                                                                                                                         |
| `deferred`       | Call Point / Concierge Portal                        | strategy-level        | intentionally deferred                    | Remains outside the current completion bar unless product strategy changes.                                                                                                                                                                                                                                                                                                         |
| `deferred`       | AV / ODD / Tesla / ROC live-board family             | strategy-level        | intentionally deferred                    | Future-gated by roadmap and not part of current closeout.                                                                                                                                                                                                                                                                                                                           |

---

## Interpretation

The cross-repo story is no longer "tenant repo still has not integrated."

The current reality as of 2026-04-28:

- the tenant repo is already integrated and materially hardened on remote `main`
- the protected control-plane trust cleanup is merged and staging-verified on remote `main`
- several repo-local narrative and workflow parity gaps were directly actionable and are now closed on the remote baseline
- the P1PX productization wave (P1PX-BE-001 through P1PX-DRV-002) has landed partner channel and driver baselines
- the remaining visible delta is now concentrated in external-gated integrations (real bank/issuer credentials, Grab adapter, mobile distribution) and intentionally deferred scope (passenger app/web, passenger receipt UI, call point, AV/ODD)

---

## Canonical Companions

- `docs/02-architecture/authority/rgp-002-authority-map.md`
- `docs/02-architecture/tenant-commute-hub-boundary.md`
- `docs/02-architecture/authority/rgx-010-tenant-commute-hub-authority-annex-audit-20260422.md`
- `docs/03-runbooks/master-system-closeout-checklist.md`
- `docs/03-runbooks/gap-p2s3-001-cloud-iap-checklist.md`
- `docs/02-architecture/phase1-partner-channel-bank-entry-addendum-20260425.md`
