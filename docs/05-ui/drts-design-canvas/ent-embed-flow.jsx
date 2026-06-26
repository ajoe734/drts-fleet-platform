// ent-embed-flow.jsx — Enterprise Dispatch · S2 App-embed BOOKING FLOW (compact).
// VQ-1: same page composition as web, only chrome density differs. Single-column ~370px.
// Reuses ent-kit primitives + EntEmbedShell + EntParty/EntRoute/entStateMeta from web screens.

// compact section label
function EmTitle({ t, children, sub }) {
  return (
    <div style={{ padding: '14px 16px 8px' }}>
      <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: -0.3 }}>{children}</div>
      {sub && <div style={{ fontSize: 12, color: t.muted, marginTop: 3, lineHeight: 1.45 }}>{sub}</div>}
    </div>
  );
}

// ── E1. embed Home / workspace ───────────────────────────────────────────────
function ENT_EmbedHome({ t }) {
  const active = ENT_BOOKINGS[1];
  const upcoming = ENT_BOOKINGS.filter(b => ['assigned', 'approval'].includes(b.state)).slice(0, 2);
  return (
    <EntEmbedShell t={t} title="企業派車" badgeTone="live"
      footer={<EBtn t={t} variant="primary" block icon="plus">建立預約</EBtn>}>
      <div style={{ padding: '4px 16px 16px', display: 'flex', flexDirection: 'column', gap: 13 }}>
        <div style={{ padding: '10px 0 2px' }}>
          <div style={{ fontSize: 12, color: t.muted }}>{ENT_TENANT.name} · 產品部</div>
          <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: -0.4, marginTop: 3 }}>嗨，冠廷，要去哪裡？</div>
        </div>

        {/* quota strip */}
        <div style={{ display: 'flex', gap: 9 }}>
          <div style={{ flex: 1, background: t.surface, border: '1px solid ' + t.line, borderRadius: 12, padding: '11px 13px' }}>
            <div style={{ fontSize: 10.5, color: t.muted }}>本月額度</div>
            <div style={{ fontSize: 18, fontWeight: 800, fontFamily: t.mono, color: t.ink, marginTop: 2 }}>23<span style={{ fontSize: 11, color: t.muted, fontWeight: 500 }}> / 40</span></div>
          </div>
          <div style={{ flex: 1, background: t.surface, border: '1px solid ' + t.line, borderRadius: 12, padding: '11px 13px' }}>
            <div style={{ fontSize: 10.5, color: t.muted }}>待審批</div>
            <div style={{ fontSize: 18, fontWeight: 800, fontFamily: t.mono, color: t.warn, marginTop: 2 }}>1<span style={{ fontSize: 11, color: t.muted, fontWeight: 500 }}> 件</span></div>
          </div>
        </div>

        {/* active trip mini */}
        {active && (
          <ECard t={t} pad={14} accent={t.primary}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <EPill t={t} tone={entStateMeta(active.state).tone} dot>{entStateMeta(active.state).zh}</EPill>
              <span style={{ fontSize: 11, color: t.muted }}>進行中行程</span>
            </div>
            <EntParty t={t} passenger={active.passenger} bookedBy={active.bookedBy} self={active.self} compact />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 11, padding: '9px 11px', background: t.primaryBg, borderRadius: 10 }}>
              <span style={{ fontSize: 22, fontWeight: 800, fontFamily: t.mono, color: t.primary }}>9</span>
              <span style={{ fontSize: 12, color: t.ink2 }}>分鐘後司機抵達上車點</span>
              <span style={{ marginLeft: 'auto', color: t.primary }}><EIcon name="chevR" size={16} /></span>
            </div>
          </ECard>
        )}

        {/* quick actions */}
        <div style={{ display: 'flex', gap: 9 }}>
          <EBtn t={t} variant="default" block icon="user">為自己</EBtn>
          <EBtn t={t} variant="default" block icon="users">代訂</EBtn>
          <EBtn t={t} variant="default" block icon="flag">機場</EBtn>
        </div>

        {/* upcoming */}
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: t.ink2, margin: '4px 2px 8px' }}>即將到來</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {upcoming.map(b => (
              <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 13px', background: t.surface, border: '1px solid ' + t.line, borderRadius: 12 }}>
                <EAvatar t={t} name={b.passenger} size={34} tone={b.self ? 'primary' : 'neutral'} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.passenger}</div>
                  <div style={{ fontSize: 11, color: t.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.from} → {b.to}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 11, fontFamily: t.mono, color: t.ink2 }}>{b.win.split(' ')[1]}</div>
                  <div style={{ marginTop: 3 }}><EPill t={t} tone={entStateMeta(b.state).tone} dot>{entStateMeta(b.state).zh}</EPill></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </EntEmbedShell>
  );
}

