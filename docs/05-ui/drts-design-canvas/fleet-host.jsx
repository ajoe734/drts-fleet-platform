// fleet-host.jsx — Fleet Partner Portal: 車主 Host 自車受限唯讀入口 canvas
// Closes N03 / C012 (SR-HOST-FE-001-CANVAS). Unblocks parent implementation
// task SR-HOST-FE-001. Depends on SR-FLEET-CASE-001-CANVAS (serialized on the
// shared `fleet-cases-canvas` resource) — does not modify fleet-screens.jsx or
// fleet-cases.jsx (out of write scope). Reuses mgmt shell/primitives/auth only.
//
// Ground truth: packages/contracts/src/system-remediation.ts (HostVehicle*
// interfaces, SYSTEM_REMEDIATION_ERROR_CODES Family 3) and
// docs/04-uat/system-remediation-20260906/feature-contracts.md §4. Typed client
// methods (packages/api-client/src/system-remediation.ts): listHostVehicles,
// getHostVehicleEarnings, listHostVehicleMaintenance, listHostVehicleTrips,
// listHostVehicleCases — all page/pageSize (+ earnings `month`) query only; no
// status/date-filter query param exists on the typed client, so filter/tab
// affordances below are static pre-rendered variant selectors (repo-wide
// design-canvas convention — see fleet-cases-screen-contract.md §2 Group 5),
// not a client-side filter this canvas invents.
//
// Host is a DIFFERENT actor from FLP_ACTOR (flp_admin): realm `partner`,
// `core.partners.partner_type = 'individual_owner'`, strictly read-only, no
// fleet-admin nav. See host-screen-contract.md §5 for the full token-mapping
// rationale (why this reuses the `fleet` console theme rather than inventing a
// palette or reusing the unrelated `MGMT_ACCENTS.partner` reservation).

const HOST_NAV = [
  { divider: '車主 · Host' },
  { key: 'vehicles', icon: 'vehicles', label: '自有車輛 · My Vehicles' },
];

const HOST_HEALTH = { status: 'healthy', lastCheckedAt: '9s' };
const HOST_ACTOR = { name: 'WS', display: '王淑芬 (車主)', role: 'individual_owner' };

function HostShell({ theme: th, breadcrumb, children }) {
  return (
    <Shell theme={th} nav={HOST_NAV} active="vehicles" breadcrumb={breadcrumb}
      env="production" actor={HOST_ACTOR} health={HOST_HEALTH}
      refreshTier="slow" dataFreshness="fresh">
      {children}
    </Shell>
  );
}

// ── Fixtures (Host's own restricted projection — disjoint from fleet-data.jsx,
// which is the flp_admin's fleet-wide dataset) ───────────────────────────────
const FX_HOST_VEHICLES = [
  { vehicleId: 'veh_host_001', plateNo: 'TDC-8899', vinMasked: '1HGCR2F83HA******', vehicleForm: 'sedan', licenseClass: 'multi_taxi', energyType: 'electric', currentStatus: 'active', operatingFleetName: '大都會多元車隊', contractPeriod: { startAt: '2026-01-01T00:00:00.000Z', endAt: '2026-12-31T23:59:59.000Z', status: 'active' } },
  { vehicleId: 'veh_host_002', plateNo: 'ABC-1234', vinMasked: '2T1BURHE0JC******', vehicleForm: 'mpv', licenseClass: 'rental', energyType: 'hybrid', currentStatus: 'maintenance', operatingFleetName: '新北好行車隊', contractPeriod: { startAt: '2025-06-01T00:00:00.000Z', endAt: '2026-05-31T23:59:59.000Z', status: 'active' } },
  { vehicleId: 'veh_host_003', plateNo: 'XYZ-5566', vinMasked: '3FA6P0H79GR******', vehicleForm: 'sedan', licenseClass: 'taxi', energyType: 'fuel', currentStatus: 'inactive', operatingFleetName: '大都會多元車隊', contractPeriod: null },
];
const FX_HOST_VEHICLE = FX_HOST_VEHICLES[0];
const FX_HOST_VEHICLE_PREV = FX_HOST_VEHICLES[1]; // "previous selection" for the switching/stale demo

