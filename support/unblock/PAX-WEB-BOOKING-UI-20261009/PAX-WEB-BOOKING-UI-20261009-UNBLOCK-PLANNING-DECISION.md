# PAX-WEB-BOOKING-UI-20261009 — planning decision route

Date: 2026-10-10. Helper owner/reviewer: Codex/Codex2.
Parent owner/reviewer: Gemini/Codex2, unchanged.

## Decision and delivery boundary

Route the missing reservation configuration contract and Passenger booking
canvas to Supervisor coordination. **No product scope cut, new lead-time value,
endpoint implementation, visual approval, or parent acceptance is delivered by
this helper.** Record the open decision in
[Q-PAX-WEB-BOOKING-UI-20261009](../../../PHASE1_OPEN_QUESTIONS.md).
Keep the parent blocked until the actual remaining dependencies are resolved.
The helper can publish a reviewable planning PR, but must not lock a candidate
or become merge-ready before Supervisor persists the blocked parent disposition.

Dispatch permits planning artifacts, not repairs on the parent's active branch.
This change owns only this artifact and the new open-question entry; it leaves
product code, the parent's UAT, accepted SD and contracts to their assigned lanes.

## Actual source and candidate evidence

Read AI_COLLABORATION_GUIDE.md §0.7 and the full latest independent review from
the current-release CLI task slice (not the whole status file).

