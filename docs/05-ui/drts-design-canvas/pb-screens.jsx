// pb-screens.jsx — Partner Booking Web (白牌 / 合作入口), Phase 1 P0 per spec Part C.
// 3 program-specific flows: credit-card airport / insurance replacement / travel agency.
// Shared: landing, eligibility, review, success, tracking, error/manual-review.
// Self-contained styling; per-program accent. Rendered inside IOSDevice frames.

const PB_FONT = '"Inter", "Noto Sans TC", -apple-system, system-ui, sans-serif';
const PB_MONO = '"JetBrains Mono", ui-monospace, Menlo, monospace';

// Per-program theme
const PROGRAMS = {
  card:      { key: 'card', host: 'ride.ctbc.com.tw', brand: '中信銀行', program: 'World Elite 信用卡機場接送', primary: '#1B4FA0', primaryDark: '#0A2A6E', accent: '#C9A356', accentBg: '#FAF3DF', svc: '機場接送', tagEn: 'credit_card_airport_transfer' },
  insurance: { key: 'insurance', host: 'claim.fubon-ins.com.tw', brand: '富邦產險', program: '保險理賠代步', primary: '#0E6E50', primaryDark: '#063D2C', accent: '#2FA37A', accentBg: '#E6F5EE', svc: '保險代步', tagEn: 'insurance_replacement' },
  travel:    { key: 'travel', host: 'booking.lion-travel.com.tw', brand: '雄獅旅遊', program: '團體接送', primary: '#B0420E', primaryDark: '#6E2806', accent: '#E07B3A', accentBg: '#FCEEE2', svc: '旅行社接送', tagEn: 'travel_agency_transfer' },
};

