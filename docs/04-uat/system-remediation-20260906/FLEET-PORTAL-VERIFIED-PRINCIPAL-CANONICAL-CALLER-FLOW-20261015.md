# Fleet portal verified principal and canonical caller flow

Task: `FLEET-PORTAL-VERIFIED-PRINCIPAL-CANONICAL-CALLER-FLOW-20261015`  
Current owner: Codex2 · Independent reviewer: Codex
Status: **Full original Source continuation; see the 2026-10-19 closeout below.**

Earlier sections preserve the original partial checkpoint and its unresolved
findings as historical evidence; they do not describe the current routing or
fixed caller behavior.

Base: `6dfff99fcc8f54d10fc18c1f19c5bcfabeb57add`. Tested source checkpoint:
`5e87cf5dd0eb0d7fb7f92708eb14d33c0d084053`. Branch:
`codex/fleet-portal-verified-principal-canonical-caller-flow-20261015`.
Later documentation commits do not replace that tested source identity.

## Source changes and authority

- `lib/fleet-principal.server.ts::resolveFleetPrincipal` forwards the existing
  `x-drts-authorization`/Authorization bearer or existing application session
  cookie to the real `/api/auth/session`. Only the backend-verified active
  partner principal with `billing:read`, actorId and canonical partnerId can
  bind the requested/configured single-fleet selector. Both selector sources
  are checked independently; neither creates authority. No JWT claim decoding,
  email-to-role mapping, new issuer or Academy tenant-to-partner conversion.
- `lib/api-client.server.ts::FleetPortalApiClient` inherits the existing SDK's
  endpoint/list methods while dispatching through an app-local no-store
  transport. It avoids the legacy factory's generated `x-realm`; JSON success
  wire normalization matches the SDK and error business metadata stays intact.
  Endpoint options cannot replace the verified bearer or fleet. Invocation
  proof is separately minted into `x-serverless-authorization`.
- `app/control-plane-proxy/[...path]/route.ts::forward` shares the session
  authority, strips browser identity headers, rejects mismatched selectors and
  cross-origin requests, preserves raw request bytes, response streaming,
  status, content headers and upstream error bodies. It does not create a
  bootstrap identity. Invocation/session failures have explicit error codes.
- `FleetPartnerController` Supply create/update/submit/withdraw/document,
  statement decisions, case reply and attachment attribution use
  `CurrentIdentity.actorId`. The old second actor argument remains undecorated
  solely for direct TypeScript caller compatibility; HTTP cannot populate it.
  There is no header/fallback attribution. Existing documentPartner checks
  bind writes to canonical partnerId. Platform/ops reviewer methods and Supply
  transaction/revision/maker-checker logic are unchanged.

The backend guard and original route policy remain authoritative for required
capabilities on every API request, including revocation after client creation.
No roles/scopes or new authentication policies are granted by this change.

## Findings and required acceptance

| Finding / acceptance key                                                                                 | Production basis / change                                                                                   | Before → after                                                                                                                                                                                                                                           | Evidence                                                                                                                                          | Remaining limitation                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1 generated bootstrap identity / `fleet-portal_existing-verified-principal-and-canonical-fleet-binding` | Actual server client, proxy, `/api/auth/session`, BootstrapAuthGuard, JwtAuthService and IdentityRepository | Immutable base fails lawful mounted bearer and missing-principal cases; fixed source forwards real bearer and rejects missing/expired/revoked/wrong realm/scope/binding/fleet                                                                            | `principal.test.ts`, `mounted-flow.test.ts`; before replay 5 failed / 1 legacy trap passed; current task suite 32 passed                          | Target deployment's lawful partner credential/issuer binding has not been supplied or demonstrated; no live end-to-end claim                                                                      |
| F2 header/fallback command actor / `fleet-portal_strict-transport-and-actual-command-actor`              | Actual controller CurrentIdentity decorator and real Supply/Case services                                   | Base direct controller passes spoofed actor; fixed command/receipt/document/readback actor equals verified principal                                                                                                                                     | Same immutable before replay; actual Nest route/argument metadata dispatcher; original controller scenarios 10 passed within task suite           | Existing direct-caller fixture expectations need the exact adaptations below; platform reviewer identity is preserved                                                                             |
| F3 original mounted flows / `fleet-portal_original-mounted-flow-and-denial-regressions`                  | Actual SDK endpoint methods → local proxy → real guard/controller → real Supply/document/Case service       | Server/proxy dashboard and real lists agree; true empty Supply list and real 404/error remain honest; driver/vehicle draft/update/document request→content→confirm→submit→withdraw and byte download succeed; case receipt/timeline carry verified actor | `mounted-flow.test.ts`; SDK list casing, no-store, independent IAM proof, streamed 206 bytes/disposition, 409 details and late revocation covered | **Incomplete:** existing cookie-based browser mutation callers omit the original CSRF header; real middleware rejects them before proxy. Actual form submission through middleware is not claimed |
| F4 exact validation / `fleet-portal_exact-candidate-validation`                                          | Same immutable source loaded by Vite pre-load plugin; no active-tree reset                                  | 5 meaningful old-source failures → 6 principal tests pass; full task suite 32 passed                                                                                                                                                                     | Commands below and local logs                                                                                                                     | Retained suites have two stale assertions plus two suite-load errors; exact scope coordination pending. Independent review, mandatory CI/protected merge and acceptance have not run              |