const FX_HOST_EARNINGS = { vehicleId: 'veh_host_001', period: '2026-08', currency: 'TWD', grossRevenue: 84200, platformFee: 12630, fleetCommission: null, netEarnings: null, tripsCount: 182, operatingDays: 26, settlementStatus: 'pending_policy' };
const FX_HOST_EARNINGS_ZERO = { vehicleId: 'veh_host_003', period: '2026-08', currency: 'TWD', grossRevenue: 0, platformFee: 0, fleetCommission: null, netEarnings: null, tripsCount: 0, operatingDays: 0, settlementStatus: 'pending_policy' };

const FX_HOST_MAINTENANCE = [
  { maintenanceId: 'mnt_101', vehicleId: 'veh_host_001', type: '定期保養', description: '5000km 定保 · 機油／濾芯更換', status: 'completed', scheduledAt: '2026-07-02', completedAt: '2026-07-02', cost: 2400, notesSummary: '含冷氣濾網更換' },
  { maintenanceId: 'mnt_108', vehicleId: 'veh_host_001', type: '輪胎更換', description: '前輪兩條輪胎更換', status: 'in_progress', scheduledAt: '2026-08-15', completedAt: null, cost: null, notesSummary: null },
  { maintenanceId: 'mnt_112', vehicleId: 'veh_host_001', type: '年度檢驗', description: '車輛排氣 / 安全年度檢驗', status: 'overdue', scheduledAt: '2026-07-28', completedAt: null, cost: null, notesSummary: '逾期，影響派工資格' },
];

// areaSummary is district-only (PII redaction — see host-screen-contract.md §3);
// no passenger name/phone/street address field exists on this fixture at all.
const FX_HOST_TRIPS = [
  { tripId: 'trip_88231', vehicleId: 'veh_host_001', startedAt: '2026-08-09 08:12', completedAt: '2026-08-09 08:41', areaSummary: '信義區 → 內湖區', distanceKm: 9.4, fareAmount: 310, status: 'completed' },
  { tripId: 'trip_88240', vehicleId: 'veh_host_001', startedAt: '2026-08-09 09:55', completedAt: '2026-08-09 10:20', areaSummary: '大安區 → 南港區', distanceKm: 7.1, fareAmount: 265, status: 'completed' },
  { tripId: 'trip_88255', vehicleId: 'veh_host_001', startedAt: '2026-08-09 14:02', completedAt: null, areaSummary: '松山區 → (未完成)', distanceKm: 2.3, fareAmount: 0, status: 'cancelled' },
];

// resolutionSummary is redacted/summarized; reporter identity is never present
// on this fixture (Host never sees who filed the case, only its outcome).
const FX_HOST_CASES = [
  { caseId: 'cmp_0908', vehicleId: 'veh_host_001', category: 'vehicle_condition', status: 'closed', reportedAt: '2026-05-20', resolvedAt: '2026-05-24', resolutionSummary: '已完成車況檢修，問題排除。' },
  { caseId: 'cmp_0955', vehicleId: 'veh_host_001', category: 'service_feedback', status: 'investigating', reportedAt: '2026-08-02', resolvedAt: null, resolutionSummary: null },
];

const HOST_VEHICLE_STATUS_TONE = { active: 'success', maintenance: 'warn', inactive: 'neutral' };
const HOST_MAINT_STATUS_TONE = { scheduled: 'info', in_progress: 'warn', completed: 'success', cancelled: 'neutral', overdue: 'danger' };
const HOST_CASE_STATUS_TONE = { open: 'danger', investigating: 'warn', resolved: 'success', closed: 'neutral' };
const HOST_CASE_CATEGORY_ZH = { vehicle_condition: '車況', accident: '事故', equipment: '設備', service_feedback: '服務反饋' };

function HostMoney(n) { return n === null || n === undefined ? null : 'NT$ ' + n.toLocaleString(); }

// Pagination footer — local composition (no shared Pagination primitive exists
// anywhere in this canvas yet; every prior list screen (fleet-screens.jsx,
// ops-*.jsx) renders a full unpaginated Table). Prev/next reflect page bounds
// via `disabled`, matching Btn's existing disabled affordance.
function HostPageFooter({ theme: th, page, totalPages, totalItems }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 14px', borderTop: '1px solid ' + th.border,
      fontSize: 11.5, color: th.textMuted,
    }}>
      <span>{totalItems} 筆 · 第 {page} / {totalPages} 頁</span>
      <div style={{ display: 'flex', gap: 6 }}>
        <Btn theme={th} size="xs" variant="ghost" icon="chevL" disabled={page <= 1}>上一頁</Btn>
        <Btn theme={th} size="xs" variant="ghost" icon="chevR" disabled={page >= totalPages}>下一頁</Btn>
      </div>
    </div>
  );
}

