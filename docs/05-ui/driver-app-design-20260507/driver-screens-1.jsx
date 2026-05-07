// driver-screens-1.jsx — Onboarding, Workspace, Task Inbox, Trip
// All screens take {theme: t, variant?} and return a 412×892 (or 360×780) full-frame node.

// Common Mock data
const MOCK = {
  driver: { name: '陳俊宏', id: 'D-2406', phone: '0912 345 678' },
  device: { id: 'driver-demo-001', name: 'Driver Pixel 01' },
  shift:  { state: 'on', startedAt: '06:42', vehicle: 'AAA-1234', odo: 84230 },
  platforms: [
    { code: 'DRTS', name: '自營派單', online: true, ok: true, lastSync: '剛剛' },
    { code: 'SRX',  name: 'SmartRides X', online: true, ok: true, lastSync: '1 分鐘前', forwarded: true },
    { code: 'METR', name: 'Metro Hail', online: false, reauth: true, lastSync: '12 分鐘前', forwarded: true },
  ],
  tasks: [
    { id: 'T-8821', order: 'ORD-441902', plat: 'DRTS', name: '自營派單', forwarded: false, status: 'in_progress', text: '前往松山機場 第二航廈', sub: '台北車站 · 距離 6.2 km', fare: 'NT$ 420', deadline: '8 分鐘內出發', action: '繼續行程', urgent: true },
    { id: 'T-8822', order: 'SRX-ZZ-90412', plat: 'SRX', name: 'SmartRides X', forwarded: true, status: 'offered', text: '信義區 ATT 4 FUN', sub: '預估 3.8 km · 預估 NT$ 245', fare: 'NT$ 245', deadline: '12 秒可接單', action: '接受平台訂單', native: 'offer_pending' },
    { id: 'T-8823', order: 'SRX-ZZ-90398', plat: 'SRX', name: 'SmartRides X', forwarded: true, status: 'accept_pending', text: '南港展覽館 1 館', sub: '等待平台確認 · 已送出 4 秒', fare: 'NT$ 310', native: 'accept_pending' },
    { id: 'T-8819', order: 'ORD-441887', plat: 'DRTS', name: '自營派單', forwarded: false, status: 'completed', text: '內湖科技園區 · 已完成', sub: '收車 09:14 · 收據已上傳', fare: 'NT$ 380' },
    { id: 'T-8815', order: 'METR-X-882', plat: 'METR', name: 'Metro Hail', forwarded: true, status: 'lost_race', text: '師大夜市', sub: '其他司機已接走', fare: '—', native: 'lost_race' },
    { id: 'T-8810', order: 'METR-X-810', plat: 'METR', name: 'Metro Hail', forwarded: true, status: 'sync_failed', text: '中山國中站', sub: '需派車台處理', fare: '—', native: 'sync_failed' },
  ],
};

