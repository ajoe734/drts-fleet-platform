// ent-screens-1.jsx — Enterprise Dispatch (1/3): Home · New booking · Review · Submitted.
// VQ-2: passenger ≠ bookedBy made explicit. VQ-3: cost ownership + approval posture lead the review.

// passenger / bookedBy relationship row (VQ-2)
function EntParty({ t, passenger, bookedBy, self, compact }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <EAvatar t={t} name={passenger} size={compact ? 34 : 40} />
      <div style={{ flex: 1, lineHeight: 1.25 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontSize: compact ? 14 : 15, fontWeight: 700 }}>{passenger}</span>
          <EPill t={t} tone="neutral">乘客</EPill>
        </div>
        {self
          ? <div style={{ fontSize: 12, color: t.muted, marginTop: 1 }}>本人預約</div>
          : <div style={{ fontSize: 12, color: t.warn, marginTop: 1, display: 'flex', alignItems: 'center', gap: 5 }}>
              <EIcon name="users" size={13} />由 <b style={{ color: t.ink2 }}>{bookedBy}</b> 代訂 · 乘客非下單人</div>}
      </div>
    </div>
  );
}

// trip route mini (from → to + window)
function EntRoute({ t, from, to, win, airport }) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 11 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 4 }}>
          <span style={{ width: 9, height: 9, borderRadius: 5, border: '2px solid ' + t.primary }} />
          <span style={{ flex: 1, width: 2, background: t.line, margin: '3px 0', minHeight: 18 }} />
          <span style={{ width: 9, height: 9, borderRadius: 2, background: t.primary }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 14 }}>{from}</div>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>{to}</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
        <EPill t={t} tone="neutral"><EIcon name="cal" size={12} />{win}</EPill>
        {airport && <EPill t={t} tone="info"><EIcon name="flag" size={12} />{airport.dir} · {airport.flight} · {airport.terminal}</EPill>}
      </div>
    </div>
  );
}

