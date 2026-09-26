// ent-screens-2.jsx — Enterprise Dispatch (2/3): Detail · History · Trip · Receipt · Help.
// VQ-4: active trip = transport-style progress rail. Detail authority = backend availableActions.

// transport progress rail (VQ-4)
function EntProgressRail({ t, stages, active }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start' }}>
      {stages.map((s, i) => {
        const done = i < active, on = i === active;
        const c = done || on ? t.primary : t.line;
        return (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
            {i < stages.length - 1 && <span style={{ position: 'absolute', top: 13, left: '50%', right: '-50%', height: 3, background: done ? t.primary : t.line }} />}
            <span style={{ width: 28, height: 28, borderRadius: 14, zIndex: 1, background: done ? t.primary : on ? t.surface : t.surfaceLo,
              border: '2.5px solid ' + c, color: done ? '#fff' : on ? t.primary : t.faint,
              display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: on ? '0 0 0 4px ' + t.primaryBg : 'none' }}>
              {done ? <EIcon name="check" size={14} stroke={3} /> : <EIcon name={s.icon} size={14} />}</span>
            <span style={{ fontSize: 11, fontWeight: on ? 700 : 500, color: on ? t.ink : t.muted, marginTop: 8, textAlign: 'center', lineHeight: 1.3 }}>{s.t}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── 5. Booking detail — route /bookings/[id] ─────────────────────────────────
function ENT_Detail({ t, variant = 'assigned' }) {
  const u = ENT_USERS.delegate;
  const b = ENT_BOOKINGS[1]; // enroute, delegate-booked, airport
  const av = {
    assigned:  { canCancel: true, canEdit: true, canReceipt: false },
    readonly:  { canCancel: false, canEdit: false, canReceipt: false },
    completed: { canCancel: false, canEdit: false, canReceipt: true },
  }[variant];
  return (
    <EntWebShell t={t} active="bookings" user={u} quota={ENT_QUOTA.label}>
      <EntPageHead t={t} back="我的預約"
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 11 }}>{b.id} · 企業派車<EPill t={t} tone={entStateMeta(b.state).tone} dot>{entStateMeta(b.state).zh}</EPill></span>}
        sub={b.from + ' → ' + b.to + ' · ' + b.win}
        meta={<><EPill t={t} tone="neutral">{b.passenger} 乘車</EPill><EPill t={t} tone="warn">{b.bookedBy} 代訂</EPill><EPill t={t} tone="neutral">{b.cc}</EPill></>}
        actions={<>
          {av.canEdit && <EBtn t={t} variant="default" icon="edit">修改</EBtn>}
          {av.canCancel && <EBtn t={t} variant="danger" icon="ban">取消預約</EBtn>}
          {av.canReceipt && <EBtn t={t} variant="primary" icon="receipt">取得收據</EBtn>}
        </>} />

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 18, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <ECard t={t} title="處理時間軸" sub="timeline · cross-actor">
            <ETimeline t={t} events={[
              { at: '06-13 14:48', tone: 'primary', t: '建立預約', body: '由 周敏（行政祕書）代訂 · 乘客 Sato Kenji' },
              { at: '06-13 14:48', tone: 'success', t: '審批通過', body: '高志遠（產品部主管）核准 · 客戶接待用車' },
              { at: '06-13 14:50', tone: 'success', t: '指令受理 accepted', body: 'POST /bookings/commands/create · accepted+confirmed' },
              { at: '06-13 14:52', tone: 'success', t: '已派車', body: '指派 商務車 · 司機 張家豪 · ARJ-7720' },
              { tone: 'info', t: '司機前往上車點', body: '預計入境後 12 分鐘抵達', current: true },
            ]} />
          </ECard>
          <ECard t={t} title="行程資訊" sub="trip · airport">
            <EntRoute t={t} from={b.from} to={b.to} win={b.win} airport={b.airport} />
            <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
              <ERow t={t} k="方向" v={b.airport.dir} />
              <ERow t={t} k="航班 / 航廈" v={b.airport.flight + ' · ' + b.airport.terminal} mono />
              <ERow t={t} k="行李" v={b.airport.luggage} />
              <ERow t={t} k="舉牌" v="Sato 様" />
              <ERow t={t} k="車型" v={b.vehicle} last />
              <ERow t={t} k="現場聯絡" v="0912-880-114" mono last />
            </div>
          </ECard>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <ECard t={t} title="司機 / 車輛" sub="assigned">
            <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
              <EAvatar t={t} name="張" size={48} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>張家豪 · 4.9 ★</div>
                <div style={{ fontSize: 12, color: t.muted, fontFamily: t.mono }}>Toyota Alphard · ARJ-7720</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 26, fontWeight: 800, fontFamily: t.mono, color: t.primary }}>9</div>
                <div style={{ fontSize: 10.5, color: t.muted }}>分鐘 · 估計</div>
              </div>
            </div>
            <div style={{ marginTop: 14, display: 'flex', gap: 9 }}>
              <EBtn t={t} variant="default" block icon="phone">聯絡司機</EBtn>
              <EBtn t={t} variant="default" block icon="route">追蹤行程</EBtn>
            </div>
          </ECard>
          <ECard t={t} title="費用與權責" sub="cost · approval">
            <ERow t={t} k="成本中心" v={b.cc + ' · 客戶接待'} />
            <ERow t={t} k="預估車資" v="約 NT$ 1,180" mono />
            <ERow t={t} k="額度影響" v="預扣 1 趟" />
            <ERow t={t} k="審批" v={<EPill t={t} tone="success" dot>已核准</EPill>} last />
          </ECard>
          <ECard t={t} title="可用操作" sub="availableActions（後端授權）">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <EBtn t={t} variant="default" block icon="edit" disabled={!av.canEdit}>修改預約 {av.canEdit ? '' : '· 不可用'}</EBtn>
              <EBtn t={t} variant="danger" block icon="ban" disabled={!av.canCancel}>取消預約 {av.canCancel ? '' : '· 不可用'}</EBtn>
              <EBtn t={t} variant="default" block icon="receipt" disabled={!av.canReceipt}>取得收據 {av.canReceipt ? '' : '· 尚未完成'}</EBtn>
            </div>
            <div style={{ fontSize: 11, color: t.faint, marginTop: 11, lineHeight: 1.5 }}>操作可用性以後端 availableActions 為準，不以狀態文字推導權限。</div>
          </ECard>
        </div>
      </div>
    </EntWebShell>
  );
}

