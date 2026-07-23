// mtx-operations-screens.jsx — Multi-Taxi Operations UI Design Canvas Screens
// Wave 0 Canonical Surfaces: MTX-DESIGN-001, MTX-DESIGN-002, P5-DESIGN-001, P5-DESIGN-002

// -----------------------------------------------------------------------------
// Data Fixtures (Canonical Machine & Human Vocabulary)
// -----------------------------------------------------------------------------

const FX_MTX_AUTHORIZATIONS = [
  { id: 'AUTH-2026-TP-001', code: 'MTA-TP-2026-01', operator: '台北大都會計程車', planVer: 'v2.1', status: 'approved', tone: 'success', statusZh: '已核准', areas: ['台北市', '新北市'], fareVer: 'F-2026-03', effectiveFrom: '2026-01-01 00:00', effectiveUntil: '2027-12-31 23:59', updated: '2026-07-20' },
  { id: 'AUTH-2026-NT-002', code: 'MTA-NTP-2026-04', operator: '新北海線多元車隊', planVer: 'v1.4', status: 'draft', tone: 'neutral', statusZh: '草稿', areas: ['新北市', '基隆市'], fareVer: 'F-2026-04', effectiveFrom: '2026-08-01 00:00', effectiveUntil: '2028-07-31 23:59', updated: '2026-07-22' },
  { id: 'AUTH-2026-TY-003', code: 'MTA-TYN-2026-02', operator: '桃園捷運聯營車隊', planVer: 'v1.0', status: 'suspended', tone: 'warn', statusZh: '已暫停', areas: ['桃園市'], fareVer: 'F-2026-01', effectiveFrom: '2026-03-01 00:00', effectiveUntil: '2027-02-28 23:59', updated: '2026-07-15' },
  { id: 'AUTH-2025-KC-009', code: 'MTA-KHH-2025-09', operator: '高雄港都多功能車隊', planVer: 'v1.0', status: 'expired', tone: 'danger', statusZh: '已失效', areas: ['高雄市'], fareVer: 'F-2025-11', effectiveFrom: '2025-01-01 00:00', effectiveUntil: '2026-06-30 23:59', updated: '2026-07-01' }
];

const FX_MTX_AUTHORIZED_VEHICLES = [
  { membershipId: 'VM-9012', vehicleId: 'VEH-BKR-2208', plate: 'BKR-2208', status: 'active', tone: 'success', statusZh: '生效中', effectiveFrom: '2026-01-01 00:00', effectiveUntil: '2027-12-31 23:59' },
  { membershipId: 'VM-9015', vehicleId: 'VEH-TDK-9317', plate: 'TDK-9317', status: 'active', tone: 'success', statusZh: '生效中', effectiveFrom: '2026-02-15 00:00', effectiveUntil: '2027-12-31 23:59' },
  { membershipId: 'VM-8842', vehicleId: 'VEH-AKQ-5566', plate: 'AKQ-5566', status: 'suspended', tone: 'warn', statusZh: '已暫停', effectiveFrom: '2026-01-01 00:00', effectiveUntil: '2026-07-10 18:00' },
  { membershipId: 'VM-7102', vehicleId: 'VEH-RD-1102', plate: 'RD-1102', status: 'removed', tone: 'neutral', statusZh: '已移除', effectiveFrom: '2025-06-01 00:00', effectiveUntil: '2026-05-01 00:00' }
];

const FX_MTX_QUEUE_ENTRIES = [
  { driverId: 'DRV-1029', driverName: '張偉哲', plate: 'BKR-2208', profile: 'multi_taxi_direct', queueMode: 'virtual_matching', queueModeZh: '虛擬媒合', siteId: '—', area: 'TPE-CENTRAL', authId: 'AUTH-2026-TP-001', status: 'eligible', tone: 'success', statusZh: '符合派車資格', checkIn: '14:10:02', updated: '14:25:00' },
  { driverId: 'DRV-2041', driverName: '李美鳳', plate: 'TDK-9317', profile: 'multi_taxi_direct', queueMode: 'virtual_matching', queueModeZh: '虛擬媒合', siteId: '—', area: 'NTP-BANQIAO', authId: 'AUTH-2026-TP-001', status: 'eligible', tone: 'success', statusZh: '符合派車資格', checkIn: '14:15:20', updated: '14:26:10' },
  { driverId: 'DRV-8802', driverName: '陳冠霖', plate: 'AKQ-5566', profile: 'multi_taxi_direct', queueMode: 'physical_rank', queueModeZh: '實體排班', siteId: 'SITE-TPE-MAIN', area: 'TPE-MAIN', authId: 'AUTH-2026-TP-001', status: 'denied_legal', tone: 'danger', statusZh: '法定拒絕進入', checkIn: '14:18:45', updated: '14:26:15' },
  { driverId: 'DRV-9914', driverName: '林志豪', plate: 'RD-1102', profile: 'multi_taxi_direct', queueMode: 'taxi_stand', queueModeZh: '計程車招呼站', siteId: 'SITE-TS-SONGSHAN', area: 'TPE-SONGSHAN', authId: 'AUTH-2026-TP-001', status: 'denied_legal', tone: 'danger', statusZh: '法定拒絕進入', checkIn: '14:22:11', updated: '14:26:20' }
];

