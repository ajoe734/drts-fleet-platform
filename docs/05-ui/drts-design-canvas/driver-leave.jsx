// driver-leave.jsx — SR-LEAVE-FE-001-CANVAS · Driver App 增量 (N01 / C052).
// EXTENDS Driver App (RN/Expo look, blue realm). Reuses DrvCard/DrvPill/DrvSection/
// DrvBigBtn/DrvEmpty/DrvIcon/DrvStickyAction from driver-primitives.jsx.
// Authority: docs/04-uat/system-remediation-20260906/feature-contracts.md §2
// (Driver Leave Workflow) + packages/contracts/src/system-remediation.ts.
// Five requirement groups (契約 §2.3/§2.5/§2.6 traceability):
//   1. DRV_LeaveList          — 列表 / empty (GET /api/driver-leave/requests)
//   2. DRV_LeaveForm          — 申請 + 日期驗證 (POST /requests, 400/409 errors)
//   3. DRV_LeaveDetail        — 詳情 / 撤回 / 終態 (POST /:id/withdraw)
//      + DRV_LeaveConflict    — 撤回競爭與共用錯誤 (409/400/403/404, §2.6)
//   4. DRV_LeaveShiftImpact   — 主管決定後班表連動 (leaveReassigned / impactedShiftIds)
//   5. DRV_LeaveDispatchConflict — 出勤與在線防護 (409 DRIVER_ON_LEAVE)
// zh-TW · raw_code 雙語. All times shown in Asia/Taipei (UTC+8) with raw UTC kept
// alongside per record, matching DriverLeaveRecord.startTime/endTime (ISO 8601 UTC).
// Fixture identity: every FX_DRV_LEAVE record belongs to the same driver
// (driverId: 'drv_0186' · 吳明翰), matching the forced driverId filter on
// GET /requests. ops-leave.jsx FX_OPS_LEAVE mirrors the same leaveId → driverId
// mapping for these records so the two canvases stay cross-consistent (SA §6.8).

const DRV_LEAVE_TYPE = {
  annual:      { zh: '特休',     tone: 'info' },
  sick:        { zh: '病假',     tone: 'warn' },
  personal:    { zh: '事假',     tone: 'neutral' },
  bereavement: { zh: '喪假',     tone: 'neutral' },
  emergency:   { zh: '緊急事假', tone: 'danger' },
};

const DRV_LEAVE_STATUS = {
  pending:   { zh: '待審核', tone: 'warn' },
  approved:  { zh: '已核准', tone: 'success' },
  rejected:  { zh: '已駁回', tone: 'danger' },
  withdrawn: { zh: '已撤回', tone: 'neutral' },
};

// Fixture aligned with DriverLeaveRecord (system-remediation.ts:38-52). UTC is the
// wire value; zh range is the Asia/Taipei (UTC+8) display derived from it.
const FX_DRV_LEAVE = [
  {
    leaveId: 'lv_d82a1b5c', driverId: 'drv_0186', leaveType: 'personal', status: 'pending',
    zhRange: '09/10（四）16:00–21:00', startTime: '2026-09-10T08:00:00.000Z', endTime: '2026-09-10T13:00:00.000Z',
    reason: '家中臨時事務，需請假處理。', impactedShiftIds: [], reviewNotes: null, reviewedAt: null,
    createdAt: '2026-09-10T07:42:00.000Z',
  },
  {
    leaveId: 'lv_9c31a204', driverId: 'drv_0186', leaveType: 'annual', status: 'approved',
    zhRange: '09/14（一）08:00 – 09/16（三）23:59', startTime: '2026-09-14T00:00:00.000Z', endTime: '2026-09-16T15:59:00.000Z',
    reason: '家庭旅遊，已提前排班交接。', impactedShiftIds: ['shift_2291', 'shift_2292'],
    reviewNotes: '已核准，對應班次已標記調離。', reviewedAt: '2026-09-08T02:10:00.000Z', reviewedBy: '王芳 · ops_manager',
    createdAt: '2026-09-05T09:00:00.000Z',
  },
  {
    leaveId: 'lv_71e9f830', driverId: 'drv_0186', leaveType: 'sick', status: 'rejected',
    zhRange: '09/05（六）09:00–18:00', startTime: '2026-09-05T01:00:00.000Z', endTime: '2026-09-05T10:00:00.000Z',
    reason: '身體不適。', impactedShiftIds: [],
    reviewNotes: '未附診斷證明，請補件後重新申請。', reviewedAt: '2026-09-05T02:00:00.000Z', reviewedBy: '王芳 · ops_manager',
    createdAt: '2026-09-05T00:50:00.000Z',
  },
  {
    leaveId: 'lv_5b204a11', driverId: 'drv_0186', leaveType: 'emergency', status: 'withdrawn',
    zhRange: '09/03（四）21:00 – 09/04（五）01:00', startTime: '2026-09-03T13:00:00.000Z', endTime: '2026-09-03T17:00:00.000Z',
    reason: '臨時通知取消，已能正常排班。', impactedShiftIds: [], reviewNotes: null, reviewedAt: null,
    createdAt: '2026-09-03T12:50:00.000Z',
  },
];

