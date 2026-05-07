// driver-screens-2.jsx — Task Inbox + Trip operation
// (continues from driver-screens-1.jsx)

// ─── 4. Unified Task Inbox ──────────────────────────────────────
function ScreenInbox({ theme: t, variant = 'A' }) {
  if (variant === 'B') return <ScreenInboxB theme={t} />;
  const filters = ['全部', '待處理', '進行中', '平台結案', '需同步'];
  return (
    <ScreenFrame theme={t} label="Task Inbox">
      <div style={{ padding: '14px 16px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.4 }}>任務</div>
          <button style={{
            width: 36, height: 36, borderRadius: 10,
            background: t.surface, border: `1px solid ${t.border}`,
            color: t.text, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon d={ICONS.filter} size={16} sw={1.8} />
          </button>
        </div>

        {/* Summary KPIs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <Kpi theme={t} label="總計" value="6" />
          <Kpi theme={t} label="需動作" value="3" tone="warn" />
          <Kpi theme={t} label="外部平台" value="4" tone="brand" />
        </div>

        {/* Filter pills */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, marginLeft: -2 }}>
          {filters.map((f, i) => (
            <span key={f} style={{
              padding: '7px 14px',
              background: i === 0 ? t.text : t.surface,
              color: i === 0 ? t.bg : t.textMuted,
              border: `1px solid ${i === 0 ? t.text : t.border}`,
              borderRadius: 999,
              fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
            }}>{f}</span>
          ))}
        </div>
      </div>

      {/* Task cards */}
      <div style={{ padding: '8px 16px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {MOCK.tasks.map(task => <TaskCard key={task.id} theme={t} task={task} />)}
      </div>

      <BottomTabs theme={t} active="jobs" />
    </ScreenFrame>
  );
}

function TaskCard({ theme: t, task }) {
  const statusMap = {
    in_progress:    { label: '進行中', tone: 'success', emphasized: true },
    offered:        { label: '可接單', tone: 'forwarded', emphasized: true },
    accept_pending: { label: '等待平台確認', tone: 'warn', emphasized: true },
    completed:      { label: '已完成', tone: 'neutral' },
    lost_race:      { label: '其他司機已接', tone: 'neutral' },
    sync_failed:    { label: '同步異常', tone: 'danger' },
    confirmed:      { label: '平台已確認', tone: 'success', emphasized: true },
    cancelled:      { label: '平台取消', tone: 'neutral' },
  };
  const status = statusMap[task.status];
  const isExternal = task.forwarded;
  const dim = ['completed', 'lost_race', 'cancelled'].includes(task.status);

  return (
    <div style={{
      background: t.surface,
      border: `1px solid ${isExternal && !dim ? t.forwardedBorder : t.border}`,
      borderLeft: isExternal && !dim ? `3px solid ${t.forwardedFg}` : `1px solid ${t.border}`,
      borderRadius: 14,
      overflow: 'hidden',
      opacity: dim ? 0.7 : 1,
    }}>
      <div style={{ padding: '12px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <PlatformBadge theme={t} code={task.plat} name={task.name} forwarded={isExternal} size="sm" />
          {status.emphasized && <Chip theme={t} tone={status.tone} size="sm" dot>{status.label}</Chip>}
          {!status.emphasized && <span style={{ fontSize: 11, color: t.textMuted, fontWeight: 500 }}>{status.label}</span>}
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: t.textDim, fontFamily: TYPE.mono }}>{task.id}</span>
        </div>
        <div style={{ fontSize: 16, fontWeight: 650, color: t.text, letterSpacing: -0.1, lineHeight: 1.3 }}>{task.text}</div>
        <div style={{ fontSize: 12, color: t.textMuted, marginTop: 3 }}>{task.sub}</div>

        {(task.deadline || task.fare !== '—') && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, marginTop: 10,
            paddingTop: 10, borderTop: `1px dashed ${t.border}`,
          }}>
            {task.fare !== '—' && (
              <span style={{ fontSize: 13, fontWeight: 700, color: t.text, fontFamily: TYPE.mono }}>{task.fare}</span>
            )}
            {task.deadline && (
              <span style={{ fontSize: 12, color: task.urgent ? t.danger : t.textMuted, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Icon d={ICONS.clock} size={12} stroke={task.urgent ? t.danger : t.textMuted} sw={2} />
                {task.deadline}
              </span>
            )}
            {task.action && (
              <span style={{ flex: 1, textAlign: 'right' }}>
                <Button theme={t} kind={isExternal ? 'primary' : 'primary'} size="sm"
                  style={isExternal ? { background: t.forwardedFg } : {}}>{task.action}</Button>
              </span>
            )}
          </div>
        )}

        {task.status === 'sync_failed' && (
          <div style={{ marginTop: 10, fontSize: 12, color: t.danger, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon d={ICONS.alert} size={14} stroke={t.danger} sw={2} />
            需派車台處理，請等待指示
          </div>
        )}
      </div>
    </div>
  );
}

// Variant B — list-density inbox (single line per row)
function ScreenInboxB({ theme: t }) {
  return (
    <ScreenFrame theme={t} label="Inbox B">
      <div style={{ padding: '14px 16px 8px' }}>
        <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.4, marginBottom: 8 }}>任務佇列</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 12, color: t.textMuted }}>6 筆任務</span>
          <span style={{ fontSize: 12, color: t.warn, fontWeight: 600 }}>3 需動作</span>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 12, color: t.brand, fontWeight: 600 }}>排序：時效 ▾</span>
        </div>
      </div>

      <div style={{ padding: '0 16px 24px' }}>
        <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 14, overflow: 'hidden' }}>
          {MOCK.tasks.map((task, i, a) => <DenseTaskRow key={task.id} theme={t} task={task} last={i === a.length - 1} />)}
        </div>
      </div>

      <BottomTabs theme={t} active="jobs" />
    </ScreenFrame>
  );
}

