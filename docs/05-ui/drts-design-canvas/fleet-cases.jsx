// fleet-cases.jsx — Fleet Partner Portal: case detail / reply / attachment / timeline.
// EXTENDS fleet-screens.jsx FLP_Cases (341–371) with the drill-in screens the list
// action ("回覆處理") opens. Reuses FlpShell/FLP_NAV + mgmt primitives. Emerald realm.
// API-owned: responsibility, SLA, reply-availability, dedup and attachment scan status
// are never computed client-side — every state below renders a value the API already
// returned. See fleet-cases-screen-contract.md for the full behavior contract.

// ── case status vocab (mirrors complaint/incident service `status` + `sla`) ──
const FLP_CASE_STATUS = {
  in_review: { zh: '處理中', en: 'in_review', tone: 'info' },
  pending:   { zh: '待回覆', en: 'pending', tone: 'warn' },
  resolved:  { zh: '已結案', en: 'resolved', tone: 'success' },
  closed:    { zh: '已關閉', en: 'closed', tone: 'neutral' },
  reopened:  { zh: '重啟', en: 'reopened', tone: 'warn' },
};
function casePill(th, s) { const m = FLP_CASE_STATUS[s] || FLP_CASE_STATUS.pending; return <Pill theme={th} tone={m.tone} dot>{m.zh}<span style={{ marginLeft: 4, opacity: .6, fontFamily: SHELL_MONO, fontSize: 9.5 }}>{m.en}</span></Pill>; }

// ── reply-availability reason codes → readable zh (API-decided, UI only maps to text) ──
const FLP_CASE_REPLY_REASONS = {
  platform_owned:  { zh: '責任歸屬平台，車行無回覆權限', fix: '如有異議請聯絡平台窗口' },
  other_fleet:     { zh: '案件不屬於貴車行', fix: '僅能檢視與回覆本車行案件' },
  case_closed:     { zh: '案件已關閉', fix: '如需追加說明請聯絡 Ops 申請重啟' },
  duplicate_reply: { zh: '偵測到相同內容重複送出', fix: '已忽略重複請求，沿用先前回覆結果' },
};

// ── attachment scan status (mirrors platform pre-signed upload + scan pattern,
//    e.g. driver-sos attachment ports / fleet-supply pre-signed docs) ──────────
const FLP_ATTACH_STATUS = {
  uploading: { zh: '上傳中', tone: 'info' },
  scanning:  { zh: '掃描中', tone: 'info' },
  clean:     { zh: '可讀取', tone: 'success' },
  blocked:   { zh: '掃描阻擋', tone: 'danger' },
  denied:    { zh: '無授權', tone: 'danger' },
  not_found: { zh: '不存在', tone: 'neutral' },
  read_failed:{ zh: '讀取失敗', tone: 'warn' },
};

