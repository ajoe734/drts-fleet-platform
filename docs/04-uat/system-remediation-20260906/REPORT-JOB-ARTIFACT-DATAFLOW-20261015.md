# REPORT-JOB-ARTIFACT-DATAFLOW-20261015

Owner: Codex. Independent reviewer: Gemini. Date: 2026-10-15 UTC.

## Scope and immutable authority

- Base: `386eaa45213cd0c67e9b9e5b3bcd9b01a3195b09` (`dev` at dispatch).
- Branch: `codex/report-job-artifact-dataflow-20261015`.
- Implementation/test revision: `a864ba80494928704966772f7ca14661c347ad40`.
  The final candidate adds this evidence document. Its exact full SHA, branch,
  command exit codes and log hashes are recorded after commit in
  `/home/lupin/workspace/drts-fleet-platform/.local/report-job-artifact-dataflow-20261015/owner/candidate-validation.json`
  and the canonical task's `handoff` / PR head. Those identify the final candidate;
  the implementation revision above is not a substitute for the final review/CI SHA.
- Exact spec: `.local/remaining-original-functional-fixes-20261015/REPORT-JOB-ARTIFACT-DATAFLOW-20261015.json`
  at canonical root; SHA-256 `7d43dc4f16b8c05d8c6396fdcec290d14d993966b7110b6a24923c4ef694f36c`.
- Original read-only audit: `.local/goal-continuation-20261015T0851-bank-authority-root/C090-C091-current-accepted-report-dataflow-readonly-audit.json`;
  SHA-256 `263c5cdbea68080e5df6fee324492a7932f94286f8a342542bef3156150845ef`.
- Product authority: service contracts §3.12 (report jobs/artifacts, background
  generation, no ownership of original transactions); PRD §9.10. Existing
  `SR-REPORT-001`, `SR-QA-REPORTS-001` and font/dependency credits are retained.

This closes two Source dataflow defects only. No whole C090/C091, full134,
Final, cleanup, HOLD or deployed-dev completion is claimed.

## Findings and acceptance mapping

| Finding / required acceptance                                                                                      | Production path / contract                                                                                                                                                                                                                                                                           | Original → fixed evidence                                                                                                                                                                                                                                                                                                                                                                                                     | Commands / versions / exits                                                                                                                                                                                                                                                                                             | Remaining limits                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `C090-C091-REPORT-REVENUE-RECORD-COLLECTION-OMITTED`; `report-job_revenue-records-reach-existing-artifact-formats` | `ReportingFilingService.renderReportArtifact`, local `reportArtifactRenderers` adapters. Select existing masked `partnerRevenueRows` for revenue, generic `rows` otherwise; download audit uses selected record count. Builder, public JSON arrays and completion manifest payload remain unchanged. | Original actual completed booking-backed revenue jobs return one revenue row and empty generic rows; CSV has no records, XLSX is empty, PDF says `No data.` All three byte inspections fail. Fixed CSV/XLSX match every column/value and exact count; PDF text contains all fields/values and one unique order ID. MoneyAmount retains JSON object values. Enterprise booking is excluded by the existing builder predicate.  | Before: revenue command below, exit 1, 3 routing failures / 30 skipped. Production base unchanged through test-only revision `9da3f5714`; `before-revenue.log`. After: focused 49 cases pass; expanded regression 167 cases pass, plus final UI readback case. Final candidate rerun is in `candidate-validation.json`. | Real storage/signing and deployed downloads remain unverified. Existing renderer internals are reused, not reimplemented.                                                                       |
| `C090-OPS-REPORT-ARTIFACT-URL-NOT-PROXIED`; `report-job_Ops-download-reaches-existing-authorized-proxy`            | `ReportsPage.downloadReportJob` → extracted production `artifactDownloadUrl` → `openDownload` → `window.open`. Recognized `/reports/:jobId/artifact` maps to `/control-plane-proxy/reports/:jobId/artifact`, whose existing catch-all forwards to `/api/reports/:jobId/artifact`.                    | Original actual page button sends raw API-relative URL; 2 recognized-path cases fail, 9 cases pass. Fixed real React button sends the exact proxy URL, retains encoded ID/query/fragment and `_blank`/`noopener,noreferrer`. External signed, legacy, already-proxied and other paths retain targets. Additional readback case displays the queried revenue row, masked references and TWD amount with the correct row count. | Before: Ops config command below, exit 1; production base unchanged, test harness `9da3f5714`; `before-ops.log`. After: `ops-final.log`, exit 0, 12 cases. Final normal root-suite execution also includes the real page.                                                                                               | jsdom with mocked API transport; no browser, Next server, actual IAP session or hosted HTTP response is asserted.                                                                               |
| `report-job_original-fields-lifecycle-scope-and-denials`                                                           | Existing queue/builders, generic job retrieval, tenant/evidence guards, API controller and proxy remain authorities.                                                                                                                                                                                 | New socket-free cases cover real queued/running, failed builder, missing job, hydrated expired state, allowed scoped tenant, wrong tenant, nonmatching scope and disallowed actor; empty revenue and nonempty daily/trip exports pass all formats. Download MIME/filename, audit count, public rows and manifest stability are checked. Original C090/C091, renderer/CJK/font and queue/P5 tests remain green.                | `job-boundaries.test.ts`, exit 0, 5 cases; expanded regression command below, exit 0, 21 files / 167 cases before the extra UI readback case. Final candidate result in validation manifest.                                                                                                                            | Repository hydration alone is mocked for expired state. Existing bootstrap empty-scope behavior is preserved; negative scope uses an explicit unrelated scope. No new privilege or global gate. |
| `report-job_exact-candidate-validation`                                                                            | Normal Codex owner → Gemini independent review → same-head required CI → protected merge → four original acceptance keys.                                                                                                                                                                            | Root/API/Ops typecheck and affected lint pass after normal workspace builds. Final SHA and exact check outcomes are persisted in the local validation manifest, checked against remote branch and PR head before handoff.                                                                                                                                                                                                     | Node `v22.23.2`, pnpm `10.33.0`, Vitest `4.1.4`. Full commands below. CI is initiated by the final PR and remains pending until the GitHub bus records that candidate's results.                                                                                                                                        | This document does not approve itself, merge, record acceptance or convert local tests into hosted CI. Reviewer, mandatory CI, protected merge and acceptance remain lifecycle work.            |

