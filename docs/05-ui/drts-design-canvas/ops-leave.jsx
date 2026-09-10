// ops-leave.jsx — SR-LEAVE-FE-001-CANVAS · Ops Console 增量 (N01 / C052, coral realm).
// EXTENDS Ops Console. Reuses Shell/PageHeader/Card/Table/DL/Pill/Banner/ActionButton
// from mgmt-primitives.jsx + mgmt-auth.jsx. Routed under existing 'approvals' nav
// entry (OPS_NAV) — no new top-level navigation added.
// Authority: docs/04-uat/system-remediation-20260906/feature-contracts.md §2
// (Driver Leave Workflow) + packages/contracts/src/system-remediation.ts.
// Five requirement groups (契約 §2.3/§2.5/§2.6 traceability):
//   1. OC_LeaveQueue        — 待審佇列 (GET /requests, POST /:id/review)
//   2. OC_LeaveDetail       — 詳情 + 核准／駁回決策
//   3. OC_LeaveConflict     — server 衝突狀態 (409 overlap / invalid-state-transition)
//   4. OC_LeaveHistory      — 已決定假單稽核紀錄
//   5. OC_LeaveShiftImpact  — 排班連動 + 派單資格壓制看板
// zh-TW · raw_code 雙語.

const OPS_LEAVE_TYPE = {
  annual:      { zh: '特休',     tone: 'info' },
  sick:        { zh: '病假',     tone: 'warn' },
  personal:    { zh: '事假',     tone: 'neutral' },
  bereavement: { zh: '喪假',     tone: 'neutral' },
  emergency:   { zh: '緊急事假', tone: 'danger' },
};
const OPS_LEAVE_STATUS = {
  pending:   { zh: '待審核', tone: 'warn' },
  approved:  { zh: '已核准', tone: 'success' },
  rejected:  { zh: '已駁回', tone: 'danger' },
  withdrawn: { zh: '已撤回', tone: 'neutral' },
};

// Fixture aligned with DriverLeaveRecord — mirrors driver-leave.jsx FX_DRV_LEAVE
// so ops/driver canvases stay cross-consistent (SA §6.8 rule).
const FX_OPS_LEAVE = [
  {
    leaveId: 'lv_d82a1b5c', driver: '吳明翰 · drv_0186', leaveType: 'personal', status: 'pending',
    zhRange: '09/10（四）16:00–21:00', startTime: '2026-09-10T08:00:00.000Z', endTime: '2026-09-10T13:00:00.000Z',
    reason: '家中臨時事務，需請假處理。', impactedShiftIds: ['shift_2305'], createdAt: '2026-09-10T07:42:00.000Z',
  },
  {
    leaveId: 'lv_c47b9012', driver: '林建成 · drv_0201', leaveType: 'sick', status: 'pending',
    zhRange: '09/11（五）09:00–18:00', startTime: '2026-09-11T01:00:00.000Z', endTime: '2026-09-11T10:00:00.000Z',
    reason: '就醫回診，附掛號證明。', impactedShiftIds: [], createdAt: '2026-09-10T06:15:00.000Z',
  },
  {
    leaveId: 'lv_9c31a204', driver: '陳大明 · drv_0230', leaveType: 'annual', status: 'approved',
    zhRange: '09/14（一）08:00 – 09/16（三）23:59', startTime: '2026-09-14T00:00:00.000Z', endTime: '2026-09-16T15:59:00.000Z',
    reason: '家庭旅遊，已提前排班交接。', impactedShiftIds: ['shift_2291', 'shift_2292'],
    reviewedBy: '王芳 · ops_manager', reviewedAt: '2026-09-08T02:10:00.000Z', reviewNotes: '已核准，對應班次已標記調離。',
    createdAt: '2026-09-05T09:00:00.000Z',
  },
  {
    leaveId: 'lv_71e9f830', driver: '游志豪 · drv_0079', leaveType: 'sick', status: 'rejected',
    zhRange: '09/05（六）09:00–18:00', startTime: '2026-09-05T01:00:00.000Z', endTime: '2026-09-05T10:00:00.000Z',
    reason: '身體不適。', impactedShiftIds: [],
    reviewedBy: '王芳 · ops_manager', reviewedAt: '2026-09-05T02:00:00.000Z', reviewNotes: '未附診斷證明，請補件後重新申請。',
    createdAt: '2026-09-05T00:50:00.000Z',
  },
];

function OpsLeaveTypeChip({ theme: th, type }) {
  const m = OPS_LEAVE_TYPE[type];
  return <Pill theme={th} tone={m.tone}>{m.zh}<span style={{ marginLeft: 4, opacity: 0.6, fontFamily: SHELL_MONO, fontSize: 9 }}>{type}</span></Pill>;
}
function OpsLeaveStatusChip({ theme: th, status }) {
  const m = OPS_LEAVE_STATUS[status];
  return <Pill theme={th} tone={m.tone} dot>{m.zh}<span style={{ marginLeft: 4, opacity: 0.6, fontFamily: SHELL_MONO, fontSize: 9 }}>{status}</span></Pill>;
}