// ── fixtures — same 3 cases as FLP_Cases (fleet-screens.jsx), detail-expanded ──
const FX_CASE_DETAIL = {
  cmp_0908: {
    id: 'cmp_0908', type: 'complaint', cat: 'driver_conduct', driver: '黃文豪', vehicle: 'ARJ-3308',
    severity: 'high', responsibility: 'fleet', status: 'in_review', sla: 'breached',
    slaDueAt: '2026-05-22 14:30', slaBreachedAt: '2026-05-22 14:31',
    opsOwner: '陳維 (ops_compliance)', order: 'ord_8198', tenant: 'YAMATO',
    desc: '乘客反映司機言語不當，已上傳影片證據。', reopenCount: 0,
    canReply: true, replyReason: null,
  },
  inc_0213: {
    id: 'inc_0213', type: 'incident', cat: 'collision', driver: '張育成', vehicle: 'ARJ-3401',
    severity: 'medium', responsibility: 'shared', status: 'pending', sla: 'on_track',
    slaDueAt: '2026-05-11 09:00', slaBreachedAt: null,
    opsOwner: '林經理 (safety_lead)', order: 'ord_8260', tenant: 'TPE_HOTEL_GRP',
    desc: '路口擦撞，雙方無人受傷，車損待估。責任待車行與平台共同確認。', reopenCount: 0,
    canReply: true, replyReason: null,
  },
  cmp_0912: {
    id: 'cmp_0912', type: 'complaint', cat: 'pricing_dispute', driver: '林志偉', vehicle: 'ARJ-2891',
    severity: 'low', responsibility: 'platform', status: 'pending', sla: 'on_track',
    slaDueAt: '2026-05-25 18:00', slaBreachedAt: null,
    opsOwner: '王芳 (ops_billing)', order: 'ord_8231', tenant: 'TSMC_FAB18',
    desc: '乘客對車資計算有異議，屬平台計費規則爭議。', reopenCount: 0,
    canReply: false, replyReason: 'platform_owned',
  },
  cmp_0899: {
    id: 'cmp_0899', type: 'complaint', cat: 'lost_item', driver: '吳鎮宇', vehicle: 'ARJ-3502',
    severity: 'low', responsibility: 'fleet', status: 'closed', sla: 'on_track',
    slaDueAt: '2026-05-02 12:00', slaBreachedAt: null,
    opsOwner: '陳維 (ops_compliance)', order: 'ord_8175', tenant: 'YAMATO',
    desc: '乘客遺失物已由車行協助尋回並歸還，案件已結案關閉。', reopenCount: 0,
    canReply: false, replyReason: 'case_closed',
  },
};

const FX_CASE_TIMELINE = {
  cmp_0908: [
    { at: '05-20 14:30', tone: 'accent', t: '建立', actor: 'eva.wang@yamato.tw', actorRealm: 'tenant', body: '乘客反映司機言語不當，已上傳影片證據。' },
    { at: '05-20 14:42', tone: 'accent', t: '指派', actor: 'Ops → 陳維', actorRealm: 'ops', body: '由 ops_compliance 接手，通知車行說明。' },
    { at: '05-21 09:12', tone: 'accent', t: '車行回覆', actor: '陳家豪 (METRO_FLEET)', actorRealm: 'tenant', body: '已與司機黃文豪確認並輔導，附行車紀錄器佐證影片。', attachments: [{ name: 'dashcam_0521.mp4', status: 'clean' }] },
    { at: '05-22 14:31', tone: 'danger', t: 'SLA breach', actor: 'system.sla', actorRealm: 'system', body: '超出 48h 處理時限。' },
    { at: '05-22 15:00', tone: 'warn', t: 'reopen', actor: '乘客 → Ops', actorRealm: 'ops', body: '乘客回報相同司機再次違規，Ops 重新開啟案件。' },
  ],
  inc_0213: [
    { at: '05-08 08:40', tone: 'accent', t: '建立', actor: 'd_8870 張育成', actorRealm: 'driver', body: '司機自報路口擦撞，雙方無人受傷。' },
    { at: '05-08 08:55', tone: 'accent', t: '指派', actor: 'Ops → 林經理', actorRealm: 'ops', body: '由 safety_lead 接手，請車行協助估損。' },
  ],
  cmp_0912: [
    { at: '05-18 10:00', tone: 'accent', t: '建立', actor: 'passenger app', actorRealm: 'tenant', body: '乘客對車資計算提出異議。' },
    { at: '05-18 10:05', tone: 'accent', t: '指派', actor: 'Ops → 王芳', actorRealm: 'ops', body: '屬平台計費規則爭議，由 ops_billing 處理，車行僅唯讀。' },
  ],
  cmp_0899: [
    { at: '04-28 09:00', tone: 'accent', t: '建立', actor: 'eva.wang@yamato.tw', actorRealm: 'tenant', body: '乘客反映車上遺失物品。' },
    { at: '04-29 11:20', tone: 'accent', t: '車行回覆', actor: '陳家豪 (METRO_FLEET)', actorRealm: 'tenant', body: '已協助司機尋回並約定歸還時間。' },
    { at: '05-02 10:00', tone: 'success', t: '結案', actor: '陳維', actorRealm: 'ops', body: '乘客確認收到遺失物，案件關閉。' },
  ],
};

