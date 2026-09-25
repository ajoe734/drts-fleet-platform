// bank-screens-1.jsx — Bank Console (1/3): 首頁總覽 (role-cut) · 訂單列表 · 訂單詳情
// Issuer 中國信託. Read-only. Masked refs. zh-TW primary · en secondary.

// ── small local helpers ──────────────────────────────────────────────────────
function BkQuotaBar({ theme: th, used, total, accent = BK_GOLD, bg = BK_GOLD_BG }) {
  const pct = Math.round(used / total * 100);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}>
        <span style={{ fontFamily: SHELL_MONO, fontSize: 20, fontWeight: 700, color: th.text, letterSpacing: -0.4 }}>
          {used.toLocaleString()} <span style={{ fontSize: 12, color: th.textMuted, fontWeight: 500 }}>/ {total.toLocaleString()} 趟</span>
        </span>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: accent }}>{pct}% 已用</span>
      </div>
      <div style={{ height: 7, borderRadius: 4, background: th.surfaceLo, overflow: 'hidden', border: '1px solid ' + th.border }}>
        <div style={{ width: pct + '%', height: '100%', background: accent }} />
      </div>
      <div style={{ fontSize: 11, color: th.textMuted, marginTop: 6 }}>剩餘 {(total - used).toLocaleString()} 趟 · 本年度權益池</div>
    </div>
  );
}

function BkSlaRow({ theme: th, label, en, value, target, unit = '%', invert = false }) {
  const ok = invert ? value <= target : value >= target;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid ' + th.border }}>
      <div style={{ width: 130, minWidth: 130 }}>
        <BiLabel theme={th} zh={label} en={en} size={12} />
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontFamily: SHELL_MONO, fontSize: 15, fontWeight: 700, color: ok ? th.text : th.danger }}>{value}{unit}</span>
        <span style={{ fontSize: 11, color: th.textDim }}>目標 {target}{unit}</span>
      </div>
      <Pill theme={th} tone={ok ? 'success' : 'danger'} dot>{ok ? '達標' : '未達'}<span style={{ marginLeft: 3, opacity: 0.7, fontFamily: SHELL_MONO, fontSize: 9.5 }}>{ok ? 'met' : 'breach'}</span></Pill>
    </div>
  );
}

function BkUpcoming({ theme: th, rows }) {
  return (
    <Table theme={th} columns={[
      { h: 'BK', k: 'id', w: 96, mono: true, r: r => <span style={{ color: th.accent, fontWeight: 600 }}>{r.id}</span> },
      { h: '方向', w: 84, r: r => <Pill theme={th} tone={r.dir === '出境去程' ? 'info' : 'neutral'}>{r.dir}</Pill> },
      { h: '航班 / 航廈', w: 150, r: r => <span style={{ fontFamily: SHELL_MONO, fontSize: 11.5 }}>{r.flight} · {r.terminal}</span> },
      { h: '時段', k: 'win', w: 100, mono: true },
      { h: '卡友', w: 88, mono: true, r: r => <span style={{ color: th.textMuted }}>{r.cardholderRef}</span> },
      { h: '狀態', w: 96, r: r => <Pill theme={th} tone={bkStateTone(r.state)} dot>{r.state}</Pill> },
    ]} rows={rows} />
  );
}

const BK_EXCEPTIONS = [
  { tone: 'warn',   icon: 'eye',  ttl: '人工審查 · BK-2K7EX9', en: 'manual_review', body: '商旅御璽卡 · 配額臨界（剩餘 1 趟），建議客服確認後派車。', entity: 'BK-2K7EX9' },
  { tone: 'danger', icon: 'warn', ttl: '無供給 · 04:00 桃園 T1', en: 'no_supply', body: 'BK-2K7EM4 凌晨時段一度無可派車隊，已於 6 分鐘後補派。', entity: 'BK-2K7EM4' },
  { tone: 'warn',   icon: 'sla',  ttl: 'SLA 未達 · 世界卡方案', en: 'sla_breach', body: '世界卡準點率 94.2% 低於合約 95%，連動合約 CTR-CTB-WE-2026 警示。', entity: 'CTR-CTB-WE-2026' },
];

