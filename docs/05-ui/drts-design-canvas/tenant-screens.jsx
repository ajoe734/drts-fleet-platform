// tenant-screens.jsx — Tenant Console (admin/operator).

const TN_NAV = [
  { divider: '工作面' },
  { key: 'home',         icon: 'home',          label: '首頁' },
  { key: 'bookings',     icon: 'bookings',      label: '叫車',     badge: '5', badgeTone: 'accent' },
  { key: 'newbooking',   icon: 'plus',          label: '建立叫車' },
  { divider: '通訊錄' },
  { key: 'passengers',   icon: 'passengers',    label: '乘客' },
  { key: 'addresses',    icon: 'addresses',     label: '地址簿' },
  { key: 'costcenter',   icon: 'billing',       label: '成本中心' },
  { key: 'rules',        icon: 'flags',         label: '審批與配額' },
  { divider: '帳務' },
  { key: 'invoices',     icon: 'billing',       label: '對帳單' },
  { key: 'reports',      icon: 'reports',       label: '報表' },
  { divider: '整合' },
  { key: 'apikeys',      icon: 'apiKeys',       label: 'API 金鑰' },
  { key: 'webhooks',     icon: 'webhooks',      label: 'Webhook' },
  { key: 'audit',        icon: 'audit',         label: '稽核' },
  { divider: '組織' },
  { key: 'users',        icon: 'users',         label: '人員與角色' },
  { key: 'settings',     icon: 'flags',         label: '租戶設定' },
];

// 1. Home
function TN_Home({ theme: th }) {
  return (
    <Shell theme={th} nav={TN_NAV} active="home" breadcrumb={['YAMATO 大和商務集團', '首頁']} env="production">
      <PageHeader theme={th} title="您好，張俐萱" subtitle="2026-05-08 (週五) · 本月配額 3,820 / 5,000 趟"
        actions={<><Btn theme={th} icon="ext">幫助中心</Btn><Btn theme={th} variant="primary" icon="plus">建立叫車</Btn></>} />
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <Kpi theme={th} label="進行中" value="14" sub="3 broadcasting · 11 assigned" />
          <Kpi theme={th} label="今日已完成" value="38" delta="↑ 6" deltaTone="up" />
          <Kpi theme={th} label="本月用量" value="3,820" sub="76% of 5,000" />
          <Kpi theme={th} label="當期帳單" value="NT$ 1.22M" delta="2026-04 · 待確認" deltaTone="neutral" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
          <Card theme={th} title="進行中訂單" padding={0} actions={<Btn theme={th} variant="ghost">前往叫車</Btn>}>
            <Table theme={th} columns={[
              { h: 'BK', k: 'id', w: 100, mono: true, r: r => <span style={{ color: th.accent, fontWeight: 600 }}>{r.id}</span> },
              { h: 'PASS.', k: 'passenger', w: 110 },
              { h: 'PICKUP', k: 'pickup' },
              { h: 'WIN', k: 'win', w: 110, mono: true },
              { h: 'STATE', w: 130, r: r => <Pill theme={th} tone={r.state === 'completed' ? 'success' : r.state === 'broadcasting' ? 'info' : r.state === 'assigned' ? 'success' : 'warn'} dot>{r.state}</Pill> },
            ]} rows={FX_BOOKINGS.slice(0, 5)} />
          </Card>
          <Card theme={th} title="提醒">
            <Banner theme={th} tone="warn" icon="warn" title="Webhook wh_03 已暫停 2 天" body="staging 端點測試中，恢復前不會收到事件。" actions={<Btn theme={th} variant="ghost">查看</Btn>} />
            <div style={{ height: 8 }} />
            <Banner theme={th} tone="info" icon="warn" title="2026-05-15 02:00–04:00 平台維護" body="計畫性維護，派遣將暫停 2 小時。" />
            <div style={{ height: 8 }} />
            <Banner theme={th} tone="success" icon="check" title="本月 SLA 達 99.4%" body="超過合約 SLA 99.0%。" />
          </Card>
        </div>
      </div>
    </Shell>
  );
}