// Loading skeleton — reuses the `pulse` keyframe already declared globally in
// Fleet Partner Portal.html's <style> (used elsewhere via RefreshTierBadge's
// animation), not a new animation primitive.
function HostSkeletonRows({ theme: th, rows = 4 }) {
  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{
          height: 34, borderRadius: 7, background: th.surfaceLo,
          animation: 'pulse 1.6s ease-in-out infinite', animationDelay: (i * 0.12) + 's',
        }} />
      ))}
    </div>
  );
}

// ── /host/vehicles — owned-vehicle list ──────────────────────────────────────
// state: 'ok' | 'loading' | 'empty' (no vehicles at all) | 'no_results' (tab/filter yields nothing)
function FLP_HostVehicles({ theme: th, state = 'ok' }) {
  return (
    <HostShell theme={th} breadcrumb={['自有車輛']}>
      <PageHeader theme={th} title="自有車輛 · My Vehicles" subtitle="僅顯示您名下車輛；VIN 遮蔽後 6 碼 · 唯讀，無新增 / 編輯入口"
        tabs={[
          { id: 'all', label: '全部', badge: state === 'empty' ? '0' : '3' },
          { id: 'active', label: '使用中', badge: '1', tone: 'accent' },
          { id: 'maintenance', label: '維修中', badge: '1', tone: 'warn' },
          { id: 'inactive', label: '停用', badge: '1' },
        ]}
        activeTab={state === 'no_results' ? 'maintenance' : 'all'}
        actions={<Btn theme={th} icon="filter">篩選</Btn>} />
      <div style={{ padding: 24 }}>
        {state === 'empty' ? (
          <Card theme={th}>
            <EmptyState theme={th} reason="no_data" messageOverride="您名下目前沒有任何車輛。車輛掛靠後將顯示在這裡，這是合法的空狀態。" />
          </Card>
        ) : state === 'no_results' ? (
          <Card theme={th}>
            <EmptyState theme={th} reason="filtered_empty" messageOverride="目前篩選條件（維修中）沒有符合的車輛，請切換其他分類。" />
          </Card>
        ) : (
          <Card theme={th} padding={0}>
            {state === 'loading' ? <HostSkeletonRows theme={th} rows={3} /> : (
              <>
                <Table theme={th} columns={[
                  { h: 'VEHICLE', w: 170, r: r => <div><div style={{ fontWeight: 600 }}>{r.plateNo}</div><div style={{ fontSize: 11, color: th.textDim, fontFamily: SHELL_MONO }}>{r.vinMasked}</div></div> },
                  { h: 'FORM', k: 'vehicleForm', w: 90 },
                  { h: 'LICENSE', k: 'licenseClass', w: 110, mono: true },
                  { h: 'ENERGY', k: 'energyType', w: 90 },
                  { h: 'STATUS', w: 110, r: r => <Pill theme={th} tone={HOST_VEHICLE_STATUS_TONE[r.currentStatus] || 'neutral'} dot>{r.currentStatus}</Pill> },
                  { h: '營運車行 · operating fleet', k: 'operatingFleetName', w: 160 },
                  { h: 'CONTRACT', w: 190, r: r => r.contractPeriod ? `${r.contractPeriod.startAt.slice(0, 10)} ~ ${r.contractPeriod.endAt.slice(0, 10)} · ${r.contractPeriod.status}` : '—' },
                  { h: '', w: 90, r: () => <Btn theme={th} size="xs" variant="ghost" icon="arrow">詳情 →</Btn> },
                ]} rows={FX_HOST_VEHICLES} />
                <HostPageFooter theme={th} page={1} totalPages={1} totalItems={FX_HOST_VEHICLES.length} />
              </>
            )}
          </Card>
        )}
      </div>
    </HostShell>
  );
}

