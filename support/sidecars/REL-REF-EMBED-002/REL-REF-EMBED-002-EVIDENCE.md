# REL-REF-EMBED-002 Evidence Recovery

**Task:** `REL-REF-EMBED-002` recover real Referral Embed dev deployment and live proof
**Owner:** `Codex`
**Reviewer:** `Codex2`
**Date:** `2026-08-02`
**Branch:** `codex/rel-ref-embed-002`

## Verdict

`REL-REF-EMBED-002` has recovered the real reviewed-tree deployment evidence for
Referral Embed on dev, but the task is **not yet acceptance-complete**.

The reviewed implementation for the formal Yuhe entry is traceable from merged
PR `#1215` to `dev@c5f061e48900d4ef810cba2116486e85a08dce38`, the same SHA that
passed `CI (integration trunk)`, cut publish snapshot
`publish/v2026.08.01.2`, and successfully deployed in GitHub Actions run
`30688059107`.

Live verification on `2026-08-02T04:07:55Z` confirms:

- the formal URL `https://refer.smarttransport.tw/embed/yuhe-residence` is up
- the dev Cloud Run fallback
  `https://drts-dev-referral-embed-web-4t7rg6fmeq-uc.a.run.app/embed/yuhe-residence`
  is up
- both URLs currently serve byte-identical HTML
- root redirects to `/embed/yuhe-residence`
- CSP / iframe allowlist / unauthorized-host denial are active
- Partner Booking remains paused and Concierge remains non-active

However, the live formal URL still renders a **demo handoff/book surface with no
bound referral session**. The server-rendered context exposes `session: null`
and `issues: ["fallback:missing_handoff_credentials"]`. In this terminal
environment there is no available internal key, session secret, or Yuhe public
partner API key to mint a real handoff artifact, so the acceptance item
"session-driven authorized flow works" cannot be honestly proven from live dev
today.

This packet therefore supports `progress` / `blocker` state, not `done`.

## Evidence Chain

| Stage | Result | Evidence |
| --- | --- | --- |
| Reviewed integration PR | PASS | PR `#1215` "Integrate Partner Booking pause and formal Yuhe Referral entry" merged to `dev` on `2026-08-01T06:19:08Z`: <https://github.com/ajoe734/drts-fleet-platform/pull/1215> |
| Exact reviewed merge SHA | PASS | `c5f061e48900d4ef810cba2116486e85a08dce38` |
| Required trunk CI | PASS | `CI (integration trunk)` run `30687515831` succeeded for `dev@c5f061e48900d4ef810cba2116486e85a08dce38`: <https://github.com/ajoe734/drts-fleet-platform/actions/runs/30687515831> |
| Publish snapshot | PASS | `Nightly publish (cut snapshot)` run `30688047266` created `publish/v2026.08.01.2` at the same SHA: <https://github.com/ajoe734/drts-fleet-platform/actions/runs/30688047266> |
| Dev deploy | PASS | `Deploy — Dev` run `30688059107` succeeded for `publish/v2026.08.01.2` / `c5f061e48900d4ef810cba2116486e85a08dce38`: <https://github.com/ajoe734/drts-fleet-platform/actions/runs/30688059107> |
| Deploy health output | PASS | Dev health check printed `referral-embed-web: https://drts-dev-referral-embed-web-4t7rg6fmeq-uc.a.run.app/embed/yuhe-residence` and `partner-booking: PAUSED (service removed; code preserved)` in deploy run `30688059107` |
| Paused-service cleanup | PASS | Deploy job `Enforce Partner Booking paused state` deleted `drts-dev-partner-booking-web` and logged `Deleted only drts-dev-partner-booking-web; Partner Booking code remains preserved in the repository.` |

## Live Verification Snapshot

Verification time: `2026-08-02T04:07:55Z`

