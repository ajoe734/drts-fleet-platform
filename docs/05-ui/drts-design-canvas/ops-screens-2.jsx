// ops-screens-2.jsx — Complaints / Incidents / Approval Requests / Reports / Revenue

// ─────────────────────────────────────────────────────────────────────────────
// 5. /complaints — case triage (SLA backend-computed per Q-OPS13)
// ─────────────────────────────────────────────────────────────────────────────
function OC_Complaints({ theme: th }) {
  return (
    <Shell theme={th} nav={OPS_NAV} active="complaints"
      breadcrumb={['案件處理', '客訴']} env="production" actor={OPS_ACTOR} health={OPS_HEALTH}
      refreshTier="medium" dataFreshness="fresh">
      <PageHeader theme={th}
        title="客訴中心"
        subtitle="案件全流程 · SLA · 升級 · reopen 不得覆蓋紀錄"
        tabs={[
          { id: 'all', label: '全部', badge: '5' },
          { id: 'mine', label: '我負責', badge: '2', tone: 'accent' },
          { id: 'breach', label: 'SLA breach', badge: '2', tone: 'danger' },
          { id: 'esc', label: '已升級事故', badge: '1' },
        ]}
        activeTab="all"
        actions={<>
          <Btn theme={th} icon="filter">類別</Btn>
          <Btn theme={th} icon="export">匯出</Btn>
          <ActionButton theme={th} descriptor={{ action: 'create', enabled: true, riskLevel: 'medium' }} icon="plus" label="建立客訴" en="create" />
        </>} />

      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <Kpi theme={th} label="未結客訴" en="open" value="3" delta="2 SLA breach" deltaTone="down" />
          <Kpi theme={th} label="平均處理" en="avg_handling" value="22h" delta="↓ 4h" deltaTone="up" />
          <Kpi theme={th} label="升級事故" en="escalated" value="1" sub="cmp_0894 → inc_0212" />
          <Kpi theme={th} label="reopen 率" en="reopen_rate" value="9%" delta="↑ 1%" deltaTone="down" />
        </div>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'CASE', k: 'id', w: 110, mono: true, r: r => <span style={{ color: th.accent, fontWeight: 600 }}>{r.id}</span> },
            { h: 'CATEGORY', k: 'cat', w: 140, mono: true },
            { h: 'SEV', w: 90, r: r => <Pill theme={th} tone={r.severity === 'critical' || r.severity === 'high' ? 'danger' : r.severity === 'medium' ? 'warn' : 'neutral'} dot>{r.severity}</Pill> },
            { h: 'DESC', k: 'desc' },
            { h: 'ORDER', k: 'order', w: 110, mono: true },
            { h: 'SLA · backend computed', w: 130, r: r => <Pill theme={th} tone={r.sla === 'breached' ? 'danger' : 'success'} dot>{r.sla}</Pill> },
            { h: 'OWNER', k: 'assignee', w: 70, mono: true },
            { h: 'STATUS', w: 160, r: r => <Pill theme={th} tone={r.status === 'resolved' ? 'success' : r.status === 'escalated_to_incident' ? 'danger' : 'info'} dot>{r.status}</Pill> },
          ]} rows={FX_COMPLAINTS} />
        </Card>
      </div>
    </Shell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. /complaints/[caseNo] — NEW per Q-OPS01
