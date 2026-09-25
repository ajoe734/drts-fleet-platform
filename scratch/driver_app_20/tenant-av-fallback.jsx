// tenant-av-fallback.jsx — Phase 2 V1 · tenant-console AV→human fallback delta.
// Reuses mgmt Shell + TN_NAV/TN_ACTOR/TN_HEALTH + primitives. zh-TW.
//
// HARD RULES:
//  · Tenant-facing copy via backend `tenantMessageCode` — message SLOTs marked, not hardcoded.
//  · Tenant MAY see fulfillment-level facts (planned vs actual vehicle type, fallback stage, ETA
//    change, billing/SLA treatment) — but NOT Tesla reason codes, FSD transitions, incident
//    classification, evidence/legal-hold, or safety-operator/ROC personnel names.
//  · No surcharge, no second order (C4: fallbackSurchargeApplied=false).

function TnMsgSlot({ theme: th, code, sample }) {
  return (
    <div style={{ position: 'relative', padding: '11px 13px', borderRadius: 9, background: th.surfaceLo, border: '1px dashed ' + th.border, marginTop: 4 }}>
      <span style={{ position: 'absolute', top: -8, left: 10, fontSize: 9, fontFamily: SHELL_MONO, fontWeight: 600, color: th.textMuted, background: th.surface, padding: '0 5px', borderRadius: 4 }}>tenantMessageCode · {code}</span>
      <div style={{ fontSize: 12.5, color: th.text, lineHeight: 1.5, marginTop: 2 }}>{sample}</div>
      <div style={{ fontSize: 10, color: th.textDim, marginTop: 5 }}>文案由後端 messageCode 渲染 · 此為示意</div>
    </div>
  );
}

// fallback stage chip
const TN_FB_STAGE = {
  vehicle_change_in_progress: { zh: '重新安排車輛', tone: 'warn', en: 'vehicle_change_in_progress' },
  human_fallback_assigned:    { zh: '人駕已指派', tone: 'info', en: 'human_fallback_assigned' },
  service_continuing:         { zh: '行程繼續', tone: 'success', en: 'service_continuing' },
};

// ── Booking detail · AV fallback view (planned vs actual) ────────────────────
function TN_AvFallbackDetail({ theme: th, stage = 'human_fallback_assigned' }) {
  const sm = TN_FB_STAGE[stage];
  return (
    <Shell theme={th} nav={TN_NAV} active="bookings"
      breadcrumb={['訂單', 'ord_88240', 'AV Fallback']} env="production" tenant="YAMATO" actor={TN_ACTOR} health={TN_HEALTH}
      refreshTier="slow" dataFreshness="fresh">
      <PageHeader theme={th}
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>ord_88240 · 自駕轉人駕<Pill theme={th} tone={sm.tone} dot>{sm.zh}</Pill></span>}
        subtitle="原指派自駕車，已轉人駕履約 · 同一筆訂單繼續"
        meta={<><Pill theme={th} tone="neutral">乘客 林○芸</Pill><Pill theme={th} tone="success">無加收 · no surcharge</Pill></>} />
      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* planned vs actual fulfillment */}
          <Card theme={th} title="計畫 vs 實際履約" subtitle="planned vs actual fulfillment">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ padding: 14, borderRadius: 10, border: '1px solid ' + th.border, background: th.surfaceLo }}>
                <div style={{ fontSize: 11, color: th.textMuted, marginBottom: 8 }}>計畫 · planned</div>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>自駕車 · AV</div>
                <div style={{ fontSize: 12, color: th.textMuted }}>AV-7732 · Model 3</div>
                <div style={{ fontSize: 12, color: th.textMuted }}>原 ETA 14:42</div>
              </div>
              <div style={{ padding: 14, borderRadius: 10, border: '1px solid ' + th.accent, background: th.accentBg }}>
                <div style={{ fontSize: 11, color: th.accent, marginBottom: 8, fontWeight: 600 }}>實際 · actual</div>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>人駕 · human</div>
                <div style={{ fontSize: 12, color: th.text }}>TPE-3120 · Toyota</div>
                <div style={{ fontSize: 12, color: th.text }}>新 ETA 14:50（+8 分）</div>
              </div>
            </div>
          </Card>

          {/* fallback stage timeline */}
          <Card theme={th} title="轉派進度 · fallback stage">
            <Timeline theme={th} events={[
              { at: '14:48', tone: 'warn', t: '重新安排車輛', body: 'vehicle_change_in_progress' },
              { at: '14:49', tone: 'info', t: '人駕已指派', body: 'human_fallback_assigned · TPE-3120' },
              { tone: 'success', t: '行程繼續', body: 'service_continuing', current: stage === 'service_continuing' },
            ]} />
          </Card>

          {/* tenant-facing message slot */}
          <Card theme={th} title="租戶通知文案" subtitle="rendered from tenantMessageCode">
            <TnMsgSlot theme={th} code="tenant.fallback.human_assigned" sample="本趟原由自駕車履約，已改派人駕繼續，預計上車時間順延約 8 分鐘，費用維持不變。" />
          </Card>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* billing / SLA treatment */}
          <Card theme={th} title="計費與 SLA 處理" subtitle="billing / SLA treatment" style={{ borderTop: '2px solid ' + th.accent }}>
            <DL theme={th} cols={1} items={[
              { k: '本趟費用', v: '維持原價', mono: false },
              { k: 'fallback 加收', v: <Pill theme={th} tone="success" dot>否 · false</Pill> },
              { k: '計費維度', v: 'av_fulfillment → human_fallback', mono: true },
              { k: 'SLA 計算', v: '準點以新 ETA 為準', mono: false },
              { k: '重新下單', v: <Pill theme={th} tone="neutral">無 · 同一訂單</Pill> },
            ]} />
            <div style={{ marginTop: 10 }}>
              <Banner theme={th} tone="info" icon="info" body="計費差異維度（AV 趟 vs fallback 人駕趟）依 billing decision 處理；本趟對租戶不加收，SLA 以更新後 ETA 評估。" />
            </div>
          </Card>

          {/* disclosure guardrail */}
          <Card theme={th} title="揭露範圍" subtitle="disclosure scope">
            <Banner theme={th} tone="neutral" icon="lock" body="租戶可見履約層級事實（計畫/實際車種、轉派階段、ETA、計費/SLA）；不顯示 Tesla 原因碼、FSD 轉換、事故分類、證據凍結/法律保留、安全員/ROC 人員姓名。" />
          </Card>
        </div>
      </div>
    </Shell>
  );
}

