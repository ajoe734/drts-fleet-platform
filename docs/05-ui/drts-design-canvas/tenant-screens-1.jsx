// tenant-screens-1.jsx — Tenant Console (1/3): Home / Bookings / Booking detail / New booking / Passengers / Addresses
// YAMATO 範例; 20 routes total across 3 files; cross-actor audit (Q-TEN13); command pattern (Q-TEN04); soft deactivate (Q-TEN06)

const TN_NAV = [
  { divider: '工作面 · Workspace' },
  { key: 'home',         icon: 'home',        label: '工作面 · Home' },
  { divider: '訂單 · Bookings' },
  { key: 'bookings',     icon: 'bookings',    label: '訂單 · Bookings', badge: '14', badgeTone: 'accent' },
  { key: 'new',          icon: 'plus',        label: '新增訂單 · New booking' },
  { divider: '資料維護 · Directory' },
  { key: 'passengers',   icon: 'passengers',  label: '乘客 · Passengers' },
  { key: 'addresses',    icon: 'addresses',   label: '地址 · Addresses' },
  { divider: '帳號與權限 · Access' },
  { key: 'users',        icon: 'users',       label: '使用者 · Users' },
  { divider: '整合 · Integration' },
  { key: 'apikeys',      icon: 'apiKeys',     label: 'API 金鑰 · API Keys' },
  { key: 'webhooks',     icon: 'webhooks',    label: 'Webhooks' },
  { key: 'notifs',       icon: 'notifs',      label: '通知 · Notifications' },
  { key: 'integration',  icon: 'integration', label: '整合就緒度 · Integration Governance' },
  { divider: '服務水準 · SLA' },
  { key: 'sla',          icon: 'sla',         label: 'SLA' },
  { divider: '財務 · Finance' },
  { key: 'billing',      icon: 'billing',     label: '帳務概覽 · Billing' },
  { key: 'invoices',     icon: 'reports',     label: '發票 · Invoices' },
  { key: 'cc',           icon: 'costCenter',  label: '成本中心 · Cost Centers' },
  { key: 'rules',        icon: 'rules',       label: '審批規則 · Rules' },
  { divider: '報表與稽核 · Reports & Audit' },
  { key: 'reports',      icon: 'reports',     label: '報表 · Reports' },
  { key: 'audit',        icon: 'audit',       label: '稽核 · Audit · cross-actor' },
  { divider: '系統 · System' },
  { key: 'flags',        icon: 'flags',       label: '功能旗標 · Feature Flags · read' },
  { key: 'settings',     icon: 'flags',       label: '設定 · Settings' },
];

const TN_HEALTH = { status: 'healthy', lastCheckedAt: '12s' };
const TN_ACTOR  = { name: 'LC', display: '張俐萱', role: 'tc_admin' };

// ── 1. / — Workspace Home
function TN_Home({ theme: th }) {
  return (
    <Shell theme={th} nav={TN_NAV} active="home"
      breadcrumb={['YAMATO 大和商務集團', 'Home']} env="production" tenant="YAMATO" actor={TN_ACTOR} health={TN_HEALTH}
      refreshTier="slow" dataFreshness="fresh">
      <PageHeader theme={th}
        title="您好，張俐萱"
        subtitle="2026-05-25 (週一) · 本月配額 3,820 / 5,000 趟"
        actions={<>
          <Btn theme={th} icon="ext">幫助中心</Btn>
          <ActionButton theme={th} descriptor={{ action: 'create_booking', enabled: true, riskLevel: 'medium' }} variant="primary" icon="plus" label="建立叫車" en="new" />
        </>} />
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <Kpi theme={th} label="進行中" en="in_progress" value="14" sub="3 broadcasting · 11 assigned" />
          <Kpi theme={th} label="今日已完成" en="today_completed" value="38" delta="↑ 6" deltaTone="up" />
          <Kpi theme={th} label="本月用量" en="mtd_usage" value="3,820" sub="76% of 5,000" />
          <Kpi theme={th} label="當期帳單" en="current_invoice" value="NT$ 1.22M" delta="2026-04 · 待確認" deltaTone="neutral" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
          <Card theme={th} title="進行中訂單" padding={0}>
            <Table theme={th} columns={[
              { h: 'BK', k: 'id', w: 100, mono: true, r: r => <span style={{ color: th.accent, fontWeight: 600 }}>{r.id}</span> },
              { h: 'PASS', k: 'passenger', w: 110 },
              { h: 'PICKUP', k: 'pickup' },
              { h: 'WIN', k: 'win', w: 110, mono: true },
              { h: 'STATE', w: 140, r: r => <Pill theme={th} tone={r.state === 'completed' ? 'success' : r.state === 'broadcasting' ? 'info' : r.state === 'assigned' ? 'success' : r.state === 'cancelled' ? 'danger' : 'warn'} dot>{r.state}</Pill> },
            ]} rows={FX_BOOKINGS.slice(0, 5)} />
          </Card>
          <Card theme={th} title="提醒">
            <Banner theme={th} tone="warn" icon="warn"
              title="Webhook wh_03 已暫停 2 天"
              body="staging 端點測試中，恢復前不會收到事件。"
              actions={<Btn theme={th} variant="ghost">查看</Btn>} />
            <div style={{ height: 8 }} />
            <Banner theme={th} tone="info" icon="info"
              title="2026-05-15 02:00–04:00 平台維護"
              body="計畫性維護，派遣將暫停 2 小時。" />
            <div style={{ height: 8 }} />
            <Banner theme={th} tone="success" icon="ok" title="本月 SLA 99.4%" body="超過合約 SLA 99.0%。" />
          </Card>
        </div>
      </div>
    </Shell>
  );
}

