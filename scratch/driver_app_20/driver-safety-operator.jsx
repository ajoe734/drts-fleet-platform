// driver-safety-operator.jsx — Phase 2 A2 · Safety Operator Mode (driver-app NEW realm).
// SEPARATE from normal driver mode (distinct violet realm + persistent mode banner).
// Hard rules: offline cache + unsynced state always visible · takeover report quick-capture
// (time editable but audit-logged) · NEVER shows/controls Tesla FSD internal controls.
// Reuses driver primitives (DrvCard/DrvPill/DrvBigBtn/DrvIcon/DrvBi/DrvEmpty). zh-TW · raw_code 雙語.

// ── SO realm palette (distinct from driver blue) ─────────────────────────────
function soPal(t) {
  const dark = t.surface !== '#FFFFFF';
  return dark
    ? { fg: '#C4B5FD', hi: '#DDD6FE', bg: '#241A3B', border: '#3B2D63', on: '#0F0A1E' }
    : { fg: '#6D28D9', hi: '#7C3AED', bg: '#F2ECFE', border: '#DBCBF7', on: '#FFFFFF' };
}

// evidence source provenance (ROC/SO shared rule — every AV/sandbox datum is labelled)
const SO_EVIDENCE = {
  tesla_provided:        { zh: 'Tesla 提供', tone: 'info' },
  operator_reported:     { zh: '安全員回報', tone: 'brand' },
  device_recorded:       { zh: '車載錄製', tone: 'neutral' },
  not_exposed_by_provider:{ zh: '原廠未提供', tone: 'warn' },
};
function EvidenceTag({ theme: t, src }) {
  const m = SO_EVIDENCE[src] || SO_EVIDENCE.device_recorded;
  return <DrvPill theme={t} tone={m.tone}>{m.zh}<span style={{ fontFamily: 'monospace', fontSize: 8.5, opacity: .6, marginLeft: 3 }}>{src}</span></DrvPill>;
}

// ── persistent SO mode banner (realm marker) ─────────────────────────────────
function SOModeBar({ theme: t, title, en, back, right }) {
  const so = soPal(t);
  return (
    <div style={{ flexShrink: 0 }}>
      <div style={{ background: so.fg, color: so.on, padding: '4px 14px', display: 'flex', alignItems: 'center', gap: 7, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4 }}>
        <DrvIcon name="shield" size={12} stroke={2.4} />
        安全員模式 · SAFETY OPERATOR
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: 'monospace', fontSize: 9, opacity: .82 }}>FSD 沙盒</span>
      </div>
      <div style={{ padding: '8px 14px 10px', background: t.bgRaised, borderBottom: '1px solid ' + t.border, display: 'flex', alignItems: 'center', gap: 10 }}>
        {back && <button style={{ width: 30, height: 30, border: 'none', background: 'transparent', color: t.text, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><DrvIcon name="arrowL" size={20} stroke={2} /></button>}
        <div style={{ flex: 1, minWidth: 0 }}><DrvBi zh={title} en={en} theme={t} size={17} /></div>
        {right}
      </div>
    </div>
  );
}

// ── offline cache + unsynced visibility (hard rule) ──────────────────────────
function SOSyncStrip({ theme: t, queued = 0, syncing = false, offline = false }) {
  const so = soPal(t);
  const tone = offline ? t.warn : queued > 0 ? so.fg : t.success;
  const bg = offline ? t.warnBg : queued > 0 ? so.bg : t.successBg;
  return (
    <div style={{ flexShrink: 0, padding: '7px 14px', background: bg, borderBottom: '1px solid ' + t.border, display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5 }}>
      <DrvIcon name={offline ? 'warn' : syncing ? 'refresh' : 'check'} size={13} stroke={2} style={{ color: tone }} />
      <span style={{ color: tone, fontWeight: 700 }}>
        {offline ? '離線中 · offline' : syncing ? '同步中 · syncing' : queued > 0 ? '離線暫存' : '已同步 · synced'}
      </span>
      {queued > 0 && <span style={{ color: t.textMuted }}>· {queued} 筆待同步 · queued</span>}
      <span style={{ flex: 1 }} />
      <span style={{ fontFamily: 'monospace', fontSize: 9.5, color: t.textDim }}>durable cache</span>
    </div>
  );
}