// ── /host/vehicles/:vehicleId — per-vehicle read-only detail, tabbed ─────────
// tab: 'earnings' | 'maintenance' | 'trips' | 'cases'
// earningsVariant (tab==='earnings' only): 'pending_policy' | 'zero' | 'no_record'
// switching: true renders the stale-selection guard (previous vehicle's panels
// cleared while the newly selected vehicle's data loads) instead of tab content.
function FLP_HostVehicleDetail({ theme: th, tab = 'earnings', earningsVariant = 'pending_policy', switching = false }) {
  const v = FX_HOST_VEHICLE;
  const tabs = [
    { id: 'earnings', label: '收益 · Earnings' },
    { id: 'maintenance', label: '維保 · Maintenance' },
    { id: 'trips', label: '行程 · Trips' },
    { id: 'cases', label: '案件 · Cases' },
  ];

  return (
    <HostShell theme={th} breadcrumb={['自有車輛', v.plateNo]}>
      <PageHeader theme={th}
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>{v.plateNo}<Pill theme={th} tone={HOST_VEHICLE_STATUS_TONE[v.currentStatus]} dot>{v.currentStatus}</Pill></span>}
        subtitle={`${v.vehicleForm} · ${v.licenseClass} · ${v.energyType} · VIN ${v.vinMasked} · 唯讀檢視，無合約 / 收益修改入口`}
        tabs={tabs} activeTab={tab} />
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {switching ? (
          <>
            <Banner theme={th} tone="info" icon="refresh" title="切換車輛中"
              body={`正在載入 ${v.plateNo} 的資料；前一輛車（${FX_HOST_VEHICLE_PREV.plateNo}）的收益／維保／行程／案件已從畫面清除，不會殘留顯示成本車資料 — 見 host-screen-contract.md §4「防止舊車輛資料殘留」。`} />
            <Card theme={th} title="車輛基本資料">
              <HostSkeletonRows theme={th} rows={2} />
            </Card>
            <Card theme={th} title={tabs.find(t => t.id === tab).label}>
              <HostSkeletonRows theme={th} rows={4} />
            </Card>
          </>
        ) : (
          <>
            <Card theme={th} title="車輛基本資料 · Vehicle summary">
              <DL theme={th} cols={3} items={[
                { k: 'PLATE', v: v.plateNo, mono: true },
                { k: 'VIN (MASKED)', v: v.vinMasked, mono: true },
                { k: 'FORM', v: v.vehicleForm },
                { k: 'LICENSE CLASS', v: v.licenseClass, mono: true },
                { k: 'ENERGY', v: v.energyType },
                { k: 'STATUS', v: <Pill theme={th} tone={HOST_VEHICLE_STATUS_TONE[v.currentStatus]} dot>{v.currentStatus}</Pill> },
                { k: '營運車行 · OPERATING FLEET', v: v.operatingFleetName },
                { k: 'CONTRACT PERIOD', v: v.contractPeriod ? `${v.contractPeriod.startAt.slice(0, 10)} ~ ${v.contractPeriod.endAt.slice(0, 10)}` : '—' },
                { k: 'CONTRACT STATUS', v: v.contractPeriod ? v.contractPeriod.status : '—' },
              ]} />
            </Card>

            {tab === 'earnings' && <HostEarningsPanel theme={th} variant={earningsVariant} />}
            {tab === 'maintenance' && <HostMaintenancePanel theme={th} />}
            {tab === 'trips' && <HostTripsPanel theme={th} />}
            {tab === 'cases' && <HostCasesPanel theme={th} />}
          </>
        )}
      </div>
    </HostShell>
  );
}

