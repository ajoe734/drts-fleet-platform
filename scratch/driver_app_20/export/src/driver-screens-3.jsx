// driver-screens-3.jsx — Platform Presence, Earnings, Shift, SOS, Settings

// ─── 6. Platform Presence ───────────────────────────────────────
function ScreenPlatform({ theme: t, variant = 'A' }) {
  const platforms = [
    { code: 'DRTS', name: '自營派單', online: true, ok: true, lastSync: '剛剛', tokenExp: '長期有效', forwarded: false, today: 4 },
    { code: 'SRX',  name: 'SmartRides X', online: true, ok: true, lastSync: '1 分鐘前', tokenExp: '14 天後到期', forwarded: true, today: 3 },
    { code: 'METR', name: 'Metro Hail', online: false, reauth: true, lastSync: '12 分鐘前', tokenExp: '已過期', forwarded: true, blocking: 'Token 已過期，請重新授權', today: 0 },
  ];
  return (
    <ScreenFrame theme={t} label="Platform Presence">
      <div style={{ padding: '14px 16px 8px' }}>
        <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.4 }}>平台連線</div>
        <div style={{ fontSize: 13, color: t.textMuted, marginTop: 4 }}>3 個平台 · 2 上線 · 1 需處理</div>
      </div>

      <div style={{ padding: '12px 16px 0', display: 'flex', gap: 8 }}>
        <Kpi theme={t} label="可接單" value="2" tone="success" />
        <Kpi theme={t} label="今日完成" value="7" tone="brand" />
        <Kpi theme={t} label="需動作" value="1" tone="warn" />
      </div>

      <div style={{ padding: '14px 16px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {platforms.map(p => <PlatformCard key={p.code} theme={t} p={p} />)}
      </div>

      <div style={{ padding: '14px 16px 0' }}>
        <div style={{
          padding: '12px 14px',
          background: t.infoBg, border: `1px solid ${t.info}30`,
          borderRadius: 12, display: 'flex', gap: 10, alignItems: 'flex-start',
        }}>
          <Icon d={ICONS.info} size={16} stroke={t.info} sw={2} />
          <div style={{ fontSize: 12, color: t.text, lineHeight: 1.5 }}>
            上線狀態為平台是否可發送訂單給您的依據。離線時不會收到該平台訂單；自營派單與外部平台可同時上線。
          </div>
        </div>
      </div>

      <div style={{ height: 24 }} />
      <BottomTabs theme={t} active="platform" />
    </ScreenFrame>
  );
}