// ─── Helpers ────────────────────────────────────────────────────
function ScreenFrame({ theme: t, children, statusBar = true, label, narrow }) {
  return (
    <div style={{
      width: '100%', height: '100%', background: t.bg, color: t.text,
      fontFamily: TYPE.family, display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {statusBar && <FakeStatusBar theme={t} />}
      <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
        {children}
      </div>
    </div>
  );
}

function FakeStatusBar({ theme: t }) {
  return (
    <div style={{
      height: 32, padding: '0 18px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      fontSize: 13, fontWeight: 600, color: t.text, letterSpacing: 0.2,
      background: t.bg, flexShrink: 0,
    }}>
      <span style={{ fontFamily: TYPE.mono }}>9:30</span>
      <div style={{ display: 'flex', gap: 5, alignItems: 'center', opacity: 0.85 }}>
        <Icon d={ICONS.wifi} size={13} sw={2} />
        <span style={{ fontSize: 11, fontFamily: TYPE.mono }}>87%</span>
        <span style={{
          width: 22, height: 11, border: `1.2px solid ${t.text}`, borderRadius: 2.5,
          position: 'relative', display: 'inline-block',
        }}>
          <span style={{ position: 'absolute', inset: 1.5, right: 4, background: t.text, borderRadius: 1 }} />
        </span>
      </div>
    </div>
  );
}

// ─── 1. Device Provisioning (unprovisioned) ─────────────────────
function ScreenProvisioning({ theme: t, variant = 'A' }) {
  return (
    <ScreenFrame theme={t} label="Provisioning">
      <div style={{ padding: '20px 20px 0' }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: t.brand, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontWeight: 800, fontSize: 18, letterSpacing: 0.5,
        }}>D</div>
        <div style={{ fontSize: 24, fontWeight: 700, marginTop: 18, letterSpacing: -0.4 }}>裝置啟用</div>
        <div style={{ fontSize: 14, color: t.textMuted, marginTop: 6, lineHeight: 1.5 }}>
          連線車隊管理系統，啟用後此裝置可接收派單與平台訂單。
        </div>
      </div>

      {/* Activation steps */}
      <div style={{ padding: '24px 20px 0' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, position: 'relative' }}>
          {[
            { t: '裝置註冊', s: '產生車隊識別碼', state: 'active', icon: ICONS.device },
            { t: '駕駛身份驗證', s: '綁定駕駛 D-2406', state: 'pending', icon: ICONS.user },
            { t: '平台帳號連線', s: '3 個外部平台待綁定', state: 'pending', icon: ICONS.layers },
          ].map((step, i, arr) => (
            <div key={i} style={{ display: 'flex', gap: 14, paddingBottom: i === arr.length - 1 ? 0 : 16, position: 'relative' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 14,
                  background: step.state === 'active' ? t.brand : t.surfaceLo,
                  border: `1.5px solid ${step.state === 'active' ? t.brand : t.border}`,
                  color: step.state === 'active' ? '#fff' : t.textDim,
                  fontSize: 11, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: TYPE.mono,
                }}>{i + 1}</div>
                {i < arr.length - 1 && (
                  <div style={{ flex: 1, width: 1.5, background: t.border, marginTop: 4 }} />
                )}
              </div>
              <div style={{ flex: 1, paddingTop: 3 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: step.state === 'active' ? t.text : t.textMuted }}>{step.t}</div>
                <div style={{ fontSize: 12, color: t.textDim, marginTop: 2 }}>{step.s}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Form */}
      <div style={{ padding: '20px', marginTop: 4 }}>
        <Card theme={t} padding={16}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <FormField theme={t} label="註冊代碼" value="driver-demo-001" mono />
            <FormField theme={t} label="裝置名稱" value="Driver Pixel 01" />
          </div>
        </Card>
        <div style={{ marginTop: 14 }}>
          <Button theme={t} kind="primary" size="lg" full icon={ICONS.shield}>註冊此裝置</Button>
        </div>
        <div style={{
          marginTop: 14, padding: '10px 12px',
          background: t.warnBg, color: t.warn,
          border: `1px solid ${t.warn}30`, borderRadius: 10,
          fontSize: 12, lineHeight: 1.45,
          display: 'flex', gap: 8, alignItems: 'flex-start',
        }}>
          <Icon d={ICONS.lock} size={14} stroke={t.warn} sw={2} />
          <span>未啟用裝置無法接收派單。請使用車隊發放的代碼，避免使用個人帳號註冊。</span>
        </div>
      </div>
    </ScreenFrame>
  );
}

function FormField({ theme: t, label, value, mono }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{
        height: 44, padding: '0 12px', display: 'flex', alignItems: 'center',
        background: t.surfaceLo,
        border: `1px solid ${t.border}`,
        borderRadius: 10,
        fontSize: 15, color: t.text,
        fontFamily: mono ? TYPE.mono : TYPE.family,
      }}>{value}</div>
    </div>
  );
}

// ─── 2. Workspace Cockpit ───────────────────────────────────────
function ScreenWorkspace({ theme: t, variant = 'A' }) {
  if (variant === 'B') return <ScreenWorkspaceB theme={t} />;
  return (
    <ScreenFrame theme={t} label="Workspace">
      {/* Header */}
      <div style={{ padding: '14px 18px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 12, color: t.textMuted, fontWeight: 500 }}>早安，{MOCK.driver.name}</div>
          <div style={{ fontSize: 13, color: t.textDim, marginTop: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
            <StatusDot theme={t} tone="success" pulse />
            上班中 · 06:42 起
          </div>
        </div>
        <button style={{
          width: 38, height: 38, borderRadius: 12,
          background: t.surface, border: `1px solid ${t.border}`,
          color: t.text, position: 'relative', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon d={ICONS.bell} size={18} sw={1.8} />
          <span style={{ position: 'absolute', top: 8, right: 9, width: 7, height: 7, borderRadius: 4, background: t.danger }} />
        </button>
      </div>

      {/* Hero next-action card */}
      <div style={{ padding: '4px 16px 0' }}>
        <div style={{
          background: t.brand,
          color: '#fff',
          borderRadius: 18,
          padding: '16px 18px 18px',
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: -30, right: -20, width: 160, height: 160, borderRadius: '50%', background: 'rgba(255,255,255,0.07)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, letterSpacing: 0.6, opacity: 0.85, textTransform: 'uppercase' }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: '#fff' }} />
            下一步動作
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6, letterSpacing: -0.3, lineHeight: 1.25 }}>
            繼續行程 · 松山機場
          </div>
          <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>
            T-8821 · 自營派單 · 8 分鐘內出發
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <Button theme={t} kind="primary" size="md" style={{
              background: '#fff', color: t.brand, border: 'none', fontWeight: 700,
            }}>前往行程</Button>
            <Button theme={t} kind="ghost" size="md" style={{ color: '#fff', background: 'rgba(255,255,255,0.15)', border: 'none' }}>查看路線</Button>
          </div>
        </div>
      </div>

      {/* KPI row */}
      <div style={{ padding: '14px 16px 0', display: 'flex', gap: 8 }}>
        <Kpi theme={t} label="待處理" value="3" tone="brand" icon={ICONS.list} />
        <Kpi theme={t} label="已上線" value="2" unit="/ 3" tone="success" icon={ICONS.power} />
        <Kpi theme={t} label="今日淨收" value="1,840" unit="NT$" tone="neutral" icon={ICONS.wallet} />
      </div>

      {/* Reauth alert (urgent) */}
      <div style={{ padding: '12px 16px 0' }}>
        <Card theme={t} padding={0} style={{ borderColor: t.warn + '60', background: t.warnBg }}>
          <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: t.warn + '25', display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.warn }}>
              <Icon d={ICONS.unlock} size={16} sw={2} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: t.warn }}>Metro Hail 需重新授權</div>
              <div style={{ fontSize: 12, color: t.textMuted, marginTop: 1 }}>Token 已過期，無法接單</div>
            </div>
            <Button theme={t} kind="primary" size="sm" style={{ background: t.warn }}>處理</Button>
          </div>
        </Card>
      </div>

      {/* Platform presence */}
      <div style={{ padding: '14px 16px 0' }}>
        <Section theme={t} title="平台連線" action={
          <span style={{ fontSize: 12, color: t.brand, fontWeight: 600 }}>全部</span>
        } dense>
          <Card theme={t} padding={0}>
            {MOCK.platforms.map((p, i, a) => (
              <Row key={p.code} theme={t} last={i === a.length - 1}
                label={p.name}
                sub={p.reauth ? '需重新授權' : (p.online ? `已上線 · ${p.lastSync}` : `離線 · ${p.lastSync}`)}
                right={
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {p.forwarded && <Chip theme={t} tone="forwarded" size="sm">外部</Chip>}
                    <Switch theme={t} on={p.online && !p.reauth} />
                  </div>
                } />
            ))}
          </Card>
        </Section>
      </div>

      {/* Quick links */}
      <div style={{ padding: '4px 16px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <QuickTile theme={t} icon={ICONS.list} label="任務" sub="3 待處理" />
        <QuickTile theme={t} icon={ICONS.wallet} label="收入" sub="今日 NT$ 1,840" />
        <QuickTile theme={t} icon={ICONS.clock} label="班次" sub="2 小時 48 分" />
        <QuickTile theme={t} icon={ICONS.alert} label="SOS" sub="安全求援" tone="danger" />
      </div>

      <BottomTabs theme={t} active="home" />
    </ScreenFrame>
  );
}

function QuickTile({ theme: t, icon, label, sub, tone }) {
  return (
    <div style={{
      padding: '12px 14px',
      background: t.surface, border: `1px solid ${t.border}`,
      borderRadius: 12,
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: tone === 'danger' ? t.dangerBg : t.brandBg,
        color: tone === 'danger' ? t.danger : t.brand,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon d={icon} size={18} sw={2} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{label}</div>
        <div style={{ fontSize: 11, color: t.textMuted, marginTop: 1 }}>{sub}</div>
      </div>
    </div>
  );
}

// Variant B — denser stacked layout
function ScreenWorkspaceB({ theme: t }) {
  return (
    <ScreenFrame theme={t} label="Workspace B">
      <div style={{ padding: '14px 16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.5, lineHeight: 1.05 }}>工作台</div>
            <div style={{ fontSize: 13, color: t.textMuted, marginTop: 4 }}>{MOCK.driver.name} · D-2406</div>
          </div>
          <Chip theme={t} tone="success" dot strong size="md">上班中</Chip>
        </div>
      </div>

      {/* Stacked status strip */}
      <div style={{ padding: '14px 16px 0' }}>
        <div style={{
          background: t.surface, border: `1px solid ${t.border}`,
          borderRadius: 14, overflow: 'hidden',
        }}>
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${t.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, letterSpacing: 0.5, textTransform: 'uppercase' }}>進行中行程</span>
              <Chip theme={t} tone="owned" size="sm">自營</Chip>
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, marginTop: 6 }}>松山機場 第二航廈</div>
            <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2, fontFamily: TYPE.mono }}>T-8821 · ORD-441902 · NT$ 420</div>
            <div style={{ marginTop: 12 }}>
              <Button theme={t} kind="primary" size="md" full icon={ICONS.car}>繼續行程</Button>
            </div>
          </div>
          <div style={{ padding: '12px 16px', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
            <MiniStat theme={t} label="待處理" value="3" />
            <MiniStat theme={t} label="平台上線" value="2/3" />
            <MiniStat theme={t} label="今日淨收" value="1,840" />
          </div>
        </div>
      </div>

      {/* Urgent items list */}
      <div style={{ padding: '14px 16px 0' }}>
        <Section theme={t} title="需要您處理" dense>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <UrgentRow theme={t} icon={ICONS.unlock} tone="warn"
              title="Metro Hail 需重新授權" sub="Token 過期 12 分鐘前" cta="處理" />
            <UrgentRow theme={t} icon={ICONS.layers} tone="forwarded"
              title="SmartRides X 訂單等待您接單" sub="ATT 4 FUN · 12 秒內" cta="查看" />
          </div>
        </Section>
      </div>

      {/* Platform mini strip */}
      <div style={{ padding: '0 16px 24px' }}>
        <Section theme={t} title="平台連線" dense>
          <div style={{ display: 'flex', gap: 8 }}>
            {MOCK.platforms.map(p => (
              <div key={p.code} style={{
                flex: 1,
                padding: '10px 10px 12px',
                background: t.surface, border: `1px solid ${t.border}`,
                borderRadius: 12,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: p.forwarded ? t.forwardedFg : t.ownedFg, fontFamily: TYPE.mono, letterSpacing: 0.5 }}>{p.code}</span>
                  <StatusDot theme={t} tone={p.online ? 'success' : (p.reauth ? 'warn' : 'neutral')} />
                </div>
                <div style={{ fontSize: 11, color: t.text, marginTop: 4, fontWeight: 600, letterSpacing: -0.1 }}>
                  {p.name.split(' ')[0]}
                </div>
                <div style={{ fontSize: 10, color: t.textMuted, marginTop: 1 }}>
                  {p.reauth ? '需授權' : p.online ? '上線' : '離線'}
                </div>
              </div>
            ))}
          </div>
        </Section>
      </div>

      <BottomTabs theme={t} active="home" />
    </ScreenFrame>
  );
}

function MiniStat({ theme: t, label, value }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: t.textMuted, letterSpacing: 0.4, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 700, color: t.text, marginTop: 2, fontFamily: TYPE.mono, letterSpacing: -0.3 }}>{value}</div>
    </div>
  );
}

function UrgentRow({ theme: t, icon, tone, title, sub, cta }) {
  const colors = {
    warn: { fg: t.warn, bg: t.warnBg, bd: t.warn + '40' },
    forwarded: { fg: t.forwardedFg, bg: t.forwardedBg, bd: t.forwardedBorder },
  }[tone];
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 14px',
      background: colors.bg, border: `1px solid ${colors.bd}`,
      borderRadius: 12,
    }}>
      <div style={{ width: 32, height: 32, borderRadius: 10, background: colors.fg + '25', color: colors.fg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon d={icon} size={16} sw={2} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{title}</div>
        <div style={{ fontSize: 11, color: t.textMuted, marginTop: 1 }}>{sub}</div>
      </div>
      <Button theme={t} kind="primary" size="sm" style={{ background: colors.fg }}>{cta}</Button>
    </div>
  );
}

Object.assign(window, {
  MOCK, ScreenFrame, FakeStatusBar, FormField,
  ScreenProvisioning, ScreenWorkspace,
});
