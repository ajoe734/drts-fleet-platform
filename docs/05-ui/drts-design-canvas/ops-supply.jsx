// ops-supply.jsx — Packet 3 · Ops Console 增量. EXTENDS Ops Console (red realm).
// (A) Dispatch candidate panel with eligibility/reason/freshness. (B) Reports: daily dispatch record + 6-month summary.
// Reuses OPS_NAV/OPS_ACTOR + mgmt primitives. zh-TW.

// ── eligibility decision badge ───────────────────────────────────────────────
function EligBadge({ theme: th, decision }) {
  const m = {
    eligible:               { zh: '符合', en: 'eligible', tone: 'success' },
    conditionally_eligible: { zh: '條件符合', en: 'conditionally', tone: 'warn' },
    ineligible:             { zh: '不符', en: 'ineligible', tone: 'danger' },
  }[decision] || {};
  return <Pill theme={th} tone={m.tone} dot>{m.zh}<span style={{ marginLeft: 4, opacity: .6, fontFamily: SHELL_MONO, fontSize: 9.5 }}>{m.en}</span></Pill>;
}
function FreshBadge({ theme: th, state }) {
  const m = {
    fresh:        { zh: 'fresh', tone: 'success' },
    stale:        { zh: 'stale', tone: 'warn' },
    low_accuracy: { zh: 'low-acc', tone: 'warn' },
    missing:      { zh: 'missing', tone: 'danger' },
  }[state] || {};
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontFamily: SHELL_MONO, color: th[m.tone], background: th[m.tone + 'Bg'], border: '1px solid ' + th[m.tone + 'Border'], padding: '2px 7px', borderRadius: 999 }}><MgmtIcon name="pin" size={10} />{m.zh}</span>;
}

const FX_CANDIDATES = [
  { id: 'd_8821', name: '林志偉', plate: 'ARJ-2891', svc: 'credit_card_airport_transfer', readiness: 'ready', decision: 'eligible', eta: '6 分', dist: '2.1km', fresh: 'fresh', hard: [], soft: [], missing: [] },
  { id: 'd_8843', name: '陳俊宏', plate: 'ARJ-3120', svc: 'credit_card_airport_transfer', readiness: 'ready', decision: 'conditionally_eligible', eta: '9 分', dist: '3.4km', fresh: 'stale', hard: [], soft: ['LOCATION_STALE'], missing: [] },
  { id: 'd_8870', name: '張育成', plate: 'ARJ-3401', svc: 'credit_card_airport_transfer', readiness: 'not_ready', decision: 'ineligible', eta: '—', dist: '5.0km', fresh: 'fresh', hard: ['AIRPORT_PERMIT_MISSING'], soft: [], missing: ['機場接送資格證'] },
  { id: 'd_8881', name: '吳鎮宇', plate: 'ARJ-3502', svc: 'credit_card_airport_transfer', readiness: 'not_ready', decision: 'ineligible', eta: '—', dist: '4.2km', fresh: 'low_accuracy', hard: ['DRIVER_REGISTRATION_EXPIRED'], soft: [], missing: ['登記證更新'] },
];

