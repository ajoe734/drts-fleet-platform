# SR-LIVE-INVOICE-MAIL-20261007-UNBLOCK-PLANNING-DECISION

Path: `support/unblock/SR-LIVE-INVOICE-MAIL-20261007/SR-LIVE-INVOICE-MAIL-20261007-UNBLOCK-PLANNING-DECISION.md`

## 1. What triggered this helper

Chairman blocked-task triage classified `SR-LIVE-INVOICE-MAIL-20261007` as `unblock_kind=planning_decision`
(`auto_created_by: "chairman-blocked-task-triage"`, created `2026-11-09T18:26:22Z`). That classification
is a `requested_kind` judgment call by the chair LLM (`supervisor_runtime.py::create_chair_unblock_task`,
line ~8175: `unblock_kind = requested_kind if requested_kind else blocked_task_triage_kind(parent)`), not a
keyword-substring bug this time: re-running `blocked_task_triage_kind` (`chair_review_policy.py:17-56`,
active release `orchestrator-ebfc0cf70173`) against the parent's live `next` field (as of
`last_update: 2026-10-27T18:11:27Z`) finds **zero** matches against either the `history_repair` or
`planning_decision` marker lists — confirmed by direct substring search on the lower-cased `next` text.
So the chair read the full task context (not just `next`) and judged, correctly, that a real decision is
still outstanding underneath the mechanical "run the workflow" framing used by the two prior helpers
(`SR-LIVE-INVOICE-MAIL-20261007-UNBLOCK-HISTORY-REPAIR`, `SR-LIVE-INVOICE-MAIL-20261007-UNBLOCK-MANUAL-UNBLOCK`,
both merged and archived). This document investigates what that decision actually is, since neither prior
helper named it concretely.

## 2. Confirmed unchanged root blocker (re-verified 2026-11-09)

- `gh variable list`: **zero** `DRTS_LIVE_INVOICE_MAIL_*` repository variables exist. Only the unrelated
  invitation-mail feature's `DRTS_LIVE_MAIL_*` (6 vars) and map feature's `DRTS_LIVE_MAP_*` exist.
- `gh run list --workflow 377833148`: no run newer than `37689594180` (`2026-10-07T21:28:00Z`, `failure`,
  `input-validation`). Nothing has executed in the 33 days since the manual-unblock helper's audit.
- `gh secret list`: no `drts-dev-smtp-*` secret is readable here (expected; Claude cannot read Secret
  Manager-backed GitHub secret *values*, only names via earlier project memory). The existing live-mail
  (`SR-LIVE-MAIL-001`) infrastructure's dedicated dev SMTP mailbox and its `drts-dev-smtp-recipient-allowlist`
  secret (currently scoped to `+invite`/`+approve` aliases per prior session record) are the only mailbox
  infrastructure that exists; nothing invoice-specific has been provisioned on top of it.

This matches the two prior helpers' findings: source is merged and reviewed (`e788524839c6b7640b64b110b62786815f3e7b51`,
PR #2425), CI passed, but manual/live acceptance has never actually been attempted since the one failed
dispatch on 2026-10-07.

## 3. The actual missing decision (why this is `planning_decision`, not just `manual_unblock`)

Both prior helpers described the blocker as "an authorized operator must obtain legitimate recipient/fixture
sessions and dispatch the existing workflow" — but neither identified **what those values must concretely be**,
nor that one of them currently cannot exist with the code as merged. Reading
`tests/e2e/system-remediation/sr-live-invoice-mail-20261007/session-bootstrap.ts` end to end:

1. **Tenant/actor session grant — already decided, no new decision needed.** `createInvoiceMailEnvAdapter`
   (lines 105-114) maps `DRTS_LIVE_INVOICE_MAIL_TEST_TENANT_ID`/`TENANT_ACTOR_ID` straight into the existing
   `sr-live-mail-001` WIF "CI tenant actor" grant check. This harness is designed to **reuse** the already
   user-approved grant tuple (`tenantId=10000000-0000-0000-0000-000000000201`,
   `actorId=10000000-0000-0000-0000-000000000901`, role `tenant_admin`) that `DRTS_LIVE_MAIL_TEST_TENANT_ID` /
   `DRTS_LIVE_MAIL_TENANT_ACTOR_ID` already use. No new WIF grant is required for the primary role.

2. **Read-only and non-allowlisted roles — real decision, not yet made.** `bootstrapMailSession` (lines 457-465)
   mints *additional* sessions for `DRTS_LIVE_INVOICE_MAIL_READ_ONLY_TENANT_ID`/`ACTOR_ID` (expected role
   `tenant_viewer`, scope `tenant:billing:read` only) and `DRTS_LIVE_INVOICE_MAIL_NON_ALLOWLISTED_TENANT_ID`/`ACTOR_ID`
   (a **second, different tenant**, `tenant_admin`, used to prove cross-tenant denial). Per
   `google-workload-identity.adapter.ts`'s registered grants (see project memory on the WIF registry, entries
   A/B/C for tenant 201 / actors 901+902 only), **neither a read-only actor nor a second tenant's actor is
   currently a registered CI-tenant-actor grant.** These are real, new (tenant_id, role, actor_id) grants that
   someone with write access to `drts-dev-workload-identity-google-service-principals` must decide to add —
   this is the "authorized runtime/recipient/fixture" decision the parent's `next` field has been gesturing
   at since 2026-10-08 without ever naming it.

