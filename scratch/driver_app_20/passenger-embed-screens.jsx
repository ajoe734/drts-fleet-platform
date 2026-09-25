// passenger-embed-screens.jsx — Group A · 社區物業 App 內嵌叫車前台.
// Reuses ent-kit primitives (EBtn/ECard/ERow/EPill/EBanner/EIcon/EField/EInput/ESeg/EAvatar/EEmpty/ETimeline).
// Brand-driven by partner themeAccent (passed via theme accent) — never hardcoded hex in screens.
// Compact webview chrome (no standalone nav/footer). zh-TW.

// ── compact host-app chrome (community property app) ─────────────────────────
function PeShell({ t, p, title = '社區叫車', badgeTone = 'live', children, footer }) {
  const dot = badgeTone === 'live' ? t.success : badgeTone === 'warn' ? t.warn : badgeTone === 'err' ? t.danger : t.faint;
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: t.bg, fontFamily: t.sans, color: t.ink }}>
      {/* status bar — host brand color */}
      <div style={{ height: 44, flexShrink: 0, background: t.primaryHi, color: '#fff',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '0 22px 6px', fontSize: 12.5, fontWeight: 600 }}>
        <span>9:41</span>
        <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center', opacity: 0.9 }}><EIcon name="bolt" size={12} /><EIcon name="shield" size={12} /></span>
      </div>
      {/* host app chrome */}
      <div style={{ flexShrink: 0, background: t.primaryHi, color: '#fff', padding: '4px 12px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button style={{ width: 30, height: 30, borderRadius: 15, background: 'rgba(255,255,255,.16)', border: 'none', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><EIcon name="chevR" size={16} style={{ transform: 'rotate(180deg)' }} /></button>
        <div style={{ flex: 1, lineHeight: 1.2 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700 }}>{title}</div>
          <div style={{ fontSize: 10, opacity: 0.78 }}>{p.appName} · {p.displayName}</div>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9.5, fontFamily: t.mono, opacity: 0.78,
          background: 'rgba(255,255,255,.14)', padding: '4px 8px', borderRadius: 999 }}><EIcon name="lock" size={10} />{p.entryHost}</span>
      </div>
      {/* webview surface badge */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: t.surface,
        borderBottom: '1px solid ' + t.line, fontSize: 10.5, color: t.muted }}>
        <span style={{ width: 6, height: 6, borderRadius: 3, background: dot }} />
        <span style={{ fontFamily: t.mono }}>webview</span><span style={{ color: t.faint }}>· embedded · /embed/{p.entrySlug}</span>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>{children}</div>
      {footer && <div style={{ flexShrink: 0, borderTop: '1px solid ' + t.line, background: t.surface, padding: 14, display: 'flex', flexDirection: 'column', gap: 9 }}>{footer}</div>}
    </div>
  );
}

function PeHero({ t, icon, tone, title, posture }) {
  const fg = tone === 'danger' ? t.danger : tone === 'warn' ? t.warn : tone === 'success' ? t.success : t.primary;
  const bg = tone === 'danger' ? t.dangerBg : tone === 'warn' ? t.warnBg : tone === 'success' ? t.successBg : t.primaryBg;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9, padding: '14px 0 4px' }}>
      <div style={{ width: 58, height: 58, borderRadius: 29, background: bg, color: fg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><EIcon name={icon} size={28} /></div>
      <div style={{ fontSize: 16.5, fontWeight: 800, textAlign: 'center' }}>{title}</div>
      {posture && <EPill t={t} tone={tone} dot>{posture}</EPill>}
    </div>
  );
}
function PeTokenRow({ t, ok, k, en, v }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid ' + t.lineSoft }}>
      <span style={{ width: 19, height: 19, borderRadius: 10, background: ok ? t.successBg : t.dangerBg, color: ok ? t.success : t.danger,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><EIcon name={ok ? 'check' : 'x'} size={11} stroke={3} /></span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12.5, color: t.ink, fontWeight: 500 }}>{k}</div>
        {en && <div style={{ fontFamily: t.mono, fontSize: 9.5, color: t.faint }}>{en}</div>}
      </div>
      <span style={{ fontSize: 12, fontFamily: t.mono, color: ok ? t.ink : t.danger }}>{v}</span>
    </div>
  );
}
// brand brandmark chip (uses partner mark + accent)
function PeBrand({ t, p, size = 40 }) {
  return <span style={{ width: size, height: size, borderRadius: size / 3.2, background: 'linear-gradient(150deg,' + t.primary + ',' + t.primaryHi + ')',
    color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: size * 0.42, flexShrink: 0 }}>{p.mark}</span>;
}