const FX_CASE_ATTACHMENTS = {
  cmp_0908: [
    { name: 'passenger_video.mp4', from: 'tenant', at: '05-20 14:30', status: 'clean' },
    { name: 'dashcam_0521.mp4', from: 'fleet', at: '05-21 09:12', status: 'clean' },
  ],
  inc_0213: [],
  cmp_0912: [],
  cmp_0899: [],
};

// ── reply-availability banner (API-decided; UI renders the reason as-is) ────
function CaseReplyGate({ theme: th, canReply, reason }) {
  if (canReply) return null;
  const r = FLP_CASE_REPLY_REASONS[reason] || { zh: '目前無法回覆', fix: '請確認案件狀態' };
  return <Banner theme={th} tone="neutral" icon="info" title={'回覆已停用 · ' + reason} body={r.zh + '。' + r.fix} />;
}

// ── reply composer — one component, five states via `state` prop ───────────
function CaseReplyComposer({ theme: th, state = 'idle' }) {
  const body = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <textarea readOnly value={state === 'idle' || state === 'error' ? '已與司機確認並輔導，附行車紀錄器佐證影片。' : ''}
        placeholder="輸入回覆內容…"
        style={{
          width: '100%', minHeight: 64, resize: 'none', fontSize: 12.5, fontFamily: 'inherit',
          padding: 10, borderRadius: 7, border: '1px solid ' + th.border, background: th.surfaceLo, color: th.text,
        }} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Btn theme={th} size="xs" icon="audit">附件</Btn>
        <div style={{ flex: 1 }} />
        {state === 'submitting'
          ? <Btn theme={th} size="xs" variant="primary" disabled>送出中…</Btn>
          : <ActionButton theme={th} size="xs" descriptor={{ action: 'submit_reply', enabled: true, riskLevel: 'medium' }} icon="check" label="送出回覆" en="submit" />}
      </div>
    </div>
  );
  if (state === 'success') {
    return <Card theme={th} title="回覆 · 已送出" subtitle="submitting → success">
      <Banner theme={th} tone="success" icon="check" title="回覆已收到" body="idempotency-key 已記錄，重複送出將回傳相同結果不會重複建立紀錄。" />
    </Card>;
  }
  if (state === 'error') {
    return <Card theme={th} title="回覆 · 送出失敗" subtitle="submitting → error">
      {body}
      <div style={{ marginTop: 8 }}><Banner theme={th} tone="danger" icon="warn" title="送出失敗 · REPLY_SUBMIT_FAILED" body="網路或服務暫時無法回應，內容已保留，請重試。" actions={<Btn theme={th} size="xs" variant="primary">重試</Btn>} /></div>
    </Card>;
  }
  if (state === 'dedup') {
    return <Card theme={th} title="回覆 · 重送去重" subtitle="resend with same idempotency-key">
      <Banner theme={th} tone="info" icon="info" title="重複請求已去重" body="偵測到相同 idempotency-key 與內容，直接回傳先前送出的回覆結果，未建立第二筆紀錄。" />
    </Card>;
  }
  const label = state === 'submitting' ? '回覆 · 送出中' : '回覆處理';
  return <Card theme={th} title={label} subtitle="content → submit · SLA 與可回覆狀態由 API 決定">{body}</Card>;
}