// ─────────────────────────────────────────────────────────────────────────────
function OC_ComplaintDetail({ theme: th }) {
  const c = FX_COMPLAINTS[2]; // cmp_0908 driver_conduct · high
  return (
    <Shell theme={th} nav={OPS_NAV} active="complaints"
      breadcrumb={['客訴', c.id]} env="production" actor={OPS_ACTOR} health={OPS_HEALTH}
      refreshTier="medium" dataFreshness="fresh">
      <PageHeader theme={th}
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>{c.id}<Pill theme={th} tone="danger" dot>SLA breached</Pill><Pill theme={th} tone="danger">{c.severity}</Pill></span>}
        subtitle={`${c.cat} · ${c.desc}`}
        actions={<>
          <ActionButton theme={th} descriptor={{ action: 'note', enabled: true, riskLevel: 'low' }} icon="plus" label="新增備註" en="note" />
          <ActionButton theme={th} descriptor={{ action: 'assign', enabled: true, riskLevel: 'medium' }} icon="users" label="重新指派" en="assign" />
          <ActionButton theme={th} descriptor={{ action: 'resolve', enabled: true, riskLevel: 'medium' }} icon="check" label="結案" en="resolve" />
          <ActionButton theme={th} descriptor={{ action: 'escalate', enabled: true, riskLevel: 'high', requiresReason: true }} icon="warn" label="升級事故" en="escalate" />
        </>} />

      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card theme={th} title="Case summary">
            <DL theme={th} cols={3} items={[
              { k: 'CASE', v: c.id, mono: true },
              { k: 'OPENED', v: '2026-05-20 14:30', mono: true },
              { k: 'SOURCE', v: 'tenant.submit · YAMATO' },
              { k: 'CATEGORY', v: c.cat, mono: true },
              { k: 'SEVERITY', v: c.severity, mono: true },
              { k: 'ASSIGNEE', v: '陳維 (ops_compliance)' },
              { k: 'SLA STATUS', v: 'breached', mono: true },
              { k: 'SLA DUE AT', v: '2026-05-22 14:30', mono: true },
              { k: 'SLA BREACHED AT', v: '2026-05-22 14:31', mono: true },
              { k: 'REOPENS', v: '1 (4 天前)' },
              { k: 'RELATED ORDER', v: <a style={{ color: th.accent }}>ord_8175 →</a> },
              { k: 'RELATED CALL', v: <a style={{ color: th.accent }}>call_2014 →</a> },
            ]} />
          </Card>
          <Card theme={th} title="Timeline · cross-actor">
            <Timeline theme={th} events={[
              { at: '14:30', tone: 'accent', t: '建立', actor: 'eva.wang@yamato.tw', actorRealm: 'tenant', body: '乘客反映司機言語不當，已上傳影片證據。' },
              { at: '14:42', tone: 'accent', t: '指派', actor: '王芳 → 陳維', actorRealm: 'ops', body: '由 ops_compliance 接手。' },
              { at: '16:00', tone: 'warn', t: '評論', actor: '陳維', actorRealm: 'ops', body: '已聯絡乘客，安排與司機對證。' },
              { at: '2026-05-22 14:31', tone: 'danger', t: 'SLA breach', actor: 'system.sla', actorRealm: 'system', body: '超出 48h 處理時限。' },
              { at: '2026-05-22 15:00', tone: 'warn', t: 'reopen', actor: '陳維', actorRealm: 'ops', body: '乘客回報相同司機再次違規。' },
            ]} />
          </Card>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card theme={th} title="Recording · PII masked">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 10, background: th.surfaceLo, borderRadius: 7 }}>
              <MgmtIcon name="phone" size={14} />
              <span style={{ flex: 1, fontFamily: SHELL_MONO, fontSize: 11 }}>rec_88714.m4a · 04:21</span>
              <Btn theme={th} size="xs" icon="ext">播放</Btn>
            </div>
          </Card>
          <Card theme={th} title="Linked entities">
            <DL theme={th} cols={1} items={[
              { k: 'RELATED ORDER', v: 'ord_8175', mono: true },
              { k: 'RELATED CALL SESSION', v: 'call_2014', mono: true },
              { k: 'RELATED INCIDENT', v: '— (未升級)' },
              { k: 'TENANT', v: 'YAMATO 大和商務集團', mono: true },
              { k: 'DRIVER', v: 'd_8851 黃文豪', mono: true },
            ]} />
          </Card>
          <Card theme={th} title="Recovery notes">
            <Banner theme={th} tone="warn" icon="warn"
              title="待 recovery 規劃"
              body="目前無 service recovery action。提案：對乘客致歉並補償一次免費商務行程。" />
          </Card>
        </div>
      </div>
    </Shell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. /incidents — list + governance guardrail
