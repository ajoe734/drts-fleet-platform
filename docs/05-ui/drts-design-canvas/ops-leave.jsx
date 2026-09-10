// ops-leave.jsx — Ops Console: Leave Management (請假管理) — SR-LEAVE-FE-001-CANVAS
// Authority: docs/04-uat/system-remediation-20260906/feature-contracts.md §2 (Family 1: Driver Leave Workflow)
//            packages/contracts/src/system-remediation.ts (DriverLeaveRecord, ReviewDriverLeaveCommand, error codes)
//            packages/api-client/src/system-remediation.ts (listDriverLeavesEnvelope / reviewDriverLeave)
// Tokens: mgmt-tokens.jsx buildMgmtTheme({ console: 'ops' }) — ops realm (coral) only, no new colors.
//
// Nav note: OPS_NAV (ops-screens-1.jsx) is out of this task's write_scope. This
// screen uses active="leave", which will not highlight a sidebar item until the
// nav owner (SR-WIRE-001 lane) adds the corresponding entry — that is expected
// and does not indicate a broken canvas artboard.
//
// MOCK DATA NOTICE: FX_OPS_LEAVES below is illustrative canvas fixture data only.
// leaveId / driverId / impactedShiftIds are not real resource IDs. Production
// wiring must call listDriverLeavesEnvelope()/reviewDriverLeave() — fixtures
// here never stand in for integration evidence.

const OPS_LEAVE_TYPE_LABELS = {
  annual: '特休', sick: '病假', personal: '事假', bereavement: '喪假', emergency: '緊急事假',
};
const OPS_LEAVE_STATUS_TONE = { pending: 'warn', approved: 'success', rejected: 'danger', withdrawn: 'neutral' };
const OPS_LEAVE_STATUS_LABEL = { pending: '待審核', approved: '已核准', rejected: '已駁回', withdrawn: '已撤回' };

// MOCK — illustrative canvas fixture only; not real leaveId/driverId/shiftId.
// Wire to listDriverLeavesEnvelope() at implementation time.
const FX_OPS_LEAVES = [
  {
    leaveId: 'lv_d82a1b5c-4f91-4c92-91d8-847291048123', driverId: 'driver_001', driverName: '陳俊宏',
    leaveType: 'personal', startTime: '2026-09-10T08:00:00.000Z', endTime: '2026-09-10T17:00:00.000Z',
    reason: '家中臨時有事，需請假處理', status: 'pending',
    reviewedByPrincipalId: null, reviewedAt: null, reviewNotes: null,
    impactedShiftIds: [], createdAt: '2026-09-06T06:30:00.000Z', updatedAt: '2026-09-06T06:30:00.000Z',
  },
  {
    leaveId: 'lv_2f6a9d10-8b3c-4a11-9c02-11ee7a0f4021', driverId: 'driver_014', driverName: '林美玲',
    leaveType: 'annual', startTime: '2026-09-14T01:00:00.000Z', endTime: '2026-09-15T10:00:00.000Z',
    reason: '排定特休', status: 'approved',
    reviewedByPrincipalId: 'ops_user_4471', reviewedAt: '2026-09-07T02:10:00.000Z', reviewNotes: '已核准，班表已調整。',
    impactedShiftIds: ['shift_88214', 'shift_88215'], createdAt: '2026-09-05T09:00:00.000Z', updatedAt: '2026-09-07T02:10:00.000Z',
  },
  {
    leaveId: 'lv_7c1e3a44-0d2b-4f70-8a9e-5566aa112233', driverId: 'driver_027', driverName: '王大同',
    leaveType: 'emergency', startTime: '2026-09-04T05:00:00.000Z', endTime: '2026-09-04T09:00:00.000Z',
    reason: '緊急送醫陪同', status: 'rejected',
    reviewedByPrincipalId: 'ops_user_4471', reviewedAt: '2026-09-04T05:40:00.000Z',
    reviewNotes: '與既有核准假單時段重疊，請司機改以撤回原假單後重新申請。',
    impactedShiftIds: [], createdAt: '2026-09-04T04:50:00.000Z', updatedAt: '2026-09-04T05:40:00.000Z',
  },
  {
    leaveId: 'lv_9931aa20-6e4d-4c88-b1a0-77ff2200aabb', driverId: 'driver_033', driverName: '許淑芬',
    leaveType: 'sick', startTime: '2026-08-28T00:00:00.000Z', endTime: '2026-08-28T09:00:00.000Z',
    reason: '感冒不適', status: 'withdrawn',
    reviewedByPrincipalId: null, reviewedAt: null, reviewNotes: null,
    impactedShiftIds: [], createdAt: '2026-08-27T23:10:00.000Z', updatedAt: '2026-08-28T00:05:00.000Z',
  },
  {
    leaveId: 'lv_5510bb31-7f5e-4d99-a2c1-88aa3300ccdd', driverId: 'driver_048', driverName: '張家豪',
    leaveType: 'personal', startTime: '2026-09-12T02:00:00.000Z', endTime: '2026-09-12T10:00:00.000Z',
    reason: '個人事務', status: 'pending',
    reviewedByPrincipalId: null, reviewedAt: null, reviewNotes: null,
    impactedShiftIds: [], createdAt: '2026-09-09T01:00:00.000Z', updatedAt: '2026-09-09T01:00:00.000Z',
  },
];

