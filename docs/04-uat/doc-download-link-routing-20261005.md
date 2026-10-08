# DOC-DOWNLOAD-LINK-ROUTING-20261005

Owner: Codex. Independent reviewer: Claude2. Implementation evidence, not a
declaration of deployment or acceptance. Candidate identity is the exact head
recorded by `ai-status.sh handoff` and the matching PR; this document travels with
that candidate. No earlier reviewer findings exist for this task.

## Findings and implementation

**F1 — opening an API-issued relative download in a console stays on that
console's origin.** At base `a7b406dcacff1588fb41119605e61a71837587a6`, none of the
three consoles had a download route/rewrite. The API bootstrap in
`apps/api/src/main.ts` prefixes `ControlledDownloadController` with `/api`, so its
actual endpoint is `/api/downloads/:kind/:subjectId`, not `/downloads/...` even on
the API origin. The tenant proxy also rejected the `downloads` path family.

All three `next.config.ts` files now rewrite exactly
`/downloads/:kind/:subjectId` to
`/control-plane-proxy/downloads/:kind/:subjectId`. Existing proxy handlers select
`DRTS_API_URL` at request time, prepend `/api`, preserve the query, stream the
response and keep upstream status codes. Tenant `isAllowedTenantPath` permits
only a three-segment GET after its existing unsafe-segment check. Signed URLs
remain bearer capabilities: the API's `@OpenRoute` controller checks HMAC first,
then expiration, then the stored content hash. Console login/IAP handling and
all existing tenant API session checks remain in place.

**F2 — P5 rejects the same relative URL before rendering a link.**
`records-operations-console.tsx` calls `requireControlledDownloadUrl` before
putting `issued.download.downloadUrl` in an anchor. Previously `new URL(value)`
threw. The guard now also accepts the exact relative download route, rejecting
path traversal, extra segments, encoded slashes/backslashes, other relative
paths and protocol-relative URLs. Its existing absolute HTTPS requirement is
preserved.

### Why proxy rewrites, rather than a new download host

The shared-dev workflow already supplies `DRTS_API_URL` from
`DEV_CONTROL_PLANE_API_ORIGIN` or the deployed API's Cloud Run URL, and supplies
the optional IAP audience to the existing proxies (`deploy-dev.yml`, steps
`api_url` and `web_env`). Rewrites are internal, so they do not bake a Cloud Run
hostname into the frontend build. They also cover already-issued relative links
and retain the existing upstream Cloud Run authentication path.

Setting only `CONTROLLED_DOWNLOAD_HOST` would not fix the five services that
explicitly pass `DEFAULT_CONTROLLED_DOWNLOAD_HOST` as `host`: billing settlement,
platform admin, reporting/filing, regulatory report jobs and accident
investigation. `resolveControlledDownloadPolicy` gives explicit overrides
precedence over the environment. Also, an absolute override would need the full
`https://<api-origin>/api/downloads` prefix, not just an origin. The shared helper
comment now documents both facts. No deployment workflow, live variables or IAM
policy are changed by this task.

## Actual caller inventory and limits

| Surface / source                                          | Actual link behavior and scope                                                                                                                                                                                                                                                                |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tenant `app/invoices/page.tsx` and `app/billing/page.tsx` | Render invoice `artifactUrl` directly; `BillingSettlementService` issues `tenant-invoice` links. Covered by the tenant rewrite.                                                                                                                                                               |
| Platform `app/payments/page.tsx`                          | Renders the same invoice `artifactUrl`; covered by the platform rewrite.                                                                                                                                                                                                                      |
| Platform `app/switchboard/page.tsx`                       | Renders `artifactDownloadUrl`; `PlatformAdminService` issues materialised `placard` links. Covered.                                                                                                                                                                                           |
| Platform P5 records                                       | `issueMultiTaxiTripExportDownload` issues kind `multi-taxi-trip-records`. Relative URL guard fixed and route reachable; this kind is excluded from `DOCUMENT_ARTIFACT_KINDS` and still returns API 501, not file bytes.                                                                       |
| Ops `app/reports/page.tsx`                                | Renders filing ZIP/PDF links from `downloadMetadata` and `artifactZipUrl` / `artifactPdfUrl`. Now reaches the API's explicit 501. Filing packages have no bytes by PRD §9.10.2 / `SD-DP-20260820-012`; this task does not add a renderer.                                                     |
| Ops driver detail                                         | Displays statement period, payout, net amount and receipt number; there is no download anchor in `statementColumns`. The API does generate statement PDF URLs under kind `report` (not `driver-statement`); that kind is exercised through the Ops rewrite. No new button or screen is added. |
| Tenant and Ops general reports                            | Their primary `artifact.downloadUrl` uses the separate `/reports/:jobId/artifact` route, while `downloadMetadata` carries the controlled reference. This task tests the `/downloads` route, not the separate report endpoint or its browser navigation.                                       |
| Legacy `tenant-portal-web`                                | Also contains direct invoice/report anchors, but is absent from the active nine-service shared-dev deploy inventory and outside this task's three-console scope. Not changed or asserted as accepted.                                                                                         |

Supported materialised kinds remain `tenant-invoice`, `placard`, and `report`.
Metadata-only 501 outcomes are **not** counted as successful downloads. Any
requirement to produce bytes for excluded kinds requires an explicit scope
decision; this routing task does not silently override the existing product
decision. See `document-artifact-kinds.ts` and the existing
`docs/04-uat/system-remediation-20260906/SR-ARTIFACT-001.md`.