// 2. Bookings list
function TN_Bookings({ theme: th }) {
  return (
    <Shell theme={th} nav={TN_NAV} active="bookings" breadcrumb={['叫車']}>
      <PageHeader theme={th} title="叫車" subtitle="本月所有預約 · 含進行中與已完成"
        tabs={['全部','進行中','預約','已完成','取消']} activeTab="全部"
        actions={<><Btn theme={th} icon="filter">篩選</Btn><Btn theme={th} icon="export">匯出</Btn><Btn theme={th} variant="primary" icon="plus">新增</Btn></>} />
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
            { h: 'WIN', k: 'win', w: 150, mono: true },
            { h: 'PASS.', k: 'passenger', w: 110 },
            { h: 'CC', k: 'costCenter', w: 100, mono: true },
            { h: 'STATE', w: 130, r: r => <Pill theme={th} tone={r.state === 'completed' ? 'success' : r.state === 'cancelled' ? 'danger' : r.state === 'assigned' ? 'success' : 'info'} dot>{r.state}</Pill> },
          ]} rows={FX_BOOKINGS} />
        </Card>
      </div>
    </Shell>
  );
}

// 3. Booking detail
function TN_BookingDetail({ theme: th }) {
  const b = FX_BOOKINGS[0];
  return (
    <Shell theme={th} nav={TN_NAV} active="bookings" breadcrumb={['叫車', b.id]}>
      <PageHeader theme={th} title={b.id + ' · ' + b.subtype} subtitle={b.pickup + '  →  ' + b.drop + '  ·  ' + b.win}
        actions={<><Btn theme={th} icon="phone">聯絡駕駛</Btn><Btn theme={th} icon="copy">複製為新預約</Btn><Btn theme={th} danger icon="warn">取消</Btn></>} />
      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card theme={th} title="行程資訊">
            <DL theme={th} cols={2} items={[
              { k: 'BOOKING', v: b.id, mono: true },
              { k: 'ORDER', v: b.orderId, mono: true },
              { k: 'PASSENGER', v: b.passenger + '  ·  ' + b.passengerPhone },
              { k: 'COST CENTER', v: b.costCenter, mono: true },
              { k: 'PICKUP', v: b.pickup },
              { k: 'DROP', v: b.drop },
              { k: 'WINDOW', v: b.win, mono: true },
              { k: 'SERVICE', v: b.subtype, mono: true },
              { k: 'QUOTED FARE', v: 'NT$ 1,580', mono: true },
              { k: 'PAYMENT', v: 'corporate · invoice' },
            ]} />
          </Card>
          <Card theme={th} title="行程時間軸">
            <Stepper theme={th} steps={[{ t: '建立' }, { t: 'queued' }, { t: 'broadcasting' }, { t: 'assigned' }, { t: 'on_trip' }, { t: 'completed' }]} current={5} />
          </Card>
          <Card theme={th} title="活動">
            <Timeline theme={th} events={[
              { at: '14:24', tone: 'accent', t: '建立預約', actor: '張俐萱', body: '透過 Web 介面建立。' },
              { at: '14:26', tone: 'accent', t: 'gate 通過', actor: 'tenant.policy', body: '高鐵接送 · 主管預核免簽。' },
              { at: '14:30', tone: 'success', t: '指派 d_8843', actor: 'dispatch', body: 'ETA 8m。' },
              { at: '14:38', tone: 'success', t: '抵達上車點', actor: 'd_8843' },
              { at: '15:42', tone: 'success', t: '完成', actor: 'd_8843', body: 'NT$ 1,580 · 已開立 invoice line。' },
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
              { k: '附加', v: '機場附加 NT$ 100', mono: true },
              { k: '總額', v: 'NT$ 1,580', mono: true },
              { k: '結算', v: 'invoice 2026-05', mono: true },
            ]} />
          </Card>
        </div>
      </div>
    </Shell>
  );
}