// ── 6. History / list — route /bookings ──────────────────────────────────────
function ENT_History({ t }) {
  const u = ENT_USERS.delegate;
  return (
    <EntWebShell t={t} active="bookings" user={u} quota={ENT_QUOTA.label}>
      <EntPageHead t={t} title="我的預約"
        sub="前台歷史檢視 · 非派遣看板"
        actions={<EBtn t={t} variant="primary" icon="plus">建立預約</EBtn>} />
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <ESeg t={t} value="all" options={[{ value: 'all', label: '全部' }, { value: 'mine', label: '我預約的' }, { value: 'byme', label: '我代訂的' }]} />
        <div style={{ flex: 1 }} />
        <EInput t={t} icon="search" value="" placeholder="搜尋乘客 / 編號" />
        <EBtn t={t} variant="default" icon="cal" size="sm">06/01 – 06/14</EBtn>
      </div>
      <ECard t={t} pad={0}>
        {/* header row */}
        <div style={{ display: 'grid', gridTemplateColumns: '110px 1.1fr 1.5fr 110px 130px 110px', gap: 12, padding: '11px 18px',
          borderBottom: '1px solid ' + t.line, background: t.surfaceLo, fontSize: 11, fontWeight: 700, color: t.muted, letterSpacing: 0.3 }}>
          <span>編號</span><span>乘客 / 下單</span><span>行程</span><span>時間</span><span>成本中心</span><span>狀態</span>
        </div>
        {ENT_BOOKINGS.map((b, i) => (
          <div key={b.id} style={{ display: 'grid', gridTemplateColumns: '110px 1.1fr 1.5fr 110px 130px 110px', gap: 12, padding: '13px 18px',
            borderTop: i ? '1px solid ' + t.lineSoft : 'none', alignItems: 'center' }}>
            <span style={{ fontFamily: t.mono, fontSize: 12, color: t.primary, fontWeight: 600 }}>{b.id}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.passenger}</div>
              <div style={{ fontSize: 11, color: b.self ? t.muted : t.warn }}>{b.self ? '本人' : b.bookedBy + ' 代訂'}</div>
            </div>
            <div style={{ fontSize: 12, color: t.ink2, minWidth: 0 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {b.from} <EIcon name="arrow" size={11} style={{ color: t.faint, flexShrink: 0 }} /> {b.to}
                {b.airport && <EIcon name="flag" size={12} style={{ color: t.info, flexShrink: 0 }} />}</span>
            </div>
            <span style={{ fontSize: 12, fontFamily: t.mono, color: t.ink2 }}>{b.win}</span>
            <span style={{ fontSize: 11.5, fontFamily: t.mono, color: t.muted }}>{b.cc}</span>
            <EPill t={t} tone={entStateMeta(b.state).tone} dot>{entStateMeta(b.state).zh}</EPill>
          </div>
        ))}
      </ECard>
    </EntWebShell>
  );
}

// ── 7. Active trip — route /trip ─────────────────────────────────────────────
function ENT_Trip({ t }) {
  const u = ENT_USERS.requester;
  const b = ENT_BOOKINGS[1];
  return (
    <EntWebShell t={t} active="trip" user={u} quota={ENT_QUOTA.label}>
      <EntPageHead t={t} title="目前行程" sub="最快回到目前用車狀態 · ETA 為估計值" />
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <ECard t={t} accent={t.primary}>
          {/* VQ-4 progress rail */}
          <div style={{ padding: '6px 6px 4px' }}>
            <EntProgressRail t={t} active={2} stages={[
              { t: '已派車', icon: 'car' }, { t: '前往上車', icon: 'route' }, { t: '抵達上車', icon: 'pin' }, { t: '行程中', icon: 'bolt' }, { t: '完成', icon: 'check' }]} />
          </div>
          <div style={{ height: 1, background: t.lineSoft, margin: '22px 0 18px' }} />
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 13, flex: 1, minWidth: 220 }}>
              <EAvatar t={t} name="張" size={50} />
              <div>
                <div style={{ fontSize: 15.5, fontWeight: 700 }}>張家豪 · 4.9 ★</div>
                <div style={{ fontSize: 12, color: t.muted, fontFamily: t.mono }}>Toyota Alphard · ARJ-7720</div>
                <div style={{ marginTop: 5 }}><EPill t={t} tone="info" dot>前往上車點</EPill></div>
              </div>
            </div>
            <div style={{ textAlign: 'center', background: t.primaryBg, border: '1px solid ' + t.primaryBd, borderRadius: 14, padding: '12px 22px' }}>
              <div style={{ fontSize: 36, fontWeight: 800, fontFamily: t.mono, color: t.primary, lineHeight: 1 }}>9</div>
              <div style={{ fontSize: 11, color: t.muted, marginTop: 4 }}>分鐘 · 估計抵達</div>
            </div>
          </div>
          <div style={{ marginTop: 18 }}>
            <EntRoute t={t} from={b.from} to={b.to} win={b.win} airport={b.airport} />
          </div>
          <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
            <EBtn t={t} variant="default" block icon="phone">聯絡司機</EBtn>
            <EBtn t={t} variant="default" block icon="brief">企業客服</EBtn>
            <EBtn t={t} variant="primary" block iconR="arrow">預約詳情</EBtn>
          </div>
          <div style={{ fontSize: 11, color: t.faint, marginTop: 12, textAlign: 'center' }}>抵達時間為系統估計，可能因路況變動 · 此通道不負責改派</div>
        </ECard>
      </div>
    </EntWebShell>
  );
}