const FX_P5_RATINGS = [
  { id: 'RAT-80192', order: 'ZX-240720-0186', driver: '張偉哲 (DRV-1029)', score: 5, tags: '車況乾淨 · 駕駛禮貌', comment: '司機非常有禮貌，車內無異味。', status: 'active', tone: 'success', statusZh: '有效', submitted: '2026-07-20 15:10' },
  { id: 'RAT-80185', order: 'ZX-240720-0171', driver: '李美鳳 (DRV-2041)', score: 1, tags: '車速過快 · 語言不當', comment: '司機延遲抵達且態度惡劣。', status: 'under_review', tone: 'warn', statusZh: '審查中', submitted: '2026-07-20 13:45' },
  { id: 'RAT-79920', order: 'ZX-240719-0158', driver: '陳冠霖 (DRV-8802)', score: 1, tags: '不當評價', comment: '惡意攻擊留言（已查證為同行競爭騷擾）。', status: 'invalidated', tone: 'danger', statusZh: '已作廢', submitted: '2026-07-19 19:12' }
];

const FX_P5_FARE_ANOMALIES = [
  { id: 'ANOM-4012', order: 'ZX-240720-0901', pickup: '捷運市政府站', dropoff: '陽明山國家公園遊客中心', reasonCode: 'quote_out_of_range', reasonZh: '預估車資超出可接受範圍', fareVer: 'F-2026-03', estFare: 'NT$ 1,850 (異常偏高)', status: 'flagged', tone: 'danger', updated: '14:15' },
  { id: 'ANOM-4010', order: 'ZX-240720-0877', pickup: '南港展覽館 2 館', dropoff: '桃園國際機場 T2', reasonCode: 'quote_provider_unavailable', reasonZh: '暫時無法取得預估車資', fareVer: 'F-2026-03', estFare: '未取得 (Fail-Closed)', status: 'retry_pending', tone: 'warn', updated: '14:02' }
];

const FX_P5_PAYMENT_EXCEPTIONS = [
  { id: 'PAY-77012', order: 'ZX-240720-0186', amount: 'NT$ 355', status: 'captured', tone: 'success', statusZh: '已完成', pspRef: 'PSP-CHB-8812903', time: '15:07:30' },
  { id: 'PAY-77005', order: 'ZX-240720-0171', amount: 'NT$ 410', status: 'failed', tone: 'danger', statusZh: '付款失敗', pspRef: 'PSP-CHB-8812741 (Card Declined)', time: '13:20:15' },
  { id: 'PAY-76890', order: 'ZX-240719-0158', amount: 'NT$ 265', status: 'manual_recovery', tone: 'warn', statusZh: '人工處理中', pspRef: 'PSP-CHB-8811092 (Timeout)', time: '18:58:40' }
];

// -----------------------------------------------------------------------------
// 1. Operating Authorization Console Components (MTX-DESIGN-001)
// -----------------------------------------------------------------------------

function PA_MTX_AuthRegistry({ theme: th }) {
  return (
    <Shell theme={th} nav={PA_NAV} active="mtx-authorizations" breadcrumb={['多元計程車管理', '營運許可註冊簿']}
      env="production" actor={PSB_ACTOR} health={PA_HEALTH} refreshTier="medium_slow" dataFreshness="fresh">
      <PageHeader theme={th} title="多元計程車營運許可註冊簿" subtitle="MTX-AUTH-UI-01 · 依核准許可證號與營運區域查詢核准狀態及生效期間"
        actions={<Btn theme={th} variant="primary" icon="plus">新增許可草稿</Btn>} />
      <div style={{ padding: 24 }}>
        <div style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center', background: th.surfaceLo, padding: 12, borderRadius: 8, border: '1px solid ' + th.border }}>
          <Select theme={th} value="業者：全部" />
          <Select theme={th} value="狀態：全部" />
          <Select theme={th} value="營運區域：全部" />
          <Input theme={th} placeholder="搜尋許可代碼 / 營業計畫版本..." style={{ width: 260 }} />
          <Pill theme={th} tone="info">共 4 筆許可</Pill>
        </div>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: '許可代碼', k: 'code', w: 160, mono: true, r: r => <span style={{ color: th.accent, fontWeight: 700 }}>{r.code}</span> },
            { h: '業者名稱', k: 'operator', w: 180 },
            { h: '計畫版本', k: 'planVer', w: 90, mono: true },
            { h: '狀態', w: 100, r: r => <Pill theme={th} tone={r.tone} dot>{r.statusZh}</Pill> },
            { h: '營運區域', w: 150, r: r => r.areas.map(a => <Pill key={a} theme={th} tone="neutral">{a}</Pill>) },
            { h: '生效費率', k: 'fareVer', w: 100, mono: true },
            { h: '有效期間', w: 220, mono: true, r: r => <span style={{ fontSize: 11.5 }}>{r.effectiveFrom} ~ {r.effectiveUntil}</span> },
            { h: '', w: 100, r: () => <Btn theme={th} size="xs" variant="ghost" icon="eye">詳情</Btn> }
          ]} rows={FX_MTX_AUTHORIZATIONS} />
        </Card>
      </div>
    </Shell>
  );
}

