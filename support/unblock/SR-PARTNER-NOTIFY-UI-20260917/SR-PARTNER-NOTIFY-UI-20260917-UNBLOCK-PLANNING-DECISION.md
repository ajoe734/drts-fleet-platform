# SR-PARTNER-NOTIFY-UI-20260917 planning decision

Date: 2026-09-23 UTC. Helper owner: Codex. Helper reviewer: Claude2.
Parent owner/reviewer: Gemini / Codex, as recorded by the canonical status CLI.

Disposition: route the missing approved notification canvas through
[Q-SR-PARTNER-NOTIFY-UI-20260917](../../../PHASE1_OPEN_QUESTIONS.md#q-sr-partner-notify-ui-20260917--approved-notification-canvas-handoff).
No product scope cut is approved. The parent remains blocked; this helper does
not approve a screen, resolve the parent's code findings, or satisfy its UI gates.
Parent/disposition machine writes still require Supervisor, as detailed below.

## Authority and inspected revisions

- Helper base: `6a0aca3ef5955d2d5796dcd3b7eb5c37bf6531e6`. Fetch completed;
  origin/dev subsequently pointed to `4ccb0d27c491bea77dc9f0bd827dd529a72db409`.
  No helper branch publication or PR existed at initial inspection. No history
  rewriting or parent worktree edits were performed.
- Canonical task slices: parent is `blocked`, waiting for approved canvas;
  `SR-PARTNER-NOTIFY-TRANSPORT-20260918` is `done`, candidate
  `e3acca1d7c66789d50a9111436a31457be4f3651`, merged via PR #2076 as
  `1750224ac70dd819184a579f19773f3662fa513e`. Transport is not the missing decision.
- Latest independent parent review: `7dfb9db133dc45b189ce9e529eae609b3fa08cda`,
  generation `8d66957f1df1480889829dd54321260c`, compared with adjacent reviewed
  `a14820850962275a2d9a88c70d20ddb40f172efa`. Its complete R1–R7 receipt was read
  through `ai-status.sh show` (filtered to the latest `reopen` receipt).
- Subsequent parent published head observed:
  `596a0523cfcd5f55803e712813ca918b0f502b0f`,
  [PR #2113](https://github.com/ajoe734/drts-fleet-platform/pull/2113), branch
  `gemini/sr-partner-notify-ui-20260917-successor-4`. This is newer owner work,
  not an independently accepted replacement for the reviewed candidate.
- At that published head, the
  [screen-requirements note](https://github.com/ajoe734/drts-fleet-platform/blob/596a0523cfcd5f55803e712813ca918b0f502b0f/docs/05-ui/drts-design-canvas/partner-notification-screen-requirements-20260923.md)
  and
  [03 UI design delta](https://github.com/ajoe734/drts-fleet-platform/blob/596a0523cfcd5f55803e712813ca918b0f502b0f/docs/02-architecture/partner-notification-20260917/03_ui_design_delta.md)
  explicitly request design handoff. `PartnerNotificationPanel` renders only a
  `CanvasBanner`; its `entrySlug` feeds placeholder copy, not real binding or
  delivery controls. Read these immutable blobs, not a mutable owner worktree.
- [AI collaboration guide](../../../AI_COLLABORATION_GUIDE.md) §0.7 requires
  original-owner repairs, adjacent-candidate evidence and honest pending gates.
  The canonical parent task specification and saved older review were also read
  at `/home/lupin/workspace/drts-fleet-platform/.local/dispatch-recovery-20260919/`
  (files named for the parent and parent `-review-findings.md`). They permit
  scoped API/repository work while design is held; they do not permit an invented UI.

Product sources remain unchanged: [PRD](../../../phase1_prd_detailed_v1.md)
§9.1.2 permits tenant notification management;
[service contracts](../../../phase1_service_contracts_v1.md) §3.2 and the
Audit & Notification service retain ownership, audit and retry policy.
[Partner notification SA/SD](../../../docs/02-architecture/partner-notification-20260917/01_system_sa_sd.md)
§§1–3, 9, 12 and 14–15 settles the six transport/product choices and explicitly
leaves UI design to a separate handoff. The integration contract §§2, 5 and 9
was read from the canonical-root absolute path
`/home/lupin/workspace/drts-fleet-platform/docs/02-architecture/partner-notification-20260917/02_partner_integration_contract.md`;
it is not present in this helper base and was not copied wholesale. Its
endpoint-acceptance/device-unknown distinction agrees with the tracked SA/SD
and contracts.

## Decision and screen-requirements handoff

The missing deliverable is approved visual coverage for the **existing Platform
Admin partner entry detail** notification surface. It is not a new notification
provider, native passenger app, endpoint registry or second retry scheduler.

The visual authorities were inspected:
[Platform Admin canvas](../../../docs/05-ui/drts-design-canvas/Platform%20Admin.html)
loads `platform-screens-1.jsx`; its `PA_PartnerDetail` at lines 328–345 lists
Overview, Branding, Auth, Eligibility, Credentials and Audit, with no
notification tab. Searches of the other loaded platform screen modules found
unrelated notification references, not this screen. Colors remain supplied by
[realm tokens](../../../packages/ui-tokens/src/realms.ts), using the `platform`
realm for this surface. This note specifies required behavior, not layout,
palette, typography, component positioning or design approval.

The designer's approved canvas must cover these existing requirements:

| Requirement | Contract/source and required behavior |
| --- | --- |
| Binding read/edit | Existing `PartnerEntryNotificationBindingController.getBinding/putBinding`, `PartnerEntryNotificationBinding` and `PARTNER_PASSENGER_EVENT_TO_EXTERNAL_NAME`. Show no binding, `test_pending`, `ready`, `disabled`; use the five formal events and preserve subscriptions. PUT requires `expectedVersion`. |
| Binding governance | Existing `testBinding/enableBinding/disableBinding`; enable/disable require `expectedVersion`. Reflect actual realm/scope and tenant/partner/entry authority, loading, pending action and unavailable controls; never show a secret value. |
| Delivery read | Real entry-scoped records with loading/empty/error states and list navigation matching the reviewed read contract. Distinguish missing context from known data; never invent a default policy or success result. |
| Controlled retry | Return eligible work to the existing outbox consumer. Represent refusal for delivered, active lease, expired, superseded, exhausted budget or unready binding. Preserve receipt/context/attempt/fence ownership and idempotence; no direct HTTP send from the admin action. |
| Recovery and truthful copy | Explicit 403/404/409 and refresh/recovery behavior. A valid partner ack means endpoint accepted, downstream device unknown. Test dispatch and manual requeue have distinct results. No Supervisor/design-handoff instructions in product UI. |

Contract references above are
[binding controller](../../../apps/api/src/modules/tenant-partner/partner-entry-notification-binding.controller.ts),
[binding service](../../../apps/api/src/modules/tenant-partner/partner-entry-notification-binding.service.ts),
and [notification contracts](../../../packages/contracts/src/partner-passenger-notification.ts).
Newer parent delivery DTO/retry implementation remains subject to the original
review. A requested paginated view does not itself approve a new pagination API.

## Concrete next steps and resume conditions

1. **Supervisor/Claude — design routing:** identify and record the design owner
   and reviewer on the existing parent, or register a prerequisite task with
   explicit dependency and canvas write scopes. Authorize the smallest required
   Platform Admin canvas change after overlap review. Reuse the parent's
   published screen-requirements note and this behavioral mapping. No such new
   task or design approval is asserted by this helper.
2. **Supervisor/Claude — repair boundaries:** preserve Gemini/Codex roles and
   all three required acceptance keys. Coordinate genuinely needed shared test
   files (the latest review names `vitest.config.ts` and the PostgreSQL gate
   verifier), and the history-preserving successor procedure for failing
   ancestor trailers. Update execution branch/worktree routing before dispatch
   if a successor is necessary; preserve published refs, without force push.
3. **Gemini — first independently executable repair unit when dispatched:**
   reread the latest full review and newer code; verify API/client types,
   authoritative no-context expiry/budget and real migrated PG fixtures/gate
   discovery. Record old/new evidence in the original parent UAT. These scoped
   repairs do not need an invented UI and do not close UI acceptance.
4. **Design reviewer/Supervisor — UI resume gate:** record approved canvas
   path, full revision, reviewer decision and coverage of the table above,
   along with authorized parent write scopes. Only then resume screen work.
   A requirements note, placeholder or helper merge is insufficient.
5. **Gemini/Codex — candidate gate:** implement the approved screen, retain
   R1–R7 and every acceptance item in the original UAT, run scoped checks and
   required hosted PG/browser verification, publish normally, and review the
   exact candidate. Endpoint/device live evidence remains separate.

Required parent acceptance remains:

- `entry_notification_admin_uses_real_binding_and_delivery_data`: pending
  functional UI, design, contract and durable isolation verification.
- `manual_retry_preserves_single_outbox_owner_and_fence`: not established by
  this planning task; requires meaningful positive/rejection PG evidence.
- `ui_states_do_not_claim_device_delivery_and_no_secret_disclosure`: pending
  real UI interaction and state/copy verification, not placeholder inspection.

## Repeated review findings and evidence limits

The adjacent reviewed SHAs above trigger §0.7 repeated-defect handling. Retain
the complete machine review receipt in the original parent UAT; this table
routes its findings without claiming the newer owner's edits passed review.

| Finding | Precise boundary from latest independent review | Disposition here |
| --- | --- | --- |
| R1 absent UI | `PartnerNotificationPanel` only renders banner; `PA_PartnerDetail` lacks screen | Requirements and design route recorded; no UI implemented. |
| R2 invalid PG fixtures | retry → dispatch facade → tenant repository reads entry JSON; `{}` lacks owner; fictitious registry does not hydrate service | Original owner verifies newer fixtures against production schema/functions. |
| R3 hosted discovery | API-package Vitest finds zero UI tests; root workflow migration ordering inadequate in reviewed SHA | Original owner proves actual non-skipped PG execution; passing generic integration job is insufficient. |
| R4 eligibility/read DTO | no-context retry ignored authoritative expiry/policy; misleading result/null/failure types | Original owner reruns legal/refusal probes and durable tests on new candidate. |
| R5 trailers/history | reviewed candidate had invalid published ancestors | Supervisor coordinates preserved-history successor; no amend/rebase/force push. |
| R6 evidence mismatch | old UAT claimed PG/component proof absent from actual checks | Original owner maps actual commands, SHAs and pending gates in original UAT. |
| R7 scope pollution | unrelated MAP proof artifacts and uncoordinated shared configuration | Supervisor scopes genuine needs; owner verifies final task diff excludes unrelated changes. |

At observed newer head `596a0523cfcd5f55803e712813ca918b0f502b0f`, GitHub reports
[Commit trailers failure](https://github.com/ajoe734/drts-fleet-platform/actions/runs/35888721031/job/107275451188)
and
[typecheck failure](https://github.com/ajoe734/drts-fleet-platform/actions/runs/35888721155/job/107275652515).
This helper read check metadata, not those job logs, and makes no new root-cause
or test-pass claim. The newer UAT's “Postgres tests passed via CI pattern” is not
accepted evidence here. Runtime/PG/browser/live validation was not performed.

## Machine-truth disposition and operator action

Only the current canonical CLI was used:
`/home/lupin/workspace/drts-fleet-platform/tools/development-orchestrator/bin/ai-status.sh`,
with `AI_NAME=Codex`. Helper `start` and `progress` succeeded (exit 0).

Two necessary state writes were attempted and rejected (exit 1):

- `note SR-PARTNER-NOTIFY-UI-20260917 <next step>`:
  `Dispatched worker cannot mutate a different task`.
- `TASK_METADATA_JSON=<disposition> ... assign <helper-id> Codex Claude2`:
  `Dispatched workers must use their assigned task lifecycle commands`.

No guard variables were removed or impersonated; no machine JSON was edited.
The request was recorded through helper `progress`. Supervisor must use its
authorized CLI context to perform these writes before helper handoff/merge:

| Target | Required write |
| --- | --- |
| This helper, preserving Codex/Claude2 | `resolved_parent_status: blocked`; `resolved_parent_waiting_for: Claude`; `resolved_parent_next`: the parent next step below. Do not manually invent `resolved_parent_at`; lifecycle records it on resolution. |
| Parent, preserving Gemini/Codex and acceptance | Record next step below; retain blocked disposition and route design coordination to Supervisor/Claude. Resume only after actual blocker resolution. |

Parent next step: **Supervisor/Claude coordinates an approved Platform Admin
partner-notification canvas revision/reviewer and shared-test/history scopes;
then dispatch Gemini for the existing bounded API/repository repairs and,
after design approval, the real notification UI. Preserve latest R1–R7 and
all three acceptance keys. See Q-SR-PARTNER-NOTIFY-UI-20260917 and this artifact.**

Without persisted helper disposition, automatic helper resolution can default
the parent to `todo`. Do not submit this helper as ready for merge while that
metadata is missing. Publishing this planning branch/PR is safe and reviewable;
it does not claim the parent state write succeeded.

## Helper acceptance and verification

| Finding / acceptance | Change and source | Old → new evidence | Command / result / revision | Unverified or blocked |
| --- | --- | --- | --- | --- |
| Resolve or route missing decision | Open question and this decision artifact; canvas and contract references above | Implicit design hold → named Supervisor route and resume gate | Source inspection and task/PR slices completed on revisions above | Canvas remains unapproved. |
| Record decision, scope cut or follow-up | No scope cut; behavioral requirements, responsibilities and repair order above | No documented helper disposition → explicit follow-up | Content/reference checks pending final closeout | Parent product acceptance unchanged. |
| Task-scoped commit/push/PR | Only this artifact and the open-question entry | No helper candidate → publication evidence to be recorded below | Commit/push/PR pending | No integration claim. |
| Update parent next step | Exact desired message and metadata above | Parent note attempted → rejected by dispatch guard | Both denied CLI operations exit 1; helper progress exit 0 | Supervisor must write parent and helper metadata; this acceptance remains blocked. |

Documentation-only checks and final publication evidence will be appended after
they finish. Product tests are not applicable to these two Markdown changes;
no additional mirror tests or services are introduced.