// ── A · Dispatch candidate panel (eligibility awareness) ─────────────────────
function OC_EligibilityPanel({ theme: th, variant = 'normal' }) {
  const eligibleOnly = FX_CANDIDATES.filter(c => c.decision !== 'ineligible');
  const showAll = variant === 'include_ineligible' || variant === 'no_supply';
  const list = variant === 'no_supply' ? [] : (showAll ? FX_CANDIDATES : eligibleOnly);
  return (
    <Shell theme={th} nav={OPS_NAV} active="dispatch"
      breadcrumb={['即時派遣', '候選 · eligibility']} env="production" actor={OPS_ACTOR} health={OPS_HEALTH}
      refreshTier="dispatch" dataFreshness="fresh">
      <PageHeader theme={th} title="派車候選 · Eligibility"
        subtitle="ord_8233 · 信用卡機場接送 · credit_card_airport_transfer · policy v2026.06"
        meta={<>
          <Pill theme={th} tone="info">service product · exact</Pill>
          <Pill theme={th} tone="neutral">policy v2026.06</Pill>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, color: th.textMuted }}>
            <Toggle theme={th} on={showAll} label="顯示被排除候選 · includeIneligible" />
          </span>
        </>} />

      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {variant === 'recheck_conflict' && (
            <Banner theme={th} tone="danger" icon="warn" title="ELIGIBILITY_CHANGED_BEFORE_ASSIGNMENT · 409"
              body="指派前重新評估發現 陳俊宏 資格已變更（定位轉為 stale）。請重新選擇候選，系統不允許硬指派。"
              actions={<Btn theme={th} variant="primary" icon="refresh">重新評估候選</Btn>} />
          )}
          {variant === 'no_supply'
            ? <Card theme={th} title="無符合供給 · NO_ELIGIBLE_SUPPLY">
                <Banner theme={th} tone="warn" icon="warn" title="此時段 / 地點無符合候選 — 但有原因"
                  body="不可只顯示『無車』。下列為被排除原因，協助調度理解缺口：" />
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[['AIRPORT_PERMIT_MISSING', '2 位司機缺機場接送資格證'], ['DRIVER_REGISTRATION_EXPIRED', '1 位司機登記證過期'], ['LOCATION_STALE', '3 位司機定位過期，暫不可靠']].map(([c, d], i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: '1px solid ' + th.border, borderRadius: 8 }}>
                      <MgmtIcon name="warn" size={14} style={{ color: th.warn }} />
                      <code style={{ fontSize: 11.5, fontFamily: SHELL_MONO, color: th.danger }}>{c}</code>
                      <span style={{ flex: 1, fontSize: 12.5, color: th.text }}>{d}</span>
                    </div>
                  ))}
                </div>
              </Card>
            : <Card theme={th} title={'候選列表 · ' + list.length + ' 位'} subtitle="精確 service product · readiness · decision · reason · freshness (VQ-1)" padding={0}>
                {list.map((c, i) => {
                  const dim = c.decision === 'ineligible';
                  return (
                    <div key={c.id} style={{ display: 'flex', gap: 12, padding: '14px 16px', borderTop: i ? '1px solid ' + th.borderSoft : 'none', opacity: dim ? 0.62 : 1, background: dim ? th.surfaceLo : 'transparent' }}>
                      <div style={{ flexShrink: 0, width: 40, height: 40, borderRadius: 10, background: th.accentBg, color: th.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{c.name.slice(0, 1)}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 13.5, fontWeight: 700 }}>{c.name}</span>
                          <span style={{ fontSize: 11, fontFamily: SHELL_MONO, color: th.textDim }}>{c.plate}</span>
                          <EligBadge theme={th} decision={c.decision} />
                          <Pill theme={th} tone={c.readiness === 'ready' ? 'success' : 'warn'}>{c.readiness}</Pill>
                          <FreshBadge theme={th} state={c.fresh} />
                        </div>
                        <div style={{ marginTop: 5, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                          <span style={{ fontSize: 11, color: th.textMuted }}>ETA {c.eta} · {c.dist}</span>
                          {c.hard.map(h => <span key={h} style={{ fontSize: 10.5, padding: '2px 7px', borderRadius: 999, background: th.dangerBg, color: th.danger, border: '1px solid ' + th.dangerBorder, fontFamily: SHELL_MONO }}>hard · {h}</span>)}
                          {c.soft.map(s => <span key={s} style={{ fontSize: 10.5, padding: '2px 7px', borderRadius: 999, background: th.warnBg, color: th.warn, border: '1px solid ' + th.warnBorder, fontFamily: SHELL_MONO }}>soft · {s}</span>)}
                          {c.missing.map(m => <span key={m} style={{ fontSize: 10.5, color: th.textMuted }}>缺：{m}</span>)}
                        </div>
                      </div>
                      <div style={{ flexShrink: 0, alignSelf: 'center' }}>
                        {c.decision === 'eligible' && <Btn theme={th} size="xs" variant="primary">指派</Btn>}
                        {c.decision === 'conditionally_eligible' && <Btn theme={th} size="xs" variant="secondary" icon="warn">override 指派</Btn>}
                        {c.decision === 'ineligible' && <Btn theme={th} size="xs" variant="ghost" disabled title="hard reason 不可 override">不可指派</Btn>}
                      </div>
                    </div>
                  );
                })}
              </Card>}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card theme={th} title="reason code 說明" subtitle="hard 不可 override · soft 可由有權限 Ops override">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, fontSize: 12.5 }}>
              <div style={{ display: 'flex', gap: 8 }}><Pill theme={th} tone="danger">hard</Pill><span style={{ color: th.textMuted }}>資格硬性不符，不可指派（如證照缺/過期）。</span></div>
              <div style={{ display: 'flex', gap: 8 }}><Pill theme={th} tone="warn">soft</Pill><span style={{ color: th.textMuted }}>條件性，有權限 Ops 可填原因 override（如定位 stale）。</span></div>
            </div>
          </Card>
          <Card theme={th} title="soft override" subtitle="送出後寫 audit">
            <Field theme={th} label="override 原因（必填）"><div style={{ border: '1px solid ' + th.border, borderRadius: 8, padding: '10px 12px', minHeight: 52, fontSize: 12.5, color: th.textDim }}>說明為何在 soft reason 下仍指派…</div></Field>
            <Btn theme={th} variant="secondary" icon="check">確認 override</Btn>
          </Card>
          <Card theme={th} title="location freshness" subtitle="SA §6.5">
            <DL theme={th} cols={1} items={[
              { k: 'fresh', v: '≤ 90s 且 accuracy ≤ 100m', mono: true },
              { k: 'stale', v: '> 90s', mono: true },
              { k: 'low_accuracy', v: 'accuracy > 100m', mono: true },
              { k: 'missing', v: '無定位', mono: true },
            ]} />
          </Card>
        </div>
      </div>
    </Shell>
  );
}