// ─────────────────────────────────────────────────────────────────────────────
function OC_Incidents({ theme: th }) {
  return (
    <Shell theme={th} nav={OPS_NAV} active="incidents"
      breadcrumb={['事故']} env="production" actor={OPS_ACTOR} health={OPS_HEALTH}
      refreshTier="medium" dataFreshness="fresh">
      <PageHeader theme={th}
        title="事故中心"
        subtitle="safety · collision · property · service recovery — driver SOS / dispatch exception 永遠 ops-owned"
        tabs={[
          { id: 'active', label: 'Active', badge: '2', tone: 'danger' },
          { id: 'resolved', label: 'Resolved' },
          { id: 'closed', label: 'Closed' },
        ]}
        activeTab="active"
        actions={<>
          <Btn theme={th} icon="filter">類別</Btn>
          <ActionButton theme={th} descriptor={{ action: 'create', enabled: true, riskLevel: 'medium' }} icon="plus" label="建立事故" en="create" />
        </>} />

      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Banner theme={th} tone="danger" icon="warn"
          title="inc_0214 · 司機 SOS · critical · in_response"
          body="d_8843 在台北信義區忠孝東路五段觸發 SOS，已派遣支援。安全主管 林經理 已接手。"
          actions={<Btn theme={th} variant="primary">前往事件</Btn>} />

        <Card theme={th} title="Governance guardrail · 三條鐵律"
          subtitle="這三條是 ops 內部裁決，不可被前端覆蓋">
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: th.text, lineHeight: 1.7 }}>
            <li>Driver SOS + dispatch-exception incidents 永遠 ops-owned，即使後續連結至 order / complaint。</li>
            <li>Service recovery action ≠ timeline update ≠ formal resolution，三者不可混用。</li>
            <li>Escalation target ≠ owner transfer；需要 acknowledgment 才會真正轉手。</li>
          </ol>
        </Card>

        <Card theme={th} padding={0} title="Full list">
          <Table theme={th} columns={[
            { h: 'INC', k: 'id', w: 100, mono: true, r: r => <span style={{ color: th.accent, fontWeight: 600 }}>{r.id}</span> },
            { h: 'TITLE', k: 'title', w: 300 },
            { h: 'CAT', k: 'cat', w: 120, mono: true },
            { h: 'SEV', w: 100, r: r => <Pill theme={th} tone={r.severity === 'critical' || r.severity === 'high' ? 'danger' : r.severity === 'medium' ? 'warn' : 'neutral'} dot>{r.severity}</Pill> },
            { h: 'STATUS', w: 130, r: r => <Pill theme={th} tone={r.status === 'closed' ? 'neutral' : r.status === 'in_response' ? 'danger' : 'warn'} dot>{r.status}</Pill> },
            { h: 'DRIVER', k: 'driver', w: 90, mono: true },
            { h: 'OCCURRED', k: 'occurred', mono: true, w: 150 },
            { h: 'RECOVERY', w: 100, r: r => <span style={{ fontFamily: SHELL_MONO }}>{r.recovery} actions</span> },
          ]} rows={FX_INCIDENTS} />
        </Card>
      </div>
    </Shell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. /incidents/[incidentId] — coordination workspace