function PA_MTX_AuthDetail({ theme: th }) {
  const auth = FX_MTX_AUTHORIZATIONS[0];
  return (
    <Shell theme={th} nav={PA_NAV} active="mtx-authorizations" breadcrumb={['多元計程車管理', '營運許可詳情']}
      env="production" actor={PSB_ACTOR} health={PA_HEALTH} refreshTier="medium_slow" dataFreshness="fresh">
      <PageHeader theme={th} title={`營運許可詳情 · ${auth.code}`} subtitle="MTX-AUTH-UI-02 · 讀取單一許可之法定規範、車輛名單與生效費率綁定"
        actions={<><Btn theme={th} variant="secondary">編輯車輛名單</Btn><Btn theme={th} variant="warn">暫停許可</Btn></>} />
      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card theme={th} title="許可核心屬性" subtitle="系統唯一識別碼: AUTH-2026-TP-001">
            <DL theme={th} cols={2} items={[
              { k: '許可代碼', v: auth.code, mono: true },
              { k: '業者名稱', v: auth.operator },
              { k: '營業計畫版本', v: auth.planVer, mono: true },
              { k: '許可狀態', v: <Pill theme={th} tone={auth.tone} dot>{auth.statusZh}</Pill> },
              { k: '生效時間', v: auth.effectiveFrom, mono: true },
              { k: '失效時間', v: auth.effectiveUntil, mono: true },
              { k: '綁定費率版本', v: <span style={{ color: th.accent, fontFamily: SHELL_MONO, fontWeight: 700 }}>{auth.fareVer} (已生效)</span> },
              { k: '核准營運區域', v: auth.areas.join('、') }
            ]} />
          </Card>
          <Card theme={th} title="核准車輛清單摘要" subtitle="已有 2 輛車完成登記並生效">
            <Table theme={th} columns={[
              { h: '車牌', k: 'plate', w: 110, mono: true },
              { h: '名單狀態', w: 100, r: r => <Pill theme={th} tone={r.tone} dot>{r.statusZh}</Pill> },
              { h: '生效時間', k: 'effectiveFrom', w: 150, mono: true }
            ]} rows={FX_MTX_AUTHORIZED_VEHICLES.slice(0, 2)} />
          </Card>
        </div>
        <Card theme={th} title="合規與稽核紀錄" subtitle="權限與生命週期歷程">
          <Banner theme={th} tone="success" icon="check" body="目前許可處於 active/approved 狀態。所有屬於此許可之車輛均具備 multi_taxi_direct 派車資格。" />
          <div style={{ marginTop: 12 }}>
            <DL theme={th} cols={1} items={[
              { k: '建置時間', v: '2025-12-28 10:00:00 (UTC+8)', mono: true },
              { k: '核准人員', v: '張副局長 (交通局審驗小組)' },
              { k: '最後異動', v: '2026-07-20 14:30:00 · 修改生效費率為 F-2026-03', mono: true }
            ]} />
          </div>
        </Card>
      </div>
    </Shell>
  );
}

function PA_MTX_AuthDraftEditor({ theme: th }) {
  return (
    <Shell theme={th} nav={PA_NAV} active="mtx-authorizations" breadcrumb={['多元計程車管理', '建立許可草稿']}
      env="production" actor={PSB_ACTOR} health={PA_HEALTH} refreshTier="manual" dataFreshness="fresh">
      <PageHeader theme={th} title="建立營運許可草稿" subtitle="MTX-AUTH-UI-03 · 填寫業者、營業計畫版本、營運區域與生效時間 (儲存為草稿後方可送審啟用)"
        actions={<><Btn theme={th} variant="secondary">取消</Btn><Btn theme={th} variant="primary" icon="save">儲存草稿</Btn></>} />
      <div style={{ padding: 24, maxWidth: 860 }}>
        <Card theme={th} title="許可草稿欄位填寫">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Field theme={th} label="許可代碼" required hint="請輸入官方交通局核准代碼"><Input theme={th} value="MTA-NTP-2026-05" mono /></Field>
            <Field theme={th} label="業者 ID / 名稱" required><Input theme={th} value="新北海線多元車隊" /></Field>
            <Field theme={th} label="營業計畫版本" required><Input theme={th} value="v1.5" mono /></Field>
            <Field theme={th} label="綁定生效費率版本" required><Select theme={th} value="F-2026-04 (2026 Q4 調整版 · 已備查)" /></Field>
            <Field theme={th} label="生效時間 (Effective From)" required><Input theme={th} value="2026-09-01 00:00:00 (Asia/Taipei)" mono /></Field>
            <Field theme={th} label="失效時間 (Effective Until)"><Input theme={th} value="2028-08-31 23:59:59 (Asia/Taipei)" mono /></Field>
          </div>
          <div style={{ marginTop: 16 }}>
            <Field theme={th} label="核准營運區域 (複選)" required>
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <Pill theme={th} tone="info">新北市 (已選擇)</Pill>
                <Pill theme={th} tone="info">基隆市 (已選擇)</Pill>
                <Btn theme={th} size="xs" variant="ghost" icon="plus">增加區域</Btn>
              </div>
            </Field>
          </div>
          <div style={{ marginTop: 20 }}>
            <Banner theme={th} tone="neutral" icon="info" body="提示：草稿儲存後不會立即對派車引擎生效。須由具備 multi_taxi_authorization:activate 權限之人員執行正式啟用。" />
          </div>
        </Card>
      </div>
    </Shell>
  );
}

function PA_MTX_AuthLifecycleConfirm({ theme: th }) {
  return (
    <Shell theme={th} nav={PA_NAV} active="mtx-authorizations" breadcrumb={['多元計程車管理', '啟用許可確認']}
      env="production" actor={PSB_ACTOR} health={PA_HEALTH} refreshTier="manual" dataFreshness="fresh">
      <PageHeader theme={th} title="確認啟用營運許可" subtitle="MTX-AUTH-UI-04 · 正式將營運許可由 draft/suspended 轉為 approved/active" />
      <div style={{ padding: 24, maxWidth: 680, margin: '0 auto' }}>
        <Card theme={th} title="啟用許可對象確認" subtitle="MTA-NTP-2026-04 · 新北海線多元車隊">
          <DL theme={th} cols={1} items={[
            { k: '許可代碼', v: 'MTA-NTP-2026-04', mono: true },
            { k: '營業計畫', v: 'v1.4' },
            { k: '生效費率', v: 'F-2026-04 (2026 Q4 調整版)' },
            { k: '核准區域', v: '新北市、基隆市' },
            { k: '預計生效時間', v: '2026-08-01 00:00 (Asia/Taipei)', mono: true }
          ]} />
          <div style={{ marginTop: 16 }}>
            <Banner theme={th} tone="warn" icon="alert" body="警告：啟用後，屬於該許可之授權車輛將於生效時間到達時解除派車阻擋，並套用指定之費率版本。" />
          </div>
          <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <Btn theme={th} variant="secondary">取消返回</Btn>
            <Btn theme={th} variant="primary" icon="check">確認啟用許可</Btn>
          </div>
        </Card>
      </div>
    </Shell>
  );
}