## Reproducible checks

All commands run in the assigned isolated worktree, Node 22.23.2,
Vitest 4.1.4. No server, browser/E2E server, Docker or deployment was started.
Machine-specific logs are under `.local/fleet-portal-principal/` in this worker.

| Command                                                                                                                                                                                                                 | Exit / result                                                                                                                                                               | Log                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `pnpm exec vitest run -c tests/unit/fleet-portal-verified-principal-canonical-caller-flow-20261015/before.vitest.config.ts tests/unit/fleet-portal-verified-principal-canonical-caller-flow-20261015/principal.test.ts` | 1, expected defect reproduction: 5 failed / 1 legacy SDK trap passed; immutable base `6dfff99…` production client/proxy/controller loaded with `git show`                   | `before-final.log`           |
| `pnpm exec vitest run -c tests/unit/fleet-portal-verified-principal-canonical-caller-flow-20261015/vitest.config.ts`                                                                                                    | 0, 4 files / 32 tests passed; includes 10 original controller tests and 2 explicit CSRF boundary tests, which do not claim browser integration                              | `after-final.log`            |
| `pnpm exec tsc -p tests/unit/fleet-portal-verified-principal-canonical-caller-flow-20261015/tsconfig.json --noEmit`                                                                                                     | 0, source-mapped task types                                                                                                                                                 | `scoped-typecheck-final.log` |
| ESLint `--max-warnings=0` on all changed TS source/controller tests and the task test directory                                                                                                                         | 0                                                                                                                                                                           | `lint-final.log`             |
| `pnpm --filter @drts/fleet-partner-portal-web typecheck`                                                                                                                                                                | 0, Next route typegen plus TypeScript; generated next-env change restored                                                                                                   | `portal-typecheck.log`       |
| `pnpm exec vitest run` with retained filter/paging, overview, statement, document, form, case and training paths listed in local command evidence                                                                       | 1: 14 files passed / 3 failed; 216 tests passed / 2 failed, plus one suite-load error                                                                                       | `retained-regressions.log`   |
| `pnpm exec vitest run -c tests/unit/fleet-portal-verified-principal-canonical-caller-flow-20261015/retained.vitest.config.ts`                                                                                           | 1: 32 passed / 2 failed, two suite-load errors, all four stale leaves identified below                                                                                      | `stale-retained.log`         |
| `pnpm exec tsc -p tsconfig.json --noEmit`                                                                                                                                                                               | 2, repository root resolves shared canonical node_modules and stale aliases; missing tenant-auth/passenger-client and cross-tree ApiClient types. This is not a scoped pass | `root-typecheck.log`         |

Initial API typecheck resolved stale/missing local contracts output and failed.
Building the existing contracts package succeeded and removed those diagnostics;
control-plane-auth was then built to resolve its stale declaration output.
The final API typecheck result is recorded in the closeout update below. A
failed attempted Vitest `--include` invocation was a CLI option error, not a
product regression; the retained config above is the corrected executed probe.

## Resumed dispatch: actual caller reproduction (2026-10-15 18:12 UTC)

At source checkpoint `5e87cf5dd0eb0d7fb7f92708eb14d33c0d084053`, the new
`caller-boundaries.test.ts` imports the actual React driver/vehicle create
forms, `CaseReplyComposer`, document request/upload helpers and middleware.
It submits the real form handlers and the editable reply button, then runs
their emitted request headers through the unchanged middleware with the
existing session/CSRF cookies. Navigation and the browser fetch/cookie
boundary are adapted; UI components, enabled/disabled controls, request
construction and middleware are not mocked. The document probe invokes the
actual request/content/confirm helpers; its later steps are independent
probes of each entry, not a claim that a rejected upload proceeds to confirm.

All four reproduction tests confirm the unresolved caller defect: no CSRF
header is sent, middleware returns 403 before proxy/backend invocation, and
form/reply navigation does not report success. These four **negative defect
reproductions are not fixed-after or successful browser acceptance**. Once
the three caller leaves receive scope coordination, update these assertions
to require the existing CSRF header and successful middleware→proxy flow.
The two existing explicit middleware contract probes remain intact.