// ── 1. / — 首頁總覽（role-cut）────────────────────────────────────────────────
function BK_Home({ theme: th, role = 'admin' }) {
  const actor = BK_ACTORS[role];
  const rl = BK_ROLE_LABEL[actor.role];
  const seeOrders   = role === 'admin' || role === 'ops';
  const seeFinance  = role === 'admin' || role === 'finance';
  const seeQuota    = true; // 配額為銀行頭號指標，全角色可見
  const seeSla      = true;
  const upcoming = FX_BK_ORDERS.filter(o => o.state === '已指派' || o.state === '進行中' || o.state === '預約');

  return (
    <Shell theme={th} nav={BK_NAV} active="home"
      breadcrumb={['中國信託', '首頁總覽']} env="production" tenant="CTBC" actor={actor} health={BK_HEALTH}
      refreshTier="medium_slow" dataFreshness="fresh">
      <PageHeader theme={th}
        title={`您好，${actor.display}`}
        subtitle="2026-06-17 (週三) · 期別 2026-06 · 接送服務由 智慧運輸科技 (DRTS) 營運"
        meta={<>
          <Pill theme={th} tone="issuer" dot>發卡行 · CTBC</Pill>
          <Pill theme={th} tone="accent">{rl.zh}<span style={{ marginLeft: 4, opacity: 0.7, fontFamily: SHELL_MONO, fontSize: 9.5 }}>{rl.en}</span></Pill>
          <span style={{ fontSize: 11, color: th.textDim, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <MgmtIcon name="eye" size={12} /> 唯讀總覽 · 依角色顯示
          </span>
        </>}
        actions={<Btn theme={th} icon="ext">幫助中心</Btn>} />

      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* KPI strip — role cut */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <Kpi theme={th} label="本期訂單" en="period_orders" value="1,182" sub="預約 312 · 進行 6 · 完成 842 · 取消 22" />
          <Kpi theme={th} label="禮遇配額" en="benefit_quota" value="65%" sub="12,950 / 19,800 趟 · 全方案" />
          <Kpi theme={th} label="準點率" en="on_time" value="98.7%" delta="目標 95%" deltaTone="up" />
          {seeFinance
            ? <Kpi theme={th} label="當期對帳單" en="current_statement" value="NT$ 1.28M" delta="2026-05 · due 06-15" deltaTone="warn" />
            : <Kpi theme={th} label="待處理例外" en="open_exceptions" value="3" delta="人工審查 1 · 無供給 1 · SLA 1" deltaTone="warn" />}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16 }}>
          {/* LEFT column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {seeOrders && (
              <Card theme={th} title="即將到來的機場接送" subtitle="未來 N 筆 · 航班 / 航廈 / 時段" padding={0}
                actions={<Btn theme={th} size="xs" variant="ghost" icon="arrow">訂單列表</Btn>}>
                <BkUpcoming theme={th} rows={upcoming} />
              </Card>
            )}
            {!seeOrders && seeFinance && (
              <Card theme={th} title="當期對帳單 · 2026-05" subtitle="逐趟對帳 · 金流方向＝發卡行付 DRTS"
                actions={<Btn theme={th} size="xs" variant="ghost" icon="arrow">對帳單</Btn>}>
                <DL theme={th} cols={2} items={[
                  { k: '期別 PERIOD', v: '2026-05', mono: true },
                  { k: '狀態 STATUS', v: <Pill theme={th} tone="warn" dot>due</Pill> },
                  { k: '趟次 TRIPS', v: '812 趟', mono: true },
                  { k: '總額 TOTAL', v: 'NT$ 1,284,600', mono: true },
                  { k: '開立 ISSUED', v: '2026-06-01', mono: true },
                  { k: '到期 DUE', v: '2026-06-15', mono: true },
                ]} />
              </Card>
            )}
            <Card theme={th} title="近期例外" subtitle="人工審查 · 無供給 · SLA 未達 · 點擊深入訂單"
              actions={<Pill theme={th} tone="warn">{BK_EXCEPTIONS.length} 筆未結</Pill>}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(seeFinance && !seeOrders ? BK_EXCEPTIONS.filter(e => e.en === 'sla_breach') : BK_EXCEPTIONS).map((e, i) => (
                  <Banner key={i} theme={th} tone={e.tone} icon={e.icon}
                    title={<span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>{e.ttl}<span style={{ fontFamily: SHELL_MONO, fontSize: 10, opacity: 0.65 }}>· {e.en}</span></span>}
                    body={e.body}
                    actions={<Btn theme={th} size="xs" variant="ghost" icon="arrow">{e.entity}</Btn>} />
                ))}
              </div>
            </Card>
          </div>

          {/* RIGHT column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {seeQuota && (
              <Card theme={th} title="禮遇配額 · 全方案" subtitle="本年度免費接送趟次"
                style={{ borderTop: '2px solid ' + BK_GOLD }}>
                <BkQuotaBar theme={th} used={9840} total={14400} />
                <div style={{ height: 12 }} />
                <div style={{ fontSize: 11.5, fontWeight: 600, color: th.textMuted, marginBottom: 6 }}>世界卡機場</div>
                <BkQuotaBar theme={th} used={9840} total={14400} />
                <div style={{ height: 10 }} />
                <div style={{ fontSize: 11.5, fontWeight: 600, color: th.textMuted, marginBottom: 6 }}>商旅御璽卡機場</div>
                <BkQuotaBar theme={th} used={3110} total={5400} />
              </Card>
            )}
            {seeSla && (
              <Card theme={th} title="SLA 達成 · 當期" subtitle="vs 合約目標 · DRTS 為權威來源">
                <BkSlaRow theme={th} label="準點率" en="on_time_rate" value={98.7} target={95} />
                <BkSlaRow theme={th} label="完成率" en="completion_rate" value={99.6} target={99} />
                <BkSlaRow theme={th} label="回應時間" en="response_time" value={42} target={60} unit="s" invert />
                <div style={{ fontSize: 11, color: th.textDim, marginTop: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <MgmtIcon name="info" size={12} /> 健康／警示／違反 依各 SLA 指標彙總
                </div>
              </Card>
            )}
            {seeFinance && seeOrders && (
              <Card theme={th} title="結算 · 當期對帳單" subtitle="發卡行付 DRTS">
                <DL theme={th} cols={2} items={[
                  { k: '期別', v: '2026-05', mono: true },
                  { k: '狀態', v: <Pill theme={th} tone="warn" dot>due</Pill> },
                  { k: '總額', v: 'NT$ 1.28M', mono: true },
                  { k: '到期', v: '06-15', mono: true },
                ]} />
              </Card>
            )}
            {!seeFinance && (
              <Card theme={th} title="結算 · 當期對帳單">
                <EmptyState theme={th} reason="permission_denied" compact
                  messageOverride="結算金額僅財務角色 (bank_finance) 可檢視。" />
              </Card>
            )}
          </div>
        </div>
      </div>
    </Shell>
  );
}

// ── 2. /bookings — 訂單列表 ───────────────────────────────────────────────────
function BK_Bookings({ theme: th }) {
  return (
    <Shell theme={th} nav={BK_NAV} active="bookings"
      breadcrumb={['訂單']} env="production" tenant="CTBC" actor={BK_ACTORS.ops} health={BK_HEALTH}
      refreshTier="dispatch" dataFreshness="fresh">
      <PageHeader theme={th} title="訂單"
        subtitle="中信機場接送 · 唯讀 · 不可從銀行端動派遣 (DRTS 權威)"
        tabs={[
          { id: 'all', label: '全部', badge: '6' },
          { id: 'live', label: '進行中', badge: '1', tone: 'info' },
          { id: 'assigned', label: '已指派', badge: '1', tone: 'accent' },
          { id: 'reserve', label: '預約', badge: '1' },
          { id: 'done', label: '已完成', badge: '2' },
          { id: 'cancel', label: '取消', badge: '1' },
        ]}
        activeTab="all"
        meta={<>
          <Select theme={th} value="方案：全部" />
          <Select theme={th} value="方向：全部" />
          <Select theme={th} value="期別：2026-06" />
        </>}
        actions={<>
          <Btn theme={th} icon="filter">篩選</Btn>
          <Btn theme={th} icon="export">匯出</Btn>
        </>} />

      <div style={{ padding: '0 24px 24px' }}>
        <div style={{ padding: '12px 0 14px' }}>
          <Banner theme={th} tone="info" icon="info"
            title="唯讀檢視 · read-only"
            body={<span>GET /api/tenant/orders?programCode&direction&state&period&cardholderRef · 所有卡友與權益參照一律遮罩。派遣動作須於 DRTS Ops Console 執行。</span>} />
        </div>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'BK', k: 'id', w: 96, mono: true, r: r => <span style={{ color: th.accent, fontWeight: 600 }}>{r.id}</span> },
            { h: '卡友', w: 84, mono: true, r: r => <span style={{ color: th.textMuted }}>{r.cardholderRef}</span> },
            { h: '方案', w: 130, r: r => <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}><span style={{ fontSize: 12 }}>{r.program}</span><span style={{ fontFamily: SHELL_MONO, fontSize: 10, color: th.textDim }}>{r.programCode}</span></div> },
            { h: '方向', w: 80, r: r => <Pill theme={th} tone={r.dir === '出境去程' ? 'info' : 'neutral'}>{r.dir}</Pill> },
            { h: '航班 / 航廈', w: 132, r: r => <span style={{ fontFamily: SHELL_MONO, fontSize: 11.5 }}>{r.flight} · {r.terminal}</span> },
            { h: '上 → 下車', w: 280, r: r => (
              <div style={{ display: 'flex', flexDirection: 'column', fontSize: 11.5, gap: 1 }}>
                <span>{r.pickup}</span>
                <span style={{ color: th.textDim }}>↓ {r.drop}</span>
              </div>
            )},
            { h: '時段', k: 'win', w: 96, mono: true },
            { h: '權益', w: 92, mono: true, r: r => <span style={{ color: th.textMuted }}>{r.benefitRef}</span> },
            { h: '派遣狀態', w: 96, r: r => <Pill theme={th} tone={bkStateTone(r.state)} dot>{r.state}</Pill> },
          ]} rows={FX_BK_ORDERS} />
        </Card>
      </div>
    </Shell>
  );
}

// ── 3. /bookings/[id] — 訂單詳情 ──────────────────────────────────────────────
function BK_BookingDetail({ theme: th }) {
  const b = FX_BK_ORDERS[1]; // 進行中 inbound
  return (
    <Shell theme={th} nav={BK_NAV} active="bookings"
      breadcrumb={['訂單', b.id]} env="production" tenant="CTBC" actor={BK_ACTORS.ops} health={BK_HEALTH}
      refreshTier="dispatch" dataFreshness="fresh">
      <PageHeader theme={th}
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>{b.id} · 機場接送<Pill theme={th} tone={bkStateTone(b.state)} dot>{b.state}</Pill></span>}
        subtitle={`${b.dir} · ${b.flight} · ${b.terminal} · ${b.win}`}
        meta={<>
          <Pill theme={th} tone="neutral">卡友 {b.cardholderRef}</Pill>
          <Pill theme={th} tone="neutral">權益 {b.benefitRef}</Pill>
        </>}
        actions={<ActionButton theme={th}
          descriptor={{ action: 'open_ops_dispatch', enabled: false, disabledReasonCode: 'no_ops_dispatch_permission', riskLevel: 'low' }}
          icon="ext" label="深入 Ops 派遣" en="ops" />} />

      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card theme={th} title="派遣時間軸 · cross-actor" subtitle="建立 → [審批] → 指派 → 途中 → 完成 / 取消">
            <Timeline theme={th} events={[
              { at: '06-17 14:20', tone: 'accent', t: '建立預約', actor: 'cardholder.app', actorRealm: 'system', body: '卡友於網銀 App 內嵌頁建立 · reference token 身分。' },
              { at: '06-17 14:22', tone: 'info', t: '資格決策 · eligible', actor: 'system.eligibility', actorRealm: 'system', body: 'WE_QUOTA_OK · 本趟扣 1 趟權益。' },
              { at: '06-17 14:24', tone: 'success', t: '指派 d_8843', actor: 'dispatch.engine', actorRealm: 'ops', body: 'ETA 入境後 12 分鐘。' },
              { at: '06-17 21:36', tone: 'accent', t: '航班動態更新', actor: 'flight.tracker', actorRealm: 'system', body: 'JL809 預計準點 21:40 落地。' },
              { at: '進行中', tone: 'info', t: '司機前往入境大廳', actor: 'd_8843', actorRealm: 'driver' },
            ]} />
          </Card>
          <Card theme={th} title="機場區 · airport">
            <DL theme={th} cols={2} items={[
              { k: '方向 DIRECTION', v: b.dir + ' · ' + b.dirEn, mono: true },
              { k: '航班 FLIGHT', v: b.flight, mono: true },
              { k: '航廈 TERMINAL', v: b.terminal, mono: true },
              { k: '航班延誤容忍', v: '60 min 免費等候', mono: true },
              { k: '上車 PICKUP', v: b.pickup },
              { k: '下車 DROP', v: b.drop },
              { k: '時段 WINDOW', v: b.win, mono: true },
              { k: '舉牌 GREET', v: '是 · 入境大廳' },
            ]} />
          </Card>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card theme={th} title="表頭 · header">
            <DL theme={th} cols={1} items={[
              { k: 'BOOKING', v: b.id, mono: true },
              { k: 'ORDER', v: b.orderId, mono: true },
              { k: '方案 PROGRAM', v: b.program + ' · ' + b.programCode, mono: true },
              { k: '卡友參照 CARDHOLDER', v: <span style={{ fontFamily: SHELL_MONO }}>{b.cardholderRef} <Pill theme={th} tone="neutral" style={{ marginLeft: 4 }}>遮罩</Pill></span> },
              { k: '派遣狀態 STATE', v: <Pill theme={th} tone={bkStateTone(b.state)} dot>{b.state}</Pill> },
            ]} />
          </Card>
          <Card theme={th} title="權益區 · benefit" style={{ borderTop: '2px solid ' + BK_GOLD }}>
            <DL theme={th} cols={1} items={[
              { k: '方案 PROGRAM', v: '世界卡機場 · CTB-AIR-WE', mono: true },
              { k: 'benefit 參照', v: <span style={{ fontFamily: SHELL_MONO }}>{b.benefitRef} <Pill theme={th} tone="neutral" style={{ marginLeft: 4 }}>遮罩</Pill></span> },
              { k: '發卡授權參照', v: <span style={{ fontFamily: SHELL_MONO }}>AUTH-••••-3C9 <Pill theme={th} tone="neutral" style={{ marginLeft: 4 }}>遮罩</Pill></span> },
            ]} />
            <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, background: BK_GOLD_BG, border: '1px solid ' + BK_GOLD_BD, display: 'flex', alignItems: 'center', gap: 8 }}>
              <MgmtIcon name="check" size={14} style={{ color: BK_GOLD }} />
              <span style={{ fontSize: 12, color: th.text }}>配額影響 · 本趟 <b style={{ color: BK_GOLD }}>扣 1 趟</b>（世界卡年度 12 趟）</span>
            </div>
          </Card>
          <Card theme={th} title="限制">
            <Banner theme={th} tone="neutral" icon="lock"
              body="本頁為唯讀。不可從銀行端動派遣；派遣權威由 DRTS Ops Console 持有。深連按鈕受權限閘門控制。" />
          </Card>
        </div>
      </div>
    </Shell>
  );
}

Object.assign(window, {
  BkQuotaBar, BkSlaRow, BK_EXCEPTIONS,
  BK_Home, BK_Bookings, BK_BookingDetail,
});