// 4. New booking form
function TN_NewBooking({ theme: th }) {
  return (
    <Shell theme={th} nav={TN_NAV} active="newbooking" breadcrumb={['叫車', '新增']}>
      <PageHeader theme={th} title="建立叫車" subtitle="代訂或本人 · 預約 / 即時 · 自動套用 cost center 規則" />
      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
        <Card theme={th} title="行程">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field theme={th} label="服務類型" required><Select theme={th} value="airport_pickup" /></Field>
            <Field theme={th} label="預約 / 即時" required><Select theme={th} value="預約" /></Field>
            <Field theme={th} label="pickup" required hint="從地址簿選或自由輸入"><Input theme={th} value="台北市信義區松仁路 100 號" /></Field>
            <Field theme={th} label="drop" required><Input theme={th} value="桃園機場 第二航廈 出境大廳" /></Field>
            <Field theme={th} label="出發時間" required><Input theme={th} value="2026-05-08 17:30" mono /></Field>
            <Field theme={th} label="passenger 數" required><Input theme={th} value="1" mono /></Field>
            <Field theme={th} label="行李"><Input theme={th} value="2 件" /></Field>
            <Field theme={th} label="特殊需求"><Input theme={th} value="兒童安全座椅" /></Field>
          </div>
        </Card>
        <Card theme={th} title="關聯與審批">
          <Field theme={th} label="passenger" required hint="從通訊錄選擇"><Select theme={th} value="林士群 · Y2103" /></Field>
          <Field theme={th} label="cost center" required><Select theme={th} value="CC-FIN-04 財務處" /></Field>
          <Field theme={th} label="專案碼"><Input theme={th} value="PRJ-2026-Q2-AUDIT" mono /></Field>
          <Field theme={th} label="批註"><Input theme={th} value="季度稽核啟動會議" /></Field>
          <DL theme={th} cols={1} items={[
            { k: '預估費用', v: 'NT$ 1,580 · pr_v23', mono: true },
            { k: '審批', v: '主管預核免簽 (cost center 規則)' },
            { k: '配額影響', v: '本月剩餘 1,180 / 5,000' },
          ]} />
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <Btn theme={th}>取消</Btn>
            <span style={{ flex: 1 }} />
            <Btn theme={th}>另存草稿</Btn>
            <Btn theme={th} variant="primary" icon="check">送出預約</Btn>
          </div>
        </Card>
      </div>
    </Shell>
  );
}

// 5. Passengers
function TN_Passengers({ theme: th }) {
  return (
    <Shell theme={th} nav={TN_NAV} active="passengers" breadcrumb={['通訊錄', '乘客']}>
      <PageHeader theme={th} title="乘客通訊錄" subtitle="員工 · 訪客 · 啟用狀態 · 同意書版本" tabs={['全部','員工','訪客','停用']} activeTab="全部"
        actions={<><Btn theme={th} icon="ext">CSV 匯入</Btn><Btn theme={th} variant="primary" icon="plus">新增</Btn></>} />
      <div style={{ padding: 24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'NAME', w: 160, r: r => <span style={{ fontWeight: 600 }}>{r.name}</span> },
            { h: 'EMP ID', k: 'emp', w: 100, mono: true },
            { h: 'DEPT', k: 'dept', w: 140 },
            { h: 'MOBILE', k: 'mobile', w: 130, mono: true },
            { h: 'EMAIL', k: 'email', mono: true },
            { h: 'STATE', w: 100, r: r => <Pill theme={th} tone={r.active ? 'success' : 'neutral'} dot>{r.active ? 'active' : 'disabled'}</Pill> },
          ]} rows={FX_PASSENGERS} />
        </Card>
      </div>
    </Shell>
  );
}

// 6. Addresses
function TN_Addresses({ theme: th }) {
  return (
    <Shell theme={th} nav={TN_NAV} active="addresses" breadcrumb={['通訊錄', '地址簿']}>
      <PageHeader theme={th} title="地址簿" subtitle="常用地點 · tag · 啟用" actions={<Btn theme={th} variant="primary" icon="plus">新增地址</Btn>} />
      <div style={{ padding: 24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'NAME', k: 'name', w: 160, r: r => <span style={{ fontWeight: 600 }}>{r.name}</span> },
            { h: 'ADDRESS', k: 'text' },
            { h: 'TAGS', w: 200, r: r => <div style={{ display: 'flex', gap: 4 }}>{r.tags.map((t,i) => <Pill key={i} theme={th} tone="info">{t}</Pill>)}</div> },
            { h: 'OWNER', k: 'owner', w: 100, mono: true },
            { h: 'STATE', w: 100, r: r => <Pill theme={th} tone={r.active ? 'success' : 'neutral'} dot>{r.active ? 'active' : 'disabled'}</Pill> },
          ]} rows={FX_ADDRESSES} />
        </Card>
      </div>
    </Shell>
  );
}