function HostEarningsPanel({ theme: th, variant }) {
  if (variant === 'no_record') {
    return (
      <Card theme={th} title="收益摘要 · Earnings" subtitle="2026-07 · 依月結算">
        <Field theme={th} label="結算月份 · month" hint="切換月份重新查詢；每月各自獨立結算，不回填估計值。">
          <Select theme={th} value="2026-07" />
        </Field>
        <EmptyState theme={th} reason="no_data" compact messageOverride="尚無 2026-07 月份的收益紀錄。這是合法的空狀態（例如車輛剛掛靠），與下方「零營收」及「分潤未定」是三種不同情況，不可互相混用。" />
      </Card>
    );
  }
  const e = variant === 'zero' ? FX_HOST_EARNINGS_ZERO : FX_HOST_EARNINGS;
  return (
    <Card theme={th} title="收益摘要 · Earnings" subtitle={`${e.period} · 依月結算 · 資料源 ops.phase1_platform_earnings_ledger`}>
      <Field theme={th} label="結算月份 · month" hint="切換月份重新查詢；每月各自獨立結算，不回填估計值。">
        <Select theme={th} value={e.period} />
      </Field>
      <DL theme={th} cols={3} items={[
        { k: 'GROSS REVENUE', v: HostMoney(e.grossRevenue), mono: true },
        { k: 'PLATFORM FEE', v: HostMoney(e.platformFee), mono: true },
        { k: 'FLEET COMMISSION', v: e.fleetCommission === null ? <span style={{ color: th.textDim }}>— (pending_policy)</span> : HostMoney(e.fleetCommission), mono: true },
        { k: 'NET EARNINGS', v: e.netEarnings === null ? <span style={{ color: th.textDim }}>— (pending_policy)</span> : HostMoney(e.netEarnings), mono: true },
        { k: 'TRIPS COUNT', v: e.tripsCount, mono: true },
        { k: 'OPERATING DAYS', v: e.operatingDays, mono: true },
        { k: 'SETTLEMENT STATUS', v: <Pill theme={th} tone={e.settlementStatus === 'calculated' ? 'success' : 'warn'} dot>{e.settlementStatus}</Pill> },
      ]} />
      {e.settlementStatus === 'pending_policy' && variant !== 'zero' && (
        <div style={{ marginTop: 12 }}>
          <Banner theme={th} tone="warn" icon="info" title="分潤比例尚未確定 · pending_policy"
            body="平台服務費已計入；惟車行分潤與車主淨收益的拆分比例尚未核定，系統不以假設公式推算或顯示為 0，待 SR-HOST-BE-001 分潤政策確定後才會顯示金額。" />
        </div>
      )}
      {variant === 'zero' && (
        <div style={{ marginTop: 12 }}>
          <Banner theme={th} tone="info" icon="check" title="本月零營收 · 合法的零值"
            body="本車本月尚無完成訂單，總車資與趟次皆為 0，這是真實結算結果，不是讀取失敗或無資料 — 與上方「尚無收益紀錄」是不同狀態。" />
        </div>
      )}
    </Card>
  );
}

function HostMaintenancePanel({ theme: th }) {
  return (
    <Card theme={th} title="維保紀錄 · Maintenance" subtitle="資料源 ops.phase1_maintenance_logs · 狀態對齊 MAINTENANCE_STATUSES" padding={0}>
      <Table theme={th} columns={[
        { h: 'TYPE', k: 'type', w: 110 },
        { h: 'DESCRIPTION', k: 'description', w: 220 },
        { h: 'STATUS', w: 110, r: r => <Pill theme={th} tone={HOST_MAINT_STATUS_TONE[r.status] || 'neutral'} dot>{r.status}</Pill> },
        { h: 'SCHEDULED', k: 'scheduledAt', w: 110, mono: true, r: r => r.scheduledAt || '—' },
        { h: 'COMPLETED', k: 'completedAt', w: 110, mono: true, r: r => r.completedAt || '—' },
        { h: 'COST', w: 100, mono: true, align: 'right', r: r => r.cost === null ? '—' : HostMoney(r.cost) },
        { h: 'NOTES', k: 'notesSummary', w: 180, r: r => r.notesSummary || '—' },
      ]} rows={FX_HOST_MAINTENANCE} />
    </Card>
  );
}

function HostTripsPanel({ theme: th }) {
  return (
    <Card theme={th} title="行程 · Trips (去識別化)" subtitle="僅顯示概括行政區與金額，絕不含乘客姓名 / 電話 / 門牌地址"
      actions={<Btn theme={th} size="xs" icon="filter">期別</Btn>} padding={0}>
      <Table theme={th} columns={[
        { h: 'TRIP', k: 'tripId', w: 110, mono: true },
        { h: 'STARTED', k: 'startedAt', w: 140, mono: true },
        { h: 'COMPLETED', w: 140, mono: true, r: r => r.completedAt || '—' },
        { h: 'AREA · 去識別化', k: 'areaSummary', w: 170 },
        { h: 'DISTANCE', w: 90, mono: true, align: 'right', r: r => r.distanceKm + ' km' },
        { h: 'FARE', w: 100, mono: true, align: 'right', r: r => HostMoney(r.fareAmount) },
        { h: 'STATUS', w: 110, r: r => <Pill theme={th} tone={r.status === 'completed' ? 'success' : r.status === 'cancelled' ? 'danger' : 'info'} dot>{r.status}</Pill> },
      ]} rows={FX_HOST_TRIPS} />
      <HostPageFooter theme={th} page={1} totalPages={1} totalItems={FX_HOST_TRIPS.length} />
    </Card>
  );
}