function LeaveTypeChip({ theme: t, type }) {
  const m = DRV_LEAVE_TYPE[type];
  return <DrvPill theme={t} tone={m.tone}>{m.zh}<span style={{ marginLeft: 4, opacity: 0.6, fontFamily: DRV_MONO, fontSize: 9.5 }}>{type}</span></DrvPill>;
}
function LeaveStatusChip({ theme: t, status }) {
  const m = DRV_LEAVE_STATUS[status];
  return <DrvPill theme={t} tone={m.tone} dot>{m.zh}<span style={{ marginLeft: 4, opacity: 0.6, fontFamily: DRV_MONO, fontSize: 9.5 }}>{status}</span></DrvPill>;
}

// ── 1 · List / empty (GET /api/driver-leave/requests, driverId 強制過濾) ──────
function DRV_LeaveList({ theme: t, variant = 'default' }) {
  const empty = variant === 'empty';
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto', background: t.bg, padding: 16 }}>
        <DrvSection theme={t} zh="我的請假" en="my-leave" dense>
          {empty ? (
            <DrvEmpty theme={t} reason="no_data" message="尚無任何請假紀錄。點擊下方按鈕提出新的請假申請。" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {FX_DRV_LEAVE.map((lv) => (
                <DrvCard theme={t} key={lv.leaveId} accent={t[DRV_LEAVE_STATUS[lv.status].tone]}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                    <LeaveTypeChip theme={t} type={lv.leaveType} />
                    <LeaveStatusChip theme={t} status={lv.status} />
                    <span style={{ flex: 1 }} />
                    <DrvIcon name="chevR" size={16} style={{ color: t.textDim }} />
                  </div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: t.text, marginBottom: 4 }}>{lv.zhRange}</div>
                  <div style={{ fontSize: 11.5, color: t.textMuted, lineHeight: 1.5 }}>{lv.reason}</div>
                  {lv.impactedShiftIds.length > 0 && (
                    <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <DrvIcon name="link" size={13} style={{ color: t.warn }} />
                      <span style={{ fontSize: 11, color: t.warn, fontWeight: 600 }}>{lv.impactedShiftIds.length} 個班次已調離</span>
                    </div>
                  )}
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid ' + t.surfaceLo, fontSize: 10.5, fontFamily: DRV_MONO, color: t.textDim }}>{lv.leaveId}</div>
                </DrvCard>
              ))}
            </div>
          )}
        </DrvSection>
      </div>
      <DrvStickyAction theme={t} primary={<DrvBigBtn theme={t} kind="primary" icon="plus">申請請假</DrvBigBtn>} />
    </div>
  );
}