function PA_MTX_AuthVehicles({ theme: th }) {
  return (
    <Shell theme={th} nav={PA_NAV} active="mtx-authorizations" breadcrumb={['多元計程車管理', '授權車輛名單']}
      env="production" actor={PSB_ACTOR} health={PA_HEALTH} refreshTier="medium_slow" dataFreshness="fresh">
      <PageHeader theme={th} title="授權車輛名單維護" subtitle="MTX-AUTH-UI-05 · MTA-TP-2026-01 · 台北大都會計程車"
        actions={<Btn theme={th} variant="primary" icon="plus">新增車輛至名單</Btn>} />
      <div style={{ padding: 24 }}>
        <div style={{ marginBottom: 16, display: 'flex', gap: 12 }}>
          <Input theme={th} placeholder="搜尋車牌 (例如 BKR-2208)..." style={{ width: 280 }} />
          <Select theme={th} value="名單狀態：全部" />
        </div>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: '紀錄 ID', k: 'membershipId', w: 120, mono: true },
            { h: '車輛 ID', k: 'vehicleId', w: 150, mono: true },
            { h: '車牌號碼', k: 'plate', w: 120, mono: true, r: r => <span style={{ color: th.accent, fontWeight: 700 }}>{r.plate}</span> },
            { h: '名單狀態', w: 110, r: r => <Pill theme={th} tone={r.tone} dot>{r.statusZh}</Pill> },
            { h: '生效時間', k: 'effectiveFrom', w: 150, mono: true },
            { h: '失效時間', k: 'effectiveUntil', w: 150, mono: true },
            { h: '', w: 100, r: r => r.status === 'active' ? <Btn theme={th} size="xs" variant="danger">移除</Btn> : <Btn theme={th} size="xs" variant="ghost">歷史</Btn> }
          ]} rows={FX_MTX_AUTHORIZED_VEHICLES} />
        </Card>
      </div>
    </Shell>
  );
}

function PA_MTX_AuthConflictState({ theme: th }) {
  return (
    <Shell theme={th} nav={PA_NAV} active="mtx-authorizations" breadcrumb={['多元計程車管理', '異常與權限警告']}
      env="production" actor={PSB_ACTOR} health={PA_HEALTH} refreshTier="manual" dataFreshness="fresh">
      <PageHeader theme={th} title="許可更新衝突 / 權限不足" subtitle="MTX-AUTH-UI-06 · 處理無寫入權限、版本的併發衝突與伺服器 Fail-Closed 狀態" />
      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Card theme={th} title="權限不足 (Permission Denied)" subtitle="HTTP 403 · Capability Missing">
          <Banner theme={th} tone="danger" icon="lock" body="操作失敗：您的帳號缺少 `multi_taxi_authorization:activate` 權限。無法將許可狀態變更為 active。" />
          <div style={{ marginTop: 12 }}>
            <DL theme={th} cols={1} items={[
              { k: '所需權限', v: 'multi_taxi_authorization:activate', mono: true },
              { k: '當前角色', v: 'Platform Compliance Viewer (僅讀取)' },
              { k: '建議作法', v: '請聯繫平台管理員提升權限，或交由授權核准員執行。' }
            ]} />
          </div>
        </Card>
        <Card theme={th} title="版本過期 / 併發衝突 (Stale Version)" subtitle="HTTP 409 · Version Conflict">
          <Banner theme={th} tone="warn" icon="alert" body="儲存失敗：此許可資料已在另一工作階段被更新 (最新版本: v3，您的版本: v2)。" />
          <div style={{ marginTop: 12 }}>
            <DL theme={th} cols={1} items={[
              { k: '最新異動人', v: '張副局長 · 14:22:05' },
              { k: '處理方式', v: '請重新載入最新資料後再行嘗試編輯，系統未覆蓋任何既有設定。' }
            ]} />
            <div style={{ marginTop: 14 }}>
              <Btn theme={th} variant="primary" icon="refresh">重新載入最新許可資料</Btn>
            </div>
          </div>
        </Card>
      </div>
    </Shell>
  );
}

// -----------------------------------------------------------------------------
// 2. Queue Semantics Operations Components (MTX-DESIGN-002)
// -----------------------------------------------------------------------------

