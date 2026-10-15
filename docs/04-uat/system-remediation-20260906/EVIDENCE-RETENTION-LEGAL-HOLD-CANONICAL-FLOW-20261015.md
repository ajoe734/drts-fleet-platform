# EVIDENCE-RETENTION-LEGAL-HOLD-CANONICAL-FLOW-20261015

Owner: Codex. Assigned independent reviewer: Codex2. Status: scoped Source verification retained; F-CI-01 delivery gate failed on published candidate `ac3d5f69c6a600fcf92b71ec7e08a360fe45ca0f`; replacement branch routing, fresh exact-candidate review, mandatory CI and protected merge pending.

Accepted original source: `2c36cad43376f848bd2a7edc06e27369c060c819`.
Immutable R1 spec: `/home/lupin/workspace/drts-fleet-platform/.local/goal-continuation-20261015T1226-remaining-original-audits-root/EVIDENCE-RETENTION-LEGAL-HOLD-CANONICAL-FLOW-20261015-R1.task-spec.json`, SHA256 `83adbcf0f5041a30d896f9d3419929c15c51b34c5ebac5ad1e3af518fed87e79`.
Original audit: same directory, `C099-C100-current-accepted-evidence-retention-dataflow-readonly-audit.json`, SHA256 `ce4eecfce83f8fa697e4e2516ba026d50c88ecda3bc167138e834c2f91751d86`.
All five original findings remain individually tracked below. The accepted C099 five and C100 four cases retain their original limited credit; they never established enabled-persistence faults or a live restore.

## Actual callers and repair boundary

P5 records UI and existing async SDK → `AuditController` four existing commands → `AuditNotificationService` serialized validation → existing `AuditLogRepository.append` → acknowledged publication to audit cache and governance maps → subject projection/restart replay. The generic `recordAuditLog`/`recordAuditLogAsync` and unrelated notification/security callers retain their existing semantics.

`onModuleInit` independently handles recent audit feed and governance trail. Configured authority starts unavailable and becomes known only after a successful trail load. Failure yields retryable 503 `EVIDENCE_GOVERNANCE_UNAVAILABLE` through existing governance reads/commands and report projections; the ordinary feed bootstrap fallback remains. The existing multi-taxi projection already translates such failures to its `unavailable` view. Empty successful trail, disabled repository and noDB remain valid.

Operator shell → one fail-on-error psql transaction → serialized table view → persisted governance replay and fixed lawful candidate table → existing JSONL export → client COPY-back/full-row multiset verification → V0080 role plus local flag → DELETE joining only candidate audit IDs → COMMIT → success receipt. Active protected subjects/manifests/references and their reconstructable history remain. Terminal chains cannot be partly purged so as to resurrect a prior active state. V0080, roles, retention periods, SDK, Phase1 access and Phase2 sandbox boundaries are unchanged.

## Finding-level evidence

Logs are under the assigned worktree's `.local/evidence-retention-20261015/` (absolute worker root supplied by dispatch); these are local diagnostics, not independent approval or acceptance records.

| Finding / trigger                                     | Production symbols / changes                                                                                                                                                  | Actual original-before → fixed-after                                                                                                                                                                                      | Command, exit and evidence                                                                                                                                                                    | Unverified boundary                                                                                                                                                  |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C099-F1 pending/rejected enabled append               | Four controller handlers await four service commands; `commitEvidenceGovernanceLog` publishes after real repository ACK; command queue preserves validation under concurrency | Original: all eight deferred/rejected handler cases fail at early success. Fixed: eight pass, cache/readback remain prior until ACK; rejection and restart agree                                                          | `pnpm exec vitest run tests/unit/evidence-retention-legal-hold-canonical-flow-20261015/governance.test.ts`; original exit 1, `governance-before.log`; fixed exit 0, `governance-expanded.log` | DB transport controlled; real repository serialization and replay execute. No live DB write                                                                          |
| C099-F2 failed configured governance load             | `onModuleInit`, availability guard in governance lists/subject/commands; actual reporting detail consumer                                                                     | Original: empty hold list accepted and recent-feed error clears loaded hold. Fixed: honest 503, report artifact detail rejects with that exact code; recovery succeeds; recent-feed failure preserves authoritative trail | Same command/logs. Initial before: 10 failed / 1 passed. Expanded fixed: 13 passed                                                                                                            | First report probe was tightened to create an actual artifact and check the exact error, eliminating a fixture-only throw. No false positive counted as report proof |
| C100-F1 old held/exception targets and active history | `audit-log-retention-governance.sql`, actual shell selection                                                                                                                  | Original: held/exception target/history and linked references exported/purged. Fixed: only lawful IDs; subject, manifest, known/normalized tenant, release/resolution/expiry and retained terminal chain cases pass       | `pnpm exec vitest run tests/unit/evidence-retention-legal-hold-canonical-flow-20261015/archival.test.ts`; original exit 1, `archival-before.log`; fixed exit 0, `expanded-after.log`          | Actual candidate SELECT evaluated by SQLite over V0009 columns; PG casts/clock translated, not PG engine proof                                                       |
| C100-F2 boundary crossing/newly visible old rows      | One transaction and fixed candidates; `DELETE ... USING ... audit_id`; full-row file verification before delete                                                               | Original deletes boundary/new rows absent from archive. Fixed preserves both, exports/purges only selected identity; one client call; output-open/write/verification failures retain rows                                 | Same command; original 7 failed / 1 passed, expanded archival fixed 9 passed                                                                                                                  | COPY/transaction protocol controlled. PostgreSQL syntax, locks, actual disk-full behavior and restore need original authorized operational lane                      |
| C100-F3 default psql SQL-error continuation           | Actual script `run_psql -X -qAt -v ON_ERROR_STOP=1`; success after transaction return                                                                                         | Original controlled SQL rejection exits 0 and announces success; fixed exits nonzero, preserves source and exported file, never announces purge success                                                                   | Same shell-entry tests and logs; controlled client follows normal error continuation unless actual invocation sets ON_ERROR_STOP                                                              | No assertion about current deployed roles/trigger invocation                                                                                                         |

