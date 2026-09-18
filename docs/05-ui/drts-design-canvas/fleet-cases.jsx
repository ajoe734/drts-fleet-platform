// fleet-cases.jsx — Fleet Partner Portal: 事故 / 申訴 · 案件詳情 / 回覆 / 附件 / 歷程 canvas
// Closes R12 / C067 (SR-FLEET-CASE-001-CANVAS). Extends the /cases list already
// defined in fleet-screens.jsx (FLP_Cases) — reuses FX_FLEET_CASES, FlpShell,
// mgmt shell/primitives/auth. Does NOT modify fleet-screens.jsx (out of write scope).
//
// Ground truth for status/SLA/dedup fields: ComplaintCaseRecord + ComplaintTimelineEntry
// (packages/contracts/src/index.ts). No fleet-partner-case reply/attachment API exists
// yet (SR-FLEET-CASE-001 parent implementation task) — every enabled/disabled state below
// is drawn as `ResourceActionDescriptor`-shaped (Q-X13, see mgmt-auth.jsx ActionButton) so
// the real API decides enablement; read-access failures (attachment/timeline) use the
// EmptyState / EmptyReason taxonomy (Q-X15) instead, since those are GET-failures, not
// command gating. The canvas never hard-codes a role check.
// See fleet-cases-screen-contract.md for the full behavior + requirement traceability.

// cmp_0908 mirrors Ops Console's OC_ComplaintDetail example (same case, same driver
// 黃文豪, same SLA breach) so cross-console screenshots stay consistent — the fleet
// portal is a scoped read/reply view onto the same canonical complaint, not a fork.
// status uses the canonical ComplaintCaseStatus enum (packages/contracts/src/index.ts
// COMPLAINT_CASE_STATUSES) — `reopened` matches the reopen event already in the
// timeline below; the list fixture (fleet-data.jsx FX_FLEET_CASES) still shows a
// pre-existing, out-of-write-scope display label ('in_review') for the same case —
// see fleet-cases-screen-contract.md §6 for that carried-forward mapping note.
const FX_CASE_DETAIL_OPEN = {
  id: 'cmp_0908', type: 'complaint', cat: 'driver_conduct', desc: '乘客反映司機言語不當，已上傳影片證據。',
  driver: '黃文豪', driverId: 'd_8851', severity: 'high', responsibility: 'fleet',
  status: 'reopened', slaTone: 'danger', slaLabel: 'SLA breached',
  openedAt: '2026-05-20 14:30', slaDueAt: '2026-05-22 14:30', slaBreachedAt: '2026-05-22 14:31',
  reopenCount: 1, relatedOrder: 'ord_8175', relatedCall: 'call_2014',
  assignee: '陳維 (ops_compliance)',
};

// cmp_0912 mirrors fleet-data.jsx FX_FLEET_CASES's platform-responsibility row so the
// list → detail link stays reconcilable. severity/status here use the canonical
// ComplaintCaseRecord enums (fleet-data.jsx's 'low'/'pending' are pre-existing,
// out-of-write-scope display labels on that same row — not reused here).
const FX_CASE_DETAIL_PLATFORM = {
  id: 'cmp_0912', type: 'complaint', cat: 'pricing_dispute', desc: '乘客反映車資與預估不符，屬平台計價規則爭議。',
  driver: '林志偉', driverId: 'd_7702', severity: 'normal', responsibility: 'platform',
  status: 'under_investigation', slaTone: 'success', slaLabel: 'on track',
  openedAt: '2026-05-18 09:40', slaDueAt: '2026-05-20 09:40', slaBreachedAt: null,
  reopenCount: 0, relatedOrder: 'ord_7960', relatedCall: null,
  assignee: '王芳 (ops_billing)',
};