function HostCasesPanel({ theme: th }) {
  return (
    <Card theme={th} title="相關案件 · Cases (去識別化)" subtitle="僅呈現案件分類與處理結論摘要；不揭露報案人身分，無回覆 / 附件入口（車主唯讀）" padding={0}>
      <Table theme={th} columns={[
        { h: 'CASE', k: 'caseId', w: 110, mono: true },
        { h: 'CATEGORY', w: 100, r: r => <Pill theme={th} tone="neutral">{HOST_CASE_CATEGORY_ZH[r.category] || r.category}</Pill> },
        { h: 'STATUS', w: 120, r: r => <Pill theme={th} tone={HOST_CASE_STATUS_TONE[r.status] || 'neutral'} dot>{r.status}</Pill> },
        { h: 'REPORTED', k: 'reportedAt', w: 110, mono: true },
        { h: 'RESOLVED', w: 110, mono: true, r: r => r.resolvedAt || '—' },
        { h: 'RESOLUTION · 結論摘要', w: 240, r: r => r.resolutionSummary || <span style={{ color: th.textDim }}>尚未結案，無結論摘要</span> },
      ]} rows={FX_HOST_CASES} />
    </Card>
  );
}

// ── /host/vehicles/:vehicleId — read/access edge states (mirrors fleet-cases.jsx
// FLP_CaseAccessStates' EmptyState/EmptyReason convention for GET failures) ──
function FLP_HostAccessStates({ theme: th }) {
  return (
    <HostShell theme={th} breadcrumb={['自有車輛', '存取狀態']}>
      <PageHeader theme={th} title="存取 / 讀取狀態" subtitle="Family 3 錯誤代碼 · 皆由 API 決定，UI 僅呈現訊息與後續指引" />
      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Card theme={th} title="未登入 · HOST_UNAUTHORIZED (401)">
          <EmptyState theme={th} reason="permission_denied" compact messageOverride="登入憑證失效或未帶有效 Token，請重新登入車主入口。" />
        </Card>
        <Card theme={th} title="無車主授權 · HOST_FORBIDDEN (403)">
          <EmptyState theme={th} reason="permission_denied" compact messageOverride="您目前的帳號無有效車主（individual_owner）授權，請聯繫平台確認合作狀態。" />
        </Card>
        <Card theme={th} title="車輛不存在 · HOST_VEHICLE_NOT_FOUND (404)">
          <EmptyState theme={th} reason="no_data" compact messageOverride="找不到此車輛，或該車輛不屬於您名下。為防止車輛 ID 探測，非本人車輛一律回傳 404，絕不回傳 403（見 feature-contracts.md §4.3）。" />
        </Card>
        <Card theme={th} title="讀取失敗 · fetch_failed">
          <EmptyState theme={th} reason="fetch_failed" compact nextAction={{ icon: 'refresh', label: '重試' }} />
        </Card>
        <Card theme={th} title="無變更入口 · HOST_MUTATION_NOT_SUPPORTED (405)" style={{ gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
            <MgmtIcon name="lock" size={15} style={{ color: th.textMuted }} />
            <span style={{ fontSize: 12.5, color: th.text }}>本 UI 全程無任何寫入 / 修改按鈕（無新增車輛、無編輯合約、無收益調整入口），因此車主端永遠不會觸發此錯誤；405 僅為後端對任何直接 POST/PUT/DELETE 呼叫的防禦性回應，非本畫布需要呈現的互動狀態。</span>
          </div>
        </Card>
      </div>
    </HostShell>
  );
}

Object.assign(window, {
  HOST_NAV, HOST_ACTOR, HostShell,
  FLP_HostVehicles, FLP_HostVehicleDetail, FLP_HostAccessStates,
});