function DenseTaskRow({ theme: t, task, last }) {
  const isExternal = task.forwarded;
  const statusColor = {
    in_progress: t.success,
    offered: t.forwardedFg,
    accept_pending: t.warn,
    completed: t.textDim,
    lost_race: t.textDim,
    sync_failed: t.danger,
  }[task.status];
  const statusLabel = {
    in_progress: '進行中',
    offered: `可接 · ${task.deadline || ''}`,
    accept_pending: '等候確認',
    completed: '已完成',
    lost_race: '已失去',
    sync_failed: '同步異常',
  }[task.status];
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 14px',
      borderBottom: last ? 'none' : `1px solid ${t.border}`,
    }}>
      <div style={{
        width: 4, alignSelf: 'stretch', borderRadius: 2,
        background: isExternal ? t.forwardedFg : t.ownedFg,
        opacity: ['completed', 'lost_race'].includes(task.status) ? 0.3 : 1,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: isExternal ? t.forwardedFg : t.ownedFg, fontFamily: TYPE.mono, letterSpacing: 0.4 }}>
            {task.plat}
          </span>
          <span style={{ width: 3, height: 3, borderRadius: 1.5, background: t.borderStrong }} />
          <span style={{ fontSize: 10, color: t.textDim, fontFamily: TYPE.mono }}>{task.id}</span>
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: t.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {task.text}
        </div>
        <div style={{ fontSize: 11, color: statusColor, fontWeight: 500, marginTop: 2 }}>
          {statusLabel}
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        {task.fare !== '—' && (
          <div style={{ fontSize: 13, fontWeight: 700, color: t.text, fontFamily: TYPE.mono }}>{task.fare}</div>
        )}
        {task.deadline && task.urgent && (
          <div style={{ fontSize: 10, color: t.danger, fontWeight: 600, marginTop: 2 }}>{task.deadline}</div>
        )}
      </div>
    </div>
  );
}