// ─────────────────────────────────────────────────────────────────────────────
function OC_IncidentDetail({ theme: th }) {
  return (
    <Shell theme={th} nav={OPS_NAV} active="incidents"
      breadcrumb={['事故', 'inc_0214']} env="production" actor={OPS_ACTOR} health={OPS_HEALTH}
      refreshTier="medium" dataFreshness="fresh">
      <PageHeader theme={th}
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>inc_0214<Pill theme={th} tone="danger" dot>critical</Pill><Pill theme={th} tone="danger">in_response</Pill></span>}
        subtitle="司機 SOS · 乘客醉酒衝突 · 2026-05-25 14:42 · 已運行 2h 13m"
        actions={<>
          <ActionButton theme={th} descriptor={{ action: 'notify_police', enabled: true, riskLevel: 'high', requiresReason: true }} icon="phone" label="通知警方" en="police" />
          <ActionButton theme={th} descriptor={{ action: 'notify_tenant', enabled: true, riskLevel: 'medium' }} icon="copy" label="通報租戶" en="notify" />
          <ActionButton theme={th} descriptor={{ action: 'lift_suppression', enabled: false, disabledReasonCode: 'incident_open', riskLevel: 'high', requiresReason: true }} label="解除司機 matching suppression" en="lift" />
          <ActionButton theme={th} descriptor={{ action: 'resolve', enabled: false, disabledReasonCode: 'recovery_required', riskLevel: 'medium' }} icon="check" label="標記受控" en="resolve" />
        </>} />

      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card theme={th} title="Incident summary">
            <DL theme={th} cols={3} items={[
              { k: 'OCCURRED', v: '2026-05-25 14:42:11', mono: true },
              { k: 'LOCATION', v: '台北市信義區忠孝東路五段 68 號' },
              { k: 'DRIVER', v: 'd_8843 陳俊宏', mono: true },
              { k: 'VEHICLE', v: 'ARJ-3120', mono: true },
              { k: 'ORDER', v: 'ord_8232', mono: true },
              { k: 'TENANT', v: 'YAMATO', mono: true },
              { k: 'REPORTED BY', v: 'driver app · SOS button' },
              { k: 'COMPLAINT', v: '— (driver 自報)' },
              { k: 'MATCHING SUPPRESSION', v: 'active until incident closed', mono: true },
            ]} />
          </Card>
          <Card theme={th} title="Timeline">
            <Timeline theme={th} events={[
              { at: '14:42', tone: 'danger', t: 'SOS 觸發', actor: 'd_8843', actorRealm: 'driver', body: '司機按下 SOS。系統自動撥通安全主管熱線並對乘客端靜音。' },
              { at: '14:42', tone: 'accent', t: '安全主管接通', actor: '林經理 (safety_lead)', actorRealm: 'ops', body: '7 秒內接通；持續監聽中。' },
              { at: '14:43', tone: 'accent', t: '提報事件', actor: '林經理', actorRealm: 'ops', body: '建立 inc_0214；severity=critical。matching suppression 啟動。' },
              { at: '14:45', tone: 'accent', t: '租戶通報', actor: '林經理', actorRealm: 'ops', body: 'YAMATO 商務窗口已通知。' },
              { at: '14:48', tone: 'warn', t: '派遣支援車', actor: 'dispatch', actorRealm: 'system', body: '已派 d_8870 至現場協助。' },
              { at: '14:52', tone: 'accent', t: 'recovery 評論', actor: '林經理', actorRealm: 'ops', body: '乘客已下車，現場由 d_8870 接手。' },
            ]} />
          </Card>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card theme={th} title="Service recovery actions">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, borderRadius: 6, border: '1px solid ' + th.successBorder, background: th.successBg }}>
                <MgmtIcon name="check" size={13} stroke={2} style={{ color: th.success }} />
                <span style={{ fontSize: 12, color: th.text, flex: 1 }}>14:48 · 派遣支援車 (d_8870)</span>
                <span style={{ fontSize: 10.5, color: th.success, fontFamily: SHELL_MONO }}>completed</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, borderRadius: 6, border: '1px solid ' + th.successBorder, background: th.successBg }}>
                <MgmtIcon name="check" size={13} stroke={2} style={{ color: th.success }} />
                <span style={{ fontSize: 12, color: th.text, flex: 1 }}>15:00 · 訂單免收費</span>
                <span style={{ fontSize: 10.5, color: th.success, fontFamily: SHELL_MONO }}>completed</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, borderRadius: 6, border: '1px solid ' + th.warnBorder, background: th.warnBg }}>
                <MgmtIcon name="clock" size={13} stroke={2} style={{ color: th.warn }} />
                <span style={{ fontSize: 12, color: th.text, flex: 1 }}>排程 · 司機 EAP 介入</span>
                <span style={{ fontSize: 10.5, color: th.warn, fontFamily: SHELL_MONO }}>pending</span>
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <ActionButton theme={th} descriptor={{ action: 'add_recovery', enabled: true, riskLevel: 'medium' }} icon="plus" label="新增 recovery" en="add" />
            </div>
          </Card>
          <Card theme={th} title="Linked entities">
            <DL theme={th} cols={1} items={[
              { k: 'COMPLAINT', v: '— (本事件為 driver SOS，無前置客訴)' },
              { k: 'ORDER', v: 'ord_8232', mono: true },
              { k: 'TENANT', v: 'YAMATO', mono: true },
              { k: 'AUDIT', v: 'req_FXa899', mono: true },
              { k: 'MATCHING SUPPRESSION', v: 'd_8843 · until 14:42+24h', mono: true },
            ]} />
          </Card>
        </div>
      </div>
    </Shell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. /approval-requests — cross-tenant queue (Q-OPS10)