// variant → demo start/end pair + which field carries the LEAVE_INVALID_TIME_RANGE
// error. §2.6 maps that single code to three distinct causes (endTime<=startTime,
// invalid date format, or start > 15min in the past) — each gets its own variant
// so the error contract is fully demonstrated, not just the "too early" case.
const DRV_LEAVE_FORM_VARIANT = {
  default:       { startZh: '2026-09-10 16:00', startUtc: '2026-09-10T08:00:00Z', endZh: '2026-09-10 21:00', endUtc: '2026-09-10T13:00:00Z' },
  error_range:   { startZh: '2026-09-01 09:00', startUtc: '2026-09-01T01:00:00Z', endZh: '2026-09-10 21:00', endUtc: '2026-09-10T13:00:00Z',
                   field: 'start', msg: 'LEAVE_INVALID_TIME_RANGE · 起始時間不得早於現在 15 分鐘以上（MAX_PAST_APPLICATION_GRACE_MS）' },
  error_order:   { startZh: '2026-09-10 21:00', startUtc: '2026-09-10T13:00:00Z', endZh: '2026-09-10 16:00', endUtc: '2026-09-10T08:00:00Z',
                   field: 'end', msg: 'LEAVE_INVALID_TIME_RANGE · 結束時間必須晚於開始時間（endTime <= startTime）' },
  error_invalid: { startZh: '2026-13-45 99:99', startUtc: '（無法解析為合法日期）', endZh: '2026-09-10 21:00', endUtc: '2026-09-10T13:00:00Z',
                   field: 'start', msg: 'LEAVE_INVALID_TIME_RANGE · 日期格式無效，請重新選擇' },
  // overlaps lv_9c31a204 (approved, 09/14 00:00 – 09/16 15:59 UTC): this request's
  // 09/15 UTC window sits fully inside that range, so the 409 below is genuine.
  error_overlap: { startZh: '2026-09-15 09:00', startUtc: '2026-09-15T01:00:00Z', endZh: '2026-09-15 18:00', endUtc: '2026-09-15T10:00:00Z' },
  keyboard:      { startZh: '2026-09-10 16:00', startUtc: '2026-09-10T08:00:00Z', endZh: '2026-09-10 21:00', endUtc: '2026-09-10T13:00:00Z' },
};

