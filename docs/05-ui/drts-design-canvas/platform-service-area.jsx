// platform-service-area.jsx — 服務區治理 /service-area-governance (一般計程車).
// EXTENDS Platform Admin (platform realm). SEPARATE authority from Phase 2 sandbox (platform-sandbox.jsx):
//   · taxi identity marker on every header (一般計程車 · TAXI SERVICE NETWORK)
//   · solid-fill geo styling (emerald serviceable / red deny / amber manual) vs sandbox dashed-cyan
//   · NO route-corridor tools (sandbox-only); shared GeometryEditor primitive (MAP-UI-002), taxi skin
// Records: boundary (可服務嗎?) vs stop policy (上/下車 allow/deny/manual_review).
// Lifecycle: draft → review → active → retired · publish/retire = required reason + audit receipt.
// 後端評估為權威；預覽只呈現結果。

const SA_STATUS = {
  draft:   { zh: '草稿', en: 'draft', tone: 'neutral' },
  review:  { zh: '審核中', en: 'review', tone: 'info' },
  active:  { zh: '生效中', en: 'active', tone: 'success' },
  retired: { zh: '已退場', en: 'retired', tone: 'neutral' },
};
function saPill(th, s) { const m = SA_STATUS[s] || SA_STATUS.draft; return <Pill theme={th} tone={m.tone} dot>{m.zh}<span style={{ marginLeft: 4, opacity: .6, fontFamily: SHELL_MONO, fontSize: 9.5 }}>{m.en}</span></Pill>; }

const SA_DIR = { pickup: '上車', dropoff: '下車', both: '上下車' };
const SA_EFFECT = {
  allow: { zh: '允許', tone: 'success' }, deny: { zh: '拒絕', tone: 'danger' }, manual_review: { zh: '人工複核', tone: 'warn' },
};
function saEffect(th, e) { const m = SA_EFFECT[e]; return <Pill theme={th} tone={m.tone} dot>{m.zh}<span style={{ marginLeft: 3, opacity: .6, fontFamily: SHELL_MONO, fontSize: 9 }}>{e}</span></Pill>; }

// taxi identity marker — visual separation from sandbox governance
function SaTaxiMark({ theme: th }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: th.success, background: th.successBg, border: '1px solid ' + th.successBd || th.border, padding: '3px 10px', borderRadius: 999 }}>
      <MgmtIcon name="vehicles" size={12} />一般計程車 · TAXI<span style={{ fontFamily: SHELL_MONO, fontSize: 9, opacity: .65 }}>非沙盒</span>
    </span>
  );
}

const FX_SA_BOUNDARIES = [
  { id: 'sa_tp_core', name: '台北市中心服務區', status: 'active', ver: 'v3', from: '2026-01-01', until: '— 開放式', by: '駱思賢', at: '2026-05-12 10:02' },
  { id: 'sa_xy_ext', name: '信義擴充區', status: 'review', ver: 'v1', from: '2026-08-01', until: '— 開放式', by: '駱思賢', at: '2026-07-05 16:40' },
  { id: 'sa_ts_ext', name: '淡水延伸區', status: 'draft', ver: 'v1', from: '—', until: '—', by: '林芷瑄', at: '2026-07-06 11:18' },
  { id: 'sa_old_apt', name: '舊機場周邊', status: 'retired', ver: 'v2', from: '2025-01-01', until: '2026-03-31', by: '駱思賢', at: '2026-03-20 09:00' },
];
const FX_SA_POLICIES = [
  { id: 'sp_station_w', name: '台北車站西側 禁上車', status: 'active', ver: 'v2', dir: 'pickup', effect: 'deny', from: '2026-04-01', until: '— 開放式', by: '駱思賢', at: '2026-03-28 14:22' },
  { id: 'sp_tsa_ctrl', name: '松山機場管制區', status: 'active', ver: 'v1', dir: 'both', effect: 'manual_review', from: '2026-02-01', until: '— 開放式', by: '林芷瑄', at: '2026-01-25 09:40' },
  { id: 'sp_xy_night', name: '信義商圈夜間 禁下車', status: 'review', ver: 'v1', dir: 'dropoff', effect: 'deny', from: '2026-07-15', until: '2026-12-31', by: '林芷瑄', at: '2026-07-04 18:05' },
  { id: 'sp_srr_deny', name: '松仁路口 禁上車', status: 'draft', ver: 'v1', dir: 'pickup', effect: 'deny', from: '—', until: '—', by: '駱思賢', at: '2026-07-07 09:12' },
];

