# FWD-LIVE-001 — Forwarder External Platform Live Evidence Pack

**Task:** `FWD-LIVE-001`<br>
**Owner:** `Codex2`<br>
**Reviewer:** `Codex`<br>
**Collected:** `2026-05-19 and 2026-05-22 (UTC)`<br>
**Status:** `partial evidence only — WF-FWD-001 remains EXTERNAL-GATED`

---

## 1. Executive Summary

This packet records the current live-evidence posture for the forwarder external
platform gate tracked by `EXT-002-BLK-001` through `EXT-002-BLK-007`.

Current result through `2026-05-22`:

- `WF-FWD-001` still reads `EXTERNAL-GATED` in the workflow release matrix.
- The cross-repo gap matrix still classifies the Grab Taiwan real adapter as
  external-gated.
- The shipped Grab Taiwan adapter is still explicitly stub-only.
- A fresh live `E2E-002` attempt could not produce partner evidence:
  - `gcloud auth print-identity-token` failed non-interactively with
    reauthentication required.
  - The older staging host `https://drts-api-kdhu6wzufa-uc.a.run.app` returned
    `404` for `/`, `/health`, and `/api/health`.
  - The newer documented host `api-staging.drts.internal` returned `NXDOMAIN`
    from this machine.
- A follow-up probe at `2026-05-19T03:33Z` to `2026-05-19T03:34Z` reconfirmed
  the same environment boundary: active `gcloud` account present, identity
  token mint still blocked by reauthentication, old `run.app` host still `404`,
  and `api-staging.drts.internal` still unresolved.
- A second revalidation at `2026-05-19T04:18Z` reconfirmed the same boundary:
  active `gcloud` account still present, token mint still requires
  reauthentication, all three old `run.app` probes still return `404`, and
  `api-staging.drts.internal` still fails DNS resolution from this machine.
- A third revalidation at `2026-05-22T10:20Z` reconfirmed the same boundary:
  active `gcloud` account still resolves to
  `bobo.du@cctech-support.com`, active project still resolves to
  `drts-dev-bobo-20260503`, identity-token mint still fails with
  non-interactive reauthentication, Cloud Run / Secret Manager metadata probes
  fail behind the same auth boundary, all three old `run.app` probes still
  return `404`, and `api-staging.drts.internal` still fails DNS resolution from
  this machine.
- A fourth revalidation at `2026-05-22T11:03Z` found a newer repo-documented
  staging ingress at `https://api.staging.drts-fleet.cctech-support.com`, but
  unauthenticated requests to `/` and `/api/health` were redirected by Google
  IAP and both token-helper paths still failed because the local `gcloud`
  session requires reauthentication.

Conclusion:

- No new live external-platform proof was collected in this session.
- This task can only add a dated partial evidence snapshot.
- `EXT-002-BLK-001` through `EXT-002-BLK-007` remain open and
  `WF-FWD-001` must stay `EXTERNAL-GATED`.

---

## 2. Canonical Baseline

### 2.1 Release-gate truth

`docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` keeps
`WF-FWD-001` at `EXTERNAL-GATED` and states that live forwarded-task seeds,
callback behavior, and platform-adapter confirmation remain outside repo-only
closure.

### 2.2 Cross-repo gap truth

`docs/03-runbooks/cross-repo-gap-matrix-20260424.md` still lists the Grab
Taiwan real adapter as `external-gated` and names the required partner API
contract, credentials, sandbox, webhook signature, callback, status sync,
lost-race, and no-owned-assignment evidence.

### 2.3 Forwarder proof-gate truth

`support/sidecars/EXT-002/EXT-002-FORWARDER-ADAPTER-GATE.md` remains the
binding blocker packet for:

- `EXT-002-BLK-001` forwarder API contract authority
- `EXT-002-BLK-002` sandbox credentials and network access
- `EXT-002-BLK-003` webhook signature and replay protection
- `EXT-002-BLK-004` live forwarded task seed or inbound order
- `EXT-002-BLK-005` callback lifecycle evidence
- `EXT-002-BLK-006` lost-race and duplicate callback evidence
- `EXT-002-BLK-007` no-owned-assignment proof with a live forwarded task

### 2.4 Runtime adapter truth

The current shipped implementation is still stub-only:

- `packages/contracts/src/platform-codes.ts` marks Grab Taiwan as
  `forwarder_stub`.
- `apps/api/src/modules/forwarder/grab-taiwan.adapter.ts` declares
  `mode: "stub"` and `productionStatus: "stub"`.
- The adapter health payload remains stub-shaped with `credentialStatus`,
  `authStatus`, `webhookStatus`, and `rateLimitStatus` all resolving to
  `stub`.

---

## 3. Live Probe Sequence

### 3.1 Fresh Live Attempt On 2026-05-19

#### Attempted command

```bash
export E2E_API_URL="https://drts-api-kdhu6wzufa-uc.a.run.app"
export E2E_AUTH_BEARER_TOKEN="$(gcloud auth print-identity-token)"
export E2E_TIMEOUT=60
./tests/e2e/E2E-002-forwarded-order.sh
```

