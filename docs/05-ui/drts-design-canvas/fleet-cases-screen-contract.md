# Fleet Partner Portal — Case Detail / Reply / Attachment / Timeline Screen Contract

**Date:** 2026-09-10
**Task:** `SR-FLEET-CASE-001-CANVAS` (unblocks `SR-FLEET-CASE-001`)
**Surface:** `apps/fleet-partner-portal-web/app/cases/`
**Author lane:** Claude2 · Reviewer: Codex2
**Visual authority:** `docs/05-ui/drts-design-canvas/Fleet Partner Portal.html` · `docs/05-ui/drts-design-canvas/fleet-screens.jsx` (`FLP_Cases`, lines 341–371) · `docs/05-ui/drts-design-canvas/fleet-cases.jsx` (this task) · `packages/ui-tokens/src/realms.ts` · `docs/05-ui/drts-design-canvas/mgmt-tokens.jsx` (`MGMT_ACCENTS.fleet`, emerald `#047857`)

## 1. Gap and how it is closed

`fleet-screens.jsx` `FLP_Cases` (existing, unmodified by this task) defines the case *list*
only — columns, tabs, and a `respond` `ActionButton` — with no screen for what opens when
that action fires. `docs/04-uat/system-remediation-20260906/SR-FLEET-CASE-001.md` (anchored
by Codex2, `b850e9611b1376048958a0edaa2fee375af0de3f`) recorded this as a canvas gap and
enumerated five requirement groups. `fleet-cases.jsx` (added by this task) provides the
missing screens; nothing in `fleet-screens.jsx` is changed, so the existing list, its tabs,
and its `disabledReasonCode`-driven respond button keep working as-is.

No redesign: every screen reuses `FlpShell`/`FLP_NAV`/`PageHeader`/`Card`/`Table`/`Banner`/
`Pill`/`DL`/`Timeline`/`ActionButton` from `mgmt-shell.jsx`, `mgmt-primitives.jsx`, and
`mgmt-auth.jsx`, themed by `buildMgmtTheme({ console: 'fleet' })` — same emerald accent,
density, and typography as the rest of the Fleet Partner Portal canvas. Colors are never
hardcoded; every screen reads `th.*` from the theme object.

## 2. Requirement groups → screens (`Fleet Partner Portal.html` § `04b`)

| # | Requirement (from SR-FLEET-CASE-001.md) | Artboard(s) |
| - | --- | --- |
| 1 | 案件詳情：識別、責任歸屬、Ops owner、API SLA、可回覆狀態、返回列表 | `case-detail-fleet`, `case-detail-shared`, `case-detail-platform` (`FLP_CaseDetail`) |
| 2 | 回覆表單：input / submitting / success / error+retry / resend dedup；closed / 他車行 / 平台責任 / 無權限 | `case-reply-states` (`FLP_CaseReplyStates`), plus the closed case's inline dedup banner in `case-detail-closed` |
| 3 | 附件：選取上傳 / 授權回讀 / 無權限 / 不存在 / 讀取失敗 | `case-attachment-states` (`FLP_CaseAttachmentStates`), plus the live attachment panel in each `case-detail-*` artboard |
| 4 | 同 case 歷程：回覆者／時間／內容／附件、Ops owner 保留、空歷程與讀取失敗 | `case-detail-timeline-empty`, `case-detail-timeline-error`, plus the populated timeline in `case-detail-fleet` |
| 5 | 列表整合：API 決定 action availability、回覆後狀態、SLA 顯示 | §3 below — no code change; documents the contract the existing `FLP_Cases` list already depends on |

`case-errors` (`FLP_CaseErrors`) is a reference card, mirroring `FLP_SupplyErrors`, that
enumerates the edge-state codes every screen above renders.

## 3. API-owned behavior contract

Every value below **must** come from the backend response; the portal must never compute,
cache-override, or infer it client-side. This mirrors the pattern already implemented for
complaint/incident cases (`apps/api/src/modules/complaint/complaint.service.ts`,
`apps/api/src/modules/incident/incident.service.ts`) and for pre-signed attachments
(`apps/api/src/modules/driver-sos/driver-sos-attachment.ports.ts`,
`FLP_SupplyDocuments` in `fleet-supply.jsx`). `SR-FLEET-CASE-001` is expected to reuse those
authorities rather than re-implement them for the fleet surface.

