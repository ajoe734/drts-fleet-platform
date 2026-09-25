// mgmt-screens.jsx — Ops Console + Platform Admin (desktop)
// Hi-fi management surfaces. Width ~1280, height auto inside artboard.

function MgmtFrame({ theme: t, title, subtitle, tabs, activeTab, children }) {
  return (
    <div style={{
      width: '100%', height: '100%',
      background: t.bg, color: t.text,
      fontFamily: TYPE.family, display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <MgmtTopBar theme={t} title={title} subtitle={subtitle} />
      {tabs && <MgmtTabs theme={t} tabs={tabs} active={activeTab} />}
      <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>{children}</div>
    </div>
  );
}

function MgmtTopBar({ theme: t, title, subtitle }) {
  return (
    <div style={{
      padding: '14px 24px',
      background: t.bgRaised, borderBottom: `1px solid ${t.border}`,
      display: 'flex', alignItems: 'center', gap: 16,
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 8, background: t.brand,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontWeight: 800, fontSize: 13,
      }}>D</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>DRTS Ops Console</div>
      <span style={{ width: 1, height: 18, background: t.border }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: t.text, letterSpacing: -0.2 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: t.textMuted, marginTop: 1 }}>{subtitle}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Chip theme={t} tone="success" dot size="sm">系統正常</Chip>
        <span style={{ fontSize: 12, color: t.textMuted }}>派車台 · 林佩琪</span>
        <div style={{ width: 30, height: 30, borderRadius: 15, background: t.brandBg, color: t.brand, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>林</div>
      </div>
    </div>
  );
}

function MgmtTabs({ theme: t, tabs, active }) {
  return (
    <div style={{
      padding: '0 24px',
      background: t.bgRaised, borderBottom: `1px solid ${t.border}`,
      display: 'flex', gap: 0,
    }}>
      {tabs.map(tab => {
        const on = tab === active;
        return (
          <span key={tab} style={{
            padding: '10px 14px',
            fontSize: 13, fontWeight: on ? 700 : 500,
            color: on ? t.brand : t.textMuted,
            borderBottom: `2px solid ${on ? t.brand : 'transparent'}`,
            cursor: 'pointer',
          }}>{tab}</span>
        );
      })}
    </div>
  );
}

// ─── Ops: Forwarded Order Board ─────────────────────────────────
function OpsForwardedBoard({ theme: t }) {
  const orders = [
    { mid: 'M-9012', plat: 'SRX',  pname: 'SmartRides X', xid: 'SRX-ZZ-90412', status: 'broadcasted', native: 'offer_pending', candidates: 4, accepted: '—', err: '—', age: '8s' },
    { mid: 'M-9011', plat: 'SRX',  pname: 'SmartRides X', xid: 'SRX-ZZ-90398', status: 'accept_pending', native: 'accept_pending', candidates: 1, accepted: 'D-2406', err: '—', age: '4s' },
    { mid: 'M-9008', plat: 'SRX',  pname: 'SmartRides X', xid: 'SRX-ZZ-90376', status: 'confirmed', native: 'on_trip', candidates: 1, accepted: 'D-2412', err: '—', age: '6m' },
    { mid: 'M-9004', plat: 'METR', pname: 'Metro Hail',   xid: 'METR-X-882',   status: 'sync_failed', native: '—', candidates: 0, accepted: '—', err: 'webhook 502 ×3', age: '12m' },
    { mid: 'M-9001', plat: 'METR', pname: 'Metro Hail',   xid: 'METR-X-810',   status: 'lost_race', native: 'taken', candidates: 6, accepted: '—', err: '—', age: '18m' },
    { mid: 'M-8998', plat: 'SRX',  pname: 'SmartRides X', xid: 'SRX-ZZ-90218', status: 'cancelled', native: 'cancelled', candidates: 2, accepted: '—', err: '—', age: '32m' },
  ];
  const statusChip = (s) => {
    const map = {
      received:       { tone: 'neutral', label: '已接收' },
      broadcasted:    { tone: 'info',    label: '已廣播' },
      accept_pending: { tone: 'warn',    label: '等待平台確認' },
      confirmed:      { tone: 'success', label: '平台已確認' },
      lost_race:      { tone: 'neutral', label: '失去訂單' },
      cancelled:      { tone: 'neutral', label: '平台取消' },
      sync_failed:    { tone: 'danger',  label: '同步失敗' },
    };
    const s2 = map[s];
    return <Chip theme={t} tone={s2.tone} size="sm" dot>{s2.label}</Chip>;
  };
  return (
    <MgmtFrame theme={t} title="外部平台訂單" subtitle="即時轉送訂單監控與處理"
      tabs={['訂單看板', '轉接器健康度', '司機可用性', '對帳佇列', '稽核紀錄']} activeTab="訂單看板">

      {/* KPI strip */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 18 }}>
        <Kpi theme={t} label="進行中" value="14" tone="brand" icon={ICONS.layers} />
        <Kpi theme={t} label="等候平台確認" value="3" tone="warn" icon={ICONS.clock} />
        <Kpi theme={t} label="同步失敗" value="2" tone="danger" icon={ICONS.alert} />
        <Kpi theme={t} label="今日已轉送" value="148" />
        <Kpi theme={t} label="平均接單時間" value="6.2" unit="秒" />
        <Kpi theme={t} label="人工 fallback" value="1" tone="warn" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 16 }}>
        {/* Order table */}
        <Card theme={t} padding={0} style={{ overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: t.text }}>近 30 分訂單</span>
            <span style={{ fontSize: 11, color: t.textMuted }}>共 {orders.length} 筆</span>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 12, color: t.brand, fontWeight: 600 }}>篩選 ▾</span>
            <span style={{ fontSize: 12, color: t.textMuted, fontWeight: 500 }}>更新 · 2 秒前</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: t.surfaceLo, color: t.textMuted, fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                {['鏡像 ID', '平台', '外部 ID', '狀態', '原生狀態', '候選/接受', '錯誤', '存活時間', ''].map(h => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, borderBottom: `1px solid ${t.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map((o, i) => (
                <tr key={o.mid} style={{
                  borderBottom: i < orders.length - 1 ? `1px solid ${t.border}` : 'none',
                  background: i === 1 ? t.warnBg + '40' : 'transparent',
                }}>
                  <td style={{ padding: '10px', fontFamily: TYPE.mono, fontWeight: 600, color: t.text }}>{o.mid}</td>
                  <td style={{ padding: '10px' }}>
                    <PlatformBadge theme={t} code={o.plat} name={o.pname} forwarded size="sm" />
                  </td>
                  <td style={{ padding: '10px', fontFamily: TYPE.mono, color: t.textMuted }}>{o.xid}</td>
                  <td style={{ padding: '10px' }}>{statusChip(o.status)}</td>
                  <td style={{ padding: '10px', fontFamily: TYPE.mono, color: t.textMuted, fontSize: 11 }}>{o.native}</td>
                  <td style={{ padding: '10px', color: t.text }}>
                    <span style={{ fontFamily: TYPE.mono }}>{o.candidates}</span>
                    {o.accepted !== '—' && <span style={{ color: t.success, marginLeft: 6, fontFamily: TYPE.mono, fontWeight: 600 }}>→{o.accepted}</span>}
                  </td>
                  <td style={{ padding: '10px', color: o.err !== '—' ? t.danger : t.textDim, fontSize: 11 }}>{o.err}</td>
                  <td style={{ padding: '10px', fontFamily: TYPE.mono, color: t.textMuted }}>{o.age}</td>
                  <td style={{ padding: '10px', textAlign: 'right' }}>
                    <Icon d={ICONS.arrow} size={14} stroke={t.textDim} sw={1.8} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        {/* Detail panel */}
        <Card theme={t} padding={0} style={{ overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${t.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <PlatformBadge theme={t} code="SRX" name="SmartRides X" forwarded size="sm" />
              <Chip theme={t} tone="warn" size="sm" dot>等待平台確認</Chip>
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: t.text, fontFamily: TYPE.mono }}>M-9011</div>
            <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>SRX-ZZ-90398 · 已等待 4 秒</div>
          </div>
          <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <DetailKv theme={t} k="本機鏡像狀態" v="accept_pending" mono />
            <DetailKv theme={t} k="原生狀態" v="accept_pending" mono />
            <DetailKv theme={t} k="候選司機" v="D-2406" mono link />
            <DetailKv theme={t} k="接單司機" v="D-2406" mono />
            <DetailKv theme={t} k="費用權威" v="平台主導" tone="forwarded" />
            <DetailKv theme={t} k="結算權威" v="平台" tone="forwarded" />
          </div>
          <div style={{ padding: '12px 16px', borderTop: `1px solid ${t.border}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Button theme={t} kind="primary" size="sm" full icon={ICONS.refresh}>強制同步原生狀態</Button>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button theme={t} kind="outline" size="sm" full>啟用人工 fallback</Button>
              <Button theme={t} kind="outline" size="sm" full>標記同步失敗</Button>
            </div>
          </div>
        </Card>
      </div>
    </MgmtFrame>
  );
}