// ── B · Operational reports ──────────────────────────────────────────────────
const FX_DAILY_RECORDS = [
  { order: 'ord_8232', no: 'A-2206-001', source: 'partner_booking', tenant: 'CTBC', svc: 'credit_card_airport_transfer', req: '07:02', firstDispatch: '07:03', firstAssign: '07:05', driver: '陳俊宏', plate: 'ARJ-3120', eta: 720, arrived: '07:28', started: '07:30', completed: '08:05', status: 'completed', redispatch: 0, complaints: 0 },
  { order: 'ord_8231', no: 'A-2206-002', source: 'tenant_portal', tenant: 'TSMC', svc: 'enterprise_dispatch', req: '08:50', firstDispatch: '08:51', firstAssign: '08:53', driver: '林志偉', plate: 'ARJ-2891', eta: 540, arrived: null, started: '09:20', completed: '10:02', status: 'completed', redispatch: 1, complaints: 0, flag: 'ARRIVAL_EVENT_MISSING' },
  { order: 'ord_8245', no: 'A-2206-003', source: 'phone', tenant: '—', svc: 'taxi_realtime', req: '16:00', firstDispatch: '16:00', firstAssign: '16:02', driver: '張育成', plate: 'ARJ-3401', eta: 300, arrived: '16:07', started: '16:08', completed: '16:30', status: 'completed', redispatch: 0, complaints: 1 },
  { order: 'ord_8198', no: 'A-2206-004', source: 'ops_console', tenant: 'YAMATO', svc: 'enterprise_dispatch', req: '10:00', firstDispatch: '10:01', firstAssign: null, driver: '—', plate: '—', eta: null, arrived: null, started: null, completed: null, status: 'cancelled', redispatch: 2, complaints: 0 },
];
const SOURCE_ZH = { phone: '電話', ops_console: 'Ops台', tenant_portal: '租戶', partner_booking: '合作預約', api: 'API', third_party_platform: '第三方' };