function fmt(iso) { return iso ? iso.slice(0, 16).replace('T', ' ') + ' UTC' : '—'; }

// ── /leave — 假單列表 (list, spec group 2) ──────────────────────────────────
// States: populated · loading · fetch_failed(+retry) · filtered_empty
function OC_Leave({ theme: th, tab = 'pending', loading = false, error = false, items }) {
  const rows = (items || FX_OPS_LEAVES).filter(r => tab === 'all' || r.status === tab);
  const counts = ['pending', 'approved', 'rejected', 'withdrawn'].reduce((acc, s) => {
    acc[s] = FX_OPS_LEAVES.filter(r => r.status === s).length; return acc;
  }, {});
  return (
    <Shell theme={th} nav={OPS_NAV} active="leave"
      breadcrumb={['案件處理', '請假管理']} env="production" actor={OPS_ACTOR} health={OPS_HEALTH}
      refreshTier="medium" dataFreshness={error ? 'stale' : 'fresh'}>
      <PageHeader theme={th}
        title="司機請假審核"
        subtitle="轄下司機請假申請 · 核准將自動比對班表並標記調離 (leaveReassigned)"
        tabs={[
          { id: 'pending', label: '待審核', badge: String(counts.pending), tone: 'warn' },
          { id: 'approved', label: '已核准', badge: String(counts.approved) },
          { id: 'rejected', label: '已駁回', badge: String(counts.rejected) },
          { id: 'withdrawn', label: '已撤回', badge: String(counts.withdrawn) },
          { id: 'all', label: '全部', badge: String(FX_OPS_LEAVES.length) },
        ]}
        activeTab={tab}
        actions={<Btn theme={th} icon="filter">篩選 · driverId / 時間區間</Btn>} />

      <div style={{ padding: 24 }}>
        {loading && (
          <Card theme={th}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: th.textMuted, fontSize: 12.5 }}>
              <MgmtIcon name="refresh" size={14} />讀取中 · loading
            </div>
          </Card>
        )}

        {!loading && error && (
          <Banner theme={th} tone="danger" icon="danger"
            title="讀取失敗 · fetch_failed"
            body="無法取得請假列表，後端服務暫時無回應。"
            actions={<Btn theme={th} variant="primary" icon="refresh">重試 · retry</Btn>} />
        )}

        {!loading && !error && rows.length === 0 && (
          <EmptyState theme={th} reason="filtered_empty" messageOverride="此分類目前沒有符合的假單。" />
        )}

        {!loading && !error && rows.length > 0 && (
          <Card theme={th} padding={0}>
            <Table theme={th} columns={[
              { h: 'DRIVER', w: 160, r: r => <div style={{ display: 'flex', flexDirection: 'column' }}><span style={{ fontWeight: 600 }}>{r.driverName}</span><span style={{ fontSize: 10.5, color: th.textDim, fontFamily: SHELL_MONO }}>{r.driverId}</span></div> },
              { h: '假別', w: 90, r: r => OPS_LEAVE_TYPE_LABELS[r.leaveType] },
              { h: '時間區間 (UTC)', w: 260, mono: true, r: r => `${fmt(r.startTime)} → ${fmt(r.endTime)}` },
              { h: 'STATUS', w: 110, r: r => <Pill theme={th} tone={OPS_LEAVE_STATUS_TONE[r.status]} dot>{OPS_LEAVE_STATUS_LABEL[r.status]}</Pill> },
              { h: '受影響班次', w: 100, align: 'right', r: r => r.impactedShiftIds.length > 0 ? <Pill theme={th} tone="warn">{r.impactedShiftIds.length} 筆</Pill> : <span style={{ color: th.textDim }}>—</span> },
              { h: 'ACTIONS', w: 190, r: r => (
                <div style={{ display: 'flex', gap: 4 }}>
                  <ActionButton theme={th} size="xs" descriptor={{ action: 'approve', enabled: r.status === 'pending', disabledReasonCode: 'not_pending', riskLevel: 'medium' }} icon="check" label="核准" en="approve" />
                  <ActionButton theme={th} size="xs" descriptor={{ action: 'reject', enabled: r.status === 'pending', disabledReasonCode: 'not_pending', requiresReason: true, riskLevel: 'medium' }} icon="x" label="駁回" en="reject" />
                </div>
              )},
            ]} rows={rows} />
          </Card>
        )}

        <div style={{ marginTop: 12, fontSize: 11, color: th.textDim, fontFamily: SHELL_MONO }}>
          page 1 / 1 · pageSize 20 · totalItems {rows.length} · GET /api/driver-leave/requests
        </div>
      </div>
    </Shell>
  );
}