function DetailKv({ theme: t, k, v, mono, link, tone }) {
  const c = tone === 'forwarded' ? t.forwardedFg : t.text;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 12 }}>
      <span style={{ color: t.textMuted }}>{k}</span>
      <span style={{
        color: link ? t.brand : c,
        fontWeight: 600,
        fontFamily: mono ? TYPE.mono : TYPE.family,
      }}>{v}</span>
    </div>
  );
}

// ─── Platform Admin: Adapter Registry ───────────────────────────
function AdminAdapterRegistry({ theme: t }) {
  const adapters = [
    { code: 'DRTS', name: '自營派單', env: 'production', enabled: true, type: 'internal', webhook: '—',           cred: 'n/a',        check: '剛剛',  rollout: 'production', forwarded: false },
    { code: 'SRX',  name: 'SmartRides X', env: 'production', enabled: true, type: 'rest+webhook', webhook: 'OK',  cred: 'OK',          check: '8 秒前', rollout: 'production', forwarded: true },
    { code: 'METR', name: 'Metro Hail',   env: 'production', enabled: true, type: 'rest+webhook', webhook: '502', cred: '已過期',     check: '12 分前', rollout: 'production', forwarded: true, warn: true },
    { code: 'GRTW', name: 'Grab TW',      env: 'sandbox',    enabled: false, type: 'rest+webhook', webhook: '—',   cred: '未設定',     check: '—',     rollout: 'sandbox', forwarded: true, draft: true },
  ];
  return (
    <MgmtFrame theme={t} title="平台轉接器" subtitle="設定外部平台連線、認證與發布流程"
      tabs={['轉接器登記', '財務權威', '稽核紀錄', '功能旗標']} activeTab="轉接器登記">

      <div style={{ display: 'flex', gap: 12, marginBottom: 18 }}>
        <Kpi theme={t} label="已啟用" value="3" tone="success" />
        <Kpi theme={t} label="認證即將到期" value="1" tone="warn" />
        <Kpi theme={t} label="Sandbox" value="1" tone="info" />
        <Kpi theme={t} label="今日 Webhook 失敗" value="6" tone="danger" />
      </div>

      <Card theme={t} padding={0} style={{ overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: t.text }}>轉接器列表</span>
          <span style={{ flex: 1 }} />
          <Button theme={t} kind="primary" size="sm" icon={ICONS.plus}>新增轉接器</Button>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: t.surfaceLo, color: t.textMuted, fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase' }}>
              {['平台', '環境', '狀態', '認證', 'Webhook', '健康檢查', '發布階段', ''].map(h => (
                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, borderBottom: `1px solid ${t.border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {adapters.map((a, i) => (
              <tr key={a.code} style={{ borderBottom: i < adapters.length - 1 ? `1px solid ${t.border}` : 'none' }}>
                <td style={{ padding: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 8,
                      background: a.forwarded ? t.forwardedBg : t.ownedBg,
                      color: a.forwarded ? t.forwardedFg : t.ownedFg,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 800, fontFamily: TYPE.mono,
                    }}>{a.code.slice(0, 3)}</div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{a.name}</div>
                      <div style={{ fontSize: 10, color: t.textDim, fontFamily: TYPE.mono, letterSpacing: 0.4 }}>{a.code} · {a.type}</div>
                    </div>
                  </div>
                </td>
                <td style={{ padding: '12px' }}>
                  <Chip theme={t} tone={a.env === 'production' ? 'success' : 'info'} size="sm">{a.env}</Chip>
                </td>
                <td style={{ padding: '12px' }}>
                  <Switch theme={t} on={a.enabled} />
                </td>
                <td style={{ padding: '12px', color: a.cred === 'OK' ? t.success : (a.cred === 'n/a' ? t.textDim : t.danger), fontWeight: 600 }}>
                  {a.cred}
                </td>
                <td style={{ padding: '12px', color: a.webhook === 'OK' ? t.success : (a.webhook === '—' ? t.textDim : t.danger), fontFamily: TYPE.mono, fontWeight: 600 }}>
                  {a.webhook}
                </td>
                <td style={{ padding: '12px', fontFamily: TYPE.mono, color: t.textMuted }}>{a.check}</td>
                <td style={{ padding: '12px' }}>
                  <Chip theme={t} tone={a.rollout === 'production' ? 'success' : 'neutral'} size="sm">{a.rollout}</Chip>
                </td>
                <td style={{ padding: '12px', textAlign: 'right' }}>
                  <Icon d={ICONS.more} size={14} stroke={t.textDim} sw={2} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Detail card example */}
      <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Card theme={t} padding={16}>
          <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 12 }}>政策設定 · SmartRides X</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <PolicyRow theme={t} k="允許服務類型" v="一般 · 機場接送" />
            <PolicyRow theme={t} k="最大候選司機" v="6" mono />
            <PolicyRow theme={t} k="接單超時" v="20 秒" mono />
            <PolicyRow theme={t} k="人工 fallback 觸發" v="3 連續失敗" mono />
            <PolicyRow theme={t} k="財務權威" v="平台主導" tone="forwarded" />
          </div>
        </Card>
        <Card theme={t} padding={16}>
          <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 12 }}>功能旗標</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <FlagRow theme={t} k="駕駛接受外部訂單" on />
            <FlagRow theme={t} k="駕駛拒絕外部訂單" on />
            <FlagRow theme={t} k="平台收入頁面" on />
            <FlagRow theme={t} k="平台連線頁面" on />
          </div>
        </Card>
      </div>
    </MgmtFrame>
  );
}

function PolicyRow({ theme: t, k, v, mono, tone }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
      <span style={{ color: t.textMuted }}>{k}</span>
      <span style={{
        fontWeight: 600,
        color: tone === 'forwarded' ? t.forwardedFg : t.text,
        fontFamily: mono ? TYPE.mono : TYPE.family,
      }}>{v}</span>
    </div>
  );
}

function FlagRow({ theme: t, k, on }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
      <span style={{ color: t.text }}>{k}</span>
      <Switch theme={t} on={on} />
    </div>
  );
}

Object.assign(window, {
  MgmtFrame, OpsForwardedBoard, AdminAdapterRegistry,
});