// ═══════════════════ A1 · identity state machine (5) ═══════════════════════════
function PE_Handoff({ t, p }) {
  return (
    <PeShell t={t} p={p} badgeTone="live" footer={<EBtn t={t} variant="primary" block iconR="arrow">開始叫車</EBtn>}>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 13 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '10px 0 2px' }}>
          <PeBrand t={t} p={p} size={56} />
          <div style={{ fontSize: 16.5, fontWeight: 800, textAlign: 'center' }}>以 {p.displayName} 身分<br />為您準備叫車</div>
          <EPill t={t} tone="success" dot>handoff · 已交接</EPill>
        </div>
        <ECard t={t} pad={15} title="身分由社區 App 帶入" sub="signed hand-off token">
          <PeTokenRow t={t} ok k="社區簽章有效" en="partner_signature" v="valid" />
          <PeTokenRow t={t} ok k="住戶身分已解析" en="resident_resolved" v={PE_RESIDENT.name} />
          <PeTokenRow t={t} ok k="社區 / 戶別" en="community_unit" v={PE_RESIDENT.unit} />
          <div style={{ marginTop: 4 }}><ERow t={t} k="參照" v={PE_RESIDENT.ref} mono last /></div>
        </ECard>
        <EBanner t={t} tone="primary" icon="bolt" body={'免再登入 · 由 ' + p.appName + ' 安全帶入身分，直接開始叫車。內嵌頁不會要求輸入帳號密碼。'} />
      </div>
    </PeShell>
  );
}
function PE_Reauth({ t, p }) {
  return (
    <PeShell t={t} p={p} badgeTone="warn"
      footer={<><EBtn t={t} variant="primary" block>回 {p.appName} 重新進入</EBtn><EBtn t={t} variant="ghost" block size="sm">稍後再試</EBtn></>}>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 13 }}>
        <PeHero t={t} icon="clock" tone="warn" title="登入狀態已逾時" posture="reauth_required" />
        <ECard t={t} pad={15} title="連線狀態">
          <PeTokenRow t={t} ok={false} k="社區工作階段過期" en="partner_session" v="expired" />
          <PeTokenRow t={t} ok={false} k="交付權杖逾時" en="handoff_token" v="stale" />
        </ECard>
        <EBanner t={t} tone="warn" icon="shield" body={<span>為保護您的住戶帳號，請回到 <b>{p.appName}</b> 重新進入「叫車」。此頁不會要求輸入帳號或密碼。</span>} />
      </div>
    </PeShell>
  );
}
function PE_Unsupported({ t, p }) {
  return (
    <PeShell t={t} p={{ ...p, entryHost: 'unknown-host' }} badgeTone="err"
      footer={<EBtn t={t} variant="primary" block iconR="ext">前往獨立叫車網站</EBtn>}>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 13 }}>
        <PeHero t={t} icon="ban" tone="danger" title="無法在此環境開啟" posture="unsupported_host · 已封鎖" />
        <ECard t={t} pad={15} title="原因">
          <div style={{ fontSize: 13, color: t.ink2, lineHeight: 1.6 }}>叫車服務僅能於授權的社區 App 內開啟。目前來源不在白名單宿主（entryHost），基於安全考量已封鎖載入，未傳送任何個資。</div>
        </ECard>
        <ECard t={t} pad={15} title="偵測結果">
          <PeTokenRow t={t} ok={false} k="來源宿主未授權" en="origin_host" v="未授權" />
          <PeTokenRow t={t} ok={false} k="社區簽章" en="partner_signature" v="缺少" />
        </ECard>
      </div>
    </PeShell>
  );
}
function PE_Consent({ t, p }) {
  const scopes = [
    ['建立與管理叫車行程', '為您下單、查詢與取消行程', 'trip.manage'],
    ['使用必要個資', '上下車地址、聯絡電話以完成媒合與聯繫', 'pii.trip'],
    ['行程綁定住戶身分', '讓您重開 App 後仍能找回進行中行程與收據', 'identity.bind'],
  ];
  return (
    <PeShell t={t} p={p} badgeTone="live"
      footer={<><EBtn t={t} variant="primary" block>同意並開始</EBtn><EBtn t={t} variant="ghost" block size="sm">暫不使用</EBtn></>}>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 13 }}>
        <div style={{ padding: '6px 0 2px' }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>授權使用叫車服務</div>
          <div style={{ fontSize: 12.5, color: t.muted, marginTop: 4 }}>首次使用 · 請確認以下同意範圍 · consent_required</div>
        </div>
        <ECard t={t} pad={15}>
          {scopes.map((c, i, a) => (
            <div key={i} style={{ display: 'flex', gap: 11, padding: '11px 0', borderBottom: i < a.length - 1 ? '1px solid ' + t.lineSoft : 'none' }}>
              <span style={{ width: 20, height: 20, borderRadius: 5, background: t.primary, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}><EIcon name="check" size={12} stroke={3} /></span>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}><span style={{ fontSize: 13, fontWeight: 700 }}>{c[0]}</span><span style={{ fontFamily: t.mono, fontSize: 9.5, color: t.faint }}>{c[2]}</span></div>
                <div style={{ fontSize: 11.5, color: t.muted, marginTop: 2, lineHeight: 1.45 }}>{c[1]}</div>
              </div>
            </div>
          ))}
        </ECard>
        <EBanner t={t} tone="primary" icon="lock" body={'由 ' + p.operator + ' 提供接送 · 個資僅用於完成本次行程，可於社區 App 設定撤回授權。'} />
      </div>
    </PeShell>
  );
}
function PE_Fallback({ t, p }) {
  return (
    <PeShell t={t} p={p} badgeTone="neutral"
      footer={<><EBtn t={t} variant="primary" block iconR="ext">前往獨立叫車網站</EBtn><EBtn t={t} variant="ghost" block size="sm">回社區 App</EBtn></>}>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 13 }}>
        <PeHero t={t} icon="ext" tone="neutral" title="內嵌服務暫時無法使用" posture="fallback_to_web · 改用網站" />
        <ECard t={t} pad={15} title="接下來">
          <div style={{ fontSize: 13, color: t.ink2, lineHeight: 1.6 }}>目前無法在社區 App 內完成叫車。您可改用 <b>獨立叫車網站</b>，以手機號碼驗證後繼續，行程與收據仍會綁定您的身分。</div>
        </ECard>
        <ECard t={t} pad={15}>
          <ERow t={t} k="獨立網站" v="ride.drts.com.tw" mono />
          <ERow t={t} k="驗證方式" v="手機簡訊 OTP" />
          <ERow t={t} k="行程資料" v="重開後仍可找回" last />
        </ECard>
      </div>
    </PeShell>
  );
}

