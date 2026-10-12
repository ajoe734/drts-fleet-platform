# AUDIT-SHARED-DEV-VERIFY-20261002 — original audit bundle and shared-dev evidence

## 1. Authority, scope and disposition

Original owner **Pi**; independent reviewer **Codex**. This is the missing original UAT artifact for the audit-remediation wave, not a new product scope, provider contract, deployment or full-system acceptance.

Original execution authority: the machine-local `.local/project-fixes-20261002/EXECUTION.md`, section `AUDIT-SHARED-DEV-VERIFY-20261002`, and the canonical task's ten dependencies and four required acceptance keys. The 2026-10-11 continuation uses the existing, Git-locked `pi/dev-release-20261004` worktree. Its clean historical HEAD `cf263f02ffb962979402c73a01ecd8b6576b9362` was normally fast-forwarded to the observed protected dev `6bc5f4af6afeffb327ece5f2b0ef3fe056aa5924` before writing this one task-owned document. No published history was rewritten or transplanted.

**Disposition from the 2026-10-11/12 UTC evidence collection (exact command timestamps are retained):** the original prerequisites have genuine reviewed/CI/merged source delivery. Existing shared-dev deployments provide attributable, limited runtime evidence. This new documentation candidate still needs its own exact-generation independent review, mandatory CI and protected merge. No original acceptance key is set by this document. In particular, the earlier deployment runs below did **not** deploy or test the new documentation candidate.

Read in full before reconciliation: [deploy-dev.yml](../../.github/workflows/deploy-dev.yml), [branch strategy](../ops/branch-strategy.md) and [custom-domain runbook](../03-runbooks/smarttransport-tw-custom-domains.md), including the immutable deployment-source version of the workflow. The workflow and fresh live variables, not historical suspended-project examples, determine the target.

## 2. Reviewed bundle provenance — ten original prerequisites

Canonical observations preserve original owner/reviewer, required evidence, candidate generation, same candidate/review/CI identity, successful CI and protected merge. Fresh public PR GETs independently confirm each merged PR's original head and merge SHA. `git merge-base --is-ancestor` verifies **all ten protected merges** are ancestors of **each** of the three distinct sources `cf263f02…`, `2f6ec0cc…` and `6bc5f4af…`.

Ancestry establishes inclusion, not that later source is byte-identical or that every original finding has live acceptance. Historical acceptance is credited within its original bounds; later changes and external prerequisites remain visible.

| Original prerequisite                   | Original candidate = reviewed = CI SHA     | Protected merge / PR                               | Credited scope, not a live waiver                                                                                                                               |
| --------------------------------------- | ------------------------------------------ | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AUDIT-PROOF-CLOSURE-20261002            | `343f73a88f38f97e7e38668f00ded47e2453f909` | `f81835bfd6caefb9af549d1d14ba7b84fe6c54e1` / #2285 | Shared old/new pay gate, real source byte-serving, configured storage/scanner denial and boundary regressions.                                                  |
| AUDIT-DEPENDENCY-GATES-20261002         | `66427270eadc8acda90fa42f260dd5f5f6c5a47d` | `9780f0bc25a8eac5be623c24d91e8068fdbc3852` / #2287 | Deliberate dependency triage/remediation, enforceable security/classification gates; not a timeless zero-advisory claim.                                        |
| AUDIT-VOICE-EVIDENCE-20261002           | `9f7bb3e9c9806025b814e7a487358b26ecd4a051` | `cf6a199072a438d37a46f119673e78601f592c28` / #2283 | Fixture/live separation; missing live transport cannot emit fixture-derived live success.                                                                       |
| AUDIT-ARTIFACT-DURABILITY-20261002      | `580be89c288fb8e0cfcd792c6502b8754a865554` | `def1a3553d9f0ed5a637ae66f1bea8b977fa6f1f` / #2295 | Actual durable producer/readers, awaited backup/fenced publication and independent-client schedules; not an actual Cloud Run kill/restart drill.                |
| AUDIT-DOCS-TRUTH-20261002               | `a77c6a4ff7dcb569370a80db911a0ca9d7a8350c` | `cccd9b1118e2008adccabc117fef94bcebdccfe0` / #2280 | Truthful deployment/scope instructions and classified historical/machine-local/missing citations; no invented evidence files.                                   |
| AUDIT-VOICE-LIFECYCLE-20261003          | `a4a7c698b40dda0f83c07533f3d47841d6355888` | `2c883998691b856aaa488606b344dd9f0f01ef06` / #2290 | Bounded, authorized worker/recorder lifecycle and socket-free code verification, not real telephony.                                                            |
| AUDIT-RECOVERY-PROVIDERS-20261002       | `edb53cc670047d12953fee36e280178322487cbd` | `c00a4439adde8a9d6f536217bf386e31a543fe5e` / #2294 | Confirmed internal manual recovery and honest unavailable external retry paths; no invented PSP/fare protocol.                                                  |
| AUDIT-FORWARDER-RUNTIME-20261002        | `ea70ea5327ccc58302f4136055a52b84f74c7959` | `a1b84bd336b3e3179abd01a3f753a299275cc423` / #2281 | Unconfigured transport returns no fake provider acknowledgment; callback auth/correlation/idempotency retained.                                                 |
| AUDIT-VOICE-APPLICATION-WIRING-20261003 | `2f263449a3b39a8c86f84ed8bbd4ee7e4a88ac8d` | `cbb677122d0b13d8ac4720c5332f0a5f76e8a073` / #2303 | Composed trusted turn/recording/snapshot path and authority/epoch/consent fences; real issuer/model/storage/PSTN and `productionCapable=false` limits retained. |
| AUDIT-DEV-PROVIDER-CONFIG-20261003      | `4e617ed47b614a96df25347ec919260e175be71e` | `d94d528f4a0257808922f85aaffbd6766a23b141` / #2296 | Explicit validated deployment mapping and managed-secret references; references alone do not prove resources or provider success.                               |