// ── attachment list — one component, states via `mode` prop ─────────────────
function CaseAttachments({ theme: th, caseId, mode = 'list' }) {
  const items = FX_CASE_ATTACHMENTS[caseId] || [];
  if (mode === 'denied' || mode === 'not_found' || mode === 'read_failed') {
    const m = FLP_ATTACH_STATUS[mode];
    const msg = mode === 'denied' ? '您沒有權限讀取此附件（非本車行案件或責任範圍外）。'
      : mode === 'not_found' ? '附件不存在或已被移除。'
      : '附件讀取失敗，請稍後重試。';
    return <Card theme={th} title="附件 · Attachments">
      <Banner theme={th} tone={m.tone} icon="warn" title={'讀取失敗 · ' + m.zh} body={msg} />
    </Card>;
  }
  if (mode === 'uploading' || mode === 'scanning') {
    const m = FLP_ATTACH_STATUS[mode];
    return <Card theme={th} title="附件 · Attachments">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 10, background: th.surfaceLo, borderRadius: 7 }}>
        <MgmtIcon name="clock" size={14} style={{ color: th.info }} />
        <span style={{ flex: 1, fontFamily: SHELL_MONO, fontSize: 11 }}>evidence_0522.jpg</span>
        <Pill theme={th} tone={m.tone} dot>{m.zh}</Pill>
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: th.textMuted }}>pre-signed 直傳物件儲存，完成後由後端掃描確認才會標記可讀取；不使用假簽章或假送達。</div>
    </Card>;
  }
  return <Card theme={th} title="附件 · Attachments" subtitle={items.length + ' 件 · 授權回讀'}>
    {items.length === 0
      ? <Banner theme={th} tone="neutral" icon="info" title="尚無附件" body="回覆時可附上照片、影片或文件作為佐證。" />
      : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((a, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5 }}>
              <MgmtIcon name="audit" size={14} style={{ color: th.textMuted }} />
              <span style={{ flex: 1 }}>{a.name}</span>
              <Pill theme={th} tone={a.from === 'fleet' ? 'accent' : 'neutral'}>{a.from}</Pill>
              <Pill theme={th} tone={FLP_ATTACH_STATUS[a.status].tone} dot>{FLP_ATTACH_STATUS[a.status].zh}</Pill>
              <Btn theme={th} size="xs" variant="ghost" icon="eye" disabled={a.status !== 'clean'}>檢視</Btn>
            </div>
          ))}
        </div>}
  </Card>;
}

