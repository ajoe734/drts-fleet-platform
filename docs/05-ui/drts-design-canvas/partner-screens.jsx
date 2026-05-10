// partner-screens.jsx — Cardholder-facing partner booking funnel (CTBC World Elite example).

const PB_BRAND = {
  name: 'CTBC World Elite',
  bank: '中信銀行',
  card: '世界菁英卡',
  hotline: '0800-024-365',
  primary: '#1B4FA0',
  primaryDark: '#0A2A6E',
  accent: '#C9A356',
  ink: '#0E1424',
};

// Branded chip
function PBChip({ children, tone = 'neutral' }) {
  const tones = {
    accent: { fg: PB_BRAND.accent, bg: '#FAF3DF', bd: '#E5D58A' },
    primary: { fg: PB_BRAND.primary, bg: '#EBF1FB', bd: '#C7D7F0' },
    neutral: { fg: '#56657F', bg: '#F1F3F8', bd: '#DDE3EC' },
    success: { fg: '#15803D', bg: '#F0FDF4', bd: '#BBF7D0' },
  };
  const t = tones[tone] || tones.neutral;
  return <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 8px', fontSize: 11, fontWeight: 600, color: t.fg, background: t.bg, border: '1px solid ' + t.bd, borderRadius: 999, fontFamily: '"JetBrains Mono", monospace' }}>{children}</span>;
}