// ═══════════════════ A2 · book + negatives ════════════════════════════════════
function PE_Book({ t, p }) {
  return (
    <PeShell t={t} p={p} badgeTone="live"
      footer={<><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
        <span style={{ color: t.muted }}>預估車資</span><span style={{ fontFamily: t.mono, fontWeight: 700, fontSize: 16, color: t.ink }}>約 NT$ 290</span></div>
        <EBtn t={t} variant="primary" block iconR="arrow">確認叫車</EBtn></>}>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 13 }}>
        {/* resident chip */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px', background: t.surface, border: '1px solid ' + t.line, borderRadius: 12 }}>
          <PeBrand t={t} p={p} size={34} />
          <div style={{ flex: 1, lineHeight: 1.25 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>{PE_RESIDENT.name} · {PE_RESIDENT.unit}</div>
            <div style={{ fontSize: 11, color: t.muted }}>{p.community}</div>
          </div>
          <EPill t={t} tone="success" dot>已驗證</EPill>
        </div>

        <ECard t={t} pad={15} title="行程" sub="上車 · 下車 · 時間">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <EField t={t} label="上車地點"><EInput t={t} icon="pin" value="御和?峰 A 棟 1F 大廳" /></EField>
            <EField t={t} label="下車地點"><EInput t={t} icon="pin" value="台北榮民總醫院 · 門診大樓" /></EField>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <EField t={t} label="用車時間"><EInput t={t} icon="clock" value="現在出發" /></EField>
              <EField t={t} label="乘客人數"><EInput t={t} icon="user" value="1 人" /></EField>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 11 }}>
            {PE_SAVED.map(s => <span key={s.label} style={{ fontSize: 11.5, color: t.muted, background: t.surfaceLo, border: '1px solid ' + t.line, padding: '4px 9px', borderRadius: 999 }}>{s.label}</span>)}
          </div>
        </ECard>

        <ECard t={t} pad={15} title="車種" sub="owned mobility">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {PE_VEHICLES.map((v, i) => (
              <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px', borderRadius: 11,
                border: '1px solid ' + (i === 1 ? t.primary : t.line), background: i === 1 ? t.primaryBg : t.surface }}>
                <span style={{ color: i === 1 ? t.primary : t.muted }}><EIcon name="car" size={20} /></span>
                <div style={{ flex: 1 }}><div style={{ fontSize: 13.5, fontWeight: 700 }}>{v.name}</div><div style={{ fontSize: 11, color: t.muted }}>{v.sub}</div></div>
                {i === 1 && <EIcon name="check" size={17} style={{ color: t.primary }} />}
              </div>
            ))}
          </div>
        </ECard>
      </div>
    </PeShell>
  );
}