// ── 1 · Pending queue (GET /api/driver-leave/requests · ops_user 可依條件查詢) ─
function OC_LeaveQueue({ theme: th, activeTab = 'pending' }) {
  const rows = FX_OPS_LEAVE.filter(r => r.status === activeTab);
  return (
    <Shell theme={th} nav={OPS_NAV} active="approvals" breadcrumb={['案件處理', '審批佇列', '請假審核']}
      env="production" actor={OPS_ACTOR} health={OPS_HEALTH} refreshTier="medium" dataFreshness="fresh">
      <PageHeader theme={th}
        title="請假審核 · Leave Requests"
        subtitle="N01 / C052 · driver:write + dispatch:write · tenant boundary 內司機假單"
        tabs={[
          { id: 'pending', label: 'Pending', badge: String(FX_OPS_LEAVE.filter(r => r.status === 'pending').length), tone: 'warn' },
          { id: 'approved', label: 'Approved' },
          { id: 'rejected', label: 'Rejected' },
          { id: 'withdrawn', label: 'Withdrawn' },
        ]}
        activeTab={activeTab}
        meta={<><Select theme={th} value="假別：全部" /><Select theme={th} value="時間區間：本週" /><Input theme={th} value="司機姓名 / driverId" style={{ width: 160 }} /></>} />

      <div style={{ padding: 24 }}>
        {rows.length === 0 ? (
          <EmptyState theme={th} reason="filtered_empty" messageOverride="此篩選條件下沒有請假申請。" />
        ) : (
          <Card theme={th} padding={0}>
            <Table theme={th} columns={[
              { h: '司機', w: 150, r: r => <span style={{ fontWeight: 600 }}>{r.driver}</span> },
              { h: '申請單', w: 110, mono: true, r: r => <span style={{ color: th.accent, fontWeight: 600 }}>{r.leaveId}</span> },
              { h: '假別', w: 110, r: r => <OpsLeaveTypeChip theme={th} type={r.leaveType} /> },
              { h: '時段（UTC+8）', w: 220, r: r => r.zhRange },
              { h: '事由', w: 260, r: r => r.reason },
              { h: '班次連動', w: 100, r: r => r.impactedShiftIds.length > 0 ? <Pill theme={th} tone="warn" dot>{r.impactedShiftIds.length} 筆</Pill> : <span style={{ color: th.textDim }}>—</span> },
              { h: '提交時間', w: 130, mono: true, r: r => r.createdAt.slice(0, 16).replace('T', ' ') },
              { h: '', w: 220, r: r => activeTab === 'pending' ? (
                <div style={{ display: 'flex', gap: 4 }}>
                  <ActionButton theme={th} size="xs" descriptor={{ action: 'approve', enabled: true, riskLevel: 'medium', requiresReason: false }} label="核准" en="approve" />
                  <ActionButton theme={th} size="xs" descriptor={{ action: 'reject', enabled: true, riskLevel: 'high', requiresReason: true }} label="駁回" en="reject" />
                  <Btn theme={th} size="xs" variant="ghost" icon="ext">詳情</Btn>
                </div>
              ) : <Btn theme={th} size="xs" variant="ghost" icon="ext">詳情</Btn> },
            ]} rows={rows} />
          </Card>
        )}
      </div>
    </Shell>
  );
}

