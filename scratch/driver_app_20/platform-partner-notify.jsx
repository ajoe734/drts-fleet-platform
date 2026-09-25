// platform-partner-notify.jsx — D · 夥伴詳情頁「通知」分頁 (partner-notification-screen-requirements-20260923).
// 對齊正式契約 (packages/contracts partner-passenger-notification.ts · binding controller/service · SA/SD §7):
//   · 綁定引用既有 webhookId（不在此頁管理端點/密鑰/逾時）· PUT = webhookId + eventTypes + expectedVersion
//   · 狀態 ready / test_pending / disabled；啟用門檻＝目前端點 fingerprint 的成功測試
//   · 5 個內部事件 → 對外 passenger.*.v1 映射
//   · 送達語意：200/201/202 皆須通過 ack 驗證；通過僅代表「夥伴端已接受，裝置未知」，不憑 HTTP code 判裝置接收
//   · 受控重試：多種拒絕/停用理由 + 受理重新入列 + 重複點擊 + 失敗復原（requeued/superseded/expired/exhausted 為 view model，非 outbox enum）
//   · 403 = entry scope 越界，getBinding 亦被拒，不畫成可唯讀
const PN_BIND = { ready:['就緒','success'], test_pending:['待測試','warn'], disabled:['已停用','neutral'] };
const PN_EVENTS = [
  ['assignment_disclosure_ready','passenger.assignment_disclosure_ready.v1','派車揭露就緒'],
  ['assignment_replaced','passenger.assignment_replaced.v1','派車已更換'],
  ['eta_changed','passenger.eta_changed.v1','ETA 變更'],
  ['driver_arrived','passenger.driver_arrived.v1','駕駛已抵達'],
  ['receipt_ready','passenger.receipt_ready.v1','收據就緒'],
];
function PnShell({ theme:th, children, actions }) {
  const p = FX_PARTNERS[0];
  return (
    <Shell theme={th} nav={PA_NAV} active="partners" breadcrumb={['合作夥伴', p.bank, p.program, '通知']} env="production" actor={PA_ACTOR} health={PA_HEALTH} refreshTier="medium" dataFreshness="fresh">
      <PageHeader theme={th}
        title={<span style={{ display:'inline-flex', alignItems:'center', gap:10 }}>{p.bank} · {p.program}<Pill theme={th} tone="success" dot>active</Pill></span>}
        subtitle={`/${p.slug} · partner_id ${p.id}`}
        tabs={[{id:'overview',label:'Overview'},{id:'branding',label:'Branding'},{id:'auth',label:'Auth'},{id:'eligibility',label:'Eligibility'},{id:'creds',label:'Credentials'},{id:'notify',label:'通知 · Notifications',badge:'2',tone:'warn'},{id:'audit',label:'Audit'}]}
        activeTab="notify" actions={actions}/>
      {children}
    </Shell>
  );
}
// test 結果：passed_current（目前 fingerprint 成功）/ passed_stale（端點已變，需重測）/ failed / none
function PnBinding({ theme:th, state='ready', test='passed_current' }) {
  const m = PN_BIND[state];
  const TEST = { passed_current:['測試通過 · 目前端點','success'], passed_stale:['測試已失效 · 端點 fingerprint 已變','warn'], failed:['測試失敗','danger'], none:['尚未測試','neutral'] };
  return (
    <Card theme={th} title="通知綁定 · Notification Binding" subtitle="引用既有 webhook · 端點/密鑰於既有 /webhooks 管理（依權限顯示）" actions={<Pill theme={th} tone={m[1]} dot>{m[0]}<span style={{ marginLeft:4, opacity:.6, fontFamily:SHELL_MONO, fontSize:9 }}>{state}</span></Pill>}>
      <DL theme={th} cols={2} items={[
        { k:'webhookId', v:<span style={{ fontFamily:SHELL_MONO }}>wh_7f3a2c91 <Btn theme={th} size="xs" variant="ghost" icon="ext">既有 /webhooks 管理</Btn></span> }, { k:'端點（唯讀）', v:'https://api.ctbc-partner.example/drts/hook', mono:true },
        { k:'端點 fingerprint', v:'fp:9c4e…21a0', mono:true }, { k:'version', v:'7', mono:true },
        { k:'最近測試', v:<Pill theme={th} tone={TEST[test][1]} dot>{TEST[test][0]}</Pill> }, { k:'測試時間', v: test==='none' ? '—' : '09-23 14:02 · fp:9c4e…21a0', mono:true },
        { k:'最後更新', v:'09-23 13:58 · 駱思賢', mono:false }, { k:'簽章密鑰', v:<span style={{ fontFamily:SHELL_MONO }}>••••••••（此頁不顯示、不編輯）</span> },
      ]}/>
      <div style={{ marginTop:10 }}>
        <div style={{ fontSize:11, fontWeight:700, color:th.textMuted, marginBottom:6 }}>訂閱事件（內部 → 對外映射）</div>
        {state==='disabled' ? <span style={{ fontSize:11.5, color:th.textDim }}>已停用 · 不派送任何事件；訂閱設定保留，可恢復</span> :
          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>{PN_EVENTS.slice(0,4).map(([i,o,zh])=><div key={i} style={{ display:'flex', alignItems:'center', gap:8, fontSize:11.5 }}><Pill theme={th} tone="accent">{i}</Pill><MgmtIcon name="arrow-right" size={11} style={{ color:th.textDim }}/><span style={{ fontFamily:SHELL_MONO, color:th.textMuted }}>{o}</span><span style={{ color:th.textDim }}>{zh}</span></div>)}</div>}
      </div>
    </Card>
  );
}
// 生命週期：動作可用性由 state × test × inflight 決定
function PnLifecycle({ theme:th, state='ready', test='passed_current', inflight, failed }) {
  const canEnable = state==='test_pending' && test==='passed_current';
  const enableReason = state==='ready' ? 'already_enabled' : state==='disabled' ? 'use_resume' : test==='passed_stale' ? 'ENDPOINT_FINGERPRINT_CHANGED' : test==='failed' ? 'LAST_TEST_FAILED' : 'TEST_REQUIRED';
  return (
    <Card theme={th} title="生命週期控制" subtitle="test → enable · disable · resume">
      {inflight && <div style={{ marginBottom:10 }}><Banner theme={th} tone="info" icon="refresh" body="測試事件送出中… 等待夥伴端 ack（最長 10 秒）。按鈕已鎖定，避免重複送出。"/></div>}
      {failed && <div style={{ marginBottom:10 }}><Banner theme={th} tone="danger" icon="warn" title="測試失敗 · ack 驗證不符" body="夥伴回 200，但 ack.delivery_id 與送出不符（notification_id / partner_entry_slug 亦須一致，status/receipt 須合法）。已記錄 dlv_test_0913；請確認夥伴端實作後重測。" actions={<Btn theme={th} size="xs" icon="refresh">重測</Btn>}/></div>}
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        <ActionButton theme={th} descriptor={{ action:'test', enabled: state!=='disabled' && !inflight, disabledReasonCode: state==='disabled'?'binding_disabled':inflight?'in_flight':undefined, riskLevel:'low' }} icon="refresh" label="發送測試事件" en="test"/>
        <ActionButton theme={th} descriptor={{ action:'enable', enabled: canEnable && !inflight, disabledReasonCode: canEnable?undefined:enableReason, riskLevel:'medium', requiresReason:true }} icon="check" label="啟用" en="enable"/>
        {state==='disabled'
          ? <ActionButton theme={th} descriptor={{ action:'resume', enabled: true, riskLevel:'medium', requiresReason:true }} icon="check" label="恢復 = PUT(expectedVersion) → test → enable" en="put+test+enable"/>
          : <ActionButton theme={th} descriptor={{ action:'disable', enabled: state==='ready' && !inflight, disabledReasonCode: state==='ready'?undefined:'not_enabled', riskLevel:'high', requiresReason:true }} icon="lock" label="停用" en="disable"/>}
      </div>
      <div style={{ fontSize:10.5, color:th.textDim, marginTop:9, lineHeight:1.5 }}>啟用門檻：目前端點 fingerprint 必須有成功測試。端點變更後測試自動失效，需重測。<br/>「恢復」為 view-model 動作，映射既有 PUT / test / enable，無獨立 /resume。</div>
    </Card>
  );
}
// 送達語意：ack 驗證為準；ack 通過 = 「夥伴端已接受，裝置未知」（硬性文案）
const PN_DLV = {
  accepted:      ['端點已接受，但裝置未知','warn'],
  ack_invalid:   ['回應成功但 ack 驗證失敗','danger'],
  failed:        ['失敗','danger'],
  queued:        ['排隊中','neutral'],
  requeued:      ['已受理重新入列','info'],
  superseded:    ['已被新通知取代','neutral'],
  expired:       ['已過期','neutral'],
  exhausted:     ['重試次數耗盡','danger'],
};
const FX_PN_DELIVERIES = [
  { id:'dlv_0912', ev:'receipt_ready', code:'200', ack:'ok', status:'accepted', reason:'ack 驗證通過 · 裝置接收未知', at:'09-24 09:41:12', tries:1, retry:'n/a' },
  { id:'dlv_0911', ev:'driver_arrived', code:'202', ack:'ok', status:'accepted', reason:'ack 驗證通過 · 裝置接收未知', at:'09-24 09:38:50', tries:1, retry:'n/a' },
  { id:'dlv_0910', ev:'eta_changed', code:'200', ack:'mismatch', status:'ack_invalid', reason:'ack.delivery_id 不符', at:'09-24 09:36:07', tries:2, retry:'allowed' },
  { id:'dlv_0909', ev:'assignment_disclosure_ready', code:'503', ack:'—', status:'failed', reason:'上游暫時無法服務', at:'09-24 09:30:07', tries:2, retry:'allowed' },
  { id:'dlv_0908', ev:'eta_changed', code:'—', ack:'—', status:'requeued', reason:'已受理入列 · 尚未 claim', at:'09-24 09:28:40', tries:3, retry:'inflight' },
  { id:'dlv_0907', ev:'eta_changed', code:'timeout', ack:'—', status:'superseded', reason:'已由 dlv_0910 取代', at:'09-24 09:20:11', tries:1, retry:'denied:SUPERSEDED', target:'api.ctbc-•••••.example/…/hook-v1（舊）' },
  { id:'dlv_0906', ev:'assignment_replaced', code:'timeout', ack:'—', status:'exhausted', reason:'5 次皆逾時', at:'09-24 08:55:41', tries:5, retry:'denied:RETRY_EXHAUSTED' },
  { id:'dlv_0905', ev:'driver_arrived', code:'—', ack:'—', status:'expired', reason:'已逾 expiresAt（policy 300s）', at:'09-24 08:12:30', tries:1, retry:'denied:EVENT_EXPIRED' },
];
const RETRY_DENY = { SUPERSEDED:'已被新通知取代', RETRY_EXHAUSTED:'重試次數耗盡', EVENT_EXPIRED:'事件已過期', LEASE_ACTIVE:'另一重送進行中（lease）', BINDING_NOT_READY:'綁定未就緒' };
function PnRetryCell({ theme:th, r }) {
  if (r.retry==='n/a') return <span style={{ fontSize:10.5, color:th.textDim }}>—</span>;
  if (r.retry==='inflight') return <Pill theme={th} tone="info" dot>入列中 · 待 claim</Pill>;
  if (r.retry==='allowed') return <ActionButton theme={th} size="xs" descriptor={{ action:'resend', enabled:true, riskLevel:'low', requiresReason:true }} icon="refresh" label="重送" en="resend"/>;
  const code = r.retry.split(':')[1];
  return <span title={code} style={{ fontSize:10.5, color:th.textDim, display:'inline-flex', alignItems:'center', gap:4 }}><MgmtIcon name="lock" size={10}/>{RETRY_DENY[code]}</span>;
}
function PnDeliveries({ theme:th, mode='list' }) {
  return (
    <Card theme={th} title="派送紀錄 · Deliveries" subtitle="送達以 ack 驗證為準，不憑 HTTP code · 目標為每筆 immutable delivery context · 重試受控" padding={0}
      actions={<><Select theme={th} value="狀態：全部"/><Btn theme={th} size="xs" icon="refresh">重新整理</Btn></>}>
      {mode==='loading' && <div style={{ padding:16 }}>{[0,1,2,3].map(i=><div key={i} style={{ height:14, borderRadius:4, background:th.surfaceLo, marginBottom:10, animation:'pulse 1.4s infinite', animationDelay:i*.15+'s' }}/>)}</div>}
      {mode==='empty' && <div style={{ padding:24 }}><EmptyState theme={th} reason="no_data" compact messageOverride="尚無派送紀錄。通過測試並啟用後，紀錄會顯示於此。" nextAction="發送測試事件"/></div>}
      {mode==='list' && <>
        <Table theme={th} columns={[
          { h:'ID', k:'id', w:84, mono:true, r:r=><span style={{ color:th.accent, fontWeight:600 }}>{r.id}</span> },
          { h:'事件（內部）', k:'ev', w:170, mono:true },
          { h:'目標（遮罩）', w:150, mono:true, r:r=><span style={{ fontSize:10.5 }}>{r.target||'api.ctbc-•••••.example/…/hook'}</span> },
          { h:'HTTP', k:'code', w:56, mono:true },
          { h:'ack', w:70, r:r=>r.ack==='ok'?<Pill theme={th} tone="success">通過</Pill>:r.ack==='mismatch'?<Pill theme={th} tone="danger">不符</Pill>:<span style={{ color:th.textDim }}>—</span> },
          { h:'送達狀態', w:190, r:r=><Pill theme={th} tone={PN_DLV[r.status][1]} dot>{PN_DLV[r.status][0]}</Pill> },
          { h:'說明', w:150, r:r=><span style={{ fontSize:11.5, color:th.textMuted }}>{r.reason}</span> },
          { h:'時間', k:'at', w:120, mono:true },
          { h:'次', k:'tries', w:36, mono:true, align:'center' },
          { h:'重送', w:150, r:r=><PnRetryCell theme={th} r={r}/> },
        ]} rows={FX_PN_DELIVERIES}/>
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 14px', borderTop:'1px solid '+th.border, fontSize:11, color:th.textMuted }}><span>48 筆 · 第 1 / 5 頁</span><span style={{ flex:1 }}/><Btn theme={th} size="xs" variant="ghost">上一頁</Btn><Btn theme={th} size="xs" variant="ghost" icon="arrow-right">下一頁</Btn></div>
      </>}
    </Card>
  );
}
function PA_PartnerNotify({ theme:th, bind='ready', test='passed_current', deliveries='list', inflight, failed }) {
  return (
    <PnShell theme={th} actions={<Btn theme={th} variant="primary" icon="edit">編輯綁定</Btn>}>
      <div style={{ padding:24, display:'grid', gridTemplateColumns:'1.5fr 1fr', gap:16, alignItems:'start' }}>
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <PnBinding theme={th} state={bind} test={test}/>
          <PnDeliveries theme={th} mode={deliveries}/>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <PnLifecycle theme={th} state={bind} test={test} inflight={inflight} failed={failed}/>
          <Card theme={th} title="派送摘要 · 近 24h" subtitle="「已接受」≠ 裝置已收到">
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}><Kpi theme={th} label="端點已接受" en="ack ok" value="44" tone="warn"/><Kpi theme={th} label="ack 不符" en="ack_invalid" value="1" tone="danger"/><Kpi theme={th} label="失敗/耗盡" en="failed" value="3" tone="danger"/></div>
          </Card>
        </div>
      </div>
    </PnShell>
  );
}
// 編輯：PUT { webhookId, eventTypes, expectedVersion }
function PA_PartnerNotifyEdit({ theme:th }) {
  return (
    <PnShell theme={th} actions={<><Btn theme={th}>取消</Btn><ActionButton theme={th} descriptor={{ action:'save', enabled:true, riskLevel:'medium', requiresReason:true }} variant="primary" icon="check" label="儲存（expectedVersion 7）" en="save"/></>}>
      <div style={{ padding:24, display:'grid', gridTemplateColumns:'1.4fr 1fr', gap:16, alignItems:'start' }}>
        <Card theme={th} title="編輯通知綁定" subtitle="PUT /partner-entries/:id/notification-binding · webhookId + eventTypes + expectedVersion">
          <Field theme={th} label="webhookId · 選擇既有 webhook" required hint="端點 URL、密鑰、逾時/重試由既有 webhook 管理維護，本頁不重複 CRUD">
            <Select theme={th} value="wh_7f3a2c91 · https://api.ctbc-partner.example/drts/hook · active"/>
            <div style={{ marginTop:6 }}><Btn theme={th} size="xs" variant="ghost" icon="ext">前往既有 /webhooks 管理（需 webhook:manage）</Btn></div>
          </Field>
          <Field theme={th} label="eventTypes · 內部事件" required>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>{PN_EVENTS.map(([i,o,zh],idx)=><div key={i} style={{ display:'flex', alignItems:'center', gap:10 }}><Checkbox theme={th} on={idx<4} label={i}/><span style={{ fontSize:10.5, fontFamily:SHELL_MONO, color:th.textDim }}>→ {o}</span><span style={{ fontSize:10.5, color:th.textDim }}>{zh}</span></div>)}</div>
          </Field>
          <Field theme={th} label="expectedVersion" hint="樂觀鎖 · 不符將回 409"><Input theme={th} value="7" mono readOnly/></Field>
        </Card>
        <Card theme={th} title="變更摘要"><DL theme={th} cols={1} items={[{ k:'webhookId', v:'不變更 · wh_7f3a2c91', mono:true },{ k:'eventTypes', v:'+ receipt_ready' },{ k:'expectedVersion', v:'7 → 儲存後 8', mono:true }]}/><div style={{ marginTop:8 }}><Banner theme={th} tone="neutral" icon="lock" body="儲存後綁定回到 test_pending；若 webhook 端點 fingerprint 改變，先前測試失效，需重測方可啟用。"/></div></Card>
      </div>
    </PnShell>
  );
}
// 錯誤與復原
function PA_PartnerNotifyErrors({ theme:th }) {
  return (
    <PnShell theme={th}>
      <div style={{ padding:24, display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
        <Card theme={th} title="409 · VERSION_CONFLICT" padding={14}><Banner theme={th} tone="warn" icon="warn" title="綁定已被他人更新（expectedVersion 7，目前 8）" body="您的選擇已保留。請重新載入取得 version 8 後再儲存；不會靜默覆寫。" actions={<><Btn theme={th} size="xs" variant="primary" icon="refresh">重新載入</Btn><Btn theme={th} size="xs">比對差異</Btn></>}/></Card>
        <Card theme={th} title="404 · BINDING_NOT_FOUND" padding={14}><Banner theme={th} tone="neutral" icon="info" title="此夥伴尚未建立通知綁定" body="選擇既有 webhook 與事件即可建立。" actions={<Btn theme={th} size="xs" variant="primary" icon="plus">建立綁定</Btn>}/></Card>
        <Card theme={th} title="403 · ENTRY_SCOPE_DENIED（含 getBinding）" padding={14}>
          <div style={{ padding:'18px 8px' }}><EmptyState theme={th} reason="permission_denied" compact messageOverride="您無此夥伴 entry 的存取範圍；綁定、派送紀錄與所有動作皆不可見。此頁不提供唯讀降級。"/></div>
        </Card>
        <Card theme={th} title="ack 驗證失敗（200 但 ack 不符）" padding={14}><Banner theme={th} tone="danger" icon="warn" title="回應成功但 ack 驗證失敗" body="夥伴回 200，但 ack 驗證失敗（比對 notification_id / delivery_id / partner_entry_slug，並要求合法 status 與 receipt）；不視為送達，可受控重送。硬性文案（ack 通過時）：「端點已接受，但裝置未知」。"/></Card>
        <Card theme={th} title="重送被拒 · 各理由" padding={14}>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>{Object.entries(RETRY_DENY).map(([c,zh])=><div key={c} style={{ display:'flex', alignItems:'center', gap:8, fontSize:12 }}><MgmtIcon name="lock" size={12} style={{ color:th.textDim }}/><span style={{ flex:1 }}>{zh}</span><span style={{ fontFamily:SHELL_MONO, fontSize:10, color:th.textDim }}>{c}</span></div>)}</div>
        </Card>
        <Card theme={th} title="重送已受理 / 重複點擊" padding={14}><Banner theme={th} tone="info" icon="refresh" title="已受理重新入列 · dlv_0908" body="入列 ≠ 已有 lease。後續依實際 claim / fence 結果更新：claim 成功→送出；他方已 claim→LEASE_ACTIVE；fence 不符→拒絕並顯示原因。同筆重複點擊回後端拒絕原因，不預先假設。"/></Card>
      </div>
    </PnShell>
  );
}
Object.assign(window, { PN_BIND, PN_EVENTS, PnShell, PnBinding, PnLifecycle, PN_DLV, FX_PN_DELIVERIES, RETRY_DENY, PnRetryCell, PnDeliveries, PA_PartnerNotify, PA_PartnerNotifyEdit, PA_PartnerNotifyErrors });
