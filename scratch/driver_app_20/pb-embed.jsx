// pb-embed.jsx — Request B: online-banking-app EMBED identity states (B1–B5).
// Identity comes from the bank session (signed reference token), NOT a standalone login.
// Constraints: never capture raw card data · never expose mgmt resources · compact host chrome · zh-TW.
// Reuses PB primitives. Card program (中信) is the embed host context.

// Compact bank-app chrome: a slim host bar above the embed webview content.
function PBEmbedChrome({ p, host, state, children }) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#EEF1F7', fontFamily: PB_FONT }}>
      {/* bank app top bar (host chrome — compact) */}
      <div style={{ background: p.primaryDark, color: '#fff', padding: '10px 14px 11px', display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0 }}>
        <button style={{ width: 28, height: 28, borderRadius: 14, background: 'rgba(255,255,255,.14)', border: 'none', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M15 6l-6 6 6 6"/></svg>
        </button>
        <div style={{ flex: 1, lineHeight: 1.2 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700 }}>機場接送</div>
          <div style={{ fontSize: 10, opacity: .72 }}>{p.brand} · 行動銀行</div>
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9.5, fontFamily: PB_MONO, opacity: .72, background: 'rgba(255,255,255,.1)', padding: '4px 8px', borderRadius: 999 }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg>
          {host || p.host}
        </div>
      </div>
      {/* webview surface badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: '#fff', borderBottom: '1px solid #E8ECF3', fontSize: 10.5, color: '#56657F', flexShrink: 0 }}>
        <span style={{ width: 6, height: 6, borderRadius: 3, background: state === 'live' ? '#16A34A' : state === 'warn' ? '#D97706' : state === 'err' ? '#DC2626' : '#94A3B8' }} />
        <span style={{ fontFamily: PB_MONO }}>webview</span>
        <span style={{ color: '#9CA3AF' }}>· embedded in {p.brand} app</span>
      </div>
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>{children}</div>
    </div>
  );
}

function PBTokenRow({ p, ok, k, v, en }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px dashed #F1F3F8' }}>
      <div style={{ width: 18, height: 18, borderRadius: 9, background: ok ? '#F0FDF4' : '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {ok
          ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#15803D" strokeWidth="3"><path d="M5 12l5 5L20 7"/></svg>
          : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="3"><path d="M6 6l12 12M18 6L6 18"/></svg>}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12.5, color: '#0E1424', fontWeight: 500 }}>{k}</div>
        {en && <div style={{ fontFamily: PB_MONO, fontSize: 9.5, color: '#9CA3AF' }}>{en}</div>}
      </div>
      <span style={{ fontSize: 12, fontFamily: PB_MONO, color: ok ? '#0E1424' : '#DC2626' }}>{v}</span>
    </div>
  );
}

// ── B1 · Signed-in hand-off (happy path) ─────────────────────────────────────
function PB_EmbedHandoff() {
  const p = PROGRAMS.card;
  return (
    <PBEmbedChrome p={p} state="live">
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '10px 0 2px' }}>
          <div style={{ width: 56, height: 56, borderRadius: 28, background: p.primary + '14', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={p.primary} strokeWidth="2"><path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z"/><path d="M9 12l2 2 4-4"/></svg>
          </div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>已透過行動銀行登入</div>
          <PBChip p={p} tone="ok">session_resolved · 自動帶入</PBChip>
        </div>
        <PBCard p={p} title="身分由銀行 App 帶入 · reference token">
          <PBTokenRow p={p} ok k="發卡行簽章有效" en="issuer_signature" v="valid" />
          <PBTokenRow p={p} ok k="卡友身分已解析" en="cardholder_resolved" v="陳〇明" />
          <PBTokenRow p={p} ok k="參照權杖 · reference token" en="ref_token" v="tok_••••_9F2" />
          <div style={{ marginTop: 4 }}><PBRow k="權益方案" v="World Elite 機場接送" /></div>
        </PBCard>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: p.accentBg, border: '1px solid ' + p.accent + '55', borderRadius: 9 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={p.primaryDark} strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 2"/></svg>
          <span style={{ fontSize: 11.5, color: '#0E1424', lineHeight: 1.4 }}>免再登入 · 略過獨立啟用，直接進入資格確認與預約。</span>
        </div>
      </div>
      <PBFooter><PBBtn p={p} primary>開始預約接送</PBBtn></PBFooter>
    </PBEmbedChrome>
  );
}

// ── B2 · Token expired / re-auth required ────────────────────────────────────
function PB_EmbedReauth() {
  const p = PROGRAMS.card;
  return (
    <PBEmbedChrome p={p} state="warn">
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '10px 0 2px' }}>
          <div style={{ width: 56, height: 56, borderRadius: 28, background: '#FFFBEB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#B45309" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
          </div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>登入狀態已逾時</div>
          <PBChip p={p} tone="warn">token_expired · 需重新驗證</PBChip>
        </div>
        <PBCard p={p} title="連線狀態">
          <PBTokenRow p={p} ok={false} k="發卡行 session 已過期" en="issuer_session" v="expired" />
          <PBTokenRow p={p} ok={false} k="參照權杖逾時" en="ref_token" v="stale" />
        </PBCard>
        <PBCard p={p} accentBar>
          <div style={{ fontSize: 12.5, color: '#0E1424', lineHeight: 1.6 }}>
            為保護您的帳戶安全，請回到 {p.brand} App 重新驗證身分後再進入接送服務。
            <b> 接送頁不會要求您輸入卡號或密碼。</b>
          </div>
        </PBCard>
      </div>
      <PBFooter>
        <PBBtn p={p} primary>回行動銀行重新驗證</PBBtn>
        <PBBtn p={p} ghost>稍後再試</PBBtn>
      </PBFooter>
    </PBEmbedChrome>
  );
}

// ── B3 · Unsupported / wrong host (blocked) ──────────────────────────────────
function PB_EmbedUnsupported() {
  const p = PROGRAMS.card;
  return (
    <PBEmbedChrome p={p} host="unknown-host.example" state="err">
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '10px 0 2px' }}>
          <div style={{ width: 56, height: 56, borderRadius: 28, background: '#FEE4E2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#B42318" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M6 6l12 12"/></svg>
          </div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>無法在此環境開啟</div>
          <PBChip p={p} tone="err">unsupported_host · 已封鎖</PBChip>
        </div>
        <PBCard p={p} title="原因">
          <div style={{ fontSize: 13, color: '#0E1424', lineHeight: 1.6 }}>
            此接送服務僅能於授權的銀行 App 內開啟。目前來源並非已授權的發卡行環境，基於安全考量已封鎖載入。
          </div>
        </PBCard>
        <PBCard p={p} title="偵測結果">
          <PBTokenRow p={p} ok={false} k="來源主機未授權" en="origin_host" v="未授權" />
          <PBTokenRow p={p} ok={false} k="發卡行簽章" en="issuer_signature" v="缺少" />
        </PBCard>
        <div style={{ fontSize: 11.5, color: '#56657F', lineHeight: 1.55, padding: '0 4px' }}>請改由 {p.brand} 行動銀行 App 內的「機場接送」入口開啟，或前往官方網站。</div>
      </div>
      <PBFooter><PBBtn p={p} primary>前往官方網站</PBBtn></PBFooter>
    </PBEmbedChrome>
  );
}

// ── B4 · Consent / scope acknowledgement (first-time) ────────────────────────
function PB_EmbedConsent() {
  const p = PROGRAMS.card;
  const scopes = [
    { t: '讀取卡友身分與權益', s: '解析參照權杖以確認接送資格', en: 'identity.read' },
    { t: '共享接送行程資訊', s: '與智慧運輸科技共享派車必要資訊', en: 'trip.share' },
    { t: '費用合併入帳', s: '超出權益之費用合併至本卡帳單', en: 'billing.link' },
  ];
  return (
    <PBEmbedChrome p={p} state="live">
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
        <div style={{ padding: '6px 0 2px' }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>授權使用接送服務</div>
          <div style={{ fontSize: 12.5, color: '#56657F', marginTop: 4 }}>首次使用 · 請確認以下授權範圍 (scope)</div>
        </div>
        <PBCard p={p}>
          {scopes.map((c, i, a) => (
            <div key={i} style={{ display: 'flex', gap: 12, padding: '11px 0', borderBottom: i < a.length - 1 ? '1px dashed #F1F3F8' : 'none' }}>
              <div style={{ width: 20, height: 20, borderRadius: 5, background: p.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><path d="M5 12l5 5L20 7"/></svg>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{c.t}</span>
                  <span style={{ fontFamily: PB_MONO, fontSize: 9.5, color: '#9CA3AF' }}>{c.en}</span>
                </div>
                <div style={{ fontSize: 11.5, color: '#56657F', marginTop: 2, lineHeight: 1.45 }}>{c.s}</div>
              </div>
            </div>
          ))}
        </PBCard>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', background: p.accentBg, border: '1px solid ' + p.accent + '55', borderRadius: 9 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={p.primaryDark} strokeWidth="2" style={{ flexShrink: 0, marginTop: 1 }}><rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg>
          <span style={{ fontSize: 11.5, color: '#0E1424', lineHeight: 1.45 }}>不會讀取卡號或密碼 · 身分由 {p.brand} 安全帶入。可於行動銀行設定隨時撤回授權。</span>
        </div>
      </div>
      <PBFooter>
        <PBBtn p={p} primary>同意並繼續</PBBtn>
        <PBBtn p={p} ghost>暫不使用</PBBtn>
      </PBFooter>
    </PBEmbedChrome>
  );
}

// ── B5 · Fallback to standalone site ─────────────────────────────────────────
function PB_EmbedFallback() {
  const p = PROGRAMS.card;
  return (
    <PBEmbedChrome p={p} state="neutral">
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '10px 0 2px' }}>
          <div style={{ width: 56, height: 56, borderRadius: 28, background: '#F1F3F8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#56657F" strokeWidth="2"><path d="M10 14L21 3M21 3h-6M21 3v6"/><path d="M21 14v5a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h5"/></svg>
          </div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>未偵測到銀行登入</div>
          <PBChip p={p} tone="neutral">no_embed_session · 改用官網</PBChip>
        </div>
        <PBCard p={p} title="接下來">
          <div style={{ fontSize: 13, color: '#0E1424', lineHeight: 1.6 }}>
            此頁未取得有效的銀行內嵌身分。您可改用 {p.brand} 機場接送 <b>官方網站</b>，以卡號末四碼或網銀帳號自行驗證資格。
          </div>
        </PBCard>
        <PBCard p={p}>
          <PBRow k="官方網站" v="ride.ctbc.com.tw" mono />
          <PBRow k="驗證方式" v="末四碼 / 網銀帳號" />
          <PBRow k="安全性" v="不在此頁輸入卡片資料" />
        </PBCard>
      </div>
      <PBFooter>
        <PBBtn p={p} primary>前往官方網站預約</PBBtn>
        <PBBtn p={p} ghost>回行動銀行登入</PBBtn>
      </PBFooter>
    </PBEmbedChrome>
  );
}

Object.assign(window, {
  PBEmbedChrome, PB_EmbedHandoff, PB_EmbedReauth, PB_EmbedUnsupported, PB_EmbedConsent, PB_EmbedFallback,
});