| Evidence | Revision / formal symbol | Implication |
| --- | --- | --- |
| Helper base and observed dev | `5b11155d33fd4d6c345e01cb9730012d3b3d08d1` | Planning branch is isolated from the parent's code branch. |
| Adjacent independent parent reviews | `f5d88b714c4ea55210abc55c679960f6ba5a190f` (2026-10-10 06:36:07 UTC), then `b79c3715c69f02c1bf5d23fd54fb2e1e0be39f2d` (08:11:59 UTC), Codex2 | Latest reviewed generation `fde1ad8c6ef24bb59df1cfd5d074dad7`; settings/design/complete draft/evidence remained unresolved. |
| Newer parent PR head | [PR #2508](https://github.com/ajoe734/drts-fleet-platform/pull/2508), `869cd21fc3eba8ef513af9bc3f031aaf61bc5638` | Published after the review; static inspection only here, not a reviewed candidate. Parent machine truth has no candidate SHA and is blocked. |
| Task spec/common | `/home/lupin/workspace/drts-fleet-platform/.local/passenger-app-20261009/PAX-WEB-BOOKING-UI-20261009.md` and `common.md`, A1/A7/A9/A12 and parallel-start supplement | Develop against formal contracts with HTTP stubs; no invented endpoint, server or final UI. Preserve original acceptance. |
| Formal SD | [01_system_sa_sd.md](../../../docs/02-architecture/passenger-app-20261009/01_system_sa_sd.md), §3 endpoint table and §7 | Requires configured lead time; 30 minutes is an example. No settings endpoint is defined. |
| Contract and registration | [passenger-app.ts](../../../packages/contracts/src/passenger-app.ts), [PassengerAppModule](../../../apps/api/src/modules/passenger-app/passenger-app.module.ts) controllers | No settings response/handler; a BFF allowlist does not supply one. |
| Existing reservation authority | [OwnedMobilityService](../../../apps/api/src/modules/owned-mobility/owned-mobility.service.ts), `getMinLeadTimeMinutes`, `createMultiTaxiRide` scheduled branch | Env precedence: `SCHEDULED_BOOKING_MIN_LEAD_TIME_MINUTES`, then `MULTI_TAXI_MIN_LEAD_TIME_MINUTES`, then service default 15. Server compares full timestamp to now + configured lead, returning `TOO_SOON_TO_BOOK` details. This is existing behavior, not a new policy selected by the helper. |
| Quote authority | [PassengerFareService.quote](../../../apps/api/src/modules/passenger-app/fare/passenger-fare.service.ts) | Uses authenticated account and service-area evaluator for both stops; absent coverage/manual review cannot become a serviceable quote. Reuse this authority rather than inventing `/geo/evaluate`. |
| Geo authority | [GeoController](../../../apps/api/src/modules/geo/geo.controller.ts), [resolveRouteAuthPolicy](../../../apps/api/src/common/auth/auth.policy.ts), [GeoProviderHealthResponse](../../../packages/contracts/src/index.ts) | Passenger policy admits search/resolve/reverse/route, not health; health includes environment/secret-name/key-restriction details. Do not expose the administrative health response wholesale. |

### Preserve review findings and newer changes distinctly

The latest independent review already supplies minimum repros, actual callers,
expected/actual results and repair boundaries for repeated R5/R6/R7/Design.
This document routes those blockers; it does not replace that review or claim
new product probes passed. Original owner must carry the complete review into
the [original UAT at parent revision 869cd21f](https://github.com/ajoe734/drts-fleet-platform/blob/869cd21fc3eba8ef513af9bc3f031aaf61bc5638/docs/04-uat/passenger-app-20261009/PAX-WEB-BOOKING-UI-20261009.md).
That UAT exists on the parent's unmerged branch, not on this helper's dev base.

| Finding | Reviewed `b79c3715` → unreviewed `869cd21f` source inspection | Next bounded action / verification |
| --- | --- | --- |
| R1/R2/R3/R8/R9/R10/R11 | Reviewer recorded improvements, E19 disabled and PATCH persistence, route/build/export/i18n positives. Newer UAT again lists R2/R11 build pending. | Preserve reviewed positives with their SHA; reconcile stale UAT claims, then verify the new candidate. No automatic acceptance inheritance. |
| R5 settings | Reviewed Page required nonexistent settings and failed init on 404; newer Page catches 404, `PassengerClient.getSettings` remains `Promise<any>`, handlers reject missing lead and Form receives `?? 0`. | Resolve formal source/typed API and scopes first. Missing/invalid config must block quote/order visibly with retry, without a UI default. Do not mistake noncrashing init for a usable booking flow. |
| R5 initial time | Newer Form rounds seconds upward, an apparent source repair of reviewed default-time failure. | Original owner proves seconds 0/30/59; lead 0/15/30; before/equal/after boundary; elapsed-time revalidation. This helper did not run these component cases. |
| R4 geo | Newer provider removes `getHealth` and `evaluateServiceArea`; shared picker explicitly supports optional methods. Search/resolve/reverse still use BFF envelopes. | Preserve existing realm limits; test real provider/picker against allowed HTTP stubs, outage/no-match/403/503 and map pin/reverse. Optional health omission is not a healthy-provider assertion or serviceability proof. Quote is the serviceability gate. A new sanitized health API, if needed, requires formal contract/owner coordination. |
| R6 draft/A04 | Newer source adds ISO→local conversion, P5Map/P5RouteFare composition and `tel:02-2944-0985`. | Verify complete address/time draft on return/expiry/409, UTC offsets, A04 route context/retry and actual phone href; do not label source changes as tested fixes. |
| Design | Newer Form replaces three raw brand values with passenger realm tokens; still derives base theme from platform. No dedicated booking artboard exists. | Screen requirements below; obtain approved app-specific composition and mapping. Token substitutions alone are not final parity. |
| R7 | Newer UAT still lacks complete same-SHA commands/evidence and calls component coverage “end-to-end”. | Original owner preserves R1–R11/Design individually; records actual tests, exits/versions and limits. Component unit cases with stub HTTP can run here; browser/E2E/PG requires hosted evidence. |

## Proposed contract decision for Supervisor / SD / API owner

This is a proposal for formal review, not an accepted addition to SD or a
client implementation permission. Minimal option matching the existing caller:

- Authenticated `GET /api/passenger-app/settings`, via existing BFF cookie/JWT
  boundary, returning the standard success envelope with
  `data.booking.minLeadTimeMinutes: number`. No secrets, administrative health,
  tenant data or unrelated settings are included.
- Read the same `OwnedMobilityService.getMinLeadTimeMinutes()` authority used by
  scheduled booking. Do not duplicate env parsing/defaults in BFF or UI.
  Validate a finite nonnegative number; decide any stronger constraint with the
  API owner instead of silently changing existing fractional-number semantics.
  Existing getter currently permits Infinity, so define invalid-source handling
  and cover it rather than publishing an invalid JSON value.
- Missing/malformed config/response or an unavailable source cannot become a
  15/30/0-minute client fallback. Return a documented error and preserve retry;
  existing unauthorized-session routing remains binding. Final names, domain
  errors, method policy and registration must be in SD/contracts before use.
- Server order creation remains authoritative on timing, account ownership,
  quote and service area. Verify settings/quote/submit agreement and handle
  configuration changes or time passing between calls; client validation cannot
  replace server validation. Test minimum boundary using production methods.

Supervisor may approve another existing formal configuration surface instead,
provided it supplies the same server authority and updates SD/client together.
The UI owner must not choose an undocumented substitute on its own.

### Scope routing and ownership

Observed tasks: PAX-SD is done (Gemini/Codex); PAX-WEB-SHELL is done
(Codex2/Codex); PAX-FARE-QUOTE (Codex2/Codex) is merged and waiting only for hosted
PG acceptance; PAX-BOOKING-HISTORY (Gemini/Codex2) is blocked on
`owned-mobility.service.ts` scope. Do not reopen the merged fare task merely to
report progress or assume the booking task already owns the shared service.

Supervisor must select the existing task/reopen path or register a scoped
follow-up in machine truth before assigning implementation. This document
does not create an unofficial task or reassign another lane. Coordinate:

1. SD/contracts: `01_system_sa_sd.md`, `packages/contracts/src/passenger-app.ts`
   and append-only `packages/contracts/src/index.ts`, with contract tests.
2. API: agreed settings controller/service, PassengerAppModule registration,
   append-only auth policy as needed, shared reservation-service dependency,
   production API unit tests. Check overlap with BOOKING-HISTORY first.
3. Original UI task: typed shared client entry/export files (currently outside
   parent scopes), existing booking/BFF scopes and original UAT. Review actual
   callers before expanding `client.ts`, `src/index.ts`, `p5-ui.tsx`, app
   `tsconfig.json` or root `vitest.config.ts`; global navigation aliases must
   not redirect unrelated tasks to booking mocks. Keep test isolation scoped.
4. Design: assigned canvas author/reviewer and Passenger artboard write scope.
   Parent implementation owner remains Gemini; reviewer remains Codex2.

## Passenger booking screen requirements — awaiting design response

Visual sources read: [Passenger.html](../../../docs/05-ui/drts-design-canvas/智行叫車%20Passenger.html),
[p5-screens.jsx](../../../docs/05-ui/drts-design-canvas/p5-screens.jsx),
[p5-e-screens.jsx](../../../docs/05-ui/drts-design-canvas/p5-e-screens.jsx),
[p5-ui.jsx](../../../docs/05-ui/drts-design-canvas/p5-ui.jsx),
[realm tokens](../../../packages/ui-tokens/src/realms.ts) and
[shared picker requirements](../../../docs/05-ui/drts-design-canvas/address-map-picker-screen-requirements-20260630.md), §5.
Existing artboards cover E19a/E19b, A03/A04 and post-order ride states, not the
booking address/time composition. Stop at these requirements until an approved
Passenger canvas response specifies layout, component props and CTA placement.

- Reservation-only entry, two address searches, actual candidates and selected
  points, reverse/map pin behavior and any permitted manual/degraded state.
- Empty/searching/candidates/selected/no-match/provider-unavailable/out-of-area
  states; distinguish selection from authoritative serviceability at quote.
- Configured earliest time, missing/invalid-setting retry, before-boundary
  error and preservation of local time/addresses on quote retry or return.
- Quote range/version/expiry; expired retry; E19b checkbox truly disabled until
  checked; 401/login; P5-A04 map + original route context and retry/customer
  service. Preserve canonical E19 copy and `02-2944-0985` phone target.
- Match existing Passenger chrome, E19/A03/A04 composition and realm tokens.
  Colors/typography come from `@drts/ui-tokens` and the existing canvas; missing
  border/dark values cannot be invented. Do not substitute platform/shadcn skin.

Required design response: tracked Passenger canvas file/artboard identifiers,
approved revision and independent reviewer, showing the states above. Functional
picker requirements or this note alone do not authorize final visuals.

## Machine-truth writes and exact next step

Only the dispatched current release CLI was used, with `AI_NAME=Codex`:
`/home/lupin/workspace/drts-fleet-platform/.artifacts/releases/orchestrator-0fb44e9576d3/tools/development-orchestrator/bin/ai-status.sh`.
Helper `start` and `progress` exited 0. Required writes attempted:

| Write | Observed result |
| --- | --- |
| `note PAX-WEB-BOOKING-UI-20261009 <route>` | Exit 1: `Dispatched worker cannot mutate a different task`. Parent next step was not updated by this helper. |
| `TASK_METADATA_JSON=<blocked disposition> ... assign <helper> Codex Codex2` | Exit 1: `Dispatched workers must use their assigned task lifecycle commands`. Metadata was not persisted. |
| `blocker <helper> <evidence> Supervisor` | Exit 1: `Unknown agent: Supervisor`; this CLI accepts an agent lane as the waiting target. Use `Claude` for governance coordination, with Supervisor still responsible for authorized state writes. |

No guard removal, role impersonation or direct state-file editing was used.
The required action is recorded in helper `progress`. Supervisor must perform
these writes through its authorized current-release CLI context before handoff:

| Target | Required canonical write |
| --- | --- |
| Helper, preserving Codex/Codex2 | `resolved_parent_status: blocked`; `resolved_parent_waiting_for: Claude`; `resolved_parent_next`: the next step below. Do not fabricate `resolved_parent_at` (lifecycle records it). |
| Parent, preserving Gemini/Codex2 and both acceptance keys | Set `next` to the same concrete route; retain blocked status and route coordination to Supervisor. Do not resume from this planning-only helper. |

**Parent next step:** Supervisor coordinates formal typed reservation settings
backed by `OwnedMobilityService.getMinLeadTimeMinutes`, API/client/shared-file
scopes and an approved Passenger address/time booking canvas. Then original
owner Gemini reconciles latest reviewed `b79c3715` and unreviewed `869cd21f` in
the original UAT, implements typed configuration first, verifies timing/geo/draft
regressions, and resumes screen composition only after design approval. Preserve
R1–R11/Design, `pax-web-booking_flow_and_e19` and
`pax-web-booking_address_time_quote`; no VM runtime. See this artifact and
Q-PAX-WEB-BOOKING-UI-20261009.

Resume gate: persisted coordination/scope ownership and a formal usable API
contract; actual parent implementation checks; approved canvas before visual
work. Existing runtime/PG/browser acceptance stays with hosted workflows/QA.
An open planning PR or green documentation CI does not satisfy those gates.

## Helper acceptance and verification

| Finding / acceptance | Source / change | Old → current evidence | Verification / limits |
| --- | --- | --- | --- |
| Route missing product/contract decision | SD §3/§7, actual client/controller/authority; open-question entry and proposal above | Missing API/scope → named contract/source/scope route | Static source inspection; API decision/implementation still pending. No behavioral fix claimed. |
| Record decision / scope cut / follow-up | This artifact, screen requirements and Q entry | Implicit hold → explicit follow-up; no scope cut | Content/reference check below; no invented palette or endpoint implemented. |
| Task-scoped commit/push/PR | Only this artifact and PHASE1_OPEN_QUESTIONS entry | No planning delivery → task branch anchor and PR | Publication evidence appended below; candidate handoff withheld while disposition missing. |
| Update parent with concrete next step | Current-release `note`/`assign` attempts and helper `progress` | Both writes rejected → exact Supervisor writes recorded | NOT satisfied until authorized Supervisor writes are read back. Parent remains blocked. |
| Parent required acceptance, both keys | Latest independent review and original UAT | Unresolved R5/Design and other regressions preserved | Not performed here: product unit/runtime/PG/browser tests or new parent acceptance. Documentation-only helper. |

### Publication and completed checks

- Anchor: `50910e3b47231ef8446f86b8cf49fcbd9f7315f2`, normally pushed to
  `codex/pax-web-booking-ui-20261009-unblock-planning-decision` (exit 0).
- [Draft planning PR #2522](https://github.com/ajoe734/drts-fleet-platform/pull/2522),
  base `dev`; creation and PR identity readback exited 0. At creation, local,
  remote and PR anchor identity agree. Subsequent evidence commit stays on the
  same branch with an ordinary push; final SHA identity is recorded by CLI
  progress/blocker readback, not treated as a locked candidate.
- `git diff --check 5b11155d33fd4d6c345e01cb9730012d3b3d08d1...HEAD`: exit 0.
- `python3 tools/ci/git/check_commit_trailers.py --base
  5b11155d33fd4d6c345e01cb9730012d3b3d08d1 --head HEAD`: exit 0,
  one anchor commit OK; rerun for the final branch range before closeout.
- `python3 tools/ci/git/check_staged_generated_files.py --staged`: exit 0.
- Canonical consistency initially failed (exit 1) on the anchor because the
  parent UAT was cited as a local dev path even though it exists only on the
  parent's unmerged branch. Corrected to an immutable parent-revision link above.
  The corrected scoped check passed (exit 0); repeat checks for the final branch
  range before closeout. This is a documentation provenance correction, not a
  product finding repair.
- Python 3.12.3 documentation reference probe: exit 0, all 16 local links in
  the new question/helper resolve, including the URL-encoded Passenger filename;
  both parent acceptance keys retained. It checks actual repository paths and
  documentation content, not product behavior. Re-run after this evidence edit.
- Product lint/typecheck/unit/PG/browser/runtime: not run for this two-file
  planning-only change; no product behavior changed. Prior parent checks remain
  tied to their reviewed SHA. No hosted checks or deployment manually started.
- Handoff/merge: withheld while blocked disposition metadata and parent next
  write remain absent. Keep PR draft and report the concrete Supervisor gate;
  do not claim all helper acceptance is satisfied or call `done`.
