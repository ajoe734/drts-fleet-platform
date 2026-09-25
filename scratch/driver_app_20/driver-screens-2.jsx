// driver-screens-2.jsx — Driver App (2/3): Trip / Platform Presence / Incident (SOS)

// ── Trip · one primary action at a time (spec §5.5 binding rule)
function DRV_Trip({ theme: t, state = 'owned_active' }) {
  // States covered:
  //   owned_active             — owned task in transit (depart/arrived/start/complete)
  //   forwarded_offered        — forwarded offer with 30s race
  //   forwarded_accept_pending — sent accept, waiting external confirm (Q-DRV02)
  //   forwarded_confirmed      — external confirmed
  //   forwarded_lost_race      — terminal (Q-DRV03)
  //   forwarded_cancelled      — terminal cancelled_by_platform (Q-DRV03)
  //   sync_failed              — ops fallback instruction (Q-DRV04)
  //   manual_fallback          — Q-DRV04 DriverOpsInstruction
  let banner, primaryAction, secondary, statusText, statusEn, statusTone, lockBody, info, countdown;
  switch (state) {
    case 'owned_active':
      banner = { f: false, p: '自營派單', sub: '完整本機操作權限 · 依指示完成行程' };
      primaryAction = { zh: '抵達取貨點', en: 'arrived_pickup', icon: 'pin', kind: 'primary' };
      statusText = '前往取貨點'; statusEn = 'driver_en_route'; statusTone = 'success';
      break;
    case 'forwarded_offered':
      banner = { f: true, p: 'SmartRides X', sub: '此訂單由平台主導 · 接受後將提交平台確認 (race · 30s)' };
      primaryAction = { zh: '接受平台訂單', en: 'relay_accept', icon: 'check', kind: 'forwarded' };
      secondary = { zh: '拒絕', en: 'relay_reject', kind: 'outline', danger: true };
      statusText = '平台訂單 · 12 秒'; statusEn = 'offer_pending · countdown'; statusTone = 'warn';
      countdown = 12;
      break;
    case 'forwarded_accept_pending':
      banner = { f: true, p: 'SmartRides X', sub: '已送出接單 · 等待平台確認 · acceptDeadlineAt 26s (Q-DRV02)' };
      primaryAction = null;
      statusText = '等待平台確認'; statusEn = 'accept_pending'; statusTone = 'warn';
      info = '平台未確認此單，請勿再回應 (Q-DRV02 safe copy)';
      lockBody = { icon: 'clock', title: '正在等待平台確認…', sub: '已送出 4 秒 · 平均回應時間 6 秒 · 若 30 秒未確認將標記為 lost_race' };
      break;
    case 'forwarded_confirmed':
      banner = { f: true, p: 'SmartRides X', sub: '平台已確認接單 · 前往取貨點，請依平台規則操作' };
      primaryAction = { zh: '抵達取貨點', en: 'arrived_pickup', icon: 'pin', kind: 'forwarded' };
      statusText = '平台已確認'; statusEn = 'confirmed_by_platform'; statusTone = 'success';
      break;
    case 'forwarded_lost_race':
      banner = { f: true, p: 'SmartRides X', sub: '其他司機已被平台選中 · 本筆訂單已結束 (Q-DRV03 terminal)' };
      primaryAction = null;
      statusText = '其他司機已接'; statusEn = 'lost_race'; statusTone = 'neutral';
      lockBody = { icon: 'x', title: '未取得此訂單', sub: '平台已將訂單分配給其他司機。請繼續其他工作。' };
      break;
    case 'forwarded_cancelled':
      banner = { f: true, p: 'GoCab', sub: '乘客或平台已取消此訂單 (Q-DRV03 terminal)' };
      primaryAction = null;
      statusText = '平台取消'; statusEn = 'cancelled_by_platform'; statusTone = 'neutral';
      lockBody = { icon: 'x', title: '平台已取消', sub: '補償 NT$ 60 已入帳。可至 /earnings 查看明細。' };
      break;
    case 'sync_failed':
      banner = { f: true, p: 'Metro Hail', sub: 'adapter 同步失敗 · 派車台正在處理 · 請等待 ops 指示' };
      primaryAction = null;
      statusText = '需派車台處理'; statusEn = 'sync_failed'; statusTone = 'danger';
      lockBody = { icon: 'warn', title: '同步異常', sub: '派車台正在處理平台同步 · 依派車台指示操作。' };
      break;
    case 'manual_fallback':
      banner = { f: true, p: 'GoCab', sub: 'gocab-v1 adapter degraded · 啟動 ops 人工指示模式 (Q-DRV04)' };
      primaryAction = { zh: '依指示確認完成', en: 'manual_complete', icon: 'check', kind: 'primary' };
      statusText = '人工協調中'; statusEn = 'manual_fallback'; statusTone = 'warn';
      info = '上方指示由 ops 即時提供，依指示操作即可';
      break;
    default:
      banner = { f: false, p: '自營派單', sub: '' };
      primaryAction = null;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <DrvAppBar theme={t} title="進行中行程" back refreshTier="fast" right={
        <button style={{ width: 36, height: 36, borderRadius: 10, background: t.dangerBg, color: t.danger, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <DrvIcon name="sos" size={20} stroke={2.2} />
        </button>
      } />

      <div style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ padding: '12px 16px 0' }}>
          <DrvAuthorityBanner theme={t} forwarded={banner.f} platform={banner.p} sub={banner.sub} />
        </div>

        {/* Map placeholder */}
        <div style={{ padding: '12px 16px 0' }}>
          <div style={{
            position: 'relative', height: 170, borderRadius: 12, overflow: 'hidden',
            background: 'repeating-linear-gradient(135deg, ' + (t.mode === 'dark' ? '#1A2334' : '#E8EEF6') + ' 0 8px, ' + (t.mode === 'dark' ? '#1F2A3D' : '#DEE6F0') + ' 8px 16px)',
            border: '1px solid ' + t.border,
          }}>
            <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }} viewBox="0 0 300 170" preserveAspectRatio="none">
              <path d="M30 130 Q 90 70 150 90 T 270 30" fill="none" stroke={t.brand} strokeWidth="3" strokeLinecap="round" />
              <circle cx="30" cy="130" r="6" fill={t.success} stroke="#fff" strokeWidth="2" />
              <circle cx="270" cy="30" r="6" fill={t.danger} stroke="#fff" strokeWidth="2" />
            </svg>
            <div style={{ position: 'absolute', bottom: 10, left: 10, background: t.surface, border: '1px solid ' + t.border, padding: '6px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600, color: t.text, display: 'flex', alignItems: 'center', gap: 6 }}>
              <DrvIcon name="pin" size={12} stroke={2} style={{ color: t.success }} /> 6.2 km · 14 分
            </div>
          </div>
        </div>

        {/* Manual fallback instruction (Q-DRV04) */}
        {state === 'manual_fallback' && (
          <div style={{ padding: '12px 16px 0' }}>
            <DrvCard theme={t} accent={t.warn}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
                <DrvBi zh="派車台指示" en="DriverOpsInstruction" theme={t} size={12} />
                <span style={{ fontFamily: DRV_MONO, fontSize: 9.5, color: t.warn }}>· instr_8821a · TTL 5 min</span>
              </div>
              <div style={{ fontSize: 13.5, color: t.text, fontWeight: 500, lineHeight: 1.5 }}>
                乘客在 GoCab app 看到平台 webhook 沒到，但你已抵達。請當面取得乘客電話末四碼 (•••• 4823) 並回覆 ops 完成行程。
              </div>
              <div style={{ fontSize: 11, color: t.textMuted, marginTop: 4 }}>由 王芳 (ops_manager) 於 14:52 發出</div>
            </DrvCard>
          </div>
        )}

        {/* Route summary */}
        <div style={{ padding: '12px 16px 0' }}>
          <DrvCard theme={t}>
            <DRV_RouteStop theme={t} dot={t.success} zh="取貨點" en="pickup" addr="台北車站 · 西三門" time="預計 09:38" />
            <div style={{ marginLeft: 5, height: 20, borderLeft: '1.5px dashed ' + t.border }} />
            <DRV_RouteStop theme={t} dot={t.danger} zh="送達點" en="dropoff" addr="松山機場 第二航廈 出境大廳" time="預計 10:14" last />
            <div style={{ display: 'flex', gap: 10, marginTop: 12, paddingTop: 12, borderTop: '1px solid ' + t.border }}>
              {[
                { zh: '距離', en: 'distance', v: '6.2 km' },
                { zh: '時長', en: 'duration', v: '14 分' },
                { zh: '車資', en: 'fare', v: 'NT$ 420', mono: true },
              ].map(m => (
                <div key={m.zh} style={{ flex: 1 }}>
                  <div style={{ fontSize: 9.5, fontWeight: 700, color: t.textMuted, letterSpacing: 0.4, textTransform: 'uppercase' }}>{m.zh}<span style={{ fontFamily: DRV_MONO, fontSize: 8.5, opacity: 0.65, marginLeft: 3 }}>{m.en}</span></div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: t.text, marginTop: 1, fontFamily: m.mono ? DRV_MONO : DRV_FONT }}>{m.v}</div>
                </div>
              ))}
            </div>
          </DrvCard>
        </div>

        {/* Compliance / status */}
        <div style={{ padding: '12px 16px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: t.surface, border: '1px solid ' + t.border, borderRadius: 12 }}>
            <span style={{ width: 8, height: 8, borderRadius: 4, background: statusTone === 'success' ? t.success : statusTone === 'warn' ? t.warn : statusTone === 'danger' ? t.danger : t.textMuted, boxShadow: '0 0 0 3px ' + (statusTone === 'success' ? t.successBg : statusTone === 'warn' ? t.warnBg : statusTone === 'danger' ? t.dangerBg : t.surfaceLo) }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: t.text, flex: 1, display: 'flex', alignItems: 'baseline', gap: 6 }}>
              {statusText}
              <span style={{ fontFamily: DRV_MONO, fontSize: 10, opacity: 0.6 }}>· {statusEn}</span>
            </span>
            {countdown && (
              <span style={{ fontFamily: DRV_MONO, fontSize: 12, color: t.warn, fontWeight: 700 }}>
                {String(countdown).padStart(2, '0')}s
              </span>
            )}
          </div>
        </div>

        {/* Locked / blocked body for terminal/pending states */}
        {lockBody && (
          <div style={{ padding: '12px 16px 0' }}>
            <div style={{ padding: '20px 16px', background: t.surface, border: '1px dashed ' + t.borderStrong, borderRadius: 12, textAlign: 'center' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 48, height: 48, borderRadius: 24, background: t.surfaceLo, color: t.textMuted, marginBottom: 10 }}>
                <DrvIcon name={lockBody.icon} size={26} stroke={1.6} />
              </div>
              <div style={{ fontSize: 14.5, fontWeight: 700, color: t.text }}>{lockBody.title}</div>
              <div style={{ fontSize: 11.5, color: t.textMuted, marginTop: 4, lineHeight: 1.55 }}>{lockBody.sub}</div>
            </div>
          </div>
        )}

        <div style={{ height: 14 }} />
      </div>

      <DrvStickyAction theme={t}
        info={info}
        primary={primaryAction
          ? <DrvBigBtn theme={t} kind={primaryAction.kind} icon={primaryAction.icon}>{primaryAction.zh} · {primaryAction.en}</DrvBigBtn>
          : <DrvBigBtn theme={t} kind="secondary" disabled>等待中… · waiting</DrvBigBtn>}
        secondary={secondary
          ? <DrvBigBtn theme={t} kind="outline" full={false} danger style={{ width: 100, height: 50 }}>{secondary.zh}</DrvBigBtn>
          : null} />
    </div>
  );
}