| Finding / acceptance                                             | Source evidence                                                                                                                                             | This dispatch result                                                                                                     | Unresolved repair boundary                                     |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| F3 / `fleet-portal_original-mounted-flow-and-denial-regressions` | Actual NewDriverSubmissionForm / NewVehicleSubmissionForm → apiRequest; CaseReplyComposer.handleSubmit; fleetDocumentRequest / putFleetDocument; middleware | Four socket-free caller defect reproductions pass by observing the actual 403. No fixed-after claim.                     | Scope leaves 1–3 below; retain middleware and backend guards.  |
| F1/F2/F4 / all other required keys                               | Actual production server/proxy/controller/guard/session tests at the source checkpoint above                                                                | Original 32 tests still pass; immutable-base replay still has five meaningful failures and one legacy-factory trap pass. | Scope leaves 4–7 below; no candidate handoff while unresolved. |

Fresh commands and completed results, Node `v22.23.2`, Vitest `4.1.4`:

| Command                                                                                                                                                                                                                 | Exit / result                                                                                                                                                       | Local evidence                  |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `pnpm exec vitest run -c tests/unit/fleet-portal-verified-principal-canonical-caller-flow-20261015/vitest.config.ts`                                                                                                    | 0; 5 files, 36 passed, including the four unresolved-caller rejection reproductions                                                                                 | `resume-caller-tests-final.log` |
| `pnpm exec tsc -p tests/unit/fleet-portal-verified-principal-canonical-caller-flow-20261015/tsconfig.json --noEmit`                                                                                                     | 0; scoped paths include the actual Fleet UI imports                                                                                                                 | `resume-caller-types-final.log` |
| `pnpm exec eslint tests/unit/fleet-portal-verified-principal-canonical-caller-flow-20261015 --max-warnings=0`                                                                                                           | 0                                                                                                                                                                   | `resume-lint.log`               |
| `pnpm exec vitest run -c tests/unit/fleet-portal-verified-principal-canonical-caller-flow-20261015/before.vitest.config.ts tests/unit/fleet-portal-verified-principal-canonical-caller-flow-20261015/principal.test.ts` | 1, expected original defects: 5 failed / 1 passed against immutable base `6dfff99fcc8f54d10fc18c1f19c5bcfabeb57add`                                                 | `resume-before.log`             |
| `pnpm exec vitest run -c tests/unit/fleet-portal-verified-principal-canonical-caller-flow-20261015/retained.vitest.config.ts`                                                                                           | 1; 32 passed / 2 assertion failures, plus 2 suite-load errors. Same four test leaves 4–7 below.                                                                     | `resume-retained.log`           |
| `pnpm --filter @drts/api typecheck`                                                                                                                                                                                     | 2; 310 diagnostics, including stale contract types (`ops_observer`, `mail_delivery`, driver invitation binding) and missing control-plane-auth exports. Not a pass. | `resume-api-typecheck.log`      |

Logs for this resumed dispatch are under this assigned worker's
`.local/fleet-portal-principal/`. The historical log names in the earlier table
were not available in this dispatch, so the fresh results above are the
inspectable evidence for this checkpoint. Initial new UI typecheck lacked the
Fleet alias; adding it to the owned task tsconfig produced the final exit 0.
The first caller run also had two probe-only alert expectations fail; those
were replaced with completed-form/no-navigation assertions, and the full
suite was rerun to the final result above.

The API package's `node_modules/@drts/contracts` and
`node_modules/@drts/control-plane-auth` symlinks resolve to canonical-root
packages outside this isolated worktree. Their declaration output does not
match this task's checked-out source; rebuilding task-local outputs would
not change those resolved paths. This explains the observed resolution
boundary, not an API typecheck pass or authorization to edit canonical-root
source. The source-mapped task typecheck above passes independently.

The branch was fetched and has no existing PR at this dispatch. The previous
published anchor was `38a25260e77ad051c4f9e6b3490c82afc6d1690e`; preserve its
history. The new source checkpoint is an anchor, not a review candidate.
Supervisor coordination is required by `AI_COLLABORATION_GUIDE.md` §0.7 for
the exact seven additional leaves below; the current task scopes still do
not authorize those edits. No human permission, new issuer, scope grant,
middleware relaxation or provider/VM action is requested.

The release CLI rejected `blocker <task> <reason> Supervisor` with
`Unknown agent: Supervisor`; it did not change task state. Scope coordination
is therefore recorded using the authorized owner `progress` command, keeping
the task `in_progress` with this concrete blocker in its machine-truth summary.
No alternative agent identity or direct status-file edit is used.

### Next owner dispatch: scope unchanged; supported blocker route