// Card-art header strip
function CardHeader({ title, subtitle, trailing }) {
  return (
    <div style={{
      background: 'linear-gradient(135deg, ' + PB_BRAND.primaryDark + ' 0%, ' + PB_BRAND.primary + ' 70%)',
      color: '#fff', padding: '20px 24px 22px', position: 'relative', overflow: 'hidden',
    }}>
      {/* gold filigree */}
      <div style={{ position: 'absolute', right: -40, top: -20, width: 200, height: 200, background: 'radial-gradient(circle, ' + PB_BRAND.accent + '33 0%, transparent 60%)' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, letterSpacing: '0.16em', opacity: 0.85, fontWeight: 600 }}>
        <span style={{ width: 22, height: 22, borderRadius: 4, background: PB_BRAND.accent, color: PB_BRAND.primaryDark, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12 }}>C</span>
        CTBC · 中信銀行 × DRTS
      </div>
      <div style={{ marginTop: 14, fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em' }}>{title}</div>
      {subtitle && <div style={{ fontSize: 13, opacity: 0.78, marginTop: 4 }}>{subtitle}</div>}
      {trailing && <div style={{ position: 'absolute', right: 24, top: 24 }}>{trailing}</div>}
    </div>
  );
}

// Section card
function PCard({ title, children, padding = 16, style = {} }) {
  return (
    <section style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden', ...style }}>
      {title && <header style={{ padding: '12px 16px 10px', borderBottom: '1px solid #F1F3F8', fontSize: 13, fontWeight: 600, color: PB_BRAND.ink }}>{title}</header>}
      <div style={{ padding }}>{children}</div>
    </section>
  );
}

function PRow({ label, value, mono }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px dashed #F1F3F8', fontSize: 13 }}>
      <span style={{ color: '#56657F' }}>{label}</span>
      <span style={{ color: PB_BRAND.ink, fontFamily: mono ? '"JetBrains Mono", monospace' : 'inherit', fontWeight: mono ? 500 : 400 }}>{value}</span>
    </div>
  );
}

function PButton({ children, primary, onClick, disabled, full = true, ghost }) {
  const styles = primary
    ? { bg: PB_BRAND.primary, fg: '#fff', bd: PB_BRAND.primary }
    : ghost
    ? { bg: 'transparent', fg: PB_BRAND.primary, bd: 'transparent' }
    : { bg: '#fff', fg: PB_BRAND.ink, bd: '#D2D8E2' };
  return (
    <button disabled={disabled} onClick={onClick} style={{
      width: full ? '100%' : 'auto', padding: '12px 16px', borderRadius: 10, border: '1px solid ' + styles.bd,
      background: disabled ? '#E5E7EB' : styles.bg, color: disabled ? '#9CA3AF' : styles.fg, fontWeight: 600, fontSize: 14,
      letterSpacing: '0.01em', cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
    }}>{children}</button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. Landing (in-app, 390px) — entry from card-program tile
// ═══════════════════════════════════════════════════════════════════════════
function PB_Landing() {
  return (
    <div style={{ width: '100%', height: '100%', background: '#F4F6FB', overflow: 'auto', fontFamily: 'inherit' }}>
      <CardHeader title="禮賓接送 Concierge" subtitle="World Elite 卡友專屬 · 全年免費 12 趟"
        trailing={<PBChip tone="accent">EXCLUSIVE</PBChip>} />
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <PCard padding={16}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <div style={{ width: 44, height: 28, borderRadius: 4, background: 'linear-gradient(135deg,' + PB_BRAND.primaryDark + ',' + PB_BRAND.primary + ')', position: 'relative' }}>
              <div style={{ position: 'absolute', right: 4, bottom: 4, width: 8, height: 8, background: PB_BRAND.accent, borderRadius: 1 }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>•••• •••• •••• 8842</div>
              <div style={{ fontSize: 11, color: '#56657F' }}>陳〇明 · World Elite</div>
            </div>
            <PBChip tone="success">eligible</PBChip>
          </div>
          <div style={{ background: '#F1F3F8', borderRadius: 8, padding: 10, marginTop: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 11, color: '#56657F' }}>本年度剩餘趟次</span>
              <span style={{ fontSize: 13, fontFamily: '"JetBrains Mono", monospace', color: PB_BRAND.ink }}><b style={{ fontSize: 18 }}>9</b> / 12</span>
            </div>
            <div style={{ height: 4, marginTop: 6, background: '#DDE3EC', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ width: '75%', height: '100%', background: PB_BRAND.accent }} />
            </div>
          </div>
        </PCard>

        <PCard title="可使用的服務">
          {[
            { t: '機場接送', s: '桃園 / 松山 · 商務車', tag: 'AIRPORT' },
            { t: '優先派車', s: '都會區 · 8 分鐘內到車', tag: 'PRIORITY' },
            { t: '商務時段', s: '平日 07:00–22:00 · 含車型升級', tag: 'BUSINESS' },
          ].map((x, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < 2 ? '1px dashed #F1F3F8' : 'none' }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: PB_BRAND.primary + '11', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: 14, height: 14, borderRadius: 3, background: PB_BRAND.primary }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: PB_BRAND.ink }}>{x.t}</div>
                <div style={{ fontSize: 11, color: '#56657F' }}>{x.s}</div>
              </div>
              <PBChip tone="primary">{x.tag}</PBChip>
            </div>
          ))}
        </PCard>

        <PCard padding={14} style={{ background: 'linear-gradient(135deg, #FAF3DF 0%, #FFFDF5 100%)', borderColor: '#E5D58A' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <div style={{ width: 4, alignSelf: 'stretch', background: PB_BRAND.accent, borderRadius: 2 }} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: PB_BRAND.primaryDark }}>禮遇條款</div>
              <div style={{ fontSize: 11, color: '#56657F', lineHeight: 1.6, marginTop: 4 }}>
                當趟次免費額度用完後，每趟 8 折優惠。費用由本卡帳單合併扣款，無須現場付款。完整條款請參閱本卡權益文件 v23.4。
              </div>
            </div>
          </div>
        </PCard>

        <PButton primary>立即叫車</PButton>
        <PButton ghost>查看歷史趟次</PButton>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Eligibility / linking
// ═══════════════════════════════════════════════════════════════════════════
function PB_Eligibility() {
  return (
    <div style={{ width: '100%', height: '100%', background: '#F4F6FB', overflow: 'auto' }}>
      <CardHeader title="連結卡片" subtitle="第一次使用 · 一次性確認" />
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <PCard title="您的權益">
          <PRow label="持卡身份" value="World Elite" />
          <PRow label="卡號末四碼" value="8842" mono />
          <PRow label="本年度免費趟次" value="12 趟" mono />
          <PRow label="優惠折扣" value="額度後 8 折" />
          <PRow label="服務範圍" value="台北 · 桃園 · 新竹" />
        </PCard>

        <PCard title="授權同意">
          {[
            { t: '使用本卡身份識別建立 DRTS 帳號', sub: '不會傳送您的卡號或安全碼' },
            { t: '與 DRTS 共享行程必要資訊', sub: '上下車地點 · 時間 · 費用 (供帳單合併使用)' },
            { t: '同意《CTBC × DRTS 禮賓接送服務條款 v3》', sub: '隱私政策連結另開' },
          ].map((x, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: i < 2 ? '1px dashed #F1F3F8' : 'none' }}>
              <div style={{ width: 18, height: 18, borderRadius: 4, border: '2px solid ' + PB_BRAND.primary, background: PB_BRAND.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><path d="M5 12l5 5L20 7" /></svg>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: PB_BRAND.ink }}>{x.t}</div>
                <div style={{ fontSize: 11, color: '#56657F', marginTop: 2 }}>{x.sub}</div>
              </div>
            </div>
          ))}
        </PCard>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <PButton primary>確認連結並繼續</PButton>
          <PButton ghost>稍後</PButton>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Booking form
// ═══════════════════════════════════════════════════════════════════════════
function PB_Book() {
  return (
    <div style={{ width: '100%', height: '100%', background: '#F4F6FB', overflow: 'auto' }}>
      <CardHeader title="建立行程" subtitle="機場接送 · 桃園 T2" />
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <PCard padding={0}>
          <div style={{ padding: 14, borderBottom: '1px solid #F1F3F8' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: 4, background: PB_BRAND.primary }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: '#56657F', letterSpacing: '0.06em' }}>PICKUP</span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: PB_BRAND.ink }}>台北市信義區松仁路 100 號</div>
            <div style={{ fontSize: 11, color: '#56657F', marginTop: 2 }}>大和商務集團 · HQ 大廳</div>
          </div>
          <div style={{ padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: 1, background: PB_BRAND.accent }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: '#56657F', letterSpacing: '0.06em' }}>DROP</span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: PB_BRAND.ink }}>桃園機場 第二航廈</div>
            <div style={{ fontSize: 11, color: '#56657F', marginTop: 2 }}>出境大廳 7 號門</div>
          </div>
        </PCard>

        <PCard title="出發時間">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
            {['即時', '+30 分', '+1 小時'].map((t, i) => (
              <button key={i} style={{ padding: '10px 8px', borderRadius: 8, border: i === 1 ? '2px solid ' + PB_BRAND.primary : '1px solid #D2D8E2', background: i === 1 ? PB_BRAND.primary + '11' : '#fff', fontSize: 12, fontWeight: 600, color: i === 1 ? PB_BRAND.primary : PB_BRAND.ink, fontFamily: 'inherit', cursor: 'pointer' }}>{t}</button>
            ))}
          </div>
          <div style={{ marginTop: 10, padding: 10, background: '#F1F3F8', borderRadius: 8, fontSize: 12, color: PB_BRAND.ink, fontFamily: '"JetBrains Mono", monospace' }}>
            預計出發：2026-05-08 17:30
          </div>
        </PCard>

        <PCard title="服務細節">
          <PRow label="人數" value="1 位" />
          <PRow label="行李" value="2 件" />
          <PRow label="特殊需求" value="—" />
          <PRow label="車型" value="商務車 (升級)" />
        </PCard>

        <PCard title="禮遇與費用" style={{ background: 'linear-gradient(180deg, #FAF3DF 0%, #FFFDF5 100%)', borderColor: '#E5D58A' }}>
          <PRow label="基本費用" value="NT$ 1,580" mono />
          <PRow label="World Elite 禮遇" value="−NT$ 1,580" mono />
          <PRow label="您將支付" value="免費" />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, padding: 10, background: '#fff', borderRadius: 8 }}>
            <PBChip tone="accent">9 / 12 趟</PBChip>
            <span style={{ fontSize: 11, color: '#56657F' }}>本年度剩餘禮遇趟次</span>
          </div>
        </PCard>

        <PButton primary>確認預約</PButton>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Confirmed (assigned, ETA)
