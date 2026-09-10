# SR-HOST-FE-001 — Host screen requirements / blocked evidence

Date: 2026-09-10. Owner: Codex2. Reviewer: Gemini.

## Baseline and disposition

- Dispatch HEAD: `396904179665a3b602d25931c4db6a2d006fb812`.
- Fresh `origin/dev` and inspected base: `e6415ede5aebc2fb280cf8f2871ee55e460a4b6e`.
- Branch: `codex2/sr-host-fe-001`; clean branch fast-forwarded to that base.
- `SR-CONTRACT-001` is canonical `done`, candidate `0d0848fd8c48c7897e4f00d6965febadf5d69337`, PR #1872, merged at this base. The stale dispatch dependency warning is resolved.
- No implementation candidate: this commit records a design blocker only. No handoff, runtime completion, CI, merge or acceptance is claimed.

## Missing canonical screens

Read `docs/05-ui/drts-design-canvas/Fleet Partner Portal.html`, `fleet-screens.jsx`, the existing `fleet-portal-missing-scope-screen-requirements-20260808.md`, and `packages/ui-tokens/src/realms.ts`.

The canvas enumerates fleet workspace/supply/revenue/quality and referral artboards. `FLP_ACTOR` is `flp_admin`; vehicle actions include adding vehicles. It contains no Host role entry or owned-vehicle detail screens. The existing missing-scope note covers the app error boundary, not Host. Current app routes also contain no `app/host/` pages. This reproduces the missing surface on current dev rather than relying on the historical audit SHA.

The dispatch UI Design Contract explicitly says: “If the canvas lacks a screen, write a screen-requirements note and STOP — never substitute your own design.” No UI was authored.

## Required design coverage before implementation

Supervisor/design owner must supply canonical Host artboards and their token mapping, with any canvas writer scope/dependencies assigned outside this task. This note is requirements, not an alternative visual design.

- Host entry within the active Fleet Partner Portal: authenticated `partner` / `individual_owner`, restricted navigation and no admin or mutation controls. Shared layout/navigation remains owned by `SR-WIRE-001`.
- Owned-vehicle list: approved columns, filters, pagination for long lists, selection and scope-preserving return navigation; loading, no vehicles and no matching results.
- Per-vehicle read-only earnings, maintenance, trips and cases: approved layout, fields, date filters and pagination retaining `vehicleId`; no unrestricted fleet links.
- No permission, uniform unavailable vehicle for `404 HOST_VEHICLE_NOT_FOUND`, and retryable data failure; no stale vehicle data after selection changes.
- Earnings: distinguish zero revenue, no records and unknown settlement. Null `fleetCommission` / `netEarnings` with `pending_policy` must not become zero or fabricated percentages.
- Privacy: masked VIN, district-only trip locations and redacted case conclusions. No passenger contact or street-address details.
- Colors/typography must use `@drts/ui-tokens`. The contract's IAM realm is `partner`, while `REALM_COLORS` enumerates tenant/ops/platform/system/driver; design must identify the approved mapping rather than adding a local palette.

Traceability: `phase1_prd_detailed_v1.md` §12.6; source gap `N03`; coverage capability `C012`; `feature-contracts.md` §4. Authoritative types are in `packages/contracts/src/system-remediation.ts`; typed client methods are `listHostVehicles`, `getHostVehicleEarnings`, `listHostVehicleMaintenance`, `listHostVehicleTrips`, `listHostVehicleCases`. These are available at the base and must be reused after design unblocks.

## Executed checks and limits

- `git fetch origin`: exit 0.
- `ai-status.sh show SR-CONTRACT-001`: exit 0, done and merged evidence above.
- `git ls-remote --heads origin codex2/sr-host-fe-001`: exit 0, no published branch before this work.
- `gh pr list --head codex2/sr-host-fe-001 --state all --json number,state,headRefOid`: exit 0, `[]`.
- `git log --oneline origin/dev..HEAD`: exit 0, empty before fast-forward.
- `git merge --ff-only origin/dev`: exit 0, fast-forward to base.
- `rg -n 'Host|車主|/host' docs/05-ui/drts-design-canvas --glob '*fleet*' --glob '*Fleet*'`: exit 1, no matches.
- `rg --files apps/fleet-partner-portal-web/app`: exit 0; no Host routes.
- Product typecheck and Vitest were not run: no implementation or regression tests authored due to the explicit design stop gate.
- No live API resource IDs, test identities or browser/device results acquired. No product server, preview server, Playwright or Docker Compose started under the VM restriction.

Unblock action: supervisor routes missing Host canvas coverage to an authorized design writer, then redispatches this task against the accepted design. Backend/live integration and same-candidate review/CI remain subsequent work.