// shared GeometryEditor (MAP-UI-002) — taxi skin: solid fills, node handles, NO route-corridor tool
function SaGeometryEditor({ theme: th, mode = 'boundary', draftName }) {
  const tools = [['polygon', '多邊形', 'governance'], ['circle', '圓形', 'tracking'], ['edit', '編輯節點', 'edit']];
  return (
    <Card theme={th} title="幾何工作區 · GeometryEditor" subtitle="共用 primitive (MAP-UI-002) · taxi 佈景 · 無路廊工具（路廊僅屬沙盒治理）" padding={0}>
      <div style={{ display: 'flex', gap: 6, padding: '10px 14px', borderBottom: '1px solid ' + th.border, background: th.surfaceLo, alignItems: 'center' }}>
        {tools.map(([k, l, ic], i) => (
          <button key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            border: '1px solid ' + (i === 0 ? th.accent : th.border), background: i === 0 ? th.accentBg : th.surface, color: i === 0 ? th.accent : th.textMuted }}>
            <MgmtIcon name={ic} size={13} />{l}</button>
        ))}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 10.5, color: th.textDim, fontFamily: SHELL_MONO }}>route-corridor · N/A (sandbox only)</span>
      </div>
      <div style={{ height: 330, background: th.surfaceLo, position: 'relative', overflow: 'hidden' }}>
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          {/* published boundary overlay — solid emerald */}
          <polygon points="60,60 380,44 470,180 340,300 90,270" fill={th.success + '2A'} stroke={th.success} strokeWidth="2" />
          {/* active deny stop-policy — solid red */}
          <polygon points="200,120 268,120 268,180 200,180" fill={th.danger + '33'} stroke={th.danger} strokeWidth="2" />
          {/* manual review zone — amber circle */}
          <circle cx="392" cy="112" r="34" fill={th.warn + '2E'} stroke={th.warn} strokeWidth="2" />
          {/* current draft target — hatched amber polygon w/ node handles */}
          {mode === 'stoppolicy' && <>
            <polygon points="150,210 240,196 262,258 168,276" fill={th.danger + '18'} stroke={th.danger} strokeWidth="2.5" strokeDasharray="7 4" />
            {[[150, 210], [240, 196], [262, 258], [168, 276]].map(([x, y], i) => <rect key={i} x={x - 5} y={y - 5} width="10" height="10" rx="2" fill={th.surface} stroke={th.danger} strokeWidth="2" />)}
          </>}
          {mode === 'boundary' && <>
            <polygon points="330,220 452,204 480,290 356,308" fill={th.success + '18'} stroke={th.success} strokeWidth="2.5" strokeDasharray="7 4" />
            {[[330, 220], [452, 204], [480, 290], [356, 308]].map(([x, y], i) => <rect key={i} x={x - 5} y={y - 5} width="10" height="10" rx="2" fill={th.surface} stroke={th.success} strokeWidth="2" />)}
          </>}
        </svg>
        <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', flexDirection: 'column', gap: 5, background: th.surface, border: '1px solid ' + th.border, borderRadius: 9, padding: '9px 12px' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: th.textMuted, letterSpacing: .3 }}>圖例 · LEGEND</span>
          {[['已發佈服務區', th.success], ['禁停靠 deny', th.danger], ['人工複核', th.warn]].map(([l, c]) => (
            <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: th.text }}><span style={{ width: 10, height: 10, borderRadius: 3, background: c + '44', border: '1.5px solid ' + c }} />{l}</span>
          ))}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: th.text }}><span style={{ width: 10, height: 10, borderRadius: 3, border: '1.5px dashed ' + th.textMuted }} />當前 draft 目標</span>
        </div>
        {draftName && <div style={{ position: 'absolute', bottom: 12, left: 12, fontSize: 11, color: th.text, background: th.surface, padding: '5px 10px', borderRadius: 7, border: '1px solid ' + th.border }}>編輯中：<b>{draftName}</b> · 4 節點</div>}
        <div style={{ position: 'absolute', bottom: 12, right: 12, fontSize: 10, color: th.textDim, background: th.surface, padding: '4px 9px', borderRadius: 6, border: '1px solid ' + th.border }}>沙盒 ODD / 路廊不顯示於此</div>
      </div>
    </Card>
  );
}