function OC_OpsReports({ theme: th, report = 'daily' }) {
  return (
    <Shell theme={th} nav={OPS_NAV} active="reports"
      breadcrumb={['營運監控', '營運報表']} env="production" actor={OPS_ACTOR} health={OPS_HEALTH}
      refreshTier="manual" dataFreshness="fresh">
      <PageHeader theme={th} title="營運報表 · Operational Reports"
        subtitle="固定口徑 · 不前端自算 · SA §7.4"
        tabs={[{ id: 'daily', label: '每日派遣紀錄', badge: '' }, { id: 'summary', label: '半年營運摘要' }]}
        activeTab={report}
        meta={<><Select theme={th} value="期間：2026-06-04" /><Select theme={th} value="營業區：全部" /><Select theme={th} value="服務產品：全部" /><Select theme={th} value="來源：全部" /></>}
        actions={<><Btn theme={th} icon="refresh">重算</Btn><Btn theme={th} icon="export">匯出</Btn></>} />

      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* metadata + quality flags (VQ-5) */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <Pill theme={th} tone="neutral">generatedAt · 06-05 02:10</Pill>
          <Pill theme={th} tone="success">report · ready</Pill>
          <Pill theme={th} tone="warn" dot>coverage 93.2% · 資料不完整</Pill>
          <Pill theme={th} tone="warn">source freshness · 1 source stale</Pill>
          <span style={{ flex: 1 }} />
          <Btn theme={th} size="xs" variant="ghost" icon="export">CSV</Btn>
          <Btn theme={th} size="xs" variant="ghost" icon="export">XLSX</Btn>
          <Btn theme={th} size="xs" variant="ghost" icon="export">PDF</Btn>
        </div>

        {report === 'summary' ? (
          <>
            <Banner theme={th} tone="warn" icon="warn" title="SUPPLY_SNAPSHOT_COVERAGE_LOW · coverage 93.2% < 95%"
              body="平均可派車數的有效快照覆蓋率低於門檻，數字標示為『資料不完整』，僅供參考。" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              <Kpi theme={th} label="需求請求數" en="demandRequestCount" value="284,120" sub="distinct orderId · 含取消" />
              <Kpi theme={th} label="實際派遣數" en="actualDispatchCount" value="268,940" sub="首次成功 assign · 不重計" />
              <Kpi theme={th} label="完成趟次" en="completedTripCount" value="251,308" sub="distinct completed" />
              <Kpi theme={th} label="平均可派車數" en="avgDispatchableVehicle" value="312" sub="coverage 93.2%" tone="warn" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
              <Card theme={th} title="口徑與覆蓋 · definitions & coverage" subtitle="VQ-6 · 數字 + coverage 並陳">
                <DL theme={th} cols={1} items={[
                  { k: 'validSnapshotCount', v: '40,210', mono: true },
                  { k: 'expectedSnapshotCount', v: '43,140', mono: true },
                  { k: 'coverageRate', v: '93.2% (< 95%)', mono: true },
                  { k: 'demandRequestCount', v: '不含 draft / validation failed / test / duplicate replay；取消仍計', mono: false },
                  { k: 'actualDispatchCount', v: 'redispatch 不重計；broadcast/failed/lost race 不計', mono: false },
                ]} />
              </Card>
              <Card theme={th} title="客訴統計 · complaintCount" subtitle="distinct case · 依 category">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[['服務態度', 142], ['繞路 / 路線', 88], ['車輛清潔', 41], ['費用爭議', 67]].map(([c, n], i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ width: 80, fontSize: 12, color: th.textMuted }}>{c}</span>
                      <div style={{ flex: 1, height: 8, background: th.surfaceLo, borderRadius: 4, overflow: 'hidden' }}><div style={{ width: (n / 142 * 100) + '%', height: '100%', background: th.accent }} /></div>
                      <span style={{ fontFamily: SHELL_MONO, fontSize: 12, width: 36, textAlign: 'right' }}>{n}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
            <Card theme={th} title="匯出 · export" subtitle="半年摘要 PDF / CSV / JSON · on-demand 重算">
              <div style={{ display: 'flex', gap: 8 }}><Btn theme={th} icon="export">PDF</Btn><Btn theme={th} icon="export">CSV</Btn><Btn theme={th} icon="export">JSON</Btn><span style={{ flex: 1 }} /><Btn theme={th} variant="secondary" icon="refresh">指定區間重算</Btn></div>
            </Card>
          </>
        ) : (
          <Card theme={th} title="每日派遣紀錄 · DispatchDailyRecord" subtitle="2026-06-04 · 固定欄位口徑" padding={0}>
            <Table theme={th} columns={[
              { h: 'orderNo', k: 'no', w: 110, mono: true },
              { h: '來源', w: 90, r: r => <Pill theme={th} tone="neutral">{SOURCE_ZH[r.source]}</Pill> },
              { h: '租戶', k: 'tenant', w: 78 },
              { h: 'service product', w: 180, r: r => <span style={{ fontFamily: SHELL_MONO, fontSize: 11 }}>{r.svc}</span> },
              { h: 'req', k: 'req', w: 64, mono: true },
              { h: '首派', k: 'firstDispatch', w: 64, mono: true },
              { h: '首指', w: 64, mono: true, r: r => r.firstAssign || '—' },
              { h: '司機 / 車', w: 120, r: r => r.driver === '—' ? '—' : <span>{r.driver} · <span style={{ fontFamily: SHELL_MONO, fontSize: 11 }}>{r.plate}</span></span> },
              { h: 'ETA(s)', w: 70, mono: true, align: 'right', r: r => r.eta ?? '—' },
              { h: '抵達', w: 78, mono: true, r: r => r.arrived ? r.arrived : <span style={{ color: th.warn, fontSize: 10.5 }} title="ARRIVAL_EVENT_MISSING">null ⚠</span> },
              { h: '完成', w: 70, mono: true, r: r => r.completed || '—' },
              { h: '狀態', w: 90, r: r => <Pill theme={th} tone={r.status === 'completed' ? 'success' : 'neutral'} dot>{r.status}</Pill> },
              { h: 'redisp', w: 60, mono: true, align: 'center', r: r => r.redispatch },
              { h: '客訴', w: 56, mono: true, align: 'center', r: r => r.complaints },
            ]} rows={FX_DAILY_RECORDS} />
            <div style={{ padding: '12px 16px', borderTop: '1px solid ' + th.border }}>
              <Banner theme={th} tone="warn" icon="info" body="ARRIVAL_EVENT_MISSING：無 arrived 事件時 arrivedPickupAt 為 null，不可用 tripStartedAt 倒推（SA §7.3）。" />
            </div>
          </Card>
        )}
      </div>
    </Shell>
  );
}

Object.assign(window, {
  EligBadge, FreshBadge, FX_CANDIDATES, OC_EligibilityPanel,
  FX_DAILY_RECORDS, SOURCE_ZH, OC_OpsReports,
});