Original finding artifacts remain authoritative for the repair/reopen history:

- [Proof closure](audit-proof-closure-20261002.md): original F01/F02/proof-specific F03, including real-byte and authorization failures/repairs.
- [Artifact durability](audit-artifact-durability-20261002.md): shared F03, complete publication lifecycle and hosted formal-schema evidence, with earlier failed races retained.
- [Voice evidence](audit-voice-evidence-20261002.md), [voice runtime](audit-voice-runtime-20261002.md), [application wiring](audit-voice-application-wiring-20261003.md): F05/F06 and all prior review/repair provenance.
- [Recovery providers](audit-recovery-providers-20261002.md), [forwarder runtime](audit-forwarder-runtime-20261002.md): F07/F08 confirmed implementation versus missing provider contract.
- [Documentation truth](audit-docs-truth-20261002.md), [provider configuration](audit-dev-provider-config-20261003.md): G02 and executable configuration propagation.

Dependency security and classification results are candidate/time-bound. Production-tree advisory counts, exceptions, expiry and actual runtime reachability must be read from the named security gate, not inferred from package version changes or a generic green build. No security exception, checker rule or threshold is changed here.

## 3. Four distinct identities — never substitute one for another

| Identity                                     | Immutable source                           | What was actually observed                                                                                                                                                                                                       |
| -------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Historical original manual shared-dev deploy | `cf263f02ffb962979402c73a01ecd8b6576b9362` | Deploy [37206659572](https://github.com/ajoe734/drts-fleet-platform/actions/runs/37206659572), 2026-10-04. Original nine active product services, migration, inventory controls and hosted 14+16 tests.                          |
| Subsequent automatic publish deployment      | `2f6ec0ccbb7f102a99052fc7a08995056ebb1ea4` | Deploy [38128920419](https://github.com/ajoe734/drts-fleet-platform/actions/runs/38128920419), `publish/v2026.10.11.0`, 2026-10-11 09:35:34–10:03:54 UTC. Workflow includes the separately authorized new Passenger App surface. |
| Observed main promotion                      | `6d74e38f056442c420c511b23428b7c87b20252c` | Public GitHub branch metadata only. Promotion is not another runtime deployment, Operator readiness or restoration.                                                                                                              |
| Source reconciliation basis                  | `6bc5f4af6afeffb327ece5f2b0ef3fe056aa5924` | Observed protected dev, includes later Booking/Payment deliveries. The new document is appended here; its real commit SHA is supplied at handoff, never guessed or self-referentially embedded.                                  |

The two deployed product sources differ. Later Booking backend/UI and Payment Core/UI commits are **not** included in the automatic `2f6ec0cc…` deployment merely because their PRs subsequently merged into dev. The original three UI tasks' component/client/BFF acceptance is separate from actual provider/PG/browser/session/device integration and actual Ride/Receipt consumers. This document neither redeploys them nor grants passenger QA acceptance.

Fresh public variables at collection: **`DEV_GCP_PROJECT_ID=drts-dev-devcc-20260825`**, **`DEV_GCP_REGION=us-central1`**. No suspended historical project was used. Only public GitHub GETs were made during this closeout; no GCP/HTTP/DB/provider calls, secrets retrieval, dispatch, rerun, cancellation, publish or promotion occurred.

The source workflow now explicitly resolves ten active services, including new `drts-dev-passenger-app-web`; old `drts-passenger-web` remains retired. Partner Booking remains paused. This does not change the original nine-surface historical test inventory or resurrect Passenger/Concierge/Assisted retired services.

## 4. Existing same-product-SHA hosted deployment evidence

Both runs are genuinely terminal success. Full paginated job inventories and **all complete log ZIP members** were consumed and hashed, not only aggregate conclusions. Each authentic operational report records **16 expected / 0 unexpected / 0 skipped / 0 flaky**, with no report errors; the separate 14 candidate tests are attributable to the complete hosted log, not inferred from the operational report.

| Existing run              | Jobs      | Complete log accounting                   | Candidate tests | Operational report                                                                                       |
| ------------------------- | --------- | ----------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------- |
| 37206659572 / `cf263f02…` | 9 success | 18 members; 1,224,481 bytes; 15,306 lines | 14 passed       | Artifact `11305975543`, source-bound to `cf263f02…`; 16 operational tests, 66 recorded evidence entries. |
| 38128920419 / `2f6ec0cc…` | 9 success | 18 members; 1,495,534 bytes; 18,382 lines | 14 passed       | Artifact `11698838968`, source-bound to `2f6ec0cc…`; 16 operational tests, 58 recorded evidence entries. |

Each nine-job graph includes preparation, image build/push, DB migration, service deployment, Partner Booking paused-state enforcement, service health, retired-state enforcement, candidate operational acceptance and outcome. Neither run's migration was counted as a skipped pass. Artifacts were downloaded through the original GitHub artifact IDs; each contains the actual operational report and evidence JSON, not a regenerated transcript. Final report statistics and case statuses must be read from those artifacts, not derived by summing entries or comparing unrelated test totals.

The newer workflow verifies the Passenger App `/` and `/login` return 200 with matching `x-drts-candidate-sha`; this is not `/fares`, real OAuth, payment or browser/mobile QA acceptance. Its existing health log records referral WIF registry rollout `applied=true` at 09:59:55 UTC. This supersedes the earlier pending-rollout observation for **that run only**. The actual conditional lifecycle step then requires issue/consume/replay/cross-host checks; an earlier fail-closed 403 alone was not a positive lifecycle pass.

Historic `.local/dev-release-20261004/RESULT.md` and the original 2026-10-04 independent health receipt remain preserved as historical evidence. No fresh direct health request was made here. GitHub evidence shows what the named run deployed and verified then; it does not establish continuous availability or a fresh all-role journey today.

**Applicability boundary:** older runtime sources and reports cannot cover this new documentation candidate's mandatory CI, or any product changes after their executed SHAs. Do not register `same_sha_hosted_results` from a mismatched run by silently comparing only convenient paths. Any outstanding new-candidate runtime requirement remains a concrete unexecuted gate; the original acceptance contract is not narrowed to documentation checks.

## 5. Workforce auth/tokenVersion reconciliation

Original workforce race repair PR #2277 / `2b4b6b96aed1c41ae4b252681e0466ee808cbd0e` is included in both deployed sources; it was not reimplemented. Actual `JwtAuthService.issueSessionToken` takes the version from the **persisted** principal plus workforce timestamps after the awaited write, rather than the pre-write guessed timestamp. Later session-supersede repairs preserve no-op principal/role versions and independent issuance while retaining genuine revocation/role/status denials.

For the automatic deployed source `2f6ec0cc…` versus the actual reconciliation basis `6bc5f4af…`, complete raw bytes and SHA-256 are equal for:

- `apps/api/src/common/auth/jwt-auth.service.ts`
- `apps/api/src/modules/identity/identity.repository.ts`
- `apps/api/src/modules/auth/auth.controller.ts`
- `apps/api/src/modules/auth/google-workload-identity.adapter.ts`
- `tests/unit/system-remediation/sr-auth-session-supersede-20261003/session-supersede.test.ts`

Fresh scoped execution on the real `6bc5f4af…` source at 2026-10-12 00:00:29–00:00:34 UTC: **one file / 10 passed / 0 failed / 0 skipped**. The existing suite executes the actual controller, Google assertion validator, JWT service, repository fallback and genuine admin role update, with generated test RSA keys, synthetic JWKS HTTP and external DB/user facts only. It covers independent sessions, no-header ops/tenant exchanges, concurrent first authentication, revoke, role/principal/membership changes and the genuine-versus-no-op grant-start distinction.

Safety: private frozen offline dependency installation, lifecycle scripts disabled; a preload denies TCP/UDP/listeners and prohibited runtime subprocesses; database connection variables are absent. No fixture provider is relabeled live, and no current PG/Google/IAP/session integration is inferred from this component execution. Deployed-source byte equality is disclosed attribution, **not** an actual two-session Cloud Run or PostgreSQL run. The named deployment's session/surface checks are separate, narrower hosted evidence.

## 6. Executable provider configuration, not resource inference

The automatic deployed `2f6ec0cc…` workflow and source-basis `6bc5f4af…` workflow are fully byte-identical, SHA-256 `e7ecc4415e87421f9289dcae21c39ab7d8653e29b98f783cd3cc0d1159464269`.

Actual propagation:

1. `Resolve configured artifact providers` runs `operations/deployment/resolve-dev-artifact-providers.py` on the immutable deployed source with repository variables.
2. Validated `env_suffix` enters `ARTIFACT_PROVIDER_ENV_SUFFIX`, is appended to the complete API env argument, then reaches `Deploy — api --set-env-vars`.
3. Validated `secret_suffix` enters `ARTIFACT_PROVIDER_SECRET_SUFFIX`, is appended to complete managed-secret references, then reaches `--set-secrets`. No raw S3 credential variable or partial output is accepted.
4. GCS uses the existing runtime metadata identity and needs no invented AWS credentials. S3 opt-in uses validated managed secret references/default-chain authority. Missing configuration is explicitly unprovisioned; partial/injected/misspelled configuration fails closed.

The newer hosted deployment log records the actual selected references/configuration:

| Runtime setting                     | Recorded value in the existing hosted deployment   |
| ----------------------------------- | -------------------------------------------------- |
| DOCUMENT_ARTIFACT_STORAGE_PROVIDER  | `gcs`                                              |
| DOCUMENT_ARTIFACT_GCS_BUCKET        | `drts-dev-devcc-20260825-document-artifacts`       |
| REMITTANCE_PROOF_STORAGE_PROVIDER   | `gcs`                                              |
| REMITTANCE_PROOF_GCS_BUCKET         | `drts-dev-devcc-20260825-remittance-proofs`        |
| REMITTANCE_PROOF_SCANNER_PROVIDER   | `cloud-run-clamd`                                  |
| REMITTANCE_PROOF_SCANNER_URL        | `https://drts-dev-scanner-r6ykdme3wa-uc.a.run.app` |
| REMITTANCE_PROOF_SCANNER_TIMEOUT_MS | `60000`                                            |

The earlier 2026-10-03/04 absence observations are historical and cannot be repeated as current lack of provider wiring. Conversely these hosted configuration values do not prove current object inventories, generation/metageneration stability, complete malware behavior, all signatures, financial side effects or a real cross-instance kill/restart. Those gates keep their existing owners and authority.

SMTP/tenant OIDC/Passenger OAuth/SMS/PSP groups remain separately validated and reference-only. Metadata completeness is not provider availability or legal account authority. Voice production capability remains false; forwarder lacks its approved upstream contract and does not return a fabricated acknowledgment. Internal manual payment handoff is not PSP capture, settlement or approved retry policy. Later first-party Payment Core code is separate source delivery and still blocked on its real policy/expiry/provider/hosted integration inputs.

## 7. Live mail registration — old 404 resolved, delivery still open

Fresh public GET at collection resolves `.github/workflows/live-mail-acceptance.yml` to workflow ID **373845158**, state **active**, created 2026-10-03 10:48:59 UTC; default-main source GET also succeeds. Thus the 2026-10-03 preflight's default-branch 404/registration blocker is historical, **not a current blocker**.

This check does not send mail, promote a branch or read secrets. It does not prove authorized mailbox/recipient agreement, actual inbox delivery, invitation/approval lifecycle, natural expiry, resend/failure recovery, invoice attachment/lifecycle or same-release UI readback. `SR-LIVE-MAIL-001` and invoice live gates remain their own unfinished acceptance tasks. Do not rerun a mail workflow simply because it is now registered.

## 8. Remaining original live gates and provenance floors

None of these gates is closed by the ten source tasks, generic CI, the 14+16 operational tests, this document, source ancestry or configuration presence:

| Existing route                                | Concrete remaining execution/input boundary                                                                                                                                                                                                     |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SR-LIVE-ENTRY-001                             | Lawful roles/accounts, current DNS/TLS, actual SSO/MFA and full candidate-bound entry journeys.                                                                                                                                                 |
| SR-LIVE-MAIL-001 / invoice live               | Authorized recipients/mailbox evidence, actual delivery and full invitation/approval/invoice lifecycle; registration alone is insufficient.                                                                                                     |
| SR-LIVE-PUSH-001                              | Contracted partner endpoint and correlated receipts, durable outbox, real native/background/cold-start handoff; first-party Passenger push remains its separate original route.                                                                 |
| SR-LIVE-DOC-001 / original storage assessment | Actual authorized controlled bytes/signatures/native metadata/formal DB/preservation and cross-instance/restart evidence; existing assessment/manual-helper HOLDs and F2 exclusions remain.                                                     |
| SR-LIVE-FINANCE-001                           | Approved issuer/payment/ERP sandbox, qualification, errors/recovery/reconciliation; no real payment or guessed provider policy.                                                                                                                 |
| SR-LIVE-MAP-001                               | Complete authorized service-area/stale-position/browser rendering journeys; pre-existing Maps excerpts do not close the full gate.                                                                                                              |
| SR-LIVE-DRIVER-001                            | Same-release Android **and** iOS authorized native devices/builds; permission, offline/background/kill/restart/proof/SOS lifecycle.                                                                                                             |
| SR-LIVE-FORWARD-001                           | Approved vendor transport/auth/signature/rate/callback/cancel-lost-race sandbox evidence. Honest unavailable source is not a live integration pass.                                                                                             |
| UV-EXEC-028 / UV-EXEC-029                     | Real authorized PSTN/ASR/TTS/dual recording, language holdouts, interruption/DTMF/transfer, N and 1.5N capacity, complete denominators, on-call/kill-switch/rollback drills. Existing synthetic evidence is not live acceptance.                |
| SR-LIVE-OPS-001                               | Original NON-VM Operator readiness/IAM authority, isolated restore/readback, RPO/RTO/capacity and Scheduler restart/catch-up evidence. Old readiness targets a different main and is expired.                                                   |
| Original cleanup task                         | Continuous ALL-writer F2 exclusion, authorized original-object/formal-DB preservation assessment, whole-cleanup permission and actual removal evidence. **ZERO removed** is retained; newer deploy fixtures are preserve-only.                  |
| Original Passenger QA/Ride/Receipt/Core       | Exact formal PG/HTTP/provider/browser/device/consumer evidence, actual E04 producer facts, policy/expiry inputs and existing publication/history/HOLD dispositions. Three UI component completions are retained but do not replace these gates. |
| SR-ACCEPT-001                                 | All original **44 findings / 134 capabilities / 15 acceptance groups**, C125 supply **AND** case, lawful roles, contracted services, manual/restore witnesses and **same release**; final keys remain unaccepted.                               |

Ride planning helper's already-started `2e1e538d…` CI was observed to terminal completion without cancellation/rerun: CI **38164973703 failed** on ancestor `bbc358cbda65` missing `Reviewer`; integration **38164973714 succeeded** with two original conditional job skips. All 26+30 complete members / 42,684 lines were consumed. A later good append or successful behavioral CI cannot erase that ancestor, the dispatch-fence provenance breach or the two genuine independent REOPENs. The existing helper and parent remain blocked/HOLD; no source edits, checker-base waiver, replacement helper/branch or E04 scope cut is authorized here.

## 9. Evidence retention and reproducibility

Machine-specific evidence is intentionally outside the tracked source, under the canonical machine-local directory `.local/original-shared-dev-audit-closeout-20261011T2354Z/`; it is **not** assumed present in hosted checkouts. Reviewer/operator on this development machine can read it. Public GitHub run/PR/artifact IDs above provide the independently retrievable remote identities.

Retained inputs/receipts include:

- Original task and all ten full prerequisite records, board digest, unchanged required keys and actual unfinished canonical rows.
- Supported Supervisor metadata/resume and original Pi start receipts; initial clean existing branch, remote absence and normal-FF argv/stdout/stderr/exits.
- Ten public merged-PR GETs and all 30 merge-ancestor checks across the three immutable source identities.
- Fresh fully paginated jobs and full-log ZIP member hashes for both deployments and both held-helper CI runs; raw command receipts include UTC/cwd/exit/output identity.
- Authentic deployment artifact ZIPs and their two complete member hashes, source-bound operational reports/evidence.
- Raw immutable workflow/auth/controller/repository inputs and deployed-to-basis byte equality audit.
- Private offline/frozen/ignore-scripts install receipt, unchanged common Git config after normal ignored Husky delegation setup, runtime prohibition preload/hash and actual ten-case scoped auth JSON/stdout/stderr.
- Initial observer requests for two nonexistent guessed auth file paths are preserved as **failed source lookup**, not product failures or successes. Correct source paths above were then obtained from repository search and verified. No alias, fake source or historical result was substituted.

For a future reviewer, the scoped source test command is:

```text
pnpm exec vitest run tests/unit/system-remediation/sr-auth-session-supersede-20261003/session-supersede.test.ts --maxWorkers 1
```

Only run with the documented external-runtime prohibition guard and no DB configuration; do not run repository-wide local unit sweeps or any browser/E2E/HTTP/DB/Compose server. CI/deployment/runtime evidence is collected through the authorized hosted routes, not a VM substitute.

### Started static checks — inherited failures are retained

The complete historical reconciliation range `cf263f02… → 70a8e431…` was also checked, not silently replaced by an own-change range. Trailer validation **failed on 37 already-protected trunk commits**; broad `git diff --check` also failed on pre-existing source whitespace. Running the same complete checks at the untouched incoming `6bc5f4af…` basis reproduces **byte-for-byte identical failure output**, SHA-256 `f420ecff0f30a3b12e8f862c36521a8b8747039127c9cfc5b529602d6034e165` and `3040df75906beb3ed27536ffc3c079c80d738e1c6e2c8e050cd52cfbb607b6d2`, respectively. These are genuine retained inherited failures, not waived or repaired by this document.

Separately, the actual own PR range from the authorized incoming `6bc5f4af…` passes the unmodified trailer and whitespace validators. New owner commits retain the literal original Task-ID subject and Pi/Codex trailers. Canonical consistency has zero findings, classification validates 6,338 files, and the one UAT document passes formatting. These scoped results do **not** claim the historical range is green, authorize editing other owners' source/history, alter the formal hosted checker base or replace independent review/mandatory CI. All original range inputs and exits remain available to that review.

## 10. Original acceptance contract — not recorded by prose

The unchanged keys are `reviewed_bundle_provenance`, `authorized_shared_dev_candidate_or_concrete_blocker`, `same_sha_hosted_results`, `remaining_live_gates_not_fabricated`. Their applicability is assessed only through the supported lifecycle after exact independent review/mandatory CI/protected merge. Product runtime SHA, hosted test-merge SHA, protected source SHA and new document candidate SHA must be explicitly distinguished.

**Full-system status: NOT COMPLETE.** This artifact fills the original source/evidence-delivery omission and corrects stale registration/provider/deployment observations. It cannot manufacture missing provider/Operator authority, remove HOLDs, relax original acceptance or declare the new candidate deployed.