// ── 8. Receipt / outcome — route /receipts/[id] ──────────────────────────────
function ENT_Receipt({ t, variant = 'ready' }) {
  const u = ENT_USERS.delegate;
  const b = ENT_BOOKINGS[4]; // completed
  return (
    <EntWebShell t={t} active="bookings" user={u} quota={ENT_QUOTA.label}>
      <EntPageHead t={t} back={'預約 ' + b.id} title="行程收據"
        sub="完成行程的報帳憑證 · 依通道權限提供" />
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        {variant === 'unsupported' ? (
          <ECard t={t}>
            <EEmpty t={t} icon="receipt" title="此通道不提供收據下載"
              body="本次用車的收據由企業財務系統統一開立，請至內部報帳系統取得，或聯絡行政人員。"
              action={<EBtn t={t} variant="default" iconR="ext">前往報帳系統</EBtn>} />
          </ECard>
        ) : (
          <ECard t={t} accent={t.success}>
            <div style={{ textAlign: 'center', padding: '8px 0 6px' }}>
              <div style={{ width: 60, height: 60, borderRadius: 30, margin: '0 auto 14px', background: t.successBg, color: t.success, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><EIcon name="check" size={28} stroke={2.4} /></div>
              <h2 style={{ fontSize: 19, fontWeight: 800, margin: '0 0 4px' }}>行程已完成</h2>
              <div style={{ fontSize: 12.5, color: t.muted, fontFamily: t.mono }}>{b.id} · {b.order}</div>
            </div>
            <div style={{ marginTop: 16, background: t.surfaceLo, border: '1px solid ' + t.line, borderRadius: 12, padding: '4px 16px' }}>
              <ERow t={t} k="乘客 / 下單人" v={b.passenger + ' · ' + b.bookedBy + ' 代訂'} />
              <ERow t={t} k="行程" v={b.from + ' → ' + b.to} />
              <ERow t={t} k="時間" v={b.win} mono />
              <ERow t={t} k="車型" v={b.vehicle} />
              <ERow t={t} k="成本中心" v={b.cc + ' · 客戶接待'} mono />
              <ERow t={t} k="車資" v={b.fare} strong last />
            </div>
            <EBanner t={t} tone="info" icon="building"
              style={{ marginTop: 14 }}
              body="此收據可作為企業報帳憑證 · 費用已記入成本中心 CC-PRD-07，將於月結對帳單合併呈現。" />
            <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
              <EBtn t={t} variant="default" block iconR="arrow">返回歷史</EBtn>
              <EBtn t={t} variant="primary" block icon="download">下載收據 PDF</EBtn>
            </div>
          </ECard>
        )}
      </div>
    </EntWebShell>
  );
}

// ── 9. Help / support — route /help ──────────────────────────────────────────
function ENT_Help({ t }) {
  const u = ENT_USERS.requester;
  const faqs = [
    ['用車需要審批嗎？', '單趟預估金額超過 NT$ 1,500，或使用「客戶接待」類成本中心時，需部門主管審批；其餘多數情況可直接派車。'],
    ['成本中心填錯怎麼辦？', '派車前可在「預約詳情 → 修改」更換有效成本中心；若已完成，請聯絡行政協助於報帳階段更正。'],
    ['臨時要取消會計入額度嗎？', '用車前 1 小時以上取消不計額度；1 小時內取消視為使用 1 趟。可於預約詳情自助取消。'],
    ['可以幫主管或訪客叫車嗎？', '可以。在建立預約時選「為他人代訂」，乘客與下單人會分開記錄，現場聯絡與舉牌資訊也可填寫。'],
    ['送出後顯示「等待確認」是正常的嗎？', '是。派車為指令式流程，系統可能先回覆「已受理」，再於確認或審批完成後更新狀態，無需重複送出。'],
  ];
  return (
    <EntWebShell t={t} active="help" user={u} quota={ENT_QUOTA.label}>
      <EntPageHead t={t} title="說明與支援" sub="企業用車政策 · 常見問題 · 客服" />
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 18, alignItems: 'start' }}>
        <ECard t={t} title="常見問題" sub="FAQ" pad={0}>
          <div>
            {faqs.map((f, i) => (
              <div key={i} style={{ padding: '16px 18px', borderTop: i ? '1px solid ' + t.lineSoft : 'none' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <EIcon name="info" size={16} style={{ color: t.primary, flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 5 }}>{f[0]}</div>
                    <div style={{ fontSize: 12.5, color: t.muted, lineHeight: 1.65 }}>{f[1]}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ECard>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <ECard t={t} title="聯絡客服">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <span style={{ width: 38, height: 38, borderRadius: 10, background: t.primaryBg, color: t.primary, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><EIcon name="phone" size={18} /></span>
                <div><div style={{ fontSize: 14, fontWeight: 700, fontFamily: t.mono }}>0800-200-118</div><div style={{ fontSize: 11.5, color: t.muted }}>企業專線 · 24 小時</div></div>
              </div>
              <EBtn t={t} variant="primary" block icon="phone">撥打客服</EBtn>
              <EBtn t={t} variant="default" block icon="brief">線上客服</EBtn>
            </div>
          </ECard>
          <ECard t={t} title="政策摘要">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[['shield', '審批門檻 NT$ 1,500'], ['building', '成本中心為必填'], ['clock', '取消窗口 1 小時'], ['bolt', '月額度 40 趟 / 部門']].map((r, i) => (
                <div key={i} style={{ display: 'flex', gap: 9, fontSize: 12.5, color: t.ink2 }}><EIcon name={r[0]} size={15} style={{ color: t.muted, flexShrink: 0 }} />{r[1]}</div>
              ))}
            </div>
          </ECard>
          <EBanner t={t} tone="warn" icon="alert" title="服務異常時" body="若派車服務暫時不穩定，您仍可建立預約，系統會在恢復後自動確認；緊急用車請改撥客服專線。" />
        </div>
      </div>
    </EntWebShell>
  );
}

Object.assign(window, { EntProgressRail, ENT_Detail, ENT_History, ENT_Trip, ENT_Receipt, ENT_Help });