The next dispatch rechecked the task slice: all seven requested additional
leaves below remain outside `write_scopes`. Reading the actual three mutation
callers and middleware confirms the same omission; no product source changed.
`git ls-remote` confirms published head
`587d88ec7a0149239c8c36b061d47086ac09bb89` equals the starting local head;
`gh pr list --head codex/fleet-portal-verified-principal-canonical-caller-flow-20261015`
returns no PR. No candidate is locked.

Inspection of the dispatch's release `control_plane/usecases/task_board_commands.py`
shows `_guard_worker_command` explicitly permits `system-block` for the assigned
task and `_record_worker_outcome` records it as `blocked`.
`bin/ai_status.py::command_system_block` needs no `waiting-for` agent. Use that
supported release command with `AI_NAME=Codex` and this evidence reference to
record the scope blocker, rather than retrying the rejected `Supervisor` agent
argument or changing identity/control-plane files. Supervisor must check exact
writer conflicts and extend the original task scopes before these repairs.

This dispatch performs source/status/publication checks only. It does not rerun
unchanged tests or replace the previous completed results above. In particular,
the four passing 403 reproductions remain unresolved defects, not fixed flows.
The next repair unit remains the three caller CSRF fixes followed by the four
existing test adaptations and actual fixed-after regression verification.

## Exact remaining repair boundary (Supervisor scope coordination)

Current assigned write scopes are the original seven leaves/directories. No
out-of-scope file has been changed. The following exact additional leaves need
ordinary Supervisor conflict/scope coordination, not a new product policy:

1. `apps/fleet-partner-portal-web/components/fleet-supply-workspace.tsx::apiRequest`
   sends JSON mutations without `x-csrf-token`.
2. `apps/fleet-partner-portal-web/app/cases/[caseId]/case-reply-composer.tsx::handleSubmit`
   sends the case reply without that header.
3. `apps/fleet-partner-portal-web/lib/fleet-document-upload.ts::fleetDocumentRequest/putFleetDocument`
   likewise omits the header for request/content/confirm mutations.
   Existing middleware checks `drts_session` plus `drts_csrf` cookie equality
   against `x-csrf-token`. `known-boundaries.test.ts` imports that actual
   middleware and proves omission → 403, correct header → next. Repair the
   callers using the existing cookie/header contract; do not relax middleware.
4. `apps/fleet-partner-portal-web/lib/api-client.server.test.ts` still expects
   unauthenticated environment/header selectors to create an authorized client;
   it also lacks a server-only boundary mock in this test environment.
5. `tests/unit/fleet-document-proxy.test.ts` still expects synthetic
   `x-partner-id` with no end-user credential; its new server-only import also
   needs the normal test boundary mock.
6. `tests/unit/system-remediation/sr-fleet-case-001/sr-fleet-case-001.test.ts`
   passes a verified fixture actor `owner`, yet expects untrusted header actor
   `陳家豪`. Preserve that expected historical scenario by explicitly giving
   its verified fixture the intended actor; do not restore header authority.
7. `tests/unit/fleet-training-authorized-caller-20261015/fleet-training-authorized-caller.test.ts`
   case 1.1 uses the mounted general client without any principal to reproduce
   the historical billing-only training failure. Retain that original narrow
   historical proof via an explicit legacy test client, and keep the other
   Academy tenant/ops tests intact; do not promote Academy identities.

Source checkpoint and all fixes remain on the published task branch. No
handoff/candidate is locked while these internal repairs remain unresolved.

## Credit and unexecuted evidence

Preserve the original adopted audit
`C063-C067-current-accepted-fleet-supply-cases-readonly-audit.json` and its
immutable original requirements/credits (audit base `431966bdf…`, task base
`6dfff99fc…`). Existing KPI/date/filter/paging/CSV, Academy Training, statement,
case, storage/scanning/bytes/revision and reviewer/registry credits are not
withdrawn by this narrow change. The 216 retained passing tests are additional
bounded regression evidence, not a replacement for their original acceptance.

The socket-free dispatcher replaces only HTTP/network transport and provider
boundaries. It discovers real Nest route/argument decorators, executes the real
guard/session contract and controller, and uses the production services and
existing in-memory repositories. The existing storage/scanner fixture replaces
artifact persistence and cloud scanner HTTP/identity; it still exercises real
byte hashing, scanner correlation and document state. No fixture list is
returned in place of dashboard/list service logic. This is Source/controlled
credit, not real PostgreSQL, provider storage/scanner or deployed-browser proof.

Ordinary CRM ACK persistence remains owned by
`COMPLAINT-CANONICAL-LIFECYCLE-AND-ACK-20261015`. The case test verifies the
existing service's request/actor/local readback only. No CRM persistence fix,
true container/provider/storage/device acceptance, protected merge, dev deploy,
whole C063-C067 or full-goal completion is claimed. Missing target authority is
reported separately by `FLEET_PRINCIPAL_REQUIRED`,
`FLEET_PARTNER_AUTHORITY_REQUIRED` or `FLEET_PARTNER_BINDING_REQUIRED`; it is not
used to label the remaining CSRF/caller fixes external-only.

