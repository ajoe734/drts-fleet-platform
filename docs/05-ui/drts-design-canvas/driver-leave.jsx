// driver-leave.jsx — Driver App: Leave (請假) — SR-LEAVE-FE-001-CANVAS
// Authority: docs/04-uat/system-remediation-20260906/feature-contracts.md §2 (Family 1: Driver Leave Workflow)
//            packages/contracts/src/system-remediation.ts (DriverLeaveRecord, DriverLeaveType/Status, error codes)
//            packages/api-client/src/system-remediation.ts (createDriverLeave / listDriverLeaves / listDriverLeavesEnvelope / withdrawDriverLeave)
// Tokens: driver-tokens.jsx (DRV_T / buildDrvTheme) — driver realm only, no new colors introduced.
//
// MOCK DATA NOTICE: FX_DRIVER_LEAVES below is illustrative canvas fixture data only.
// leaveId / driverId / impactedShiftIds are not real resource IDs. Production wiring
// must call listDriverLeaves()/createDriverLeave()/withdrawDriverLeave() — fixtures
// here never stand in for integration evidence.

// ── Leave taxonomy (mirrors DRIVER_LEAVE_TYPES / DRIVER_LEAVE_STATUSES) ─────
const DRV_LEAVE_TYPE_LABELS = {
  annual:      { zh: '特休', en: 'annual' },
  sick:        { zh: '病假', en: 'sick' },
  personal:    { zh: '事假', en: 'personal' },
  bereavement: { zh: '喪假', en: 'bereavement' },
  emergency:   { zh: '緊急事假', en: 'emergency' },
};
const DRV_LEAVE_STATUS_TONE = { pending: 'warn', approved: 'success', rejected: 'danger', withdrawn: 'neutral' };
const DRV_LEAVE_STATUS_LABEL = {
  pending: { zh: '待審核', en: 'pending' },
  approved: { zh: '已核准', en: 'approved' },
  rejected: { zh: '已駁回', en: 'rejected' },
  withdrawn: { zh: '已撤回', en: 'withdrawn' },
};

// MOCK — illustrative canvas fixture only; not real leaveId/driverId/shiftId.
// Wire to listDriverLeaves() / listDriverLeavesEnvelope() at implementation time.
const FX_DRIVER_LEAVES = [
  {
    leaveId: 'lv_d82a1b5c-4f91-4c92-91d8-847291048123', driverId: 'driver_001',
    leaveType: 'personal', startTime: '2026-09-10T08:00:00.000Z', endTime: '2026-09-10T17:00:00.000Z',
    reason: '家中臨時有事，需請假處理 · family urgent appointment',
    status: 'pending', reviewedByPrincipalId: null, reviewedAt: null, reviewNotes: null,
    impactedShiftIds: [], createdAt: '2026-09-06T06:30:00.000Z', updatedAt: '2026-09-06T06:30:00.000Z',
  },
  {
    leaveId: 'lv_2f6a9d10-8b3c-4a11-9c02-11ee7a0f4021', driverId: 'driver_001',
    leaveType: 'annual', startTime: '2026-09-14T01:00:00.000Z', endTime: '2026-09-15T10:00:00.000Z',
    reason: '排定特休 · pre-planned annual leave',
    status: 'approved', reviewedByPrincipalId: 'ops_user_4471', reviewedAt: '2026-09-07T02:10:00.000Z', reviewNotes: '已核准，班表已調整。',
    impactedShiftIds: ['shift_88214', 'shift_88215'], createdAt: '2026-09-05T09:00:00.000Z', updatedAt: '2026-09-07T02:10:00.000Z',
  },
  {
    leaveId: 'lv_7c1e3a44-0d2b-4f70-8a9e-5566aa112233', driverId: 'driver_001',
    leaveType: 'emergency', startTime: '2026-09-04T05:00:00.000Z', endTime: '2026-09-04T09:00:00.000Z',
    reason: '緊急送醫陪同 · emergency hospital accompaniment',
    status: 'rejected', reviewedByPrincipalId: 'ops_user_4471', reviewedAt: '2026-09-04T05:40:00.000Z',
    reviewNotes: '與既有核准假單時段重疊，請改以撤回原假單後重新申請。',
    impactedShiftIds: [], createdAt: '2026-09-04T04:50:00.000Z', updatedAt: '2026-09-04T05:40:00.000Z',
  },
  {
    leaveId: 'lv_9931aa20-6e4d-4c88-b1a0-77ff2200aabb', driverId: 'driver_001',
    leaveType: 'sick', startTime: '2026-08-28T00:00:00.000Z', endTime: '2026-08-28T09:00:00.000Z',
    reason: '感冒不適 · flu symptoms',
    status: 'withdrawn', reviewedByPrincipalId: null, reviewedAt: null, reviewNotes: null,
    impactedShiftIds: [], createdAt: '2026-08-27T23:10:00.000Z', updatedAt: '2026-08-28T00:05:00.000Z',
  },
];

