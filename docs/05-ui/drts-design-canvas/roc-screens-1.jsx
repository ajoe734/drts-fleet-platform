// roc-screens.jsx — A1 ROC Console · 12 screens. Reuses mgmt Shell/primitives, roc realm.
// Hard rules: no steering/perception/RSU; telemetry vs regulatory freshness SEPARATE;
// 3-column takeover truth (Tesla/operator/ROC) never merged; CTAs = availableActions; NO remote driving.

function RocShell({ theme: th, active, breadcrumb, children, refreshTier = 'dispatch' }) {
  return (
    <Shell theme={th} nav={ROC_NAV} active={active} breadcrumb={breadcrumb}
      env="production" tenant="FSD_SANDBOX" actor={ROC_ACTOR} health={ROC_HEALTH}
      refreshTier={refreshTier} dataFreshness="fresh">{children}</Shell>
  );
}

function EvTag({ theme: th, src }) {
  const m = ROC_EVIDENCE[src] || ROC_EVIDENCE.device_recorded;
  return <Pill theme={th} tone={m.tone}>{m.zh}<span style={{ marginLeft: 3, opacity: .55, fontFamily: SHELL_MONO, fontSize: 9 }}>{src}</span></Pill>;
}

// dual freshness — two SEPARATE indicators (hard rule)
function DualFresh({ theme: th, tele, teleAge, reg, regAge, size = 'md' }) {
  const tm = freshMeta(tele), rm = freshMeta(reg);
  const cell = (label, m, age) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: size === 'sm' ? '0' : '6px 10px', borderRadius: 8, background: size === 'sm' ? 'transparent' : th.surfaceLo, flex: 1 }}>
      <span style={{ fontSize: 9.5, color: th.textMuted, letterSpacing: .2 }}>{label}</span>
      <span style={{ fontSize: size === 'sm' ? 11 : 12.5, fontWeight: 700, color: th[m.tone], display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <span style={{ width: 6, height: 6, borderRadius: 3, background: th[m.tone] }} />{m.zh}<span style={{ fontFamily: SHELL_MONO, fontWeight: 500, color: th.textDim, fontSize: 10 }}>{age}</span>
      </span>
    </div>
  );
  return <div style={{ display: 'flex', gap: 8 }}>{cell('telemetry 鮮度', tm, teleAge)}{cell('監理事件鮮度', rm, regAge)}</div>;
}

// ── 1 · Overview ─────────────────────────────────────────────────────────────
function ROC_Overview({ theme: th }) {
  return (
    <RocShell theme={th} active="overview" breadcrumb={['總覽']} refreshTier="dispatch">
      <PageHeader theme={th} title="FSD 沙盒 · 監控總覽"
        subtitle="exp_fsd_taipei_01 · 遠端監控中心 ROC · 唯讀監看，無遠端駕駛控制"
        meta={<><Pill theme={th} tone="roc" dot>ROC · 監控</Pill><Pill theme={th} tone="neutral">policy v2026.06</Pill></>}
        actions={<Btn theme={th} icon="export">值班紀錄</Btn>} />
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12 }}>
          <Kpi theme={th} label="沙盒車輛" en="vehicles" value="5" sub="4 出勤 · 1 待命" />
          <Kpi theme={th} label="自駕中" en="autonomous" value="3" sub="active trips" />
          <Kpi theme={th} label="接管待處置" en="takeover" value="3" sub="3 欄真相對照" tone="warn" />
          <Kpi theme={th} label="警示" en="alerts" value="5" sub="2 鮮度 · 1 失聯" tone="warn" />
          <Kpi theme={th} label="事故" en="incidents" value="1" sub="L2 待通報" tone="danger" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16 }}>
          <Card theme={th} title="出勤車輛 · 雙鮮度分離" subtitle="telemetry 與 監理事件 為兩個獨立指標" padding={0}>
            <Table theme={th} columns={[
              { h: '車輛', k: 'id', w: 96, mono: true, r: r => <span style={{ color: th.accent, fontWeight: 600 }}>{r.id}</span> },
              { h: '狀態', w: 96, r: r => <Pill theme={th} tone={rocStateMeta(r.state).tone} dot>{rocStateMeta(r.state).zh}</Pill> },
              { h: '區域', k: 'area', w: 90 },
              { h: 'telemetry', w: 96, r: r => <span style={{ fontSize: 11, fontWeight: 600, color: th[freshMeta(r.teleFresh).tone] }}>{freshMeta(r.teleFresh).zh} {r.teleAge}</span> },
              { h: '監理事件', w: 100, r: r => <span style={{ fontSize: 11, fontWeight: 600, color: th[freshMeta(r.regFresh).tone] }}>{freshMeta(r.regFresh).zh} {r.regAge}</span> },
              { h: '安全員', k: 'so', w: 80 },
            ]} rows={FX_ROC_VEHICLES} />
          </Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Card theme={th} title="近期警示" subtitle="alerts" padding={0}
              actions={<Pill theme={th} tone="warn">5</Pill>}>
              <div>
                {FX_ROC_ALERTS.slice(0, 4).map((a, i) => (
                  <div key={a.id} style={{ display: 'flex', gap: 9, padding: '10px 14px', borderTop: i ? '1px solid ' + th.borderSoft : 'none' }}>
                    <MgmtIcon name={a.sev === 'danger' ? 'incidents' : 'warn'} size={14} style={{ color: a.sev === 'danger' ? th.danger : th.warn, flexShrink: 0, marginTop: 1 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600 }}>{a.t}</div>
                      <div style={{ fontSize: 11, color: th.textMuted }}>{a.detail}</div>
                    </div>
                    <span style={{ fontSize: 10.5, color: th.textDim, fontFamily: SHELL_MONO }}>{a.at}</span>
                  </div>
                ))}
              </div>
            </Card>
            <Card theme={th} title="監看邊界" subtitle="hard rule">
              <Banner theme={th} tone="neutral" icon="lock" body="ROC 僅監看核准區域/路線。不顯示方向盤角度、FSD 感知物件、路側設備健康；無遠端駕駛控制元件。" />
            </Card>
          </div>
        </div>
      </div>
    </RocShell>
  );
}