// ── 2. /bookings — list
function TN_Bookings({ theme: th }) {
  return (
    <Shell theme={th} nav={TN_NAV} active="bookings"
      breadcrumb={['訂單']} env="production" tenant="YAMATO" actor={TN_ACTOR} health={TN_HEALTH}
      refreshTier="slow" dataFreshness="fresh">
      <PageHeader theme={th} title="訂單"
        subtitle="本月所有預約 · 含進行中與已完成"
        tabs={[
          { id: 'all', label: '全部', badge: '14' },
          { id: 'live', label: '進行中', badge: '3', tone: 'info' },
          { id: 'reserve', label: '預約', badge: '5' },
          { id: 'approval', label: '待審批', badge: '2', tone: 'warn' },
          { id: 'done', label: '已完成' },
          { id: 'cancel', label: '取消' },
        ]}
        activeTab="all"
        actions={<>
          <Btn theme={th} icon="filter">篩選</Btn>
          <Btn theme={th} icon="export">匯出</Btn>
          <ActionButton theme={th} descriptor={{ action: 'create', enabled: true, riskLevel: 'medium' }} variant="primary" icon="plus" label="新增" en="new" />
        </>} />

      <div style={{ padding: 24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'BK', k: 'id', w: 100, mono: true, r: r => <span style={{ color: th.accent, fontWeight: 600 }}>{r.id}</span> },
            { h: 'ORDER', k: 'orderId', w: 110, mono: true },
            { h: 'TYPE', k: 'subtype', w: 130, mono: true },
            { h: 'PICKUP → DROP', w: 360, r: r => (
              <div style={{ display: 'flex', flexDirection: 'column', fontSize: 12, gap: 1 }}>
                <span>{r.pickup}</span>
                <span style={{ color: th.textDim, fontSize: 11 }}>↓ {r.drop}</span>
              </div>
            )},
            { h: 'WIN', k: 'win', w: 160, mono: true },
            { h: 'PASS', k: 'passenger', w: 100 },
            { h: 'STATE', w: 150, r: r => <Pill theme={th} tone={r.state === 'completed' ? 'success' : r.state === 'cancelled' ? 'danger' : r.state === 'assigned' ? 'success' : r.state === 'draft' ? 'neutral' : 'info'} dot>{r.state}</Pill> },
          ]} rows={FX_BOOKINGS} />
        </Card>
      </div>
    </Shell>
  );
}