UI design references checked: `packages/ui-tokens/src/realms.ts` and
`docs/05-ui/drts-design-canvas/platform-mtx-commerce.jsx` (`P5C_Export`). The diff
changes route configuration and URL validation only; it introduces no markup,
colors, typography or screen design.

## Verification record

Local evidence directory: `.local/DOC-DOWNLOAD-LINK-ROUTING-20261005/` in the
assigned worktree. Node v22.23.2, pnpm 10.33.0, Vitest 4.1.4, Next 16.3.8.
Tests use production metadata creation, Next's actual config rewrite matcher,
the actual three GET proxy handlers, actual Nest controller route metadata and
the actual artifact store/controller. Only HTTP transport and Cloud Run metadata
tokens are simulated. Byte fixtures establish exact transfer, not renderer
validity; existing invoice/placard/driver-statement tests cover rendering.

| Finding / acceptance               | Source and change                                            | Old result → fixed result                                                                                                                        | Command / exit / evidence                                                                                                                                                                                                                                          | Remaining limits                                                                                                                                                                                        |
| ---------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1; 各後台的受控下載連結可實際下載 | Three Next configs; tenant proxy; real controller and store  | Base SHA: 15 cases fail on absent rewrite, 7 negative cases pass → initial fix: 22/22 pass. Expanded final routing coverage: 34/34 pass.         | `pnpm exec vitest run tests/unit/controlled-download-console-routing.test.ts`; old exit 1 (`baseline-routing.log`), fixed exit 0 (`final-routing.log`). Initial regression retained in anchor `e72494436`; routing fix `aeb578b7303368e2de40b42f8b7f125404594823`. | Unit transport boundary; no browser/Cloud Run download claimed. Unsupported kinds retain explicit 501.                                                                                                  |
| F2; relative P5 caller             | `requireControlledDownloadUrl` and its real caller           | `aeb578b7303368e2de40b42f8b7f125404594823`: `Invalid URL` → relative reference reaches the API; unsafe alternatives rejected                     | Same test with `-t 'platform P5'`: old exit 1, 1 failed / 8 passed / 25 skipped (`baseline-p5.log`); fixed suite exit 0. Repair anchor `cb690b3eefa725eabb41927f45dd6f65427376c0`.                                                                                 | P5 kind has no stored bytes, so test expects 501.                                                                                                                                                       |
| 連結主機設定正確並經測試           | Rewrite → existing runtime `DRTS_API_URL` → `/api/downloads` | Exact bytes for each console using both ordinary HTTPS API origin and `.a.run.app`; Cloud Run token header and unchanged signature query checked | Routing suite, exit 0                                                                                                                                                                                                                                              | Metadata service is simulated. Existing dev workflow wiring inspected; live deployed candidate not verified.                                                                                            |
| HMAC / expiry 410 / hash 409       | Unchanged `ControlledDownloadController.resolve`             | All three proxies preserve 403/410/409; existing cross-kind, subject-tamper, PDF content and link-renewal cases pass                             | 9-file regression below: 91 passed, exit 0 (`regression.log`)                                                                                                                                                                                                      | No DB/external store exercised by these unit tests.                                                                                                                                                     |
| Tenant boundaries                  | Existing middleware/proxy plus GET-only download addition    | 19 existing auth/proxy checks pass; new malformed paths and mutation denials pass                                                                | `pnpm --filter @drts/tenant-console-web exec vitest run tests/unit/control-plane-proxy.test.ts tests/unit/middleware.test.ts`; exit 0 (`tenant-boundary.log`)                                                                                                      | Console real session/IAP verification not replaced by this unit evidence.                                                                                                                               |
| Typecheck                          | Root tests and all three apps                                | Root and tenant/platform pass; Ops passes after building its declared `@drts/control-plane-auth` dependency                                      | `pnpm exec tsc -p tsconfig.json --noEmit`; three app `typecheck` commands, exit 0 (`typecheck-root-final.log`, `typecheck-tenant.log`, `typecheck-platform.log`, `typecheck-ops-final.log`)                                                                        | Initial root test import caused Next global `ProcessEnv` errors, fixed by runtime loading; initial Ops missing `dist` types resolved by dependency build. Neither initial failure is counted as a pass. |
| 同候選SHA CI通過且獨立reviewer審查 | Candidate lifecycle / PR                                     | Pending exact final candidate CI and Claude2 review                                                                                              | Owner will supply full SHA, pushed branch, PR and this artifact to `handoff`; no `done` call                                                                                                                                                                       | CI, independent review, merge and any required hosted acceptance remain lifecycle gates.                                                                                                                |

Regression command (no server/browser startup):

```bash
pnpm exec vitest run \
  tests/unit/controlled-download-console-routing.test.ts \
  tests/unit/controlled-download-route.test.ts \
  tests/unit/p5-records-operations-ui.test.ts \
  tests/unit/system-remediation/sr-artifact-001/controlled-download-artifact-bytes.test.ts \
  tests/unit/system-remediation/sr-invoice-001 \
  tests/unit/system-remediation/sr-placard-001 \
  tests/unit/system-remediation/sr-driver-gaps-20260911/driver-gaps-remediation.test.ts
```

No local product service, preview, browser, E2E runner, Docker or deployment was
started. Same-SHA hosted CI must be read before recording its acceptance. Owner
does not approve or close this task.
