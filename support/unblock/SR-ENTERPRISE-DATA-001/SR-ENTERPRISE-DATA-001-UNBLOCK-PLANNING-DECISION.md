# SR-ENTERPRISE-DATA-001 — planning decision routing

Date: 2026-09-08 UTC. Owner: Codex2. Reviewer: Codex.
Disposition: explicit supervisor/contract follow-up routed; no scope cut approved.
Canonical open item: `Q-SR-ENTERPRISE-DATA-001` in `PHASE1_OPEN_QUESTIONS.md`.

## Current evidence

- Fetched and rebased this helper onto `origin/dev`
  `3f182f7e314b5ddb4c37f1c3f5dc214a6d0edf0e` (both commands exit 0).
- Current published parent WIP is `a2d8d9bbd006f4c21f7a4c5290a7b14e65256968`.
  Its UAT record includes a 15:35 UTC redispatch report: trip integration remains
  incomplete and the shared scope/contact gaps remain. Older history-audit SHAs
  are provenance, not the current candidate. This helper does not replay WIP.
- Current-release `ai-status.sh show SR-ENTERPRISE-DATA-001` (exit 0) returned
  `todo`, original write scopes, and no dependencies. Its next step inferred
  that history repair resolved the blocker. The merged
  [history report](SR-ENTERPRISE-DATA-001-UNBLOCK-HISTORY-REPAIR.md), especially
  “Concrete remaining supervisor decision”, explicitly says the opposite.
- `phase1_prd_detailed_v1.md` §9.1.2 requires dispatch/fulfillment status queries.
  `phase1_service_contracts_v1.md` §4.2 specifies passenger and onsite contact
  for tenant booking; it does not make these fields a driver contact grant.
- At the inspected dev SHA, `packages/contracts/src/index.ts` `BookingRecord`
  contains passenger/onsite contact and order status, but no driver contact or
  ETA. This observation does not assert that no other authorized API exists.
- `apps/enterprise-dispatch-web/components/enterprise-booking-lifecycle.tsx`
  `EnterpriseBookingDetail` defaults unresolved fetch errors to `degraded`.
  The parent explicitly requires distinguishing missing bookings from temporary
  errors; that shared component is outside its write scopes.
- `apps/enterprise-dispatch-web/app/help/page.tsx` displays
  `enterpriseTenant.supportPhone`; its call/online buttons have no action.
  A link to this page alone cannot establish the parent's contact acceptance.
- `apps/enterprise-dispatch-web/lib/enterprise-theme.ts` declares its own canvas
  kit/palette. The WIP reports realm-token integration as a prerequisite; this
  helper routes that claim for scope review rather than declaring a new theme
  requirement or authorizing a redesign.

## Routing decision and accountable next steps

Preserve the parent acceptance in
`docs/03-runbooks/system-remediation-20260906/SR-ENTERPRISE-DATA-001.md`.
Its execution prompt requires supervisor scope expansion and dependencies before
shared edits. History repair is not that authorization. Record the following
outstanding work on the existing parent through the current status release:

1. **Supervisor/Chairman:** authorize the smallest shared detail 404 and help
   action scopes above, or identify/register serialized producer tasks with
   owners and independent reviewers. Record actual producer IDs in parent
   `depends_on`, after checking overlap and cycles. Review the reported theme
   prerequisite against accepted UI rules: assign the shared token work if
   required, or explicitly record why the existing theme permits parent progress.
   This routing record itself grants none of these scopes.
2. **Contract reviewer Codex with parent owner Codex2:** identify and cite the
   authorized tenant-facing driver/contact and support source, including tenant
   access, masking/availability, no-driver behavior and permitted action target.
   Do not use passenger/onsite phone as driver phone, hard-code support numbers,
   invent ETA, or infer authorization from a fixture. If an existing API meets
   this need, record it and its accepted integration evidence; otherwise route
   a producer through the supervisor before adding a client/contract dependency.
3. **Supervisor with product owner if needed:** explicitly adjudicate an
   unavailable-driver/contact path when authoritative data is absent. A visible
   unavailable state is an honest interim behavior, not proof that the full
   actionable-contact acceptance is met. Any reduction of that acceptance needs
   a recorded product decision and updated parent spec/machine truth. No such
   reduction is approved here; no human escalation is needed for routine scope
   assignment alone.
4. **Parent owner Codex2, after routing gates:** reuse the preserved parent WIP
   and isolated branch according to the history report, inspect fresh dev, and
   complete real-booking home/trip integration within authorized scopes. Verify
   same booking IDs across list/home/detail, empty/missing/401/403/temporary-error
   behavior, no-driver and authorized contact navigation, and no disclosure of
   unauthorized data. Run the parent's declared typecheck, scoped Vitest suite,
   and diff check; record actual resource IDs, commands, base/candidate SHAs and
   unexecuted live/device checks. Commit, ordinary-push, PR and handoff to Codex.

## Resume gate and delivery boundary

The concrete next step is supervisor scope/dependency adjudication plus contract
source confirmation, not another history repair or immediate UI completion.
Keep the parent blocked until those decisions are recorded and any required
producer has canonical acceptance/merge evidence. The existing parent owns this
follow-up; no new producer task or accepted product decision is claimed.

This helper performs planning only. Source inspection, single-task status reads,
fetch and rebase succeeded. `git diff --check` is the scoped pre-handoff check.
Parent's earlier 17 passing tests are historical evidence, not rerun here. No
runtime, live/API, device, CI, merge or deployment success is claimed. The helper
commit, normal push, PR and exact candidate SHA are recorded in machine truth
at handoff; independent review and same-candidate integration remain required.