## Verification checkpoints

Before probes ran against original production files at accepted source `2c36cad43376f848bd2a7edc06e27369c060c819`, without resetting the working tree. Their first durable test anchors are `72d4d0ee4` (governance) and `6eb0085fe` (shell). Production governance repair anchor: `3e9274b69`; archive repair anchor: `555ef9ec2`. Anchors are not review candidates. Final verified source/test checkpoint: `3cca2b3f937a19661bfc7131787861c28ac5ab7f`; the only subsequent test change records optional shell traces. Final documentation and that trace hook are committed before handoff. The full exact candidate SHA/branch, PR, remote-head equality and evidence hashes are recorded after that commit in [candidate.json](../../../.local/evidence-retention-20261015/candidate.json) and in the canonical same-candidate handoff. This avoids embedding a commit's own SHA inside its hashed contents.

- Original governance: 10 failures / 1 pass, exit 1; eight early ACK failures and two failed-load/readback failures.
- Original archival: 7 failures / 1 pass, exit 1; protection, snapshot, SQL default-error continuation and no-op failures.
- Expanded task regressions: 22 pass, exit 0; included in final root run below. Governance is 13 cases; archival is 9 cases with V0009 UUIDs and complete persisted governance events, also replayed through the real repository/service.
- Final root scoped run with original C099 five/C100 four and audit baseline: 36 pass, exit 0 (`final-root-units.log`).
- API direct governance/reporting/family tests: 9 pass, exit 0 (`final-api-units.log`); old governance calls now await actual completion, with original assertions intact.
- Scoped eslint: exit 0 (`lint.log`).
- Scoped task TypeScript check: `pnpm exec tsc -p .local/evidence-retention-20261015/tsconfig.scoped.json --noEmit`, exit 0 (`scoped-typecheck.log`). The local config retains root compiler flags and adds only exact isolated nodemailer type paths.
- Contracts and control-plane declarations built successfully in this worktree (exit 0 for both). Initial API typecheck used missing worktree dist declarations and stale shared-module fallback; that diagnostic is superseded by the isolated comparison below.
- Full API: normal command fails exit 2 because shared dependencies lack nodemailer. Installing the lockfile's exact nodemailer/type versions under task `.local/check-deps` and using a local path overlay exposes two existing SMTP typing errors at `remote-smtp-mail.transport.ts:109/110` (exit 2). The same check against `git archive` of accepted source `2c36cad43376f848bd2a7edc06e27369c060c819` has byte-identical diagnostics after normalizing the source-root prefix (`api-diagnostics-comparison.txt`, `api-baseline-typecheck.log`, `api-isolated-typecheck.log`). No SMTP/shared dependency code changed.
- Final `pnpm typecheck:root`: exit 2 (`final-root-typecheck.log`), including missing shared dependencies/workspace packages, differing shared SDK copies and existing tenant-auth test exports. No diagnostic points to task tests or repaired production files. This is a failed broad check, not a scoped pass promoted to global success.
- `bash -n operations/database/audit-log-retention-archival.sh`, scoped eslint, Prettier and `git diff --check`: exit 0. All launched checks finished before handoff.

## Required acceptance mapping and lifecycle

| Required key suffix (all prefixed `evidence-retention_`)                     | Evidence / state                                                                                                                                                                                  |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `four-governance-commands-canonical-ACK-and-rejected-state-readback`         | Eight actual handler/repository timing and rejection cases, restart replay; reviewer verification pending                                                                                         |
| `authoritative-governance-unknown-empty-noDB-and-original-access-boundaries` | Failed load/recovery/report detail, known empty/noDB, role/reason/expiry/tenant/manifest/transient-buffer refusal; original family tests preserved                                                |
| `legal-hold-exception-exact-archive-set-and-honest-SQL-result`               | Actual shell and actual candidate SELECT controlled tests; no PG/live credit                                                                                                                      |
| `actual-production-before-fixed-after-and-original-regressions`              | Original failing diagnostics and fixed outputs above; final combined checks above; broad typecheck failures explicitly retained                                                                   |
| `exact-candidate-review-CI-and-protected-merge`                              | Canonical handoff locks candidate (local manifest linked above); pending independent Codex2 review, same-candidate mandatory CI, protected merge and own-key acceptance. Owner does not call done |

No live archive/export/delete/restore, DB connection/provisioning, cloud/IAM/provider/deployment, server/browser/E2E or Docker was performed. Source work does not establish full C099/C100 live completion or whole-goal completion. Actual deployed roles, archive custody and restore rehearsal remain with existing owners. The current board's `show SR-QA-REPORTS-001` returned not found; immutable R1 explicitly adopts its original DONE credit and existing UAT records its accepted cases. This metadata discrepancy was reported through owner progress for normal Supervisor reconciliation; no task metadata was edited by hand.

## Reproducible original source and exact shell observations