// ── E2. embed New booking (compact form) ─────────────────────────────────────
function ENT_EmbedBook({ t }) {
  return (
    <EntEmbedShell t={t} title="建立預約" badgeTone="live"
      footer={<><EBtn t={t} variant="primary" block iconR="arrow">繼續確認</EBtn></>}>
      <div style={{ padding: '4px 16px 16px', display: 'flex', flexDirection: 'column', gap: 13 }}>
        <div style={{ marginTop: 12 }}><EStepper t={t} steps={['資訊', '權責', '送出']} active={0} /></div>

        <ECard t={t} pad={14} title="乘客">
          <ESeg t={t} full value="other" options={[{ value: 'self', label: '為自己', icon: 'user' }, { value: 'other', label: '代訂', icon: 'users' }]} />
          <div style={{ height: 11 }} />
          <EField t={t} label="乘客" req><EInput t={t} icon="search" value="訪客 · Sato Kenji" /></EField>
        </ECard>

        <ECard t={t} pad={14} title="行程">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            <EField t={t} label="上車" req><EInput t={t} icon="pin" value="桃園機場 T1 · 入境" /></EField>
            <EField t={t} label="下車" req><EInput t={t} icon="pin" value="君悅酒店 · 松壽路 2 號" /></EField>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11 }}>
              <EField t={t} label="日期" req><EInput t={t} icon="cal" value="06-13" mono /></EField>
              <EField t={t} label="時間" req><EInput t={t} icon="clock" value="15:20" mono /></EField>
            </div>
          </div>
        </ECard>

        <ECard t={t} pad={14} title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>機場資訊 <EPill t={t} tone="neutral">選填</EPill></span>}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11 }}>
            <EField t={t} label="航班"><EInput t={t} icon="flag" value="JL809" mono /></EField>
            <EField t={t} label="航廈"><EInput t={t} value="T1" /></EField>
          </div>
        </ECard>

        <ECard t={t} pad={14} title="權責與聯絡">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            <EField t={t} label="成本中心" req hint="企業用車主要欄位"><EInput t={t} icon="building" value="CC-PRD-07 · 客戶接待" /></EField>
            <EField t={t} label="現場聯絡" req><EInput t={t} icon="phone" value="0912-880-114" mono /></EField>
            <EField t={t} label="車型"><ESeg t={t} full value="business" options={ENT_VEHICLES.map(v => ({ value: v.id, label: v.name }))} /></EField>
          </div>
        </ECard>

        <EBanner t={t} tone="success" icon="check" body="預估 NT$ 1,180 · 未達審批門檻，送出後可直接派車。" />
      </div>
    </EntEmbedShell>
  );
}

// ── E3. embed Review (compact, cost/approval lead) ───────────────────────────
function ENT_EmbedReview({ t, needsApproval = true }) {
  return (
    <EntEmbedShell t={t} title="確認權責" badgeTone="live"
      footer={<><EBtn t={t} variant="primary" block icon="check">{needsApproval ? '送出並送審' : '確認送出'}</EBtn><EBtn t={t} variant="ghost" block size="sm">返回修改</EBtn></>}>
      <div style={{ padding: '4px 16px 16px', display: 'flex', flexDirection: 'column', gap: 13 }}>
        <div style={{ marginTop: 12 }}><EStepper t={t} steps={['資訊', '權責', '送出']} active={1} /></div>

        {/* cost + approval lead (VQ-3) */}
        <ECard t={t} pad={14} accent={t.primary} title="費用歸屬與審批">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: t.primaryBg, border: '1px solid ' + t.primaryBd, borderRadius: 10, marginBottom: 11 }}>
            <span style={{ color: t.primary }}><EIcon name="building" size={19} /></span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>CC-PRD-07</div>
              <div style={{ fontSize: 11, color: t.muted }}>產品部 · 客戶接待</div>
            </div>
            <EPill t={t} tone="success" dot>有效</EPill>
          </div>
          <ERow t={t} k="預估車資" v="約 NT$ 1,180" mono />
          <ERow t={t} k="額度影響" v="預扣 1 趟 · 24/40" />
          <ERow t={t} k="審批" v={needsApproval ? <EPill t={t} tone="warn" dot>需主管審批</EPill> : <EPill t={t} tone="success" dot>免審批</EPill>} last />
          {needsApproval && <div style={{ marginTop: 11 }}><EBanner t={t} tone="warn" icon="shield" body={<span>送出後通知審批人 <b>高志遠</b>（產品部主管），核准後才派車。</span>} /></div>}
        </ECard>

        <ECard t={t} pad={14} title="乘客與下單人">
          <EntParty t={t} passenger="訪客 · Sato Kenji" bookedBy="周敏" self={false} compact />
        </ECard>

        <ECard t={t} pad={14} title="行程">
          <EntRoute t={t} from="桃園機場 T1 · 入境" to="君悅酒店 · 松壽路 2 號" win="06-13 15:20" airport={{ dir: '入境接機', flight: 'JL809', terminal: 'T1' }} />
        </ECard>
      </div>
    </EntEmbedShell>
  );
}