// ── 3. /bookings/[id] — detail (Q-TEN05 editability from availableActions + editableUntil)
function TN_BookingDetail({ theme: th, state = 'completed' }) {
  const b = FX_BOOKINGS[0];
  const editable = state === 'reserve';
  const acceptedPending = state === 'accepted_pending';

  return (
    <Shell theme={th} nav={TN_NAV} active="bookings"
      breadcrumb={['訂單', b.id]} env="production" tenant="YAMATO" actor={TN_ACTOR} health={TN_HEALTH}
      refreshTier="slow" dataFreshness="fresh">
      <PageHeader theme={th}
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>{b.id} · {b.subtype}<Pill theme={th} tone={acceptedPending ? 'warn' : state === 'completed' ? 'success' : 'info'} dot>{acceptedPending ? 'accepted_pending' : state}</Pill></span>}
        subtitle={`${b.pickup}  →  ${b.drop}  ·  ${b.win}`}
        actions={<>
          <Btn theme={th} icon="phone">聯絡駕駛</Btn>
          <Btn theme={th} icon="copy">複製為新預約</Btn>
          <ActionButton theme={th} descriptor={{ action: 'update', enabled: editable, disabledReasonCode: editable ? null : 'past_editable_until', riskLevel: 'medium' }} label="更新" en="update" />
          <ActionButton theme={th} descriptor={{ action: 'cancel', enabled: editable, disabledReasonCode: editable ? null : 'past_editable_until', riskLevel: 'high', requiresReason: true }} label="取消" en="cancel" />
        </>} />

      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {acceptedPending && (
            <Banner theme={th} tone="warn" icon="clock"
              title={<span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>command 已受理 · 等候外部確認<span style={{ fontFamily: SHELL_MONO, fontSize: 10.5, opacity: 0.7 }}>· commandId · cmd_a8B2k9</span></span>}
              body="Q-TEN04 同步 command 模式 · 外部 dispatch 引擎正在配對候選司機，預計 15–30 秒內回覆 confirmed。" />
          )}
          <Card theme={th} title="行程資訊">
            <DL theme={th} cols={2} items={[
              { k: 'BOOKING', v: b.id, mono: true },
              { k: 'ORDER', v: b.orderId, mono: true },
              { k: 'PASSENGER', v: b.passenger + '  ·  0912-883-201' },
              { k: 'COST CENTER', v: 'CC-FIN-04 財務處', mono: true },
              { k: 'PICKUP', v: b.pickup },
              { k: 'DROP', v: b.drop },
              { k: 'WINDOW', v: b.win, mono: true },
              { k: 'SERVICE', v: b.subtype, mono: true },
              { k: 'QUOTED FARE', v: 'NT$ 1,580', mono: true },
              { k: 'PAYMENT', v: 'corporate · invoice' },
              { k: 'editableUntil', v: editable ? '出發前 30 min · 2026-05-25 17:00' : '已過時 · null', mono: true },
              { k: 'readOnlyReasonCode', v: editable ? '—' : 'past_editable_until', mono: true },
            ]} />
          </Card>
          <Card theme={th} title="State machine (driver-task)">
            <Stepper theme={th} steps={[{ t: '建立' }, { t: 'queued' }, { t: 'broadcasting' }, { t: 'assigned' }, { t: 'on_trip' }, { t: 'completed' }]} current={state === 'completed' ? 5 : state === 'reserve' ? 1 : 2} />
          </Card>
          <Card theme={th} title="活動 · cross-actor timeline">
            <Timeline theme={th} events={[
              { at: '14:24', tone: 'accent', t: '建立預約', actor: '張俐萱', actorRealm: 'tenant', body: '透過 Web 介面建立。' },
              { at: '14:26', tone: 'accent', t: 'policy gate 通過', actor: 'tenant.policy', actorRealm: 'system', body: '高鐵接送 · 主管預核免簽。' },
              { at: '14:30', tone: 'success', t: '指派 d_8843', actor: 'dispatch.engine', actorRealm: 'ops', body: 'ETA 8m。' },
              { at: '14:38', tone: 'success', t: '抵達上車點', actor: 'd_8843', actorRealm: 'driver' },
              { at: '15:42', tone: 'success', t: '完成', actor: 'd_8843', actorRealm: 'driver', body: 'NT$ 1,580 · 已開立 invoice line。' },
            ]} />
          </Card>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card theme={th} title="駕駛">
            <DL theme={th} cols={1} items={[
              { k: 'DRIVER', v: '陳俊宏 · d_8843', mono: true },
              { k: 'VEHICLE', v: 'Toyota Prius α · ARJ-3120', mono: true },
              { k: 'RATING', v: '4.86 · 1,243 趟' },
              { k: 'CONTACT', v: '已遮罩 · 透過平台轉接' },
            ]} />
          </Card>
          <Card theme={th} title="計費">
            <DL theme={th} cols={2} items={[
              { k: '方案', v: 'pr_v23 商務', mono: true },
              { k: '里程', v: '38.4 km', mono: true },
              { k: '時數', v: '0:48', mono: true },
              { k: '附加', v: '機場 NT$ 100', mono: true },
              { k: '總額', v: 'NT$ 1,580', mono: true },
              { k: '結算', v: 'invoice 2026-05', mono: true },
            ]} />
          </Card>
        </div>
      </div>
    </Shell>
  );
}