The complete-fixture shell comparison extracts the unchanged actual script and `db-common.sh` with `git archive 2c36cad43376f848bd2a7edc06e27369c060c819` under task `.local/evidence-retention-20261015/original-source/`. `RETENTION_SCRIPT=<absolute extracted script> pnpm exec vitest run tests/unit/evidence-retention-legal-hold-canonical-flow-20261015/archival.test.ts` executes those original bytes. It fails 8/9 (exit 1, `archival-before-complete-fixtures.log`). The fixed same tests pass 9/9. The test-only selector executes the exact provided script, with no alternate product implementation.

The original governance rerun uses `.local/evidence-retention-20261015/vitest.before.config.ts` to resolve the three actual audit modules from that extracted source and selects the original 11 cases (`-t 'controls actual envelope|failed configured|successful empty|recent-feed'`). Result: 10 failed / 1 passed / 2 deliberately unselected expanded cases, exit 1 (`governance-original-rerun.log`). This confirms the original findings against the final test fixture without moving/resetting the worktree.

For C100-F3 the recorded controlled client stderr is `ERROR: controlled permission / trigger / transaction rejection`. Original script exits **0** and prints `Lawful retention purge completed successfully for 1 records.` The fixed script exits **3**, emits no purge success, retains the source row and its exported archive. Both contain ID `ad95d5fa-651b-486d-8923-fe1238d24a4f`; the traces contain actual command arguments/SQL, stdout, stderr, selected, remaining and archived IDs (`archival-before-trace.jsonl`, `archival-fixed-trace.jsonl`).

These are socket-free controlled fault observations, not claims of an actual SQL rejection or purge against a deployed database. PostgreSQL parser, COPY, trigger and lock behavior remain unexecuted here; the candidate selection query itself runs through the documented SQLite dialect projection rather than a duplicate hold selector.

Diagnostic hashes are recorded in [evidence-index.json](../../../.local/evidence-retention-20261015/evidence-index.json). Their local artifact boundary is explicit above.

## Reopened C100-F1: physical tenant authority (2026-10-15)

Codex2 reopened exact candidate `f36d798ab3cf06bb5559f2eced43c1810f24e42f`
at `2026-10-15T13:16:48Z`. Its successful original regression results above
remain historical evidence, but did not cover conflicting summary tenants.
The finding is retained here rather than treating the earlier C100-F1 result
as complete. This is the first review rejection of this trigger.

Actual ownership sources: `AuditLogRepository.append` independently writes
`normalizeUuidOrNull(record.tenantId)` and arbitrary `newValuesSummary`;
V0009's UUID `tenant_id` and JSONB `new_value` have no equality constraint.
The archival SQL's payload-first `COALESCE` could therefore displace a known
physical tenant A with an unrelated summary tenant B. Its shared tenant gate
then excluded active holds, unresolved unexpired exceptions and audit source
references even for an exact audit ID match.

Repair: `audit-log-retention-governance.sql` uses
`COALESCE(a.tenant_id::text, NULLIF(a.new_value->>'tenantId', ''))` in both tenant
checks. The existing payload fallback remains for NULL physical tenants,
including normalized non-UUID tenants; both unknown remains conservative.
The shared gate still excludes known cross-tenant rows. No matching branch,
retention threshold, event status, V0080, shell export or deletion rail changes.
The operational runbook now states this precedence explicitly.

The three new actual-shell tests each provide seven old target rows and seven
complete persisted protections: hold subject, exception subject, or exception
audit source reference. Each matrix covers physical A/payload B, physical A/no
payload, physical B/payload A, NULL physical/payload A, NULL physical/payload B,
NULL physical/no payload, and NULL physical/non-UUID logical tenant. The tests
assert selected IDs, actual archive contents and all remaining source IDs.

| Finding / acceptance                                                                                                                               | Source and regression                                                                                                                               | Before → fixed result                                                                                                                                                                | Commands / exits / evidence                                                                                                                                                                                                                                                                                                                                                                       | Remaining limit                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C100-F1 conflicting summary tenant; `legal-hold-exception-exact-archive-set-and-honest-SQL-result`                                                 | SQL tenant gate; `archival.test.ts` three `uses physical tenant` cases                                                                              | Reopened candidate: 3 fail, each shell exits 0 and wrongly exports/removes physical A/payload B. Fixed: 3 pass, that exact ID stays; only the two legitimate cross-tenant rows leave | Before extracted actual shell: `RETENTION_SCRIPT=<reopened-source>/operations/database/audit-log-retention-archival.sh pnpm exec vitest run tests/unit/evidence-retention-legal-hold-canonical-flow-20261015/archival.test.ts -t 'uses physical tenant'`, exit 1 (`before-extracted.log`, trace). Fixed full archival: same test file without override/filter, exit 0, 12/12 (`fixed.log`, trace) | Actual SELECT evaluated over V0009 columns with SQLite dialect projection; COPY/transaction/client error behavior controlled, no PostgreSQL runtime proof |
| `four-governance-commands-canonical-ACK-and-rejected-state-readback`; `authoritative-governance-unknown-empty-noDB-and-original-access-boundaries` | Previous actual handler/repository/load tests retained; API audit/reporting/regulatory/multi-taxi callers                                           | Root 39/39 and API 26/26 pass, including original C099 five/C100 four                                                                                                                | Root and API commands below, both exit 0 (`root.log`, `api.log`)                                                                                                                                                                                                                                                                                                                                  | Enabled repository transport controlled; no live DB or external export                                                                                    |
| `actual-production-before-fixed-after-and-original-regressions`                                                                                    | Actual reopened script extracted with `git archive f36d798ab3cf06bb5559f2eced43c1810f24e42f` (script, db-common, governance SQL), no worktree reset | Same final test fixture fails old selection, passes fixed selection. Release/resolution/expiry, exact set and failure regressions remain green                                       | `before-extracted.log`, `root.log`; scoped eslint, `bash -n`, `git diff --check` exit 0                                                                                                                                                                                                                                                                                                           | Broad typecheck was not rerun for this SQL/test/docs-only repair; prior broad failures remain documented above                                            |
| `exact-candidate-review-CI-and-protected-merge`                                                                                                    | New final commit and plain push; local/remote/PR head equality recorded in task-local `tenant-precedence/candidate.json` and canonical handoff      | Pending new Codex2 exact-candidate review, mandatory same-SHA CI, protected merge and own-key acceptance                                                                             | PR #2667; owner handoff after completed local checks                                                                                                                                                                                                                                                                                                                                              | Prior candidate CI does not count for the new SHA; no owner `done` claim                                                                                  |