## Full original continuation, 2026-10-19

The Supervisor preserved the original task, four complete clauses/four keys
and expanded exact fourteen scopes, then transferred the prepared worktree to
Codex2 with Codex as independent reviewer. Original spec SHA256:
`923a62dce49886d568980039c84dea11248b8e57df1bd23b0586d51b2a84b4fc`.
The four original dependencies are DONE, including accepted Complaint
`e4d962152e6b51ef72c2b5469d5e6dbdb38f347c`.
Prepared baseline `8995f5bf2c18750747a411481acaa9ab611a54c6` preserves
published `87573ac0729c4dc19aeebd19b8f77392e297e44c` and ordinarily merges that
accepted dev. No prior published commit was amended or replaced.

All machine-specific receipts and logs for this continuation are under:
`.local/goal-continuation-20261019T0200Z-accepted61fa7-full-CI-and-native-continuation-root/fleet-portal-original-functional-evidence/`.
The final immutable commit, branch, PR and handoff generation are in its
`delivery-result.json` and normal handoff receipt; this document does not
pretend its own commit can contain its eventual hash.

### Actual repair and original full requirements

`fleetMutationHeaders` in the already owned document helper reads the existing
browser `drts_csrf` cookie when sending a mutation. Supply `apiRequest`, case
`handleSubmit`, document request/confirm and raw PUT content now use that same
existing cookie/header contract. Read requests and original file bytes, MIME,
scan, checksum, revision, idempotency, canonical IDs, business commands and
confirmation ordering are retained. Missing cookies still fail the unchanged
middleware. The middleware, guards, backend route policies, identity issuer,
shared SDK, reviewer identity and other product surfaces were not changed.