// ── 1. Home / Workspace — route / ───────────────────────────────────────────
function ENT_Home({ t, degraded }) {
  const u = ENT_USERS.requester;
  const active = ENT_BOOKINGS.find(b => b.state === 'enroute' || b.state === 'assigned');
  const upcoming = ENT_BOOKINGS.filter(b => ['assigned', 'enroute', 'approval', 'reserved'].includes(b.state)).slice(0, 3);
  return (
    <EntWebShell t={t} active="home" user={u} quota={ENT_QUOTA.label} degraded={degraded}>
      {/* greeting hero */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, marginBottom: 22, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 13, color: t.muted, marginBottom: 6 }}>2026-06-13 (週六) · {ENT_TENANT.name} · {u.dept}</div>
          <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: -0.6, margin: 0 }}>嗨，{u.name}，要去哪裡？</h1>
          <p style={{ fontSize: 14.5, color: t.muted, margin: '8px 0 0' }}>為自己或同事建立企業派車 · 費用走成本中心、超額需審批。</p>
        </div>
        <EBtn t={t} variant="primary" size="lg" icon="plus" iconR="arrow">建立預約</EBtn>
      </div>

      {/* policy reminder strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 16 }}>
        <EKpi t={t} label="本月額度" en="quota" value={ENT_QUOTA.label} sub={ENT_QUOTA.amount} />
        <EKpi t={t} label="審批狀態" en="approval" value="1 件待審" sub="EB-7K2C44 · 由你送出" tone="warn" />
        <EKpi t={t} label="本月已用車" en="trips" value="23 趟" sub="產品部 · 較上月 +6%" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {active && (
            <ECard t={t} accent={t.primary} title="進行中的行程" sub="最快回到目前用車狀態"
              actions={<EBtn t={t} variant="soft" size="sm" iconR="arrow">查看行程</EBtn>}>
              <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <EntParty t={t} passenger={active.passenger} bookedBy={active.bookedBy} self={active.self} compact />
                  <div style={{ marginTop: 14 }}><EntRoute t={t} from={active.from} to={active.to} win={active.win} airport={active.airport} /></div>
                </div>
                <div style={{ width: 150, background: t.surfaceLo, border: '1px solid ' + t.line, borderRadius: 12, padding: 14, textAlign: 'center', alignSelf: 'flex-start' }}>
                  <EPill t={t} tone={entStateMeta(active.state).tone} dot>{entStateMeta(active.state).zh}</EPill>
                  <div style={{ fontSize: 30, fontWeight: 800, fontFamily: t.mono, color: t.primary, margin: '10px 0 0' }}>9</div>
                  <div style={{ fontSize: 11, color: t.muted }}>分鐘後抵達上車點</div>
                </div>
              </div>
            </ECard>
          )}
          <ECard t={t} title="即將到來的預約" sub={upcoming.length + ' 筆 · 含待審批'} pad={0}
            actions={<EBtn t={t} variant="ghost" size="sm" iconR="arrow">全部預約</EBtn>}>
            <div>
              {upcoming.map((b, i) => (
                <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px',
                  borderTop: i ? '1px solid ' + t.lineSoft : 'none' }}>
                  <EAvatar t={t} name={b.passenger} size={36} tone={b.self ? 'primary' : 'neutral'} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600 }}>{b.passenger}</span>
                      {!b.self && <span style={{ fontSize: 11, color: t.warn }}>· {b.bookedBy} 代訂</span>}
                    </div>
                    <div style={{ fontSize: 12, color: t.muted, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.from} → {b.to}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 12.5, fontFamily: t.mono, color: t.ink2 }}>{b.win}</div>
                    <div style={{ marginTop: 4 }}><EPill t={t} tone={entStateMeta(b.state).tone} dot>{entStateMeta(b.state).zh}</EPill></div>
                  </div>
                </div>
              ))}
            </div>
          </ECard>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <ECard t={t} title="快速建立">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              <EBtn t={t} variant="primary" block icon="plus">為自己預約</EBtn>
              <EBtn t={t} variant="default" block icon="users">為同事 / 訪客代訂</EBtn>
              <EBtn t={t} variant="default" block icon="flag">機場接送</EBtn>
            </div>
          </ECard>
          <ECard t={t} title="政策提醒" sub="enterprise policy">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {[['bolt', '單趟超過 NT$ 1,500 需部門主管審批'], ['building', '所有用車須指定有效成本中心'], ['clock', '用車前 1 小時內取消計入額度']].map((r, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, fontSize: 12.5, color: t.ink2, lineHeight: 1.5 }}>
                  <span style={{ color: t.primary, flexShrink: 0, marginTop: 1 }}><EIcon name={r[0]} size={15} /></span>{r[1]}</div>
              ))}
            </div>
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid ' + t.lineSoft, display: 'flex', alignItems: 'center', gap: 8 }}>
              <EIcon name="phone" size={14} style={{ color: t.muted }} />
              <span style={{ fontSize: 12, color: t.muted }}>企業客服 0800-200-118 · 24h</span>
            </div>
          </ECard>
        </div>
      </div>
    </EntWebShell>
  );
}

// ── 2. New booking — route /bookings/new ─────────────────────────────────────
function ENT_New({ t, mode = 'delegate' }) {
  const u = ENT_USERS.delegate;
  const forSelf = mode === 'self';
  return (
    <EntWebShell t={t} active="bookings" user={u} quota={ENT_QUOTA.label}>
      <EntPageHead t={t} back="返回首頁" title="建立企業派車"
        sub="為自己或同事 / 訪客預約用車 · 機場資訊為選填" />
      <div style={{ marginBottom: 20 }}>
        <EStepper t={t} steps={['填寫資訊', '確認權責', '送出']} active={0} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 18, alignItems: 'start' }}>
        {/* form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <ECard t={t} title="乘客" sub="passenger">
            <ESeg t={t} full value={forSelf ? 'self' : 'other'} options={[
              { value: 'self', label: '為自己預約', icon: 'user' }, { value: 'other', label: '為他人代訂', icon: 'users' }]} />
            <div style={{ height: 14 }} />
            {!forSelf && (
              <EField t={t} label="選擇乘客" req hint="可從通訊錄搜尋同事，或輸入外賓姓名">
                <EInput t={t} icon="search" value="訪客 · Sato Kenji" />
              </EField>
            )}
            {!forSelf && (
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 12 }}>
                {ENT_PASSENGERS.slice(0, 4).map(p => (
                  <span key={p.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: t.ink2,
                    background: t.surfaceLo, border: '1px solid ' + t.line, padding: '5px 10px', borderRadius: 999 }}>
                    <EAvatar t={t} name={p.name} size={20} tone="neutral" />{p.name}{p.tag && <span style={{ color: t.faint }}>· {p.tag}</span>}</span>
                ))}
              </div>
            )}
          </ECard>

          <ECard t={t} title="行程" sub="pickup · dropoff · window">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <EField t={t} label="上車地點" req full><EInput t={t} icon="pin" value="桃園機場 T1 · 入境大廳" /></EField>
              <EField t={t} label="下車地點" req full><EInput t={t} icon="pin" value="君悅酒店 · 信義區松壽路 2 號" /></EField>
              <EField t={t} label="用車日期" req><EInput t={t} icon="cal" value="2026-06-13" mono /></EField>
              <EField t={t} label="用車時間" req><EInput t={t} icon="clock" value="15:20" mono /></EField>
            </div>
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 12 }}>
              {ENT_ADDRESSES.map(a => (
                <span key={a.label} style={{ fontSize: 11.5, color: t.muted, background: t.surfaceLo, border: '1px solid ' + t.line, padding: '4px 9px', borderRadius: 999 }}>{a.label}</span>
              ))}
            </div>
          </ECard>

          {/* airport — conditional, not the visual center */}
          <ECard t={t} title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>機場資訊 <EPill t={t} tone="neutral">選填</EPill></span>} sub="僅機場接送情境需要">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <EField t={t} label="方向"><ESeg t={t} full value="in" options={[{ value: 'out', label: '出境' }, { value: 'in', label: '入境' }]} /></EField>
              <EField t={t} label="航廈"><EInput t={t} value="T1 · 第一航廈" /></EField>
              <EField t={t} label="航班編號"><EInput t={t} icon="flag" value="JL809" mono /></EField>
              <EField t={t} label="行李件數"><EInput t={t} value="3 件" /></EField>
            </div>
          </ECard>

          <ECard t={t} title="權責與聯絡" sub="cost center · onsite contact">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <EField t={t} label="成本中心" req full hint="企業用車主要欄位 · 將決定費用歸屬與審批"><EInput t={t} icon="building" value="CC-PRD-07 · 產品部 · 客戶接待" /></EField>
              <EField t={t} label="下單人 booked by"><EInput t={t} icon="user" value="周敏 · 行政祕書" /></EField>
              <EField t={t} label="現場聯絡電話" req><EInput t={t} icon="phone" value="0912-880-114" mono /></EField>
              <EField t={t} label="車型偏好" full><ESeg t={t} full value="business" options={ENT_VEHICLES.map(v => ({ value: v.id, label: v.name }))} /></EField>
              <EField t={t} label="備註 notes" full><EInput t={t} value="日本客戶接機 · 需舉牌「Sato 様」" /></EField>
            </div>
          </ECard>
        </div>

        {/* helper reads — sticky */}
        <div style={{ position: 'sticky', top: 76, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <ECard t={t} title="即時檢核" sub="helper reads">
            <ERow t={t} k="成本中心" v={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><EPill t={t} tone="success" dot>有效</EPill></span>} />
            <ERow t={t} k="可用額度" v="NT$ 31,000 / 60,000" mono />
            <ERow t={t} k="預估車資" v="約 NT$ 1,180" mono />
            <ERow t={t} k="額度影響" v="本趟預扣 1 趟" />
            <ERow t={t} k="審批需求" v={<EPill t={t} tone="success" dot>免審批</EPill>} last />
            <div style={{ marginTop: 12 }}>
              <EBanner t={t} tone="success" icon="check" body="預估金額未達審批門檻（NT$ 1,500），送出後可直接派車。" />
            </div>
          </ECard>
          <EBtn t={t} variant="primary" size="lg" block iconR="arrow">繼續確認</EBtn>
          <EBtn t={t} variant="ghost" block>取消</EBtn>
        </div>
      </div>
    </EntWebShell>
  );
}