Root command:
`pnpm exec vitest run tests/unit/evidence-retention-legal-hold-canonical-flow-20261015 tests/unit/audit-notification.test.ts tests/unit/system-remediation/sr-qa-reports-001/c099-evidence-governance-controlled-export.test.ts tests/unit/system-remediation/sr-qa-reports-001/c100-audit-immutability-retention-boundary.test.ts`.
API command:
`pnpm --dir apps/api exec vitest run tests/unit/audit-notification.service.test.ts tests/unit/reporting-filing.service.test.ts tests/unit/regulatory-reporting.service.test.ts tests/unit/multi-taxi-controlled-export.test.ts`.

New diagnostics live at this worktree's
`.local/evidence-retention-20261015/tenant-precedence/`; `evidence-index.json`
there records their hashes. Both old and fixed traces show shell exit 0 and a
two-record success receipt, so count-only assertions would miss the bug:
old archive includes held physical A ID `09949f40-3393-4d1a-8428-f15da766dd10`;
fixed archive replaces it with lawful physical B ID
`f64f6339-5100-460f-861e-84fa5224f1db`. The other lawful ID is unchanged.
An initial fixed probe (`after.log`) failed because the controlled client's
statement extractor stopped at a semicolon in a new SQL comment; that comment
was reworded before the successful full runs. That harness failure is not
counted as product evidence. Anchor `6ff60eb37fd18dd1479cd45478938ded826bb64e`
preserves the repair/tests before that comment-only correction and closeout.

All checks started for this repair completed and results were read before
handoff. No product/DB/browser server, live archive/delete, restore, deployment
or cloud operation ran. The Source-only and independent lifecycle limits above
continue to apply.

## Reopened C100-F1: UUID tenant representation (2026-10-15)

Codex2 reopened exact candidate `006ee58627885141b97c872cdadce8c272e72f00`
at `2026-10-15T13:26:32Z`. This is a new trigger, distinct from the
conflicting-summary-tenant finding above, whose physical-tenant precedence
repair and three original matrices remain passing. The reviewer supplied both
an actual controller/service/repository probe and an actual-shell probe: place
and register accept uppercase UUID tenants, while PostgreSQL's physical UUID
text is canonical lowercase. The shared archival tenant gate compared those
spellings as unequal and admitted an exactly protected audit ID to deletion.

The production authority chain is `AuditController.placeEvidenceLegalHold` /
`registerEvidenceDeletionException` → service `normalizeOptional` (trim only)
→ `AuditLogRepository.append` → `normalizeUuidOrNull` (UUID versions 1–5,
case-insensitive), writing the physical tenant and JSON payload independently.
Formal V0009 defines `tenant_id uuid` and `new_value jsonb`. Existing historical
payloads therefore require correct identity comparison; normalizing only new
commands would not repair them. `getEvidenceSubjectGovernance` had the same
case-sensitive projection issue when a reader supplied the canonical UUID.

Repair boundaries:

- The SQL tenant gate retains physical-target-tenant-first `COALESCE`, its NULL
  fallback and exact opaque comparison. An additional comparison accepts case
  variants only when the protection tenant matches the repository's UUID
  pattern. No subject/source ID comparison is broadened.
- Service subject projections reuse production `isUuidLike` for the same UUID
  equality. Commands, stored payload spellings and response shapes remain
  unchanged. Opaque/non-UUID strings, including UUID-shaped version-7 logical
  identifiers currently rejected by repository normalization, retain exact
  case-sensitive semantics.
- Latest-event/release/resolution/expiry rules, V0080, retention periods,
  Phase1/Phase2 access rules, the table lock, verified fixed archive set,
  fail-on-error invocation and privileged deletion rails are unchanged.

The three new actual-shell matrices cover hold subjects, exception subjects and
exception audit-source references. Each covers uppercase protection/lowercase
physical UUID, conflicting summary, true other physical tenant, reverse-case
NULL-physical payload fallback, other payload tenant, unknown tenant, exact
opaque tenant, differently cased opaque tenant and a nonaccepted UUID-shaped
opaque tenant. Each asserts selected IDs, produced archive IDs and every
remaining source ID, rather than a count-only receipt. The two new actual
command tests observe production repository INSERT inputs, then control only
the query transport's physical UUID read representation and replay through the
real repository/service. Both original and restarted controllers read both
spellings as protected; another UUID tenant remains excluded. Additional
command/replay controls preserve opaque tenant distinctions.