// ── 2 · New request + date/timezone validation (POST /requests) ─────────────
// variant: default | error_range | error_order | error_invalid (all three
//          400 LEAVE_INVALID_TIME_RANGE causes, §2.6) |
//          error_overlap (409 LEAVE_OVERLAPPING_REQUEST) | keyboard (focus safe-area)
function DRV_LeaveForm({ theme: t, variant = 'default' }) {
  const cfg = DRV_LEAVE_FORM_VARIANT[variant] || DRV_LEAVE_FORM_VARIANT.default;
  const startErr = cfg.field === 'start' ? cfg.msg : null;
  const endErr = cfg.field === 'end' ? cfg.msg : null;
  const errOverlap = variant === 'error_overlap';
  const keyboardOpen = variant === 'keyboard';

  const FieldRow = ({ label, children, error }) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: t.textMuted, marginBottom: 6 }}>{label}</div>
      {children}
      {error && <div style={{ fontSize: 11, color: t.danger, marginTop: 5, lineHeight: 1.4 }}>{error}</div>}
    </div>
  );
  const box = (border) => ({
    display: 'flex', alignItems: 'center', gap: 8, padding: '11px 12px',
    background: t.surface, border: '1.5px solid ' + border, borderRadius: 10, fontSize: 13.5, color: t.text,
  });

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto', background: t.bg, padding: 16 }}>
        <DrvSection theme={t} zh="申請請假" en="new-leave-request" dense>
          <FieldRow label="假別 · leave type">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {Object.entries(DRV_LEAVE_TYPE).map(([k, v]) => (
                <span key={k} style={{
                  padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600,
                  border: '1.5px solid ' + (k === 'personal' ? t.brand : t.border),
                  background: k === 'personal' ? t.brandBg : t.surface,
                  color: k === 'personal' ? t.brand : t.textMuted,
                }}>{v.zh}</span>
              ))}
            </div>
          </FieldRow>

          <FieldRow label="開始時間 · start (Asia/Taipei · UTC+8)" error={startErr}>
            <div style={box(startErr ? t.danger : t.border)}>
              <DrvIcon name="clock" size={16} style={{ color: startErr ? t.danger : t.textMuted }} />
              <span style={{ flex: 1 }}>{cfg.startZh}</span>
              <span style={{ fontFamily: DRV_MONO, fontSize: 10, color: t.textDim }}>{cfg.startUtc}</span>
            </div>
          </FieldRow>

          <FieldRow label="結束時間 · end (Asia/Taipei · UTC+8)" error={endErr}>
            <div style={box(endErr ? t.danger : t.border)}>
              <DrvIcon name="clock" size={16} style={{ color: endErr ? t.danger : t.textMuted }} />
              <span style={{ flex: 1 }}>{cfg.endZh}</span>
              <span style={{ fontFamily: DRV_MONO, fontSize: 10, color: t.textDim }}>{cfg.endUtc}</span>
            </div>
          </FieldRow>

          <div style={{ marginBottom: 14, padding: '9px 11px', borderRadius: 9, background: t.infoBg, border: '1px solid ' + t.info, display: 'flex', gap: 8 }}>
            <DrvIcon name="shield" size={14} style={{ color: t.info, flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 11, color: t.text, lineHeight: 1.5 }}>畫面以裝置時區 Asia/Taipei（UTC+8）顯示；送出時轉為 UTC 標準化。允許 15 分鐘寬限期（<code style={{ fontFamily: DRV_MONO }}>MAX_PAST_APPLICATION_GRACE_MS</code>），逾期一律拒絕。</div>
          </div>

          {errOverlap && (
            <div style={{ marginBottom: 14, padding: 12, borderRadius: 10, background: t.dangerBg, border: '1px solid ' + t.danger }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <DrvIcon name="warn" size={16} style={{ color: t.danger }} />
                <span style={{ fontSize: 12.5, fontWeight: 700, color: t.danger }}>409 · LEAVE_OVERLAPPING_REQUEST</span>
              </div>
              <div style={{ fontSize: 11.5, color: t.text, lineHeight: 1.5 }}>此區間與既有假單 <code style={{ fontFamily: DRV_MONO }}>lv_9c31a204</code>（09/14–09/16 · approved）重疊，同一司機的 pending / approved 假單不得重疊送出。</div>
            </div>
          )}

          <FieldRow label="事由 · reason">
            <div style={{
              ...box(keyboardOpen ? t.brand : t.border), alignItems: 'flex-start', minHeight: 76, flexDirection: 'column',
              boxShadow: keyboardOpen ? '0 0 0 3px ' + t.brandBg : 'none',
            }}>
              <span style={{ color: t.text }}>家中臨時事務，需請假處理{keyboardOpen ? '|' : ''}</span>
            </div>
          </FieldRow>
        </DrvSection>
      </div>

      {/* Content → submit row → keyboard (bottom-most), so DrvStickyAction always
          renders above the keyboard block, never underneath it. Uses theme tokens
          (not a hardcoded palette) so the simulated keyboard tracks light/dark. */}
      <DrvStickyAction theme={t}
        info={keyboardOpen ? '送出列固定於鍵盤上緣，不被系統鍵盤遮蔽' : null}
        secondary={<DrvBigBtn theme={t} kind="outline" full={false} style={{ width: 88 }}>取消</DrvBigBtn>}
        primary={<DrvBigBtn theme={t} kind="primary" icon="check" disabled={!!cfg.field || errOverlap}>送出申請</DrvBigBtn>} />
      {keyboardOpen && (
        <div style={{ flexShrink: 0, background: t.surfaceLo, borderTop: '1px solid ' + t.border, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 10.5, color: t.textDim, fontWeight: 600, letterSpacing: 0.3 }}>iOS / Android 鍵盤 · keyboard-avoiding-view · safe-area-inset-bottom</span>
        </div>
      )}
    </div>
  );
}