const FX_CASE_TIMELINE_OPEN = [
  { at: '2026-05-20 14:30', tone: 'accent', t: '建立', actor: 'eva.wang@yamato.tw', actorRealm: 'tenant', body: '乘客反映司機言語不當，已上傳影片證據。' },
  { at: '2026-05-20 14:42', tone: 'accent', t: '指派', actor: '王芳 → 陳維', actorRealm: 'ops', body: '由 ops_compliance 接手。' },
  { at: '2026-05-20 16:00', tone: 'warn', t: '評論', actor: '陳維', actorRealm: 'ops', body: '已聯絡乘客，安排與司機對證。' },
  { at: '2026-05-22 14:31', tone: 'danger', t: 'SLA breach', actor: 'system.sla', actorRealm: 'system', body: '超出 48h 處理時限。' },
  { at: '2026-05-22 15:00', tone: 'warn', t: 'reopen', actor: '陳維', actorRealm: 'ops', body: '乘客回報相同司機再次違規。' },
  // fleet-partner actor uses the `tenant` realm chip — packages/ui-tokens/src/realms.ts
  // has no dedicated "fleet" RealmName; fleet partners are the external-business-actor
  // bucket the `tenant` tone already represents. Do not invent a new realm color.
  // `attachments` demonstrates group-4's "timeline 的附件呈現" — reuses the existing
  // `audit` icon (already the 附件 icon for the "新增附件" ActionButton below), a local
  // composition inside Timeline's `body` slot (accepts any node), not a new primitive.
  {
    at: '2026-05-23 09:12', tone: 'accent', t: '車行回覆', actor: '陳家豪 (METRO_FLEET)', actorRealm: 'tenant',
    body: '已與司機當面對證並完成教育訓練，訓練紀錄與行車記錄器截圖已附上。',
    attachments: [{ name: 'training_ack_20260523.pdf', size: '482 KB' }, { name: 'dashcam_clip_0908.mp4', size: '18.4 MB' }],
  },
];

const FX_CASE_TIMELINE_PLATFORM = [
  { at: '2026-05-18 09:40', tone: 'accent', t: '建立', actor: 'lin.zhiwei@yamato.tw', actorRealm: 'tenant', body: '乘客反映車資與預估不符。' },
  { at: '2026-05-18 10:05', tone: 'accent', t: '指派', actor: '系統 → 王芳', actorRealm: 'ops', body: '依平台計價規則爭議路由至 ops_billing。' },
  { at: '2026-05-18 11:20', tone: 'accent', t: '責任判定', actor: '王芳', actorRealm: 'ops', body: '計價規則由平台端設定，責任歸屬 platform；車行對此案唯讀。' },
];

const CASE_REPLY_DRAFT = '已與司機當面對證並完成教育訓練，訓練紀錄與行車記錄器截圖已附上。';

const FX_CASE_ATTACHMENTS = [
  { name: 'training_ack_20260523.pdf', size: '482 KB', state: 'done' },
  { name: 'dashcam_clip_0908.mp4', size: '18.4 MB', state: 'uploading', pct: 62 },
  { name: 'driver_statement.jpg', size: '2.1 MB', state: 'fail' },
];

// closed / immutable cases only ever show already-uploaded files — a closed case
// cannot have an in-flight upload or a retry-pending failure, so this fixture never
// carries `uploading` / `fail` rows (fixes the review's "closed 附件仍可重試" finding
// alongside the `readOnly` descriptor gate in CaseAttachmentRow below).
const FX_CASE_ATTACHMENTS_CLOSED = [
  { name: 'training_ack_20260523.pdf', size: '482 KB', state: 'done' },
  { name: 'dashcam_clip_0908.mp4', size: '18.4 MB', state: 'done' },
];

const CASE_ATTACH_ICON = { done: 'check', uploading: 'clock', fail: 'warn' };
const CASE_ATTACH_TONE = { done: 'success', uploading: 'info', fail: 'danger' };
const CASE_ATTACH_LABEL = { done: '已上傳', uploading: '上傳中', fail: '上傳失敗' };

function CaseAttachmentRow({ theme: th, file, readOnly }) {
  const tone = CASE_ATTACH_TONE[file.state];
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 7,
      border: '1px solid ' + (file.state === 'fail' ? th.dangerBorder : th.border),
      background: file.state === 'fail' ? th.dangerBg : th.surfaceLo,
    }}>
      <MgmtIcon name={CASE_ATTACH_ICON[file.state]} size={14} style={{ color: th[tone], flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, color: th.text, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name}</div>
        <div style={{ fontSize: 10.5, color: th.textDim, fontFamily: '"JetBrains Mono", monospace', marginTop: 1 }}>{file.size}</div>
        {file.state === 'uploading' && (
          <div style={{ height: 4, borderRadius: 2, background: th.border, marginTop: 5, overflow: 'hidden' }}>
            <div style={{ width: file.pct + '%', height: '100%', background: th.info }} />
          </div>
        )}
      </div>
      <span style={{ fontSize: 10.5, fontWeight: 600, color: th[tone], flexShrink: 0 }}>{CASE_ATTACH_LABEL[file.state]}</span>
      {/* group-3 "附件授權回讀入口" — download is a read action, available on any already-
          uploaded file regardless of case state (acceptance: 附件可授權回讀). This is not a
          real signed URL — the API owns issuing/expiring the read-back link. */}
      {file.state === 'done' && <Btn theme={th} size="xs" variant="ghost" icon="download" title="授權回讀（簽章由 API 核發）">下載</Btn>}
      {file.state === 'fail' && (
        <ActionButton theme={th} size="xs" icon="refresh" label="重試" en="retry"
          descriptor={readOnly
            ? { action: 'retry_attachment_upload', enabled: false, disabledReasonCode: 'case_closed', riskLevel: 'low' }
            : { action: 'retry_attachment_upload', enabled: true, riskLevel: 'low' }} />
      )}
    </div>
  );
}