// ═══════════════════════════════════════════════════════════════════════════
function PB_Confirmed() {
  return (
    <div style={{ width: '100%', height: '100%', background: '#F4F6FB', overflow: 'auto' }}>
      <CardHeader title="已派車" subtitle="駕駛將於 8 分鐘後抵達" />
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <PCard padding={16}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 56, height: 56, borderRadius: 28, background: 'linear-gradient(135deg, ' + PB_BRAND.primary + ', ' + PB_BRAND.primaryDark + ')', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700 }}>陳</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: PB_BRAND.ink }}>陳俊宏</div>
              <div style={{ fontSize: 11, color: '#56657F' }}>1,243 趟 · 4.86 ★</div>
              <div style={{ fontSize: 11, color: PB_BRAND.primary, fontFamily: '"JetBrains Mono", monospace', marginTop: 2 }}>Toyota Prius α · ARJ-3120</div>
            </div>
            <button style={{ width: 44, height: 44, borderRadius: 22, background: PB_BRAND.primary, border: 'none', color: '#fff', cursor: 'pointer' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ display: 'block', margin: 'auto' }}><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>
            </button>
          </div>
        </PCard>

        <PCard padding={0}>
          <div style={{ height: 180, background: 'linear-gradient(180deg, #DDE5F0 0%, #C7D7F0 100%)', position: 'relative', borderBottom: '1px solid #E5E7EB' }}>
            {/* Stylized map */}
            <svg width="100%" height="100%" viewBox="0 0 360 180" style={{ position: 'absolute', inset: 0 }}>
              <path d="M0,120 Q80,100 160,110 T360,90" stroke="#A5B4FC" strokeWidth="2" fill="none" strokeDasharray="4 4" />
              <path d="M40,140 L100,100 L180,90 L260,70 L320,40" stroke={PB_BRAND.primary} strokeWidth="3" fill="none" />
              <circle cx="40" cy="140" r="6" fill={PB_BRAND.primary} />
              <circle cx="320" cy="40" r="6" fill={PB_BRAND.accent} stroke="#fff" strokeWidth="2" />
              <circle cx="180" cy="90" r="9" fill={PB_BRAND.primary} stroke="#fff" strokeWidth="2" />
              <circle cx="180" cy="90" r="14" fill={PB_BRAND.primary} fillOpacity="0.2" />
            </svg>
          </div>
          <div style={{ padding: 16, display: 'flex', alignItems: 'baseline', gap: 16 }}>
            <div>
              <div style={{ fontSize: 11, color: '#56657F' }}>預計抵達</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: PB_BRAND.ink, fontFamily: '"JetBrains Mono", monospace' }}>8 <span style={{ fontSize: 12, fontWeight: 500, color: '#56657F' }}>min</span></div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: '#56657F' }}>距離</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: PB_BRAND.ink, fontFamily: '"JetBrains Mono", monospace' }}>2.4 km</div>
            </div>
            <PBChip tone="success">已派車</PBChip>
          </div>
        </PCard>

        <PCard title="行程資訊">
          <PRow label="預約編號" value="bk_5512" mono />
          <PRow label="禮遇" value="World Elite · 趟次 #4" />
          <PRow label="車型" value="商務車 (升級)" />
          <PRow label="您將支付" value="免費" />
        </PCard>

        <div style={{ display: 'flex', gap: 8 }}>
          <PButton ghost full>取消行程</PButton>
          <PButton ghost full>客服協助</PButton>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. My trips list
