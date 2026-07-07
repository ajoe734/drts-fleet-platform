// pb-receipts.jsx — Insurance & Travel 行程明細 / 收據 (§5.2, §5.4) + shared field primitives.
// Addresses VQ-1 (locked claim-derived fields), VQ-3 (masked refs), VQ-4 (entitlement meters), VQ-5 (money-direction badge).
// Reuses PB primitives from pb-screens.jsx (PROGRAMS, PBScreen, PBHeader, PBBody, PBCard, PBRow, PBChip, PBBtn, PBFooter, PB_FONT, PB_MONO).

// VQ-3 · mask a partner reference: CLM-2026-88142 → CLM-••••-8142 ; LION-TPE-0628 → LION-••••-0628
function pbMask(ref) {
  if (!ref) return ref;
  const parts = String(ref).split('-');
  if (parts.length < 2) return ref;
  const head = parts[0];
  const tail = parts[parts.length - 1].slice(-4);
  return head + '-••••-' + tail;
}

// VQ-1 · locked (claim/booking-derived, non-editable) field
function PBFieldLocked({ label, value, sub }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#2B3950', marginBottom: 5 }}>
        {label}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 9.5, fontWeight: 600, color: '#7A8699', background: '#EEF1F6', border: '1px solid #E0E5EC', padding: '1px 6px', borderRadius: 999 }}>
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></svg>
          鎖定
        </span>
      </label>
      <div style={{ padding: '10px 12px', border: '1px solid #E0E5EC', borderRadius: 9, background: '#F7F9FC', fontSize: 13.5, color: '#46556E', fontFamily: /^[\w\d +.:~-]+$/.test(value || '') && value ? PB_MONO : PB_FONT }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#7A8699', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// VQ-4 · entitlement meter — insurance 天/趟, travel 段/席次 (distinct from card 趟次 ring)
function PBMeter({ p, label, en, used, total, unit, secondary }) {
  const pct = Math.max(0, Math.min(100, Math.round((used / total) * 100)));
  return (
    <div style={{ background: p.accentBg, border: '1px solid ' + p.accent + '44', borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: '#46556E', fontWeight: 600 }}>{label}<span style={{ fontFamily: PB_MONO, fontSize: 9.5, color: '#7A8699', marginLeft: 5 }}>{en}</span></span>
        <span style={{ fontFamily: PB_MONO, fontSize: 13 }}><b style={{ fontSize: 19, color: p.primary }}>{total - used}</b> <span style={{ color: '#56657F' }}>/ {total} {unit}</span></span>
      </div>
      <div style={{ height: 6, background: '#fff', borderRadius: 3, overflow: 'hidden', border: '1px solid ' + p.accent + '33' }}>
        <div style={{ width: pct + '%', height: '100%', background: p.accent }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: '#7A8699' }}>
        <span>已用 {used} {unit}</span>
        {secondary && <span>{secondary}</span>}
      </div>
    </div>
  );
}

// VQ-5 · money-direction badge: insurer-settled / tour-included (vs card 卡帳單合併)
function PBMoneyBadge({ kind }) {
  const cfg = {
    insurer: { fg: '#0E6E50', bg: '#E6F5EE', bd: '#9FDcc1', label: '保險核銷', en: 'insurer-settled', icon: 'M12 3l8 4v5c0 4-3 7-8 9-5-2-8-5-8-9V7z M9 12l2 2 4-4' },
    tour:    { fg: '#B0420E', bg: '#FCEEE2', bd: '#F0C39E', label: '已含團費', en: 'tour-included', icon: 'M4 7h16v12H4z M4 7l2-3h12l2 3 M9 12h6' },
    card:    { fg: '#1B4FA0', bg: '#EAF1FB', bd: '#B9D0EE', label: '卡帳單合併', en: 'card-statement', icon: 'M3 7h18v10H3z M3 11h18' },
  }[kind] || {};
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, color: cfg.fg, background: cfg.bg, border: '1px solid ' + cfg.bd }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d={cfg.icon} /></svg>
      {cfg.label}<span style={{ fontFamily: PB_MONO, fontSize: 9, opacity: .7, fontWeight: 600 }}>{cfg.en}</span>
    </span>
  );
}

function PBReceiptHero({ p, title, idLabel, idValue }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '18px 0 6px' }}>
      <div style={{ width: 56, height: 56, borderRadius: 28, background: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#15803D" strokeWidth="2.4"><path d="M5 13l4 4L19 7" /></svg>
      </div>
      <div style={{ fontSize: 17, fontWeight: 700 }}>{title}</div>
      <PBChip p={p} tone="neutral">{idLabel} {idValue}</PBChip>
    </div>
  );
}