const PE_NEG = {
  denied:    { icon: 'x', tone: 'danger', title: '叫車未能建立', posture: 'denied', body: '此次叫車請求未通過。請確認上下車地點是否在服務範圍內，或稍後再試。', primary: '重新叫車', ghost: '聯絡社區客服' },
  ineligible:{ icon: 'ban', tone: 'warn', title: '目前不符叫車資格', posture: 'ineligible', body: '您的住戶身分目前未開通叫車服務，可能因社區方案尚未生效。請洽社區管理中心確認。', primary: '洽社區管理中心', ghost: '返回' },
  nosupply:  { icon: 'car', tone: 'warn', title: '附近暫無可派車輛', posture: 'no_supply', body: '此時段與地點暫無可派車。請稍後重試或改約時間，系統也會嘗試自動為您補派。', primary: '稍後重試', ghost: '改約時間' },
  degraded:  { icon: 'alert', tone: 'warn', title: '服務暫時不穩定', posture: 'degraded', body: '叫車服務目前回應較慢。您的請求已安全受理，恢復後會自動繼續，無需重複送出。', primary: '重試', ghost: '查看狀態' },
};
function PE_Negative({ t, p, kind = 'nosupply' }) {
  const g = PE_NEG[kind];
  return (
    <PeShell t={t} p={p} badgeTone={g.tone === 'danger' ? 'err' : 'warn'}
      footer={<><EBtn t={t} variant="primary" block>{g.primary}</EBtn><EBtn t={t} variant="ghost" block size="sm">{g.ghost}</EBtn></>}>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 13 }}>
        <PeHero t={t} icon={g.icon} tone={g.tone} title={g.title} posture={g.posture} />
        <ECard t={t} pad={15}>
          <div style={{ fontSize: 13, color: t.ink2, lineHeight: 1.65 }}>{g.body}</div>
        </ECard>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontSize: 11.5, color: t.muted }}>
          <EIcon name="phone" size={13} />社區叫車客服 {p.support}
        </div>
      </div>
    </PeShell>
  );
}