// ── 3 · Detail / withdraw / terminal states (POST /:id/withdraw) ────────────
function DRV_LeaveDetail({ theme: t, variant = 'pending' }) {
  const lv = FX_DRV_LEAVE.find(x => x.status === variant) || FX_DRV_LEAVE[0];
  const terminal = variant !== 'pending';
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto', background: t.bg, padding: 16 }}>
        <DrvSection theme={t} zh="請假詳情" en="leave-detail" dense>
          <DrvCard theme={t} accent={t[DRV_LEAVE_STATUS[lv.status].tone]}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
              <LeaveTypeChip theme={t} type={lv.leaveType} />
              <LeaveStatusChip theme={t} status={lv.status} />
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, color: t.text, marginBottom: 4 }}>{lv.zhRange}</div>
            <div style={{ fontSize: 11.5, color: t.textMuted, lineHeight: 1.55 }}>{lv.reason}</div>
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid ' + t.surfaceLo, fontSize: 10.5, fontFamily: DRV_MONO, color: t.textDim, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span>{lv.leaveId}</span>
              <span>{lv.startTime} → {lv.endTime}</span>
            </div>
          </DrvCard>

          <div style={{ height: 14 }} />
          <DrvCard theme={t} style={{ padding: 16 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: t.textMuted, marginBottom: 10 }}>審核紀錄 · review timeline</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{ width: 9, height: 9, borderRadius: 5, background: t.brand }} />
                {(lv.reviewedAt || variant === 'withdrawn') && <span style={{ flex: 1, width: 1, background: t.border, margin: '3px 0' }} />}
              </div>
              <div style={{ flex: 1, paddingBottom: 12 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: t.text }}>司機提交申請</div>
                <div style={{ fontSize: 10.5, color: t.textDim, fontFamily: DRV_MONO }}>{lv.createdAt}</div>
              </div>
            </div>
            {variant === 'withdrawn' && (
              <div style={{ display: 'flex', gap: 10 }}>
                <span style={{ width: 9, height: 9, borderRadius: 5, background: t.textDim, marginLeft: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: t.text }}>司機主動撤回</div>
                  <div style={{ fontSize: 10.5, color: t.textDim, fontFamily: DRV_MONO }}>終態 · withdrawn</div>
                </div>
              </div>
            )}
            {lv.reviewedAt && (
              <div style={{ display: 'flex', gap: 10 }}>
                <span style={{ width: 9, height: 9, borderRadius: 5, background: t[DRV_LEAVE_STATUS[lv.status].tone] }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: t.text }}>{lv.status === 'approved' ? '主管核准' : '主管駁回'} · {lv.reviewedBy}</div>
                  <div style={{ fontSize: 10.5, color: t.textDim, fontFamily: DRV_MONO, marginBottom: 4 }}>{lv.reviewedAt}</div>
                  {lv.reviewNotes && (
                    <div style={{ fontSize: 12, color: t.text, background: t.surfaceLo, borderRadius: 8, padding: '8px 10px', lineHeight: 1.5 }}>{lv.reviewNotes}</div>
                  )}
                </div>
              </div>
            )}
          </DrvCard>

          {lv.impactedShiftIds.length > 0 && (
            <>
              <div style={{ height: 14 }} />
              <div style={{ padding: '10px 12px', borderRadius: 10, background: t.warnBg, border: '1px solid ' + t.warn, display: 'flex', gap: 9 }}>
                <DrvIcon name="link" size={16} style={{ color: t.warn, flexShrink: 0 }} />
                <div style={{ fontSize: 11.5, color: t.text, lineHeight: 1.5 }}>已連動 {lv.impactedShiftIds.length} 個班次調離，並停止此區間的派單媒合資格。詳見「班表連動」。</div>
              </div>
            </>
          )}
        </DrvSection>
      </div>

      {terminal ? (
        <DrvStickyAction theme={t}
          info="此假單已為終態，不可再變更"
          primary={<DrvBigBtn theme={t} kind="outline">返回列表</DrvBigBtn>} />
      ) : (
        <DrvStickyAction theme={t}
          secondary={<DrvBigBtn theme={t} kind="outline" full={false} style={{ width: 88 }}>返回</DrvBigBtn>}
          primary={<DrvBigBtn theme={t} kind="danger" icon="x">撤回申請</DrvBigBtn>} />
      )}
    </div>
  );
}