// 7. Cost centers
function TN_CostCenter({ theme: th }) {
  return (
    <Shell theme={th} nav={TN_NAV} active="costcenter" breadcrumb={['通訊錄', '成本中心']}>
      <PageHeader theme={th} title="成本中心" subtitle="部門 · 月配額 · 預設審批規則" actions={<Btn theme={th} variant="primary" icon="plus">新增</Btn>} />
      <div style={{ padding: 24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'CODE', k: 'code', w: 130, mono: true, r: r => <span style={{ fontWeight: 600 }}>{r.code}</span> },
            { h: 'NAME', k: 'name', w: 200 },
            { h: 'OWNER', k: 'owner', w: 130 },
            { h: '月配額', k: 'quota', w: 150, mono: true, align: 'right' },
            { h: '本月使用', k: 'used', w: 150, mono: true, align: 'right' },
            { h: '審批', k: 'approval', mono: true },
          ]} rows={[
            { code: 'CC-FIN-04', name: '財務處', owner: '王副總', quota: '300 趟', used: '218 趟', approval: '主管預核免簽' },
            { code: 'CC-RD-12', name: 'R&D Fab18', owner: '陳處長', quota: '800 趟', used: '614 趟', approval: '機場 / 跨夜需核准' },
            { code: 'CC-OPS-02', name: '營運處', owner: '林經理', quota: '500 趟', used: '380 趟', approval: '主管預核免簽' },
            { code: 'CC-BD-09', name: '業務開發', owner: '黃協理', quota: '1,200 趟', used: '892 趟', approval: '> NT$ 3,000 需核准' },
            { code: 'CC-EXEC-01', name: '高階主管', owner: 'CEO Office', quota: '∞', used: '142 趟', approval: '免審' },
          ]} />
        </Card>
      </div>
    </Shell>
  );
}

// 8. Approval rules
function TN_Rules({ theme: th }) {
  return (
    <Shell theme={th} nav={TN_NAV} active="rules" breadcrumb={['通訊錄', '審批與配額']}>
      <PageHeader theme={th} title="審批規則" subtitle="條件 → 動作 · 規則先後優先級" actions={<Btn theme={th} variant="primary" icon="plus">新增規則</Btn>} />
      <div style={{ padding: 24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'PRI', w: 60, mono: true, align: 'right', r: (_, i) => i + 1 },
            { h: '條件', k: 'cond', w: 380 },
            { h: '動作', k: 'act', w: 220 },
            { h: '審批者', k: 'approver', w: 150 },
            { h: 'STATE', w: 100, r: r => <Pill theme={th} tone={r.active ? 'success' : 'neutral'} dot>{r.active ? 'active' : 'paused'}</Pill> },
          ]} rows={[
            { cond: 'service_type = airport_pickup AND fare > NT$ 3,000', act: '需審批', approver: 'cost_center.owner', active: true },
            { cond: 'pickup_time ∈ [22:00, 06:00]', act: '需審批 + 雙簽', approver: 'cc.owner + finance', active: true },
            { cond: 'cost_center = CC-EXEC-01', act: '免審', approver: '—', active: true },
            { cond: 'monthly_quota_remaining < 10%', act: '通知 owner', approver: '—', active: true },
            { cond: 'passenger.role = visitor', act: '需主管登記事由', approver: 'cc.owner', active: false },
          ]} />
        </Card>
      </div>
    </Shell>
  );
}

// 9. Invoices
function TN_Invoices({ theme: th }) {
  return (
    <Shell theme={th} nav={TN_NAV} active="invoices" breadcrumb={['帳務', '對帳單']}>
      <PageHeader theme={th} title="對帳單" subtitle="月結 · invoice line · 證明文件 · 短效下載"
        actions={<><Btn theme={th} icon="filter">期別</Btn><Btn theme={th} icon="export">下載當期</Btn></>} />
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <Kpi theme={th} label="當期 (2026-04)" value="NT$ 1,224,800" delta="published" deltaTone="up" />
          <Kpi theme={th} label="行程數" value="3,820" />
          <Kpi theme={th} label="平均單筆" value="NT$ 320" />
          <Kpi theme={th} label="爭議筆數" value="2" delta="cmp_0915, cmp_0912" deltaTone="down" />
        </div>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'INVOICE', k: 'id', w: 200, mono: true, r: r => <span style={{ color: th.accent, fontWeight: 600 }}>{r.id}</span> },
            { h: 'PERIOD', k: 'period', w: 110, mono: true },
            { h: 'AMOUNT', k: 'amount', w: 160, mono: true, align: 'right' },
            { h: 'STATUS', w: 110, r: r => <Pill theme={th} tone={r.status === 'paid' ? 'success' : r.status === 'published' ? 'info' : 'neutral'} dot>{r.status}</Pill> },
            { h: 'DUE', k: 'due', w: 110, mono: true },
            { h: 'ISSUED', k: 'issued', mono: true },
          ]} rows={FX_INVOICES} />
        </Card>
      </div>
    </Shell>
  );
}