function DRV_RouteStop({ theme: t, dot, zh, en, addr, time, last }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <div style={{ width: 12, height: 12, borderRadius: 6, background: dot, marginTop: 4, flexShrink: 0, boxShadow: '0 0 0 3px ' + dot + '25' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <DrvBi zh={zh} en={en} theme={t} size={10.5} />
        <div style={{ fontSize: 14, fontWeight: 600, color: t.text, marginTop: 1 }}>{addr}</div>
        <div style={{ fontSize: 11, color: t.textDim, marginTop: 1 }}>{time}</div>
      </div>
    </div>
  );
}

// ── /platform-presence — 4 reauth mechanisms (Q-DRV05) + eligibility reasons (Q-DRV07)
function DRV_Platform({ theme: t }) {
  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      <div style={{ padding: '14px 16px 8px' }}>
        <DrvBi zh="平台連線" en="platform_presence" theme={t} size={22} />
        <div style={{ fontSize: 12, color: t.textMuted, marginTop: 4 }}>4 個平台 · 2 上線 · 1 需處理 · T3 polling</div>
      </div>

      <div style={{ padding: '12px 16px 0', display: 'flex', gap: 8 }}>
        {[
          { zh: '可接單', en: 'eligible', v: '2', tone: 'success' },
          { zh: '今日完成', en: 'today', v: '7', tone: 'brand' },
          { zh: '需動作', en: 'needs_action', v: '2', tone: 'warn' },
        ].map(k => (
          <div key={k.zh} style={{ flex: 1, padding: '11px 12px', background: t.surfaceLo, border: '1px solid ' + t.border, borderRadius: 12 }}>
            <DrvBi zh={k.zh} en={k.en} theme={t} size={10} />
            <div style={{ fontSize: 20, fontWeight: 700, color: k.tone === 'brand' ? t.brand : k.tone === 'success' ? t.success : t.warn, marginTop: 3, fontFamily: DRV_MONO, letterSpacing: -0.4 }}>{k.v}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: '14px 16px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {DRV_FX.platforms.map(p => <DRV_PlatformCard key={p.code} theme={t} p={p} />)}
      </div>
    </div>
  );
}

function DRV_PlatformCard({ theme: t, p }) {
  const isOk = p.online && p.ok && !p.reauth;
  const isReauth = p.reauth;
  const mechMap = {
    external_browser_oauth: { zh: 'OAuth 外部瀏覽器', en: 'external_browser_oauth · default', icon: 'ext' },
    native_app_deeplink: { zh: '原生 App 跳轉', en: 'native_app_deeplink', icon: 'link' },
    manual_credential: { zh: '手動帳密', en: 'manual_credential', icon: 'key' },
    ops_managed: { zh: '聯絡派車台', en: 'ops_managed · cannot self-resolve', icon: 'phone' },
  };
  const mech = mechMap[p.authMech] || mechMap.external_browser_oauth;
  return (
    <div style={{ background: t.surface, border: '1px solid ' + (isReauth ? t.warn + '60' : t.border), borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: p.forwarded ? t.forwardedBg : t.ownedBg,
          color: p.forwarded ? t.forwardedFg : t.ownedFg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 800, fontFamily: DRV_MONO,
        }}>{p.code.slice(0, 3)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <DrvBi zh={p.name} en={p.code} theme={t} size={14} />
            {p.forwarded && <DrvPill theme={t} tone="forwarded">外部</DrvPill>}
          </div>
          <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: isOk ? t.success : isReauth ? t.warn : t.textDim }} />
            {isReauth ? '需重新授權 · reauth_required' : (p.online ? '上線中 · online' : '離線 · offline')}
            <span style={{ width: 3, height: 3, borderRadius: 1.5, background: t.borderStrong }} />
            <span style={{ fontFamily: DRV_MONO }}>{p.lastSync}</span>
          </div>
        </div>
        <span style={{
          width: 38, height: 22, borderRadius: 11,
          background: isOk ? t.success : t.borderStrong,
          position: 'relative', display: 'inline-block', opacity: isReauth ? 0.4 : 1, flexShrink: 0,
        }}>
          <span style={{ position: 'absolute', top: 2, left: isOk ? 18 : 2, width: 18, height: 18, borderRadius: 9, background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,.2)' }} />
        </span>
      </div>

      {/* Eligibility per service bucket (Q-DRV07) */}
      <div style={{ padding: '10px 14px', borderTop: '1px solid ' + t.border, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {['standard', 'business', 'airport'].map(b => {
          const eligible = p.eligible && p.eligible.includes(b);
          return <DrvPill key={b} theme={t} tone={eligible ? 'success' : 'neutral'} dot>{b}</DrvPill>;
        })}
        {!p.eligible || p.eligible.length === 0
          ? <span style={{ fontSize: 11, color: t.warn, marginLeft: 'auto' }}>原因 · {p.reauth ? 'reauth_required' : 'platform_offline'}</span>
          : null}
      </div>

      {/* Reauth banner with mechanism-specific CTA */}
      {isReauth && (
        <div style={{ padding: '10px 14px', background: t.warnBg, borderTop: '1px solid ' + t.warn + '30', display: 'flex', alignItems: 'center', gap: 10 }}>
          <DrvIcon name="key" size={14} stroke={2} style={{ color: t.warn }} />
          <span style={{ fontSize: 11.5, color: t.warn, fontWeight: 600, flex: 1 }}>{p.blocking || 'Token 已過期，請重新授權'}</span>
          <button style={{ padding: '6px 12px', borderRadius: 7, background: t.warn, color: '#fff', border: 'none', fontSize: 11, fontWeight: 700, fontFamily: DRV_FONT, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <DrvIcon name={mech.icon} size={11} stroke={2.2} />
            {mech.zh}
          </button>
        </div>
      )}

      <div style={{ padding: '8px 14px', borderTop: '1px solid ' + t.border, display: 'flex', gap: 10, fontSize: 10.5, color: t.textMuted, alignItems: 'center' }}>
        <span>auth · <span style={{ color: t.textMuted, fontFamily: DRV_MONO }}>{mech.en}</span></span>
        {p.canRelayAccept !== undefined && (
          <>
            <span style={{ width: 3, height: 3, borderRadius: 1.5, background: t.borderStrong }} />
            <span style={{ fontFamily: DRV_MONO }}>canRelayAccept={String(p.canRelayAccept)}</span>
            <span style={{ fontFamily: DRV_MONO }}>· canRelayReject={String(p.canRelayReject)}</span>
          </>
        )}
      </div>
    </div>
  );
}

// ── /incident — SOS press-and-hold sheet (Q-DRV11/12)
function DRV_Incident({ theme: th, progress = 0 }) {
  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <DrvAppBar theme={th} title="安全求援" back shift="sos" />
      <div style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ padding: '16px 16px 0' }}>
          <div style={{ padding: '20px 18px', background: th.dangerBg, border: '1px solid ' + th.danger + '40', borderRadius: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: th.danger, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <DrvIcon name="sos" size={22} stroke={2.4} />
              </div>
              <div>
                <DrvBi zh="緊急求援" en="emergency · incident" theme={th} size={16} />
                <div style={{ fontSize: 11.5, color: th.textMuted, marginTop: 1 }}>送出後將立即通知安全官與派車台</div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ padding: '14px 16px 0' }}>
          <DrvSection theme={th} zh="情況" en="incident_category" dense>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { zh: '乘客衝突', en: 'passenger_conflict', sel: true },
                { zh: '交通事故', en: 'collision' },
                { zh: '車輛故障', en: 'vehicle_fault' },
                { zh: '醫療緊急', en: 'medical' },
                { zh: '路線威脅', en: 'route_threat' },
                { zh: '其他', en: 'other' },
              ].map(c => (
                <button key={c.zh} style={{
                  padding: '14px 12px', textAlign: 'left',
                  background: c.sel ? th.dangerBg : th.surface,
                  border: '1.5px solid ' + (c.sel ? th.danger : th.border),
                  borderRadius: 12, fontSize: 13, fontWeight: 600,
                  color: c.sel ? th.danger : th.text, cursor: 'pointer',
                  fontFamily: DRV_FONT,
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
                }}>
                  <span>{c.zh}</span>
                  <span style={{ fontFamily: DRV_MONO, fontSize: 9.5, opacity: 0.7, fontWeight: 500 }}>{c.en}</span>
                </button>
              ))}
            </div>
          </DrvSection>
        </div>

        {/* Multi-platform metadata context (Q-X06) */}
        <div style={{ padding: '0 16px 0' }}>
          <DrvSection theme={th} zh="當前訂單情境" en="active_trip_context · auto-attached" dense>
            <DrvCard theme={th}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <DrvPill theme={th} tone="forwarded" dot>SmartRides X · forwarded</DrvPill>
              </div>
              <div style={{ fontSize: 13, color: th.text, fontWeight: 600, fontFamily: DRV_MONO }}>SRX-9921044 · 信義 ATT 4 FUN</div>
              <div style={{ fontSize: 11, color: th.textMuted, marginTop: 4, lineHeight: 1.5 }}>
                平台訂單編號 · 本地 mirror · 原生狀態 將隨求援一同送出，安全官可直接聯繫平台 (Q-X06 metadata)。
              </div>
            </DrvCard>
          </DrvSection>
        </div>

        <div style={{ padding: '0 16px 0' }}>
          <DrvSection theme={th} zh="補充說明 (可選)" en="freeform_notes" dense>
            <div style={{ padding: 12, background: th.surfaceLo, border: '1px solid ' + th.border, borderRadius: 10, fontSize: 12.5, color: th.textDim, minHeight: 64 }}>
              簡述狀況 (例如：乘客醉酒、行人擦撞)…
            </div>
          </DrvSection>
        </div>

        <div style={{ height: 20 }} />
      </div>

      <DrvStickyAction theme={th}
        info="Q-DRV11 · tap opens sheet → press-and-hold 2 秒送出。永不單擊送出。"
        primary={<DrvPressHoldButton theme={th} progress={progress} />}
        secondary={<DrvBigBtn theme={th} kind="outline" full={false} style={{ width: 100, height: 64 }}>取消</DrvBigBtn>} />
    </div>
  );
}

Object.assign(window, { DRV_Trip, DRV_RouteStop, DRV_Platform, DRV_PlatformCard, DRV_Incident });