// ── 4. /bookings/new — booking create
function TN_NewBooking({ theme: th }) {
  return (
    <Shell theme={th} nav={TN_NAV} active="new"
      breadcrumb={['訂單', '新增']} env="production" tenant="YAMATO" actor={TN_ACTOR} health={TN_HEALTH}
      refreshTier="manual">
      <PageHeader theme={th}
        title="建立叫車"
        subtitle="代訂或本人 · 預約 / 即時 · 同步 command 模式 (Q-TEN04)"
        meta={<Pill theme={th} tone="info" dot>POST /api/tenant/bookings/commands/create</Pill>} />

      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
        <Card theme={th} title="行程">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field theme={th} label="服務類型 · service_type" required><Select theme={th} value="airport_pickup" /></Field>
            <Field theme={th} label="預約 / 即時 · timing" required><Select theme={th} value="預約 · scheduled" /></Field>
            <Field theme={th} label="pickup" required hint="從地址簿選或自由輸入"><Input theme={th} value="台北市信義區松仁路 100 號" /></Field>
            <Field theme={th} label="drop" required><Input theme={th} value="桃園機場 第二航廈 出境大廳" /></Field>
            <Field theme={th} label="出發時間 · departAt" required><Input theme={th} value="2026-05-25 17:30" mono /></Field>
            <Field theme={th} label="passenger 數 · headcount" required><Input theme={th} value="1" mono /></Field>
            <Field theme={th} label="行李 · luggage"><Input theme={th} value="2 件" /></Field>
            <Field theme={th} label="特殊需求 · note"><Input theme={th} value="兒童安全座椅" /></Field>
          </div>
        </Card>
        <Card theme={th} title="關聯與審批">
          <Field theme={th} label="passenger · 從通訊錄" required><Select theme={th} value="林士群 · Y2103" /></Field>
          <Field theme={th} label="cost center" required><Select theme={th} value="CC-FIN-04 財務處" /></Field>
          <Field theme={th} label="專案碼 · project_code"><Input theme={th} value="PRJ-2026-Q2-AUDIT" mono /></Field>
          <Field theme={th} label="批註 · justification"><Input theme={th} value="季度稽核啟動會議" /></Field>
          <DL theme={th} cols={1} items={[
            { k: '預估費用 · estimate', v: 'NT$ 1,580 · pr_v23', mono: true },
            { k: '審批 · approval', v: '主管預核免簽 (cost center 規則 r_002)' },
            { k: '配額影響 · quota', v: '本月剩餘 1,180 / 5,000' },
          ]} />
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <Btn theme={th}>取消</Btn>
            <span style={{ flex: 1 }} />
            <Btn theme={th}>另存草稿</Btn>
            <ActionButton theme={th} descriptor={{ action: 'submit_command', enabled: true, riskLevel: 'medium' }} variant="primary" icon="check" label="送出 command" en="commit" />
          </div>
        </Card>
      </div>
    </Shell>
  );
}