// ── Mini components ─────────────────────────────────────────────────────────
function PBScreen({ p, children, scroll = true }) {
  return <div style={{ width: '100%', height: '100%', background: '#F4F6FB', overflow: scroll ? 'auto' : 'hidden', fontFamily: PB_FONT, display: 'flex', flexDirection: 'column' }}>{children}</div>;
}
function PBHeader({ p, title, sub, trailing, back }) {
  return (
    <div style={{ background: `linear-gradient(135deg, ${p.primaryDark} 0%, ${p.primary} 75%)`, color: '#fff', padding: '18px 20px 20px', position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
      <div style={{ position: 'absolute', right: -36, top: -24, width: 180, height: 180, background: `radial-gradient(circle, ${p.accent}33 0%, transparent 60%)` }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10.5, letterSpacing: '.14em', opacity: .85, fontWeight: 600 }}>
        <span style={{ width: 20, height: 20, borderRadius: 4, background: p.accent, color: p.primaryDark, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 11 }}>{p.brand.slice(0, 1)}</span>
        {p.brand} × 智慧運輸科技
      </div>
      <div style={{ marginTop: 12, fontSize: 21, fontWeight: 700, letterSpacing: '-.01em' }}>{title}</div>
      {sub && <div style={{ fontSize: 12.5, opacity: .8, marginTop: 4 }}>{sub}</div>}
      {trailing && <div style={{ position: 'absolute', right: 20, top: 20 }}>{trailing}</div>}
    </div>
  );
}
function PBChip({ p, children, tone }) {
  const map = {
    accent: { fg: p.accent, bg: p.accentBg },
    ok: { fg: '#15803D', bg: '#F0FDF4' },
    warn: { fg: '#B45309', bg: '#FFFBEB' },
    err: { fg: '#B42318', bg: '#FEE4E2' },
    neutral: { fg: '#56657F', bg: '#F1F3F8' },
  };
  const c = map[tone] || map.neutral;
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', fontSize: 11, fontWeight: 600, color: c.fg, background: c.bg, borderRadius: 999, fontFamily: PB_MONO }}>{children}</span>;
}
function PBCard({ children, title, p, accentBar }) {
  return (
    <section style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden', borderTop: accentBar ? `3px solid ${p.primary}` : '1px solid #E5E7EB' }}>
      {title && <header style={{ padding: '11px 16px 9px', borderBottom: '1px solid #F1F3F8', fontSize: 13, fontWeight: 600, color: '#0E1424' }}>{title}</header>}
      <div style={{ padding: 16 }}>{children}</div>
    </section>
  );
}
function PBRow({ k, v, mono }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: '1px dashed #F1F3F8', fontSize: 13 }}><span style={{ color: '#56657F' }}>{k}</span><span style={{ color: '#0E1424', fontFamily: mono ? PB_MONO : PB_FONT, fontWeight: mono ? 500 : 400, textAlign: 'right' }}>{v}</span></div>;
}
function PBField({ label, value, ph, req }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#2B3950', marginBottom: 5 }}>{label}{req && <span style={{ color: '#B42318' }}> *</span>}</label>
      <div style={{ padding: '10px 12px', border: '1px solid #D2D8E2', borderRadius: 9, background: '#fff', fontSize: 13.5, color: value ? '#0E1424' : '#9CA3AF', fontFamily: /^[\w\d +.:-]+$/.test(value || '') && value ? PB_MONO : PB_FONT }}>{value || ph}</div>
    </div>
  );
}
function PBBtn({ p, children, primary, ghost, onClick, disabled }) {
  const s = primary ? { bg: p.primary, fg: '#fff', bd: p.primary } : ghost ? { bg: 'transparent', fg: p.primary, bd: 'transparent' } : { bg: '#fff', fg: '#0E1424', bd: '#D2D8E2' };
  return <button onClick={onClick} disabled={disabled} style={{ width: '100%', padding: '13px 16px', borderRadius: 11, border: `1px solid ${s.bd}`, background: disabled ? '#E5E7EB' : s.bg, color: disabled ? '#9CA3AF' : s.fg, fontWeight: 700, fontSize: 14.5, cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: PB_FONT }}>{children}</button>;
}
function PBFooter({ children }) {
  return <div style={{ marginTop: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8, background: '#F4F6FB', borderTop: '1px solid #E8ECF3' }}>{children}</div>;
}
function PBBody({ children }) {
  return <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>{children}</div>;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. Partner Entry Landing (per program)
// ═══════════════════════════════════════════════════════════════════════════
function PB_Landing({ program = 'card' }) {
  const p = PROGRAMS[program];
  const intro = {
    card:      { headline: '禮賓接送 Concierge', sub: 'World Elite 卡友專屬 · 全年 12 趟', perk: '本年度剩餘 9 / 12 趟', note: '費用由本卡帳單合併扣款，無須現場付款。' },
    insurance: { headline: '理賠代步用車', sub: '車禍理賠期間代步服務', perk: '代步額度剩餘 14 / 30 天', note: '代步費用由保險理賠給付，依保單權益核定。' },
    travel:    { headline: '團體接送預約', sub: '旅行團機場 / 飯店接送', perk: '本團接送額度 4 段', note: '接送費用已含於團費，依行程安排派車。' },
  }[program];
  return (
    <PBScreen p={p}>
      <PBHeader p={p} title={intro.headline} sub={intro.sub} trailing={<PBChip p={p} tone="accent">{p.svc}</PBChip>} />
      <PBBody>
        <PBCard p={p}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <div style={{ width: 44, height: 30, borderRadius: 4, background: `linear-gradient(135deg,${p.primaryDark},${p.primary})`, position: 'relative', flexShrink: 0 }}><div style={{ position: 'absolute', right: 4, bottom: 4, width: 8, height: 8, background: p.accent, borderRadius: 1 }} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{program === 'card' ? '•••• •••• •••• 8842' : program === 'insurance' ? '理賠號 CLM-2026-88142' : '團號 LION-TPE-0628'}</div>
              <div style={{ fontSize: 11.5, color: '#56657F' }}>{program === 'card' ? '陳〇明 · World Elite' : program === 'insurance' ? '王〇華 · 富邦產險' : '林〇雄 · 12 人團'}</div>
            </div>
            <PBChip p={p} tone="ok">eligible</PBChip>
          </div>
          <div style={{ background: '#F1F3F8', borderRadius: 8, padding: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><span style={{ fontSize: 11.5, color: '#56657F' }}>{intro.perk.split(' ')[0]}</span><span style={{ fontSize: 13, fontFamily: PB_MONO }}><b style={{ fontSize: 17 }}>{intro.perk.match(/\d+/)[0]}</b> {intro.perk.replace(/^[^\d]*\d+/, '')}</span></div>
            <div style={{ height: 4, marginTop: 6, background: '#DDE3EC', borderRadius: 2, overflow: 'hidden' }}><div style={{ width: program === 'card' ? '75%' : program === 'insurance' ? '47%' : '50%', height: '100%', background: p.accent }} /></div>
          </div>
        </PBCard>
        <PBCard p={p} title="可使用的服務">
          {[
            program === 'card' ? { t: '機場接送', s: '桃園 / 松山 · 商務車' } : program === 'insurance' ? { t: '理賠代步', s: '一般 / 商務車型' } : { t: '機場接送', s: '團體大型車' },
            program === 'card' ? { t: '優先派車', s: '都會區 · 8 分鐘到車' } : program === 'insurance' ? { t: '醫院往返', s: '回診接送' } : { t: '飯店接送', s: '行程內多點' },
          ].map((x, i, a) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: i < a.length - 1 ? '1px dashed #F1F3F8' : 'none' }}>
              <div style={{ width: 34, height: 34, borderRadius: 8, background: p.primary + '12', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: 13, height: 13, borderRadius: 3, background: p.primary }} /></div>
              <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600 }}>{x.t}</div><div style={{ fontSize: 11, color: '#56657F' }}>{x.s}</div></div>
            </div>
          ))}
        </PBCard>
        <PBCard p={p} accentBar>
          <div style={{ fontSize: 12, color: '#56657F', lineHeight: 1.6 }}>{intro.note}</div>
        </PBCard>
      </PBBody>
      <PBFooter><PBBtn p={p} primary>立即叫車</PBBtn><PBBtn p={p} ghost>查看歷史紀錄</PBBtn></PBFooter>
    </PBScreen>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Eligibility Verification (shared shape, per-program fields)
