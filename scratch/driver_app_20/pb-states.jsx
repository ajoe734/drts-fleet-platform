// pb-states.jsx — Request A: program-specific eligibility STATES for insurance / travel.
// Reuses PB primitives from pb-screens.jsx. Same fixed funnel; only entitlement framing + states differ.
// Insurance entitlement noun = 理賠額度 (reference/claim-driven). Travel = 團體席次 (roster-driven).

// ── shared state-screen scaffold (blocked / info) ───────────────────────────
function PBStateScreen({ p, title, sub, icon, iconTone, badge, badgeTone, children, footer }) {
  const tones = {
    ok:   { fg: '#15803D', bg: '#F0FDF4' },
    warn: { fg: '#B45309', bg: '#FFFBEB' },
    err:  { fg: '#B42318', bg: '#FEE4E2' },
    info: { fg: p.primary, bg: p.primary + '12' },
  };
  const t = tones[iconTone] || tones.info;
  return (
    <PBScreen p={p}>
      <PBHeader p={p} title={title} sub={sub} back />
      <PBBody>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 11, padding: '14px 0 4px' }}>
          <div style={{ width: 60, height: 60, borderRadius: 30, background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</div>
          {badge && <PBChip p={p} tone={badgeTone}>{badge}</PBChip>}
        </div>
        {children}
      </PBBody>
      {footer}
    </PBScreen>
  );
}
function PBSvgWarn(c) { return <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2"><path d="M12 3l10 18H2zM12 10v5M12 17v.01"/></svg>; }
function PBSvgClock(c) { return <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>; }
function PBSvgSearch(c) { return <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>; }
function PBSvgBan(c) { return <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M6 6l12 12"/></svg>; }
function PBSvgCar(c) { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2"><path d="M3 13l2-5h14l2 5M5 13h14v4H5zM7 17v2M17 17v2"/></svg>; }

// ═══════════════════════════════════════════════════════════════════════════
// A1 · INSURANCE — eligibility verification (positive: policy + replacement-vehicle + roster)
//      entitlement = 理賠額度 / coverage window (not 趟次)
// ═══════════════════════════════════════════════════════════════════════════
function PB_InsEligibility() {
  const p = PROGRAMS.insurance;
  const checks = [
    { state: 'insurance_policy', t: '保單有效', en: 'insurance_policy', detail: 'POL-558-22019 · 富邦產險', ok: true,
      foot: '保單於保障期間內 · 含代步附約' },
    { state: 'insurance_replacement_vehicle', t: '代步車輛權益', en: 'insurance_replacement_vehicle', detail: '一般 / 商務車型 · 每日上限 NT$ 1,600', ok: true,
      foot: '代步期間 2026-06-01 ~ 06-30（剩 14 天）' },
    { state: 'insurance_roster', t: '乘客名單', en: 'insurance_roster', detail: '理賠申請人 王〇華 +1 名陪同', ok: true,
      foot: '名單須與理賠案件一致' },
  ];
  return (
    <PBScreen p={p}>
      <PBHeader p={p} title="資格驗證" sub="保險理賠代步 · 依理賠案件核定" back
        trailing={<PBChip p={p} tone="accent">理賠額度</PBChip>} />
      <PBBody>
        {/* 理賠額度 framing — replaces 趟次配額 */}
        <PBCard p={p} accentBar>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: '#56657F' }}>本案理賠額度 · claim allowance</span>
            <span style={{ fontFamily: PB_MONO, fontSize: 13 }}><b style={{ fontSize: 19, color: p.primary }}>NT$ 12,800</b> <span style={{ color: '#56657F' }}>/ 22,400</span></span>
          </div>
          <div style={{ height: 5, background: '#DDE3EC', borderRadius: 3, overflow: 'hidden' }}><div style={{ width: '57%', height: '100%', background: p.accent }} /></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 7, fontSize: 11, color: '#56657F' }}>
            <span>已用 NT$ 9,600 · 8 趟代步</span>
            <span>代步期間剩 14 天</span>
          </div>
        </PBCard>

        <PBCard p={p} title="核定項目 · eligibility checks">
          {checks.map((c, i, a) => (
            <div key={i} style={{ display: 'flex', gap: 12, padding: '11px 0', borderBottom: i < a.length - 1 ? '1px dashed #F1F3F8' : 'none' }}>
              <div style={{ width: 22, height: 22, borderRadius: 11, background: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#15803D" strokeWidth="3"><path d="M5 12l5 5L20 7"/></svg>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600 }}>{c.t}</span>
                  <span style={{ fontFamily: PB_MONO, fontSize: 9.5, color: '#9CA3AF' }}>{c.en}</span>
                </div>
                <div style={{ fontSize: 12, color: '#0E1424', marginTop: 2 }}>{c.detail}</div>
                <div style={{ fontSize: 11, color: '#56657F', marginTop: 2 }}>{c.foot}</div>
              </div>
            </div>
          ))}
        </PBCard>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 9 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#15803D" strokeWidth="2.4"><path d="M5 13l4 4L19 7"/></svg>
          <span style={{ fontSize: 12.5, color: '#15803D', fontWeight: 600 }}>三項核定通過 · eligibility_verified</span>
        </div>
      </PBBody>
      <PBFooter><PBBtn p={p} primary>確認並建立代步行程</PBBtn></PBFooter>
    </PBScreen>
  );
}

// A1 · INSURANCE — blocked / negative states (one component, 4 variants)
function PB_InsBlocked({ state = 'insurance_pending' }) {
  const p = PROGRAMS.insurance;
  const cfg = {
    insurance_pending: {
      title: '理賠審核中', sub: '代步權益尚未核定', icon: PBSvgClock('#B45309'), iconTone: 'warn',
      badge: 'insurance_pending · 審核中', badgeTone: 'warn',
      reason: '理賠案件 CLM-2026-88142 仍在富邦產險審核流程中，代步權益需理賠核定後才能啟用。',
      rows: [['理賠號', 'CLM-2026-88142'], ['目前狀態', '理賠審核中'], ['預計核定', '1–2 個工作日'], ['通知方式', '簡訊 + Email']],
      cta: '查看理賠進度', ghost: '聯絡承辦人',
    },
    insurance_missing: {
      title: '查無理賠案件', sub: '保單或理賠編號有誤', icon: PBSvgSearch('#B42318'), iconTone: 'err',
      badge: 'insurance_missing · 查無資料', badgeTone: 'err',
      reason: '依您提供的保單號 / 理賠號查無對應案件。請確認號碼是否正確，或聯絡富邦產險確認案件已建立。',
      rows: [['輸入保單號', 'POL-558-2201X'], ['輸入理賠號', 'CLM-2026-8814X'], ['比對結果', '查無對應案件'], ['建議', '重新輸入或洽承辦']],
      cta: '重新輸入', ghost: '聯絡富邦產險',
    },
    insurance_expired: {
      title: '代步期間已結束', sub: '保障窗口已逾期', icon: PBSvgWarn('#B42318'), iconTone: 'err',
      badge: 'insurance_expired · 已逾期', badgeTone: 'err',
      reason: '本理賠案件的代步期間（2026-05-01 ~ 05-31）已結束，無法再建立代步行程。如有特殊情形請洽承辦人申請延長。',
      rows: [['理賠號', 'CLM-2026-77013'], ['代步期間', '2026-05-01 ~ 05-31'], ['到期日', '已逾期 10 天'], ['剩餘額度', '— 已關閉']],
      cta: '申請延長代步', ghost: '返回首頁',
    },
    insurance_cancelled: {
      title: '理賠案件已結案', sub: '案件取消 / 已結清', icon: PBSvgBan('#B42318'), iconTone: 'err',
      badge: 'insurance_cancelled · 已結案', badgeTone: 'err',
      reason: '理賠案件 CLM-2026-66200 已結案或取消，代步權益隨之關閉。若為誤判，請聯絡富邦產險重啟案件。',
      rows: [['理賠號', 'CLM-2026-66200'], ['案件狀態', '已結案 / 取消'], ['關閉日', '2026-06-02'], ['代步權益', '已停用']],
      cta: '聯絡富邦產險', ghost: '返回首頁',
    },
  }[state];
  return (
    <PBStateScreen p={p} title={cfg.title} sub={cfg.sub} icon={cfg.icon} iconTone={cfg.iconTone} badge={cfg.badge} badgeTone={cfg.badgeTone}
      footer={<PBFooter><PBBtn p={p} primary>{cfg.cta}</PBBtn><PBBtn p={p} ghost>{cfg.ghost}</PBBtn></PBFooter>}>
      <PBCard p={p} title="原因">
        <div style={{ fontSize: 13, color: '#0E1424', lineHeight: 1.6 }}>{cfg.reason}</div>
      </PBCard>
      <PBCard p={p} title="案件資訊">{cfg.rows.map((r, i) => <PBRow key={i} k={r[0]} v={r[1]} mono={i < 1} />)}</PBCard>
      <div style={{ fontSize: 11.5, color: '#56657F', lineHeight: 1.55, padding: '0 4px' }}>此狀態由理賠系統判定，接送無法在此狀態下派車。本頁不會擷取任何卡片或付款資料。</div>
    </PBStateScreen>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// A2 · TRAVEL — 團體席次 roster + itinerary link + pickup batching
// ═══════════════════════════════════════════════════════════════════════════
function PB_TrvRoster() {
  const p = PROGRAMS.travel;
  const seats = [
    { n: '林〇雄', r: '領隊 · guide', tag: '舉牌聯絡' },
    { n: '陳〇如', r: '旅客', tag: '輪椅' },
    { n: '吳〇翰 +2', r: '家庭 3 人', tag: '兒童座椅 ×1' },
    { n: '其餘 6 名旅客', r: 'roster', tag: '' },
  ];
  const batches = [
    { b: '第 1 批 · 入境接機', t: '06-28 14:20', v: '中型巴士 ×1', seats: '12 / 12 席', stop: '桃機 T1 → 台北車站' },
    { b: '第 2 批 · 飯店接駁', t: '06-28 16:00', v: '商務車 ×2', seats: '8 席', stop: '台北車站 → 西門商旅' },
  ];
  return (
    <PBScreen p={p}>
      <PBHeader p={p} title="團體席次與分批" sub="旅行社接送 · roster + batching" back
        trailing={<PBChip p={p} tone="accent">團體席次</PBChip>} />
      <PBBody>
        {/* 團體席次 framing */}
        <PBCard p={p} accentBar>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: '#56657F' }}>本團席次 · group seats</span>
            <span style={{ fontFamily: PB_MONO, fontSize: 13 }}><b style={{ fontSize: 19, color: p.primary }}>12</b> <span style={{ color: '#56657F' }}>/ 12 席 · 已配置</span></span>
          </div>
          <PBRow k="團號 · booking ref" v="LION-TPE-0628" mono />
          <PBRow k="行程連結 · itinerary" v="LION 日本關西 5 日 → 查看" />
          <PBRow k="接送段數 · transfer legs" v="4 段 · 第 1 段" mono />
        </PBCard>

        <PBCard p={p} title="乘客名單 · roster (12)">
          {seats.map((s, i, a) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 0', borderBottom: i < a.length - 1 ? '1px dashed #F1F3F8' : 'none' }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: p.primary + '12', color: p.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{s.n.slice(0, 1)}</div>
              <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600 }}>{s.n}</div><div style={{ fontSize: 11, color: '#56657F' }}>{s.r}</div></div>
              {s.tag && <PBChip p={p} tone="neutral">{s.tag}</PBChip>}
            </div>
          ))}
        </PBCard>

        <PBCard p={p} title="分批接送 · pickup batching">
          {batches.map((b, i, a) => (
            <div key={i} style={{ padding: '10px 0', borderBottom: i < a.length - 1 ? '1px dashed #F1F3F8' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                <span style={{ display: 'inline-flex' }}>{PBSvgCar(p.primary)}</span>
                <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{b.b}</span>
                <PBChip p={p} tone="accent">{b.t}</PBChip>
              </div>
              <div style={{ display: 'flex', gap: 16, fontSize: 11.5, color: '#56657F', paddingLeft: 30 }}>
                <span>{b.v}</span><span>{b.seats}</span>
              </div>
              <div style={{ fontSize: 12, color: '#0E1424', marginTop: 3, paddingLeft: 30 }}>{b.stop}</div>
            </div>
          ))}
        </PBCard>
      </PBBody>
      <PBFooter><PBBtn p={p} primary>確認席次並前往預約</PBBtn><PBBtn p={p} ghost>調整分批</PBBtn></PBFooter>
    </PBScreen>
  );
}

Object.assign(window, { PBStateScreen, PB_InsEligibility, PB_InsBlocked, PB_TrvRoster });
