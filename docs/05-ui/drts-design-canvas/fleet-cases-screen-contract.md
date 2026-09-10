# Fleet Partner Portal — 事故 / 申訴案件 Screen Contract

**Task:** `SR-FLEET-CASE-001-CANVAS` (canonical canvas) · unblocks `SR-FLEET-CASE-001` (implementation)
**Source finding:** R12 · **Capability:** C067
**Canvas artifacts:** `fleet-cases.jsx` (new) + `Fleet Partner Portal.html` (wires the script + 3 new artboards under `04 · 品質與責任`) + this doc
**Does not modify:** `fleet-screens.jsx` (`FLP_Cases` list stays as-is; out of this task's write scope)

## 1. Problem this closes

R12: "事故申訴要求回覆卻未提供流程" — the existing `/cases` canvas (`FLP_Cases` in
`fleet-screens.jsx`) only renders the case *list*; there was no detail, reply,
attachment, or fleet-visible timeline screen, so the "回覆處理" action on the list
had nothing to link to. This task adds those canonical screens so the parent
implementation task (`SR-FLEET-CASE-001`) has a pixel/behavior reference instead
of inventing its own design.

## 2. Five requirement groups covered

| # | Group | Screen / artboard | Notes |
|---|-------|--------------------|-------|
| 1 | Case list / overview | `cases` (existing, `FLP_Cases`) | Unchanged. Entry point; "回覆處理" row action links to group 2. |
| 2 | Case detail | `case-detail-open`, `case-detail-closed` (`FLP_CaseDetail`) | Case summary `DL`, responsibility badge, SLA fields. |
| 3 | Reply | `case-detail-open` (reply panel), `case-detail-closed` (denied state) | Textarea composer + `ActionButton` gated by API descriptor. |
| 4 | Attachments | `case-detail-open` / `case-detail-closed` (attachments list), `case-errors` | Per-file done/uploading/failed rows; retry is per-file. |
| 5 | Timeline | `case-detail-open` / `case-detail-closed` (`Timeline` card) | Cross-actor, fleet-visible slice only; reuses Ops's `Timeline` primitive. |

`case-errors` is a 6th artboard but is edge-state documentation for groups 3–4,
not a new requirement group — it mirrors the established
`fleet-supply.jsx` → `FLP_SupplyErrors` pattern.

## 3. Data model this design is drawn from

No dedicated fleet-partner-case reply/attachment contract exists yet. The canvas
is drawn from the existing complaint/incident authority that
`SR-FLEET-CASE-001`'s runbook says to reuse ("以現有 complaint/incident authority
接回覆與附件"):

- `ComplaintCaseRecord`, `ComplaintCaseStatus` (`new | assigned | under_investigation
  | resolved | closed | reopened`), `ComplaintTimelineEntry` —
  `packages/contracts/src/index.ts:4685-4792`.
- Existing endpoints on `ComplaintController` / `IncidentController`
  (`apps/api/src/modules/complaint/complaint.controller.ts`,
  `.../incident/incident.controller.ts`): `GET/POST :caseNo`, `:caseNo/timeline`,
  `:caseNo/notes`, `:caseNo/reopen`, `:caseNo/resolve`, `:caseNo/close`,
  `:caseNo/sla-breach`.
- `AddComplaintCaseNoteCommand` is the closest existing primitive to "reply" —
  the fleet-facing reply is a new, narrower surface over the same case, not a
  new case type. **Fields for the fleet reply + attachment commands and the
  attachment storage model are not yet contracted.** `SR-FLEET-CASE-001` (or a
  `SR-CONTRACT` follow-up) must define them; this canvas does not invent field
  names beyond what's shown (`reply text`, `attachment: {name, size, state}`).
- Case fixture `cmp_0908` intentionally reuses the same id/driver/severity/SLA
  values as Ops Console's `OC_ComplaintDetail` (`ops-screens-2.jsx:54-124`) and
  `mgmt-data.jsx:74` so the fleet and ops views of the same case stay visually
  reconcilable.

## 4. API-owned behavior (explicitly NOT decided by this UI)

Per the task brief, the following are contract/API responsibilities. The canvas
renders them as `ResourceActionDescriptor`-shaped props
(`{ action, enabled, disabledReasonCode, riskLevel }`, see `mgmt-auth.jsx`
`ActionButton`) precisely so no UI code hard-codes the logic:

- **Permission / scope** — which cases a fleet actor may even open. Modeled as
  `CASE_NOT_FLEET_SCOPED` (other fleet's case) and `CASE_PLATFORM_OWNED`
  (platform-responsibility case, read-only) in `FLP_CaseErrors`. The existing
  `FLP_Cases` list row already gates "回覆處理" on `responsibility !== 'platform'`
  (`fleet-screens.jsx:365`) — this canvas keeps that same descriptor shape and
  extends it with the fleet-scope check, which today has no enforcement point
  in the canvas fixtures because there is no cross-fleet fixture case to deny.
- **SLA state** — `slaDueAt` / `slaBreach` / breach timestamp are rendered
  verbatim from the record; the canvas never computes "breached" client-side.
- **Reply-allowed state** — whether the "送出回覆" `ActionButton` is enabled is
  a `descriptor.enabled` prop. The canvas only demonstrates the two states the
  fixture data implies (`open` → enabled, `closed` → disabled with
  `disabledReasonCode: 'case_closed'`); the API defines every other reason code.
- **Closed-state dedup** — reopening a closed case, or resubmitting a reply, is
  API-arbitrated via idempotency key (matches the existing
  `IdempotencyService` pattern already used by
  `ComplaintController.createComplaintCase`). The canvas documents this as
  copy under the reply composer and as the `CASE_REPLY_DUPLICATE` error card —
  it does not attempt to simulate idempotency-key generation or storage.
- **Attachment-error behavior** — upload failure is per-file
  (`CaseAttachmentRow` `state: 'fail'`) and explicitly does not block or void
  an already-submitted reply (copy: "附件上傳失敗不影響已送出的回覆內容"). Size/type
  limits are surfaced as `CASE_ATTACHMENT_TOO_LARGE` with the limit value left
  to the API response, not hard-coded in the UI.

## 5. Visual authority compliance

- No new colors were introduced. All tone/status colors come from
  `buildMgmtTheme({ console: 'fleet', ... })` (`mgmt-tokens.jsx`), the same
  theme builder every other Fleet Partner Portal screen already uses via
  `FlpShell`.
- The cross-actor timeline reuses the `tenant` realm chip
  (`REALM_COLORS.tenant`, teal `#0F766E` / `#5EEAD4` per
  `packages/ui-tokens/src/realms.ts`) for the fleet-partner actor. There is no
  `fleet` entry in `RealmName` — fleet partners are the external-business-actor
  bucket `tenant` already represents in the shared realm taxonomy, and
  `packages/ui-tokens/src/realms.ts`'s own doc-comment says these tones are
  "shared across the ops / admin / tenant / partner / fleet consoles." This
  canvas does not add a new realm color for "fleet."
- Every primitive used (`Card`, `Table`, `Pill`, `Banner`, `DL`, `Timeline`,
  `ActionButton`, `Field`, `Btn`, `MgmtIcon`) is an existing import from
  `mgmt-primitives.jsx` / `mgmt-auth.jsx` / `mgmt-tokens.jsx`. No new shared
  primitive was created; `CaseAttachmentRow` in `fleet-cases.jsx` is a local
  composition of existing primitives (`MgmtIcon` + inline layout), following
  the same "local composition, not new primitive" pattern as
  `fleet-screens.jsx`'s `SvcChip`.
- Reference precedents matched pixel-for-pixel in structure (not copy-pasted,
  re-derived from the same primitives): `ops-screens-2.jsx`
  `OC_ComplaintDetail` / `OC_IncidentDetail` (detail layout: 1.4fr/1fr grid,
  `Case summary` `DL`, `Timeline` card) and `fleet-supply.jsx`
  `FLP_SupplyErrors` (error-card grid) / `FLP_SupplyDocuments` (per-file
  upload/status row) / `driver-sos.jsx` `S3D_Attach` (upload state labels
  已上傳 / 上傳中 / 上傳失敗 and the "upload failure doesn't void the submission"
  copy pattern).

## 6. Open questions carried forward (not resolved by this canvas)

- Exact reply + attachment command/field names and the attachment storage
  contract (pre-signed upload vs. multipart) — owned by `SR-FLEET-CASE-001` /
  a contract follow-up, not this canvas.
- Whether `case_closed` reply denial permits any exception path (e.g. Ops-only
  addendum) — the canvas shows only the "must reopen" message implied by the
  existing `ComplaintCaseStatus` state machine (`closed` → `reopened` via
  `:caseNo/reopen`); it does not invent a bypass.
- Whether attachments remain downloadable after `closed` (acceptance says
  "附件可授權回讀") is shown as read-only-but-visible in `case-detail-closed`;
  actual authorization (signed URL expiry, audit-gated re-download) is an API
  concern.