// ── Local field primitives (driver-brand styled; no new colors) ────────────
function DrvLeaveField({ theme: t, zh, en, error, focused, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ marginBottom: 6 }}><DrvBi zh={zh} en={en} theme={t} size={11} /></div>
      <div style={{
        borderRadius: 10, border: '1.5px solid ' + (error ? t.danger : focused ? t.brand : t.border),
        boxShadow: focused ? '0 0 0 3px ' + t.brandBg : 'none', transition: 'box-shadow .12s, border-color .12s',
      }}>{children}</div>
      {error && <div style={{ fontSize: 11, color: t.danger, marginTop: 5, lineHeight: 1.4, display: 'flex', gap: 5 }}>
        <DrvIcon name="warn" size={12} stroke={2.2} style={{ marginTop: 1, flexShrink: 0 }} />{error}
      </div>}
    </div>
  );
}

function DrvLeaveInput({ theme: t, value, ph, mono }) {
  return (
    <div style={{
      padding: '11px 12px', background: t.bgRaised, borderRadius: 10,
      fontSize: 14, color: value ? t.text : t.textDim,
      fontFamily: mono ? DRV_MONO : DRV_FONT,
    }}>{value || ph}</div>
  );
}

function DrvLeaveTextarea({ theme: t, value, ph, rows = 3 }) {
  return (
    <div style={{
      padding: '11px 12px', background: t.bgRaised, borderRadius: 10,
      fontSize: 13.5, color: value ? t.text : t.textDim, lineHeight: 1.5,
      minHeight: rows * 20,
    }}>{value || ph}</div>
  );
}

function DrvLeaveTypeChips({ theme: t, value }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {Object.keys(DRV_LEAVE_TYPE_LABELS).map(k => {
        const on = k === value;
        const l = DRV_LEAVE_TYPE_LABELS[k];
        return (
          <span key={k} style={{
            padding: '7px 12px', borderRadius: 999, fontSize: 12.5, fontWeight: 600,
            background: on ? t.brand : t.surfaceLo, color: on ? '#fff' : t.textMuted,
            border: '1px solid ' + (on ? t.brand : t.border),
          }}>{l.zh} <span style={{ fontFamily: DRV_MONO, fontWeight: 500, opacity: 0.75, fontSize: 10.5 }}>· {l.en}</span></span>
        );
      })}
    </div>
  );
}