// ── 3b · Withdraw race + shared error states (§2.6 LEAVE_* contract) ────────
// variant: withdraw_conflict (409 LEAVE_INVALID_STATE_TRANSITION — driver taps
//          撤回 on DRV_LeaveDetail(variant="pending") but ops decided first) |
//          missing_fields (400 LEAVE_MISSING_REQUIRED_FIELDS) |
//          forbidden (403 LEAVE_FORBIDDEN_ACCESS) | not_found (404 LEAVE_NOT_FOUND)
// Covers the codes not otherwise shown by DRV_LeaveForm/DRV_LeaveList so
// implementation does not have to invent its own screen for them.
function DRV_LeaveConflict({ theme: t, variant = 'withdraw_conflict' }) {
  const cfg = {
    withdraw_conflict: {
      code: '409 · LEAVE_INVALID_STATE_TRANSITION', title: '此假單已被主管審核',
      body: '你嘗試撤回時，主管已完成審核決策，此假單已非 pending 狀態，撤回操作被伺服器拒絕。請重新讀取最新狀態，畫面將顯示對應的核准／駁回終態。',
      cta: '重新讀取最新狀態',
    },
    missing_fields: {
      code: '400 · LEAVE_MISSING_REQUIRED_FIELDS', title: '缺少必填欄位',
      body: '假別、開始時間、結束時間、事由皆為必填欄位；伺服器已拒絕本次送出，請返回表單完整填寫後再試一次。',
      cta: '返回表單',
    },
    forbidden: {
      code: '403 · LEAVE_FORBIDDEN_ACCESS', title: '無法存取此假單',
      body: '此假單不屬於目前登入司機帳號，driverId 強制過濾已拒絕本次查看／撤回請求。',
      cta: '返回我的請假',
    },
    not_found: {
      code: '404 · LEAVE_NOT_FOUND', title: '找不到此假單',
      body: '指定的 leaveId 不存在，可能已被刪除或連結已失效。',
      cta: '返回我的請假',
    },
  }[variant];
  return (
    <div style={{ flex: 1, overflowY: 'auto', background: t.bg, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <span style={{ width: 68, height: 68, borderRadius: 34, background: t.dangerBg, color: t.danger, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <DrvIcon name="lock" size={32} stroke={1.8} />
        </span>
        <div style={{ fontSize: 18, fontWeight: 800, color: t.text, marginBottom: 8 }}>{cfg.title}</div>
        <code style={{ fontSize: 11, fontFamily: DRV_MONO, color: t.danger, background: t.dangerBg, padding: '3px 10px', borderRadius: 999, marginBottom: 12 }}>{cfg.code}</code>
        <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.65, maxWidth: 300 }}>{cfg.body}</div>
      </div>
      <div style={{ padding: 16, borderTop: '1px solid ' + t.border, background: t.surface }}>
        <DrvBigBtn theme={t} kind="outline" icon="refresh">{cfg.cta}</DrvBigBtn>
      </div>
    </div>
  );
}

// ── 4 · Shift reassignment linkage (record.leaveReassigned / impactedShiftIds) ─
function DRV_LeaveShiftImpact({ theme: t }) {
  const shifts = [
    { id: 'shift_2291', zh: '09/14（一）08:00–20:00', tagged: true },
    { id: 'shift_2292', zh: '09/15（二）08:00–20:00', tagged: true },
    { id: 'shift_2293', zh: '09/17（四）08:00–20:00', tagged: false },
  ];
  return (
    <div style={{ flex: 1, overflowY: 'auto', background: t.bg, padding: 16 }}>
      <DrvSection theme={t} zh="班表連動" en="shift-reassignment-linkage" dense>
        <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 10, background: t.infoBg, border: '1px solid ' + t.info, display: 'flex', gap: 9 }}>
          <DrvIcon name="shield" size={16} style={{ color: t.info, flexShrink: 0 }} />
          <div style={{ fontSize: 11.5, color: t.text, lineHeight: 1.55 }}>核准後系統比對 <code style={{ fontFamily: DRV_MONO }}>ops.phase1_driver_shifts</code> 排班，重疊班次寫入 <code style={{ fontFamily: DRV_MONO }}>{'{ leaveReassigned: true, leaveId }'}</code> 並停止該區間可派狀態。</div>
        </div>
        {shifts.map(s => (
          <DrvCard theme={t} key={s.id} accent={s.tagged ? t.warn : t.border} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{s.zh}</div>
                <div style={{ fontSize: 10.5, fontFamily: DRV_MONO, color: t.textDim }}>{s.id}</div>
              </div>
              {s.tagged ? <DrvPill theme={t} tone="warn" dot>請假調離</DrvPill> : <DrvPill theme={t} tone="success" dot>正常排班</DrvPill>}
            </div>
          </DrvCard>
        ))}
        <div style={{ marginTop: 4, padding: '9px 11px', borderRadius: 9, background: t.surfaceLo, display: 'flex', gap: 8 }}>
          <DrvIcon name="wifi" size={14} style={{ color: t.textMuted, flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 11, color: t.textMuted, lineHeight: 1.5 }}>派單資格 <code style={{ fontFamily: DRV_MONO }}>eligibility</code> 於假期生效時自動轉為 <code style={{ fontFamily: DRV_MONO }}>ineligible</code>，並寫入 <code style={{ fontFamily: DRV_MONO }}>ops.phase1_driver_matching_suppressions</code>（reason: DRIVER_ON_LEAVE）。</div>
        </div>
      </DrvSection>
    </div>
  );
}