// ═══════════════════════════════════════════════════════════════════════════
function PB_Trips() {
  const trips = [
    { d: '今天 14:30', f: '台北信義 → 桃園 T2', state: '已派車', tone: 'success', cost: '免費', fee: '禮遇 #4' },
    { d: '昨天 09:12', f: '台北車站 → 內湖科技園區', state: '已完成', tone: 'neutral', cost: 'NT$ 0', fee: '禮遇 #3' },
    { d: '5/2 18:45', f: '101 大樓 → 松山機場', state: '已完成', tone: 'neutral', cost: 'NT$ 0', fee: '禮遇 #2' },
    { d: '4/28 07:30', f: '陽明山 → 桃園 T1', state: '已完成', tone: 'neutral', cost: 'NT$ 240', fee: '額度後 8 折' },
    { d: '4/14 22:10', f: '南港展覽館 → 內湖', state: '已完成', tone: 'neutral', cost: 'NT$ 0', fee: '禮遇 #1' },
  ];
  return (
    <div style={{ width: '100%', height: '100%', background: '#F4F6FB', overflow: 'auto' }}>
      <CardHeader title="我的行程" subtitle="本年度 · 共 4 趟" />
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <PCard padding={0}>
          <div style={{ padding: '14px 16px', background: 'linear-gradient(180deg, #FAF3DF, #FFFDF5)', borderBottom: '1px solid #E5D58A' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 11, color: '#56657F', fontWeight: 600, letterSpacing: '0.06em' }}>2026 年度</span>
              <span style={{ fontSize: 13, color: PB_BRAND.ink, fontFamily: '"JetBrains Mono", monospace' }}><b style={{ fontSize: 22 }}>9</b> / 12 剩餘</span>
            </div>
            <div style={{ height: 4, marginTop: 8, background: '#fff', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ width: '75%', height: '100%', background: PB_BRAND.accent }} />
            </div>
          </div>
          <div>
            {trips.map((t, i) => (
              <div key={i} style={{ padding: '12px 16px', borderBottom: i < trips.length - 1 ? '1px solid #F1F3F8' : 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: PB_BRAND.ink }}>{t.f}</div>
                  <div style={{ fontSize: 11, color: '#56657F', marginTop: 2 }}>{t.d} · {t.fee}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <PBChip tone={t.tone}>{t.state}</PBChip>
                  <div style={{ fontSize: 12, marginTop: 4, color: PB_BRAND.ink, fontFamily: '"JetBrains Mono", monospace' }}>{t.cost}</div>
                </div>
              </div>
            ))}
          </div>
        </PCard>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. Receipt
// ═══════════════════════════════════════════════════════════════════════════
function PB_Receipt() {
  return (
    <div style={{ width: '100%', height: '100%', background: '#F4F6FB', overflow: 'auto' }}>
      <CardHeader title="行程明細" subtitle="bk_5512 · 已完成" />
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <PCard padding={0}>
          <div style={{ padding: 16, borderBottom: '1px dashed #E5E7EB' }}>
            <PRow label="出發" value="14:30:11" mono />
            <PRow label="抵達" value="15:42:27" mono />
            <PRow label="行車" value="1 小時 12 分" />
            <PRow label="距離" value="38.4 km" mono />
          </div>
          <div style={{ padding: 16 }}>
            <PRow label="車資 (基本)" value="NT$ 1,420" mono />
            <PRow label="機場附加" value="NT$ 100" mono />
            <PRow label="高速公路費" value="NT$ 60" mono />
            <PRow label="小計" value="NT$ 1,580" mono />
            <div style={{ marginTop: 8 }}>
              <PRow label="World Elite 禮遇" value="−NT$ 1,580" mono />
              <PRow label="您支付" value="NT$ 0" mono />
            </div>
          </div>
        </PCard>

        <PCard title="款項" style={{ background: 'linear-gradient(180deg, #FAF3DF, #FFFDF5)', borderColor: '#E5D58A' }}>
          <PRow label="付款方式" value="World Elite ••8842" mono />
          <PRow label="入帳期別" value="2026-06 帳單" />
          <PRow label="禮遇序號" value="WE-2026-0004" mono />
          <PRow label="收據編號" value="rcp_8821a912" mono />
        </PCard>

        <div style={{ display: 'flex', gap: 8 }}>
          <PButton ghost full>下載收據 PDF</PButton>
          <PButton ghost full>聯絡客服</PButton>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. Help / contact
// ═══════════════════════════════════════════════════════════════════════════
function PB_Help() {
  return (
    <div style={{ width: '100%', height: '100%', background: '#F4F6FB', overflow: 'auto' }}>
      <CardHeader title="協助" subtitle="World Elite 卡友專線" />
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <PCard padding={16} style={{ background: 'linear-gradient(135deg, ' + PB_BRAND.primaryDark + ', ' + PB_BRAND.primary + ')', color: '#fff', borderColor: 'transparent' }}>
          <div style={{ fontSize: 11, opacity: 0.7, letterSpacing: '0.1em', fontWeight: 600 }}>24 小時專線</div>
          <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8, fontFamily: '"JetBrains Mono", monospace' }}>0800-024-365</div>
          <div style={{ fontSize: 11, opacity: 0.78, marginTop: 6 }}>您將被轉接至中信銀行 World Elite 客服專員</div>
        </PCard>

        <PCard title="常見問題">
          {[
            { q: '禮遇趟次如何計算？', a: '每年元旦重置 12 趟，未使用不累計。' },
            { q: '可以代為叫車嗎？', a: '可，但乘客手機需在訂單中。' },
            { q: '取消政策', a: '出發 5 分鐘前免費取消；逾時將扣除一次禮遇。' },
            { q: '額度後仍可叫車嗎？', a: '可，享 8 折優惠並合併至本卡帳單。' },
          ].map((x, i) => (
            <div key={i} style={{ padding: '10px 0', borderBottom: i < 3 ? '1px dashed #F1F3F8' : 'none' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: PB_BRAND.ink }}>{x.q}</div>
              <div style={{ fontSize: 12, color: '#56657F', marginTop: 4, lineHeight: 1.6 }}>{x.a}</div>
            </div>
          ))}
        </PCard>

        <PCard title="爭議或客訴">
          <div style={{ fontSize: 12, color: '#56657F', lineHeight: 1.6, marginBottom: 10 }}>
            行程結束後 30 天內可提出爭議。將同時通知中信銀行禮賓中心與 DRTS 平台客服。
          </div>
          <PButton>提出爭議</PButton>
        </PCard>
      </div>
    </div>
  );
}

Object.assign(window, {
  PB_BRAND, PB_Landing, PB_Eligibility, PB_Book, PB_Confirmed, PB_Trips, PB_Receipt, PB_Help,
});
