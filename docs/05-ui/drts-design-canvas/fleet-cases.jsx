// fleet-cases.jsx — Fleet Partner Portal: 事故 / 申訴 · 案件詳情 / 回覆 / 附件 / 歷程 canvas
// Closes R12 / C067 (SR-FLEET-CASE-001-CANVAS). Extends the /cases list already
// defined in fleet-screens.jsx (FLP_Cases) — reuses FX_FLEET_CASES, FlpShell,
// mgmt shell/primitives/auth. Does NOT modify fleet-screens.jsx (out of write scope).
//
// Ground truth for status/SLA/dedup fields: ComplaintCaseRecord + ComplaintTimelineEntry
// (packages/contracts/src/index.ts). No fleet-partner-case reply/attachment API exists
// yet (SR-FLEET-CASE-001 parent implementation task) — every enabled/disabled state below
// is drawn as `ResourceActionDescriptor`-shaped (Q-X13, see mgmt-auth.jsx ActionButton) so
// the real API decides enablement; the canvas never hard-codes a role check.
// See fleet-cases-screen-contract.md for the full behavior + open-question record.

// cmp_0908 mirrors Ops Console's OC_ComplaintDetail example (same case, same driver
// 黃文豪, same SLA breach) so cross-console screenshots stay consistent — the fleet
// portal is a scoped read/reply view onto the same canonical complaint, not a fork.
const FX_CASE_DETAIL_OPEN = {
  id: 'cmp_0908', type: 'complaint', cat: 'driver_conduct', desc: '乘客反映司機言語不當，已上傳影片證據。',
  driver: '黃文豪', driverId: 'd_8851', severity: 'high', responsibility: 'fleet',
  status: 'in_review', slaTone: 'danger', slaLabel: 'SLA breached',
  openedAt: '2026-05-20 14:30', slaDueAt: '2026-05-22 14:30', slaBreachedAt: '2026-05-22 14:31',
  reopenCount: 1, relatedOrder: 'ord_8175', relatedCall: 'call_2014',
  assignee: '陳維 (ops_compliance)',
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
  { at: '2026-05-23 09:12', tone: 'accent', t: '車行回覆', actor: '陳家豪 (METRO_FLEET)', actorRealm: 'tenant', body: '已與司機當面對證並完成教育訓練，訓練紀錄與行車記錄器截圖已附上。' },
];

const FX_CASE_ATTACHMENTS = [
  { name: 'training_ack_20260523.pdf', size: '482 KB', state: 'done' },
  { name: 'dashcam_clip_0908.mp4', size: '18.4 MB', state: 'uploading', pct: 62 },
  { name: 'driver_statement.jpg', size: '2.1 MB', state: 'fail' },
];

const CASE_ATTACH_ICON = { done: 'check', uploading: 'clock', fail: 'warn' };
const CASE_ATTACH_TONE = { done: 'success', uploading: 'info', fail: 'danger' };
const CASE_ATTACH_LABEL = { done: '已上傳', uploading: '上傳中', fail: '上傳失敗' };

function CaseAttachmentRow({ theme: th, file }) {
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
      {file.state === 'fail' && <Btn theme={th} size="xs" variant="ghost" icon="refresh">重試</Btn>}
    </div>
  );
}