// ═══════════════════════════════════════════════════════════════════════════
function PB_Eligibility({ program = 'card' }) {
  const p = PROGRAMS[program];
  const rows = {
    card:      [['持卡身份', 'World Elite'], ['卡號末四碼', '8842'], ['本年度免費趟次', '12 趟'], ['服務範圍', '台北 · 桃園 · 新竹']],
    insurance: [['保單號', 'POL-558-22019'], ['理賠號', 'CLM-2026-88142'], ['代步期間', '30 天 (剩 14)'], ['車型權益', '一般 / 商務']],
    travel:    [['旅行社', '雄獅旅遊'], ['團號', 'LION-TPE-0628'], ['旅客人數', '12 人'], ['接送段數', '4 段']],
  }[program];
  const consent = {
    card:      ['使用本卡身份識別建立帳號', '與智慧運輸科技共享行程必要資訊', '同意《信用卡機場接送服務條款》'],
    insurance: ['使用理賠案件資訊核定代步權益', '共享接送行程供保險公司核銷', '同意《保險代步服務條款》'],
    travel:    ['使用團號驗證接送權益', '共享接送行程供旅行社管理', '同意《團體接送服務條款》'],
  }[program];
  return (
    <PBScreen p={p}>
      <PBHeader p={p} title="資格驗證" sub="第一次使用 · 一次性確認" back />
      <PBBody>
        <PBCard p={p} title="您的權益">{rows.map((r, i) => <PBRow key={i} k={r[0]} v={r[1]} mono={i < 2} />)}</PBCard>
        <PBCard p={p} title="授權同意">
          {consent.map((c, i, a) => (
            <div key={i} style={{ display: 'flex', gap: 12, padding: '9px 0', borderBottom: i < a.length - 1 ? '1px dashed #F1F3F8' : 'none' }}>
              <div style={{ width: 18, height: 18, borderRadius: 4, background: p.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><path d="M5 12l5 5L20 7" /></svg></div>
              <div style={{ fontSize: 12.5, color: '#0E1424', lineHeight: 1.45 }}>{c}</div>
            </div>
          ))}
        </PBCard>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 9 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#15803D" strokeWidth="2.4"><path d="M5 13l4 4L19 7"/></svg>
          <span style={{ fontSize: 12.5, color: '#15803D', fontWeight: 600 }}>資格驗證通過 · eligibility_verified</span>
        </div>
      </PBBody>
      <PBFooter><PBBtn p={p} primary>確認並繼續</PBBtn></PBFooter>
    </PBScreen>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Program-specific Booking Form ×3
// ═══════════════════════════════════════════════════════════════════════════
function PB_BookCard() {
  const p = PROGRAMS.card;
  return (
    <PBScreen p={p}>
      <PBHeader p={p} title="建立行程" sub="信用卡機場接送 · 桃園 T2" back />
      <PBBody>
        <PBCard p={p} title="機場接送資訊">
          <PBField label="航廈方向 · airport direction" value="出發 → 桃園機場" req />
          <PBField label="航班編號 · flight number" value="BR198" req />
          <PBField label="航廈 · terminal" value="第二航廈 T2" req />
          <PBField label="行李件數 · luggage" value="2 件" />
          <PBField label="舉牌 · pickup sign" value="需要 · 王先生" />
        </PBCard>
        <PBCard p={p} title="行程地點">
          <PBField label="上車 · pickup" value="台北市信義區松仁路 100 號" req />
          <PBField label="出發時間" value="2026-06-08 05:30" req />
          <PBField label="乘客聯絡 · passenger contact" value="0912-555-401" req />
        </PBCard>
        <PBCard p={p} accentBar>
          <PBRow k="基本費用" v="NT$ 1,580" mono />
          <PBRow k="World Elite 禮遇" v="− NT$ 1,580" mono />
          <PBRow k="您將支付" v="免費" />
          <div style={{ marginTop: 8 }}><PBChip p={p} tone="accent">使用第 4 趟 · 剩 8 趟</PBChip></div>
        </PBCard>
      </PBBody>
      <PBFooter><PBBtn p={p} primary>前往確認</PBBtn></PBFooter>
    </PBScreen>
  );
}

function PB_BookInsurance() {
  const p = PROGRAMS.insurance;
  return (
    <PBScreen p={p}>
      <PBHeader p={p} title="建立代步行程" sub="保險理賠代步 · 回診接送" back />
      <PBBody>
        <PBCard p={p} title="理賠資訊">
          <PBField label="保單號 · policy number" value="POL-558-22019" req />
          <PBField label="理賠號 · claim number" value="CLM-2026-88142" req />
          <PBField label="理賠申請人 · claimant" value="王〇華" req />
          <PBField label="代步期間 · replacement period" value="2026-06-01 ~ 06-30 (剩 14 天)" />
          <PBField label="承辦人 · case handler" value="富邦產險 · 李專員" />
        </PBCard>
        <PBCard p={p} title="行程地點">
          <PBField label="上車 · pickup" value="新北市板橋區文化路一段 88 號" req />
          <PBField label="目的地 · dropoff" value="台北榮民總醫院" req />
          <PBField label="車型權益 · vehicle class" value="一般車型 (權益內)" />
          <PBField label="出發時間" value="2026-06-06 08:30" req />
        </PBCard>
        <PBCard p={p} accentBar>
          <PBRow k="代步權益狀態 · entitlement" v="核定通過" />
          <PBRow k="本趟費用" v="NT$ 480 · 理賠給付" mono />
          <PBRow k="您將支付" v="免費" />
        </PBCard>
      </PBBody>
      <PBFooter><PBBtn p={p} primary>前往確認</PBBtn></PBFooter>
    </PBScreen>
  );
}

function PB_BookTravel() {
  const p = PROGRAMS.travel;
  return (
    <PBScreen p={p}>
      <PBHeader p={p} title="建立團體接送" sub="旅行社接送 · 機場 → 飯店" back />
      <PBBody>
        <PBCard p={p} title="團體資訊">
          <PBField label="團號 · group number" value="LION-TPE-0628" req />
          <PBField label="旅客人數 · traveler count" value="12 人" req />
          <PBField label="行李件數 · luggage" value="18 件" req />
          <PBField label="領隊 / 導遊 · guide contact" value="林〇雄 · 0922-118-456" req />
          <PBField label="航班編號 · flight number" value="JX802" />
        </PBCard>
        <PBCard p={p} title="接送行程">
          <PBField label="上車 · pickup" value="桃園機場 第一航廈 入境大廳" req />
          <PBField label="多點停靠 · multi-stop" value="台北車站 → 西門商旅" />
          <PBField label="舉牌需求 · signage" value="需要 · 雄獅旅遊 LION-TPE-0628" />
          <PBField label="出發時間" value="2026-06-28 14:20" req />
        </PBCard>
        <PBCard p={p} accentBar>
          <PBRow k="車輛配置" v="中型巴士 ×1" />
          <PBRow k="接送段數" v="第 1 / 4 段" mono />
          <PBRow k="費用" v="已含團費" />
        </PBCard>
      </PBBody>
      <PBFooter><PBBtn p={p} primary>前往確認</PBBtn></PBFooter>
    </PBScreen>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Review & Confirm
// ═══════════════════════════════════════════════════════════════════════════
function PB_Review({ program = 'card' }) {
  const p = PROGRAMS[program];
  const rows = {
    card:      [['服務', '機場接送 · 出發'], ['航班', 'BR198 · T2'], ['上車', '台北信義 松仁路 100 號'], ['時間', '2026-06-08 05:30'], ['乘客', '王先生 · 0912-555-401'], ['費用', '免費 · World Elite 禮遇']],
    insurance: [['服務', '保險代步 · 回診'], ['理賠號', 'CLM-2026-88142'], ['上車', '板橋 文化路一段 88 號'], ['目的地', '台北榮總'], ['時間', '2026-06-06 08:30'], ['費用', '免費 · 理賠給付']],
    travel:    [['服務', '團體接送'], ['團號', 'LION-TPE-0628'], ['上車', '桃機 T1 入境大廳'], ['人數 / 行李', '12 人 / 18 件'], ['時間', '2026-06-28 14:20'], ['費用', '已含團費']],
  }[program];
  return (
    <PBScreen p={p}>
      <PBHeader p={p} title="確認預約" sub="送出前請確認資訊" back />
      <PBBody>
        <PBCard p={p} title="行程摘要">{rows.map((r, i) => <PBRow key={i} k={r[0]} v={r[1]} mono={i === 1 || i === 4} />)}</PBCard>
        <PBCard p={p} accentBar title="權益與費用">
          <PBRow k="權益來源" v={p.brand} />
          <PBRow k="入帳方式" v={program === 'card' ? '合併卡片帳單' : program === 'insurance' ? '保險理賠核銷' : '團費內含'} />
          <PBRow k="您將支付" v="免費" />
        </PBCard>
        <div style={{ fontSize: 11.5, color: '#56657F', lineHeight: 1.55, padding: '0 4px' }}>送出後將依 {p.brand} 合作方案派車，行程資訊會同步給合作方核銷。</div>
      </PBBody>
      <PBFooter><PBBtn p={p} primary>確認送出預約</PBBtn><PBBtn p={p} ghost>返回修改</PBBtn></PBFooter>
    </PBScreen>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. Booking Success  6. Tracking  7. Error / Manual Review
// ═══════════════════════════════════════════════════════════════════════════
function PB_Success({ program = 'card' }) {
  const p = PROGRAMS[program];
  return (
    <PBScreen p={p}>
      <PBHeader p={p} title="預約成功" sub="已收到您的預約" />
      <PBBody>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '24px 0 8px' }}>
          <div style={{ width: 64, height: 64, borderRadius: 32, background: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#15803D" strokeWidth="2.4"><path d="M5 13l4 4L19 7"/></svg></div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>預約已建立</div>
          <PBChip p={p} tone="neutral">{program === 'card' ? 'bk_5512' : program === 'insurance' ? 'bk_ins_2210' : 'bk_grp_0628'}</PBChip>
        </div>
        <PBCard p={p}><PBRow k="狀態" v="配對司機中" /><PBRow k="預計回覆" v="2 分鐘內" /><PBRow k="通知方式" v="簡訊 + App 推播" /></PBCard>
      </PBBody>
      <PBFooter><PBBtn p={p} primary>追蹤行程</PBBtn><PBBtn p={p} ghost>返回首頁</PBBtn></PBFooter>
    </PBScreen>
  );
}

function PB_Tracking({ program = 'card' }) {
  const p = PROGRAMS[program];
  return (
    <PBScreen p={p}>
      <PBHeader p={p} title="行程追蹤" sub="駕駛 8 分鐘後抵達" />
      <PBBody>
        <PBCard p={p}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 52, height: 52, borderRadius: 26, background: `linear-gradient(135deg,${p.primary},${p.primaryDark})`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700 }}>陳</div>
            <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 700 }}>陳俊宏</div><div style={{ fontSize: 11.5, color: '#56657F' }}>1,243 趟 · 4.86 ★</div><div style={{ fontSize: 11.5, color: p.primary, fontFamily: PB_MONO, marginTop: 2 }}>{p.svc === '旅行社接送' ? '中型巴士 · ARJ-9920' : 'Toyota Prius α · ARJ-3120'}</div></div>
            <button style={{ width: 44, height: 44, borderRadius: 22, background: p.primary, border: 'none', color: '#fff', cursor: 'pointer' }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ display: 'block', margin: 'auto' }}><path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2"/></svg></button>
          </div>
        </PBCard>
        <PBCard p={p}>
          <div style={{ height: 150, background: 'linear-gradient(180deg, #DDE5F0, #C7D7F0)', borderRadius: 8, position: 'relative', overflow: 'hidden', marginBottom: 12 }}>
            <svg width="100%" height="100%" viewBox="0 0 320 150" style={{ position: 'absolute', inset: 0 }}><path d="M30,120 L90,90 L160,80 L240,55 L290,30" stroke={p.primary} strokeWidth="3" fill="none" /><circle cx="30" cy="120" r="6" fill={p.primary} /><circle cx="290" cy="30" r="6" fill={p.accent} stroke="#fff" strokeWidth="2" /><circle cx="160" cy="80" r="9" fill={p.primary} /><circle cx="160" cy="80" r="14" fill={p.primary} fillOpacity="0.2" /></svg>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
            <div><div style={{ fontSize: 11, color: '#56657F' }}>預計抵達</div><div style={{ fontSize: 22, fontWeight: 700, fontFamily: PB_MONO }}>8 <span style={{ fontSize: 12, color: '#56657F' }}>min</span></div></div>
            <div style={{ flex: 1 }}><div style={{ fontSize: 11, color: '#56657F' }}>距離</div><div style={{ fontSize: 14, fontWeight: 600, fontFamily: PB_MONO }}>2.4 km</div></div>
            <PBChip p={p} tone="ok">已派車</PBChip>
          </div>
        </PBCard>
      </PBBody>
      <PBFooter><PBBtn p={p} ghost>客服協助</PBBtn></PBFooter>
    </PBScreen>
  );
}

function PB_Error({ program = 'insurance' }) {
  const p = PROGRAMS[program];
  return (
    <PBScreen p={p}>
      <PBHeader p={p} title="需人工審核" sub="您的預約需進一步確認" back />
      <PBBody>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '20px 0 4px' }}>
          <div style={{ width: 60, height: 60, borderRadius: 30, background: '#FFFBEB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#B45309" strokeWidth="2"><path d="M12 3l10 18H2zM12 10v5M12 17v.01"/></svg></div>
          <div style={{ fontSize: 17, fontWeight: 700, textAlign: 'center' }}>資格需人工確認</div>
          <PBChip p={p} tone="warn">manual_review · pending</PBChip>
        </div>
        <PBCard p={p} title="原因">
          <div style={{ fontSize: 13, color: '#0E1424', lineHeight: 1.6 }}>
            {program === 'insurance' ? '理賠案件 CLM-2026-88142 的代步期間已接近上限，需承辦人確認剩餘權益後才能派車。' : '此預約的資格驗證未自動通過，已轉由合作方人工審核。'}
          </div>
        </PBCard>
        <PBCard p={p} title="接下來會發生什麼">
          <PBRow k="案件編號" v="mr_2026_0418" mono />
          <PBRow k="處理單位" v={p.brand + ' 承辦'} />
          <PBRow k="預計回覆" v="1 個工作日內" />
          <PBRow k="通知方式" v="簡訊 + Email" />
        </PBCard>
        <div style={{ fontSize: 11.5, color: '#56657F', lineHeight: 1.55, padding: '0 4px' }}>審核期間您無須重複送出。若超過時間未收到通知，可聯絡客服協助。</div>
      </PBBody>
      <PBFooter><PBBtn p={p} primary>聯絡客服</PBBtn><PBBtn p={p} ghost>返回首頁</PBBtn></PBFooter>
    </PBScreen>
  );
}

Object.assign(window, {
  PROGRAMS, PB_Landing, PB_Eligibility, PB_BookCard, PB_BookInsurance, PB_BookTravel,
  PB_Review, PB_Success, PB_Tracking, PB_Error,
  PBScreen, PBHeader, PBChip, PBCard, PBRow, PBField, PBBtn, PBFooter, PBBody, PB_FONT, PB_MONO,
});