// record-type switcher — semantics visible at a glance
function SaTypeSwitch({ theme: th, mode }) {
  const opts = [
    { k: 'boundary', zh: '服務區界線', en: 'boundary', q: '「這區可服務嗎？」', icon: 'governance' },
    { k: 'stoppolicy', zh: '停靠政策', en: 'stop policy', q: '「上/下車 允許 / 拒絕 / 人工複核？」', icon: 'pin' },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      {opts.map(o => {
        const on = o.k === mode;
        return (
          <div key={o.k} style={{ display: 'flex', gap: 11, padding: '13px 15px', borderRadius: 11, cursor: 'pointer',
            border: '1.5px solid ' + (on ? th.accent : th.border), background: on ? th.accentBg : th.surface }}>
            <span style={{ width: 36, height: 36, borderRadius: 9, background: on ? th.accent : th.surfaceLo, color: on ? '#fff' : th.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><MgmtIcon name={o.icon} size={17} /></span>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: on ? th.accent : th.text }}>{o.zh}<span style={{ fontFamily: SHELL_MONO, fontSize: 9.5, marginLeft: 6, opacity: .65 }}>{o.en}</span></div>
              <div style={{ fontSize: 11.5, color: th.textMuted, marginTop: 2 }}>{o.q}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── 1+2 · Governance workspace (boundary / stop-policy modes) ────────────────
function PA_ServiceAreaGov({ theme: th, mode = 'boundary' }) {
  const isB = mode === 'boundary';
  const rows = isB ? FX_SA_BOUNDARIES : FX_SA_POLICIES;
  return (
    <Shell theme={th} nav={PA_NAV} active="service-area"
      breadcrumb={['服務網治理', '服務區治理']} env="production" actor={PSB_ACTOR} health={PA_HEALTH}
      refreshTier="medium_slow" dataFreshness="fresh">
      <PageHeader theme={th} title="服務區治理 · Service-Area Governance"
        subtitle="/service-area-governance · 服務區界線 + stop policy · 發佈生命週期 · 後端評估為權威"
        meta={<><SaTaxiMark theme={th} /><Pill theme={th} tone="neutral">與沙盒治理權責分離</Pill></>}
        actions={<><Btn theme={th} icon="eye">樣本預覽</Btn><Btn theme={th} variant="primary" icon="plus">建立 draft</Btn></>} />
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <SaTypeSwitch theme={th} mode={mode} />
        <div style={{ display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 16, alignItems: 'start' }}>
          <SaGeometryEditor theme={th} mode={mode} draftName={isB ? '淡水延伸區 v1' : '松仁路口 禁上車 v1'} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Card theme={th} title={isB ? '界線紀錄 · 版本堆疊' : '停靠政策 · 版本堆疊'} subtitle="record list · version stack" padding={0}>
              <div>
                {rows.map((r, i) => (
                  <div key={r.id} style={{ padding: '11px 14px', borderTop: i ? '1px solid ' + th.borderSoft : 'none', background: r.status === 'draft' ? th.accentBg : 'transparent' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700 }}>{r.name}</span>
                      {saPill(th, r.status)}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: 10, fontFamily: SHELL_MONO, color: th.textDim }}>{r.id} · {r.ver}</span>
                      {!isB && <>{<Pill theme={th} tone="neutral">{SA_DIR[r.dir]}</Pill>}{saEffect(th, r.effect)}</>}
                    </div>
                    <div style={{ fontSize: 10.5, color: th.textMuted, marginTop: 4 }}>生效 {r.from} → {r.until} · {r.by} · {r.at}</div>
                  </div>
                ))}
              </div>
            </Card>
            <Banner theme={th} tone="neutral" icon="lock" body="沙盒 ODD operating-area / approved routes / experiment 治理不在此 route（見沙盒治理）。此處僅一般計程車服務網。" />
          </div>
        </div>
      </div>
    </Shell>
  );
}

// ── 3 · Review / Publish panel ───────────────────────────────────────────────
function PA_ServiceAreaPublish({ theme: th, confirm = false }) {
  const d = FX_SA_POLICIES[3]; // 松仁路口 禁上車 draft
  return (
    <Shell theme={th} nav={PA_NAV} active="service-area"
      breadcrumb={['服務區治理', d.name, '發佈']} env="production" actor={PSB_ACTOR} health={PA_HEALTH}
      refreshTier="medium_slow" dataFreshness="fresh">
      <PageHeader theme={th}
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>{d.name} · 發佈{saPill(th, 'review')}</span>}
        subtitle="stop policy · pickup / deny · v1 · 送審 → 發佈"
        meta={<SaTaxiMark theme={th} />}
        actions={<><Btn theme={th}>退回草稿</Btn><Btn theme={th} variant="primary" icon="check">帶生效日發佈</Btn></>} />
      <div style={{ padding: 24 }}>
        <div style={{ marginBottom: 18 }}><Stepper theme={th} current={2} steps={['建立 draft', '畫幾何', '送審', '發佈']} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 16, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Card theme={th} title="發佈設定 · publish">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                <Field theme={th} label="生效起 · effectiveFrom" required><Input theme={th} value="2026-07-10 00:00" mono /></Field>
                <Field theme={th} label="生效迄 · effectiveUntil"><Input theme={th} value="— 開放式 open-ended" mono /></Field>
              </div>
              <Field theme={th} label="發佈理由 · required" required hint="寫入 audit，供日後追溯">
                <div style={{ border: '1px solid ' + th.border, borderRadius: 8, padding: '10px 12px', minHeight: 54, fontSize: 12.5, color: th.text }}>捷運施工圍籬佔用路肩，松仁路口上車不安全，經交通會勘決議禁止上車。</div>
              </Field>
            </Card>
            <Card theme={th} title="取代 / 並存檢核" subtitle="supersede check">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 9, border: '1px solid ' + th.border }}>
                  <MgmtIcon name="info" size={14} style={{ color: th.info }} />
                  <span style={{ flex: 1, fontSize: 12.5 }}>與 <b>台北車站西側 禁上車 v2</b>（active）<b>並存</b> · 幾何不重疊</span>
                  <Pill theme={th} tone="info">並存</Pill>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 9, border: '1px solid ' + th.border }}>
                  <MgmtIcon name="check" size={14} style={{ color: th.success }} />
                  <span style={{ flex: 1, fontSize: 12.5 }}>無現行紀錄被取代 · 新政策</span>
                  <Pill theme={th} tone="success">無取代</Pill>
                </div>
              </div>
            </Card>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Card theme={th} title="audit 收據 · 發佈後" subtitle="audit receipt" style={{ borderTop: '2px solid ' + th.accent }}>
              <DL theme={th} cols={1} items={[
                { k: 'actor', v: '駱思賢 · platform_sandbox_admin', mono: false },
                { k: 'request / audit id', v: 'req_sa_0771 · aud_sa_2210', mono: true },
                { k: '版本', v: 'sp_srr_deny · v1', mono: true },
                { k: '方向 / 效果', v: 'pickup · deny', mono: true },
                { k: '生效', v: '2026-07-10 → 開放式', mono: true },
                { k: '理由', v: '捷運施工圍籬…（全文入 audit）', mono: false },
              ]} />
            </Card>
            <Card theme={th} title="幾何摘要">
              <DL theme={th} cols={1} items={[
                { k: 'geometry', v: 'POLYGON · 4 pts', mono: true },
                { k: '驗證', v: <Pill theme={th} tone="success" dot>通過 · 無自交</Pill> },
              ]} />
            </Card>
          </div>
        </div>
      </div>
      {confirm && (
        <ConfirmModal theme={th} risk="high" title="發佈停靠政策 · 生效後即影響評估"
          body="松仁路口 禁上車 v1（pickup · deny）將於 2026-07-10 00:00 生效，後端 evaluator 即時套用。此動作寫入 audit 並需填理由。"
          confirmLabel="確認發佈" reasonField />
      )}
    </Shell>
  );
}