// ── 2 · Decision detail (POST /:id/review, decision=approve|reject) ─────────
function OC_LeaveDetail({ theme: th }) {
  const r = FX_OPS_LEAVE[0];
  return (
    <Shell theme={th} nav={OPS_NAV} active="approvals" breadcrumb={['審批佇列', '請假審核', r.leaveId]}
      env="production" actor={OPS_ACTOR} health={OPS_HEALTH} refreshTier="medium" dataFreshness="fresh">
      <PageHeader theme={th}
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>{r.driver}<OpsLeaveTypeChip theme={th} type={r.leaveType} /><OpsLeaveStatusChip theme={th} status={r.status} /></span>}
        subtitle={r.zhRange + ' · 提交於 ' + r.createdAt}
        actions={<>
          <ActionButton theme={th} size="md" descriptor={{ action: 'approve', enabled: true, riskLevel: 'medium', requiresReason: false }} icon="check" label="核准" en="approve" />
          <ActionButton theme={th} size="md" descriptor={{ action: 'reject', enabled: true, riskLevel: 'high', requiresReason: true }} icon="x" label="駁回" en="reject" />
        </>} />

      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 16, alignItems: 'start' }}>
        <Card theme={th} title="申請內容">
          <DL theme={th} cols={2} items={[
            { k: 'leaveId', v: r.leaveId, mono: true },
            { k: 'driverId', v: 'drv_0186', mono: true },
            { k: 'leaveType', v: r.leaveType, mono: true },
            { k: 'status', v: <OpsLeaveStatusChip theme={th} status={r.status} /> },
            { k: 'startTime (UTC)', v: r.startTime, mono: true },
            { k: 'endTime (UTC)', v: r.endTime, mono: true },
          ]} />
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: th.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>reason</div>
            <div style={{ fontSize: 12.5, color: th.text, lineHeight: 1.55, background: th.surfaceLo, borderRadius: 8, padding: '10px 12px' }}>{r.reason}</div>
          </div>
          <div style={{ marginTop: 14 }}>
            <Field theme={th} label="審核備註 · reviewNotes" hint="駁回 (reject) 時為必填，會寫入 ReviewDriverLeaveCommand.reviewNotes">
              <Input theme={th} ph="輸入核准／駁回原因…" />
            </Field>
          </div>
        </Card>
        <Card theme={th} title="班次重疊預覽" subtitle="核准後將寫入 impactedShiftIds">
          {r.impactedShiftIds.length === 0 ? (
            <EmptyState theme={th} reason="no_data" compact messageOverride="此區間目前無重疊班次。" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {r.impactedShiftIds.map(id => (
                <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: th.warnBg, border: '1px solid ' + th.warnBorder, borderRadius: 8 }}>
                  <MgmtIcon name="attendance" size={14} style={{ color: th.warn }} />
                  <span style={{ flex: 1, fontSize: 12, fontFamily: SHELL_MONO }}>{id}</span>
                  <span style={{ fontSize: 10.5, color: th.warn, fontWeight: 600 }}>將標記調離</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 10 }}><Banner theme={th} tone="info" icon="info" body="核准後同步壓制該司機此區間之派單資格（driver_matching_suppressions），司機端自動下線。" /></div>
        </Card>
      </div>
    </Shell>
  );
}

// ── 3 · Server conflict states (409 LEAVE_OVERLAPPING_REQUEST /
//        LEAVE_INVALID_STATE_TRANSITION) ────────────────────────────────────
function OC_LeaveConflict({ theme: th, variant = 'invalid_state' }) {
  const cfg = {
    invalid_state: {
      code: '409 · LEAVE_INVALID_STATE_TRANSITION',
      title: '此假單已被其他主管處理',
      body: '審核期間該假單狀態已由另一位主管更新為「已核准」，本次駁回操作被伺服器拒絕，避免雙重決策衝突。頁面已重新整理為最新狀態。',
    },
    overlap: {
      code: '409 · LEAVE_OVERLAPPING_REQUEST',
      title: '司機於此區間已有生效假單',
      body: '同一司機在 pending 或 approved 狀態下已有 lv_9c31a204（09/14–09/16）重疊區間之假單，系統阻擋本次核准以避免重複調離同一班次。',
    },
  }[variant];
  return (
    <Shell theme={th} nav={OPS_NAV} active="approvals" breadcrumb={['審批佇列', '請假審核', '衝突']}
      env="production" actor={OPS_ACTOR} health={OPS_HEALTH} refreshTier="medium" dataFreshness="fresh">
      <PageHeader theme={th} title="伺服器衝突狀態 · Server Conflict" subtitle="決策動作被拒絕，無 override；需重新讀取最新資料後再處理" />
      <div style={{ padding: 24, maxWidth: 760 }}>
        <div style={{ border: '2px solid ' + th.danger, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ background: th.danger, color: '#fff', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 9 }}>
            <MgmtIcon name="danger" size={17} /><span style={{ fontSize: 14, fontWeight: 800 }}>{cfg.title}</span>
          </div>
          <div style={{ padding: 16, background: th.surface }}>
            <code style={{ fontSize: 11, fontFamily: SHELL_MONO, color: th.danger, background: th.dangerBg, padding: '3px 10px', borderRadius: 999 }}>{cfg.code}</code>
            <div style={{ marginTop: 10, fontSize: 13.5, color: th.text, lineHeight: 1.65 }}>{cfg.body}</div>
            <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
              <Btn theme={th} variant="primary" icon="refresh">重新讀取最新狀態</Btn>
              <Btn theme={th} variant="ghost">返回佇列</Btn>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 12 }}><Banner theme={th} tone="neutral" icon="lock" body="無 override / force-approve 控制項；衝突必須依最新伺服器狀態重新決策。" /></div>
      </div>
    </Shell>
  );
}