| Finding / required acceptance suffix (`evidence-retention_`)                                                                  | Source / changed symbols                                                                                                           | Before → fixed result                                                                                                                                                                                                                                 | Commands, exits, version and evidence                                                                                                                                                                                                                     | Unverified boundary                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C100-F1 UUID spelling; `legal-hold-exception-exact-archive-set-and-honest-SQL-result`                                         | `audit-log-retention-governance.sql` tenant gate; three new `archival.test.ts` matrices                                            | At `006ee586`, 3 failures: each actual shell exits 0 and selects/archives/removes 7 rows, including 3 protected IDs. Fixed: selects only 4 lawful rows and preserves all protected rows                                                               | Before: extracted actual shell command below, Vitest exit 1 (`before-extracted.log`, `before-trace.jsonl`). Fixed: root command exit 0 (`root.log`, `root-trace.jsonl`), 15/15 archival cases                                                             | SQLite evaluates the actual production SELECT over V0009 columns. PG casts/clock and the regex operator syntax are projected; regex uses Python `re` for this ASCII pattern. COPY/transaction/fault transport is controlled, not live PostgreSQL proof |
| UUID command acceptance / canonical projection readback; `four-governance-commands-canonical-ACK-and-rejected-state-readback` | `AuditNotificationService.getEvidenceSubjectGovernance`, `sameEvidenceTenant`; production controller and repository remain in path | Old production service: place/register succeed with uppercase tenant, but canonical lowercase controller readback incorrectly says false (2 failed tests). Fixed: both spellings protected before/after replay; opaque/cross-tenant controls retained | Old unchanged service bytes extracted from `006ee586`, loaded at the production module ID by local Vite config: command below, exit 1 (`governance-before-extracted.log`). Fixed root exit 0. Original eight ACK/rejection and concurrency tests retained | DB query transport only is controlled. A canonical physical UUID read is simulated; no PostgreSQL connection claim                                                                                                                                     |
| `authoritative-governance-unknown-empty-noDB-and-original-access-boundaries`                                                  | Existing failed-load, empty/noDB, recent-feed fallback, actor/reason/expiry/family/access tests and API callers                    | Root 44/44 and API 28/28 pass, including original C099 five/C100 four and the previous physical-tenant matrices                                                                                                                                       | Root/API commands below, exit 0 (`root.log`, `api.log`)                                                                                                                                                                                                   | Repository transport controlled; no live provider/export/download/access claim                                                                                                                                                                         |
| `actual-production-before-fixed-after-and-original-regressions`                                                               | Same final test fixtures; extracted original script and service without resetting worktree                                         | Initial old run: 5 failures (`before.log`). Extracted old runs independently reproduce 3 shell + 2 readback failures. Fixed full regressions pass                                                                                                     | Repair anchors `e77cee9a9` (reproduction) and `3f436528c` (repair), normally pushed; eslint, Prettier, `bash -n`, `git diff --check` exit 0 (`lint.log`, `static.log`). API typecheck result recorded below                                               | Anchors are not candidates. Prior broad check failures above remain historical evidence and do not count as a new pass                                                                                                                                 |
| `exact-candidate-review-CI-and-protected-merge`                                                                               | Final task-scoped commit, ordinary push and PR #2667                                                                               | New Codex2 exact-SHA review, mandatory same-candidate CI, protected merge and own-key acceptance pending                                                                                                                                              | Final SHA/branch and local/remote/PR head equality are recorded after the documentation commit in `.local/evidence-retention-20261015/uuid-tenant/candidate.json` and canonical handoff                                                                   | Neither previous candidate CI nor anchor CI supplies new-candidate acceptance; owner does not call `done`                                                                                                                                              |

Reproduction commands (from this task worktree):

```bash
# Extract old production bytes without moving or resetting the task branch.
git archive 006ee58627885141b97c872cdadce8c272e72f00 operations/database/audit-log-retention-archival.sh operations/database/db-common.sh operations/database/audit-log-retention-governance.sql apps/api/src/modules/audit-notification | tar -x -C .local/evidence-retention-20261015/uuid-tenant/reopened-source
RETENTION_SCRIPT="$PWD/.local/evidence-retention-20261015/uuid-tenant/reopened-source/operations/database/audit-log-retention-archival.sh" RETENTION_TRACE="$PWD/.local/evidence-retention-20261015/uuid-tenant/before-trace.jsonl" pnpm exec vitest run tests/unit/evidence-retention-legal-hold-canonical-flow-20261015/archival.test.ts -t 'UUID tenant'
pnpm exec vitest run --config .local/evidence-retention-20261015/uuid-tenant/vitest.before.config.ts tests/unit/evidence-retention-legal-hold-canonical-flow-20261015/governance.test.ts -t 'UUID tenant'
# Fixed full regressions (no original-source overrides).
RETENTION_TRACE="$PWD/.local/evidence-retention-20261015/uuid-tenant/root-trace.jsonl" pnpm exec vitest run tests/unit/evidence-retention-legal-hold-canonical-flow-20261015 tests/unit/audit-notification.test.ts tests/unit/system-remediation/sr-qa-reports-001/c099-evidence-governance-controlled-export.test.ts tests/unit/system-remediation/sr-qa-reports-001/c100-audit-immutability-retention-boundary.test.ts
pnpm --dir apps/api exec vitest run tests/unit/audit-notification.service.test.ts tests/unit/reporting-filing.service.test.ts tests/unit/regulatory-reporting.service.test.ts tests/unit/multi-taxi-controlled-export.test.ts tests/unit/evidence-governance.test.ts
```

The local before-service config loads the extracted unchanged service bytes at
its original module ID; existing relative imports still resolve from the
production path. Controller/repository code is unchanged from `006ee586` and
executes normally. This supplies a reproducible old-version comparison without
copying repaired business logic into a test double.