// ═══════════════════ A3 · active trip (persistent) ════════════════════════════
function PE_Active({ t, p }) {
  const a = PE_ACTIVE, st = peState(a.state);
  return (
    <PeShell t={t} p={p} badgeTone="live"
      footer={<><EBtn t={t} variant="default" block icon="phone">聯絡司機</EBtn><EBtn t={t} variant="danger" block size="sm">取消行程 · 剩 {a.cancelWindowMin} 分鐘可免費取消</EBtn></>}>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 13 }}>
        {/* persistence assurance */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 11px', background: t.primaryBg, border: '1px solid ' + t.primaryBd, borderRadius: 10 }}>
          <EIcon name="shield" size={14} style={{ color: t.primary, flexShrink: 0 }} />
          <span style={{ fontSize: 11.5, color: t.ink2, lineHeight: 1.4 }}>此行程已綁定您的身分 · <b>重開 App 仍可找回</b></span>
        </div>

        <ECard t={t} accent={t.primary} pad={16}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <EPill t={t} tone={st.tone} dot>{st.zh}</EPill>
            <span style={{ fontSize: 11.5, color: t.muted, fontFamily: t.mono }}>{a.id}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
            <EAvatar t={t} name={a.driver} size={50} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{a.driver} · {a.rating} ★</div>
              <div style={{ fontSize: 12, color: t.muted, fontFamily: t.mono }}>{a.vehicle} · {a.plate}</div>
            </div>
            <div style={{ textAlign: 'center', background: t.primaryBg, border: '1px solid ' + t.primaryBd, borderRadius: 12, padding: '8px 16px' }}>
              <div style={{ fontSize: 28, fontWeight: 800, fontFamily: t.mono, color: t.primary, lineHeight: 1 }}>{a.etaMin}</div>
              <div style={{ fontSize: 10, color: t.muted, marginTop: 3 }}>分鐘 · 估計</div>
            </div>
          </div>
        </ECard>

        <ECard t={t} pad={15}>
          <div style={{ display: 'flex', gap: 11 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 4 }}>
              <span style={{ width: 9, height: 9, borderRadius: 5, border: '2px solid ' + t.primary }} />
              <span style={{ flex: 1, width: 2, background: t.line, margin: '3px 0', minHeight: 22 }} />
              <span style={{ width: 9, height: 9, borderRadius: 2, background: t.primary }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 18 }}>{a.from}</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{a.to}</div>
            </div>
          </div>
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid ' + t.lineSoft }}>
            <ERow t={t} k="預計上車" v={a.win} mono last />
          </div>
        </ECard>
        <div style={{ fontSize: 11, color: t.faint, textAlign: 'center', lineHeight: 1.5 }}>抵達時間為估計值，非保證 · 接送由 {p.operator} 提供</div>
      </div>
    </PeShell>
  );
}

// ═══════════════════ A4 · trips history ═══════════════════════════════════════
function PE_Trips({ t, p }) {
  return (
    <PeShell t={t} p={p} badgeTone="live">
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>我的行程</div>
          <EPill t={t} tone="neutral">綁定 {PE_RESIDENT.name}</EPill>
        </div>
        <div style={{ fontSize: 11.5, color: t.muted, display: 'flex', alignItems: 'center', gap: 6, marginTop: -4 }}>
          <EIcon name="shield" size={13} style={{ color: t.primary }} />重開 App 後行程與收據仍可找回
        </div>
        {PE_TRIPS.map(tr => {
          const st = peState(tr.state);
          return (
            <ECard t={t} key={tr.id} pad={14} onClick={() => {}}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 38, height: 38, borderRadius: 10, background: t.surfaceLo, color: t.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <EIcon name={tr.state === 'cancelled' ? 'x' : tr.state === 'completed' ? 'check' : 'car'} size={18} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tr.from} → {tr.to}</div>
                  <div style={{ fontSize: 11, color: t.muted, fontFamily: t.mono, marginTop: 2 }}>{tr.date} · {tr.id}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <EPill t={t} tone={st.tone} dot>{st.zh}</EPill>
                  <div style={{ fontSize: 12.5, fontFamily: t.mono, color: t.ink, marginTop: 5, fontWeight: 600 }}>{tr.fare}</div>
                </div>
              </div>
            </ECard>
          );
        })}
      </div>
    </PeShell>
  );
}

