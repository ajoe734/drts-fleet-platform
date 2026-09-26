// driver-supply.jsx — Packet 4 · Driver App 增量. EXTENDS Driver App (RN/Expo look, blue realm).
// (A) Tracking Status diagnostics · (B) Permission Gate · (C) Service Product Context.
// Reuses DrvCard/DrvPill/DrvSection/DrvBigBtn/DrvEmpty/DrvIcon/DrvStickyAction. zh-TW · raw_code 雙語.

// exact service product codes (SA §5.1) → readable zh
const DRV_PRODUCTS = {
  taxi_realtime:                { zh: '即時叫車', tone: 'neutral' },
  taxi_reservation:             { zh: '預約叫車', tone: 'neutral' },
  enterprise_dispatch:          { zh: '企業派車', tone: 'info' },
  credit_card_airport_transfer: { zh: '信用卡機場接送', tone: 'success' },
  insurance_replacement_vehicle:{ zh: '保險理賠代步', tone: 'warn' },
  travel_agency_transfer:       { zh: '旅行社團體接送', tone: 'info' },
  third_party_forwarded_order:  { zh: '第三方轉單', tone: 'neutral' },
};

// driver state model (SA §6.2) with location cadence
const DRV_STATES = [
  { k: 'offline', zh: '離線', cadence: '不上傳' },
  { k: 'online_available', zh: '上線待命', cadence: '30s / 100m' },
  { k: 'assigned', zh: '已指派', cadence: '15s / 50m' },
  { k: 'enroute_to_pickup', zh: '前往上車', cadence: '10–15s / 25m' },
  { k: 'arrived_pickup', zh: '抵達上車', cadence: '15s / 25m' },
  { k: 'on_trip', zh: '行程中', cadence: '10–15s / 25m' },
  { k: 'incident', zh: '事故', cadence: '5–10s' },
  { k: 'paused', zh: '暫停', cadence: '60s' },
];

// freshness chip
function FreshDot({ theme: t, state }) {
  const m = { fresh: { zh: 'fresh', c: t.success }, stale: { zh: 'stale', c: t.warn }, low_accuracy: { zh: 'low-acc', c: t.warn }, missing: { zh: 'missing', c: t.danger } }[state];
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: m.c }}><span style={{ width: 7, height: 7, borderRadius: 4, background: m.c }} />{m.zh}</span>;
}
function DiagRow({ theme: t, icon, label, value, tone = 'neutral', sub }) {
  const c = t[tone] || t.text;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 0', borderBottom: '1px solid ' + t.surfaceLo }}>
      <span style={{ width: 30, height: 30, borderRadius: 8, background: t.surfaceLo, color: c, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><DrvIcon name={icon} size={16} stroke={1.8} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, color: t.textMuted }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: t.textDim }}>{sub}</div>}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: c, textAlign: 'right' }}>{value}</div>
    </div>
  );
}

// ── A · Tracking Status UI (VQ-1 standalone / VQ-2 queue · VQ-4 freshness) ────
function DRV_TrackingStatus({ theme: t, variant = 'good' }) {
  const degraded = variant === 'degraded';
  const gap = variant === 'gap';
  return (
    <div style={{ flex: 1, overflowY: 'auto', background: t.bg, padding: 16 }}>
      <DrvSection theme={t} zh="追蹤狀態" en="tracking-status" dense>
        {gap && (
          <div style={{ marginBottom: 12, padding: 12, borderRadius: 10, background: t.warnBg, border: '1px solid ' + t.warn, display: 'flex', gap: 10 }}>
            <DrvIcon name="warn" size={18} stroke={2} style={{ color: t.warn, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: t.warn }}>偵測到追蹤中斷 · tracking gap</div>
              <div style={{ fontSize: 11.5, color: t.textMuted, marginTop: 2, lineHeight: 1.5 }}>App 曾被強制關閉，背景車跡有 8 分鐘缺口。已重新同步定位與任務，不會偽造連續軌跡。</div>
            </div>
          </div>
        )}
        <DrvCard theme={t} accent={degraded || gap ? t.warn : t.success}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{ width: 38, height: 38, borderRadius: 19, background: (degraded || gap ? t.warnBg : t.successBg), color: (degraded || gap ? t.warn : t.success), display: 'flex', alignItems: 'center', justifyContent: 'center' }}><DrvIcon name={degraded || gap ? 'warn' : 'shield'} size={20} stroke={2} /></span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: t.text }}>{degraded || gap ? '追蹤降級' : '追蹤良好'}</div>
              <div style={{ fontSize: 11.5, color: t.textMuted }}>{degraded ? '權限受限 / 定位過期' : gap ? '已重新同步' : '權限齊全 · 定位即時 · 佇列低'}</div>
            </div>
            <DrvPill theme={t} tone={degraded || gap ? 'warn' : 'success'} dot>{degraded ? 'degraded' : gap ? 'resynced' : 'good'}</DrvPill>
          </div>
        </DrvCard>

        <div style={{ height: 12 }} />
        <DrvCard theme={t}>
          <DiagRow theme={t} icon="pin" label="前景定位 · foreground" value="已授權" tone="success" />
          <DiagRow theme={t} icon="layers" label="背景定位 · background" value={degraded ? '受限' : '運作中'} tone={degraded ? 'warn' : 'success'} sub={degraded ? '營運不可靠 · 需背景定位' : 'always granted'} />
          <DiagRow theme={t} icon="clock" label="上次上傳 · last upload" value={degraded ? '4 分鐘前' : '8 秒前'} tone={degraded ? 'warn' : 'neutral'} />
          <DiagRow theme={t} icon="refresh" label="待送佇列 · queue depth" value={degraded ? '42 筆' : '0 筆'} tone={degraded ? 'warn' : 'neutral'} sub="durable · SQLite" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 0' }}>
            <span style={{ width: 30, height: 30, borderRadius: 8, background: t.surfaceLo, color: t.brand, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><DrvIcon name="pin" size={16} /></span>
            <div style={{ flex: 1 }}><div style={{ fontSize: 12.5, color: t.textMuted }}>定位鮮度 · freshness</div></div>
            <FreshDot theme={t} state={degraded ? 'stale' : 'fresh'} />
          </div>
        </DrvCard>

        <div style={{ height: 12 }} />
        <DrvCard theme={t}>
          <div style={{ fontSize: 12, fontWeight: 700, color: t.textMuted, marginBottom: 8 }}>目前狀態 · current state</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <DrvPill theme={t} tone="info" dot>{degraded ? '上線待命' : '行程中'}</DrvPill>
            <span style={{ fontSize: 11.5, color: t.textMuted, fontFamily: 'monospace' }}>{degraded ? 'online_available · 30s/100m' : 'on_trip · 10–15s/25m'}</span>
          </div>
          <div style={{ fontSize: 12, color: t.textDim }}>車輛 ARJ-3120 · 任務 ord_8232</div>
        </DrvCard>

        {degraded && <div style={{ marginTop: 12 }}><DrvBigBtn theme={t} kind="primary" icon="refresh">重新同步定位</DrvBigBtn></div>}
      </DrvSection>
    </div>
  );
}

