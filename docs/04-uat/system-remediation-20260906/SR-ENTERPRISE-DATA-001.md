# SR-ENTERPRISE-DATA-001 — baseline and screen requirements

## Dispatch baseline (2026-09-08)

- Owner: Codex; reviewer: Codex2. Implementation is blocked before UI edits; this is not acceptance evidence or a review candidate.
- Branch: `codex/sr-enterprise-data-001`, assigned isolated worker worktree.
- `git fetch origin && git rebase origin/dev`: exit 0.
- `git rev-parse origin/dev HEAD`: both `318f5065433ff07fba2ddf242cf1c5aef5fb1cae`.
- Candidate SHA: none. The evidence anchor SHA is recorded in the task-board blocker note after ordinary push; it must not be treated as an implementation candidate.
- Sources: task execution/spec documents, source/findings.json R08/R09/R16, source/capabilities.json C013/C017/C018/C093/C108/C119. Historical September 6 observations were not treated as current live results.

## Current source reproduction

These are source-level findings at the baseline SHA, not browser/API execution results.

1. `app/page.tsx` calls `getEnterpriseBookings(locale)` and links active trip to `/trip` without an ID. `app/trip/page.tsx` selects the first fixture active booking, falls back to the first booking, and links to `/bookings/${trip.id}`. The fixture resource is `EB-7K2E1D`; its existence on today's live API has NOT been checked. Trip displays fixture driver, vehicle and ETA, and a fixed progress index of 2.
2. `components/enterprise-booking-lifecycle.tsx` already reads list/detail through the tenant API. `gatewayHref` returns null for a normal 404, then detail's catch maps null to `degraded`, whose heading says service is temporarily unstable. The fix belongs to this shared component, outside this task's write scopes.
3. Both trip contact controls are `EBtn` without href or handlers. `/help` also renders fixture `0800-200-118` and inert controls; merely navigating there would not demonstrate a real contact action.
4. `packages/contracts/src/index.ts` BookingRecord includes booking/order state and passenger/onsite contact, but no authorized driver contact, driver identity, or ETA. Passenger/onsite phone must not be relabeled as driver phone. PartnerEntryBrandingMetadata support fields are partner-entry data, not proof of enterprise support authorization.
5. The existing API consumer uses fixture tenant ID `10000000-0000-0000-0000-000000000201`. A reviewed tenant-session/contact data integration must establish the authorized source before expanding contact exposure.

## Screen requirements — design input required

Read canvas `ent-screens-1.jsx` (ENT_Home), `ent-screens-2.jsx` (ENT_Trip), `ent-states.jsx`, `ent-kit.jsx` (including EEmpty), and `packages/ui-tokens/src/realms.ts`.

The canvas supplies home/trip populated layouts, general gate screens and an empty-state primitive. It does not specify a booking-not-found trip screen or a trip with unavailable driver contact. Per the dispatch contract, stop UI implementation until these states are supplied; this note does not invent a replacement design.

Required design decisions:

- Home/trip loading, empty booking collection and no active trip: no fallback to a historical booking; distinguish unknown KPI values from measured zero.
- Explicit requested booking returning 404: booking not found and return-to-list action, without retryable service-degradation copy. Define separate denied/expired-session and transient-error states.
- Booking without authorized driver contact: unavailable reason and approved support alternative; no fixture name, plate, ETA or phone. Define behavior when both contact sources are unavailable.
- Preserve the same booking ID across home, trip and detail, with state/progress derived from authoritative order status rather than a fixed index.
- Retain canvas structure and use tenant realm tokens. Existing `lib/enterprise-theme.ts` has hardcoded blue defaults; canonical tenant realm is teal. Shared theme migration requires scope authorization, not a page-local duplicate theme.

## Supervisor unblock request

1. Supply/review the missing screen states in the canonical canvas.
2. Extend write scopes to `apps/enterprise-dispatch-web/components/enterprise-booking-lifecycle.tsx` for the acceptance-critical 404 classification, and `apps/enterprise-dispatch-web/lib/enterprise-theme.ts` for shared realm-token alignment. Add dependencies for any overlapping writers before enabling edits.
3. Identify the authoritative enterprise session and permitted driver/support contact source. If API/client/contracts or `/help` changes are required, assign them to their owning tasks or explicitly expand scopes and dependencies first. No new API or contact contract was invented in this task.

## Executed verification

| Command | Exit | Actual result |
| --- | --- | --- |
| `git diff --check` | 0 | Clean baseline diff |
| `pnpm --filter @drts/enterprise-dispatch-web typecheck` | 0 | `tsc --noEmit` passed on baseline |
| `pnpm exec vitest run tests/unit/system-remediation/sr-enterprise-data-001/` | 1 | No test files found; NOT a pass |

No application code was changed and no regression suite was added before the required design stop. Implementation, regression tests, browser navigation/contact checks, live tenant/booking reads, true-device telephone launch, CI, merge and deployment remain unperformed. No live resource or successful delivery is claimed.