// ═══════════════════ A5 · receipt (PII masked) ════════════════════════════════
function PE_Receipt({ t, p }) {
  const r = PE_RECEIPT;
  return (
    <PeShell t={t} p={p} badgeTone="live" footer={<EBtn t={t} variant="primary" block icon="download">下載收據</EBtn>}>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 13 }}>
        <PeHero t={t} icon="check" tone="success" title="行程已完成" posture={null} />
        <div style={{ textAlign: 'center', fontSize: 12, color: t.muted, fontFamily: t.mono, marginTop: -6 }}>{r.id} · {r.order}</div>
        <ECard t={t} pad={15} title="行程" sub={r.date}>
          <div style={{ display: 'flex', gap: 11 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 4 }}>
              <span style={{ width: 9, height: 9, borderRadius: 5, border: '2px solid ' + t.primary }} />
              <span style={{ flex: 1, width: 2, background: t.line, margin: '3px 0', minHeight: 16 }} />
              <span style={{ width: 9, height: 9, borderRadius: 2, background: t.primary }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 14 }}>{r.from}</div>
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>{r.to}</div>
            </div>
          </div>
        </ECard>
        <ECard t={t} pad={15} title="乘客與車輛" sub="PII 已遮罩">
          <ERow t={t} k="乘客" v={r.passenger} />
          <ERow t={t} k="聯絡電話" v={r.maskedPhone} mono />
          <ERow t={t} k="司機 / 車牌" v={r.driver + ' · ' + r.plate} />
          <ERow t={t} k="車種" v={r.vehicle} last />
        </ECard>
        <ECard t={t} pad={15} title="費用明細" sub="fare breakdown">
          <ERow t={t} k="起步價" v={r.fareBase} mono />
          <ERow t={t} k="里程" v={r.fareDistance} mono />
          <ERow t={t} k="時間" v={r.fareTime} mono />
          <ERow t={t} k="合計" v={r.total} strong last />
          <div style={{ marginTop: 12 }}>
            <EBanner t={t} tone="neutral" icon="building" body={r.pay + ' · 經 ' + r.channel} />
          </div>
        </ECard>
      </div>
    </PeShell>
  );
}

// ═══════════════════ A6 · completed / cancelled ═══════════════════════════════
function PE_Outcome({ t, p, kind = 'completed' }) {
  const done = kind === 'completed';
  return (
    <PeShell t={t} p={p} badgeTone={done ? 'live' : 'neutral'}
      footer={done
        ? <><EBtn t={t} variant="primary" block icon="receipt">查看收據</EBtn><EBtn t={t} variant="ghost" block size="sm">再叫一次</EBtn></>
        : <EBtn t={t} variant="primary" block iconR="arrow">重新叫車</EBtn>}>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 13 }}>
        <PeHero t={t} icon={done ? 'check' : 'x'} tone={done ? 'success' : 'neutral'}
          title={done ? '行程已完成' : '行程已取消'} posture={done ? 'completed' : 'cancelled'} />
        {done ? (
          <>
            <ECard t={t} pad={15}>
              <ERow t={t} k="行程" v="台北車站 → 社區大廳" />
              <ERow t={t} k="車資" v="NT$ 285" strong />
              <ERow t={t} k="付款" v="社區月結" last />
            </ECard>
            <ECard t={t} pad={16} title="為這趟行程評分">
              <div style={{ display: 'flex', justifyContent: 'center', gap: 9, padding: '4px 0' }}>
                {[1, 2, 3, 4, 5].map(n => <EIcon key={n} name="spark" size={30} style={{ color: n <= 5 ? t.warn : t.line }} />)}
              </div>
            </ECard>
          </>
        ) : (
          <ECard t={t} pad={15}>
            <div style={{ fontSize: 13, color: t.ink2, lineHeight: 1.65, marginBottom: 10 }}>此行程已取消，未產生車資。若於司機抵達後取消可能酌收費用，詳見社區叫車條款。</div>
            <ERow t={t} k="取消時間" v="06-05 19:42" mono />
            <ERow t={t} k="費用" v="NT$ 0" strong last />
          </ECard>
        )}
      </div>
    </PeShell>
  );
}

Object.assign(window, {
  PeShell, PeHero, PeTokenRow, PeBrand,
  PE_Handoff, PE_Reauth, PE_Unsupported, PE_Consent, PE_Fallback,
  PE_Book, PE_Negative, PE_Active, PE_Trips, PE_Receipt, PE_Outcome,
});