// ── 3. Review — route /bookings/review ───────────────────────────────────────
function ENT_Review({ t, needsApproval = true }) {
  const u = ENT_USERS.delegate;
  return (
    <EntWebShell t={t} active="bookings" user={u} quota={ENT_QUOTA.label}>
      <EntPageHead t={t} back="返回修改" title="確認權責後送出"
        sub="送出即建立派車指令（command）· 請確認費用歸屬與審批影響" />
      <div style={{ marginBottom: 20 }}><EStepper t={t} steps={['填寫資訊', '確認權責', '送出']} active={1} /></div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.1fr', gap: 18, alignItems: 'start' }}>
        {/* VQ-3: cost ownership + approval posture lead */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <ECard t={t} accent={t.primary} title="費用歸屬與審批" sub="cost ownership · approval — 決策重點">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: t.primaryBg, border: '1px solid ' + t.primaryBd, borderRadius: 12, marginBottom: 14 }}>
              <span style={{ color: t.primary }}><EIcon name="building" size={22} /></span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>CC-PRD-07 · 產品部 · 客戶接待</div>
                <div style={{ fontSize: 12, color: t.muted, marginTop: 1 }}>費用將記入此成本中心 · 可用 NT$ 31,000 / 60,000</div>
              </div>
              <EPill t={t} tone="success" dot>有效</EPill>
            </div>
            <ERow t={t} k="預估車資" v="約 NT$ 1,180" mono />
            <ERow t={t} k="額度影響" v="本趟預扣 1 趟 · 本月 24 / 40" />
            <ERow t={t} k="審批需求" v={needsApproval
              ? <EPill t={t} tone="warn" dot>需主管審批</EPill>
              : <EPill t={t} tone="success" dot>免審批</EPill>} last />
            {needsApproval && (
              <div style={{ marginTop: 12 }}>
                <EBanner t={t} tone="warn" icon="shield" title="此預約需審批後才會派車"
                  body={<span>送出後將通知審批人 <b>高志遠（產品部主管）</b>。在核准前狀態為「待審批」，逾時未審可改期或取消。</span>} />
              </div>
            )}
          </ECard>

          <ECard t={t} title="乘客與下單人" sub="passenger vs booked by">
            <EntParty t={t} passenger="訪客 · Sato Kenji" bookedBy="周敏" self={false} />
            <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ background: t.surfaceLo, border: '1px solid ' + t.line, borderRadius: 10, padding: 12 }}>
                <div style={{ fontSize: 11, color: t.muted, marginBottom: 3 }}>現場聯絡</div>
                <div style={{ fontSize: 13, fontWeight: 600, fontFamily: t.mono }}>0912-880-114</div>
              </div>
              <div style={{ background: t.surfaceLo, border: '1px solid ' + t.line, borderRadius: 10, padding: 12 }}>
                <div style={{ fontSize: 11, color: t.muted, marginBottom: 3 }}>舉牌</div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Sato 様</div>
              </div>
            </div>
          </ECard>
        </div>

        {/* trip details */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <ECard t={t} title="行程明細" sub="trip">
            <EntRoute t={t} from="桃園機場 T1 · 入境大廳" to="君悅酒店 · 信義區松壽路 2 號"
              win="2026-06-13 15:20" airport={{ dir: '入境接機', flight: 'JL809', terminal: 'T1' }} />
            <div style={{ marginTop: 16 }}>
              <ERow t={t} k="車型" v="商務車 · Business" />
              <ERow t={t} k="行李" v="3 件" />
              <ERow t={t} k="備註" v="日本客戶接機 · 需舉牌" last />
            </div>
          </ECard>
          <ECard t={t} title="政策提醒" sub="policy">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', gap: 9, fontSize: 12.5, color: t.ink2, lineHeight: 1.5 }}><EIcon name="clock" size={15} style={{ color: t.muted, flexShrink: 0 }} />用車前 1 小時以上取消免計額度；1 小時內取消計 1 趟。</div>
              <div style={{ display: 'flex', gap: 9, fontSize: 12.5, color: t.ink2, lineHeight: 1.5 }}><EIcon name="info" size={15} style={{ color: t.muted, flexShrink: 0 }} />送出為派車指令，系統可能回覆「已受理、等待確認」，非即時完成。</div>
            </div>
          </ECard>
          <div style={{ display: 'flex', gap: 12 }}>
            <EBtn t={t} variant="default" block>返回修改</EBtn>
            <EBtn t={t} variant="primary" block icon="check">{needsApproval ? '送出並送審' : '確認送出'}</EBtn>
          </div>
        </div>
      </div>
    </EntWebShell>
  );
}