#### Observed results

1. `gcloud auth print-identity-token` failed:

```text
ERROR: (gcloud.auth.print-identity-token) There was a problem refreshing your current auth tokens: Reauthentication failed. cannot prompt during non-interactive execution.
```

2. The script still started, but the first live request failed:

```text
Expected HTTP 200, got 404
```

3. The returned body was a generic HTML `404 Page not found` page, not an API
   JSON error.

### 3.2 Endpoint probes on 2026-05-19

Probed on `2026-05-19`:

- `https://drts-api-kdhu6wzufa-uc.a.run.app/`
- `https://drts-api-kdhu6wzufa-uc.a.run.app/health`
- `https://drts-api-kdhu6wzufa-uc.a.run.app/api/health`

Observed result for all three probes:

- HTTP `404`

### 3.3 Alternate host probe on 2026-05-19

The current E2E matrix documents staging as:

```text
https://api-staging.drts.internal
```

Observed result from this machine on `2026-05-19`:

- DNS lookup returned `NXDOMAIN`
- `curl` could not resolve the host

### 3.4 Revalidation snapshot at 2026-05-19T04:18Z

Observed result from a second probe pass in this session:

- active `gcloud` account still resolves to `bobo.du@cctech-support.com`
- `gcloud auth print-identity-token` still fails with non-interactive
  reauthentication required
- `https://drts-api-kdhu6wzufa-uc.a.run.app/`
  `https://drts-api-kdhu6wzufa-uc.a.run.app/health`
  and `https://drts-api-kdhu6wzufa-uc.a.run.app/api/health` still return HTTP
  `404`
- `curl -I -sS https://api-staging.drts.internal/api/health` still fails with
  host resolution error

### 3.5 Revalidation snapshot at 2026-05-22T10:20Z

Observed result from a third probe pass in this session:

- active `gcloud` account still resolves to `bobo.du@cctech-support.com`
- active `gcloud` project still resolves to `drts-dev-bobo-20260503`
- `gcloud auth print-identity-token` still fails with non-interactive
  reauthentication required
- `gcloud run services list` and `gcloud secrets list` both fail before
  returning metadata because they hit the same reauthentication boundary
- `https://drts-api-kdhu6wzufa-uc.a.run.app/`
  `https://drts-api-kdhu6wzufa-uc.a.run.app/health`
  and `https://drts-api-kdhu6wzufa-uc.a.run.app/api/health` still return HTTP
  `404`
- `nslookup api-staging.drts.internal` still returns `NXDOMAIN`
- `curl -I -sS https://api-staging.drts.internal/` and
  `curl -I -sS https://api-staging.drts.internal/api/health` still fail with
  host resolution error

### 3.6 IAP staging ingress probe at 2026-05-22T11:03Z

The repo's current smoke-path documentation points at:

```text
https://api.staging.drts-fleet.cctech-support.com
```

Observed result from a fourth probe pass in this session:

- `curl -I -sS https://api.staging.drts-fleet.cctech-support.com/` returns
  HTTP `302`
- `curl -I -sS https://api.staging.drts-fleet.cctech-support.com/api/health`
  also returns HTTP `302`
- both redirects are generated by Google IAP and point to Google OAuth for
  client id
  `1071409254673-nabnvfu9hr89s1acue6fcfoomn9g1v5k.apps.googleusercontent.com`
- `./scripts/print-staging-iap-token.sh` fails because its underlying
  `gcloud auth print-access-token` call requires non-interactive
  reauthentication
- the direct impersonated fallback
  `gcloud auth print-identity-token --include-email --project drts-staging-bobo-20260502 --impersonate-service-account github-actions-deployer@drts-staging-bobo-20260502.iam.gserviceaccount.com --audiences 1071409254673-nabnvfu9hr89s1acue6fcfoomn9g1v5k.apps.googleusercontent.com`
  fails with the same reauthentication error

### 3.7 Interpretation

This session did not fail because `E2E-002` found no forwarded task and
gracefully skipped. It failed earlier at the environment boundary:

- no usable non-interactive identity token could be minted
- no GCP metadata call in the active dev project could surface a replacement
  service URL or secret path
- the older staging host appears stale or no longer fronts the API
- the newer internal staging hostname is not reachable from this machine
- the newer public staging hostname resolves, but it is IAP-protected and this
  workspace could not mint a fresh bearer token to cross that boundary

That means this session could not even reach the point where `EXT-002-BLK-004`
through `EXT-002-BLK-007` would be testable.

---

## 4. Blocker Snapshot