Diagnostic files and SHA-256 hashes are under this worktree's
`.local/evidence-retention-20261015/uuid-tenant/evidence-index.json`. All launched
checks finished and their results were read before handoff. No product, browser, preview or
DB server, cloud operation, deployment, live archive/delete or restore ran.
Source-only evidence does not close the live operational or full-goal boundary.

API TypeScript check for this revision: `pnpm --dir apps/api exec tsc -p tsconfig.json --noEmit`
exits 2 (`api-typecheck.log`), initially with missing worktree declarations and
stale shared dependency types. After successful task-worktree declaration builds
(`pnpm exec tsc -p packages/contracts/tsconfig.json` and
`pnpm exec tsc -p packages/control-plane-auth/tsconfig.json`, both exit 0), the
same API check exits 2 with exactly two TS2307 diagnostics for `nodemailer` and
`nodemailer/lib/smtp-transport` in `remote-smtp-mail.transport.ts:1/2`
(`api-typecheck-built.log`). No diagnostic targets this revision's production
service. No shared dependency files were changed. This remains a failed broad
check for the known missing dependency, not a full typecheck pass. Root broad
typecheck was not rerun; its earlier failures and limits remain above.

## Reopened C100-F1: audit subject/source UUID representation (2026-10-15)

Codex2 reopened exact candidate `a22dd45dfda1af34176a973e8f3cd7281450c6d3`
at `2026-10-15T13:37:36Z`. This trigger is distinct from the preceding tenant
findings: the production place/register handlers accept uppercase UUID subjects
and audit-source references unchanged, but the archival SELECT compared them
case-sensitively against physical `audit_id::text`. The actual controller subject
projection likewise returned false for the lowercase spelling. Both preceding
physical-tenant and UUID-tenant matrices remain in the full passing run below.

Formal V0009 defines `admin.audit_logs.audit_id uuid`, while `resource_id` is
opaque text and governance payloads reside in JSONB `new_value`. The actual
controller → service → `AuditLogRepository.append` chain trims subject/source
inputs and preserves their spelling in the acknowledged JSON payload. Therefore
existing persisted uppercase payloads must be supported without rewriting them.
The latest complete reviewer repro and repair boundary are preserved by this
section and the original task's reopen history.

Repair scope:

- SQL now folds the protection reference only in the two comparisons to the
  physical audit UUID: `family = audit_log` subject and deletion-exception
  `sourceResourceType = audit_log` source. Equality with canonical physical UUID
  text constrains the match to that UUID; opaque resource comparisons remain
  exact. No write normalization or payload rewrite is required.
- `sameEvidenceSubject` gives UUID subjects of `audit_log` canonical case
  equality in subject readback and duplicate checks, including persisted replay.
  Its UUID syntax accepts all version nibbles because the formal UUID column
  does not impose the tenant repository's version-1–5 normalization rule.
  Opaque subjects and all other families retain exact case-sensitive equality.
  The tenant helper, physical tenant precedence and NULL fallback are unchanged.
- ACK staging, authority failure/unknown behavior, release/resolution/expiry,
  manifest matching, retention periods, archive verification/exact IDs,
  fail-on-error, privileged-role/session-flag and V0080 rails remain intact.

