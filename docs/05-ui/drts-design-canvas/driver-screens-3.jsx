// driver-screens-3.jsx — Driver App (3/3): Earnings / Shift / Settings

// ── /earnings (spec §5.7) — money hierarchy net first, platform breakdown, no mixing owned/forwarded without labels
function DRV_Earnings({ theme: t, period = 'today' }) {
  const breakdown = [
    { code: 'DRTS', name: '自營派單', forwarded: false, gross: 1240, fee: 0,    sub: 100, net: 1340, authority: 'DRTS 結算',   en: 'owned · drts' },
    { code: 'SRX',  name: 'SmartRides X', forwarded: true,  gross: 820,  fee: -180, sub: 0,   net: 640,  authority: '平台結算',   en: 'forwarded · platform' },
    { code: 'METR', name: 'Metro Hail',   forwarded: true,  gross: 0,    fee: 0,    sub: 0,   net: 0,    authority: '平台結算',   en: 'forwarded · empty', empty: true },
  ];
  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      <DrvAppBar theme={t} title="收入 · earnings" back refreshTier="manual" />
      <div style={{ padding: '12px 16px 0' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {['today', 'week', 'month'].map(p => {
            const on = p === period;
            return (
              <span key={p} style={{
                flex: 1, padding: '8px 0', textAlign: 'center',
                background: on ? t.brand : t.surfaceLo, color: on ? '#fff' : t.textMuted,
                border: '1px solid ' + (on ? t.brand : t.border), borderRadius: 8,
                fontSize: 12.5, fontWeight: 600, fontFamily: DRV_FONT,
              }}>
                {p === 'today' ? '本日 · today' : p === 'week' ? '本週 · week' : '本月 · month'}
              </span>
            );
          })}
        </div>
      </div>

      <div style={{ padding: '14px 16px 0' }}>
        <DrvCard theme={t} padding={18}>
          <DrvBi zh="淨收入 · 本日" en="net_today" theme={t} size={10.5} />
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
            <span style={{ fontSize: 36, fontWeight: 700, color: t.text, letterSpacing: -1, fontFamily: DRV_MONO }}>1,840</span>
            <span style={{ fontSize: 14, color: t.textMuted, fontWeight: 500 }}>NT$</span>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 12, color: t.success, fontWeight: 600 }}>+12% vs 昨日</span>
          </div>
          <div style={{ display: 'flex', gap: 14, marginTop: 14, paddingTop: 14, borderTop: '1px solid ' + t.border }}>
            {[
              { zh: '毛收', en: 'gross', v: '2,060', c: t.text },
              { zh: '平台抽成', en: 'platform_fee', v: '−180', c: t.danger },
              { zh: '待入帳', en: 'pending_payout', v: '640', c: t.warn },
            ].map(b => (
              <div key={b.zh} style={{ flex: 1 }}>
                <DrvBi zh={b.zh} en={b.en} theme={t} size={9.5} />
                <div style={{ fontSize: 16, fontWeight: 700, color: b.c, fontFamily: DRV_MONO, marginTop: 2 }}>{b.v}</div>
              </div>
            ))}
          </div>
        </DrvCard>
      </div>

      <div style={{ padding: '14px 16px 0' }}>
        <DrvSection theme={t} zh="平台分項" en="per_platform · authority labeled" dense>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {breakdown.map(b => (
              <DrvCard key={b.code} theme={t} style={{ opacity: b.empty ? 0.6 : 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <DrvPill theme={t} tone={b.forwarded ? 'forwarded' : 'owned'} dot>{b.name} <span style={{ fontFamily: DRV_MONO, opacity: 0.6, fontSize: 9.5 }}>· {b.code}</span></DrvPill>
                  <span style={{ flex: 1 }} />
                  <span style={{ fontSize: 16, fontWeight: 700, color: t.text, fontFamily: DRV_MONO, letterSpacing: -0.3 }}>
                    {b.empty ? '—' : b.net.toLocaleString()}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 10, paddingTop: 10, borderTop: '1px dashed ' + t.border, fontSize: 10.5, color: t.textMuted, flexWrap: 'wrap' }}>
                  <span>毛 <span style={{ color: t.text, fontFamily: DRV_MONO, fontWeight: 600 }}>{b.gross.toLocaleString()}</span></span>
                  <span>抽 <span style={{ color: t.text, fontFamily: DRV_MONO, fontWeight: 600 }}>{b.fee}</span></span>
                  <span>補 <span style={{ color: t.text, fontFamily: DRV_MONO, fontWeight: 600 }}>+{b.sub}</span></span>
                  <span style={{ flex: 1, textAlign: 'right', color: b.forwarded ? t.forwardedFg : t.ownedFg, fontWeight: 600 }}>
                    {b.authority}
                  </span>
                </div>
              </DrvCard>
            ))}
          </div>
        </DrvSection>
      </div>

      {/* Reconciliation issue link (per spec §5.7) */}
      <div style={{ padding: '0 16px 0' }}>
        <DrvCard theme={t} accent={t.warn}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <DrvIcon name="warn" size={15} stroke={2} style={{ color: t.warn }} />
            <div style={{ flex: 1 }}>
              <DrvBi zh="1 筆對帳差異" en="reconciliation_issue" theme={t} size={12.5} />
              <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>SRX-9921098 fare_diff_>5% · 由派車台處理 · 非請款動作</div>
            </div>
            <DrvIcon name="chevR" size={14} stroke={2} style={{ color: t.textDim }} />
          </div>
        </DrvCard>
      </div>

      <div style={{ padding: '14px 16px 24px' }}>
        <DrvSection theme={t} zh="月結報表" en="statements" dense>
          <DrvCard theme={t} padding={0}>
            {[
              { p: '2026/04 月結', sub: '32 趟 · 已入帳', v: 'NT$ 38,420' },
              { p: '2026/03 月結', sub: '29 趟 · 已入帳', v: 'NT$ 34,210' },
            ].map((s, i, a) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderBottom: i < a.length - 1 ? '1px solid ' + t.border : 'none' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{s.p}</div>
                  <div style={{ fontSize: 11, color: t.textMuted, marginTop: 1 }}>{s.sub}</div>
                </div>
                <span style={{ fontSize: 13, color: t.textMuted, fontFamily: DRV_MONO }}>{s.v}</span>
                <DrvIcon name="chevR" size={14} stroke={2} style={{ color: t.textDim }} />
              </div>
            ))}
          </DrvCard>
        </DrvSection>
      </div>
    </div>
  );
}