// ── 4 · 受影響樣本預覽 ────────────────────────────────────────────────────────
function PA_ServiceAreaPreview({ theme: th }) {
  const samples = [
    { pt: '25.0330, 121.5654', kind: '上車', zone: '台北市中心服務區', result: 'serviceable', policy: '—' },
    { pt: '25.0378, 121.5645', kind: '上車', zone: '松仁路口 禁上車 (draft)', result: 'no_pickup', policy: 'sp_srr_deny v1 · deny' },
    { pt: '25.0378, 121.5645', kind: '下車', zone: '同上座標', result: 'serviceable', policy: '政策僅限 pickup' },
    { pt: '25.0697, 121.5522', kind: '下車', zone: '松山機場管制區', result: 'manual_review', policy: 'sp_tsa_ctrl v1 · both' },
    { pt: '25.1276, 121.4610', kind: '上車', zone: '（界線外）', result: 'not_serviceable', policy: '無服務區涵蓋' },
    { pt: '25.0410, 121.5700', kind: '下車', zone: '信義商圈夜間 (review)', result: 'no_dropoff', policy: 'sp_xy_night v1 · 生效後' },
  ];
  const R = {
    serviceable: { zh: '可服務', tone: 'success' }, not_serviceable: { zh: '不可服務', tone: 'neutral' },
    no_pickup: { zh: '禁上車', tone: 'danger' }, no_dropoff: { zh: '禁下車', tone: 'danger' }, manual_review: { zh: '人工複核', tone: 'warn' },
  };
  return (
    <Shell theme={th} nav={PA_NAV} active="service-area"
      breadcrumb={['服務區治理', '樣本預覽']} env="production" actor={PSB_ACTOR} health={PA_HEALTH}
      refreshTier="manual" dataFreshness="fresh">
      <PageHeader theme={th} title="受影響樣本預覽 · Evaluate Preview"
        subtitle="POST /api/service-area/evaluate · 操作員輸入樣本座標 · 非批次訂單預覽"
        meta={<><SaTaxiMark theme={th} /><Pill theme={th} tone="warn">後端評估為權威 · 本頁只呈現結果</Pill></>}
        actions={<Btn theme={th} variant="primary" icon="plus">新增樣本</Btn>} />
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Card theme={th} title="輸入樣本" subtitle="operator-entered sample coordinates" padding={16}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <Field theme={th} label="座標 lat, lng"><Input theme={th} value="25.0378, 121.5645" mono /></Field>
            <Field theme={th} label="樣本類型"><Select theme={th} value="上車 pickup" /></Field>
            <Field theme={th} label="評估時點"><Select theme={th} value="含 draft/review（假設生效）" /></Field>
            <Btn theme={th} variant="primary" icon="arrow-right">送後端評估</Btn>
          </div>
        </Card>
        <Card theme={th} title="評估結果 · 5 類覆蓋" subtitle="serviceable / not-serviceable / no-pickup / no-dropoff / manual-review" padding={0}>
          <Table theme={th} columns={[
            { h: '樣本座標', k: 'pt', w: 170, mono: true },
            { h: '類型', k: 'kind', w: 66 },
            { h: '命中區域 / 政策', k: 'zone', w: 200 },
            { h: '評估結果', w: 120, r: r => <Pill theme={th} tone={R[r.result].tone} dot>{R[r.result].zh}<span style={{ marginLeft: 3, opacity: .6, fontFamily: SHELL_MONO, fontSize: 9 }}>{r.result}</span></Pill> },
            { h: '依據', k: 'policy', w: 190, r: r => <span style={{ fontSize: 11.5, fontFamily: SHELL_MONO, color: th.textMuted }}>{r.policy}</span> },
          ]} rows={samples} />
        </Card>
        <Banner theme={th} tone="info" icon="info" body="流程 2 驗證：新禁上車區內的上車樣本被擋（no_pickup）、同座標下車不受影響、區外對照樣本仍可服務 — 政策符合，可安心發佈。" />
      </div>
    </Shell>
  );
}