// ── /leave — 我的假單列表 (list, spec group 1) ───────────────────────────────
// States: loading · fetch_failed(+retry) · filtered_empty per tab · populated
function DRV_LeaveList({ theme: t, tab = 'pending', loading = false, error = false, items }) {
  const rows = (items || FX_DRIVER_LEAVES).filter(r => tab === 'all' || r.status === tab);
  const tabs = [
    { id: 'pending', zh: '待審核' }, { id: 'approved', zh: '已核准' },
    { id: 'rejected', zh: '已駁回' }, { id: 'withdrawn', zh: '已撤回' }, { id: 'all', zh: '全部' },
  ];
  return (
    <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
      <DrvAppBar theme={t} title="我的假單 · leave" back refreshTier="manual" />
      <div style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ padding: '12px 16px 0', display: 'flex', gap: 6, overflowX: 'auto' }}>
          {tabs.map(tb => {
            const on = tb.id === tab;
            return (
              <span key={tb.id} style={{
                flexShrink: 0, padding: '7px 12px', borderRadius: 8, fontSize: 12,
                fontWeight: 600, background: on ? t.brand : t.surfaceLo, color: on ? '#fff' : t.textMuted,
                border: '1px solid ' + (on ? t.brand : t.border),
              }}>{tb.zh}</span>
            );
          })}
        </div>

        {loading && (
          <div style={{ padding: '32px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <DrvIcon name="refresh" size={22} style={{ color: t.textDim }} />
            <DrvBi zh="讀取中" en="loading" theme={t} size={12} />
          </div>
        )}

        {!loading && error && (
          <div style={{ padding: '14px 16px 0' }}>
            <DrvEmpty theme={t} reason="fetch_failed" message="無法取得假單列表，請檢查網路後重試。"
              action={<DrvBigBtn theme={t} kind="outline" icon="refresh" full={false}>重試 · retry</DrvBigBtn>} />
          </div>
        )}

        {!loading && !error && rows.length === 0 && (
          <div style={{ padding: '14px 16px 0' }}>
            <DrvEmpty theme={t} reason="filtered_empty" message="此分類目前沒有假單紀錄。" />
          </div>
        )}

        {!loading && !error && rows.length > 0 && (
          <div style={{ padding: '14px 16px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {rows.map(r => {
              const type = DRV_LEAVE_TYPE_LABELS[r.leaveType];
              const st = DRV_LEAVE_STATUS_LABEL[r.status];
              return (
                <DrvCard key={r.leaveId} theme={t} accent={r.status === 'pending' ? t.warn : undefined}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <DrvPill theme={t} tone={DRV_LEAVE_STATUS_TONE[r.status]} dot en={st.en}>{st.zh}</DrvPill>
                    <span style={{ flex: 1 }} />
                    <span style={{ fontSize: 11, color: t.textDim, fontFamily: DRV_MONO }}>{type.en}</span>
                  </div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: t.text, marginTop: 8 }}>{type.zh}</div>
                  <div style={{ fontSize: 12, color: t.textMuted, marginTop: 3, fontFamily: DRV_MONO }}>
                    {r.startTime.slice(0, 16).replace('T', ' ')} → {r.endTime.slice(0, 16).replace('T', ' ')} <span style={{ opacity: 0.6 }}>UTC</span>
                  </div>
                  <div style={{ fontSize: 12, color: t.textMuted, marginTop: 6, lineHeight: 1.4 }}>{r.reason}</div>
                  {r.impactedShiftIds.length > 0 && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed ' + t.border, fontSize: 11, color: t.warn, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <DrvIcon name="warn" size={12} stroke={2.2} />受影響班次已調離 · {r.impactedShiftIds.length} 筆
                    </div>
                  )}
                </DrvCard>
              );
            })}
          </div>
        )}
      </div>
      <DrvStickyAction theme={t} primary={<DrvBigBtn theme={t} kind="primary" icon="plus">申請假單 · new_leave</DrvBigBtn>} />
    </div>
  );
}