function PlatformCard({ theme: t, p }) {
  const isOk = p.online && !p.reauth;
  const isReauth = p.reauth;
  return (
    <div style={{
      background: t.surface,
      border: `1px solid ${isReauth ? t.warn + '60' : t.border}`,
      borderRadius: 14, overflow: 'hidden',
    }}>
      <div style={{ padding: '14px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: p.forwarded ? t.forwardedBg : t.ownedBg,
          color: p.forwarded ? t.forwardedFg : t.ownedFg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 800, fontFamily: TYPE.mono, letterSpacing: 0.5,
        }}>{p.code.slice(0, 3)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 15, fontWeight: 650, color: t.text }}>{p.name}</span>
            {p.forwarded && <Chip theme={t} tone="forwarded" size="sm">外部</Chip>}
          </div>
          <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
            <StatusDot theme={t} tone={isOk ? 'success' : (isReauth ? 'warn' : 'neutral')} />
            {isReauth ? '需重新授權' : (p.online ? '上線中' : '離線')}
            <span style={{ width: 3, height: 3, borderRadius: 1.5, background: t.borderStrong }} />
            <span style={{ fontFamily: TYPE.mono }}>{p.lastSync}</span>
          </div>
        </div>
        <Switch theme={t} on={isOk} disabled={isReauth} />
      </div>
      {isReauth && (
        <div style={{
          padding: '10px 14px', background: t.warnBg, borderTop: `1px solid ${t.warn}30`,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <Icon d={ICONS.unlock} size={14} stroke={t.warn} sw={2} />
          <span style={{ fontSize: 12, color: t.warn, fontWeight: 600, flex: 1 }}>{p.blocking}</span>
          <Button theme={t} kind="primary" size="sm" style={{ background: t.warn }}>重新授權</Button>
        </div>
      )}
      <div style={{
        padding: '10px 14px',
        borderTop: `1px solid ${t.border}`,
        display: 'flex', gap: 14, fontSize: 11, color: t.textMuted,
      }}>
        <span>Token：<span style={{ color: t.textMuted, fontFamily: TYPE.mono }}>{p.tokenExp}</span></span>
        <span style={{ flex: 1 }} />
        <span>今日 <span style={{ color: t.text, fontWeight: 700, fontFamily: TYPE.mono }}>{p.today}</span> 單</span>
      </div>
    </div>
  );
}

// ─── 7. Earnings ────────────────────────────────────────────────
function ScreenEarnings({ theme: t }) {
  const breakdown = [
    { code: 'DRTS', name: '自營派單', forwarded: false, gross: 1240, fee: 0, sub: 100, net: 1340, authority: 'DRTS 結算' },
    { code: 'SRX',  name: 'SmartRides X', forwarded: true, gross: 820, fee: -180, sub: 0, net: 640, authority: '平台結算' },
    { code: 'METR', name: 'Metro Hail', forwarded: true, gross: 0, fee: 0, sub: 0, net: 0, authority: '平台結算', empty: true },
  ];
  return (
    <ScreenFrame theme={t} label="Earnings">
      <TopBar theme={t} title="收入" subtitle="本日 5/7" back right={
        <button style={{
          padding: '6px 10px', borderRadius: 8, border: `1px solid ${t.border}`,
          background: t.surface, color: t.text, fontSize: 12, fontWeight: 600, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}>本日 ▾</button>
      } />

      {/* Big net */}
      <div style={{ padding: '16px 16px 0' }}>
        <Card theme={t} padding={18}>
          <div style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, letterSpacing: 0.6, textTransform: 'uppercase' }}>淨收入 · 本日</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
            <span style={{ fontSize: 36, fontWeight: 700, color: t.text, letterSpacing: -1, fontFamily: TYPE.mono }}>1,840</span>
            <span style={{ fontSize: 14, color: t.textMuted, fontWeight: 500 }}>NT$</span>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 12, color: t.success, fontWeight: 600 }}>+12% vs 昨日</span>
          </div>
          <div style={{ display: 'flex', gap: 14, marginTop: 14, paddingTop: 14, borderTop: `1px solid ${t.border}` }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: t.textMuted, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>毛收</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: t.text, fontFamily: TYPE.mono, marginTop: 2 }}>2,060</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: t.textMuted, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>平台抽成</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: t.danger, fontFamily: TYPE.mono, marginTop: 2 }}>−180</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: t.textMuted, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>待入帳</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: t.warn, fontFamily: TYPE.mono, marginTop: 2 }}>640</div>
            </div>
          </div>
        </Card>
      </div>

      {/* Authority warning */}
      <div style={{ padding: '14px 16px 0' }}>
        <Section theme={t} title="平台分項" dense subtitle="不同平台有不同的結算權威；外部平台金額為參考值。">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {breakdown.map(b => <EarningsRow key={b.code} theme={t} b={b} />)}
          </div>
        </Section>
      </div>

      {/* Statements */}
      <div style={{ padding: '0 16px 24px' }}>
        <Section theme={t} title="月結報表" dense>
          <Card theme={t} padding={0}>
            <Row theme={t} label="2026/04 月結" sub="32 趟 · 已入帳" value="NT$ 38,420" />
            <Row theme={t} label="2026/03 月結" sub="29 趟 · 已入帳" value="NT$ 34,210" last />
          </Card>
        </Section>
      </div>

      <BottomTabs theme={t} active="settings" />
    </ScreenFrame>
  );
}

function EarningsRow({ theme: t, b }) {
  return (
    <div style={{
      background: t.surface, border: `1px solid ${t.border}`,
      borderRadius: 12, padding: '12px 14px',
      opacity: b.empty ? 0.6 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <PlatformBadge theme={t} code={b.code} name={b.name} forwarded={b.forwarded} size="sm" />
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 16, fontWeight: 700, color: t.text, fontFamily: TYPE.mono, letterSpacing: -0.3 }}>
          {b.empty ? '—' : `${b.net.toLocaleString()}`}
        </span>
      </div>
      <div style={{
        display: 'flex', gap: 14, marginTop: 10, paddingTop: 10,
        borderTop: `1px dashed ${t.border}`, fontSize: 11, color: t.textMuted,
      }}>
        <span>毛收 <span style={{ color: t.text, fontFamily: TYPE.mono, fontWeight: 600 }}>{b.gross.toLocaleString()}</span></span>
        <span>抽成 <span style={{ color: t.text, fontFamily: TYPE.mono, fontWeight: 600 }}>{b.fee}</span></span>
        <span>補助 <span style={{ color: t.text, fontFamily: TYPE.mono, fontWeight: 600 }}>+{b.sub}</span></span>
        <span style={{ flex: 1, textAlign: 'right', color: b.forwarded ? t.forwardedFg : t.ownedFg, fontWeight: 600 }}>
          {b.authority}
        </span>
      </div>
    </div>
  );
}