// ── 5 · 退場 / 替換 + active history + audit ─────────────────────────────────
function PA_ServiceAreaRetire({ theme: th }) {
  return (
    <Shell theme={th} nav={PA_NAV} active="service-area"
      breadcrumb={['服務區治理', '台北車站西側 禁上車', '退場']} env="production" actor={PSB_ACTOR} health={PA_HEALTH}
      refreshTier="medium_slow" dataFreshness="fresh">
      <PageHeader theme={th}
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>台北車站西側 禁上車 · 退場 / 替換{saPill(th, 'active')}</span>}
        subtitle="sp_station_w · v2 · pickup / deny · 生效 2026-04-01 → 開放式"
        meta={<SaTaxiMark theme={th} />}
        actions={<><Btn theme={th} icon="edit">發佈替換 draft</Btn><Btn theme={th} variant="secondary" danger icon="x">帶理由退場</Btn></>} />
      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card theme={th} title="退場設定 · retire">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
              <Field theme={th} label="退場生效日 · required" required><Input theme={th} value="2026-08-01 00:00" mono /></Field>
              <Field theme={th} label="替換 draft（可選）"><Select theme={th} value="— 無 · 純退場" /></Field>
            </div>
            <Field theme={th} label="退場理由 · required" required hint="寫入 audit">
              <div style={{ border: '1px solid ' + th.border, borderRadius: 8, padding: '10px 12px', minHeight: 48, fontSize: 12.5, color: th.text }}>站西施工完成，路肩恢復，經會勘同意解除禁上車。</div>
            </Field>
            <Banner theme={th} tone="warn" icon="warn" title="對 evaluator 的即時影響"
              body="退場生效當刻起，此區上車樣本改判可服務；進行中的訂單不受影響。變更即時套用於後端評估。" />
          </Card>
          <Card theme={th} title="active history · 版本轉換">
            <Timeline theme={th} events={[
              { at: '2026-03-28', tone: 'success', t: 'v2 發佈 · active', body: '駱思賢 · 範圍縮小至西側月台' },
              { at: '2026-04-01', tone: 'neutral', t: 'v1 被 v2 取代 · retired', body: 'supersede on effective' },
              { at: '2026-08-01', tone: 'warn', t: 'v2 排定退場', body: '退場生效 · 待確認', current: true },
            ]} />
          </Card>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card theme={th} title="Audit 可見性" subtitle="actor / id / 版本 / 方向 / 效果 / 生效 / 理由" style={{ borderTop: '2px solid ' + th.accent }} padding={0}>
            <Table theme={th} columns={[
              { h: 'audit', w: 100, mono: true, r: r => <span style={{ color: th.accent, fontWeight: 600 }}>{r.id}</span> },
              { h: '動作', k: 'act', w: 90, mono: true },
              { h: 'actor', k: 'by', w: 80 },
              { h: '版本 · 效果', w: 120, r: r => <span style={{ fontSize: 11, fontFamily: SHELL_MONO }}>{r.ver} · {r.eff}</span> },
              { h: '理由', k: 'why', w: 140, r: r => <span style={{ fontSize: 11.5, color: th.textMuted }}>{r.why}</span> },
            ]} rows={[
              { id: 'aud_1180', act: 'publish', by: '駱思賢', ver: 'v2 · deny', why: '範圍縮小至西側月台' },
              { id: 'aud_0862', act: 'retire', by: '系統', ver: 'v1 · deny', why: '被 v2 取代' },
              { id: 'aud_0641', act: 'publish', by: '林芷瑄', ver: 'v1 · deny', why: '站西施工圍籬' },
            ]} />
          </Card>
          <Card theme={th} title="下游影響檢核">
            <DL theme={th} cols={1} items={[
              { k: '涵蓋現行訂單', v: '0 · 不追溯', mono: false },
              { k: '影響評估點', v: '上車 evaluate', mono: true },
              { k: '通知', v: 'Ops Console · 派遣提示更新', mono: false },
            ]} />
          </Card>
        </div>
      </div>
    </Shell>
  );
}