| Original key                                                           | Actual production chain and fixed result                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Evidence and limits                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fleet-portal_existing-verified-principal-and-canonical-fleet-binding` | Retained `resolveFleetPrincipal` calls `/api/auth/session` with the existing application bearer. Actual signed-session/guard tests require the original partner realm, billing scope, active actor and canonical partnerId; configured/requested selectors must both match. Missing/expired/revoked/wrong-realm/wrong-scope/missing-binding/cross-fleet sessions reject.                                                                                                                     | `principal.test.ts`, `mounted-flow.test.ts`, server selector unit regressions. No email/env/IAM proof becomes authority, no Academy identity promotion. Lawful target issuer/credential delivery is still unavailable; test sessions are controlled, not a live provider claim.                                                                                                                |
| `fleet-portal_strict-transport-and-actual-command-actor`               | Original app-local `ApiClient` and proxy carry real application bearer separately from invocation proof, strip bootstrap/browser actor hints and preserve no-store/same-origin/error details/streamed 206 content. Actual Nest metadata dispatch executes `CurrentIdentity`, guard and real Supply/Case command services; actor/readback equals the verified principal. Existing platform reviewer and maker/checker paths stay intact.                                                      | Original principal replay at `6dfff99fcc8f54d10fc18c1f19c5bcfabeb57add`: 5 FAIL / 1 legacy-factory trap PASS; fixed six principal tests PASS within final suite. Invocation token is a controlled metadata seam, not real IAM.                                                                                                                                                                 |
| `fleet-portal_original-mounted-flow-and-denial-regressions`            | Real SDK dashboard/drivers/vehicles agree with real service data, true empty/error states stay honest. Actual React driver/vehicle creation passes middleware→proxy→signed-session→guard→Controller→real draft service and navigates to the returned same ID. Real document request→PUT bytes/scan→confirm uses that submission, then actual detail-view submit/withdraw handlers read back its state. Actual editable case composer writes the verified actor and same-case local timeline. | Immutable baseline8995 with the final caller regressions: 4 FAIL / 1 missing-CSRF denial PASS. Fixed caller tests: 5 PASS, included in final 263. Existing byte/scan/storage/revision, filter/paging/CSV/KPI/date, Training, statement and case suites also pass. Storage/scanner/HTTP are explicit socket-free fixtures; CRM noDB local readback does not claim hosted PostgreSQL durability. |
| `fleet-portal_exact-candidate-validation`                              | Existing producer modules execute directly. Shared test adapter discovers actual Nest routes/arguments and invokes actual guard, session, controllers and services; it does not mock commands or return fake dashboard lists. Original direct-controller and retained actor assertions are preserved.                                                                                                                                                                                        | Final combined suite 26 files / 263 PASS / 0 FAIL / 0 SKIP. Final source-mapped task and Fleet-app typechecks plus affected lint are recorded separately with direct exits. Normal hooked commit/plain push/new PR and full immutable handoff follow; review/CI/protected merge remain independent.                                                                                            |

### Before/fixed commands and regression preservation

Commands run in the prepared worktree using existing dependency links only,
Node 22.23.2 and Vitest 4.1.4. Each named check has a `.log` and
`-receipt.json` containing argv, cwd, timestamps and direct exit.

- `immutable-original-principal-before`: original production client/proxy/
  controller replay via `before.vitest.config.ts`, exit 1, 5 FAIL / 1 PASS.
- `immutable-current-original-callers-before`: final caller tests against the
  literal three production caller blobs at baseline8995 via
  `callers-before.vitest.config.ts`, exit 1, 4 FAIL / 1 PASS.
- `final-distinct-functional-regressions`: `node node_modules/vitest/vitest.mjs
run -c tests/unit/fleet-portal-verified-principal-canonical-caller-flow-20261015/full.vitest.config.ts
--maxWorkers=1 --no-file-parallelism`, exit 0, 263 PASS / 0 SKIP.
  JSON reporter output preserves every test and suite identity.
- `final-affected-source-types`, `final-fleet-app-types`, `final-affected-lint`:
  final commands and direct results are in the corresponding receipts.
- `original-assertion-preservation.json`: original API Controller 46,
  accepted shared case 92, Training 84, principal 19, mounted-flow 46 and
  explicit middleware boundary 2 expect/matcher AST nodes are identical
  (289 total). The Controller and principal test bytes are also identical.

The four stale caller test leaves were adapted within their exact scopes.
Server selector tests now bind to a controlled backend session response,
with genuine signed-session proof in the production-chain suites. Binary
proxy tests retain exact bytes/MIME and now verify application bearer and
canonical fleet instead of synthetic bootstrap headers. Case controller's
verified fixture actor is explicitly `陳家豪`, preserving its original expected
receipt and all 92 assertions. Training case 1.1 explicitly uses the historical
legacy billing-only factory fixture; all 84 original assertions and every
actual Academy tenant/ops/denial scenario remain unchanged. This fixture is
not the authenticated general partner client.

All original failed/tool-preparation logs remain inspectable: missing package
links and sparse read paths, jsdom server-only/import-URL adapter preparation,
the two stale legacy caller failures and initial test-only type incompatibility.
The broader original suite also exposed an upload Headers-vs-record shape
regression; preserving the caller's original plain-record forwarding fixed it
without changing that original test. Final passing checks supersede these
intermediate failures; none are silently counted as a pass.

### Unexecuted evidence and delivery boundary

This VM ran no product, HTTP, browser/E2E, WebSocket, PostgreSQL, Compose or
other project server. No packages were installed. Controlled socket-free
in-memory repositories and storage/scanner fixtures exercise actual business
logic and bytes but do not establish real PostgreSQL durability, cloud
storage/scanner, deployed browser, physical device or live lawful partner
issuer availability. Original CRM transactional ACK credit remains owned by
the accepted Complaint task and is not reimplemented or newly claimed here.
Mandatory exact-candidate hosted CI, independent review, protected merge and
shared-dev deployment are separate lifecycle results, never implied by the
local 263 tests or this UAT document.

The final JSON contains 263 executed test instances and 261 unique
file/full-name pairs: two original parameterized scenarios share their
display titles. These are not added to prior 37/45 passing subset totals.

### Mandatory root CI resolver continuation (2026-10-19)

Candidate `2f4588332655bf1df7610281dd34d29311a57930` exposed a test
collection failure in its own Product run `39209864414`, job `117921733102`:
root Vitest's jsdom import analysis could not resolve the `server-only`
marker imported by the actual Fleet principal module. The earlier local
task config had supplied this marker and Fleet app aliases; its passing
263 tests did not establish compatibility with the mandatory root config.
The hosted job's 3024 passing / 5 skipped tests do not cancel its one
failed file, and the old run is not rerun or represented as green.

Normal Supervisor coordination appends only `vitest.config.ts` to the
original ordered fourteen scopes. Its added import and plugin registration
use the task-owned `fleet-source-resolver.ts`. Only imports originating in
the real Fleet app resolve the existing test-only server marker and Fleet
`@/` paths. The resolver also handles paths already expanded by Vite's
earlier alias plugin. Other app importers retain their original aliases;
the global aliases, include list, default timeout, environments, skips,
sharding, esbuild and oxc configuration remain unchanged. No product,
principal, guard, business method or existing test assertion changed.

`root-ci-before-collection` reproduces the same import-analysis failure
with the unchanged root config (direct exit 1, zero collected tests).
`root-ci-fixed-callers` runs the same `vitest run -c vitest.config.ts`
entry point after the resolver change (direct exit 0, all original five
actual caller cases pass). Additional root-entry existing-flow regression,
source typecheck and lint receipts are stored beside those logs. The
final root-entry selection passes 125 tests in 10 files with zero skips,
including the original five callers, principal/mounted/retained Fleet
cases, 25 Platform session cases and 33 Ops/supply-review locale cases.
The separate five-case run is included in this selection, not added to it.
Source typecheck, affected lint and formatting checks pass. Earlier missing
sparse read paths and an absent existing Ops dependency link are retained
as local preparation failures; only tracked Source materialization and an
existing dependency symlink were needed to run the other-app controls.
The original 59 product/test manifest paths remain byte-identical to 2f,
including every existing test and all original 289 assertion nodes.
The continuation's immutable identity, exact counts and full original
four-key mapping are in `root-ci-continuation-delivery-result.json` and
its manifest in the same evidence directory. The original handoff,
before/fixed results, assertions and failed hosted run remain historical
evidence. A new exact-candidate hosted CI and independent review are still
required; this test harness repair grants no deployed/provider credit.

### Mandatory root TypeScript integration continuation (2026-10-19)

The `bfab8b70f3e9913a36598db746bdec89d6393977` integration run
`39213760022`, job `117935728701`, failed its actual root
`tsc -p tsconfig.json --noEmit`. The job checked out PR merge
`063cc24388d5a1ebc5003e512ee8e6d10c2f146d` with accepted parent
`88bde9b6df9826d6a52b5297ebbc91b692ff112e`. Root TSC followed the new
test's static Fleet UI imports without the Fleet app's own aliases, and
three tests imported a workspace SDK package unavailable from the root
project. The Vitest resolver does not configure TypeScript. A local target
TSC pass therefore did not satisfy this mandatory check. This is one
terminal failed job; the other old jobs were still running at diagnosis.

Normal reviewer reopen preserves all four original clauses/keys and fifteen
scopes. Only the existing test harness changes: the accepted
`createUiModuleLoader` executes the actual Fleet UI and local dependencies
using the app root, the same React/JSX runtime and real Canvas exports, plus
the existing router seam. It does not replace forms, handlers, middleware,
principal, guard, Controller or service commands. Exact public props match
all four original production component signatures; the Fleet app TSC still
checks the complete production component graph. The three SDK test imports
now name the same real package Source by relative path. No product bytes,
root TypeScript/Vitest configuration, type flags, includes, skips or
assertions change. Original 289 assertions and all 35 caller assertions
remain identical as expect/matcher AST nodes.

`root-tsc-fixed-root-entry125` reruns the root-entry selection: 10 files,
125 PASS, zero failures/skips, including all five real UI caller cases.
`root-tsc-fixed-source-types`, `root-tsc-fixed-Fleet-app-types` and
`root-tsc-fixed-tests-lint` pass. The separate five-case check overlaps the
125 and is not added to it. The props and assertion preservation tools,
raw commands, direct exits and full immutable handoff are recorded under
the existing evidence directory with the `root-tsc-` prefix.

The complete local root project compiler was also run before and after;
both exited 2. The actual hosted job's fifteen Fleet diagnostics are absent
after this fix. Other local preparation/version differences remain:
missing per-app workspace dependencies/read paths and existing dependency
links resolving packages from the Root checkout instead of this frozen
candidate (including SDK visibility differences). No shared Root Source,
package outputs or dependencies were changed to erase those diagnostics;
no installation or large build was performed. Local full-root green is
**not** claimed. New exact-candidate hosted typecheck/full CI and independent
review remain required; neither old failed run is rerun or relabeled green.

## 2026-10-19 deployed-wrapper same-origin continuation

This is the same original Fleet task, with its four acceptance criteria,
keys, dependencies and preceding evidence retained. The normally reopened
seventeen-scope continuation starts from deployed accepted
`daebd72eeef12229cb59d3750b7a288b1dab7448`. Passenger phase 2 remains separate.

The original operational artifact `12198712708` from run `39271315521`
contains 14 passed and 2 failed cases, with no skips or retries. The Fleet
case reached a browser POST to the original submission's `/submit` with
`expectedRevisionNo: 3`, then received HTTP 403 `FLEET_ORIGIN_DENIED`. Its
Origin genuinely matched the external HTTPS portal. The public runtime
wrapper retained that Origin but replaced the Next hop with loopback HTTP,
so the production guard compared the external origin with the child URL.
The prior setup's two document categories had already uploaded/confirmed;
this failure preceded principal resolution and the submission command.
Withdraw/resubmit did not execute in that original case. The separate
Channel failure is not repaired or claimed here.

The wrapper now validates the actual ingress Host as one canonical authority
and reconstructs a private `x-drts-runtime-origin` only for the exact existing
Fleet Docker child entry. Existing Cloud Run `K_SERVICE` identifies its HTTPS
termination; outside Cloud Run, the real socket's TLS state determines the
scheme. Neither browser Origin nor forwarded headers establish authority.
Missing/duplicate/multivalued or malformed Host, invalid ports and a
request-target authority override reject before the child. The request
destination remains the fixed loopback child, and the API destination remains
the existing configured API URL.

Every public entry strips caller-supplied provenance and forwarding metadata,
including originless requests. Fleet compares a present Origin against the
wrapper-owned external origin, retaining the original direct-Next comparison
when the marker is absent. An empty, malformed or foreign Origin is denied.
The marker is filtered before any API forwarding. The other five wrapper
consumers receive no marker; this is Fleet-specific origin metadata, not a
new origin guard for all six applications. All six actual Docker entry/port
pairs remain loopback-bound: platform Admin, Ops, Tenant, Fleet, Channel and
ROC. An unrecognized child entry receives no marker and retains the original
guard behavior. This metadata grants no application identity or capability.

The new socket-free regression imports the executable wrapper with only its
listener and child-process I/O replaced, then runs the actual Fleet
middleware, proxy, signed-session authority, auth guard, Controller and
Supply services. Its storage/scanner fixture is the existing in-memory
document fixture, not a real provider. It transfers exact raw bytes for both
required document categories, checks scan/confirm/download, then submits,
withdraws and resubmits the same draft with the verified actor and revision.
It also covers foreign/malformed Origin, forged provenance/forwarding,
invalid authorities, missing CSRF, missing/expired/revoked/invalid credentials,
wrong realm/scope, cross-fleet selectors, independent invocation/application
bearers, and unchanged streamed bytes/status/cookie/no-store behavior.
No listening socket, product server, browser or PostgreSQL runs on the VM.

Evidence is under
`.local/passenger-bureau-gap-correction-20261018/shared-H-A-full-deploy-20261019/fleet-origin-source-20261019/`:

| Check                                                         | Actual result                                                                                                             |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `before-actual-wrapper.json`                                  | Original product: valid external HTTPS POST fails 403 vs expected 200; foreign-Origin rejection passes (1 FAIL / 1 PASS). |
| `accepted-1c0c-wrapper-unit.json`                             | New composition: 51 PASS / 0 FAIL / 0 SKIP, including both document categories and same-draft submit/withdraw/resubmit.   |
| `accepted-1c0c-retained-Fleet-full.json`                      | Original full Fleet regression: 26 files / 263 PASS / 0 FAIL / 0 SKIP.                                                    |
| `accepted-1c0c-Fleet-app-noEmit.check.json`                   | Fleet app noEmit exits 0; its production inputs are unchanged by the later test-only type corrections.                    |
| `accepted-1c0c-wrapper-imports-noEmit.check.json`             | New unit's actual import graph noEmit exits 0, without changing tracked TypeScript configuration or flags.                |
| Final scoped lint, syntax/format and immutable handoff packet | Recorded separately against final bytes before candidate handoff.                                                         |

The initial test collection's unnecessary direct `reflect-metadata` import
failed, and is retained as preparation evidence. The first product-fixed
run reached HTTP 200 but exposed a new assertion against a nonexistent
`created_by` response field; the test now uses the actual draft/fleet contract
and later verifies the canonical submitted actor. The expanded fixture's
first PUT incorrectly supplied `application/pdf` instead of the returned
upload intent's `application/octet-stream` headers, producing 42 PASS / 1
fixture failure. Using the actual intent headers produced 43 PASS. Subsequent
auth/authority additions produced 51 PASS. The first new-unit compiler exited
2 for two test adapter types (Node module namespace and nullable signal);
their corrected actual-import compiler and 51-case rerun both exit 0. These
failed attempts are preserved and are not described as old product defects.

Before freezing the candidate, a fresh fetch found accepted peer
`1c0c3f954e5d067156732ce973ccc8cbcc2b02c6`. Ordinary merge fast-forwarded
without conflict; all forty-four peer paths remain exact and do not overlap
the four owned changed paths. The `accepted-1c0c-` records in the table are
actual post-integration runs: 51 new and 263 retained tests pass with zero
skips; Fleet app and new-test actual-import compilers both exit 0. Earlier
daeb-based checks remain separate evidence. No peer Source credit is borrowed
as this continuation's own CI.

These are controlled Source regressions. This continuation has not yet been
deployed or rerun against shared Cloud Run, real document storage/scanning or
browser sessions. New immutable candidate CI, independent review and normal
protected merge remain required. The original failed operational run and
all earlier accepted Source/CI/runtime evidence retain their own exact
versions; neither is silently replaced by this local result.