// ─── 8. Shift ───────────────────────────────────────────────────
function ScreenShift({ theme: t }) {
  return (
    <ScreenFrame theme={t} label="Shift">
      <TopBar theme={t} title="班次" subtitle="今日打卡記錄" back />

      <div style={{ padding: '16px 16px 0' }}>
        <Card theme={t} padding={18}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <StatusDot theme={t} tone="success" pulse />
            <span style={{ fontSize: 11, fontWeight: 700, color: t.success, letterSpacing: 0.5, textTransform: 'uppercase' }}>上班中</span>
          </div>
          <div style={{ fontSize: 32, fontWeight: 700, marginTop: 8, fontFamily: TYPE.mono, letterSpacing: -1 }}>02:48</div>
          <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>已工作 2 小時 48 分 · 自 06:42 起</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14, paddingTop: 14, borderTop: `1px solid ${t.border}` }}>
            <ShiftField theme={t} label="車輛" value="AAA-1234" mono />
            <ShiftField theme={t} label="起始里程" value="84,230" mono unit="km" />
            <ShiftField theme={t} label="起始位置" value="松山機場 停車場" />
            <ShiftField theme={t} label="預計下班" value="14:00" mono />
          </div>
        </Card>
      </div>

      <div style={{ padding: '14px 16px 0' }}>
        <Section theme={t} title="今日總結" dense>
          <div style={{ display: 'flex', gap: 8 }}>
            <Kpi theme={t} label="完成趟次" value="7" tone="brand" />
            <Kpi theme={t} label="總里程" value="42.6" unit="km" />
            <Kpi theme={t} label="淨收入" value="1,840" unit="NT$" />
          </div>
        </Section>
      </div>

      <div style={{ padding: '4px 16px 0' }}>
        <Section theme={t} title="多平台可用性" dense>
          <Card theme={t} padding={0}>
            <Row theme={t} label="自營派單可用" sub="班次中可接收派單" right={<StatusDot theme={t} tone="success" />} />
            <Row theme={t} label="外部平台可用" sub="2 / 3 平台目前上線" right={<StatusDot theme={t} tone="success" />} last />
          </Card>
        </Section>
      </div>

      <div style={{ flex: 1 }} />
      <div style={{
        padding: '12px 16px 16px',
        background: t.bgRaised, borderTop: `1px solid ${t.border}`,
      }}>
        <Button theme={t} kind="outline" size="lg" full danger icon={ICONS.power}>下班打卡</Button>
      </div>
    </ScreenFrame>
  );
}

function ShiftField({ theme: t, label, value, unit, mono }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: t.textMuted, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: t.text, marginTop: 2, fontFamily: mono ? TYPE.mono : TYPE.family }}>
        {value}{unit && <span style={{ fontSize: 11, color: t.textDim, marginLeft: 4, fontWeight: 500 }}>{unit}</span>}
      </div>
    </div>
  );
}

// ─── 9. SOS Incident ────────────────────────────────────────────
function ScreenSOS({ theme: t }) {
  return (
    <ScreenFrame theme={t} label="SOS">
      <TopBar theme={t} title="安全求援" back />

      <div style={{ padding: '16px 16px 0' }}>
        <div style={{
          padding: '20px 18px',
          background: t.dangerBg,
          border: `1px solid ${t.danger}40`,
          borderRadius: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: t.danger, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon d={ICONS.alert} size={20} sw={2.4} />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: t.danger }}>緊急求援</div>
              <div style={{ fontSize: 12, color: t.textMuted, marginTop: 1 }}>送出後將立即通知安全官與派車台</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: '14px 16px 0' }}>
        <Section theme={t} title="情況" dense>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {['乘客衝突', '交通事故', '車輛故障', '醫療緊急', '路線威脅', '其他'].map((c, i) => (
              <button key={c} style={{
                padding: '14px 12px', textAlign: 'left',
                background: i === 0 ? t.dangerBg : t.surface,
                border: `1.5px solid ${i === 0 ? t.danger : t.border}`,
                borderRadius: 12,
                fontSize: 13, fontWeight: 600,
                color: i === 0 ? t.danger : t.text,
                cursor: 'pointer', fontFamily: TYPE.family,
              }}>{c}</button>
            ))}
          </div>
        </Section>
      </div>

      <div style={{ padding: '0 16px 0' }}>
        <Section theme={t} title="當前訂單情境" dense>
          <Card theme={t} padding={14}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <PlatformBadge theme={t} code="SRX" name="SmartRides X" forwarded size="sm" />
              <Chip theme={t} tone="forwarded" size="sm">外部訂單</Chip>
            </div>
            <div style={{ fontSize: 13, color: t.text, fontWeight: 600 }}>SRX-ZZ-90412 · 信義區 ATT</div>
            <div style={{ fontSize: 11, color: t.textMuted, marginTop: 4, fontFamily: TYPE.mono }}>
              平台訂單編號將隨求援一同送出，安全官可直接聯繫平台。
            </div>
          </Card>
        </Section>
      </div>

      <div style={{ flex: 1 }} />
      <div style={{
        padding: '12px 16px 16px',
        background: t.bgRaised, borderTop: `1px solid ${t.border}`,
        display: 'flex', gap: 8,
      }}>
        <Button theme={t} kind="outline" size="lg">取消</Button>
        <Button theme={t} kind="primary" size="lg" full danger icon={ICONS.alert}>長按確認求援</Button>
      </div>
    </ScreenFrame>
  );
}