// ── E4. embed Submitted (accepted+pending) ───────────────────────────────────
function ENT_EmbedSubmitted({ t, posture = 'approval' }) {
  const P = {
    approval: { tone: 'warn', icon: 'shield', title: '已送出 · 等待審批', line: '等待主管核准', en: 'awaiting_approval', body: '預約已建立並送交審批人 高志遠。核准後才會開始派車。' },
    degraded: { tone: 'warn', icon: 'alert', title: '已受理 · 處理較慢', line: '正在重試…', en: 'retrying', body: '指令已安全受理，下游較慢。系統會自動重試，無需重送。' },
  }[posture];
  return (
    <EntEmbedShell t={t} title="預約狀態" badgeTone="warn"
      footer={<><EBtn t={t} variant="primary" block iconR="arrow">查看預約詳情</EBtn><EBtn t={t} variant="ghost" block size="sm" icon="refresh">重新整理</EBtn></>}>
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ textAlign: 'center', padding: '14px 6px 0' }}>
          <div style={{ width: 62, height: 62, borderRadius: 31, margin: '0 auto 14px', background: t.warnBg, color: t.warn, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><EIcon name={P.icon} size={28} /></div>
          <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 8 }}>{P.title}</div>
          <EPill t={t} tone={P.tone} dot>{P.line}<span style={{ fontFamily: t.mono, fontSize: 9.5, marginLeft: 4, opacity: 0.7 }}>{P.en}</span></EPill>
          <p style={{ fontSize: 13, color: t.muted, lineHeight: 1.6, margin: '12px 0 0' }}>{P.body}</p>
        </div>
        <div style={{ background: t.surface, border: '1px solid ' + t.line, borderRadius: 12, padding: '4px 14px' }}>
          <ERow t={t} k="預約編號" v="EB-7K2E1D" mono />
          <ERow t={t} k="乘客 / 下單" v="Sato Kenji · 周敏 代訂" />
          <ERow t={t} k="成本中心" v="CC-PRD-07" mono />
          <ERow t={t} k="狀態" v={<EPill t={t} tone="warn" dot>待審批</EPill>} last />
        </div>
      </div>
    </EntEmbedShell>
  );
}