// ── /leave/[id] — 假單詳情、核准／駁回 (detail + review, spec group 2 + 3) ──
// variant: 'pending' (approve/reject live) · 'approved' (impactedShiftIds) ·
//          'rejected' (reviewNotes) · 'withdrawn' (terminal) ·
//          'reject_modal' (requiresReason capture) · 'conflict' (409 stale-state recheck)
function OC_LeaveDetail({ theme: th, record, variant = 'pending' }) {
  const r = record || FX_OPS_LEAVES.find(x => x.status === variant) || FX_OPS_LEAVES[0];
  const terminal = r.status !== 'pending';
  const showRejectModal = variant === 'reject_modal';

  return (
    <Shell theme={th} nav={OPS_NAV} active="leave"
      breadcrumb={['請假管理', r.leaveId]} env="production" actor={OPS_ACTOR} health={OPS_HEALTH}
      refreshTier="medium" dataFreshness="fresh"
      healthBanner={variant === 'conflict' ? (
        <div style={{ padding: '12px 24px 0' }}>
          <Banner theme={th} tone="danger" icon="danger"
            title="LEAVE_INVALID_STATE_TRANSITION · 409 Conflict"
            body="此假單已被其他審核動作變更狀態（例如司機已撤回，或另一位主管已審核）。請重新整理後再操作，避免覆蓋既有結果。"
            actions={<Btn theme={th} variant="primary" icon="refresh">重新整理 · refetch</Btn>} />
        </div>
      ) : null}>
      <div style={{ position: 'relative' }}>
      <PageHeader theme={th}
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>{r.driverName}<span style={{ fontFamily: SHELL_MONO, fontSize: 12, color: th.textMuted, fontWeight: 500 }}>{r.leaveId}</span></span>}
        subtitle={`${OPS_LEAVE_TYPE_LABELS[r.leaveType]} · ${fmt(r.startTime)} → ${fmt(r.endTime)}`}
        meta={<Pill theme={th} tone={OPS_LEAVE_STATUS_TONE[r.status]} dot>{OPS_LEAVE_STATUS_LABEL[r.status]}</Pill>}
        actions={<>
          <ActionButton theme={th} descriptor={{ action: 'approve', enabled: r.status === 'pending' && variant !== 'conflict', disabledReasonCode: r.status !== 'pending' ? 'not_pending' : 'stale_state', riskLevel: 'medium' }} icon="check" label="核准" en="approve" />
          <ActionButton theme={th} descriptor={{ action: 'reject', enabled: r.status === 'pending' && variant !== 'conflict', disabledReasonCode: r.status !== 'pending' ? 'not_pending' : 'stale_state', requiresReason: true, riskLevel: 'medium' }} icon="x" label="駁回" en="reject" />
        </>} />

      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card theme={th} title="請假內容">
            <DL theme={th} cols={2} items={[
              { k: '司機', v: <span>{r.driverName} <span style={{ color: th.textDim, fontFamily: SHELL_MONO }}>{r.driverId}</span></span> },
              { k: '假別', v: OPS_LEAVE_TYPE_LABELS[r.leaveType] },
              { k: '起始時間', v: fmt(r.startTime), mono: true },
              { k: '結束時間', v: fmt(r.endTime), mono: true },
              { k: '事由', v: r.reason },
              { k: '建立時間', v: fmt(r.createdAt), mono: true },
            ]} />
          </Card>

          {r.impactedShiftIds.length > 0 && (
            <Card theme={th} title={`受影響班次 · ${r.impactedShiftIds.length} 筆 · leaveReassigned`} padding={0}>
              <Table theme={th} dense columns={[
                { h: 'SHIFT ID', k: 'id', w: 160, mono: true },
                { h: 'STATUS', w: 140, r: () => <Pill theme={th} tone="warn" dot>請假調離</Pill> },
                { h: 'RECORD ANNOTATION', r: () => <span style={{ fontSize: 11, fontFamily: SHELL_MONO, color: th.textMuted }}>reassignedReason: DRIVER_ON_LEAVE</span> },
              ]} rows={r.impactedShiftIds.map(id => ({ id }))} />
            </Card>
          )}

          {r.reviewNotes && (
            <Card theme={th} title="審核備註">
              <div style={{ fontSize: 12.5, color: th.text, lineHeight: 1.5 }}>{r.reviewNotes}</div>
            </Card>
          )}

          {terminal && (
            <Banner theme={th} tone="neutral" icon="lock"
              body="此假單已為終態，不再提供核准 / 駁回動作 · terminal state, no further review action." />
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card theme={th} title="審核時間軸">
            <Timeline theme={th} events={[
              { at: fmt(r.createdAt).slice(11, 16), tone: 'accent', t: '司機提交申請', actor: r.driverId, actorRealm: 'driver', body: `狀態: pending` },
              ...(r.reviewedAt ? [{
                at: fmt(r.reviewedAt).slice(11, 16),
                tone: r.status === 'approved' ? 'success' : r.status === 'rejected' ? 'danger' : 'neutral',
                t: r.status === 'approved' ? '主管核准' : r.status === 'rejected' ? '主管駁回' : '狀態變更',
                actor: r.reviewedByPrincipalId, actorRealm: 'ops',
                body: r.reviewNotes || undefined,
              }] : []),
            ]} />
          </Card>
          <Card theme={th} title="Tenant boundary">
            <div style={{ fontSize: 11.5, color: th.textMuted, lineHeight: 1.5 }}>
              僅可檢視／審核轄下司機假單。跨租戶存取回傳 <span style={{ fontFamily: SHELL_MONO }}>403 LEAVE_FORBIDDEN_ACCESS</span> 或 <span style={{ fontFamily: SHELL_MONO }}>404 LEAVE_NOT_FOUND</span>。
            </div>
          </Card>
        </div>
      </div>

      {showRejectModal && (
        <Modal theme={th} accent={th.danger} title="駁回假單 · requires reason" subtitle={`${r.driverName} · ${r.leaveId}`}
          footer={<><Btn theme={th}>取消</Btn><Btn theme={th} variant="danger" icon="x">確認駁回 · reject</Btn></>}>
          <Field theme={th} label="駁回原因" required hint="將寫入 ReviewDriverLeaveCommand.reviewNotes，司機端可見。">
            <Input theme={th} ph="說明駁回原因…" />
          </Field>
        </Modal>
      )}
      </div>
    </Shell>
  );
}

Object.assign(window, {
  OPS_LEAVE_TYPE_LABELS, OPS_LEAVE_STATUS_TONE, OPS_LEAVE_STATUS_LABEL, FX_OPS_LEAVES,
  OC_Leave, OC_LeaveDetail,
});