// ── /shift — clock-in/out + odometer (Q-DRV08/Q-DRV09)
function DRV_Shift({ theme: t, state = 'on' }) {
  return (
    <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
      <DrvAppBar theme={t} title="班次 · shift" back />
      <div style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ padding: '16px 16px 0' }}>
          <DrvCard theme={t} padding={18}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: state === 'on' ? t.success : t.textDim, boxShadow: '0 0 0 3px ' + (state === 'on' ? t.successBg : t.surfaceLo) }} />
              <DrvBi zh={state === 'on' ? '上班中' : '下班'} en={state === 'on' ? 'on_shift' : 'off_shift'} theme={t} size={10.5} />
            </div>
            <div style={{ fontSize: 32, fontWeight: 700, marginTop: 8, fontFamily: DRV_MONO, letterSpacing: -1, color: t.text }}>02:48</div>
            <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>已工作 2 小時 48 分 · 自 06:42 起</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14, paddingTop: 14, borderTop: '1px solid ' + t.border }}>
              <DRV_ShiftField theme={t} zh="車輛" en="vehicle" value="ARJ-3120" mono />
              <DRV_ShiftField theme={t} zh="起始里程" en="odo_start" value="84,230" mono unit="km" />
              <DRV_ShiftField theme={t} zh="起始位置" en="start_location" value="松山機場 停車場" />
              <DRV_ShiftField theme={t} zh="預計下班" en="planned_end" value="14:00" mono />
            </div>
          </DrvCard>
        </div>

        <div style={{ padding: '14px 16px 0' }}>
          <DrvSection theme={t} zh="今日總結" en="today_summary" dense>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { zh: '趟次', en: 'trips', v: '7' },
                { zh: '里程', en: 'km', v: '42.6' },
                { zh: '淨收', en: 'net', v: '1,840' },
              ].map(k => (
                <div key={k.zh} style={{ flex: 1, padding: '11px 12px', background: t.surfaceLo, border: '1px solid ' + t.border, borderRadius: 12 }}>
                  <DrvBi zh={k.zh} en={k.en} theme={t} size={10} />
                  <div style={{ fontSize: 18, fontWeight: 700, color: t.text, marginTop: 2, fontFamily: DRV_MONO }}>{k.v}</div>
                </div>
              ))}
            </div>
          </DrvSection>
        </div>

        <div style={{ padding: '4px 16px 0' }}>
          <DrvSection theme={t} zh="多平台可用性" en="multi_platform_availability" dense>
            <DrvCard theme={t} padding={0}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderBottom: '1px solid ' + t.border }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: t.success }} />
                <span style={{ flex: 1, fontSize: 13 }}>
                  <DrvBi zh="自營派單可用" en="owned_dispatch_available" theme={t} size={13} />
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px' }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: t.warn }} />
                <span style={{ flex: 1, fontSize: 13 }}>
                  <DrvBi zh="外部平台可用" en="2 / 3 platforms online · 1 reauth" theme={t} size={13} />
                </span>
              </div>
            </DrvCard>
          </DrvSection>
        </div>

        <div style={{ padding: '0 16px 0' }}>
          <DrvCard theme={t} accent={t.info}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <DrvIcon name="warn" size={14} stroke={2} style={{ color: t.info, marginTop: 2 }} />
              <div style={{ flex: 1 }}>
                <DrvBi zh="下班會發生什麼" en="Q-DRV08 · autoOfflineOnShiftEnd" theme={t} size={12.5} />
                <div style={{ fontSize: 11, color: t.textMuted, marginTop: 4, lineHeight: 1.5 }}>
                  下班後 DRTS 自營派單立即停止；外部平台依該平台設定 autoOfflineOnShiftEnd 決定。
                </div>
              </div>
            </div>
          </DrvCard>
        </div>

        {/* Odometer over-threshold confirm preview (Q-DRV09) */}
        <div style={{ padding: '14px 16px 24px' }}>
          <DrvCard theme={t} accent={t.warn}>
            <DrvBi zh="下班里程預覽" en="odo_end · max_delta_check" theme={t} size={12.5} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
              <DRV_ShiftField theme={t} zh="當前里程" en="odo_end" value="85,142" mono unit="km" />
              <DRV_ShiftField theme={t} zh="本班差異" en="delta" value="912" mono unit="km" />
            </div>
            <div style={{ fontSize: 11, color: t.warn, marginTop: 8, lineHeight: 1.5, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
              <DrvIcon name="warn" size={11} stroke={2.2} />
              超過 800 km 預設上限 · 需確認並送 ops 複核 (Q-DRV09)
            </div>
          </DrvCard>
        </div>
      </div>

      <DrvStickyAction theme={t}
        primary={state === 'on'
          ? <DrvBigBtn theme={t} kind="outline" danger icon="power">下班打卡 · clock_out</DrvBigBtn>
          : <DrvBigBtn theme={t} kind="primary" icon="power">上班打卡 · clock_in</DrvBigBtn>} />
    </div>
  );
}