// ── 2 · Live Board ───────────────────────────────────────────────────────────
function ROC_LiveBoard({ theme: th }) {
  return (
    <RocShell theme={th} active="liveboard" breadcrumb={['即時看板']}>
      <PageHeader theme={th} title="即時看板 · Live Board"
        subtitle="核准區域 / 路線 overlay · 無感知物件 · 無方向盤角度"
        actions={<><Btn theme={th} icon="filter">區域</Btn><Btn theme={th} icon="refresh">即時</Btn></>} />
      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16, alignItems: 'start' }}>
        <Card theme={th} title="核准區域 overlay" subtitle="approved area / route only" padding={0}>
          <div style={{ height: 420, background: 'linear-gradient(135deg,' + th.accentBg + ',' + th.surfaceLo + ')', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', inset: 30, border: '2px dashed ' + th.accent, borderRadius: 18, opacity: .5 }} />
            <div style={{ position: 'absolute', top: '50%', left: '8%', right: '8%', height: 2, background: th.accent, opacity: .35 }} />
            {[['28%', '40%', 'AV-7720', 'success'], ['62%', '55%', 'AV-7732', 'warn'], ['45%', '30%', 'AV-7715', 'warn'], ['74%', '46%', 'AV-7741', 'success']].map(([l, t2, id, tone], i) => (
              <div key={i} style={{ position: 'absolute', left: l, top: t2 }}>
                <div style={{ width: 14, height: 14, borderRadius: 7, background: th[tone], border: '2px solid ' + th.surface, boxShadow: '0 0 0 3px ' + th[tone] + '40' }} />
                <span style={{ position: 'absolute', top: 16, left: -10, fontSize: 9.5, fontFamily: SHELL_MONO, color: th.text, background: th.surface, padding: '1px 4px', borderRadius: 4, whiteSpace: 'nowrap' }}>{id}</span>
              </div>
            ))}
            <div style={{ position: 'absolute', bottom: 12, left: 12, fontSize: 10.5, color: th.textMuted, background: th.surface, padding: '4px 9px', borderRadius: 6 }}>信義 / 南港 沙盒核准區 · approved sandbox area</div>
          </div>
        </Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {FX_ROC_VEHICLES.filter(v => v.state !== 'idle').map(v => (
            <Card theme={th} key={v.id} padding={14}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
                <span style={{ color: th.accent, fontWeight: 700, fontFamily: SHELL_MONO, fontSize: 13 }}>{v.id}</span>
                <Pill theme={th} tone={rocStateMeta(v.state).tone} dot>{rocStateMeta(v.state).zh}</Pill>
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 11, color: th.textMuted, fontFamily: SHELL_MONO }}>{v.speed} km/h</span>
              </div>
              <DualFresh theme={th} tele={v.teleFresh} teleAge={v.teleAge} reg={v.regFresh} regAge={v.regAge} />
            </Card>
          ))}
        </div>
      </div>
    </RocShell>
  );
}