// ── SO frame: status-handled by PhoneRaw; we render mode-bar + sync + body ────
function SOFrame({ theme: t, title, en, back, right, queued, syncing, offline, scroll = true, footer, children }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: t.bg }}>
      <SOModeBar theme={t} title={title} en={en} back={back} right={right} />
      <SOSyncStrip theme={t} queued={queued} syncing={syncing} offline={offline} />
      <div style={{ flex: 1, overflowY: scroll ? 'auto' : 'hidden', padding: 14 }}>{children}</div>
      {footer && <div style={{ flexShrink: 0, padding: 12, background: t.bgRaised, borderTop: '1px solid ' + t.border, display: 'flex', flexDirection: 'column', gap: 8 }}>{footer}</div>}
    </div>
  );
}

// small labelled row
function SORow({ theme: t, k, v, mono, tone }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, padding: '8px 0', borderBottom: '1px solid ' + t.surfaceLo }}>
      <span style={{ fontSize: 12, color: t.textMuted }}>{k}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: tone || t.text, fontFamily: mono ? 'monospace' : 'inherit', textAlign: 'right' }}>{v}</span>
    </div>
  );
}
function SOCheck({ theme: t, label, sub, done, blocked }) {
  const so = soPal(t);
  return (
    <div style={{ display: 'flex', gap: 11, padding: '11px 0', borderBottom: '1px solid ' + t.surfaceLo }}>
      <span style={{ width: 24, height: 24, borderRadius: 12, flexShrink: 0, background: done ? t.successBg : blocked ? t.dangerBg : t.surfaceLo, color: done ? t.success : blocked ? t.danger : t.textDim, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <DrvIcon name={done ? 'check' : blocked ? 'x' : 'minus'} size={13} stroke={3} />
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: t.text }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: t.textMuted, marginTop: 1 }}>{sub}</div>}
      </div>
      {blocked && <DrvPill theme={t} tone="danger">待處理</DrvPill>}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 1 · Provisioning / Qualification