// ── B · Permission Gate (VQ-3) ───────────────────────────────────────────────
function DRV_PermissionGate({ theme: t, variant = 'foreground_denied' }) {
  const cfg = {
    foreground_denied: { icon: 'pin', tone: 'danger', title: '需要定位權限才能上線', reason: 'LOCATION_PERMISSION_DENIED',
      body: '前景定位權限被拒，無法上線接單。請至系統設定開啟「位置」權限。', cta: '前往系統設定', canBrowse: false,
      steps: [['前景定位', false], ['背景定位', false], ['裝置綁定', true], ['身分有效', true]] },
    background_denied: { icon: 'layers', tone: 'warn', title: '背景定位未開啟', reason: 'BACKGROUND_LOCATION_REQUIRED',
      body: '您可登入並瀏覽資料，但未開啟背景定位前無法進入「上線待命」，也不能接受需背景追蹤的任務。', cta: '開啟背景定位 · 前往設定', canBrowse: true,
      steps: [['前景定位', true], ['背景定位', false], ['裝置綁定', true], ['身分有效', true]] },
    device_not_bound: { icon: 'lock', tone: 'danger', title: '裝置尚未綁定', reason: 'DEVICE_NOT_BOUND',
      body: '此裝置未完成綁定，無法上線。請聯絡車行管理者或重新完成裝置綁定流程。', cta: '重新綁定裝置', canBrowse: false,
      steps: [['前景定位', true], ['背景定位', true], ['裝置綁定', false], ['身分有效', true]] },
  }[variant];
  const c = t[cfg.tone];
  return (
    <div style={{ flex: 1, overflowY: 'auto', background: t.bg, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, padding: 20, display: 'flex', flexDirection: 'column' }}>
        {/* check sequence */}
        <div style={{ marginTop: 8, marginBottom: 22 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: t.textMuted, marginBottom: 10 }}>上線前檢查 · pre-online checks</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {cfg.steps.map(([label, ok], i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 9, background: t.surface, border: '1px solid ' + (ok ? t.border : c) }}>
                <span style={{ width: 22, height: 22, borderRadius: 11, background: ok ? t.successBg : t.dangerBg, color: ok ? t.success : c, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><DrvIcon name={ok ? 'check' : 'x'} size={13} stroke={3} /></span>
                <span style={{ flex: 1, fontSize: 13, color: t.text }}>{label}</span>
                {!ok && <span style={{ fontSize: 11, color: c, fontWeight: 600 }}>需處理</span>}
              </div>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 8px' }}>
          <span style={{ width: 68, height: 68, borderRadius: 34, background: t[cfg.tone + 'Bg'], color: c, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}><DrvIcon name={cfg.icon} size={32} stroke={1.8} /></span>
          <div style={{ fontSize: 18, fontWeight: 800, color: t.text, marginBottom: 8 }}>{cfg.title}</div>
          <code style={{ fontSize: 11, fontFamily: 'monospace', color: c, background: t[cfg.tone + 'Bg'], padding: '3px 10px', borderRadius: 999, marginBottom: 12 }}>{cfg.reason}</code>
          <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.65, maxWidth: 300 }}>{cfg.body}</div>
          {cfg.canBrowse && (
            <div style={{ marginTop: 14, padding: '8px 14px', borderRadius: 999, background: t.warnBg, border: '1px solid ' + t.warn }}>
              <span style={{ fontSize: 11.5, color: t.warn, fontWeight: 600 }}>可瀏覽資料 · 不可上線接單</span>
            </div>
          )}
        </div>
      </div>
      <div style={{ padding: 16, borderTop: '1px solid ' + t.border, background: t.surface, display: 'flex', flexDirection: 'column', gap: 9 }}>
        <DrvBigBtn theme={t} kind="primary" icon="ext">{cfg.cta}</DrvBigBtn>
        {cfg.canBrowse && <DrvBigBtn theme={t} kind="ghost">先瀏覽，稍後再上線</DrvBigBtn>}
      </div>
    </div>
  );
}

// ── C · Service Product Context (VQ-5) ───────────────────────────────────────
function DRV_ProductContext({ theme: t }) {
  const tasks = [
    { code: 'credit_card_airport_transfer', from: '台北信義 松仁路 100 號', to: '桃園機場 T2', when: '今日 14:30', owned: true, fare: 'NT$ 1,580' },
    { code: 'insurance_replacement_vehicle', from: '板橋 文化路一段', to: '台北榮總', when: '今日 16:00', owned: true, fare: '理賠給付' },
    { code: 'enterprise_dispatch', from: '南港 三重路', to: '內湖科技園區', when: '今日 17:20', owned: true, fare: '企業帳' },
    { code: 'travel_agency_transfer', from: '桃機 T1 入境', to: '西門商旅', when: '明日 09:00', owned: false, fare: '已含團費' },
  ];
  return (
    <div style={{ flex: 1, overflowY: 'auto', background: t.bg, padding: 16 }}>
      <DrvSection theme={t} zh="任務 · 精確服務產品" en="exact service product" dense>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
          {tasks.map((task, i) => {
            const p = DRV_PRODUCTS[task.code];
            return (
              <DrvCard theme={t} key={i} accent={task.owned ? t.ownedFg : t.forwardedFg}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                  {/* exact product label — VQ-5, longer strings wrap gracefully */}
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: t[p.tone], background: t[p.tone + 'Bg'], padding: '4px 10px', borderRadius: 8, lineHeight: 1.3 }}>{p.zh}</span>
                  <span style={{ fontSize: 10, fontFamily: 'monospace', color: t.textDim }}>{task.code}</span>
                  <span style={{ flex: 1 }} />
                  <DrvPill theme={t} tone={task.owned ? 'info' : 'warn'}>{task.owned ? 'owned' : 'forwarded'}</DrvPill>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 3 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 4, border: '2px solid ' + t.brand }} />
                    <span style={{ flex: 1, width: 2, background: t.border, margin: '3px 0', minHeight: 16 }} />
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: t.brand }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: t.text, marginBottom: 12 }}>{task.from}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{task.to}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, paddingTop: 10, borderTop: '1px solid ' + t.surfaceLo }}>
                  <DrvIcon name="clock" size={13} style={{ color: t.textMuted }} />
                  <span style={{ fontSize: 12, color: t.textMuted }}>{task.when}</span>
                  <span style={{ flex: 1 }} />
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: t.text }}>{task.fare}</span>
                </div>
              </DrvCard>
            );
          })}
        </div>
      </DrvSection>
    </div>
  );
}