| Blocker ID        | 2026-05-22 status | What was observed through the latest probe window                                                                                                                         |
| ----------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EXT-002-BLK-001` | open              | No approved partner API contract artifact was added or surfaced, and no metadata call could enumerate a replacement partner endpoint or API package.                     |
| `EXT-002-BLK-002` | open              | No working sandbox credential path was available; token refresh failed non-interactively, GCP metadata listing hit the same reauth gate, the legacy hosts were stale or unresolved, and the newer IAP-protected staging ingress could not be exercised past the auth redirect. |
| `EXT-002-BLK-003` | open              | No signed webhook sample, signature algorithm note, or replay-denial proof was accessible.                                                                               |
| `EXT-002-BLK-004` | open              | No live forwarded task seed could be queried because staging reachability failed before task discovery.                                                                   |
| `EXT-002-BLK-005` | open              | No callback lifecycle logs or correlation IDs were collected.                                                                                                             |
| `EXT-002-BLK-006` | open              | No live duplicate / stale / lost-race callback evidence was collected.                                                                                                    |
| `EXT-002-BLK-007` | open              | No live no-owned-assignment proof could be produced without a reachable forwarded task flow.                                                                              |

---

## 5. Relationship To Existing Evidence

This packet does not replace or contradict the earlier evidence chain:

- `support/sidecars/FBP-014/FBP-014-E2E-UMBRELLA-CLOSEOUT.md` correctly keeps
  `E2E-002` as `ENV-GATED`.
- `support/sidecars/FBP-014B/FBP-014B-LIVE-EVIDENCE-PACK.md` only claimed live
  staging proof for `E2E-001` and `E2E-004`; it did not claim a live forwarded
  adapter pass.
- `support/sidecars/FWD-VERIF-001/FWD-VERIF-001-VERIFICATION.md` already
  established that current repo truth supports mock/test-double forwarder
  verification but not real external-platform closure.

This task therefore adds a newer dated field report, not a new pass verdict.

---

## 6. Recommended Gate Read

Recommended wording:

- "`WF-FWD-001` remains `EXTERNAL-GATED`."
- "`EXT-002-BLK-001` through `EXT-002-BLK-007` remain open."
- "Fresh `2026-05-19` and `2026-05-22` live probes did not reach
  partner-path verification because the available `gcloud` account required
  reauthentication, GCP metadata listing failed behind the same auth boundary,
  the legacy staging hosts were stale or unresolved, and the newer IAP staging
  ingress still required a bearer token this workspace could not mint."

Not allowed:

- "Forwarder live evidence passed."
- "Grab Taiwan adapter is ready."
- "E2E-002 passed" when the environment could not reach a live forwarded-task
  path.

---

## 7. Evidence Commands Executed

Executed on `2026-05-19` and revalidated on `2026-05-22`:

```bash
gcloud auth list --filter=status:ACTIVE --format='value(account)'
gcloud config get-value project
gcloud config list --format='text(core.account,core.project)'
./tests/e2e/E2E-002-forwarded-order.sh
gcloud auth print-identity-token
gcloud run services list --platform=managed --project drts-dev-bobo-20260503 --format='table(metadata.name,location,url,status.url)'
gcloud secrets list --project drts-dev-bobo-20260503 --format='value(name)'
./scripts/print-staging-iap-token.sh
gcloud auth print-identity-token --include-email --project drts-staging-bobo-20260502 --impersonate-service-account github-actions-deployer@drts-staging-bobo-20260502.iam.gserviceaccount.com --audiences 1071409254673-nabnvfu9hr89s1acue6fcfoomn9g1v5k.apps.googleusercontent.com
curl -I -sS https://drts-api-kdhu6wzufa-uc.a.run.app/
curl -I -sS https://drts-api-kdhu6wzufa-uc.a.run.app/health
curl -I -sS https://drts-api-kdhu6wzufa-uc.a.run.app/api/health
getent hosts api-staging.drts.internal
nslookup api-staging.drts.internal
curl -I -sS https://api-staging.drts.internal/
curl -I -sS https://api-staging.drts.internal/api/health
curl -I -sS https://api.staging.drts-fleet.cctech-support.com/
curl -I -sS https://api.staging.drts-fleet.cctech-support.com/api/health
```

Observed key outputs:

- active `gcloud` account: `bobo.du@cctech-support.com`
- active `gcloud` project: `drts-dev-bobo-20260503`
- identity-token mint: failed, reauthentication required
- Cloud Run / Secret Manager metadata listing: failed, reauthentication required
- staging IAP token helper: failed, reauthentication required
- old `run.app` host: HTTP `404`
- internal staging host: `NXDOMAIN`
- post-cutover staging host: HTTP `302` to Google IAP / OAuth

---

## 8. Machine-Truth Note

Canonical machine truth for `FWD-LIVE-001` lives at the control-plane root
`/home/edna/workspace/drts-fleet-platform/ai-status.json`.

The isolated worker worktree's local `ai-status.json` remains branch-local and
is not the authoritative dispatch view for this task.

Because task lifecycle state can advance independently of this packet, this
document must not be read as the source of truth for current owner / reviewer /
status fields. Readers should consult canonical `ai-status.json` for live
control-plane state and use this packet only for the dated evidence snapshot
recorded above.