// 10. Reports
function TN_Reports({ theme: th }) {
  return (
    <Shell theme={th} nav={TN_NAV} active="reports" breadcrumb={['帳務', '報表']}>
      <PageHeader theme={th} title="報表" subtitle="月用量 · cost center 拆分 · SLA 摘要" actions={<Btn theme={th} variant="primary" icon="plus">建立工作</Btn>} />
      <div style={{ padding: 24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'JOB', k: 'id', w: 110, mono: true },
            { h: 'KIND', k: 'kind', w: 180, mono: true },
            { h: 'PERIOD', k: 'period', w: 110, mono: true },
            { h: 'FORMAT', k: 'format', w: 90, mono: true },
            { h: 'STATUS', w: 110, r: r => <Pill theme={th} tone={r.status === 'ready' ? 'success' : r.status === 'running' ? 'info' : 'neutral'} dot>{r.status}</Pill> },
            { h: 'EXPIRES', k: 'expires', mono: true, w: 130 },
            { h: 'CREATED', k: 'created', mono: true },
          ]} rows={FX_REPORTS} />
        </Card>
      </div>
    </Shell>
  );
}

// 11. API keys
function TN_ApiKeys({ theme: th }) {
  return (
    <Shell theme={th} nav={TN_NAV} active="apikeys" breadcrumb={['整合', 'API 金鑰']}>
      <PageHeader theme={th} title="API 金鑰" subtitle="Live 與 sandbox · scope · last seen · 撤銷後永久不可復原"
        actions={<><Btn theme={th} icon="ext">API 文件</Btn><Btn theme={th} variant="primary" icon="plus">建立金鑰</Btn></>} />
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Banner theme={th} tone="info" icon="warn" title="只在建立當下顯示完整金鑰" body="關閉視窗後僅顯示 mask；遺失須重新建立。請務必妥善保存。" />
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'NAME', k: 'name', w: 280, r: r => <span style={{ fontWeight: 600 }}>{r.name}</span> },
            { h: 'PREFIX', k: 'prefix', w: 110, mono: true },
            { h: 'MASK', k: 'mask', w: 120, mono: true },
            { h: 'SCOPE', k: 'scope', mono: true },
            { h: 'LAST', k: 'last', w: 130, mono: true },
            { h: 'EXPIRES', k: 'expires', w: 130, mono: true },
            { h: 'STATE', w: 100, r: r => <Pill theme={th} tone={r.revoked ? 'danger' : 'success'} dot>{r.revoked ? 'revoked' : 'active'}</Pill> },
          ]} rows={FX_KEYS} />
        </Card>
      </div>
    </Shell>
  );
}

// 12. Webhooks (with deliveries inline)
function TN_Webhooks({ theme: th }) {
  return (
    <Shell theme={th} nav={TN_NAV} active="webhooks" breadcrumb={['整合', 'Webhook']}>
      <PageHeader theme={th} title="Webhook" subtitle="端點 · 事件訂閱 · 投遞紀錄 · 重試政策" tabs={['Endpoints','Deliveries','Replay']} activeTab="Endpoints"
        actions={<><Btn theme={th} icon="ext">payload schema</Btn><Btn theme={th} variant="primary" icon="plus">新增端點</Btn></>} />
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Card theme={th} title="端點" padding={0}>
          <Table theme={th} columns={[
            { h: 'URL', k: 'url', mono: true, r: r => <span style={{ fontWeight: 600 }}>{r.url}</span> },
            { h: 'EVENTS', w: 280, r: r => <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>{r.events.map((e, i) => <Pill key={i} theme={th} tone="info">{e}</Pill>)}</div> },
            { h: 'STATE', w: 110, r: r => <Pill theme={th} tone={r.status === 'active' ? 'success' : 'warn'} dot>{r.status}</Pill> },
            { h: 'LAST', k: 'last', w: 200, mono: true },
          ]} rows={FX_WEBHOOKS} />
        </Card>
        <Card theme={th} title="近 24h 投遞" padding={0}>
          <Table theme={th} dense columns={[
            { h: 'DLV', k: 'id', w: 100, mono: true },
            { h: 'WH', k: 'wh', w: 90, mono: true },
            { h: 'EVENT', k: 'event', w: 200, mono: true },
            { h: 'CODE', k: 'code', w: 80, mono: true, align: 'right', r: r => <Pill theme={th} tone={r.code >= 200 && r.code < 300 ? 'success' : 'danger'}>{r.code}</Pill> },
            { h: 'TRIES', k: 'attempts', w: 80, mono: true, align: 'right' },
            { h: 'AT', k: 'at', mono: true },
            { h: 'DUR', k: 'dur', w: 90, mono: true },
          ]} rows={FX_WEBHOOK_DELIVERIES} />
        </Card>
      </div>
    </Shell>
  );
}