// ── case timeline card — includes empty / load-failed states ───────────────
function CaseTimelineCard({ theme: th, caseId, mode = 'ok' }) {
  if (mode === 'load_failed') {
    return <Card theme={th} title="歷程 · Timeline">
      <Banner theme={th} tone="warn" icon="warn" title="歷程讀取失敗 · TIMELINE_FETCH_FAILED" body="無法載入 Ops 同 case 歷程，請重新整理。" actions={<Btn theme={th} size="xs">重試</Btn>} />
    </Card>;
  }
  const events = mode === 'empty' ? [] : (FX_CASE_TIMELINE[caseId] || []);
  if (events.length === 0) {
    return <Card theme={th} title="歷程 · Timeline">
      <Banner theme={th} tone="neutral" icon="info" title="尚無歷程" body="案件建立後尚未有 Ops 或車行動作，這是合法的空狀態。" />
    </Card>;
  }
  return <Card theme={th} title="歷程 · Timeline · cross-actor" subtitle="Ops owner 不因車行回覆而轉移">
    <Timeline theme={th} events={events.map(e => ({
      ...e,
      body: <>{e.body}{e.attachments && <div style={{ marginTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap' }}>{e.attachments.map((a, j) => <span key={j} style={{ fontSize: 10.5, padding: '2px 7px', borderRadius: 999, background: th.accentBg, color: th.accent, border: '1px solid ' + th.accentBorder, fontFamily: SHELL_MONO }}>{a.name}</span>)}</div>}</>,
    }))} />
  </Card>;
}

// ── 1–3. /cases/[caseId] — detail, reply, attachments, timeline (one screen) ─
function FLP_CaseDetail({ theme: th, caseId = 'cmp_0908', replyState = 'idle', timelineMode = 'ok', attachmentMode = 'list' }) {
  const c = FX_CASE_DETAIL[caseId];
  const closedDedup = c.status === 'closed';
  return (
    <FlpShell theme={th} active="cases" breadcrumb={['品質與責任', '事故 / 申訴', c.id]}>
      <PageHeader theme={th}
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          <Btn theme={th} size="xs" variant="ghost" icon="arrow-right" style={{ transform: 'scaleX(-1)' }}>返回列表</Btn>
          {c.id}
          <Pill theme={th} tone={c.sla === 'breached' ? 'danger' : 'success'} dot>SLA {c.sla}</Pill>
          <Pill theme={th} tone={c.responsibility === 'fleet' ? 'danger' : c.responsibility === 'shared' ? 'warn' : 'neutral'} dot>責任 · {c.responsibility}</Pill>
          {casePill(th, c.status)}
        </span>}
        subtitle={`${c.cat} · ${c.desc}`}
        actions={<>
          <ActionButton theme={th} descriptor={{ action: 'respond', enabled: c.canReply, disabledReasonCode: c.replyReason, riskLevel: 'medium' }} icon="check" label="回覆處理" en="respond" />
        </>} />
      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card theme={th} title="案件詳情 · Case summary">
            <DL theme={th} cols={3} items={[
              { k: 'CASE', v: c.id, mono: true },
              { k: 'TYPE', v: c.type, mono: true },
              { k: 'CATEGORY', v: c.cat, mono: true },
              { k: 'SEVERITY', v: c.severity, mono: true },
              { k: '責任歸屬', v: c.responsibility, mono: true },
              { k: 'Ops OWNER', v: c.opsOwner },
              { k: 'SLA DUE AT', v: c.slaDueAt, mono: true },
              { k: 'SLA BREACHED AT', v: c.slaBreachedAt || '—', mono: true },
              { k: 'REOPENS', v: c.reopenCount + ' 次' },
              { k: 'DRIVER', v: c.driver },
              { k: 'VEHICLE', v: c.vehicle, mono: true },
              { k: 'RELATED ORDER', v: <a style={{ color: th.accent }}>{c.order} →</a> },
            ]} />
          </Card>
          {closedDedup && <Banner theme={th} tone="neutral" icon="info" title="案件已關閉 · 重送去重"
            body="已關閉案件不接受新回覆；若在關閉前的重複提交會被 idempotency-key 去重，不會產生重複紀錄。如需追加說明請聯絡 Ops 申請重啟。" />}
          <CaseReplyGate theme={th} canReply={c.canReply} reason={c.replyReason} />
          {c.canReply && <CaseReplyComposer theme={th} state={replyState} />}
          <CaseTimelineCard theme={th} caseId={c.id} mode={timelineMode} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <CaseAttachments theme={th} caseId={c.id} mode={attachmentMode} />
          <Card theme={th} title="Linked entities">
            <DL theme={th} cols={1} items={[
              { k: 'RELATED ORDER', v: c.order, mono: true },
              { k: 'TENANT', v: c.tenant, mono: true },
              { k: 'DRIVER', v: c.driver },
              { k: 'FLEET SCOPE', v: 'METRO_FLEET · 僅本車行可見', mono: true },
            ]} />
          </Card>
        </div>
      </div>
    </FlpShell>
  );
}

// ── 4. Reply composer states — reference grid ────────────────────────────────
function FLP_CaseReplyStates({ theme: th }) {
  return (
    <FlpShell theme={th} active="cases" breadcrumb={['品質與責任', '事故 / 申訴', '回覆狀態']}>
      <PageHeader theme={th} title="回覆狀態參考 · Reply states" subtitle="idle → submitting → success / error(重試) / dedup(重送去重)" />
      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <CaseReplyComposer theme={th} state="idle" />
        <CaseReplyComposer theme={th} state="submitting" />
        <CaseReplyComposer theme={th} state="success" />
        <CaseReplyComposer theme={th} state="error" />
        <CaseReplyComposer theme={th} state="dedup" />
        <Card theme={th} title="回覆 · 權限/狀態停用" subtitle="closed / other_fleet / platform_owned">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <CaseReplyGate theme={th} canReply={false} reason="case_closed" />
            <CaseReplyGate theme={th} canReply={false} reason="other_fleet" />
            <CaseReplyGate theme={th} canReply={false} reason="platform_owned" />
          </div>
        </Card>
      </div>
    </FlpShell>
  );
}

// ── 5. Attachment states — reference grid ───────────────────────────────────
function FLP_CaseAttachmentStates({ theme: th }) {
  return (
    <FlpShell theme={th} active="cases" breadcrumb={['品質與責任', '事故 / 申訴', '附件狀態']}>
      <PageHeader theme={th} title="附件狀態參考 · Attachment states" subtitle="pre-signed 上傳 → 後端掃描 → 授權回讀；無假簽章或假送達" />
      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <CaseAttachments theme={th} caseId="cmp_0908" mode="list" />
        <CaseAttachments theme={th} caseId="inc_0213" mode="list" />
        <CaseAttachments theme={th} caseId="cmp_0908" mode="uploading" />
        <CaseAttachments theme={th} caseId="cmp_0908" mode="denied" />
        <CaseAttachments theme={th} caseId="cmp_0908" mode="not_found" />
        <CaseAttachments theme={th} caseId="cmp_0908" mode="read_failed" />
      </div>
    </FlpShell>
  );
}

// ── 6. error / edge states reference card (mirrors FLP_SupplyErrors) ────────
function FLP_CaseErrors({ theme: th }) {
  const errs = [
    ['REPLY_NOT_ALLOWED', '案件 closed / 平台責任 / 非本車行', '依 API 回傳原因顯示對應說明，不可讓前端自行判斷'],
    ['REPLY_SUBMIT_FAILED', '回覆送出時後端暫時無回應', '內容保留於表單，提供重試'],
    ['REPLY_DUPLICATE_IGNORED', '相同 idempotency-key 重複送出', '回傳先前結果，不建立第二筆回覆'],
    ['CASE_REOPEN_REQUIRED', '已關閉案件需要追加回覆', '車行需聯絡 Ops 走 reopen 流程，非車行自行解鎖'],
    ['ATTACHMENT_SCAN_BLOCKED', '附件掃描判定不可讀取', '不可覆蓋掃描結果，需重新上傳'],
    ['ATTACHMENT_PERMISSION_DENIED', '讀取他車行或責任範圍外附件', '僅能讀取本車行可見案件的附件'],
    ['ATTACHMENT_NOT_FOUND', '附件已被移除或 objectKey 失效', '提示重新確認案件歷程'],
    ['TIMELINE_FETCH_FAILED', '歷程 API 暫時無回應', '提供重試，不得以本地快取假造歷程'],
  ];
  return (
    <FlpShell theme={th} active="cases" breadcrumb={['品質與責任', '事故 / 申訴', '錯誤 / edge states']}>
      <PageHeader theme={th} title="案件錯誤 / Edge States" subtitle="以下代碼待實作 task（SR-FLEET-CASE-001）落地；UI 一律依 API 回傳原因顯示，不自行判定" />
      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {errs.map(([code, when, fix]) => (
          <Card theme={th} key={code} padding={14}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
              <MgmtIcon name="warn" size={15} style={{ color: th.danger }} />
              <code style={{ fontSize: 12, fontFamily: SHELL_MONO, color: th.danger, fontWeight: 600 }}>{code}</code>
            </div>
            <div style={{ fontSize: 12.5, color: th.text, marginBottom: 4 }}>{when}</div>
            <div style={{ fontSize: 12, color: th.textMuted, display: 'flex', alignItems: 'center', gap: 5 }}><MgmtIcon name="arrow-right" size={12} />{fix}</div>
          </Card>
        ))}
      </div>
    </FlpShell>
  );
}

Object.assign(window, {
  FLP_CASE_STATUS, casePill, FLP_CASE_REPLY_REASONS, FLP_ATTACH_STATUS,
  CaseReplyGate, CaseReplyComposer, CaseAttachments, CaseTimelineCard,
  FLP_CaseDetail, FLP_CaseReplyStates, FLP_CaseAttachmentStates, FLP_CaseErrors,
});