- **Permission / fleet scope** — `canReply` (and equivalent read-scope for attachments and
  timeline) must reflect the backend's fleet-partner-id check. `other_fleet` /
  `FLEET_SCOPE_DENIED`-style denial is a 403-class response, not a hidden row. The reply
  button and attachment download links render `disabled` with the server-supplied
  `disabledReasonCode` (see `ActionButton` in `mgmt-auth.jsx`); the portal does not decide
  eligibility from cached case data.
- **SLA** — `sla` (`on_track` / `breached`) and `slaDueAt` / `slaBreachedAt` are rendered
  verbatim from the API, exactly as `OC_ComplaintDetail` already does on the Ops side for
  the same case. The portal must not recompute breach locally from `slaDueAt` and the
  client clock.
- **Closed-state and dedup** — a `closed` case (`FLP_CASE_STATUS.closed`) disables the
  reply composer (`reason: 'case_closed'`); reopening is an Ops-only action
  (`ComplaintService.reopenComplaintCase`, only valid `from status === "closed"`), not a
  fleet self-service control. Resubmitting the same reply payload must be idempotent: the
  existing platform pattern is the `Idempotency-Key` header handled by
  `IdempotencyService` / `applyIdempotentResponseHeaders` (see
  `ComplaintController.createComplaintCase`), which the fleet reply endpoint should reuse
  so a duplicate submit returns the original result instead of creating a second timeline
  entry. `case-detail-closed` and the `dedup` state in `case-reply-states` render that
  contract; they do not invent a different dedup mechanism.
- **Attachment errors** — uploads follow the existing pre-signed pattern (`createUploadIntent`
  → direct-to-storage PUT → `inspectUploadedObject` confirm, as in
  `driver-sos-attachment.ports.ts`, and the "pre-signed 上傳流程" banner already shipped in
  `FLP_SupplyDocuments`). A file is only marked `clean`/readable after the backend scan
  result says so; `blocked`, `denied`, `not_found`, and `read_failed` are distinct states
  with distinct copy (`FLP_ATTACH_STATUS`, `CaseAttachments` in `fleet-cases.jsx`) — the UI
  never fabricates a signature or a "delivered" state ahead of backend confirmation.
- **Timeline** — the same cross-actor timeline Ops sees (`OC_ComplaintDetail` /
  `OC_IncidentDetail` `Timeline` cards) must be reused, not a portal-only copy. Ops owner
  (`opsOwner`) is never reassigned by a fleet reply. Empty timeline is a legal state (new
  case, no actions yet); fetch failure is a distinct state with retry, not an empty list.

## 4. List integration (`fleet-screens.jsx` `FLP_Cases`, unchanged)

- Tabs (`全部` / `車行責任` / `共同責任` / `已結案`) filter server-returned rows by the same
  `responsibility` / `status` fields rendered in the detail screens above; the portal does
  not derive a fifth local filter.
- The `respond` `ActionButton` (`fleet-screens.jsx:365`) already disables for
  `responsibility === 'platform'` with `disabledReasonCode: 'platform_owned'` — this
  contract extends that same reason-code vocabulary (`platform_owned`, `other_fleet`,
  `case_closed`) into the detail/reply screens so the list and detail never disagree about
  why an action is unavailable.
- Row click routes to `case-detail-*` (`/cases/[caseId]`); after a reply, the list's
  `status`/`sla` columns must reflect the same API state the detail screen just rendered —
  the implementation task should refetch or reconcile, not optimistically patch the row
  with a client guess.

## 5. Verification boundary

This task only edits `docs/05-ui/drts-design-canvas/fleet-cases.jsx`,
`docs/05-ui/drts-design-canvas/Fleet Partner Portal.html`, and this contract file — a static
design-canvas artifact. No product code, API, or portal route was touched; no live API,
upload, or resource ID was exercised. Per VM restriction, no dev server, preview server, or
browser test runner was started, so the canvas was reviewed by reading the JSX against the
existing shared primitives and theme builder rather than rendering it. Once reviewed and
merged, `SR-FLEET-CASE-001` should resume against §2–4 above instead of re-deriving screen
requirements.