// ── /cases/[caseId] — detail + reply + attachments + timeline ───────────────
// variant 'open'   → fleet-responsibility · SLA breached · reply allowed (cmp_0908)
// variant 'closed' → same case after resolve/close · reply denied · dedup demo
function FLP_CaseDetail({ theme: th, variant = 'open' }) {
  const c = FX_CASE_DETAIL_OPEN;
  const isClosed = variant === 'closed';
  const status = isClosed ? 'closed' : c.status;

  return (
    <FlpShell theme={th} active="cases" breadcrumb={['事故 / 申訴', c.id]}>
      <PageHeader theme={th}
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          {c.id}
          <Pill theme={th} tone={isClosed ? 'neutral' : c.slaTone} dot>{isClosed ? 'closed' : c.slaLabel}</Pill>
          <Pill theme={th} tone="danger">{c.severity}</Pill>
          <Pill theme={th} tone="danger">責任歸屬 · fleet</Pill>
        </span>}
        subtitle={`${c.cat} · ${c.desc}`}
        actions={<>
          <ActionButton theme={th} icon="download" descriptor={{ action: 'export', enabled: true, riskLevel: 'low' }} label="匯出案件" en="export" />
          <ActionButton theme={th}
            descriptor={isClosed
              ? { action: 'respond', enabled: false, disabledReasonCode: 'case_closed', riskLevel: 'medium' }
              : { action: 'respond', enabled: true, riskLevel: 'medium' }}
            icon="check" label="送出回覆" en="respond" />
        </>} />

      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Banner theme={th} tone="info" icon="lock"
            title="車行可見範圍 · fleet-scoped"
            body="僅顯示本車行旗下司機 / 車輛的案件。他車行案件與 platform 責任案件依 API 授權隱藏，不在前端過濾。Ops 始終保留案件 owner。" />

          <Card theme={th} title="案件摘要 · Case summary">
            <DL theme={th} cols={3} items={[
              { k: 'CASE', v: c.id, mono: true },
              { k: 'OPENED', v: c.openedAt, mono: true },
              { k: 'CATEGORY', v: c.cat, mono: true },
              { k: 'SEVERITY', v: c.severity, mono: true },
              { k: '責任歸屬', v: <Pill theme={th} tone="danger" dot>fleet</Pill> },
              { k: 'STATUS · API-owned', v: <Pill theme={th} tone={status === 'closed' ? 'neutral' : 'info'} dot>{status}</Pill> },
              { k: 'SLA STATUS', v: isClosed ? 'resolved before breach 追記' : 'breached', mono: true },
              { k: 'SLA DUE AT', v: c.slaDueAt, mono: true },
              { k: 'SLA BREACHED AT', v: c.slaBreachedAt, mono: true },
              { k: 'REOPENS', v: `${c.reopenCount} 次` },
              { k: '司機', v: `${c.driver} (${c.driverId})`, mono: true },
              { k: 'ASSIGNEE · Ops', v: c.assignee },
              { k: 'RELATED ORDER', v: <a style={{ color: th.accent }}>{c.relatedOrder} →</a> },
              { k: 'RELATED CALL', v: <a style={{ color: th.accent }}>{c.relatedCall} →</a> },
            ]} />
          </Card>

          <Card theme={th} title="歷程 Timeline · cross-actor" subtitle="車行僅可見與本案相關、對車行揭露的事件">
            <Timeline theme={th} events={isClosed
              ? [...FX_CASE_TIMELINE_OPEN, { at: '2026-05-24 10:05', tone: 'success', t: '結案', actor: '陳維', actorRealm: 'ops', body: '已審閱車行回覆與附件，責任處置完成，案件結案。' }]
              : FX_CASE_TIMELINE_OPEN} />
          </Card>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card theme={th} title="回覆處理 · Reply" subtitle="回覆內容、可回覆狀態與錯誤代碼皆由 API 決定">
            {isClosed ? (
              <>
                <Banner theme={th} tone="neutral" icon="lock" title="已結案 · CASE_CLOSED_NO_REPLY"
                  body="closed 案件不得再回覆。如需追加說明，請聯繫 Ops 申請 reopen；reopen 後才會重新開放回覆與附件上傳。" />
                <div style={{ marginTop: 12, fontSize: 11.5, fontWeight: 600, color: th.textMuted, marginBottom: 6 }}>已送出回覆（唯讀）</div>
                <div style={{ fontSize: 12.5, color: th.text, padding: '8px 10px', background: th.surfaceLo, borderRadius: 7, marginBottom: 10 }}>
                  已與司機當面對證並完成教育訓練，訓練紀錄與行車記錄器截圖已附上。
                </div>
              </>
            ) : (
              <Field theme={th} label="回覆內容 · reply" required hint="回覆將寫入案件歷程，Ops 可即時回讀。">
                <textarea style={{
                  width: '100%', minHeight: 90, padding: 10, borderRadius: 7,
                  border: '1px solid ' + th.border, background: th.bgRaised, color: th.text,
                  fontFamily: 'inherit', fontSize: 13, resize: 'vertical', boxSizing: 'border-box',
                }} placeholder="說明已完成的處置與後續預防措施…"></textarea>
              </Field>
            )}

            <div style={{ fontSize: 11.5, fontWeight: 600, color: th.textMuted, margin: '4px 0 8px' }}>附件 · attachments</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {FX_CASE_ATTACHMENTS.map((f, i) => <CaseAttachmentRow key={i} theme={th} file={f} />)}
            </div>
            {!isClosed && (
              <div style={{ marginTop: 10 }}>
                <ActionButton theme={th} size="xs" descriptor={{ action: 'upload_attachment', enabled: true, riskLevel: 'low' }} icon="audit" label="新增附件" en="attach" />
              </div>
            )}
            <div style={{ marginTop: 12, fontSize: 10.5, color: th.textDim, lineHeight: 1.5 }}>
              附件上傳失敗不影響已送出的回覆內容，可個別重試。回覆以 idempotency-key 去重：同一次操作重複送出只保留第一筆，UI 不自行判斷重複。
            </div>
          </Card>

          <Card theme={th} title="Linked entities">
            <DL theme={th} cols={1} items={[
              { k: 'RELATED ORDER', v: c.relatedOrder, mono: true },
              { k: 'RELATED CALL SESSION', v: c.relatedCall, mono: true },
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

// ── /cases — edge / error states (mirrors fleet-supply.jsx FLP_SupplyErrors) ─
function FLP_CaseErrors({ theme: th }) {
  const errs = [
    ['CASE_NOT_FLEET_SCOPED', '嘗試開啟非本車行案件', '僅能存取本車行旗下司機 / 車輛案件'],
    ['CASE_PLATFORM_OWNED', '案件責任歸屬 platform', '唯讀檢視；回覆按鈕停用，車行無法處理'],
    ['CASE_CLOSED_NO_REPLY', '案件已 closed 仍嘗試回覆', '需請 Ops 執行 reopen 才能再次回覆'],
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
  FLP_CaseDetail, FLP_CaseErrors,
});