// ── Bookings list · with AV fallback flag column ─────────────────────────────
function TN_AvFallbackList({ theme: th }) {
  const rows = [
    { id: 'ord_88240', pax: '林○芸', route: '南港 → 內湖', plan: 'AV', actual: '人駕', stage: 'human_fallback_assigned', eta: '+8 分', state: 'fallback' },
    { id: 'ord_88231', pax: '陳○明', route: '信義 → 南港', plan: 'AV', actual: 'AV', stage: null, eta: '準時', state: 'on_trip' },
    { id: 'ord_88210', pax: '王○豪', route: '信義 → 南港', plan: 'AV', actual: '人駕', stage: 'service_continuing', eta: '+5 分', state: 'completed' },
  ];
  return (
    <Shell theme={th} nav={TN_NAV} active="bookings"
      breadcrumb={['訂單', 'AV 履約']} env="production" tenant="YAMATO" actor={TN_ACTOR} health={TN_HEALTH}
      refreshTier="slow" dataFreshness="fresh">
      <PageHeader theme={th} title="訂單 · AV 履約追蹤" subtitle="自駕履約與轉人駕 fallback 狀態 · 計畫 vs 實際"
        actions={<Select theme={th} value="履約：全部" />} />
      <div style={{ padding: 24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: '訂單', k: 'id', w: 130, mono: true, r: r => <span style={{ color: th.accent, fontWeight: 600 }}>{r.id}</span> },
            { h: '乘客', k: 'pax', w: 90 },
            { h: '路線', k: 'route', w: 150 },
            { h: '計畫', k: 'plan', w: 70, r: r => <Pill theme={th} tone="neutral">{r.plan}</Pill> },
            { h: '實際', w: 80, r: r => <Pill theme={th} tone={r.actual === r.plan ? 'success' : 'warn'} dot>{r.actual}</Pill> },
            { h: '轉派階段', w: 130, r: r => r.stage ? <Pill theme={th} tone={TN_FB_STAGE[r.stage].tone}>{TN_FB_STAGE[r.stage].zh}</Pill> : <span style={{ fontSize: 11, color: th.textDim }}>—</span> },
            { h: 'ETA', k: 'eta', w: 80, mono: true, r: r => <span style={{ color: r.eta.startsWith('+') ? th.warn : th.text }}>{r.eta}</span> },
            { h: '加收', w: 70, r: () => <Pill theme={th} tone="success">否</Pill> },
            { h: '', w: 70, r: () => <Btn theme={th} size="xs" variant="ghost" icon="arrow-right">詳情</Btn> },
          ]} rows={rows} />
        </Card>
        <div style={{ marginTop: 14 }}>
          <Banner theme={th} tone="neutral" icon="info" body="此清單顯示自駕履約與轉人駕狀態；fallback 不產生第二筆訂單、不加收費用（C4）。文案欄位由 tenantMessageCode 渲染。" />
        </div>
      </div>
    </Shell>
  );
}

Object.assign(window, {
  TnMsgSlot, TN_FB_STAGE, TN_AvFallbackDetail, TN_AvFallbackList,
});