// ── 6 · Takeover Queue — THREE columns, never merged ─────────────────────────
function ROC_Takeover({ theme: th }) {
  const colHead = (zh, en, icon, tone) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 12px', borderBottom: '2px solid ' + th[tone], background: th.surfaceLo }}>
      <MgmtIcon name={icon} size={14} style={{ color: th[tone] }} />
      <span style={{ fontSize: 12, fontWeight: 700 }}>{zh}</span>
      <span style={{ fontSize: 9.5, fontFamily: SHELL_MONO, color: th.textDim }}>{en}</span>
    </div>
  );
  const cell = (data, tone) => (
    <div style={{ padding: 12, borderRight: '1px solid ' + th.border }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: th.text, marginBottom: 3 }}>{data.label}</div>
      <div style={{ fontSize: 11.5, color: th.textMuted, lineHeight: 1.5, marginBottom: 7 }}>{data.detail}</div>
      <EvTag theme={th} src={data.src} />
      {data.conf && <div style={{ fontSize: 10, fontFamily: SHELL_MONO, color: th.textDim, marginTop: 6 }}>{data.conf}</div>}
      {data.status && <div style={{ marginTop: 6 }}><Pill theme={th} tone={data.status === 'reviewed' ? 'success' : data.status === 'in_review' ? 'warn' : 'neutral'} dot>{data.status}</Pill></div>}
    </div>
  );
  return (
    <RocShell theme={th} active="takeover" breadcrumb={['接管佇列']} refreshTier="dispatch">
      <PageHeader theme={th} title="接管佇列 · Takeover Queue"
        subtitle="原廠事件 / 安全員回報 / ROC 處置 三欄並列 — 不合併成單一真相"
        meta={<Pill theme={th} tone="warn">3 件待處置</Pill>} />
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Banner theme={th} tone="neutral" icon="info" body="三個來源各自獨立呈現，保留分歧（如原廠未提供原因時，安全員回報與 ROC 研判仍各自記錄），不調和為單一敘事。" />
        {FX_TAKEOVERS.map(tk => (
          <Card theme={th} key={tk.id} padding={0}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderBottom: '1px solid ' + th.border }}>
              <span style={{ color: th.accent, fontWeight: 700, fontFamily: SHELL_MONO }}>{tk.id}</span>
              <Pill theme={th} tone="neutral">{tk.vehicle}</Pill>
              <span style={{ fontSize: 12, color: th.textMuted }}>{tk.area}</span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 12, fontFamily: SHELL_MONO, color: th.textMuted }}>{tk.at}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
              <div>{colHead('原廠事件', 'tesla', 'vehicles', 'info')}{cell(tk.tesla, 'info')}</div>
              <div>{colHead('安全員回報', 'operator', 'users', 'accent')}{cell(tk.operator, 'accent')}</div>
              <div style={{ borderRight: 'none' }}>{colHead('ROC 處置', 'roc_response', 'governance', 'roc')}{cell(tk.roc, 'roc')}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, padding: '11px 14px', borderTop: '1px solid ' + th.border, background: th.surfaceLo }}>
              <ActionButton theme={th} size="xs" descriptor={{ action: 'request_evidence', enabled: tk.roc.status !== 'reviewed', riskLevel: 'low' }} label="要求補證據" en="req_evidence" />
              <ActionButton theme={th} size="xs" descriptor={{ action: 'create_incident', enabled: tk.operator.conf === 'severity: 高', riskLevel: 'medium' }} label="建立事故案件" en="incident" />
              <ActionButton theme={th} size="xs" descriptor={{ action: 'mark_reviewed', enabled: tk.roc.status === 'in_review', riskLevel: 'low' }} label="標記已研判" en="reviewed" />
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 10.5, color: th.textDim, alignSelf: 'center' }}>CTA 由 availableActions 驅動 · 無遠端駕駛</span>
            </div>
          </Card>
        ))}
      </div>
    </RocShell>
  );
}

Object.assign(window, { RocShell, EvTag, DualFresh, ROC_Overview, ROC_LiveBoard, ROC_Takeover });