function TimelineAttachmentChips({ theme: th, files }) {
  if (!files || !files.length) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
      {files.map((f, i) => (
        <span key={i} style={{
          display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px',
          borderRadius: 6, border: '1px solid ' + th.border, background: th.surfaceLo,
          fontSize: 10.5, color: th.textMuted,
        }}>
          <MgmtIcon name="audit" size={11} style={{ flexShrink: 0 }} />
          {f.name} <span style={{ fontFamily: '"JetBrains Mono", monospace', color: th.textDim }}>· {f.size}</span>
        </span>
      ))}
    </div>
  );
}

// ── /cases/[caseId] — detail + reply + attachments + timeline ───────────────
// variant 'open'     → fleet-responsibility · SLA breached · reply allowed (cmp_0908)
// variant 'closed'   → same case after resolve/close · reply denied · dedup demo
// variant 'platform' → platform-responsibility case · read-only, visible (not hidden)
// replyState (variant 'open' only) → 'idle' | 'submitting' | 'failed' | 'sent'
//   demonstrates group-2's 提交中 / 成功 / 失敗重試 reply feedback states.
function FLP_CaseDetail({ theme: th, variant = 'open', replyState = 'idle' }) {
  const isClosed = variant === 'closed';
  const isPlatform = variant === 'platform';
  const c = isPlatform ? FX_CASE_DETAIL_PLATFORM : FX_CASE_DETAIL_OPEN;
  const status = isClosed ? 'closed' : c.status;
  const timeline = isPlatform ? FX_CASE_TIMELINE_PLATFORM
    : isClosed ? [...FX_CASE_TIMELINE_OPEN, { at: '2026-05-24 10:05', tone: 'success', t: '結案', actor: '陳維', actorRealm: 'ops', body: '已審閱車行回覆與附件，責任處置完成，案件結案。' }]
    : FX_CASE_TIMELINE_OPEN;
  const attachments = isClosed ? FX_CASE_ATTACHMENTS_CLOSED : FX_CASE_ATTACHMENTS;

  return (
    <FlpShell theme={th} active="cases" breadcrumb={['事故 / 申訴', c.id]}>
      <PageHeader theme={th}
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          {c.id}
          {/* group-1 "complaint/incident 識別" — same tone mapping as FLP_Cases's TYPE column
              (fleet-screens.jsx:357: incident→danger, complaint→warn). */}
          <Pill theme={th} tone={c.type === 'incident' ? 'danger' : 'warn'}>{c.type}</Pill>
          <Pill theme={th} tone={isClosed ? 'neutral' : c.slaTone} dot>{isClosed ? 'closed' : c.slaLabel}</Pill>
          <Pill theme={th} tone="danger">{c.severity}</Pill>
          <Pill theme={th} tone={isPlatform ? 'neutral' : 'danger'}>責任歸屬 · {c.responsibility}</Pill>
        </span>}
        subtitle={`${c.cat} · ${c.desc}`}
        actions={<>
          <ActionButton theme={th} icon="download" descriptor={{ action: 'export', enabled: true, riskLevel: 'low' }} label="匯出案件" en="export" />
          <ActionButton theme={th}
            descriptor={isPlatform
              ? { action: 'respond', enabled: false, disabledReasonCode: 'platform_owned', riskLevel: 'medium' }
              : isClosed
              ? { action: 'respond', enabled: false, disabledReasonCode: 'case_closed', riskLevel: 'medium' }
              : replyState === 'submitting'
              ? { action: 'respond', enabled: false, disabledReasonCode: 'submit_in_flight', riskLevel: 'medium' }
              : { action: 'respond', enabled: true, riskLevel: 'medium' }}
            icon={replyState === 'submitting' ? 'clock' : 'check'}
            label={replyState === 'submitting' ? '送出中…' : '送出回覆'} en="respond" />
        </>} />

      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* group-1 可見範圍：非本車行案件依 API 授權隱藏（前端不過濾即已不存在於清單）；
              platform 責任案件則「可見但唯讀」— 與 FLP_CaseErrors 的 CASE_PLATFORM_OWNED
              卡片、fleet-cases-screen-contract.md §4 一致，兩者不再互相矛盾。 */}
          <Banner theme={th} tone="info" icon="lock"
            title="車行可見範圍 · fleet-scoped"
            body="僅顯示本車行旗下司機 / 車輛的案件；他車行案件依 API 授權隱藏，不在前端過濾。責任歸屬 platform 的案件維持可見，但唯讀、回覆停用 — 見下方 variant='platform' 範例。Ops 始終保留案件 owner。" />

          <Card theme={th} title="案件摘要 · Case summary">
            <DL theme={th} cols={3} items={[
              { k: 'CASE', v: c.id, mono: true },
              { k: 'TYPE', v: <Pill theme={th} tone={c.type === 'incident' ? 'danger' : 'warn'}>{c.type}</Pill> },
              { k: 'OPENED', v: c.openedAt, mono: true },
              { k: 'CATEGORY', v: c.cat, mono: true },
              { k: 'SEVERITY', v: c.severity, mono: true },
              { k: '責任歸屬', v: <Pill theme={th} tone={isPlatform ? 'neutral' : 'danger'} dot>{c.responsibility}</Pill> },
              { k: 'STATUS · API-owned', v: <Pill theme={th} tone={status === 'closed' ? 'neutral' : 'info'} dot>{status}</Pill> },
              // SLA is always rendered verbatim from the record, closed or not — a case
              // can close *after* a breach, so closing never retroactively implies
              // "resolved before breach" (fixes the review's SLA self-contradiction).
              { k: 'SLA STATUS', v: c.slaBreachedAt ? 'breached' : 'on_track', mono: true },
              { k: 'SLA DUE AT', v: c.slaDueAt, mono: true },
              { k: 'SLA BREACHED AT', v: c.slaBreachedAt || '—', mono: true },
              { k: 'REOPENS', v: `${c.reopenCount} 次` },
              { k: '司機', v: `${c.driver} (${c.driverId})`, mono: true },
              { k: 'ASSIGNEE · Ops', v: c.assignee },
              { k: 'RELATED ORDER', v: <a style={{ color: th.accent }}>{c.relatedOrder} →</a> },
              { k: 'RELATED CALL', v: c.relatedCall ? <a style={{ color: th.accent }}>{c.relatedCall} →</a> : '—' },
            ]} />
          </Card>

          <Card theme={th} title="歷程 Timeline · cross-actor" subtitle="車行僅可見與本案相關、對車行揭露的事件 · 讀取失敗 / 空歷程見 case-access-states">
            <Timeline theme={th} events={timeline.map(e => ({
              ...e,
              body: <>{e.body}<TimelineAttachmentChips theme={th} files={e.attachments} /></>,
            }))} />
          </Card>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card theme={th} title="回覆處理 · Reply" subtitle="回覆內容、可回覆狀態與錯誤代碼皆由 API 決定">
            {isPlatform ? (
              <Banner theme={th} tone="neutral" icon="eye" title="唯讀檢視 · CASE_PLATFORM_OWNED"
                body="責任歸屬 platform，回覆按鈕停用，車行無法處理。如認為責任歸屬有誤，請聯繫 Ops 申請重新歸屬。" />
            ) : isClosed ? (
              <>
                <Banner theme={th} tone="neutral" icon="lock" title="已結案 · CASE_CLOSED_NO_REPLY"
                  body="closed 案件不得再回覆。如需追加說明，請聯繫 Ops 申請 reopen；reopen 後才會重新開放回覆與附件上傳。" />
                <div style={{ marginTop: 12, fontSize: 11.5, fontWeight: 600, color: th.textMuted, marginBottom: 6 }}>已送出回覆（唯讀）</div>
                <div style={{ fontSize: 12.5, color: th.text, padding: '8px 10px', background: th.surfaceLo, borderRadius: 7, marginBottom: 10 }}>
                  {CASE_REPLY_DRAFT}
                </div>
              </>
            ) : replyState === 'sent' ? (
              <>
                <Banner theme={th} tone="success" icon="check" title="回覆已送出 · CASE_REPLY_RECEIVED"
                  body="已寫入案件歷程，Ops 可即時回讀。回覆以 idempotency-key 去重：重複送出同一操作只回傳原始收據，不會建立第二筆。" />
                <div style={{ marginTop: 12, fontSize: 11.5, fontWeight: 600, color: th.textMuted, marginBottom: 6 }}>已送出回覆（唯讀）</div>
                <div style={{ fontSize: 12.5, color: th.text, padding: '8px 10px', background: th.surfaceLo, borderRadius: 7, marginBottom: 10 }}>
                  {CASE_REPLY_DRAFT}
                </div>
              </>
            ) : (
              <>
                {replyState === 'submitting' && (
                  <div style={{ marginBottom: 10 }}>
                    <Banner theme={th} tone="info" icon="clock" title="回覆送出中" body="請勿重複點擊「送出回覆」；送出完成前按鈕維持停用。" />
                  </div>
                )}
                {replyState === 'failed' && (
                  <div style={{ marginBottom: 10 }}>
                    <Banner theme={th} tone="danger" icon="warn" title="回覆送出失敗 · CASE_REPLY_SUBMIT_FAILED"
                      body="內容未遺失，可直接重試；重試沿用同一 idempotency-key，不會建立重複回覆。"
                      actions={<ActionButton theme={th} size="xs" icon="refresh" label="重試送出" en="retry" descriptor={{ action: 'respond_retry', enabled: true, riskLevel: 'medium' }} />} />
                  </div>
                )}
                <Field theme={th} label="回覆內容 · reply" required hint="回覆將寫入案件歷程，Ops 可即時回讀。">
                  <textarea disabled={replyState === 'submitting'} defaultValue={replyState === 'failed' ? CASE_REPLY_DRAFT : undefined} style={{
                    width: '100%', minHeight: 90, padding: 10, borderRadius: 7,
                    border: '1px solid ' + th.border, background: th.bgRaised, color: th.text,
                    fontFamily: 'inherit', fontSize: 13, resize: 'vertical', boxSizing: 'border-box',
                    opacity: replyState === 'submitting' ? 0.6 : 1,
                  }} placeholder="說明已完成的處置與後續預防措施…"></textarea>
                </Field>
              </>
            )}

            {!isPlatform && (
              <>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: th.textMuted, margin: '12px 0 8px' }}>附件 · attachments</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {attachments.map((f, i) => <CaseAttachmentRow key={i} theme={th} file={f} readOnly={isClosed} />)}
                </div>
                {!isClosed && replyState !== 'submitting' && (
                  <div style={{ marginTop: 10 }}>
                    <ActionButton theme={th} size="xs" descriptor={{ action: 'upload_attachment', enabled: true, riskLevel: 'low' }} icon="audit" label="新增附件" en="attach" />
                  </div>
                )}
                <div style={{ marginTop: 12, fontSize: 10.5, color: th.textDim, lineHeight: 1.5 }}>
                  {isClosed
                    ? '案件已 closed，附件唯讀，僅授權回讀，不可再上傳或重試。'
                    : '附件上傳失敗不影響已送出的回覆內容，可個別重試。回覆以 idempotency-key 去重：同一次操作重複送出只保留第一筆，UI 不自行判斷重複。'}
                </div>
              </>
            )}
            {isPlatform && (
              <>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: th.textMuted, margin: '12px 0 8px' }}>附件 · attachments（唯讀）</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {FX_CASE_ATTACHMENTS_CLOSED.map((f, i) => <CaseAttachmentRow key={i} theme={th} file={f} readOnly />)}
                </div>
              </>
            )}
          </Card>

          <Card theme={th} title="Linked entities">
            <DL theme={th} cols={1} items={[
              { k: 'RELATED ORDER', v: c.relatedOrder, mono: true },
              { k: 'RELATED CALL SESSION', v: c.relatedCall || '—', mono: true },
              { k: 'RELATED INCIDENT', v: '— (未升級)' },
              { k: 'DRIVER', v: `${c.driverId} ${c.driver}`, mono: true },
              { k: 'FLEET PARTNER', v: 'METRO_FLEET', mono: true },
            ]} />
          </Card>
        </div>
      </div>
    </FlpShell>
  );
}