function OPS_MTX_QueueOverview({ theme: th }) {
  return (
    <Shell theme={th} nav={OPS_NAV} active="dispatch-queue" breadcrumb={['派車營運', '佇列語意監控']}
      env="production" actor={OPS_ACTOR} health={OPS_HEALTH} refreshTier="fast" dataFreshness="fresh">
      <PageHeader theme={th} title="派車佇列語意與資格監控" subtitle="MTX-QUEUE-UI-01 · 顯式標示 virtual_matching, physical_rank, taxi_stand 佇列模式"
        meta={<Pill theme={th} tone="warn">2 筆法定拒絕佇列</Pill>} />
      <div style={{ padding: 24 }}>
        <div style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
          <Select theme={th} value="佇列模式：全部 (3 種)" />
          <Select theme={th} value="運作 profile：multi_taxi_direct" />
          <Select theme={th} value="資格狀態：全部" />
          <Input theme={th} placeholder="搜尋駕駛或車牌..." style={{ width: 240 }} />
        </div>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: '駕駛', k: 'driverName', w: 110, r: r => <div><b>{r.driverName}</b><br/><span style={{ fontSize: 10, fontFamily: SHELL_MONO, color: th.textMuted }}>{r.driverId}</span></div> },
            { h: '車牌', k: 'plate', w: 100, mono: true, r: r => <span style={{ color: th.accent, fontWeight: 700 }}>{r.plate}</span> },
            { h: '佇列模式 (Queue Mode)', w: 140, r: r => <Pill theme={th} tone={r.queueMode === 'virtual_matching' ? 'info' : 'danger'}>{r.queueModeZh}</Pill> },
            { h: '場站/站位 (Site)', k: 'siteId', w: 130, mono: true },
            { h: '資格判定', w: 140, r: r => <Pill theme={th} tone={r.tone} dot>{r.statusZh}</Pill> },
            { h: '簽到時間', k: 'checkIn', w: 90, mono: true },
            { h: '', w: 100, r: () => <Btn theme={th} size="xs" variant="ghost">檢視細節</Btn> }
          ]} rows={FX_MTX_QUEUE_ENTRIES} />
        </Card>
      </div>
    </Shell>
  );
}

function OPS_MTX_QueueEntryDetail({ theme: th }) {
  const entry = FX_MTX_QUEUE_ENTRIES[0];
  return (
    <Shell theme={th} nav={OPS_NAV} active="dispatch-queue" breadcrumb={['派車營運', '佇列條目詳情']}
      env="production" actor={OPS_ACTOR} health={OPS_HEALTH} refreshTier="fast" dataFreshness="fresh">
      <PageHeader theme={th} title={`佇列條目詳情 · ${entry.driverName} (${entry.plate})`} subtitle="MTX-QUEUE-UI-02 · 說明車輛運作 Profile、許可證號與佇列合規判定" />
      <div style={{ padding: 24, maxWidth: 800 }}>
        <Card theme={th} title="佇列資格檢視">
          <DL theme={th} cols={2} items={[
            { k: '駕駛 ID', v: entry.driverId, mono: true },
            { k: '車牌號碼', v: entry.plate, mono: true },
            { k: '運作 Profile', v: <Pill theme={th} tone="info">{entry.profile}</Pill> },
            { k: '佇列模式', v: <Pill theme={th} tone="info">{entry.queueModeZh} ({entry.queueMode})</Pill> },
            { k: '綁定營運許可', v: entry.authId, mono: true },
            { k: '派車合規結論', v: <Pill theme={th} tone={entry.tone} dot>{entry.statusZh}</Pill> }
          ]} />
          <div style={{ marginTop: 16 }}>
            <Banner theme={th} tone="success" icon="check" body="合規說明：多元計程車 (multi_taxi_direct) 在虛擬媒合 (virtual_matching) 模式下，具備有效許可與車輛授權即可接收派車。" />
          </div>
        </Card>
      </div>
    </Shell>
  );
}

function OPS_MTX_LegalDenialState({ theme: th }) {
  const deniedEntry = FX_MTX_QUEUE_ENTRIES[2];
  return (
    <Shell theme={th} nav={OPS_NAV} active="dispatch-queue" breadcrumb={['派車營運', '法定拒絕進入警告']}
      env="production" actor={OPS_ACTOR} health={OPS_HEALTH} refreshTier="fast" dataFreshness="fresh">
      <PageHeader theme={th} title="多元計程車實體排班 · 法定拒絕進入" subtitle="MTX-QUEUE-UI-03 · 依公路法及多元計程車管理辦法，嚴禁實體排班與招呼站候客 (不可人工 Overrule)" />
      <div style={{ padding: 24, maxWidth: 750, margin: '0 auto' }}>
        <Card theme={th} title="法定拒絕進入警告 (Non-Bypassable Legal Denial)" style={{ borderColor: th.danger }}>
          <Banner theme={th} tone="danger" icon="alert" body="此車輛屬多元化計程車服務，不得進入實體排班候客。" />
          <div style={{ marginTop: 16 }}>
            <DL theme={th} cols={2} items={[
              { k: '違規試圖車牌', v: deniedEntry.plate, mono: true },
              { k: '駕駛人員', v: `${deniedEntry.driverName} (${deniedEntry.driverId})` },
              { k: '試圖進入佇列', v: <Pill theme={th} tone="danger">{deniedEntry.queueModeZh} ({deniedEntry.queueMode})</Pill> },
              { k: '場站地點', v: deniedEntry.siteId, mono: true },
              { k: '拒絕原因碼', v: 'ERR_MTX_PHYSICAL_RANK_FORBIDDEN', mono: true },
              { k: '系統處置', v: '已自動拒絕並記錄於營運合規日誌' }
            ]} />
          </div>
          <div style={{ marginTop: 20, background: th.surfaceLo, padding: 12, borderRadius: 8, border: '1px solid ' + th.border }}>
            <span style={{ fontSize: 12, color: th.textMuted }}>
              注意：營運主控台<b>無權限</b>覆蓋 (Override) 此項法定限制。請引導駕駛離開實體排班區，並切換至平台虛擬媒合系統候客。
            </span>
          </div>
          <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <Btn theme={th} variant="secondary">檢視合規日誌</Btn>
            <Btn theme={th} variant="primary">引導返回虛擬媒合</Btn>
          </div>
        </Card>
      </div>
    </Shell>
  );
}