// ─────────────────────────────────────────────────────────────────────────────
function OC_Approvals({ theme: th }) {
  return (
    <Shell theme={th} nav={OPS_NAV} active="approvals"
      breadcrumb={['案件處理', '審批佇列']} env="production" actor={OPS_ACTOR} health={OPS_HEALTH}
      refreshTier="dispatch" dataFreshness="fresh">
      <PageHeader theme={th}
        title="審批佇列 · 跨租戶"
        subtitle="只有 ops_approval_triage / ops_manager / ops_compliance 看得到 · sidebar 對其他角色隱藏"
        tabs={[
          { id: 'pending', label: 'Pending', badge: '5', tone: 'warn' },
          { id: 'approved', label: 'Approved' },
          { id: 'rejected', label: 'Rejected' },
        ]}
        activeTab="pending" />

      <div style={{ padding: 24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'REQUEST', w: 110, mono: true, r: r => <span style={{ color: th.accent, fontWeight: 600 }}>{r.id}</span> },
            { h: 'TYPE', w: 160, mono: true, r: r => <Pill theme={th} tone="warn" dot>{r.type}</Pill> },
            { h: 'TENANT', w: 130, r: r => <Pill theme={th} tone="tenant" dot>{r.tenant}</Pill> },
            { h: 'REQUESTER', w: 140, r: r => r.requester },
            { h: 'ORDER', w: 110, mono: true, r: r => <a style={{ color: th.accent }}>{r.order} →</a> },
            { h: 'JUSTIFICATION', w: 280, r: r => r.justification },
            { h: 'AGE', w: 80, mono: true, r: r => r.age },
            { h: 'TIMEOUT', w: 130, r: r => r.timeoutWarning ? <Pill theme={th} tone="danger" dot>{r.timeoutLeft}</Pill> : <Pill theme={th} tone="success">on track</Pill> },
            { h: 'ACTIONS', w: 220, r: () => (
              <div style={{ display: 'flex', gap: 4 }}>
                <ActionButton theme={th} size="xs" descriptor={{ action: 'approve', enabled: true, riskLevel: 'high', requiresReason: true }} label="核准" en="approve" />
                <ActionButton theme={th} size="xs" descriptor={{ action: 'reject', enabled: true, riskLevel: 'high', requiresReason: true }} label="退回" en="reject" />
                <ActionButton theme={th} size="xs" descriptor={{ action: 'escalate', enabled: true, riskLevel: 'high', requiresReason: true }} label="升級" en="escalate" />
              </div>
            )},
          ]} rows={[
            { id: 'ar_0091', type: 'fare_override', tenant: 'CTBC_BIZ', requester: '林志偉 (driver)', order: 'ord_8245', justification: '高速公路臨時封閉繞道，估費 +28%', age: '4 min', timeoutWarning: false },
            { id: 'ar_0090', type: 'exception_hold', tenant: 'YAMATO', requester: '王芳 (ops_manager)', order: 'ord_8198', justification: '乘客未到，等候 8 min 後仍無聯繫', age: '8 min', timeoutWarning: false },
            { id: 'ar_0089', type: 'no_supply_override', tenant: 'TSMC_FAB18', requester: '陳維 (ops_compliance)', order: 'ord_8203', justification: '科學園區晚班，僅 1 名候選 license_expiring', age: '12 min', timeoutWarning: true, timeoutLeft: '< 3 min' },
            { id: 'ar_0088', type: 'fare_override', tenant: 'CATHAY_LIFE', requester: '黃文豪 (driver)', order: 'ord_8211', justification: '機場 T2 轉 T1 額外里程', age: '18 min', timeoutWarning: true, timeoutLeft: '< 1 min' },
            { id: 'ar_0087', type: 'exception_hold', tenant: 'NTU_HOSP', requester: '吳鎮宇 (driver)', order: 'ord_8235', justification: '病患需協助上下車，超出標準等候時間', age: '22 min', timeoutWarning: false },
          ]} />
        </Card>
      </div>
    </Shell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. /reports — report jobs + filing packages
// ─────────────────────────────────────────────────────────────────────────────
function OC_Reports({ theme: th }) {
  return (
    <Shell theme={th} nav={OPS_NAV} active="reports"
      breadcrumb={['營運監控', '報表']} env="production" actor={OPS_ACTOR} health={OPS_HEALTH}
      refreshTier="manual">
      <PageHeader theme={th}
        title="報表"
        subtitle="report jobs · filing packages · signed artifact 短效 URL"
        tabs={[{ id: 'jobs', label: 'Report jobs' }, { id: 'packages', label: 'Filing packages' }, { id: 'sched', label: 'Schedules' }]}
        activeTab="jobs"
        actions={<ActionButton theme={th} descriptor={{ action: 'create', enabled: true, riskLevel: 'low' }} variant="primary" icon="plus" label="建立工作" en="create" />} />

      <div style={{ padding: 24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'JOB', k: 'id', w: 110, mono: true },
            { h: 'KIND', k: 'kind', w: 180, mono: true },
            { h: 'PERIOD', k: 'period', w: 110, mono: true },
            { h: 'FORMAT', k: 'format', w: 90, mono: true },
            { h: 'STATUS', w: 110, r: r => <Pill theme={th} tone={r.status === 'ready' ? 'success' : r.status === 'running' ? 'info' : r.status === 'expired' ? 'neutral' : 'warn'} dot>{r.status}</Pill> },
            { h: 'EXPIRES', k: 'expires', mono: true, w: 130 },
            { h: 'CREATED', k: 'created', mono: true },
            { h: 'ACTIONS', w: 140, r: r => (
              <div style={{ display: 'flex', gap: 4 }}>
                <ActionButton theme={th} size="xs" descriptor={{ action: 'download', enabled: r.status === 'ready', disabledReasonCode: r.status === 'running' ? 'still_running' : 'expired', riskLevel: 'low' }} icon="download" label="下載" en="dl" />
                {r.status === 'failed' && <ActionButton theme={th} size="xs" descriptor={{ action: 'retry', enabled: true, riskLevel: 'medium' }} icon="refresh" label="重試" en="retry" />}
              </div>
            )},
          ]} rows={FX_REPORTS} />
        </Card>
      </div>
    </Shell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. /revenue — read-only revenue + mismatch drawer linking to platform-admin
// ─────────────────────────────────────────────────────────────────────────────
function OC_Revenue({ theme: th }) {
  return (
    <Shell theme={th} nav={OPS_NAV} active="revenue"
      breadcrumb={['營運監控', '收益審視']} env="production" actor={OPS_ACTOR} health={OPS_HEALTH}
      refreshTier="medium" dataFreshness="stale">
      <PageHeader theme={th}
        title="收益審視"
        subtitle="period · service bucket · vehicle · channel mix · settlement matrix — mismatch mutation 在 Platform Admin 完成"
        tabs={[{ id: 'insight', label: 'Insight' }, { id: 'channel', label: 'Channel mix' }, { id: 'matrix', label: 'Settlement matrix' }, { id: 'mismatch', label: 'Mismatch review', badge: '3' }]}
        activeTab="matrix"
        actions={<><Btn theme={th} icon="filter">期別</Btn><Btn theme={th} icon="export">匯出</Btn></>} />

      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <StaleBanner theme={th} dataFreshness="stale" generatedAt="2 min" tier="medium" />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <Kpi theme={th} label="當期 billed (MTD)" en="billed_mtd" value="NT$ 11.5M" delta="↑ 6.2%" deltaTone="up" />
          <Kpi theme={th} label="自營佔比" en="owned_share" value="71%" delta="↓ 1.4 pp" deltaTone="neutral" />
          <Kpi theme={th} label="forwarded sync_failed" en="forwarded_failures" value="4.2%" delta="warn 閾值" deltaTone="down" />
          <Kpi theme={th} label="未結 reconciliation" en="open_recon" value="3" sub="mutation 在 Platform Admin" />
        </div>

        <Banner theme={th} tone="info" icon="info"
          title="此頁為 read-only mirror · Q-OPS14"
          body="ops_finance_reviewer 可開啟 mismatch drawer 但 mutation 必須 deep-link 到 Platform Admin /payments。對應 issue 由 platform finance owner 處理。"
          actions={<Btn theme={th} variant="secondary" icon="ext">開啟 Platform Admin /payments (new tab)</Btn>} />

        <Card theme={th} title="Settlement matrix · 2026-04" padding={0}>
          <Table theme={th} columns={[
            { h: '渠道', k: 'row', w: 200 },
            { h: 'BILLED', k: 'billed', mono: true, align: 'right' },
            { h: 'DRIVER FEE', k: 'drvFee', mono: true, align: 'right' },
            { h: 'SERVICE FEE', k: 'svcFee', mono: true, align: 'right' },
            { h: 'RECON', k: 'recon', mono: true, align: 'right', w: 100 },
            { h: 'STATUS', w: 130, r: r => <Pill theme={th} tone={r.status === 'reconciled' ? 'success' : r.status === 'pending' ? 'warn' : 'info'} dot>{r.status}</Pill> },
          ]} rows={FX_SETTLEMENT} />
        </Card>
      </div>
    </Shell>
  );
}

Object.assign(window, {
  OC_Complaints, OC_ComplaintDetail, OC_Incidents, OC_IncidentDetail,
  OC_Approvals, OC_Reports, OC_Revenue,
});