// ─── 5. Trip Operation ──────────────────────────────────────────
function ScreenTrip({ theme: t, state = 'owned_active' }) {
  // states: owned_active, forwarded_offered, forwarded_pending, forwarded_confirmed, forwarded_lost, forwarded_cancelled, sync_failed
  const isForwarded = state.startsWith('forwarded') || state === 'sync_failed';

  let banner, primaryAction, statusText, statusTone, lockBody;
  switch (state) {
    case 'owned_active':
      banner = { f: false, p: '自營派單', sub: '完整本機操作權限。請依指示完成行程。' };
      primaryAction = { label: '抵達取貨點', icon: ICONS.pin, kind: 'primary' };
      statusText = '前往取貨點'; statusTone = 'success';
      break;
    case 'forwarded_offered':
      banner = { f: true, p: 'SmartRides X', sub: '此訂單由平台主導。接受後將提交平台確認，可能被搶走。' };
      primaryAction = { label: '接受平台訂單', icon: ICONS.check, kind: 'primary' };
      statusText = '平台訂單 · 12 秒'; statusTone = 'warn';
      break;
    case 'forwarded_pending':
      banner = { f: true, p: 'SmartRides X', sub: '已送出接單，等待平台確認。請暫勿開始行程。' };
      primaryAction = null;
      statusText = '等待平台確認'; statusTone = 'warn';
      lockBody = { icon: ICONS.clock, title: '正在等待平台確認…', sub: '已送出 4 秒 · 平均回應時間 6 秒' };
      break;
    case 'forwarded_confirmed':
      banner = { f: true, p: 'SmartRides X', sub: '平台已確認接單。前往取貨點，請依平台規則操作。' };
      primaryAction = { label: '抵達取貨點', icon: ICONS.pin, kind: 'primary' };
      statusText = '平台已確認'; statusTone = 'success';
      break;
    case 'forwarded_lost':
      banner = { f: true, p: 'SmartRides X', sub: '其他司機已被平台選中，本筆訂單已結束。' };
      primaryAction = null;
      statusText = '其他司機已接'; statusTone = 'neutral';
      lockBody = { icon: ICONS.x, title: '未取得此訂單', sub: '平台已將訂單分配給其他司機。' };
      break;
    case 'sync_failed':
      banner = { f: true, p: 'Metro Hail', sub: '平台同步失敗，派車台正在處理。請等待指示。' };
      primaryAction = null;
      statusText = '需派車台處理'; statusTone = 'danger';
      lockBody = { icon: ICONS.alert, title: '同步異常', sub: '派車台正在處理平台同步，請依派車台指示操作。' };
      break;
    default:
      banner = { f: false, p: '自營派單', sub: '' };
  }

  return (
    <ScreenFrame theme={t} label={`Trip · ${state}`}>
      <TopBar theme={t} title="進行中行程" subtitle="T-8821 · ORD-441902" back right={
        <button style={{
          width: 36, height: 36, borderRadius: 10,
          background: t.dangerBg, color: t.danger, border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon d={ICONS.alert} size={18} sw={2.2} />
        </button>
      } />

      <div style={{ padding: '12px 16px 0' }}>
        <AuthorityBanner theme={t} forwarded={banner.f} platform={banner.p} subtitle={banner.sub} />
      </div>

      <div style={{ padding: '12px 16px 0' }}>
        <MapPlaceholder theme={t} height={170}>
          <div style={{
            position: 'absolute', bottom: 10, left: 10,
            background: t.surface, border: `1px solid ${t.border}`,
            padding: '6px 10px', borderRadius: 8,
            fontSize: 11, fontWeight: 600, color: t.text,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <Icon d={ICONS.pin} size={12} sw={2} stroke={t.success} /> 6.2 km · 14 分鐘
          </div>
        </MapPlaceholder>
      </div>

      {/* Trip route summary */}
      <div style={{ padding: '12px 16px 0' }}>
        <Card theme={t} padding={14}>
          <RouteStop theme={t} dot={t.success} label="取貨點" addr="台北車站 · 西三門" time="預計 09:38" />
          <div style={{ marginLeft: 5, height: 20, borderLeft: `1.5px dashed ${t.border}` }} />
          <RouteStop theme={t} dot={t.danger} label="送達點" addr="松山機場 第二航廈 出境大廳" time="預計 10:14" last />

          <div style={{ display: 'flex', gap: 10, marginTop: 14, paddingTop: 14, borderTop: `1px solid ${t.border}` }}>
            <MetricChip theme={t} label="距離" value="6.2 km" />
            <MetricChip theme={t} label="時長" value="14 分" />
            <MetricChip theme={t} label="車資" value="NT$ 420" mono />
          </div>
        </Card>
      </div>

      {/* Compliance / status */}
      <div style={{ padding: '12px 16px 0' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px',
          background: t.surface, border: `1px solid ${t.border}`,
          borderRadius: 12,
        }}>
          <StatusDot theme={t} tone={statusTone} pulse={statusTone === 'success' || statusTone === 'warn'} />
          <span style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{statusText}</span>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: t.textDim, fontFamily: TYPE.mono }}>追蹤 · 開啟</span>
        </div>
      </div>

      {/* Lock body for blocked states */}
      {lockBody && (
        <div style={{ padding: '12px 16px 0' }}>
          <div style={{
            padding: '20px 16px',
            background: t.surface, border: `1px dashed ${t.borderStrong}`,
            borderRadius: 12, textAlign: 'center',
          }}>
            <Icon d={lockBody.icon} size={32} stroke={t.textMuted} sw={1.6} />
            <div style={{ fontSize: 15, fontWeight: 700, color: t.text, marginTop: 10 }}>{lockBody.title}</div>
            <div style={{ fontSize: 12, color: t.textMuted, marginTop: 4, lineHeight: 1.5 }}>{lockBody.sub}</div>
          </div>
        </div>
      )}

      <div style={{ flex: 1 }} />

      {/* Sticky action bar */}
      <div style={{
        padding: '12px 16px 16px',
        background: t.bgRaised,
        borderTop: `1px solid ${t.border}`,
        display: 'flex', gap: 8, alignItems: 'center',
      }}>
        {state === 'forwarded_offered' ? (
          <>
            <Button theme={t} kind="outline" size="lg" danger>拒絕</Button>
            <Button theme={t} kind="primary" size="lg" full icon={ICONS.check}
              style={{ background: t.forwardedFg }}>接受平台訂單</Button>
          </>
        ) : primaryAction ? (
          <Button theme={t} kind="primary" size="lg" full icon={primaryAction.icon}>{primaryAction.label}</Button>
        ) : (
          <Button theme={t} kind="secondary" size="lg" full disabled>等待中…</Button>
        )}
      </div>
    </ScreenFrame>
  );
}

function RouteStop({ theme: t, dot, label, addr, time, last }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <div style={{ width: 12, height: 12, borderRadius: 6, background: dot, marginTop: 4, flexShrink: 0, boxShadow: `0 0 0 3px ${dot}25` }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: t.textMuted, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' }}>{label}</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: t.text, marginTop: 1 }}>{addr}</div>
        <div style={{ fontSize: 11, color: t.textDim, marginTop: 2 }}>{time}</div>
      </div>
    </div>
  );
}

function MetricChip({ theme: t, label, value, mono }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: t.textMuted, letterSpacing: 0.4, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: t.text, marginTop: 2, fontFamily: mono ? TYPE.mono : TYPE.family, letterSpacing: -0.1 }}>{value}</div>
    </div>
  );
}

Object.assign(window, {
  ScreenInbox, ScreenTrip, TaskCard, DenseTaskRow,
});