// -----------------------------------------------------------------------------
// 3. Rating Governance Components (P5-DESIGN-001)
// -----------------------------------------------------------------------------

function PA_P5_RatingQueue({ theme: th }) {
  return (
    <Shell theme={th} nav={PA_NAV} active="p5-ratings" breadcrumb={['平台治理', '評價審查佇列']}
      env="production" actor={PSB_ACTOR} health={PA_HEALTH} refreshTier="medium_slow" dataFreshness="fresh">
      <PageHeader theme={th} title="乘客評價治理與審查佇列" subtitle="P5-RATE-UI-01 · 檢視、過濾與處置不當或申訴評價 (維護駕駛與乘客真實權益)"
        actions={<Btn theme={th} variant="secondary" icon="download">匯出評價報告</Btn>} />
      <div style={{ padding: 24 }}>
        <div style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
          <Select theme={th} value="評價狀態：全部" />
          <Select theme={th} value="星級：1 星 - 2 星" />
          <Input theme={th} placeholder="搜尋訂單 ID / 駕駛..." style={{ width: 240 }} />
        </div>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: '評價 ID', k: 'id', w: 110, mono: true },
            { h: '關聯訂單', k: 'order', w: 140, mono: true, r: r => <span style={{ color: th.accent, fontWeight: 600 }}>{r.order}</span> },
            { h: '駕駛', k: 'driver', w: 160 },
            { h: '給予星級', w: 90, mono: true, r: r => <span style={{ color: r.score <= 2 ? th.danger : th.accent, fontWeight: 700 }}>★ {r.score}</span> },
            { h: '標籤摘要', k: 'tags', w: 150 },
            { h: '評價內容', k: 'comment', w: 220 },
            { h: '審核狀態', w: 100, r: r => <Pill theme={th} tone={r.tone} dot>{r.statusZh}</Pill> },
            { h: '', w: 90, r: () => <Btn theme={th} size="xs" variant="ghost">審查</Btn> }
          ]} rows={FX_P5_RATINGS} />
        </Card>
      </div>
    </Shell>
  );
}

function PA_P5_RatingDetail({ theme: th }) {
  const rating = FX_P5_RATINGS[1];
  return (
    <Shell theme={th} nav={PA_NAV} active="p5-ratings" breadcrumb={['平台治理', '評價審查詳情']}
      env="production" actor={PSB_ACTOR} health={PA_HEALTH} refreshTier="manual" dataFreshness="fresh">
      <PageHeader theme={th} title={`評價審查細節 · ${rating.id}`} subtitle="P5-RATE-UI-02 · 查驗乘客反饋與行程軌跡，執行評價作廢或維持有效"
        actions={<><Btn theme={th} variant="secondary">維持有效</Btn><Btn theme={th} variant="danger" icon="x">作廢此評價</Btn></>} />
      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16, alignItems: 'start' }}>
        <Card theme={th} title="評價提交細節">
          <DL theme={th} cols={2} items={[
            { k: '評價識別碼', v: rating.id, mono: true },
            { k: '評分星級', v: `★ ${rating.score} 分` },
            { k: '對應行程', v: rating.order, mono: true },
            { k: '被評價駕駛', v: rating.driver },
            { k: '評價標籤', v: rating.tags },
            { k: '提交時間', v: rating.submitted, mono: true }
          ]} />
          <div style={{ marginTop: 16, padding: 12, background: th.surfaceLo, borderRadius: 8, border: '1px solid ' + th.border }}>
            <div style={{ fontSize: 11, color: th.textMuted, marginBottom: 4 }}>評價內文:</div>
            <div style={{ fontSize: 13, color: th.text }}>{rating.comment}</div>
          </div>
        </Card>
        <Card theme={th} title="審查原則說明">
          <Banner theme={th} tone="info" icon="info" body="作廢規則：僅當評價包含公然侮辱、洗版騷擾、或查證屬同業不當競爭時，方可作廢。作廢後系統將自動重新計算駕駛平均星級。" />
          <div style={{ marginTop: 16 }}>
            <Field theme={th} label="作廢理由 (必填)" required>
              <Select theme={th} value="不當言詞 / 無關行程之惡意評價" />
            </Field>
          </div>
        </Card>
      </div>
    </Shell>
  );
}

function PA_P5_DriverRatingAuthority({ theme: th }) {
  return (
    <Shell theme={th} nav={PA_NAV} active="p5-ratings" breadcrumb={['平台治理', '駕駛星級權威狀態']}
      env="production" actor={PSB_ACTOR} health={PA_HEALTH} refreshTier="medium_slow" dataFreshness="fresh">
      <PageHeader theme={th} title="駕駛星級權威狀態展示" subtitle="P5-RATE-UI-03 · 呈現 rated, new_driver, unavailable 三大服務端權威狀態 (禁止前端造假或人工修改平均值)" />
      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
        <Card theme={th} title="1. 已有評價 (Rated)">
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ fontSize: 32, fontWeight: 800, color: th.accent }}>★ 4.9</div>
            <div style={{ fontSize: 12, color: th.textMuted, marginTop: 4 }}>依據 128 則有效評價</div>
            <div style={{ marginTop: 12 }}><Pill theme={th} tone="success">權威狀態: rated</Pill></div>
          </div>
        </Card>
        <Card theme={th} title="2. 新加入駕駛 (New Driver)">
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: th.text }}>新加入駕駛</div>
            <div style={{ fontSize: 12, color: th.textMuted, marginTop: 4 }}>尚未累積滿 5 則評價</div>
            <div style={{ marginTop: 12 }}><Pill theme={th} tone="info">權威狀態: new_driver</Pill></div>
          </div>
        </Card>
        <Card theme={th} title="3. 資料暫時無法使用 (Unavailable)">
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ fontSize: 20, fontWeight: 600, color: th.danger }}>評價資料目前無法使用</div>
            <div style={{ fontSize: 12, color: th.textMuted, marginTop: 4 }}>服務端運算中或暫時中斷</div>
            <div style={{ marginTop: 12 }}><Pill theme={th} tone="danger">權威狀態: unavailable</Pill></div>
          </div>
        </Card>
      </div>
    </Shell>
  );
}