// 13. Audit
function TN_Audit({ theme: th }) {
  return (
    <Shell theme={th} nav={TN_NAV} active="audit" breadcrumb={['整合', '稽核']}>
      <PageHeader theme={th} title="稽核紀錄" subtitle="不可變 · 7 年保存 · 含 request_id 對應" actions={<Btn theme={th} icon="export">匯出</Btn>} />
      <div style={{ padding: 24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'AT', k: 'at', w: 170, mono: true },
            { h: 'ACTOR', k: 'actor', w: 200 },
            { h: 'TYPE', k: 'actorType', w: 100, mono: true },
            { h: 'MODULE', k: 'module', w: 140, mono: true },
            { h: 'ACTION', k: 'action', w: 200, mono: true },
            { h: 'RESOURCE', k: 'resource', w: 150, mono: true },
            { h: 'REQ', k: 'req', mono: true },
          ]} rows={FX_AUDIT} />
        </Card>
      </div>
    </Shell>
  );
}

// 14. Users / roles
function TN_Users({ theme: th }) {
  return (
    <Shell theme={th} nav={TN_NAV} active="users" breadcrumb={['組織', '人員與角色']}>
      <PageHeader theme={th} title="人員與角色" subtitle="tenant_admin · operator · viewer · approver" actions={<Btn theme={th} variant="primary" icon="plus">邀請成員</Btn>} />
      <div style={{ padding: 24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'NAME', k: 'name', w: 180, r: r => <span style={{ fontWeight: 600 }}>{r.name}</span> },
            { h: 'EMAIL', k: 'email', mono: true },
            { h: 'ROLE', k: 'role', w: 180, mono: true, r: r => <Pill theme={th} tone={r.role === 'tenant_admin' ? 'accent' : 'info'}>{r.role}</Pill> },
            { h: 'STATE', w: 100, r: r => <Pill theme={th} tone={r.status === 'active' ? 'success' : 'neutral'} dot>{r.status}</Pill> },
            { h: 'UPDATED', k: 'updated', mono: true },
          ]} rows={FX_TUSERS} />
        </Card>
      </div>
    </Shell>
  );
}

// 15. Tenant settings
function TN_Settings({ theme: th }) {
  return (
    <Shell theme={th} nav={TN_NAV} active="settings" breadcrumb={['組織', '租戶設定']}>
      <PageHeader theme={th} title="租戶設定" subtitle="一般 · 通知 · 隱私 · 整合" tabs={['一般','通知','隱私','整合']} activeTab="一般" />
      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
        <Card theme={th} title="一般">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field theme={th} label="租戶代碼"><Input theme={th} value="YAMATO" mono /></Field>
            <Field theme={th} label="顯示名稱"><Input theme={th} value="大和商務集團" /></Field>
            <Field theme={th} label="統一編號"><Input theme={th} value="22099131" mono /></Field>
            <Field theme={th} label="計費聯絡人"><Input theme={th} value="王副總 · finance@yamato.tw" /></Field>
            <Field theme={th} label="預設語系"><Select theme={th} value="zh-Hant" /></Field>
            <Field theme={th} label="預設時區"><Select theme={th} value="Asia/Taipei" /></Field>
          </div>
        </Card>
        <Card theme={th} title="當期狀態">
          <DL theme={th} cols={1} items={[
            { k: '階段', v: 'production', mono: true },
            { k: '啟用模組', v: '8 / 12' },
            { k: '配額', v: '5,000 趟 / 月', mono: true },
            { k: 'webhook 簽章', v: 'sha256-hmac', mono: true },
            { k: '隱私', v: '電話遮罩 · 中介轉接' },
            { k: '同意書版本', v: 'pp_v12 · 2026-01-01', mono: true },
          ]} />
        </Card>
      </div>
    </Shell>
  );
}

Object.assign(window, {
  TN_NAV,
  TN_Home, TN_Bookings, TN_BookingDetail, TN_NewBooking,
  TN_Passengers, TN_Addresses, TN_CostCenter, TN_Rules,
  TN_Invoices, TN_Reports, TN_ApiKeys, TN_Webhooks, TN_Audit,
  TN_Users, TN_Settings,
});
