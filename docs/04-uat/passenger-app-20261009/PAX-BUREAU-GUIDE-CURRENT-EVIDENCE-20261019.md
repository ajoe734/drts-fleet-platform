# PAX-BUREAU-GUIDE-CURRENT-EVIDENCE-20261019

Owner: Codex2. Reviewer: Root Codex. Base: `61fa7cf44fb25d8be36634357fa3549286b96b84`.

## Result and source scope

The guide previously displayed only the historical `.4` / `48d94` results next
to the current Passenger entry. It now presents a separate, dated record of the
two completed shared core/additional suites. Their source SHA identifies the
evidence, not the code currently serving the guide. The historical 163-stage
summary, all 16 detailed cases and every original missing item remain unchanged
in `components/bureau-review/content.ts`.

Only the five allocated files change: `shared-run.ts`, `BureauReviewPage.tsx`,
`translations.ts`, the existing `bureau-review-page.test.tsx`, and this document.
The route's `force-dynamic`, public relative links, private-host mode and Driver
control boundaries are unchanged. The frozen Entry/Parent candidates, their
original authorship and acceptance keys are not reopened or replaced.

## Evidence and limits

The fixed metadata references deploy run [39187969683](https://github.com/ajoe734/drts-fleet-platform/actions/runs/39187969683),
source `61fa7cf44fb25d8be36634357fa3549286b96b84`:

| Artifact                           | SHA-256                                                            | Qualified scope                                             |
| ---------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------- |
| `12159932019`, shared core         | `811c3c323aede0aecb4fbed1849ec8f7f1dfd06fa72d7ead3da4c9ab58833ef0` | 3 new orders, 48 stages; one test passed, retry 0           |
| `12159612755`, additional branches | `c81bd40a3e8cc97ff7f1f82aabce89fa6b7756fe1271d1882a1202058a731da7` | 5 different new orders, 60 stages; one test passed, retry 0 |

Both ZIP digests match GitHub metadata, CRC checks pass, and each report's
`config.metadata.gitCommit` and `ci` bind the full source SHA. This is 8 original
orders / 108 stages, not all PAX UC01–16 or the separate 16 operational tests.
It does not report the later quote/timeout/recovery steps or whole workflow as
complete.

The finite qualification is preserved at:

- `.local/passenger-bureau-gap-correction-20261018/parallel-readonly-audit-20261019/shared61fa-core-additional/qualification.json`, SHA-256 `b1b69c52ff6d9a4eee2a80aa6bb2cc55234838f0140292e0e07bd2463dd04156`.
- `.local/passenger-bureau-gap-correction-20261018/direct-dev-entry-simplification-20261018/Root-independent-live61fa-actual-image-readback.json`, SHA-256 `7bc9b89f140bd4fdc82cc98051b5a7010ec45263510912a976bf0facc0c1d3e0`.

These machine-specific paths are review evidence; the rendered Passenger page
does not expose them or any token/session material.

| Finding / requirement                 | Delivered page behavior                                                                                                                          | Evidence boundary retained                                                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| First activation                      | Real ordinary OTP 201, consent prompt presented, returning account false, same-account terms/privacy saved                                       | No consent-window screenshot; unchecked/refusal/wrong/expired/resend/session negatives remain open                       |
| Fare/cancellation                     | A/B/E TWD85; B same-payment attempt 1 failed → attempt 2 captured; C/D/F/G/H cancelled without charge/payment/rating                             | Allowed cancellation is free; refund needs actual prior capture. No on-trip/proof-pending UI rejection or real PSP claim |
| Timeout applicability                 | 90s matching-job threshold and 60s assigned-offer deadline explained independently                                                               | No added instant Passenger product or claim that the two suites execute the 90s matching branch                          |
| Recovery/maps/driver                  | Same-order reassignment; F actual Google search/reverse/service-area recovery; H simulated GPS stale/fresh; G original Driver refusal            | Missing driver data, map faults, lost ACK, reload/cross-device and Driver B screen remain unverified                     |
| Documents/complaints/special services | Four nonformal HTML including two complete synthetic E04; same-order lost-item internal lifecycle; contact-consent and immutable-rating branches | Formal issuance, pending/retry, fare/service complaints, real contact/return, welfare/accessibility remain open          |
| Terminal/contact presentation         | A completed tracking ended; C/G original terminal headers/footer; D single independent contact-phone notice and account link                     | C/G tracking cards and A full order UUID outside image crop; D notice is before the D order exists                       |

Supply qualifications, GPS, PSP, SMS delivery and notifications remain explicitly
simulated external sources. Internal order/auth/fare/dispatch/payment/case paths
are real application flows. The existing shared artifacts use deployed API
repository readback; formal PG joins belong to their separate same-source CI
qualification, not a new direct Cloud Run SQL execution by this task.

## Validation and acceptance

The two new DOM checks fail on the unchanged base page: 2 failed / 7 passed,
exit 1, because no separate current-evidence region exists. The seven existing
checks, strengthened to inspect every historical case field and ordered step,
pass on that base. Raw output:
`.local/passenger-bureau-gap-correction-20261018/guide-current-evidence-20261019/page-before.log`.

Post-change checks:

| Command / check                                                                                                               | Actual result                                                                                          | Raw log in the task's `.local/passenger-bureau-gap-correction-20261018/guide-current-evidence-20261019/` directory |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `pnpm exec vitest run tests/unit/pax-bureau-browser-entry-20261018/bureau-review-page.test.tsx`                               | Exit 0, 9/9 passed                                                                                     | `page-after.log`                                                                                                   |
| Scoped `pnpm exec eslint --max-warnings=0` on the four changed TS/TSX files                                                   | Exit 0                                                                                                 | `scoped-eslint-final.log`                                                                                          |
| `node tools/ci/i18n-guard.mjs`                                                                                                | Exit 0, 683 files / 81 existing exemptions; no new exemption                                           | `i18n-guard.log`                                                                                                   |
| `git diff --exit-code 61fa7cf44fb25d8be36634357fa3549286b96b84 -- apps/passenger-app-web/components/bureau-review/content.ts` | Exit 0; historical file SHA-256 `5ff1320b7350042fb340cfbe215781e00de1b5f147aefc5ed5105dbf1bf108ba`     | Exact base blob comparison                                                                                         |
| `pnpm --filter @drts/passenger-app-web typecheck`                                                                             | `next typegen` passed; first `tsc` exited 2 on four unchanged contracts files missing `zod` resolution | `passenger-typecheck.log`                                                                                          |

The original typecheck failure is preserved, not labelled a pass. Root then
reused the accepted package-local contracts dependencies via an ignored,
read-only symlink after verifying identical package manifests (SHA-256
`97a356560520c3a424be18162291bf1aa6bf8c53c749fc6db45170d49a35f405`).
The receipt is `normal-own-contracts-dependency-resolution-reuse.json` in the
same task evidence directory. No installation, shared distribution build or
product change was needed. Root is serializing the final full typecheck behind
the active Journey unit run; its result is pending at this checkpoint.

No VM product, HTTP/browser/PG/Compose server was started. Own required hosted
CI and the assigned independent review must still validate the final candidate.

| Required acceptance                                            | Evidence / outstanding work                                                                                                                                                 |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pax_bureau_guide_current_evidence_historical_cases_preserved` | Historical byte identity and real page DOM/content checks required; the page separates 108 from 163 and keeps both positive evidence and remaining limits                   |
| `pax_bureau_guide_own_candidate_review_ci_merge`               | Own normal commit/plain push/full candidate/PR, assigned independent review, own required CI and protected merge remain required; predecessor green checks are not credited |

This document is source validation for a guide update. Deployment of the new
guide and any new shared-runtime claim remain Root's separate release work.