function DRV_ShiftField({ theme: t, zh, en, value, unit, mono }) {
  return (
    <div>
      <DrvBi zh={zh} en={en} theme={t} size={9.5} />
      <div style={{ fontSize: 14, fontWeight: 600, color: t.text, marginTop: 2, fontFamily: mono ? DRV_MONO : DRV_FONT }}>
        {value}{unit && <span style={{ fontSize: 10.5, color: t.textDim, marginLeft: 4, fontWeight: 500 }}>{unit}</span>}
      </div>
    </div>
  );
}

// ── /settings (spec §5.10) — re-auth mechanism per platform (Q-DRV05), auto-accept per platform (Q-DRV13), max radius km (Q-DRV14)
function DRV_Settings({ theme: t }) {
  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      <div style={{ padding: '14px 16px 8px' }}>
        <DrvBi zh="設定" en="settings" theme={t} size={22} />
      </div>

      <div style={{ padding: '4px 16px 0' }}>
        <DrvCard theme={t} padding={14}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 48, height: 48, borderRadius: 24, background: t.brandBg, color: t.brand, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700 }}>陳</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 650, color: t.text }}>陳俊宏 <span style={{ fontFamily: DRV_MONO, fontSize: 11, color: t.textMuted, fontWeight: 500 }}>· d_8843</span></div>
              <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2, fontFamily: DRV_MONO }}>0937-114-208 · ch.chen@drts.io</div>
            </div>
            <DrvIcon name="chevR" size={14} stroke={2} style={{ color: t.textDim }} />
          </div>
        </DrvCard>
      </div>

      {/* Platform binding · 4 mechanisms */}
      <div style={{ padding: '14px 16px 0' }}>
        <DrvSection theme={t} zh="平台帳號綁定" en="platform_binding · 4 auth mechs (Q-DRV05)" dense>
          <DrvCard theme={t} padding={0}>
            {DRV_FX.platforms.map((p, i, a) => (
              <DRV_SettingsBindRow key={p.code} theme={t} p={p} last={i === a.length - 1} />
            ))}
          </DrvCard>
        </DrvSection>
      </div>

      {/* Preferences */}
      <div style={{ padding: '0 16px 0' }}>
        <DrvSection theme={t} zh="偏好" en="preferences" dense>
          <DrvCard theme={t} padding={0}>
            <DRV_Row theme={t} zh="語言" en="locale" value="繁體中文" />
            <DRV_Row theme={t} zh="最大接單距離" en="max_accept_radius · km (Q-DRV14)" value="8 km" />
            <DRV_Row theme={t} zh="通知" en="notifications · per-event opt-in" value="全部" />
            <DRV_Row theme={t} zh="自動接單 · 自營" en="auto_accept · owned only" toggle={false} sub="Q-DRV13 · global auto-accept Phase 1 不允許" last />
          </DrvCard>
        </DrvSection>
      </div>

      <div style={{ padding: '0 16px 24px' }}>
        <DrvSection theme={t} zh="其他" en="more" dense>
          <DrvCard theme={t} padding={0}>
            <DRV_Row theme={t} zh="緊急聯絡人" en="emergency_contact" sub="陳美華 · 配偶" />
            <DRV_Row theme={t} zh="關於本機" en="device_info" sub="driver-demo-001 · v3.4.2" />
            <DRV_Row theme={t} zh="登出" en="sign_out" danger last />
          </DrvCard>
        </DrvSection>
      </div>
    </div>
  );
}