3. **Real invoice fixture rows — real decision, not yet made.** `TEST_INVOICE_ID`, `READ_ONLY_INVOICE_ID`, and
   `NON_ALLOWLISTED_INVOICE_ID` must reference actual invoice rows that exist in the **dev** Postgres database
   under the corresponding tenants (one invoice visible to tenant 201/primary actor, one under the read-only
   tenant, one under the non-allowlisted tenant). No seed/migration under `infra/migrations/` creates invoice
   fixture rows (grep returned nothing), so this data does not exist yet and must be deliberately created
   (or an existing dev invoice must be deliberately chosen) before any dispatch can pass `input-validation`.

4. **Recipient alias — partially automatic, but gated on an allowlist that is not wired.** `deriveAliasRecipient`
   (lines 334-360) computes the recipient as `<drts-dev-smtp-username local-part>+invoice@<domain>` at runtime
   — it does **not** need a human to pick an email address, and only accepts the literal tag `"invoice"`. But
   lines 467-480 then require `env.DRTS_LIVE_INVOICE_MAIL_EFFECTIVE_ALLOWLIST` to already contain that derived
   address (or its domain) or the run throws `"Derived recipient is not present in the observed effective
   allowlist."` **`.github/workflows/live-invoice-mail-acceptance.yml` never sets
   `DRTS_LIVE_INVOICE_MAIL_EFFECTIVE_ALLOWLIST` anywhere** (confirmed by grep — zero matches), unlike any
   step that would read `drts-dev-smtp-recipient-allowlist` and export it. This means the harness as merged
   **cannot pass today even with every other input supplied** — a source wiring gap, not an external-credential
   gap. This is new information neither prior helper surfaced.

5. **`*_TEST_AUTHORIZED` gate — a user authorization decision by established convention.** Per this project's
   consistent precedent (`DRTS_LIVE_MAP_TEST_AUTHORIZED`, `DRTS_LIVE_MAIL_TEST_AUTHORIZED`), flipping a
   `*_TEST_AUTHORIZED` var to `true` is the point at which a live run is allowed to actually send real mail /
   make real billed calls against the dev project, and has always been something the user decides and sets
   directly, not something delegated to an agent's judgment. `DRTS_LIVE_INVOICE_MAIL_TEST_AUTHORIZED` is no
   different and is still unset.