// ── 5 · Attendance / presence conflict during leave (409 DRIVER_ON_LEAVE) ───
function DRV_LeaveDispatchConflict({ theme: t, variant = 'clock_in_blocked' }) {
  const cfg = {
    clock_in_blocked: { title: '請假期間無法打卡上班', body: '此時段已核准請假（09/14 08:00 – 09/16 23:59），系統拒絕本次出勤打卡請求。', cta: '查看請假詳情' },
    presence_ineligible: { title: '請假期間無法上線接單', body: '請假生效中，上線請求已被系統拒絕並將可派資格設為不合格，媒合候選名單已自動排除本司機。', cta: '查看請假詳情' },
  }[variant];
  return (
    <div style={{ flex: 1, overflowY: 'auto', background: t.bg, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <span style={{ width: 68, height: 68, borderRadius: 34, background: t.dangerBg, color: t.danger, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <DrvIcon name="lock" size={32} stroke={1.8} />
        </span>
        <div style={{ fontSize: 18, fontWeight: 800, color: t.text, marginBottom: 8 }}>{cfg.title}</div>
        <code style={{ fontSize: 11, fontFamily: DRV_MONO, color: t.danger, background: t.dangerBg, padding: '3px 10px', borderRadius: 999, marginBottom: 12 }}>409 · DRIVER_ON_LEAVE</code>
        <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.65, maxWidth: 300 }}>{cfg.body}</div>
      </div>
      <div style={{ padding: 16, borderTop: '1px solid ' + t.border, background: t.surface }}>
        <DrvBigBtn theme={t} kind="outline" icon="ext">{cfg.cta}</DrvBigBtn>
      </div>
    </div>
  );
}

Object.assign(window, {
  DRV_LEAVE_TYPE, DRV_LEAVE_STATUS, FX_DRV_LEAVE, LeaveTypeChip, LeaveStatusChip,
  DRV_LeaveList, DRV_LeaveForm, DRV_LeaveDetail, DRV_LeaveConflict, DRV_LeaveShiftImpact, DRV_LeaveDispatchConflict,
});