function DRV_Row({ theme: t, zh, en, value, sub, toggle, last, danger }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', minHeight: 50, borderBottom: last ? 'none' : '1px solid ' + t.border }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <DrvBi zh={zh} en={en} theme={t} size={13.5} />
        {sub && <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>{sub}</div>}
      </div>
      {value && <div style={{ fontSize: 12.5, color: t.textMuted, fontFamily: /^\w+/.test(value) ? DRV_MONO : DRV_FONT }}>{value}</div>}
      {toggle !== undefined && (
        <span style={{ width: 30, height: 18, borderRadius: 9, background: toggle ? t.success : t.borderStrong, position: 'relative' }}>
          <span style={{ position: 'absolute', top: 2, left: toggle ? 14 : 2, width: 14, height: 14, borderRadius: 7, background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,.2)' }} />
        </span>
      )}
      {!toggle && !value && <DrvIcon name="chevR" size={14} stroke={2} style={{ color: danger ? t.danger : t.textDim }} />}
    </div>
  );
}

function DRV_SettingsBindRow({ theme: t, p, last }) {
  const mech = {
    external_browser_oauth: { zh: 'OAuth · 外部瀏覽器', en: 'external_browser_oauth (default)', icon: 'ext' },
    native_app_deeplink:    { zh: 'GoCab App 跳轉',     en: 'native_app_deeplink',              icon: 'link' },
    manual_credential:      { zh: '手動帳密',           en: 'manual_credential',                icon: 'key' },
    ops_managed:            { zh: '聯絡派車台',         en: 'ops_managed · cannot self',        icon: 'phone' },
  }[p.authMech] || { zh: 'OAuth', en: 'external_browser_oauth', icon: 'ext' };
  const selfService = p.code === 'DRTS' ? false : true; // example: external platforms allow self bind/unbind
  return (
    <div style={{ padding: '12px 14px', borderBottom: last ? 'none' : '1px solid ' + t.border }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: p.forwarded ? t.forwardedBg : t.ownedBg, color: p.forwarded ? t.forwardedFg : t.ownedFg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, fontFamily: DRV_MONO }}>
          {p.code.slice(0, 3)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <DrvBi zh={p.name} en={p.code} theme={t} size={13} />
          <div style={{ fontSize: 11, color: p.reauth ? t.warn : t.textMuted, marginTop: 2 }}>
            {p.reauth ? '需重新授權 · reauth_required' : '已綁定 · linked'}
          </div>
        </div>
        {p.reauth && <DrvPill theme={t} tone="warn">處理</DrvPill>}
      </div>
      <div style={{ marginTop: 8, padding: '6px 8px', background: t.surfaceLo, borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8, fontSize: 10.5, color: t.textMuted }}>
        <DrvIcon name={mech.icon} size={11} stroke={2} />
        <span>{mech.zh}</span>
        <span style={{ fontFamily: DRV_MONO, opacity: 0.6 }}>· {mech.en}</span>
        <span style={{ flex: 1 }} />
        {p.code === 'DRTS' ? (
          <span style={{ fontSize: 10, color: t.textDim }}>n/a · 自營</span>
        ) : selfService ? (
          <span style={{ fontSize: 10, color: t.success, fontFamily: DRV_MONO }}>driverSelfServiceBinding=true</span>
        ) : (
          <span style={{ fontSize: 10, color: t.warn, fontFamily: DRV_MONO }}>driverSelfServiceBinding=false</span>
        )}
      </div>
      {p.canRelayAccept !== undefined && (
        <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
          <DrvPill theme={t} tone={p.canRelayAccept ? 'success' : 'neutral'} dot>relayAccept</DrvPill>
          <DrvPill theme={t} tone={p.canRelayReject ? 'success' : 'neutral'} dot>relayReject</DrvPill>
          {p.relayUnavailableReasonCode && <DrvPill theme={t} tone="warn">{p.relayUnavailableReasonCode}</DrvPill>}
        </div>
      )}
    </div>
  );
}

Object.assign(window, { DRV_Earnings, DRV_Shift, DRV_Settings, DRV_Row, DRV_SettingsBindRow, DRV_ShiftField });