Reproduction anchor: `2381e067e` (new tests, unchanged production code).
Repair/check version: `be84449ce` (service, SQL and source-command regression).
The final immutable candidate is the subsequent documentation closeout head;
its full SHA/branch and local/remote/PR equality are recorded in this worktree's
`.local/evidence-retention-20261015/uuid-reference/candidate.json` and canonical
handoff for PR [#2667](https://github.com/ajoe734/drts-fleet-platform/pull/2667).
Anchors are not review candidates.

| Finding / required acceptance suffix (`evidence-retention_`)                                        | Actual source / repair                                                                                                                                | Before → fixed result                                                                                                                                                                                                                                                                                             | Commands, exits and evidence                                                                                                                                                                                                            | Limits / pending work                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C100-F1 audit UUID subject/source; `legal-hold-exception-exact-archive-set-and-honest-SQL-result`   | SQL physical audit UUID subject/source comparisons; six actual-shell matrices in `archival.test.ts`                                                   | Old uppercase hold, exception-subject and audit-source each exit 0, select/archive/delete both protected UUIDs; lowercase controls preserve them. Fixed both spellings retain both UUIDs and select/archive only the four lawful IDs                                                                              | Extracted old command below: Vitest exit 1, 3 shell failures; `before-extracted-trace.jsonl`. Fixed root exit 0, 21/21 archival tests; `root-trace.jsonl` records actual SQL, exits, stdout/stderr, selected, archive and remaining IDs | Actual SELECT uses documented SQLite dialect projection over V0009 columns; casts/clock projected and COPY/transaction/client transport controlled. No live PG/parser/lock/role/delete/restore claim                                        |
| UUID subject command/readback; `four-governance-commands-canonical-ACK-and-rejected-state-readback` | `sameEvidenceSubject`, place/register duplicate checks, `getEvidenceSubjectGovernance`; real controller/repository ACK + restart tests                | Old place/register accept v4/v7 uppercase UUIDs but canonical lowercase readback is false (4 failures). Fixed both spellings protected before/after replay and duplicate rejected. Opaque and other-family controls remain distinct. Actual audit-source register ACK and persisted replay preserve its reference | Extracted old service at original module ID: exit 1 with 4 handler failures. Fixed root exit 0. Original deferred/rejected four-command and concurrency cases retained                                                                  | Only DB query transport controlled; no socket. Production handlers, repository serialization and replay are exercised                                                                                                                       |
| `authoritative-governance-unknown-empty-noDB-and-original-access-boundaries`                        | Existing failed-load/recovery, ordinary-feed fallback, empty/noDB, role/reason/expiry, tenant/manifest/family/access tests and impacted API consumers | Root 63/63 and API 28/28 pass, retaining original C099 five/C100 four and both prior tenant repair matrices                                                                                                                                                                                                       | Full commands below; `root.log`, `api.log`, both exit 0                                                                                                                                                                                 | Source-only coverage, no new live access/export/download credit                                                                                                                                                                             |
| `actual-production-before-fixed-after-and-original-regressions`                                     | Same final fixtures, actual old production service/script extracted without resetting branch                                                          | Initial unchanged-code run: 7 failed / 12 passed / 29 unselected. Independent extracted run: same 7 failed / 13 passed / 29 unselected (adds audit-source ACK control). Fixed full regressions green                                                                                                              | `before.log`, `before-extracted-rerun.log`, `root.log`, `api.log`; scoped eslint, Prettier, `bash -n`, diff check exit 0. API broad typecheck after declaration builds exits 0                                                          | Initial extracted config used a wrong relative import (`before-extracted.log`); startup error is excluded from reproduction credit. Initial API broad check had 306 stale dependency declaration diagnostics; not a product failure or pass |
| `exact-candidate-review-CI-and-protected-merge`                                                     | Final closeout commit, plain push, exact PR/local/remote identity and owner handoff                                                                   | Pending new Codex2 exact-SHA review, mandatory same-candidate CI, protected merge and own-key acceptance                                                                                                                                                                                                          | Final identity in `uuid-reference/candidate.json` and canonical handoff                                                                                                                                                                 | Prior candidate/anchor CI gives no new-candidate credit; owner does not call done                                                                                                                                                           |

New fixture boundaries include valid v4/v7 physical audit UUIDs, both spellings,
other audit UUIDs, true cross-tenant exclusions, exact/different-case opaque
subjects/resources and UUID-looking opaque IDs in `report_artifact`. The six
shell cases assert exact selected/archive/source IDs, not just receipt counts.
In old uppercase traces the target `abcdefab-cdef-4abc-8abc-abcdefabcdef` is
selected, archived and absent from source; all six fixed traces retain it. The
second protected UUID differs only in its version nibble (`7abc`). Real
place/register commands also prove stored uppercase payloads replay unchanged;
the actual audit-source command test observes its ACK payload and restart list.

Reproducible commands from the assigned task worktree:

```bash
# Unchanged production bytes, without moving/resetting the active branch.
git archive a22dd45dfda1af34176a973e8f3cd7281450c6d3 operations/database/audit-log-retention-archival.sh operations/database/db-common.sh operations/database/audit-log-retention-governance.sql apps/api/src/modules/audit-notification/audit-notification.service.ts | tar -x -C .local/evidence-retention-20261015/uuid-reference/reopened-source
RETENTION_SCRIPT="$PWD/.local/evidence-retention-20261015/uuid-reference/reopened-source/operations/database/audit-log-retention-archival.sh" RETENTION_TRACE="$PWD/.local/evidence-retention-20261015/uuid-reference/before-extracted-trace.jsonl" pnpm exec vitest run --config .local/evidence-retention-20261015/uuid-reference/vitest.before.config.ts tests/unit/evidence-retention-legal-hold-canonical-flow-20261015 -t 'UUID subject identity|UUID audit reference|accepts audit-source'
# Fixed full checks, no old-source overrides.
RETENTION_TRACE="$PWD/.local/evidence-retention-20261015/uuid-reference/root-trace.jsonl" pnpm exec vitest run tests/unit/evidence-retention-legal-hold-canonical-flow-20261015 tests/unit/audit-notification.test.ts tests/unit/system-remediation/sr-qa-reports-001/c099-evidence-governance-controlled-export.test.ts tests/unit/system-remediation/sr-qa-reports-001/c100-audit-immutability-retention-boundary.test.ts
pnpm --dir apps/api exec vitest run tests/unit/audit-notification.service.test.ts tests/unit/reporting-filing.service.test.ts tests/unit/regulatory-reporting.service.test.ts tests/unit/multi-taxi-controlled-export.test.ts tests/unit/evidence-governance.test.ts
pnpm exec tsc -p packages/contracts/tsconfig.json
pnpm exec tsc -p packages/control-plane-auth/tsconfig.json
pnpm --dir apps/api exec tsc -p tsconfig.json --noEmit
```

The local before-service Vite config loads unchanged extracted service bytes at
its original production module ID, preserving relative imports and the actual
controller/repository. No repaired business logic is copied into a test double.
Both task-worktree declaration builds and the subsequent API broad typecheck
finished with exit 0 (`contracts-build.log`, `auth-build.log`,
`api-typecheck-built.log`). Initial API typecheck exit 2 (`api-typecheck.log`)
used stale shared declaration output; it is superseded for this revision by the
successful post-build check. Root broad typecheck was not rerun; its previous
failures remain historical limits above.

All checks launched for this revision finished and their results were read.
New diagnostics, before-service config, extracted source hashes and command
exits are indexed under this worktree's
`.local/evidence-retention-20261015/uuid-reference/evidence-index.json`.
No product/preview/browser/DB server, deployment, cloud operation, live
archive/delete or restore ran. The original Source-only and lifecycle boundaries
remain in force.

## F-CI-01: published commit subject blocks required CI (2026-10-15)

Codex2 reopened immutable candidate
`ac3d5f69c6a600fcf92b71ec7e08a360fe45ca0f` at 13:48:06Z. This is a new
commit-policy trigger, distinct from the prior tenant and audit UUID findings.
Production `.github/workflows/ci.yml` invokes
`tools/ci/git/check_commit_trailers.py --base origin/dev --head HEAD` over every
non-merge ancestor in the PR range. `SUBJECT_RE` / `validate_message` reject the
candidate subject `fix(audit): preserve legal protection across audit UUID spelling`.
The required Task-ID trailers are present; the lowercase subject scope is the
failure. No additional functional change was requested by this review.

| Finding / acceptance                                                                            | Production basis                                                                     | Before / current result                                        | Command / evidence / exit                                                                                                                                                 | Remaining boundary                                                                                    |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| F-CI-01: required commit gate                                                                   | CI `Commit trailers`; validator `SUBJECT_RE`, `validate_message`, `commits_in_range` | Published candidate fails; no replacement candidate claimed    | [Hosted completed job](https://github.com/ajoe734/drts-fleet-platform/actions/runs/38745101915/job/116456894007), exit 1; owner downloaded and read the matching full log | A correctly titled descendant still retains the failing ancestor                                      |
| F-CI-01 minimal reproduction                                                                    | Actual checked-in validator                                                          | Same sole offending SHA `ac3d5f69c6a6`                         | `python3 tools/ci/git/check_commit_trailers.py --base ac3d5f69^ --head ac3d5f69`, exit 1                                                                                  | No CI bypass, workflow edit or subject-rule weakening                                                 |
| `evidence-retention_four-governance-commands-canonical-ACK-and-rejected-state-readback`         | Previous command/repository repairs and matrices above                               | Codex2 retained scoped Source credit at the failed candidate   | Review reports root 63/63 and API 28/28, exit 0; retained prior before/fixed evidence                                                                                     | New candidate must receive fresh exact-SHA review; no live DB credit                                  |
| `evidence-retention_authoritative-governance-unknown-empty-noDB-and-original-access-boundaries` | Availability/read-consumer and original boundary regressions above                   | Same retained Source credit                                    | Same completed reviewer checks; no new functional checks run for this documentation-only checkpoint                                                                       | No new full-capability or external acceptance                                                         |
| `evidence-retention_legal-hold-exception-exact-archive-set-and-honest-SQL-result`               | Actual shell/selection and controlled psql matrices above                            | Same retained Source credit                                    | Reviewer bash syntax / scoped lint / diff checks exit 0; shell cases are included in root 63/63                                                                           | SQLite projection and controlled COPY/transaction remain non-live-PG proof                            |
| `evidence-retention_actual-production-before-fixed-after-and-original-regressions`              | Prior before/fixed evidence and C099 five / C100 four                                | Same retained Source credit                                    | Prior root 63/63 and API 28/28 checks completed; no substituted mirror tests                                                                                              | No servers, archive/delete, restore or provider work                                                  |
| `evidence-retention_exact-candidate-review-CI-and-protected-merge`                              | Same-candidate lifecycle and protected branch policy                                 | Unsatisfied: reviewer REOPEN; mandatory Commit trailers failed | Exact candidate and PR #2667 head confirmed before this evidence checkpoint                                                                                               | Replacement immutable candidate, review, mandatory CI, protected merge and own-key acceptance pending |

### Prepared recovery and routing boundary

Owner fetched `origin/dev` at
`9b343586196bfa963d170d3d5a9683b012398111` and confirmed no change in the 11 task
paths relative to accepted source `2c36cad43376f848bd2a7edc06e27369c060c819`.
The complete binary-capable source diff from that accepted source to the failed
candidate was applied using `git read-tree`, a separate `GIT_INDEX_FILE`, and
`git apply --cached --3way`. Application exited 0; `git diff --exit-code` between
the reconstructed tree and failed candidate over all 11 task paths exited 0.
Reconstructed tree: `5a3837cf6e0a187afb9102b25f0a021fd1bbd770`.
This establishes a conflict-free recovery input; it is not a commit, candidate,
new review or CI pass. The active index and working files were not reset.

Local evidence in the assigned worker cwd:
`.local/evidence-retention-20261015/f-ci-01-recovery/` contains
`hosted-trailers.log`, `local-trailers.log`, `pr-snapshot.json`,
`task-source.patch`, `apply-check.log`, and `recovery-index.json`.
Patch SHA256:
`367206b12c9fa1a2ec438e279c6eb5156d8061f7ec4d00b39185eeaad556dd70`.
The patch snapshots the original candidate and predates this documentation
appendix; recovery must also retain this appendix. Earlier worker-local
`ci-trailers-20261015T1347Z` diagnostics were absent in this dispatch; the logs
listed here were freshly captured rather than assumed to exist.

Resolution is pending Supervisor branch/workspace routing: this dispatch fixes
owner to `codex/evidence-retention-legal-hold-canonical-flow-20261015` and the
assigned cwd. A new compliant descendant on that branch cannot remove F-CI-01.
Supervisor must assign a replacement branch while preserving the existing
published branch/PR history. Owner can then apply the task diff plus this UAT
appendix on the accepted dev base, commit with subject
`EVIDENCE-RETENTION-LEGAL-HOLD-CANONICAL-FLOW-20261015: recover compliant candidate`,
run the complete applicable checks including the full PR-range commit gate,
push normally, create the replacement PR and hand off its immutable SHA to
Codex2. No amend, rebase, reset, force-push, prior-ref deletion or CI bypass is
part of this recovery. This evidence-only checkpoint on the assigned branch is
not a replacement review candidate and does not satisfy the failed gate.