// ─── 10. Settings ───────────────────────────────────────────────
function ScreenSettings({ theme: t }) {
  return (
    <ScreenFrame theme={t} label="Settings">
      <div style={{ padding: '14px 16px 8px' }}>
        <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.4 }}>設定</div>
      </div>

      {/* Profile card */}
      <div style={{ padding: '4px 16px 0' }}>
        <Card theme={t} padding={16}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 24,
              background: t.brandBg, color: t.brand,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, fontWeight: 700,
            }}>陳</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 650, color: t.text }}>陳俊宏</div>
              <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2, fontFamily: TYPE.mono }}>D-2406 · 0912 345 678</div>
            </div>
            <Icon d={ICONS.arrow} size={16} stroke={t.textDim} sw={2} />
          </div>
        </Card>
      </div>

      {/* Platform binding section */}
      <div style={{ padding: '14px 16px 0' }}>
        <Section theme={t} title="平台帳號綁定" dense subtitle="連線後可接收該平台訂單。">
          <Card theme={t} padding={0}>
            <BindRow theme={t} code="DRTS" name="自營派單" status="已綁定" forwarded={false} />
            <BindRow theme={t} code="SRX" name="SmartRides X" status="已綁定 · 14 天後到期" forwarded sub="driver_8821@srx" />
            <BindRow theme={t} code="METR" name="Metro Hail" status="需重新授權" forwarded warn last />
          </Card>
        </Section>
      </div>

      {/* Preferences */}
      <div style={{ padding: '0 16px 0' }}>
        <Section theme={t} title="偏好" dense>
          <Card theme={t} padding={0}>
            <Row theme={t} label="語言" value="繁體中文" />
            <Row theme={t} label="最大接單距離" value="8 km" />
            <Row theme={t} label="自動接單" sub="僅自營派單可開啟自動接單" right={<Switch theme={t} on={false} />} />
            <Row theme={t} label="通知" value="全部" last />
          </Card>
        </Section>
      </div>

      <div style={{ padding: '0 16px 24px' }}>
        <Section theme={t} title="其他" dense>
          <Card theme={t} padding={0}>
            <Row theme={t} label="緊急聯絡人" sub="陳美華 · 配偶" />
            <Row theme={t} label="關於本機" sub="driver-demo-001" />
            <Row theme={t} label="登出" danger last />
          </Card>
        </Section>
      </div>

      <BottomTabs theme={t} active="settings" />
    </ScreenFrame>
  );
}

function BindRow({ theme: t, code, name, status, forwarded, sub, warn, last }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 14px', minHeight: 56,
      borderBottom: last ? 'none' : `1px solid ${t.border}`,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: forwarded ? t.forwardedBg : t.ownedBg,
        color: forwarded ? t.forwardedFg : t.ownedFg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 800, fontFamily: TYPE.mono,
      }}>{code.slice(0, 3)}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: t.text }}>{name}</div>
        <div style={{ fontSize: 11, color: warn ? t.warn : t.textMuted, marginTop: 2, fontWeight: warn ? 600 : 400 }}>
          {sub ? `${sub} · ${status}` : status}
        </div>
      </div>
      {warn && <Chip theme={t} tone="warn" size="sm">處理</Chip>}
    </div>
  );
}

Object.assign(window, {
  ScreenPlatform, ScreenEarnings, ScreenShift, ScreenSOS, ScreenSettings,
});