// -----------------------------------------------------------------------------
// 4. Fare, Payment, Receipt, & Retention Operations (P5-DESIGN-002)
// -----------------------------------------------------------------------------

function PA_P5_FareAnomalyQueue({ theme: th }) {
  return (
    <Shell theme={th} nav={PA_NAV} active="p5-fares" breadcrumb={['商務與結算', '車資異常佇列']}
      env="production" actor={PSB_ACTOR} health={PA_HEALTH} refreshTier="fast" dataFreshness="fresh">
      <PageHeader theme={th} title="車資估算異常佇列 (Fail-Closed)" subtitle="P5-COM-UI-01 · 監控預估車資異常、路線無法解析或費率缺失之訂單"
        meta={<Pill theme={th} tone="danger">2 筆待處理異常</Pill>} />
      <div style={{ padding: 24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: '異常 ID', k: 'id', w: 110, mono: true },
            { h: '訂單參考', k: 'order', w: 140, mono: true, r: r => <span style={{ color: th.accent, fontWeight: 600 }}>{r.order}</span> },
            { h: '上車點', k: 'pickup', w: 160 },
            { h: '下車點', k: 'dropoff', w: 180 },
            { h: '異常原因', k: 'reasonZh', w: 180, r: r => <span style={{ color: th.danger, fontWeight: 600 }}>{r.reasonZh}</span> },
            { h: '費率版本', k: 'fareVer', w: 100, mono: true },
            { h: '預估結果', k: 'estFare', w: 150 },
            { h: '', w: 90, r: () => <Btn theme={th} size="xs" variant="ghost">排查</Btn> }
          ]} rows={FX_P5_FARE_ANOMALIES} />
        </Card>
      </div>
    </Shell>
  );
}

function PA_P5_PaymentExceptionDetail({ theme: th }) {
  const pay = FX_P5_PAYMENT_EXCEPTIONS[1];
  return (
    <Shell theme={th} nav={PA_NAV} active="p5-fares" breadcrumb={['商務與結算', '付款異常詳情']}
      env="production" actor={PSB_ACTOR} health={PA_HEALTH} refreshTier="manual" dataFreshness="fresh">
      <PageHeader theme={th} title={`付款例外處理 · ${pay.id}`} subtitle="P5-COM-UI-02 · 檢視支付失敗、人工處置中或退款例外"
        actions={<Btn theme={th} variant="warn">發起人工追扣/處理</Btn>} />
      <div style={{ padding: 24, maxWidth: 750, margin: '0 auto' }}>
        <Card theme={th} title="支付交易明細">
          <DL theme={th} cols={2} items={[
            { k: '支付紀錄 ID', v: pay.id, mono: true },
            { k: '關聯訂單', v: pay.order, mono: true },
            { k: '應付金額', v: pay.amount, mono: true },
            { k: '金流狀態', v: <Pill theme={th} tone={pay.tone} dot>{pay.statusZh}</Pill> },
            { k: 'PSP 金流參考號', v: pay.pspRef, mono: true },
            { k: '最後嘗試時間', v: pay.time, mono: true }
          ]} />
          <div style={{ marginTop: 16 }}>
            <Banner theme={th} tone="danger" icon="alert" body="金流失敗說明：授權嘗試遭到發卡行拒絕 (Card Declined)。系統絕不遮蔽失敗狀態假裝成功。" />
          </div>
        </Card>
      </div>
    </Shell>
  );
}

function PA_P5_CertificateSupport({ theme: th }) {
  return (
    <Shell theme={th} nav={PA_NAV} active="p5-records" breadcrumb={['商務與結算', '乘車證明查詢與支援']}
      env="production" actor={PSB_ACTOR} health={PA_HEALTH} refreshTier="manual" dataFreshness="fresh">
      <PageHeader theme={th} title="電子乘車證明查詢與支援" subtitle="P5-COM-UI-03 · 協助乘客重新定位與下載已開立之電子乘車證明 (PDF/HTML)" />
      <div style={{ padding: 24, maxWidth: 780, margin: '0 auto' }}>
        <Card theme={th} title="搜尋乘車證明">
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <Input theme={th} placeholder="輸入行程/訂單編號 (例如 ZX-240720-0186)..." style={{ width: 320 }} />
            <Btn theme={th} variant="primary" icon="search">查詢證書</Btn>
          </div>
          <DL theme={th} cols={2} items={[
            { k: '證書編號', v: 'CERT-2026-901826', mono: true },
            { k: '行程 ID', v: 'ZX-240720-0186', mono: true },
            { k: '車牌號碼', v: 'BKR-2208', mono: true },
            { k: '實收車資', v: 'NT$ 355', mono: true },
            { k: '證書狀態', v: <Pill theme={th} tone="success">開立成功 (available)</Pill> },
            { k: '發證時間', v: '2026-07-20 15:08:12 (UTC+8)', mono: true }
          ]} />
          <div style={{ marginTop: 20, display: 'flex', gap: 12 }}>
            <Btn theme={th} variant="secondary" icon="eye">預覽證書內容</Btn>
            <Btn theme={th} variant="primary" icon="download">下載官方 PDF</Btn>
          </div>
        </Card>
      </div>
    </Shell>
  );
}