**Conclusion: the "planning" gap is real.** Three separate things require a human decision/authorization
before any operator can productively dispatch the workflow: (a) which WIF grants to add for the read-only and
non-allowlisted roles, (b) which real dev invoices to use/seed for all three fixture tenants, and (c) explicit
authorization to extend the existing dev SMTP recipient-allowlist and flip `TEST_AUTHORIZED=true`. None of
these are present. Separately, (d) the `EFFECTIVE_ALLOWLIST` wiring gap in the workflow is a source defect in
`SR-LIVE-INVOICE-MAIL-20261007`'s own scope that must be fixed before (c) can even matter — recorded here for
the next owner repair cycle, not fixed by this helper (this helper's `write_scopes` is this document only).

## 4. Decision routed to the user (2026-11-09)

This helper asked the user directly (via `AskUserQuestion`) whether to (i) authorize provisioning now and
have the concrete values prepared as a paste-ready command block, (ii) defer and record this as an explicit
follow-up pending the user's own availability, or (iii) scope-cut the live-acceptance requirement entirely.
**No answer was received in this dispatch window.** Per the acceptance criteria's explicit allowance to
"record ... explicit follow-up needed by the parent task" when a decision is not this helper's to make, the
disposition below selects option (ii): keep the parent `blocked`, keep its existing `waiting_for`, and replace
its `next` with a concrete, user-actionable checklist instead of the previous vague "confirm available
personnel" framing. This is a strict narrowing of the same already-recorded disposition, not a new blocker
and not a status change — no regression of prior review/CI/merge evidence.

## 5. Concrete next step (for the user, then the operator)

When ready, the user decides and (Claude cannot write GitHub/Secret Manager secrets or flip the
`TEST_AUTHORIZED` gate per standing project convention — see `project-live-acceptance-infrastructure` memory):

1. Add two new entries to `drts-dev-workload-identity-google-service-principals`: a `tenant_viewer`,
   `tenant:billing:read`-only grant for a new read-only actor under tenant `...0201`, and a `tenant_admin`
   grant for a new actor under a second, distinct tenant (for the non-allowlisted-cross-tenant case).
2. Confirm or seed one dev invoice row under each of: tenant `...0201` (primary + read-only), and the new
   second tenant (non-allowlisted) — three invoice IDs total.
3. Extend `drts-dev-smtp-recipient-allowlist` to include the `+invoice` alias of the existing
   `drts-dev-smtp-username` mailbox (same dedicated dev-only mailbox already used by `SR-LIVE-MAIL-001`; no
   new mailbox).
4. Set the 11 `DRTS_LIVE_INVOICE_MAIL_*` repository variables (`TEST_AUTHORIZED`, `API_ORIGIN`,
   `PORTAL_ORIGIN`, `ALLOWED_TARGETS`, `TEST_TENANT_ID`, `TENANT_ACTOR_ID`, `TEST_INVOICE_ID`,
   `NON_ALLOWLISTED_TENANT_ID`/`ACTOR_ID`/`INVOICE_ID`, `READ_ONLY_TENANT_ID`/`ACTOR_ID`/`INVOICE_ID`,
   `INVITATION_ROLE_CODE`) — reusing `DRTS_LIVE_MAIL_API_ORIGIN`/`ALLOWED_TARGETS`/`TEST_TENANT_ID`/
   `TENANT_ACTOR_ID`'s existing values for the first role, and the new grants/invoices from steps 1-2 for
   the rest.
5. **Before step 4's run can succeed**, the parent task's next owner cycle must add a step to
   `.github/workflows/live-invoice-mail-acceptance.yml` that populates
   `DRTS_LIVE_INVOICE_MAIL_EFFECTIVE_ALLOWLIST` from the (extended) `drts-dev-smtp-recipient-allowlist`
   secret — this does not exist today (§3.4) and is a source fix, not a config value.
6. Only then: `gh workflow run 377833148 --ref dev -f candidate_sha=<verified-deployed-source-sha>` and map
   all four `required_acceptance` keys via `record-acceptance`.

## 6. Parent disposition (recorded here; Supervisor must persist before this helper merges)

Per the dispatch guard (`task_board_commands.py::_guard_worker_command`, lines 82-112), a dispatched owner
cannot `note`/`assign` the parent task directly. Following the same pattern as the two prior helpers, the
exact `resolved_parent_*` fields this helper requests Supervisor set via `assign` with `TASK_METADATA_JSON`
before merge (so `transition_after_merge`'s `unblock_parent_resolution_fields` does not default the parent to
`status: "todo"`):

- `resolved_parent_status`: `"blocked"`
- `resolved_parent_waiting_for`: unchanged (keep parent's current `waiting_for`/owner routing; this helper
  does not reassign operator identity)
- `resolved_parent_next`: "2026-11-09 UNBLOCK-PLANNING-DECISION found the concrete gap: no WIF grants exist
  for invoice read-only/non-allowlisted roles, no dev invoice fixture rows are seeded for 3 tenants, SMTP
  recipient-allowlist lacks the +invoice alias, and workflow yaml never sets
  DRTS_LIVE_INVOICE_MAIL_EFFECTIVE_ALLOWLIST (source gap, fix before next dispatch). User asked to
  authorize/seed/extend-allowlist; no answer yet this cycle -> recorded as explicit follow-up, not resolved.
  Full checklist: support/unblock/SR-LIVE-INVOICE-MAIL-20261007/SR-LIVE-INVOICE-MAIL-20261007-UNBLOCK-PLANNING-DECISION.md
  section 5. Do not re-dispatch workflow 377833148 until steps 1-5 there are done; do not flip
  TEST_AUTHORIZED without the user. Zero candidate/source/CI/merge evidence regressed; e788524,
  PR #2425/#2411/#2426 unchanged."

## 7. §0.7 acceptance mapping

| Acceptance item | Status | Evidence |
| --- | --- | --- |
| Resolve or route the missing product/contract decision through canonical planning artifacts | Routed | §3-§5 above; user asked via `AskUserQuestion`, no answer this cycle |
| Record the decision, scope cut, or explicit follow-up needed by the parent task | Done (explicit follow-up) | §4, §6 |
| Produce task-scoped commit/push/PR evidence for any canonical change | This commit/PR on `claude/sr-live-invoice-mail-20261007-unblock-planning-decision` | git log |
| Update the parent task with the concrete unblocked next step | Drafted in §6; requires Supervisor `assign` (dispatch guard forbids owner `note`/`assign` on the parent) | §6 |

No candidate/source edits, commits, pushes outside this helper's own scope, hosted dispatch, cloud mutation,
secret writes, GitHub variable writes, email/mailbox access, or VM product/dev/preview/browser/Playwright/DB/
Compose execution were performed. All findings above are read-only (`gh variable list`, `gh secret list`,
`gh run list`, `grep`/`git show` over tracked source) re-verified in this worktree on 2026-11-09.