// ════════════════════════════════════════════════════════════════════════════
function SO_Provisioning({ theme: t }) {
  const so = soPal(t);
  return (
    <SOFrame theme={t} title="安全員資格" en="qualification" queued={0}
      footer={<DrvBigBtn theme={t} kind="secondary" disabled>資格審核中 · 無法開始輪班</DrvBigBtn>}>
      <DrvCard theme={t} accent={so.fg} style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <div style={{ width: 44, height: 44, borderRadius: 22, background: so.bg, color: so.fg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><DrvIcon name="user" size={22} /></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: t.text }}>陳柏宇 · SO-2024-0118</div>
            <div style={{ fontSize: 11.5, color: t.textMuted }}>安全員 · FSD 監理沙盒</div>
          </div>
          <DrvPill theme={t} tone="warn" dot>審核中</DrvPill>
        </div>
      </DrvCard>
      <DrvCard theme={t}>
        <DrvBi zh="資格項目" en="qualification items" theme={t} size={11} />
        <div style={{ marginTop: 6 }}>
          <SOCheck theme={t} label="安全員教育訓練" sub="40 小時 · 已完成 2026-05" done />
          <SOCheck theme={t} label="接管演練認證" sub="takeover drill cert" done />
          <SOCheck theme={t} label="沙盒實驗指派" sub="experiment exp_fsd_taipei_01" done />
          <SOCheck theme={t} label="背景審查" sub="background check · 審核中" blocked />
        </div>
      </DrvCard>
      <div style={{ marginTop: 12 }}><DrvEmpty theme={t} reason="driver_not_eligible" message="背景審查通過後即可開始安全員輪班。資格由平台 Safety Operator Qualifications 核定。" /></div>
    </SOFrame>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 2 · Shift Start
// ════════════════════════════════════════════════════════════════════════════
function SO_ShiftStart({ theme: t }) {
  const so = soPal(t);
  return (
    <SOFrame theme={t} title="開始輪班" en="shift start" queued={0}
      footer={<DrvBigBtn theme={t} kind="primary" icon="power" style={{ background: so.fg, borderColor: so.fg }}>開始輪班 · start shift</DrvBigBtn>}>
      <DrvCard theme={t} style={{ marginBottom: 12 }}>
        <SORow theme={t} k="實驗 · experiment" v="exp_fsd_taipei_01" mono />
        <SORow theme={t} k="核准時段 · window" v="08:00–18:00" mono />
        <SORow theme={t} k="核准區域 · area" v="信義 / 南港 沙盒區" />
        <SORow theme={t} k="班別 · shift" v="日班 · day" />
      </DrvCard>
      <DrvCard theme={t}>
        <DrvBi zh="上班前確認" en="pre-shift checks" theme={t} size={11} />
        <div style={{ marginTop: 6 }}>
          <SOCheck theme={t} label="定位權限 · 背景定位" sub="foreground + background granted" done />
          <SOCheck theme={t} label="裝置綁定" sub="device bound · SO tablet" done />
          <SOCheck theme={t} label="離線快取就緒" sub="durable cache ready" done />
          <SOCheck theme={t} label="體溫 / 酒測自述" sub="self-declaration" done />
        </div>
      </DrvCard>
    </SOFrame>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 3 · Vehicle Assignment
// ════════════════════════════════════════════════════════════════════════════
function SO_VehicleAssign({ theme: t }) {
  const so = soPal(t);
  const cars = [
    { plate: 'AV-7720', model: 'Tesla Model Y · FSD', area: '信義', ok: true, integ: 'connected' },
    { plate: 'AV-7732', model: 'Tesla Model 3 · FSD', area: '南港', ok: true, integ: 'connected' },
    { plate: 'AV-7708', model: 'Tesla Model Y · FSD', area: '信義', ok: false, integ: 'provider_unreachable' },
  ];
  return (
    <SOFrame theme={t} title="指派車輛" en="vehicle assignment" queued={0}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {cars.map(c => (
          <DrvCard theme={t} key={c.plate} accent={c.ok ? so.fg : t.warn}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: t.surfaceLo, color: c.ok ? so.fg : t.warn, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><DrvIcon name="car" size={20} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: t.text }}>{c.plate}</div>
                <div style={{ fontSize: 11.5, color: t.textMuted }}>{c.model} · {c.area}</div>
              </div>
              {c.ok
                ? <DrvBigBtn theme={t} kind="secondary" full={false} style={{ height: 38, fontSize: 13 }}>指派</DrvBigBtn>
                : <DrvPill theme={t} tone="warn" dot>整合異常</DrvPill>}
            </div>
            <div style={{ marginTop: 9, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <DrvPill theme={t} tone={c.ok ? 'success' : 'warn'}>Tesla 整合 · {c.integ}</DrvPill>
              <EvidenceTag theme={t} src={c.ok ? 'tesla_provided' : 'not_exposed_by_provider'} />
            </div>
          </DrvCard>
        ))}
      </div>
    </SOFrame>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 4 · Pre-trip Checklist
// ════════════════════════════════════════════════════════════════════════════
function SO_Pretrip({ theme: t }) {
  const so = soPal(t);
  return (
    <SOFrame theme={t} title="行前檢查" en="pre-trip checklist" queued={1}
      footer={<DrvBigBtn theme={t} kind="primary" icon="check" style={{ background: so.fg, borderColor: so.fg }}>完成檢查 · 可出車</DrvBigBtn>}>
      <DrvCard theme={t} style={{ marginBottom: 10 }}>
        <SORow theme={t} k="車輛 · vehicle" v="AV-7720 · Model Y" mono />
        <SORow theme={t} k="實驗 · experiment" v="exp_fsd_taipei_01" mono />
      </DrvCard>
      <DrvCard theme={t}>
        <DrvBi zh="檢查項目" en="checklist" theme={t} size={11} />
        <div style={{ marginTop: 6 }}>
          <SOCheck theme={t} label="車外車況目視" sub="外觀 / 輪胎 / 車牌" done />
          <SOCheck theme={t} label="車內安全配備" sub="安全帶 / 滅火器 / 急救包" done />
          <SOCheck theme={t} label="車載錄影設備運作" sub="evidence recorder · device_recorded" done />
          <SOCheck theme={t} label="Tesla 整合連線" sub="regulatory data interface" done />
          <SOCheck theme={t} label="接管座椅 / 控制就緒" sub="安全員可隨時實體接管" done />
          <SOCheck theme={t} label="清潔狀態拍照" sub="未同步 · 待上傳" blocked />
        </div>
      </DrvCard>
      <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 10, background: t.warnBg, border: '1px solid ' + t.warn, fontSize: 11.5, color: t.text, lineHeight: 1.5 }}>
        ⚠ 安全員僅進行<strong>監看與必要時實體接管</strong>，本 App 不顯示、也不控制 Tesla FSD 內部控制（方向盤角度、感知物件等）。
      </div>
    </SOFrame>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 5 · Active Trip — monitoring only (NO FSD internal controls / NO remote driving)
// ════════════════════════════════════════════════════════════════════════════
function SO_ActiveTrip({ theme: t }) {
  const so = soPal(t);
  return (
    <SOFrame theme={t} title="行程監看" en="active trip · monitoring" queued={2} scroll
      footer={<div style={{ display: 'flex', gap: 8 }}>
        <DrvBigBtn theme={t} kind="secondary" icon="camera" full={false} style={{ flex: 1, height: 50 }}>記錄事件</DrvBigBtn>
        <DrvBigBtn theme={t} danger icon="warn" style={{ flex: 1.4 }}>接管回報</DrvBigBtn>
      </div>}>
      {/* AV status (monitoring) */}
      <DrvCard theme={t} accent={so.fg} style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span style={{ width: 10, height: 10, borderRadius: 5, background: t.success }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: t.text }}>FSD 自動駕駛中</div>
            <div style={{ fontSize: 11.5, color: t.textMuted }}>AV-7720 · trip_88231 · 信義 → 南港</div>
          </div>
          <DrvPill theme={t} tone="success" dot>autonomous</DrvPill>
        </div>
        {/* two SEPARATE freshness indicators (hard rule) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div style={{ padding: '8px 10px', borderRadius: 9, background: t.surfaceLo }}>
            <div style={{ fontSize: 10, color: t.textMuted }}>telemetry 鮮度</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: t.success, display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 6, height: 6, borderRadius: 3, background: t.success }} />fresh · 2s</div>
          </div>
          <div style={{ padding: '8px 10px', borderRadius: 9, background: t.surfaceLo }}>
            <div style={{ fontSize: 10, color: t.textMuted }}>監理事件鮮度</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: t.warn, display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 6, height: 6, borderRadius: 3, background: t.warn }} />stale · 48s</div>
          </div>
        </div>
      </DrvCard>

      {/* approved route / area context — overlay only, no perception objects */}
      <DrvCard theme={t} style={{ marginBottom: 10, padding: 0, overflow: 'hidden' }}>
        <div style={{ height: 116, background: 'linear-gradient(135deg,' + so.bg + ',' + t.surfaceLo + ')', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', inset: 14, border: '2px dashed ' + so.fg, borderRadius: 12, opacity: .5 }} />
          <div style={{ textAlign: 'center', color: so.fg }}><DrvIcon name="pin" size={22} /><div style={{ fontSize: 11, fontWeight: 700, marginTop: 4 }}>核准路線 overlay</div></div>
        </div>
        <div style={{ padding: '8px 12px', fontSize: 11, color: t.textMuted }}>僅顯示核准區域 / 路線 · 不顯示方向盤角度、感知物件、路側設備</div>
      </DrvCard>

      <DrvCard theme={t}>
        <DrvBi zh="資料來源標記" en="evidence source" theme={t} size={11} />
        <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <EvidenceTag theme={t} src="tesla_provided" />
          <EvidenceTag theme={t} src="device_recorded" />
          <EvidenceTag theme={t} src="not_exposed_by_provider" />
        </div>
      </DrvCard>
    </SOFrame>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 6 · Takeover Report — quick capture (time editable, audit-logged)
// ════════════════════════════════════════════════════════════════════════════
function SO_TakeoverReport({ theme: t }) {
  const so = soPal(t);
  const reasons = ['緊急煞停', '違規迴避', '路口判斷', '行人禮讓', '系統要求', '其他'];
  return (
    <SOFrame theme={t} title="接管回報" en="takeover report" back queued={3} offline
      footer={<DrvBigBtn theme={t} kind="primary" icon="check" style={{ background: so.fg, borderColor: so.fg }}>送出 · 離線暫存</DrvBigBtn>}>
      <div style={{ padding: '10px 12px', borderRadius: 10, background: t.warnBg, border: '1px solid ' + t.warn, marginBottom: 12, fontSize: 11.5, color: t.text, lineHeight: 1.5 }}>
        快速記錄 · 系統已自動帶入接管時刻。<strong>時間可修正，但每次修改都留 audit。</strong>
      </div>
      <DrvCard theme={t} style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 11, color: t.textMuted }}>接管時刻 · takeover at（可修正）</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: t.text, fontFamily: 'monospace' }}>14:32:08</div>
          </div>
          <DrvBigBtn theme={t} kind="outline" full={false} icon="clock" style={{ height: 40, fontSize: 12 }}>修正時間</DrvBigBtn>
        </div>
        <div style={{ marginTop: 8, fontSize: 10.5, color: t.textDim, display: 'flex', alignItems: 'center', gap: 5 }}><DrvIcon name="lock" size={11} />原始系統時刻 14:32:08 · 修改將記入 audit</div>
      </DrvCard>
      <DrvCard theme={t} style={{ marginBottom: 10 }}>
        <DrvBi zh="接管原因" en="reason" theme={t} size={11} />
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 7 }}>
          {reasons.map((r, i) => (
            <span key={r} style={{ padding: '8px 13px', borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
              background: i === 0 ? so.bg : t.surfaceLo, color: i === 0 ? so.fg : t.textMuted, border: '1px solid ' + (i === 0 ? so.fg : t.border) }}>{r}</span>
          ))}
        </div>
      </DrvCard>
      <DrvCard theme={t} style={{ marginBottom: 10 }}>
        <DrvBi zh="嚴重度" en="severity" theme={t} size={11} />
        <div style={{ marginTop: 8, display: 'flex', gap: 7 }}>
          {[['低', t.success], ['中', t.warn], ['高', t.danger]].map(([l, c], i) => (
            <span key={l} style={{ flex: 1, textAlign: 'center', padding: '10px 0', borderRadius: 10, fontSize: 13, fontWeight: 700,
              background: i === 1 ? c + '22' : t.surfaceLo, color: i === 1 ? c : t.textMuted, border: '1px solid ' + (i === 1 ? c : t.border) }}>{l}</span>
          ))}
        </div>
      </DrvCard>
      <DrvCard theme={t}>
        <DrvBi zh="現場補充" en="note + evidence" theme={t} size={11} />
        <div style={{ marginTop: 8, padding: '10px 12px', border: '1px solid ' + t.border, borderRadius: 9, minHeight: 48, fontSize: 12.5, color: t.textDim }}>路口黃燈，FSD 猶豫，安全員接管完成通過…</div>
        <div style={{ marginTop: 8 }}><DrvBigBtn theme={t} kind="outline" icon="camera" style={{ height: 42, fontSize: 13 }}>附現場影像 · 2 段</DrvBigBtn></div>
      </DrvCard>
    </SOFrame>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 7 · Incident / Evidence Upload
// ════════════════════════════════════════════════════════════════════════════
function SO_IncidentUpload({ theme: t }) {
  const so = soPal(t);
  const items = [
    { name: 'front_cam_1432.mp4', size: '48 MB', state: 'uploading', pct: 62, src: 'device_recorded' },
    { name: 'cabin_cam_1432.mp4', size: '31 MB', state: 'queued', pct: 0, src: 'device_recorded' },
    { name: 'so_photo_001.jpg', size: '3.2 MB', state: 'done', pct: 100, src: 'operator_reported' },
    { name: 'tesla_event_log.json', size: '—', state: 'unavailable', pct: 0, src: 'not_exposed_by_provider' },
  ];
  const stTone = { uploading: 'info', queued: 'warn', done: 'success', unavailable: 'neutral' };
  const stZh = { uploading: '上傳中', queued: '待上傳', done: '完成', unavailable: '原廠未提供' };
  return (
    <SOFrame theme={t} title="事故 / 證據上傳" en="incident · evidence" back queued={2} syncing
      footer={<DrvBigBtn theme={t} danger icon="warn">建立事故案件 · incident</DrvBigBtn>}>
      <DrvCard theme={t} style={{ marginBottom: 10 }}>
        <SORow theme={t} k="關聯行程 · trip" v="trip_88231" mono />
        <SORow theme={t} k="接管事件 · takeover" v="tko_0214 · 14:32" mono />
        <SORow theme={t} k="等級 · level" v="L2 · 需通報" tone={t.warn} />
      </DrvCard>
      <DrvCard theme={t}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <DrvBi zh="證據檔案" en="evidence files" theme={t} size={11} />
          <DrvPill theme={t} tone="warn">2 筆待同步</DrvPill>
        </div>
        {items.map((it, i) => (
          <div key={i} style={{ padding: '10px 0', borderBottom: i < items.length - 1 ? '1px solid ' + t.surfaceLo : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <DrvIcon name={it.src === 'operator_reported' ? 'camera' : 'download'} size={15} style={{ color: t.textMuted }} />
              <span style={{ flex: 1, fontSize: 12.5, fontFamily: 'monospace', color: t.text }}>{it.name}</span>
              <span style={{ fontSize: 10.5, color: t.textDim }}>{it.size}</span>
              <DrvPill theme={t} tone={stTone[it.state]}>{stZh[it.state]}</DrvPill>
            </div>
            {it.state === 'uploading' && <div style={{ marginTop: 6, height: 4, borderRadius: 2, background: t.surfaceLo, overflow: 'hidden' }}><div style={{ width: it.pct + '%', height: '100%', background: so.fg }} /></div>}
            <div style={{ marginTop: 6 }}><EvidenceTag theme={t} src={it.src} /></div>
          </div>
        ))}
      </DrvCard>
    </SOFrame>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 8 · Trip Closeout
// ════════════════════════════════════════════════════════════════════════════
function SO_TripCloseout({ theme: t }) {
  const so = soPal(t);
  return (
    <SOFrame theme={t} title="行程結束" en="trip closeout" queued={1}
      footer={<DrvBigBtn theme={t} kind="primary" icon="check" style={{ background: so.fg, borderColor: so.fg }}>確認結束 · 同步</DrvBigBtn>}>
      <DrvCard theme={t} style={{ marginBottom: 10 }}>
        <SORow theme={t} k="行程 · trip" v="trip_88231" mono />
        <SORow theme={t} k="里程 · distance" v="14.2 km" mono />
        <SORow theme={t} k="時長 · duration" v="32 分" mono />
        <SORow theme={t} k="接管次數 · takeovers" v="2" mono tone={t.warn} />
        <SORow theme={t} k="事故 · incidents" v="1 · L2" tone={t.warn} />
      </DrvCard>
      <DrvCard theme={t}>
        <DrvBi zh="結束確認" en="closeout checks" theme={t} size={11} />
        <div style={{ marginTop: 6 }}>
          <SOCheck theme={t} label="接管回報已完成" sub="2 / 2 takeover reports" done />
          <SOCheck theme={t} label="證據上傳完成" sub="1 筆待同步（離線）" blocked />
          <SOCheck theme={t} label="車輛歸還狀態" sub="vehicle returned" done />
        </div>
        <div style={{ marginTop: 10, padding: '9px 12px', borderRadius: 9, background: t.warnBg, fontSize: 11.5, color: t.text }}>1 筆證據仍在離線佇列，恢復連線後將自動同步，不影響結束。</div>
      </DrvCard>
    </SOFrame>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 9 · Shift Handover
// ════════════════════════════════════════════════════════════════════════════
function SO_ShiftHandover({ theme: t }) {
  const so = soPal(t);
  return (
    <SOFrame theme={t} title="交班" en="shift handover" queued={1}
      footer={<DrvBigBtn theme={t} kind="primary" icon="link" style={{ background: so.fg, borderColor: so.fg }}>確認交班 · handover</DrvBigBtn>}>
      <DrvCard theme={t} style={{ marginBottom: 10 }}>
        <SORow theme={t} k="交班給 · to" v="吳明翰 · SO-2024-0120" />
        <SORow theme={t} k="車輛 · vehicle" v="AV-7720" mono />
        <SORow theme={t} k="實驗 · experiment" v="exp_fsd_taipei_01" mono />
      </DrvCard>
      <DrvCard theme={t} style={{ marginBottom: 10 }}>
        <DrvBi zh="本班摘要" en="shift summary" theme={t} size={11} />
        <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, textAlign: 'center' }}>
          {[['趟次', '6'], ['接管', '3'], ['事故', '1']].map(([k, v], i) => (
            <div key={i} style={{ padding: '10px 0', borderRadius: 10, background: t.surfaceLo }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: i === 2 ? t.warn : so.fg, fontFamily: 'monospace' }}>{v}</div>
              <div style={{ fontSize: 10.5, color: t.textMuted }}>{k}</div>
            </div>
          ))}
        </div>
      </DrvCard>
      <DrvCard theme={t}>
        <DrvBi zh="未結事項" en="open items" theme={t} size={11} />
        <div style={{ marginTop: 6 }}>
          <SOCheck theme={t} label="1 筆證據待同步" sub="cabin_cam_1432.mp4 · 離線佇列" blocked />
          <SOCheck theme={t} label="事故案件 inc_0214 待審" sub="已建立 · 等 compliance review" done />
        </div>
        <div style={{ marginTop: 8 }}><div style={{ padding: '10px 12px', border: '1px solid ' + t.border, borderRadius: 9, minHeight: 40, fontSize: 12.5, color: t.textDim }}>交班備註：AV-7720 後座安全帶扣具略緊，已回報維修…</div></div>
      </DrvCard>
    </SOFrame>
  );
}

Object.assign(window, {
  soPal, SO_EVIDENCE, EvidenceTag, SOModeBar, SOSyncStrip, SOFrame, SORow, SOCheck,
  SO_Provisioning, SO_ShiftStart, SO_VehicleAssign, SO_Pretrip, SO_ActiveTrip,
  SO_TakeoverReport, SO_IncidentUpload, SO_TripCloseout, SO_ShiftHandover,
});