| Surface | Result | Observation |
| --- | --- | --- |
| Formal URL | PASS | `curl` returned `HTTP/2 200`; body contains `社區叫車`, `御和物業`, `/embed/yuhe-residence` |
| Cloud Run fallback | PASS | `curl` returned `HTTP/2 200`; body contains `社區叫車`, `御和物業`, `/embed/yuhe-residence` |
| Root redirect | PASS | `https://refer.smarttransport.tw/` returned `HTTP/2 307` with `location: /embed/yuhe-residence` |
| Formal vs fallback parity | PASS | `sha256` of both rendered HTML bodies = `385736f6dcf4deca3776fb9fdbcdf51461ed0793e6c28d9f60ca9bdf6539625d`; `cmp` matched byte-for-byte |
| Authorized host headers | PASS | `content-security-policy: ... frame-ancestors https://app.yuhe-living.com.tw https://app-stg.yuhe-living.com.tw`; `x-drts-embed-decision: allowed` |
| Unauthorized host denial | PASS | `https://refer.smarttransport.tw/embed/yuhe-residence?entryHost=evil.example` with `Referer: https://evil.example/mobile` returned `HTTP/2 403`, `x-frame-options: DENY`, `frame-ancestors 'none'`, `x-drts-embed-block-reason: entry_host_not_authorized` |
| Partner Booking paused | PASS | `https://book.smarttransport.tw` returned `HTTP/2 404` on `2026-08-02` |
| Concierge non-active | PASS | `https://concierge.smarttransport.tw` failed TLS connect (`OpenSSL SSL_connect: SSL_ERROR_SYSCALL`) on `2026-08-02` |

## Acceptance Gaps Still Open

| Acceptance item | Status | Current evidence |
| --- | --- | --- |
| Exact reviewed tree deployed by successful Deploy-Dev | PASS | PR `#1215` merge SHA `c5f061e48900d4ef810cba2116486e85a08dce38` == publish snapshot SHA == deploy run SHA `30688059107` |
| Formal and Cloud Run URLs have timestamped live evidence | PASS | `2026-08-02T04:07:55Z` live curl evidence above |
| CSP is correct | PASS | Allowed-host and blocked-host header checks above |
| Canonical HTML/JSX parity retained | PASS | Live bodies identical across formal domain and Cloud Run fallback; reviewed tree also passed merged trunk CI/E2E |
| Partner Booking and Concierge remain stopped | PASS | Deploy cleanup log, `book.smarttransport.tw` 404, `concierge.smarttransport.tw` TLS failure, active inventory excludes both |
| Session-driven authorized flow works | BLOCKED | Live HTML exposes `session: null` and `issues: ["fallback:missing_handoff_credentials"]`; no real handoff artifact could be minted from this environment |
| Missing / replay / cross-entry fail closed on live dev | BLOCKED | The code path and merged CI cover these behaviors, but live credentialed proof needs a real session-bearing handoff or internal credential path |

## Direct Live HTML Findings

The formal live page currently server-renders the following facts for the Yuhe
entry:

- `entrySlug: "yuhe-residence"`
- `entryHost: "app.yuhe-living.com.tw"`
- `state: "handoff"`
- `screen: "book"`
- `session: null`
- `issues: ["fallback:missing_handoff_credentials"]`
- visible copy includes `已綁定 referral handoff session：未建立`

This means the live URL is publicly reachable and visually aligned, but it is
not yet a proved real handoff-backed session flow.

## Referenced Canonical Artifacts

- `docs/02-architecture/app-entry-url-index-20260616.md`
- `.github/workflows/deploy-dev.yml`
- `apps/referral-embed-web/README.md`
- `tests/e2e/referral-embed-surfaces.spec.ts`
- `support/sidecars/E2E-REF-EMBED-001/E2E-REF-EMBED-001-SIDECAR-ACCEPTANCE.md`

## Explicit Non-Claims

- No claim that `REL-REF-EMBED-002` is ready for `done`.
- No claim that a real Yuhe host-app/backend handoff was exercised on live dev
  from this terminal session.
- No claim that replay / cross-entry protection has fresh live proof on
  `2026-08-02`; only code-path and merged-CI evidence exist from this context.