// ── 4. Submitted / accepted+pending — route /bookings/submitted ──────────────
function ENT_Submitted({ t, posture = 'approval' }) {
  const u = ENT_USERS.delegate;
  const P = {
    confirm:  { tone: 'primary', icon: 'refresh', title: '已收到您的預約', line: '正在確認派車…', en: 'confirming', body: '指令已受理，系統正在向派車服務確認。通常 1–2 分鐘內完成。' },
    approval: { tone: 'warn', icon: 'shield', title: '已送出 · 等待審批', line: '等待主管核准', en: 'awaiting_approval', body: '預約已建立並送交審批人 高志遠（產品部主管）。核准後才會開始派車。' },
    degraded: { tone: 'warn', icon: 'alert', title: '已受理 · 處理較慢', line: '正在重試外部服務…', en: 'retrying', body: '指令已安全受理，但下游派車服務目前較慢。系統會自動重試，恢復後通知您，無需重送。' },
  }[posture];
  return (
    <EntWebShell t={t} active="bookings" user={u} quota={ENT_QUOTA.label}>
      <div style={{ maxWidth: 620, margin: '10px auto' }}>
        <ECard t={t} accent={t[P.tone === 'warn' ? 'warn' : 'primary']}>
          <div style={{ textAlign: 'center', padding: '14px 8px 4px' }}>
            <div style={{ width: 66, height: 66, borderRadius: 33, margin: '0 auto 16px',
              background: P.tone === 'warn' ? t.warnBg : t.primaryBg, color: P.tone === 'warn' ? t.warn : t.primary,
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}><EIcon name={P.icon} size={30} /></div>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 6px' }}>{P.title}</h1>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
              <EPill t={t} tone={P.tone} dot>{P.line}<span style={{ fontFamily: t.mono, fontSize: 9.5, marginLeft: 4, opacity: 0.7 }}>{P.en}</span></EPill>
            </div>
            <p style={{ fontSize: 13.5, color: t.muted, lineHeight: 1.65, maxWidth: 440, margin: '10px auto 0' }}>{P.body}</p>
          </div>
          <div style={{ marginTop: 18, background: t.surfaceLo, border: '1px solid ' + t.line, borderRadius: 12, padding: '14px 16px' }}>
            <ERow t={t} k="預約編號" v="EB-7K2E1D" mono />
            <ERow t={t} k="乘客 / 下單人" v="Sato Kenji · 周敏 代訂" />
            <ERow t={t} k="成本中心" v="CC-PRD-07" mono />
            <ERow t={t} k="目前狀態" v={<EPill t={t} tone={P.tone} dot>{posture === 'approval' ? '待審批' : posture === 'degraded' ? '已受理' : '確認中'}</EPill>} last />
          </div>
          <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
            <EBtn t={t} variant="default" block icon="refresh">重新整理</EBtn>
            <EBtn t={t} variant="primary" block iconR="arrow">查看預約詳情</EBtn>
          </div>
          <div style={{ textAlign: 'center', marginTop: 12 }}>
            <EBtn t={t} variant="ghost" size="sm">返回首頁</EBtn>
          </div>
        </ECard>
      </div>
    </EntWebShell>
  );
}

Object.assign(window, { EntParty, EntRoute, ENT_Home, ENT_New, ENT_Review, ENT_Submitted });