// ── 4 · Decided history / audit trail ────────────────────────────────────────
function OC_LeaveHistory({ theme: th }) {
  const rows = FX_OPS_LEAVE.filter(r => r.status !== 'pending');
  return (
    <Shell theme={th} nav={OPS_NAV} active="approvals" breadcrumb={['審批佇列', '請假審核', '歷史紀錄']}
      env="production" actor={OPS_ACTOR} health={OPS_HEALTH} refreshTier="manual" dataFreshness="fresh">
      <PageHeader theme={th} title="請假審核歷史" subtitle="已決定 / 已終態假單稽核紀錄 — approved / rejected / withdrawn"
        meta={<><Select theme={th} value="時間區間：本月" /><Select theme={th} value="決策：全部" /></>} />
      <div style={{ padding: 24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: '司機', w: 150, r: r => r.driver },
            { h: '申請單', w: 110, mono: true, r: r => r.leaveId },
            { h: '假別', w: 110, r: r => <OpsLeaveTypeChip theme={th} type={r.leaveType} /> },
            { h: '結果', w: 110, r: r => <OpsLeaveStatusChip theme={th} status={r.status} /> },
            { h: '時段（UTC+8）', w: 220, r: r => r.zhRange },
            { h: '審核人', w: 150, r: r => r.reviewedBy || <span style={{ color: th.textDim }}>—（司機自行撤回）</span> },
            { h: '審核時間', w: 140, mono: true, r: r => r.reviewedAt ? r.reviewedAt.slice(0, 16).replace('T', ' ') : '—' },
            { h: '備註', w: 240, r: r => r.reviewNotes || <span style={{ color: th.textDim }}>—</span> },
          ]} rows={rows} />
        </Card>
      </div>
    </Shell>
  );
}

// ── 5 · Shift reassignment + dispatch suppression board ─────────────────────
function OC_LeaveShiftImpact({ theme: th }) {
  const board = [
    { shift: 'shift_2291', driver: '陳大明 · drv_0230', zh: '09/14（一）08:00–20:00', tagged: true, elig: 'ineligible' },
    { shift: 'shift_2292', driver: '陳大明 · drv_0230', zh: '09/15（二）08:00–20:00', tagged: true, elig: 'ineligible' },
    { shift: 'shift_2305', driver: '吳明翰 · drv_0186', zh: '09/10（四）16:00–24:00', tagged: false, elig: 'eligible', pendingReview: true },
    { shift: 'shift_2306', driver: '林建成 · drv_0201', zh: '09/11（五）08:00–20:00', tagged: false, elig: 'eligible' },
  ];
  return (
    <Shell theme={th} nav={OPS_NAV} active="approvals" breadcrumb={['審批佇列', '請假審核', '班表連動']}
      env="production" actor={OPS_ACTOR} health={OPS_HEALTH} refreshTier="dispatch" dataFreshness="fresh">
      <PageHeader theme={th} title="班表連動與派單資格壓制" subtitle="ops.phase1_driver_shifts.record.leaveReassigned × ops.phase1_driver_matching_suppressions" />
      <div style={{ padding: 24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: '班次', w: 110, mono: true, r: r => r.shift },
            { h: '司機', w: 160, r: r => <Pill theme={th} tone="driver" dot>{r.driver}</Pill> },
            { h: '時段', w: 200, r: r => r.zh },
            { h: '調離標記', w: 130, r: r => r.tagged
              ? <Pill theme={th} tone="warn" dot>請假調離<span style={{ marginLeft: 4, opacity: .6, fontFamily: SHELL_MONO, fontSize: 9 }}>leaveReassigned</span></Pill>
              : r.pendingReview ? <Pill theme={th} tone="neutral">待審核中</Pill> : <Pill theme={th} tone="success">正常排班</Pill> },
            { h: '派單資格', w: 130, r: r => r.elig === 'ineligible'
              ? <Pill theme={th} tone="danger" dot>不合格 · ineligible</Pill>
              : <Pill theme={th} tone="success" dot>合格 · eligible</Pill> },
          ]} rows={board} />
        </Card>
        <div style={{ marginTop: 12 }}>
          <Banner theme={th} tone="warn" icon="warn" title="即時連動 · 無需人工同步"
            body="核准請假起始時間到達時，調度核心自動於 driver_matching_suppressions 建立紀錄（reason: DRIVER_ON_LEAVE），已上線司機立即被排除於候選名單並下線；毋須主管手動下架班表。" />
        </div>
      </div>
    </Shell>
  );
}

Object.assign(window, {
  OPS_LEAVE_TYPE, OPS_LEAVE_STATUS, FX_OPS_LEAVE, OpsLeaveTypeChip, OpsLeaveStatusChip,
  OC_LeaveQueue, OC_LeaveDetail, OC_LeaveConflict, OC_LeaveHistory, OC_LeaveShiftImpact,
});