// ── /leave/new — 申請假單 (create, spec group 1 + 4) ────────────────────────
// Props drive every state: idle · client-side validation error · submitting · server 409 conflict.
// keyboard ('ios'|'android') + focusField demonstrate keyboard-safe-area + focus-visible per spec.
function DRV_LeaveCreate({
  theme: t, leaveType = 'personal', startLocal = '09/10 16:00', endLocal = '09/10 20:00', reason = '',
  errors = {}, serverError = null, submitting = false, keyboard, focusField,
}) {
  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <DrvAppBar theme={t} title="申請假單 · new leave" back refreshTier="manual" />
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 16px 0' }}>
        <DrvAuthorityBanner theme={t} forwarded={false} platform="DRTS 自營排班"
          sub="申請提交後進入待審核，主管核准前可自行撤回。核准後將自動比對班表並標記調離。" />

        {serverError && (
          <div style={{ marginTop: 14 }}>
            <DrvCard theme={t} accent={t.danger}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <DrvIcon name="warn" size={15} stroke={2.2} style={{ color: t.danger, marginTop: 1 }} />
                <div style={{ flex: 1 }}>
                  <DrvBi zh={serverError.title} en={serverError.code} theme={t} size={12.5} />
                  <div style={{ fontSize: 11.5, color: t.textMuted, marginTop: 4, lineHeight: 1.5 }}>{serverError.message}</div>
                </div>
              </div>
            </DrvCard>
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <DrvLeaveField theme={t} zh="假別" en="leave_type">
            <DrvLeaveTypeChips theme={t} value={leaveType} />
          </DrvLeaveField>

          <DrvLeaveField theme={t} zh="起始時間 · Asia/Taipei (UTC+8)" en="start_time" error={errors.startTime} focused={focusField === 'start'}>
            <DrvLeaveInput theme={t} value={startLocal} mono />
          </DrvLeaveField>

          <DrvLeaveField theme={t} zh="結束時間 · Asia/Taipei (UTC+8)" en="end_time" error={errors.endTime} focused={focusField === 'end'}>
            <DrvLeaveInput theme={t} value={endLocal} mono />
          </DrvLeaveField>

          <div style={{ fontSize: 10.5, color: t.textDim, marginTop: -8, marginBottom: 16, lineHeight: 1.5 }}>
            必須 <span style={{ fontFamily: DRV_MONO }}>endTime &gt; startTime</span>，且起始時間不得早於現在時間 15 分鐘以上（容許緊急請假寬限）。伺服器以 UTC 儲存並回傳 <span style={{ fontFamily: DRV_MONO }}>LEAVE_INVALID_TIME_RANGE</span>。
          </div>

          <DrvLeaveField theme={t} zh="請假事由" en="reason" error={errors.reason} focused={focusField === 'reason'}>
            <DrvLeaveTextarea theme={t} value={reason} ph="請簡述請假原因…" />
          </DrvLeaveField>
        </div>
      </div>

      <DrvStickyAction theme={t}
        info={submitting ? '送出中，請勿關閉頁面 · submitting' : null}
        primary={<DrvBigBtn theme={t} kind="primary" icon={submitting ? 'refresh' : 'check'} disabled={submitting}>
          {submitting ? '送出中… · submitting' : '送出申請 · submit'}
        </DrvBigBtn>} />

      {keyboard === 'ios' && <IOSKeyboard dark={t.mode === 'dark'} />}
      {keyboard === 'android' && <AndroidKeyboard />}
    </div>
  );
}

// ── /leave/[id] — 假單詳情與撤回 (detail + withdraw, spec group 1 + 3) ──────
// variant: 'pending' (withdraw available) · 'approved' (impactedShiftIds) ·
//          'rejected' (reviewNotes) · 'withdrawn' (read-only terminal) · 'forbidden' (403)
function DRV_LeaveDetail({ theme: t, record, variant = 'pending' }) {
  if (variant === 'forbidden') {
    return (
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        <DrvAppBar theme={t} title="假單詳情 · leave detail" back />
        <DrvEmpty theme={t} reason="permission_denied" message="您沒有權限檢視此假單，僅能查看自己名下的申請紀錄。" />
      </div>
    );
  }

  const r = record || FX_DRIVER_LEAVES.find(x => x.status === variant) || FX_DRIVER_LEAVES[0];
  const type = DRV_LEAVE_TYPE_LABELS[r.leaveType];
  const st = DRV_LEAVE_STATUS_LABEL[r.status];
  const terminal = r.status !== 'pending';

  return (
    <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
      <DrvAppBar theme={t} title="假單詳情 · leave detail" back />
      <div style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ padding: '16px 16px 0' }}>
          <DrvCard theme={t} padding={18}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <DrvPill theme={t} tone={DRV_LEAVE_STATUS_TONE[r.status]} dot en={st.en}>{st.zh}</DrvPill>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 10.5, color: t.textDim, fontFamily: DRV_MONO }}>{r.leaveId}</span>
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: t.text, marginTop: 10 }}>{type.zh} <span style={{ fontFamily: DRV_MONO, fontSize: 12, fontWeight: 500, opacity: 0.6 }}>· {type.en}</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14, paddingTop: 14, borderTop: '1px solid ' + t.border }}>
              <DRV_ShiftField theme={t} zh="起始 · Asia/Taipei" en="start_time" value={r.startTime.slice(0, 16).replace('T', ' ')} mono />
              <DRV_ShiftField theme={t} zh="結束 · Asia/Taipei" en="end_time" value={r.endTime.slice(0, 16).replace('T', ' ')} mono />
            </div>
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid ' + t.border }}>
              <DrvBi zh="請假事由" en="reason" theme={t} size={10.5} />
              <div style={{ fontSize: 13, color: t.text, marginTop: 4, lineHeight: 1.5 }}>{r.reason}</div>
            </div>
          </DrvCard>
        </div>

        {r.status === 'approved' && r.impactedShiftIds.length > 0 && (
          <div style={{ padding: '14px 16px 0' }}>
            <DrvSection theme={t} zh="受影響班次 · 已調離" en="impacted_shifts" dense>
              <DrvCard theme={t} padding={0}>
                {r.impactedShiftIds.map((sid, i, a) => (
                  <div key={sid} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderBottom: i < a.length - 1 ? '1px solid ' + t.border : 'none' }}>
                    <DrvIcon name="warn" size={14} stroke={2} style={{ color: t.warn }} />
                    <span style={{ flex: 1, fontSize: 12.5, fontFamily: DRV_MONO, color: t.text }}>{sid}</span>
                    <DrvPill theme={t} tone="warn" dot>請假調離</DrvPill>
                  </div>
                ))}
              </DrvCard>
            </DrvSection>
          </div>
        )}

        {(r.status === 'rejected' || r.status === 'approved') && r.reviewNotes && (
          <div style={{ padding: '14px 16px 0' }}>
            <DrvSection theme={t} zh="主管審核備註" en="review_notes" dense>
              <DrvCard theme={t} accent={r.status === 'rejected' ? t.danger : t.success}>
                <div style={{ fontSize: 12.5, color: t.text, lineHeight: 1.5 }}>{r.reviewNotes}</div>
                <div style={{ fontSize: 10.5, color: t.textDim, marginTop: 6, fontFamily: DRV_MONO }}>{r.reviewedByPrincipalId} · {r.reviewedAt && r.reviewedAt.slice(0, 16).replace('T', ' ')} UTC</div>
              </DrvCard>
            </DrvSection>
          </div>
        )}

        {terminal && (
          <div style={{ padding: '14px 16px 24px' }}>
            <DrvCard theme={t} style={{ background: t.surfaceLo }}>
              <div style={{ fontSize: 11.5, color: t.textMuted, display: 'flex', alignItems: 'center', gap: 6 }}>
                <DrvIcon name="lock" size={13} stroke={2} />此假單已為終態，不再提供撤回或修改動作 · terminal state, no further mutation
              </div>
            </DrvCard>
          </div>
        )}
      </div>

      {!terminal && (
        <DrvStickyAction theme={t} info="核准前可自行撤回 · withdrawable before review"
          primary={<DrvBigBtn theme={t} kind="outline" danger icon="x">撤回申請 · withdraw</DrvBigBtn>} />
      )}
    </div>
  );
}

Object.assign(window, {
  DRV_LEAVE_TYPE_LABELS, DRV_LEAVE_STATUS_TONE, DRV_LEAVE_STATUS_LABEL, FX_DRIVER_LEAVES,
  DRV_LeaveList, DRV_LeaveCreate, DRV_LeaveDetail,
});
