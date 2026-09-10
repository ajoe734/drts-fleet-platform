# Fleet Partner Portal — 事故 / 申訴案件 Screen Contract

**Task:** `SR-FLEET-CASE-001-CANVAS` (canonical canvas) · unblocks `SR-FLEET-CASE-001` (implementation)
**Source finding:** R12 · **Capability:** C067
**Canvas artifacts:** `fleet-cases.jsx` (`FLP_CaseDetail`, `FLP_CaseAccessStates`, `FLP_CaseErrors`) +
`Fleet Partner Portal.html` (wires the script + 8 artboards under `04 · 品質與責任`) + this doc
**Does not modify:** `fleet-screens.jsx` (`FLP_Cases` list stays as-is; out of this task's write scope)

Revision note (this pass): Codex2 review rejected the prior candidate (HEAD
`688867b114cb9fe8fd6c15a25d3ea971d6590f23`) for thin requirement coverage and four
concrete P2 defects. This revision addresses every point item-by-item in §2 and §3
below, with citations into the rewritten `fleet-cases.jsx`.

## 1. Problem this closes

R12: "事故申訴要求回覆卻未提供流程" — the existing `/cases` canvas (`FLP_Cases` in
`fleet-screens.jsx`) only renders the case *list*; there was no detail, reply,
attachment, or fleet-visible timeline screen, so the "回覆處理" action on the list
had nothing to link to. This task adds those canonical screens so the parent
implementation task (`SR-FLEET-CASE-001`) has a pixel/behavior reference instead
of inventing its own design.

## 2. Requirement traceability — original 5 groups, verbatim sub-items

The 5 groups below are quoted in full from the design-gap note at anchor
`b850e9611b1376048958a0edaa2fee375af0de3f`
(`docs/04-uat/system-remediation-20260906/SR-FLEET-CASE-001.md`, "Screen
requirements" section). Each row maps every sub-clause — not just the group
title — to the artboard and line evidence that closes it.

### Group 1 — 案件詳情："complaint / incident 識別、責任歸屬、Ops owner、API SLA 與可回覆狀態，以及返回列表方式"

| Sub-item | Artboard | Evidence |
|---|---|---|
| complaint/incident 識別 | `case-detail-*` (all variants) | `fleet-cases.jsx` header `Pill` on `c.type` (open/incident tone mapping matches `fleet-screens.jsx:357`'s list TYPE column) + a `TYPE` row in the `Case summary` `DL`. |
| 責任歸屬 | `case-detail-*` | Header `Pill`(`責任歸屬 · {c.responsibility}`) + `DL` row, `danger` tone for `fleet`, `neutral` for `platform`. |
| Ops owner | `case-detail-*` | `DL` row `ASSIGNEE · Ops`, always populated (`陳維`/`王芳`), never blank — Ops retains the case regardless of fleet visibility (Banner copy: "Ops 始終保留案件 owner"). |
| API SLA | `case-detail-*` | `DL` rows `SLA STATUS` / `SLA DUE AT` / `SLA BREACHED AT`, rendered verbatim from the fixture record (`slaBreachedAt` truthiness drives the label, never a client-computed "resolved before breach" — see §3 P2-2 fix). |
| 可回覆狀態 | `case-detail-open/closed/platform` (3 distinct states) | `ActionButton` `descriptor` on "送出回覆": `enabled:true` (open) / `case_closed` (closed) / `platform_owned` (platform) / `submit_in_flight` (submitting). |
| 返回列表方式 | all `case-detail-*`, `case-access-states`, `case-errors` | `breadcrumb={['事故 / 申訴', c.id]}` on `FlpShell`. This is the same convention every sibling *_Detail screen in this canvas uses to return to its list (`OC_ComplaintDetail` → `breadcrumb={['客訴', c.id]}`, `FLP_SubmissionDetail` → `breadcrumb={['送件紀錄', 'sub_r33']}`); the leading crumb is the parent list. `Topbar` breadcrumb items are plain `<span>` (`mgmt-shell.jsx:144-151`) with no click handler anywhere in the canvas — this is a repo-wide static-canvas convention, not a gap specific to this screen, so no new "← back" affordance was invented. |

### Group 2 — 回覆表單："內容輸入、提交中、成功、失敗重試與重送去重的回饋；closed、其他車行、平台責任與權限不足狀態"

| Sub-item | Artboard | Evidence |
|---|---|---|
| 內容輸入 | `case-detail-open` | `Field` + `textarea`, `required`. |
| 提交中 | `case-detail-submitting` (`variant="open" replyState="submitting"`) | `textarea` disabled + dimmed, header `ActionButton` label "送出中…" / `disabledReasonCode: 'submit_in_flight'`, info `Banner` "請勿重複點擊". |
| 成功 | `case-detail-reply-sent` (`replyState="sent"`) | Success `Banner` `CASE_REPLY_RECEIVED` + read-only submitted-reply block (same visual language as closed's read-only reply, for consistency). |
| 失敗重試 | `case-detail-reply-failed` (`replyState="failed"`) | Danger `Banner` `CASE_REPLY_SUBMIT_FAILED` with an inline retry `ActionButton`; `textarea` keeps the draft via `defaultValue` (content is not lost on failure). |
| 重送去重 | all reply states, doc | Copy under the composer: "回覆以 idempotency-key 去重：同一次操作重複送出只保留第一筆" + `CASE_REPLY_DUPLICATE` card on `case-errors`. |
| closed | `case-detail-closed` | `CASE_CLOSED_NO_REPLY` banner, reopen-required copy, read-only submitted reply. |
| 其他車行（cross-fleet） | `case-errors` | `CASE_NOT_FLEET_SCOPED` card — this case never has an in-context detail artboard because, per the visibility rule in §3 P2-4, a not-fleet-scoped case is hidden by the API and never resolves to a detail route at all (there is nothing to render "in context"). |
| 平台責任 | `case-detail-platform` (`variant="platform"`) | Full in-context detail render: header pill `neutral`, Reply card replaced with `CASE_PLATFORM_OWNED` banner, `ActionButton` `disabledReasonCode: 'platform_owned'` (same reason code `fleet-screens.jsx:365` already uses for the list row). This is a **new artboard this revision adds** specifically to give "平台責任" an in-context example, not just the abstract error card. |
| 權限不足（一般） | `case-errors` | `CASE_NOT_FLEET_SCOPED` / `CASE_PLATFORM_OWNED` cards double as the permission-insufficient documentation; `case-detail-platform` gives the platform case a concrete render. |

### Group 3 — 附件："選取／上傳結果、授權回讀入口、無權限／不存在／讀取失敗；不可使用假簽章或假送達"

| Sub-item | Artboard | Evidence |
|---|---|---|
| 選取／上傳結果 | `case-detail-open` | `CaseAttachmentRow` `done`/`uploading` (with progress bar)/`fail` states (unchanged from prior revision). |
| 授權回讀入口 | `case-detail-open/closed/platform` | **New this revision.** Every `state:'done'` row now renders a "下載" `Btn` (`icon="download"`), available regardless of case state — comment explicitly notes "This is not a real signed URL — the API owns issuing/expiring the read-back link," so the UI never fabricates a signature or delivery receipt (satisfies "不可使用假簽章或假送達"). |
| 無權限 | `case-access-states` | `EmptyState theme reason="permission_denied"` (canonical `EMPTY_REASONS`/`EmptyState` primitive from `mgmt-auth.jsx`, not an ad hoc card). |
| 不存在 | `case-access-states` | `EmptyState reason="no_data"` with `messageOverride` — the `EMPTY_REASONS` taxonomy (Q-X15, `mgmt-tokens.jsx:91-99`) has no dedicated "not_found" reason, so `no_data` + an explicit override message is the closest canonical fit; documented here rather than inventing a new reason code outside the shared taxonomy. |
| 讀取失敗 | `case-access-states` | `EmptyState reason="fetch_failed"` with a `nextAction` retry CTA. |

### Group 4 — 同 case 歷程："回覆者、時間、內容及附件如何呈現，並保留 Ops owner；空歷程與讀取失敗狀態"

| Sub-item | Artboard | Evidence |
|---|---|---|
| 回覆者、時間、內容 | `case-detail-open/closed/platform` | `Timeline` events carry `actor`/`actorRealm`/`at`/`body` (unchanged mechanism from prior revision). |
| 附件如何呈現 | `case-detail-open/closed` | **New this revision.** The 車行回覆 timeline entry now carries an `attachments` array rendered via a local `TimelineAttachmentChips` composition (small chips reusing the existing `audit` icon — same icon already used for the "新增附件" button, so no new icon vocabulary). `Timeline`'s `body` prop already accepts any node (`mgmt-primitives.jsx:354`), so this required no change to the shared `Timeline` primitive (out of write scope). |
| 保留 Ops owner | all `case-detail-*` | `ASSIGNEE · Ops` DL row is present in every variant, including `platform`. |
| 空歷程 | `case-access-states` | `EmptyState reason="no_data"`, override copy "案件剛建立，尚無歷程事件；這是合法的空狀態". |
| 讀取失敗 | `case-access-states` | `EmptyState reason="fetch_failed"`, override copy noting Ops owner info still available from the case summary even if the timeline service is down. |

### Group 5 — 列表整合："由 API 決定 action availability、回覆後狀態及 SLA 顯示；現有列表 tabs 的互動規格"

This group's screen (`FLP_Cases`) is `fleet-screens.jsx`, explicitly out of this
task's write scope (see header comment in both canvas files). This canvas does not
duplicate or fork the list; the following is the explicit interaction spec the
reviewer asked for in lieu of a new screen:

- **Tabs** (`fleet-screens.jsx:346-352`): `全部` / `車行責任` / `共同責任` / `已結案`,
  rendered via `PageHeader`'s `tabs`/`activeTab` props. Per repo-wide convention
  (every `PageHeader` `tabs` usage across `platform-sandbox.jsx`, `bank-screens-*.jsx`,
  `ops-screens-*.jsx`, `tenant-screens*.jsx`) these are static, pre-rendered variant
  selectors for the design canvas — none of them wire live client-side filtering in
  this static-HTML gallery; a small number of screens (`platform-screens-3.jsx`,
  `platform-screens-2.jsx`, `ops-supply.jsx`) instead take the active tab as a
  component *prop* so the gallery can register one artboard per tab state. `FLP_Cases`
  currently hardcodes `activeTab="all"` and does not take a `tab` prop — that is an
  existing, out-of-scope characteristic of the list screen, not something this task's
  write scope can change.
- **Action availability**: the row's "回覆處理" `ActionButton` already uses
  `descriptor={{ action:'respond', enabled: r.responsibility !== 'platform',
  disabledReasonCode:'platform_owned', ... }}` (`fleet-screens.jsx:365`) — the same
  `ResourceActionDescriptor` shape and the same `platform_owned` reason code this
  canvas's `case-detail-platform` and `case-errors` `CASE_PLATFORM_OWNED` card use.
  There is no divergence to resolve; the list and detail already share one contract
  shape and one reason-code vocabulary.
- **回覆後狀態 / SLA 顯示**: the list's `STATUS` and `SLA` `Table` columns
  (`fleet-screens.jsx:362-363`) render directly from the same `ComplaintCaseRecord`-
  shaped row the detail screen reads. A fleet reply by itself does not change
  `ComplaintCaseStatus` — only Ops actions (`resolve`/`close`/`reopen`) transition
  status, per the state machine implied by `COMPLAINT_CASE_STATUSES`
  (`packages/contracts/src/index.ts`). So after a reply, the list row's `STATUS`/`SLA`
  cells are unchanged until Ops acts; this canvas does not invent a "replied" status
  value that doesn't exist in the canonical enum.
- Known, pre-existing, **out-of-write-scope** mismatch carried forward (not silently
  ignored): `fleet-data.jsx`'s `FX_FLEET_CASES` fixture uses display labels
  (`status: 'in_review' | 'open' | 'pending'`, `severity: 'low'`) that are **not**
  members of the canonical `ComplaintCaseStatus` enum or `ComplaintCaseRecord.severity`
  union. This canvas's own new fixtures (`FX_CASE_DETAIL_OPEN`, `FX_CASE_DETAIL_PLATFORM`
  in `fleet-cases.jsx`, fully in write scope) use only canonical enum values
  (`reopened`, `under_investigation`, `closed`; `high`, `normal`). The list fixture's
  non-canonical labels are `fleet-data.jsx`, which this task does not own — flagged
  here per reviewer request rather than left unexplained.

`case-errors` and `case-access-states` are edge-state documentation for groups 2–4,
not new requirement groups — `case-errors` covers **write/command** failures
(`ResourceActionDescriptor`-gated), `case-access-states` covers **read/GET**
failures (`EmptyState`/`EmptyReason`-gated). Splitting them mirrors the two
different mechanisms already established elsewhere in the canvas (Q-X13 vs Q-X15,
`mgmt-tokens.jsx`) rather than conflating command errors with empty states in one
grid, which the prior revision did.

## 3. P2 defects from the prior review — fixed this revision

1. **Closed attachments were still retryable.** `case-detail-closed` now reads from
   a dedicated `FX_CASE_ATTACHMENTS_CLOSED` fixture that only ever contains
   `state:'done'` rows (a closed/immutable case cannot have an in-flight upload or a
   pending failure), **and** `CaseAttachmentRow` takes a `readOnly` prop that gates
   the retry `ActionButton` via `descriptor.enabled=false, disabledReasonCode:
   'case_closed'` — defense in depth, not just a fixture swap, per the reviewer's
   explicit ask for an API-action-descriptor gate.
2. **Closed SLA self-contradiction.** The `SLA STATUS` DL row is now derived purely
   from `c.slaBreachedAt` truthiness (`breached` if set, else `on_track`) for every
   variant, closed or not — a case can close *after* a breach, so closing never
   retroactively implies "resolved before breach." `slaBreachedAt`/`slaDueAt` are
   still rendered verbatim from the record, matching §4 below.
3. **Non-canonical `status` value.** `FX_CASE_DETAIL_OPEN.status` changed from
   `'in_review'` (not a member of `COMPLAINT_CASE_STATUSES`) to `'reopened'`, which
   is both a valid enum member and consistent with the existing `reopen` timeline
   event and `reopenCount: 1`. See §2 Group 5's carried-forward note for the
   still-non-canonical, out-of-scope list-fixture value.
4. **Platform visibility contradiction.** The `fleet-scoped` visibility `Banner` no
   longer claims platform-responsibility cases are hidden. It now reads: cross-fleet
   cases are hidden by API authorization (never reach a detail route);
   platform-responsibility cases stay **visible, read-only** — consistent with
   `CASE_PLATFORM_OWNED` on `case-errors` and now demonstrated in full by the new
   `case-detail-platform` artboard.

## 4. API-owned behavior (explicitly NOT decided by this UI)

Per the task brief, the following are contract/API responsibilities. The canvas
renders them as `ResourceActionDescriptor`-shaped props
(`{ action, enabled, disabledReasonCode, riskLevel }`, see `mgmt-auth.jsx`
`ActionButton`) for write actions, and as `EmptyReason`-shaped props
(`EMPTY_REASONS`, see `mgmt-auth.jsx` `EmptyState`) for read failures, precisely so
no UI code hard-codes the logic:

- **Permission / scope** — which cases a fleet actor may even open. Modeled as
  `CASE_NOT_FLEET_SCOPED` (other fleet's case, hidden) and `CASE_PLATFORM_OWNED`
  (platform-responsibility case, visible read-only) in `FLP_CaseErrors`, with
  `case-detail-platform` giving the latter a full in-context render.
- **SLA state** — `slaDueAt` / `slaBreach` / breach timestamp are rendered
  verbatim from the record; the canvas never computes "breached" or "resolved
  before breach" client-side (see §3 item 2).
- **Reply-allowed state** — whether the "送出回覆" `ActionButton` is enabled is a
  `descriptor.enabled` prop, now demonstrated for `open` (enabled), `closed`
  (`case_closed`), `platform` (`platform_owned`), and `submitting`
  (`submit_in_flight`); the API defines every other reason code.
- **Reply submission lifecycle** — `submitting`/`success`/`failed` are UI-visible
  moments in an API-driven request lifecycle; the canvas never decides on its own
  whether a submission succeeded, only renders the three states.
- **Closed-state dedup** — reopening a closed case, or resubmitting a reply, is
  API-arbitrated via idempotency key (matches the existing `IdempotencyService`
  pattern already used by `ComplaintController.createComplaintCase`). The canvas
  documents this as copy under the reply composer and as the `CASE_REPLY_DUPLICATE`
  error card — it does not attempt to simulate idempotency-key generation or
  storage.
- **Attachment-error behavior** — upload failure is per-file (`CaseAttachmentRow`
  `state: 'fail'`) and explicitly does not block or void an already-submitted reply
  (copy: "附件上傳失敗不影響已送出的回覆內容"). Size/type limits are surfaced as
  `CASE_ATTACHMENT_TOO_LARGE` with the limit value left to the API response, not
  hard-coded in the UI. Attachment *read* failures (permission/not-found/fetch)
  are a separate, API-owned concern from *upload* failures — see `case-access-states`.
- **Attachment read-back authorization** — the "下載" entry point on each uploaded
  file is a UI affordance only; the actual signed URL, its expiry, and any
  audit-gating are issued by the API. The canvas never fabricates a signature or a
  delivery receipt.

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
  `ActionButton`, `Field`, `Btn`, `MgmtIcon`, `EmptyState`) is an existing import
  from `mgmt-primitives.jsx` / `mgmt-auth.jsx` / `mgmt-tokens.jsx`. No new shared
  primitive was created; `CaseAttachmentRow` and `TimelineAttachmentChips` in
  `fleet-cases.jsx` are local compositions of existing primitives (`MgmtIcon`,
  `Btn`, `ActionButton` + inline layout), following the same "local composition,
  not new primitive" pattern as `fleet-screens.jsx`'s `SvcChip`.
- `case-access-states` deliberately reuses the canonical `EmptyState` primitive
  (already used elsewhere for GET-failure taxonomy) instead of the ad hoc
  `Card`-per-error-code layout `FLP_CaseErrors` uses for write/command errors —
  this is not visual inconsistency; it mirrors the same read-vs-write mechanism
  split already established across the console suite (Q-X13 vs Q-X15).
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
- The `fleet-data.jsx` list-fixture status/severity label mismatch documented in
  §2 Group 5 — out of this task's write scope; flagged so a future
  `SR-FLEET-DATA` pass can align it with the canonical enum instead of the
  mismatch being silently perpetuated.
- Whether attachments remain downloadable after `closed` (acceptance says
  "附件可授權回讀") is now shown as an active, enabled "下載" entry point in
  `case-detail-closed` and `case-detail-platform` (previously only implied by
  copy, not rendered); actual authorization (signed URL expiry, audit-gated
  re-download) remains an API concern.