function PA_P5_RecordsQuery({ theme: th }) {
  return (
    <Shell theme={th} nav={PA_NAV} active="p5-records" breadcrumb={['平台數據', '營運紀錄查詢']}
      env="production" actor={PSB_ACTOR} health={PA_HEALTH} refreshTier="manual" dataFreshness="fresh">
      <PageHeader theme={th} title="730 天營運紀錄完整查詢" subtitle="P5-COM-UI-04 · 法定兩年行程軌跡、車資與費率版本完整留存"
        actions={<Btn theme={th} variant="primary" icon="export">發起調閱匯出</Btn>} />
      <div style={{ padding: 24 }}>
        <div style={{ marginBottom: 16, display: 'flex', gap: 12 }}>
          <Input theme={th} placeholder="訂單 ID / 車牌號碼..." style={{ width: 240 }} />
          <Select theme={th} value="日期範圍：最近 30 天" />
          <Select theme={th} value="保留狀態：正常留存中 (730天)" />
        </div>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: '訂單號', k: 'order', w: 150, mono: true, r: r => <span style={{ color: th.accent, fontWeight: 600 }}>{r.order}</span> },
            { h: '車牌', k: 'plate', w: 100, mono: true },
            { h: '預約時間', k: 'reserved', w: 110, mono: true },
            { h: '上車時間', k: 'pickup', w: 80, mono: true },
            { h: '下車時間', k: 'dropoff', w: 80, mono: true },
            { h: '車資', k: 'fare', w: 100, mono: true },
            { h: '保留截止日', k: 'retain', w: 110, mono: true },
            { h: '', w: 80, r: () => <Btn theme={th} size="xs" variant="ghost">細節</Btn> }
          ]} rows={[
            { order: 'ZX-240720-0186', plate: 'BKR-2208', reserved: '07-20 13:50', pickup: '14:32', dropoff: '15:07', fare: 'NT$ 355', retain: '2028-07-20' },
            { order: 'ZX-240720-0171', plate: 'TDK-9317', reserved: '07-20 12:10', pickup: '12:44', dropoff: '13:20', fare: 'NT$ 410', retain: '2028-07-20' }
          ]} />
        </Card>
      </div>
    </Shell>
  );
}

function PA_P5_ExportRetention({ theme: th }) {
  return (
    <Shell theme={th} nav={PA_NAV} active="p5-records" breadcrumb={['平台數據', '受控匯出與受控留存']}
      env="production" actor={PSB_ACTOR} health={PA_HEALTH} refreshTier="manual" dataFreshness="fresh">
      <PageHeader theme={th} title="受控匯出與 Legal Hold 法律保留狀態" subtitle="P5-COM-UI-05 · 審核合規調閱申請、設定法律保留 (Legal Hold) 凍結自動刪除" />
      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16 }}>
        <Card theme={th} title="受控資料匯出申請">
          <Field theme={th} label="調閱目的 (必填稽核項目)" required>
            <Input theme={th} value="交通局 2026 Q3 多元計程車營運合規定期抽查" />
          </Field>
          <div style={{ marginTop: 12 }}>
            <DL theme={th} cols={2} items={[
              { k: '預計匯出筆數', v: '1,420 筆', mono: true },
              { k: '資料敏感度', v: <Pill theme={th} tone="warn">包含駕駛與行程軌跡 (受控)</Pill> },
              { k: '申請人', v: '駱專員 (合規稽核組)' }
            ]} />
          </div>
          <div style={{ marginTop: 16 }}>
            <Btn theme={th} variant="primary" icon="download">建立受控匯出工作</Btn>
          </div>
        </Card>
        <Card theme={th} title="法律保留狀態 (Legal Hold)">
          <Banner theme={th} tone="warn" icon="lock" body="Legal Hold 處於生效狀態時，即使滿 730 天保留期限，系統亦不得執行實體purge銷毀。" />
          <div style={{ marginTop: 12 }}>
            <DL theme={th} cols={1} items={[
              { k: '目前案件', v: 'CASE-2026-COURT-009 (台北地方法院文號)' },
              { k: '凍結目標範圍', v: '車牌 BKR-2208 於 2026-07-01 ~ 2026-07-20 之全部紀錄' },
              { k: '保留狀態', v: <Pill theme={th} tone="danger" dot>held (法律凍結中)</Pill> }
            ]} />
          </div>
        </Card>
      </div>
    </Shell>
  );
}

// -----------------------------------------------------------------------------
// Global Registration for Design Canvas Workbench
// -----------------------------------------------------------------------------

Object.assign(window, {
  FX_MTX_AUTHORIZATIONS,
  FX_MTX_AUTHORIZED_VEHICLES,
  FX_MTX_QUEUE_ENTRIES,
  FX_P5_RATINGS,
  FX_P5_FARE_ANOMALIES,
  FX_P5_PAYMENT_EXCEPTIONS,
  PA_MTX_AuthRegistry,
  PA_MTX_AuthDetail,
  PA_MTX_AuthDraftEditor,
  PA_MTX_AuthLifecycleConfirm,
  PA_MTX_AuthVehicles,
  PA_MTX_AuthConflictState,
  OPS_MTX_QueueOverview,
  OPS_MTX_QueueEntryDetail,
  OPS_MTX_LegalDenialState,
  PA_P5_RatingQueue,
  PA_P5_RatingDetail,
  PA_P5_DriverRatingAuthority,
  PA_P5_FareAnomalyQueue,
  PA_P5_PaymentExceptionDetail,
  PA_P5_CertificateSupport,
  PA_P5_RecordsQuery,
  PA_P5_ExportRetention
});