// ── /cases/[caseId] — read-access edge states (Q-X15 EmptyReason, not command
// gating) — group-3 "附件…無權限/不存在/讀取失敗" + group-4 "空歷程/讀取失敗狀態".
// Uses the canonical `EmptyState` primitive (mgmt-auth.jsx) instead of ad hoc cards,
// so the taxonomy matches every other read-failure surface in the canvas.
function FLP_CaseAccessStates({ theme: th }) {
  return (
    <FlpShell theme={th} active="cases" breadcrumb={['事故 / 申訴', 'cmp_0908', '讀取狀態']}>
      <PageHeader theme={th} title="附件 / 歷程 · 讀取狀態" subtitle="R12 · GET 失敗與空狀態，非指令錯誤代碼 — 見 case-errors 頁的寫入/指令錯誤" />
      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Card theme={th} title="附件 · 無權限">
          <EmptyState theme={th} reason="permission_denied" compact messageOverride="您的角色無權授權回讀此附件，請聯繫 Ops 確認存取範圍。" />
        </Card>
        <Card theme={th} title="附件 · 不存在">
          <EmptyState theme={th} reason="no_data" compact messageOverride="附件不存在或已被移除，請確認案件歷程中的原始上傳紀錄。" />
        </Card>
        <Card theme={th} title="附件 · 讀取失敗">
          <EmptyState theme={th} reason="fetch_failed" compact nextAction={{ icon: 'refresh', label: '重試' }} />
        </Card>
        <Card theme={th} title="歷程 · 空歷程">
          <EmptyState theme={th} reason="no_data" compact messageOverride="案件剛建立，尚無歷程事件；這是合法的空狀態。" />
        </Card>
        <Card theme={th} title="歷程 · 讀取失敗" style={{ gridColumn: '1 / -1' }}>
          <EmptyState theme={th} reason="fetch_failed" compact messageOverride="歷程服務暫時無法回應，Ops owner 資訊仍保留於案件摘要。" nextAction={{ icon: 'refresh', label: '重新整理' }} />
        </Card>
      </div>
    </FlpShell>
  );
}