// ── E5. embed Active trip ────────────────────────────────────────────────────
function ENT_EmbedTrip({ t }) {
  const b = ENT_BOOKINGS[1];
  const stages = [
    { t: '已派車', done: true }, { t: '前往上車點', done: false, cur: true }, { t: '抵達上車', done: false }, { t: '行程中', done: false }, { t: '完成', done: false },
  ];
  return (
    <EntEmbedShell t={t} title="目前行程" badgeTone="live"
      footer={<><EBtn t={t} variant="default" block icon="phone">聯絡司機</EBtn><EBtn t={t} variant="primary" block iconR="arrow">預約詳情</EBtn></>}>
      <div style={{ padding: '4px 16px 16px', display: 'flex', flexDirection: 'column', gap: 13 }}>
        {/* driver + ETA */}
        <ECard t={t} pad={14} accent={t.primary}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <EAvatar t={t} name="張" size={46} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14.5, fontWeight: 700 }}>張家豪 · 4.9 ★</div>
              <div style={{ fontSize: 11.5, color: t.muted, fontFamily: t.mono }}>Alphard · ARJ-7720</div>
            </div>
            <div style={{ textAlign: 'center', background: t.primaryBg, borderRadius: 11, padding: '8px 14px' }}>
              <div style={{ fontSize: 26, fontWeight: 800, fontFamily: t.mono, color: t.primary, lineHeight: 1 }}>9</div>
              <div style={{ fontSize: 10, color: t.muted, marginTop: 2 }}>分鐘</div>
            </div>
          </div>
        </ECard>

        {/* vertical progress */}
        <ECard t={t} pad={14} title="行程進度">
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {stages.map((s, i, a) => (
              <div key={i} style={{ display: 'flex', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{ width: s.cur ? 14 : 11, height: s.cur ? 14 : 11, borderRadius: 7, marginTop: 3,
                    background: s.done ? t.primary : s.cur ? t.primary : t.line,
                    boxShadow: s.cur ? '0 0 0 3px ' + t.primaryBg : 'none' }} />
                  {i < a.length - 1 && <span style={{ flex: 1, width: 2, background: s.done ? t.primary : t.line, margin: '3px 0', minHeight: 18 }} />}
                </div>
                <div style={{ paddingBottom: i < a.length - 1 ? 12 : 0 }}>
                  <span style={{ fontSize: 13.5, fontWeight: s.cur ? 700 : 500, color: s.cur ? t.ink : s.done ? t.ink2 : t.muted }}>{s.t}</span>
                  {s.cur && <div style={{ fontSize: 11.5, color: t.muted, marginTop: 1 }}>預計入境後 12 分鐘抵達</div>}
                </div>
              </div>
            ))}
          </div>
        </ECard>

        <ECard t={t} pad={14} title="行程">
          <EntRoute t={t} from={b.from} to={b.to} win={b.win} airport={b.airport} />
        </ECard>
        <div style={{ fontSize: 11, color: t.faint, textAlign: 'center', lineHeight: 1.5 }}>ETA 為系統估計，可能因路況變動 · 此通道不負責改派</div>
      </div>
    </EntEmbedShell>
  );
}

// ── E6. embed Booking detail ─────────────────────────────────────────────────
function ENT_EmbedDetail({ t }) {
  const b = ENT_BOOKINGS[1];
  return (
    <EntEmbedShell t={t} title={b.id} badgeTone="live"
      footer={<><EBtn t={t} variant="default" block icon="edit">修改</EBtn><EBtn t={t} variant="danger" block icon="ban">取消預約</EBtn></>}>
      <div style={{ padding: '4px 16px 16px', display: 'flex', flexDirection: 'column', gap: 13 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 2px 4px' }}>
          <span style={{ fontSize: 17, fontWeight: 800 }}>{b.id}</span>
          <EPill t={t} tone={entStateMeta(b.state).tone} dot>{entStateMeta(b.state).zh}</EPill>
        </div>

        <ECard t={t} pad={14} title="乘客">
          <EntParty t={t} passenger={b.passenger} bookedBy={b.bookedBy} self={b.self} compact />
        </ECard>

        <ECard t={t} pad={14} title="處理時間軸">
          <ETimeline t={t} events={[
            { at: '14:48', tone: 'primary', t: '建立預約', body: '周敏 代訂' },
            { at: '14:48', tone: 'success', t: '審批通過', body: '高志遠 核准' },
            { at: '14:52', tone: 'success', t: '已派車', body: '商務車 · 張家豪' },
            { tone: 'info', t: '司機前往上車點', current: true },
          ]} />
        </ECard>

        <ECard t={t} pad={14} title="費用與權責">
          <ERow t={t} k="成本中心" v={b.cc + ' · 客戶接待'} mono />
          <ERow t={t} k="預估車資" v="約 NT$ 1,180" mono />
          <ERow t={t} k="額度影響" v="預扣 1 趟" />
          <ERow t={t} k="審批" v={<EPill t={t} tone="success" dot>已核准</EPill>} last />
        </ECard>

        <div style={{ fontSize: 11, color: t.faint, textAlign: 'center', lineHeight: 1.5 }}>操作可用性以後端 availableActions 為準</div>
      </div>
    </EntEmbedShell>
  );
}

Object.assign(window, {
  EmTitle, ENT_EmbedHome, ENT_EmbedBook, ENT_EmbedReview, ENT_EmbedSubmitted, ENT_EmbedTrip, ENT_EmbedDetail,
});