// ── §5.2 · Insurance receipt / 行程明細 ──────────────────────────────────────
function PB_InsReceipt() {
  const p = PROGRAMS.insurance;
  return (
    <PBScreen p={p}>
      <PBHeader p={p} title="行程明細 / 收據" sub="保險理賠代步 · 已完成" back
        trailing={<PBChip p={p} tone="accent">理賠代步</PBChip>} />
      <PBBody>
        <PBReceiptHero p={p} title="行程已完成" idLabel="收據" idValue="rcpt_ins_2210" />

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 2 }}>
          <PBMoneyBadge kind="insurer" />
        </div>

        <PBCard p={p} title="理賠資訊">
          <PBRow k="理賠案號 · claim" v={pbMask('CLM-2026-88142')} mono />
          <PBRow k="保單號 · policy" v={pbMask('POL-558-22019')} mono />
          <PBRow k="代步期間 · period" v="2026-06-01 ~ 06-30" mono />
          <PBRow k="理賠申請人 · claimant" v="王〇華" />
        </PBCard>

        <PBCard p={p} title="行程明細">
          <PBRow k="日期" v="2026-06-06 08:30" mono />
          <PBRow k="上車" v="板橋 文化路一段 88 號" />
          <PBRow k="目的地" v="台北榮民總醫院" />
          <PBRow k="車型 · vehicle" v="一般車型 (權益內)" />
        </PBCard>

        <PBCard p={p} accentBar title="費用與核銷">
          <PBRow k="車資 · fare" v="NT$ 480" mono />
          <PBRow k="理賠給付 · insurer-settled" v="− NT$ 480" mono />
          <PBRow k="自付差額 · out-of-pocket" v="NT$ 0" mono />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, marginTop: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#0E1424' }}>您支付</span>
            <span style={{ fontSize: 17, fontWeight: 800, color: p.primary }}>免費</span>
          </div>
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed #E5E7EB' }}>
            <PBRow k="核銷序號 · settlement no." v={pbMask('FBN-2026-447120')} mono />
          </div>
        </PBCard>

        <div style={{ fontSize: 11, color: '#7A8699', lineHeight: 1.55, padding: '0 4px' }}>本收據由富邦產險依保單權益核銷，金流方向為保險公司給付，無信用卡帳單期數與機場附加費。</div>
      </PBBody>
      <PBFooter><PBBtn p={p} primary>下載收據 PDF</PBBtn><PBBtn p={p} ghost>回行程紀錄</PBBtn></PBFooter>
    </PBScreen>
  );
}

// ── §5.4 · Travel receipt / 行程明細 ─────────────────────────────────────────
function PB_TrvReceipt() {
  const p = PROGRAMS.travel;
  return (
    <PBScreen p={p}>
      <PBHeader p={p} title="行程明細 / 收據" sub="旅行社團體接送 · 第 1 段已完成" back
        trailing={<PBChip p={p} tone="accent">團體席次</PBChip>} />
      <PBBody>
        <PBReceiptHero p={p} title="本段接送已完成" idLabel="收據" idValue="rcpt_grp_0628" />

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 2 }}>
          <PBMoneyBadge kind="tour" />
        </div>

        <PBCard p={p} title="團體資訊">
          <PBRow k="團號 · group" v={pbMask('LION-TPE-0628')} mono />
          <PBRow k="段次 · leg" v="第 1 / 4 段 · 入境接機" mono />
          <PBRow k="人數 / 行李" v="12 人 / 18 件" />
          <PBRow k="領隊 · guide" v="林〇雄" />
        </PBCard>

        <PBCard p={p} title="行程明細">
          <PBRow k="日期" v="2026-06-28 14:20" mono />
          <PBRow k="上車" v="桃機 T1 入境大廳" />
          <PBRow k="多點停靠" v="台北車站 → 西門商旅" />
          <PBRow k="車輛配置 · fleet" v="中型巴士 ×1" />
        </PBCard>

        <PBCard p={p} accentBar title="費用">
          <PBRow k="本段費用" v="已含團費" />
          <PBRow k="每人均攤 · per-traveler" v="—（團費內含）" />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, marginTop: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#0E1424' }}>現場支付</span>
            <span style={{ fontSize: 17, fontWeight: 800, color: p.primary }}>免費</span>
          </div>
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed #E5E7EB', display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={p.primary} strokeWidth="2"><path d="M10 14L21 3M21 3h-6M21 3v6" /><path d="M21 14v5a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h5" /></svg>
            <span style={{ fontSize: 12, color: p.primary, fontWeight: 600 }}>行程連結 · LION 關西 5 日</span>
          </div>
        </PBCard>

        <div style={{ fontSize: 11, color: '#7A8699', lineHeight: 1.55, padding: '0 4px' }}>本收據之接送費用已含於團費，依旅行社行程派車，無單趟車資與信用卡帳單。</div>
      </PBBody>
      <PBFooter><PBBtn p={p} primary>下載收據 PDF</PBBtn><PBBtn p={p} ghost>查看全團段次</PBBtn></PBFooter>
    </PBScreen>
  );
}

Object.assign(window, {
  pbMask, PBFieldLocked, PBMeter, PBMoneyBadge, PBReceiptHero,
  PB_InsReceipt, PB_TrvReceipt,
});