// ── Driver state model reference (SA §6.2 + §6.8 cross-surface consistency) ───
function DRV_StateModel({ theme: t }) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', background: t.bg, padding: 16 }}>
      <DrvSection theme={t} zh="司機狀態模型" en="driver state model" dense>
        <DrvCard theme={t}>
          <div style={{ fontSize: 11.5, color: t.textMuted, lineHeight: 1.6, marginBottom: 10 }}>App 顯示、API record、Ops Console 三者必須一致（SA §6.8）；不得出現 App completed 但後端仍 on_trip 等錯亂。</div>
          {DRV_STATES.map((s, i) => (
            <div key={s.k} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: i < DRV_STATES.length - 1 ? '1px solid ' + t.surfaceLo : 'none' }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: s.k === 'incident' ? t.danger : s.k === 'on_trip' ? t.brand : t.textDim, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{s.zh}</div>
                <div style={{ fontSize: 10.5, fontFamily: 'monospace', color: t.textDim }}>{s.k}</div>
              </div>
              <span style={{ fontSize: 11.5, fontFamily: 'monospace', color: t.textMuted }}>{s.cadence}</span>
            </div>
          ))}
        </DrvCard>
      </DrvSection>
    </div>
  );
}

Object.assign(window, {
  DRV_PRODUCTS, DRV_STATES, FreshDot, DiagRow,
  DRV_TrackingStatus, DRV_PermissionGate, DRV_ProductContext, DRV_StateModel,
});