## Reproducible commands and evidence

All commands run from the assigned worker worktree. Durable machine logs are
copied to `/home/lupin/workspace/drts-fleet-platform/.local/report-job-artifact-dataflow-20261015/owner/`.
The final manifest records actual candidate identity, commands, exits and SHA-256
of each log. Source is not reset to run before/after checks.

Original-before (test-only revision `9da3f5714`, production identical to base):

```bash
pnpm exec vitest run tests/unit/reporting-filing.test.ts -t 'exports partner benefit revenue'
pnpm exec vitest run --config tests/unit/report-job-artifact-dataflow-20261015/vitest.config.ts
```

Both exit 1 for the specific product mismatches above. Earlier setup attempts
with missing dependencies, an incorrect fixture assertion and exact disabled
button labels were corrected before collecting these valid reproductions;
those setup failures are not product defect evidence. The isolated worktree
initially inherited shared dependency symlinks. After detecting them, shared
links were restored from their own lockfile and this worktree installed its own
locked dependencies. No tracked canonical source or shared SDK/provider was edited.

Fixed-after / final candidate:

```bash
pnpm --filter @drts/contracts build
pnpm --filter @drts/control-plane-auth build
pnpm exec vitest run tests/unit/reporting-filing.test.ts tests/unit/report-job-artifact-dataflow-20261015 tests/unit/system-remediation/sr-report-001 tests/unit/system-remediation/sr-qa-reports-001 tests/unit/system-remediation/sr-deps-report-font-001 tests/unit/system-remediation/sr-ops-capacity-20260911/reporting-queue.test.ts tests/unit/system-remediation/sr-ops-capacity-20260911/reporting-completion.test.ts tests/unit/system-remediation/sr-ops-capacity-20260911/reporting-start.test.ts tests/unit/system-remediation/sr-ops-capacity-20260911/durable-readback.test.ts tests/unit/system-remediation/sr-ops-capacity-20260911/multi-taxi-durable-export.test.ts
pnpm typecheck:root
pnpm --filter @drts/api typecheck
pnpm --filter @drts/ops-console-web typecheck
pnpm lint:root
pnpm --filter @drts/api lint
pnpm --filter @drts/ops-console-web lint
pnpm exec prettier --check apps/api/src/modules/reporting-filing/reporting-filing.service.ts apps/ops-console-web/app/reports/page.tsx apps/ops-console-web/lib/report-artifact-url.ts tests/unit/reporting-filing.test.ts tests/unit/report-job-artifact-dataflow-20261015 docs/04-uat/system-remediation-20260906/REPORT-JOB-ARTIFACT-DATAFLOW-20261015.md
git diff --check
```

The initial API typecheck lacked fresh `contracts` / `control-plane-auth` dist
outputs. Standard package builds resolved it; no application source workaround
was added. A test initially used a nonexistent actor type; the final denial
uses the real `ops_observer` contract. Generated `next-env.d.ts` changes from
Next typegen are excluded and restored after the check.

## Original unverified boundaries

- No VM product/dev/preview/browser/E2E/PG/Docker servers were started. Unit tests
  use the production in-memory scheduler and production renderers, not a manually
  marked completed job. The one expired fixture exercises production hydration.
- No hosted Cloud Run deployment, live object storage, signing/expiry enforcement,
  legal-hold storage, real workforce/tenant roles or actual browser download was
  verified. Existing artifact metadata expiry and API job-state behavior are
  retained; this change introduces no new TTL/auth policy.
- Public `partnerRevenueRows` is still the UI/query contract; generic `rows`
  remains separate. Completion audit's generic and revenue counts retain their
  existing meanings; only actual download audit count now follows exported rows.
- UI transport responses are mocked, while the actual page, actions, URL helper,
  validation and `window.open` arguments execute. PDF/XLSX use the established
  independent pdfjs/ExcelJS readers at job-routing scope. Pricing, refunds,
  provider data, SDK, renderer internals, controller/proxy auth and manifests are
  not redesigned.
- Final candidate review, same-candidate mandatory CI, protected merge and four
  original acceptance keys must be recorded through the existing lifecycle.