// ── 6 · 空 / 錯誤 / 降級 狀態 ─────────────────────────────────────────────────
function PA_ServiceAreaStates({ theme: th }) {
  const cells = [
    { t: '載入中 · loading', el: <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{[0, 1, 2].map(i => <div key={i} style={{ height: 14, borderRadius: 4, background: th.surfaceLo, animation: 'pulse 1.5s infinite', animationDelay: i * .2 + 's' }} />)}</div> },
    { t: '尚無界線 / 政策', el: <EmptyState theme={th} reason="no_data" compact messageOverride="此服務區尚無界線或停靠政策，建立第一筆 draft 開始治理。" nextAction="建立 draft" /> },
    { t: '權限不足', el: <EmptyState theme={th} reason="permission_denied" compact messageOverride="服務區治理需 platform 治理權限；您目前僅可檢視。" /> },
    { t: '抓取失敗', el: <Banner theme={th} tone="danger" icon="warn" title="無法載入治理紀錄" body="GET /admin/definitions 失敗 · 重試或回報。" actions={<Btn theme={th} size="xs" icon="refresh">重試</Btn>} /> },
    { t: '幾何驗證失敗', el: <Banner theme={th} tone="danger" icon="warn" title="GEOMETRY_INVALID · 自交多邊形" body="第 3–4 節點線段交叉，請調整節點後重新驗證。" /> },
    { t: '發佈受阻 · 生效窗口無效', el: <Banner theme={th} tone="warn" icon="warn" title="LIFECYCLE_WINDOW_INVALID" body="生效迄早於生效起；或與同名 active 版本窗口重疊未指定取代。" /> },
    { t: '預覽失敗', el: <Banner theme={th} tone="warn" icon="warn" title="evaluate 暫時不可用" body="後端評估逾時 · 可稍後重試；發佈不受此頁影響。" actions={<Btn theme={th} size="xs" icon="refresh">重試</Btn>} /> },
    { t: '資料新鮮度降級', el: <Banner theme={th} tone="warn" icon="info" title="快取資料 · 4 分鐘前" body="治理清單為快取；發佈/退場動作會強制重新讀取權威狀態。" /> },
  ];
  return (
    <Shell theme={th} nav={PA_NAV} active="service-area"
      breadcrumb={['服務區治理', '狀態']} env="production" actor={PSB_ACTOR} health={PA_HEALTH}
      refreshTier="medium_slow" dataFreshness="stale">
      <PageHeader theme={th} title="空 / 錯誤 / 降級狀態" subtitle="loading · empty · permission · fetch/geometry/lifecycle/preview failures · freshness"
        meta={<SaTaxiMark theme={th} />} />
      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {cells.map((c, i) => (
          <Card theme={th} key={i} title={c.t} padding={16}>{c.el}</Card>
        ))}
      </div>
    </Shell>
  );
}

Object.assign(window, {
  SA_STATUS, saPill, SA_DIR, SA_EFFECT, saEffect, SaTaxiMark, SaGeometryEditor, SaTypeSwitch,
  PA_ServiceAreaGov, PA_ServiceAreaPublish, PA_ServiceAreaPreview, PA_ServiceAreaRetire, PA_ServiceAreaStates,
});
