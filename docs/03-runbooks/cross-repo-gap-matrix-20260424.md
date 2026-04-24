# Cross-Repo Gap Matrix — 2026-04-24

Status: closeout-sync artifact  
Owner: Codex  
Reviewer: Claude  
Updated: 2026-04-24

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

- `drts-fleet-platform` `origin/main` at `42bd15d9848ad38874c1a36e67408620a668f922`
- `tenant-commute-hub` `origin/main` at `2a3acf2736b5e37eea82998c58f5466a0bc7ca78`

---

## Matrix

| Class            | Item                                                 | Repos                 | Current status                               | Notes / next action                                                                                                                                                                                                                                                |
| ---------------- | ---------------------------------------------------- | --------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `closed`         | Tenant BFF cutover                                   | both                  | closed on remote baseline                    | Landed through `ajoe734/tenant-commute-hub#1` plus companion backend/client compatibility in `ajoe734/drts-fleet-platform#1`.                                                                                                                                      |
| `closed`         | Tenant identity hardening                            | both                  | closed on remote baseline                    | Landed through `ajoe734/tenant-commute-hub#3` plus backend auth alignment in `ajoe734/drts-fleet-platform#12`. Tenant remote `main` is now email-only bootstrap with server-issued Bearer session; no local role picker or `localStorage` session restore remains. |
| `closed`         | `GAP-P2S3-001` protected control-plane trust cleanup | `drts-fleet-platform` | closed on remote baseline                    | Protected staging verifies `platform-admin-web` / `ops-console-web` through server-issued inner Bearer auth on the control-plane proxy path, and merged staging run `#24891433989` passed build, migration, deploy, and IAP-protected API verification.           |
| `closed`         | Staging deploy verifier token path                   | `drts-fleet-platform` | closed on remote baseline                    | GitHub Actions health-check now mints an IAP ID token directly instead of relying on the broken `gcloud auth print-identity-token --audiences` path.                                                                                                               |
| `closed`         | Tenant bootstrap JWT `authMode` drift                | `drts-fleet-platform` | closed on remote baseline                    | Tenant bootstrap session tokens now carry `authMode: jwt_bearer` consistently in both the response identity and the signed JWT payload.                                                                                                                            |
| `closed`         | Ops driver earnings drilldown parity (`OC-017`)      | `drts-fleet-platform` | closed on remote baseline                    | `ops-console-web` now supports `Drivers -> select driver -> Earnings`, and revenue rows link into the same read-only drilldown.                                                                                                                                    |
| `closed`         | Authority / boundary / closeout doc truth sync       | `drts-fleet-platform` | closed on remote baseline                    | Historical split-state docs now distinguish the `2026-04-22` / `2026-04-23` audit snapshot from current merged remote-main truth.                                                                                                                                  |
| `external-gated` | Grab Taiwan real adapter (`EMC-X1-001`)              | `drts-fleet-platform` | still external-gated                         | Requires partner API contract, credentials, sandbox, and evidence.                                                                                                                                                                                                 |
| `deferred`       | Passenger App / Web                                  | strategy-level        | intentionally deferred                       | Remains outside the current completion bar unless product strategy changes.                                                                                                                                                                                        |
| `deferred`       | Call Point / Concierge Portal                        | strategy-level        | intentionally deferred                       | Remains outside the current completion bar unless product strategy changes.                                                                                                                                                                                        |
| `deferred`       | AV / ODD / Tesla / ROC live-board family             | strategy-level        | intentionally deferred                       | Future-gated by roadmap and not part of current closeout.                                                                                                                                                                                                          |

---

## Interpretation

The cross-repo story is no longer "tenant repo still has not integrated."

The current reality is:

- the tenant repo is already integrated and materially hardened on remote `main`
- the protected control-plane trust cleanup is merged and staging-verified on remote `main`
- several repo-local narrative and workflow parity gaps were directly actionable and are now closed on the remote baseline
- the rest of the visible delta is either external-gated or intentionally deferred

---

## Canonical Companions

- `docs/02-architecture/authority/rgp-002-authority-map.md`
- `docs/02-architecture/tenant-commute-hub-boundary.md`
- `docs/02-architecture/authority/rgx-010-tenant-commute-hub-authority-annex-audit-20260422.md`
- `docs/03-runbooks/master-system-closeout-checklist.md`
- `docs/03-runbooks/gap-p2s3-001-cloud-iap-checklist.md`