// ── /cases — write/command edge states (mirrors fleet-supply.jsx FLP_SupplyErrors) ─
function FLP_CaseErrors({ theme: th }) {
  const errs = [
    ['CASE_NOT_FLEET_SCOPED', '嘗試開啟非本車行案件', '僅能存取本車行旗下司機 / 車輛案件；案件不在清單中'],
    ['CASE_PLATFORM_OWNED', '案件責任歸屬 platform', '唯讀檢視；回覆按鈕停用，車行無法處理 — 見 case-detail-platform'],
    ['CASE_CLOSED_NO_REPLY', '案件已 closed 仍嘗試回覆', '需請 Ops 執行 reopen 才能再次回覆'],
    ['CASE_REPLY_SUBMIT_FAILED', '回覆送出失敗（網路 / 伺服器錯誤）', '內容不遺失，可直接重試 — 見 case-detail-reply-failed'],
    ['CASE_REPLY_DUPLICATE', '同一 idempotency-key 重複送出回覆', '回傳原始回覆的 receipt，不建立第二筆'],
    ['CASE_ATTACHMENT_UPLOAD_FAILED', '附件直傳物件儲存失敗', '該筆附件可個別重試，不影響已送出的回覆文字'],
    ['CASE_ATTACHMENT_TOO_LARGE', '附件超過大小限制', '請壓縮或分件上傳，限制由 API 回傳'],
  ];
  return (
    <FlpShell theme={th} active="cases" breadcrumb={['事故 / 申訴', '錯誤狀態']}>
      <PageHeader theme={th} title="案件錯誤 / Edge States" subtitle="R12 · 每個錯誤皆由 API 決定，UI 僅呈現訊息與後續指引" />
      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {errs.map(([code, when, fix]) => (
          <Card theme={th} key={code} padding={14}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
              <MgmtIcon name="warn" size={15} style={{ color: th.danger }} />
              <code style={{ fontSize: 12, fontFamily: '"JetBrains Mono", monospace', color: th.danger, fontWeight: 600 }}>{code}</code>
            </div>
            <div style={{ fontSize: 12.5, color: th.text, marginBottom: 4 }}>{when}</div>
            <div style={{ fontSize: 12, color: th.textMuted, display: 'flex', alignItems: 'center', gap: 5 }}><MgmtIcon name="arrow" size={12} />{fix}</div>
          </Card>
        ))}
      </div>
    </FlpShell>
  );
}

Object.assign(window, {
  FLP_CaseDetail, FLP_CaseAccessStates, FLP_CaseErrors,
});