// ── 5. /passengers — soft deactivate
function TN_Passengers({ theme: th }) {
  return (
    <Shell theme={th} nav={TN_NAV} active="passengers"
      breadcrumb={['資料維護', '乘客']} env="production" tenant="YAMATO" actor={TN_ACTOR} health={TN_HEALTH}
      refreshTier="slow" dataFreshness="fresh">
      <PageHeader theme={th}
        title="乘客通訊錄"
        subtitle="員工 · 訪客 · 啟用狀態 · 同意書版本 · 軟停用 only (Q-TEN06)"
        tabs={[{ id: 'all', label: '全部', badge: '6' }, { id: 'staff', label: '員工', badge: '5' }, { id: 'visitor', label: '訪客', badge: '1' }, { id: 'inactive', label: '停用', badge: '1' }]}
        activeTab="all"
        actions={<>
          <Btn theme={th} icon="ext">CSV 匯入</Btn>
          <ActionButton theme={th} descriptor={{ action: 'create', enabled: true, riskLevel: 'medium' }} variant="primary" icon="plus" label="新增" en="new" />
        </>} />

      <div style={{ padding: 24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'NAME', w: 160, r: r => <span style={{ fontWeight: 600 }}>{r.name}</span> },
            { h: 'EMP ID', k: 'emp', w: 100, mono: true },
            { h: 'DEPT', k: 'dept', w: 140 },
            { h: 'MOBILE', k: 'mobile', w: 130, mono: true },
            { h: 'EMAIL', k: 'email', mono: true },
            { h: 'STATE', w: 110, r: r => <Pill theme={th} tone={r.active ? 'success' : 'neutral'} dot>{r.active ? 'active' : 'deactivated'}</Pill> },
            { h: 'ACTIONS', w: 200, r: r => (
              <div style={{ display: 'flex', gap: 4 }}>
                <ActionButton theme={th} size="xs" descriptor={{ action: 'edit', enabled: true, riskLevel: 'medium' }} label="編輯" en="edit" />
                <ActionButton theme={th} size="xs" descriptor={{ action: 'deactivate', enabled: r.active, disabledReasonCode: 'already_deactivated', riskLevel: 'high', requiresReason: true }} label={r.active ? '軟停用' : '啟用'} en={r.active ? 'deactivate' : 'reactivate'} />
              </div>
            )},
          ]} rows={FX_PASSENGERS} />
        </Card>
      </div>
    </Shell>
  );
}

// ── 6. /addresses — NEW per Q-TEN02 (soft deactivate)
function TN_Addresses({ theme: th }) {
  return (
    <Shell theme={th} nav={TN_NAV} active="addresses"
      breadcrumb={['資料維護', '地址']} env="production" tenant="YAMATO" actor={TN_ACTOR} health={TN_HEALTH}
      refreshTier="slow" dataFreshness="fresh">
      <PageHeader theme={th}
        title="地址簿"
        subtitle="常用地點 · tag · 啟用狀態 · 軟停用 only (Q-TEN06)"
        actions={<>
          <Btn theme={th} icon="export">匯出</Btn>
          <ActionButton theme={th} descriptor={{ action: 'create', enabled: true, riskLevel: 'medium' }} variant="primary" icon="plus" label="新增地址" en="new" />
        </>} />

      <div style={{ padding: 24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'NAME', k: 'name', w: 160, r: r => <span style={{ fontWeight: 600 }}>{r.name}</span> },
            { h: 'ADDRESS', k: 'text' },
            { h: 'TAGS', w: 220, r: r => <div style={{ display: 'flex', gap: 4 }}>{r.tags.map((t, i) => <Pill key={i} theme={th} tone="info">{t}</Pill>)}</div> },
            { h: 'OWNER', k: 'owner', w: 110, mono: true },
            { h: 'STATE', w: 110, r: r => <Pill theme={th} tone={r.active ? 'success' : 'neutral'} dot>{r.active ? 'active' : 'deactivated'}</Pill> },
            { h: 'ACTIONS', w: 180, r: r => (
              <div style={{ display: 'flex', gap: 4 }}>
                <ActionButton theme={th} size="xs" descriptor={{ action: 'edit', enabled: true, riskLevel: 'medium' }} label="編輯" en="edit" />
                <ActionButton theme={th} size="xs" descriptor={{ action: 'deactivate', enabled: r.active, disabledReasonCode: 'already_deactivated', riskLevel: 'high', requiresReason: true }} label="軟停用" en="deactivate" />
              </div>
            )},
          ]} rows={FX_ADDRESSES} />
        </Card>
      </div>
    </Shell>
  );
}

Object.assign(window, {
  TN_NAV, TN_HEALTH, TN_ACTOR,
  TN_Home, TN_Bookings, TN_BookingDetail, TN_NewBooking, TN_Passengers, TN_Addresses,
});
