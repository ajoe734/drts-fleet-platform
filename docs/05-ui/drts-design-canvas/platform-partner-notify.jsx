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
  const p = { id: 'p_8a4b2c19', slug: 'nexus-premium', bank: 'Nexus Bank', program: 'Nexus Premium' };
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
function PnBinding({ theme:th, state='ready', test='passed_current', endpointAccess='management', version=7 }) {
  const canRead = endpointAccess === 'management' || endpointAccess === 'read_only';
  const canManage = endpointAccess === 'management';
  const m = PN_BIND[state];
  const TEST = { passed_current:['測試通過 · 目前端點','success'], passed_stale:['測試已失效 · 端點 fingerprint 已變','warn'], failed:['測試失敗','danger'], none:['尚未測試','neutral'] };
  return (
    <Card theme={th} title="通知綁定 · Notification Binding" subtitle="引用既有 webhook · 端點/密鑰於既有 /webhooks 管理（依權限顯示）" actions={<Pill theme={th} tone={m[1]} dot>{m[0]}<span style={{ marginLeft:4, opacity:.6, fontFamily:SHELL_MONO, fontSize:9 }}>{state}</span></Pill>}>
      <DL theme={th} cols={2} items={[
        { k:'webhookId', v: canRead ? <span style={{ fontFamily:SHELL_MONO }}>wh_7f3a2c91 {canManage && <Btn theme={th} size="xs" variant="ghost" icon="ext">既有 /webhooks 管理（需 tenant:webhooks:write）</Btn>}</span> : <span style={{color:th.textDim}}>無讀取權限</span> }, { k:'端點（唯讀）', v: canRead ? 'https://api.nexus.example/drts/hook' : <span style={{color:th.textDim}}>無讀取權限</span>, mono:true },
        { k:'端點 fingerprint', v: canRead ? 'fp:9c4e…21a0' : <span style={{color:th.textDim}}>未知</span>, mono:true }, { k:'version', v:String(version), mono:true },
        { k:'最近測試', v: canRead ? <Pill theme={th} tone={TEST[test][1]} dot>{TEST[test][0]}</Pill> : <span style={{color:th.textDim}}>—</span> }, { k:'測試時間', v: (!canRead || test==='none') ? '—' : '09-23 14:02 · fp:9c4e…21a0', mono:true },
        { k:'最後更新', v:'09-23 13:58', mono:false }, { k:'簽章密鑰', v:<span style={{ fontFamily:SHELL_MONO }}>••••••••（此頁不顯示、不編輯）</span> },
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
function PnLifecycle({ theme:th, state='ready', test='passed_current', inflight, failed, testingState='idle', enableState='idle', disableState='idle', resumeState='idle', bindingAccess='write' }) {
  const isPending = testingState==='pending' || enableState==='pending' || disableState==='pending' || resumeState==='pending' || inflight;
  const canEnable = state==='test_pending' && test==='passed_current';
  const enableReason = state==='ready' ? 'already_enabled' : state==='disabled' ? 'use_resume' : test==='passed_stale' ? 'ENDPOINT_FINGERPRINT_CHANGED' : test==='failed' ? 'LAST_TEST_FAILED' : 'TEST_REQUIRED';
  const canMutate = bindingAccess === 'write';
  return (
    <Card theme={th} title="生命週期控制" subtitle="test → enable · disable · resume">
      {!canMutate && <div style={{ marginBottom:10 }}><Banner theme={th} tone="warn" icon="lock" title="權限不足" body="您沒有本 entry 綁定的寫入權限，無法執行生命週期操作（需 foundation:write）。"/></div>}
      {inflight && <div style={{ marginBottom:10 }}><Banner theme={th} tone="info" icon="refresh" body="請求處理中… 請稍候。按鈕已鎖定，避免重複送出。"/></div>}
      {failed && testingState!=='rejected' && <div style={{ marginBottom:10 }}><Banner theme={th} tone="danger" icon="warn" title="網路或系統錯誤" body="處理請求時發生網路或系統錯誤，請重試。" actions={<Btn theme={th} size="xs" icon="refresh" disabled={!canMutate || isPending}>重試</Btn>}/></div>}
      {testingState==='rejected' && <div style={{ marginBottom:10 }}><Banner theme={th} tone="danger" icon="warn" title="綁定測試遭拒" body="夥伴端點回傳錯誤狀態碼，拒絕了測試要求，無法啟用。" actions={<Btn theme={th} size="xs" icon="refresh" disabled={!canMutate || isPending}>重測</Btn>}/></div>}
      {enableState==='failed' && <div style={{ marginBottom:10 }}><Banner theme={th} tone="danger" icon="warn" title="啟用失敗" body="無法啟用綁定，請確認測試狀態有效後重試。" actions={<Btn theme={th} size="xs" icon="refresh" disabled={!canMutate || isPending || !canEnable}>重試</Btn>}/></div>}
      {disableState==='failed' && <div style={{ marginBottom:10 }}><Banner theme={th} tone="danger" icon="warn" title="停用失敗" body="無法停用綁定，請重試。" actions={<Btn theme={th} size="xs" icon="refresh" disabled={!canMutate || isPending}>重試</Btn>}/></div>}
      {resumeState==='failed' && <div style={{ marginBottom:10 }}><Banner theme={th} tone="danger" icon="warn" title="恢復失敗" body="無法恢復綁定狀態，請重試。" actions={<Btn theme={th} size="xs" icon="refresh" disabled={!canMutate || isPending}>重試</Btn>}/></div>}
      {test==='failed' && !failed && !inflight && <div style={{ marginBottom:10 }}><Banner theme={th} tone="danger" icon="warn" title="測試失敗 · ack 驗證不符" body="夥伴回 200，但 ack.delivery_id 與送出不符（notification_id / partner_entry_slug 亦須一致，status/receipt 須合法）。已記錄 dlv_test_0913；請確認夥伴端實作後重測。" actions={<Btn theme={th} size="xs" icon="refresh" disabled={!canMutate || isPending}>重測</Btn>}/></div>}
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        <ActionButton theme={th} descriptor={{ action:'test', enabled: canMutate && state!=='disabled' && !isPending, disabledReasonCode: !canMutate ? 'missing_scope' : state==='disabled'?'binding_disabled':isPending?'in_flight':undefined, riskLevel:'low' }} icon="refresh" label={testingState==='pending' ? "測試中..." : "發送測試事件"} en="test"/>
        <ActionButton theme={th} descriptor={{ action:'enable', enabled: canMutate && canEnable && !isPending, disabledReasonCode: !canMutate ? 'missing_scope' : canEnable?undefined:enableReason, riskLevel:'medium', requiresReason:true }} icon="check" label={enableState==='pending' ? "啟用中..." : "啟用"} en="enable"/>
        {state==='disabled'
          ? <ActionButton theme={th} descriptor={{ action:'resume', enabled: canMutate && !isPending, riskLevel:'medium', requiresReason:true, disabledReasonCode: !canMutate ? 'missing_scope' : isPending?'in_flight':undefined }} icon="check" label={resumeState==='pending' ? "恢復通知中..." : test==='passed_current' ? "恢復通知" : "恢復通知（恢復後需重新測試，通過後才能啟用）"} en="resume"/>
          : <ActionButton theme={th} descriptor={{ action:'disable', enabled: canMutate && state==='ready' && !isPending, disabledReasonCode: !canMutate ? 'missing_scope' : state==='ready'?undefined:'not_enabled', riskLevel:'high', requiresReason:true }} icon="lock" label={disableState==='pending' ? "停用中..." : "停用"} en="disable"/>}
      </div>
      <div style={{ fontSize:10.5, color:th.textDim, marginTop:9, lineHeight:1.5 }}>啟用門檻：目前端點 fingerprint 必須有成功測試。端點變更後測試自動失效，需重測。<br/>「恢復」依據目前端點是否 passed_current 來決定是否需重測，無獨立 /resume。</div>
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
  { id:'dlv_0912', outboxId:'obx_78a1', ev:'receipt_ready', code:'200', ack:'ok', status:'accepted', reason:'ack 驗證通過 · 裝置接收未知', at:'09-24 09:41:12', tries:1, retry:'n/a', target:'api.nexus.example/drts/hook' },
  { id:'dlv_0911', outboxId:'obx_78a0', ev:'driver_arrived', code:'202', ack:'ok', status:'accepted', reason:'ack 驗證通過 · 裝置接收未知', at:'09-24 09:38:50', tries:1, retry:'n/a', target:'api.nexus.example/drts/hook' },
  { id:'dlv_0910', outboxId:'obx_789f', ev:'eta_changed', code:'200', ack:'mismatch', status:'ack_invalid', reason:'ack.delivery_id 不符', at:'09-24 09:36:07', tries:2, retry:'allowed', target:'api.nexus.example/drts/hook' },
  { id:'dlv_0909', outboxId:'obx_789e', ev:'assignment_disclosure_ready', code:'503', ack:'—', status:'failed', reason:'上游暫時無法服務', at:'09-24 09:30:07', tries:2, retry:'allowed', target:'api.nexus.example/drts/hook' },
  { id:'dlv_0908', outboxId:'obx_789d', ev:'eta_changed', code:'—', ack:'—', status:'failed', reason:'上游暫時無法服務', at:'09-24 09:28:40', tries:1, retry:'allowed', target:'api.nexus.example/drts/hook' },
  { id:'dlv_0907', outboxId:'obx_789c', ev:'eta_changed', code:'timeout', ack:'—', status:'superseded', reason:'已由 dlv_0910 取代', at:'09-24 09:20:11', tries:1, retry:'denied:SUPERSEDED', target:'api.nexus-•••••.example/…/hook-v1（舊）' },
  { id:'dlv_0906', outboxId:'obx_789b', ev:'assignment_replaced', code:'timeout', ack:'—', status:'exhausted', reason:'5 次皆逾時 (budget_exhausted)', at:'09-24 08:55:41', tries:5, retry:'denied:RETRY_EXHAUSTED', target:'api.nexus.example/drts/hook' },
  { id:'dlv_0905', outboxId:'obx_789a', ev:'driver_arrived', code:'—', ack:'—', status:'expired', reason:'已逾 expiresAt（policy 300s）', at:'09-24 08:12:30', tries:1, retry:'denied:EVENT_EXPIRED', target:'' },
  { id:'dlv_0904', outboxId:'obx_7899', ev:'receipt_ready', code:'—', ack:'—', status:'failed', reason:'系統錯誤', at:'09-24 08:00:00', tries:1, retry:'denied:LEASE_ACTIVE', target:'api.nexus.example/drts/hook' },
  { id:'dlv_0903', outboxId:'obx_7898', ev:'assignment_replaced', code:'—', ack:'—', status:'failed', reason:'綁定未啟用', at:'09-24 07:50:00', tries:1, retry:'denied:BINDING_NOT_READY', target:'api.nexus.example/drts/hook' },
];
const RETRY_DENY = { SUPERSEDED:'已被新通知取代', RETRY_EXHAUSTED:'重試次數耗盡', EVENT_EXPIRED:'事件已過期', LEASE_ACTIVE:'另一重送進行中（lease）', BINDING_NOT_READY:'綁定未就緒' };
function PnRetryCell({ theme:th, r, retryState='idle' }) {
  if (r.retry==='n/a') return <span style={{ fontSize:10.5, color:th.textDim }}>—</span>;
  if (r.retry.startsWith('denied:')) {
    const code = r.retry.split(':')[1];
    return <span title={code} style={{ fontSize:10.5, color:th.textDim, display:'inline-flex', alignItems:'center', gap:4 }}><MgmtIcon name="lock" size={10}/>{RETRY_DENY[code]}</span>;
  }
  if (retryState==='pending') return <ActionButton theme={th} size="xs" descriptor={{ action:'resend', enabled:false, riskLevel:'low', disabledReasonCode:'in_flight' }} icon="refresh" label="重送中..." en="resend"/>;
  if (retryState==='failed') return <div style={{display:'flex', flexDirection:'column', gap:4}}><ActionButton theme={th} size="xs" descriptor={{ action:'resend', enabled:true, riskLevel:'low', requiresReason:true }} icon="refresh" label="重送" en="resend"/><span style={{fontSize:10, color:th.danger}}>入列要求失敗</span></div>;
  if (r.retry==='inflight') return <Pill theme={th} tone="info" dot>入列中 · 待 claim</Pill>;
  if (r.retry==='allowed') return <ActionButton theme={th} size="xs" descriptor={{ action:'resend', enabled:true, riskLevel:'low', requiresReason:true }} icon="refresh" label="重送" en="resend"/>;
  return null;
}
function PnDeliveries({ theme:th, mode='list', retryState='idle', retryRowId=null }) {
  return (
    <Card theme={th} title="派送紀錄 · Deliveries" subtitle="送達以 ack 驗證為準，不憑 HTTP code · 目標為每筆 immutable delivery context · 重試受控" padding={0}
      actions={<><Select theme={th} value="狀態：全部"/><Btn theme={th} size="xs" icon="refresh">重新整理</Btn></>}>
      {mode==='loading' && <div style={{ padding:16 }}>{[0,1,2,3].map(i=><div key={i} style={{ height:14, borderRadius:4, background:th.surfaceLo, marginBottom:10, animation:'pulse 1.4s infinite', animationDelay:i*.15+'s' }}/>)}</div>}
      {mode==='empty' && <div style={{ padding:24 }}><EmptyState theme={th} reason="no_data" compact messageOverride="尚無派送紀錄。通過測試並啟用後，紀錄會顯示於此。" nextAction="發送測試事件"/></div>}
      {mode==='list' && <>
        <Table theme={th} columns={[
          { h:'Delivery ID', k:'id', w:110, mono:true, r:r=><div style={{display:'flex', flexDirection:'column'}}><span style={{ color:th.accent, fontWeight:600 }}>{r.id}</span><span style={{ fontSize:10, color:th.textDim }}>{r.outboxId}</span></div> },
          { h:'事件（內部）', k:'ev', w:170, mono:true },
          { h:'目標（遮罩）', w:150, mono:true, r:r=><span style={{ fontSize:10.5 }}>{r.target || <span style={{color:th.textDim}}>未知／尚未建立派送目標</span>}</span> },
          { h:'HTTP', k:'code', w:56, mono:true },
          { h:'ack', w:70, r:r=>r.ack==='ok'?<Pill theme={th} tone="success">通過</Pill>:r.ack==='mismatch'?<Pill theme={th} tone="danger">不符</Pill>:<span style={{ color:th.textDim }}>—</span> },
          { h:'送達狀態', w:190, r:r=><Pill theme={th} tone={PN_DLV[r.status][1]} dot>{PN_DLV[r.status][0]}</Pill> },
          { h:'說明', w:150, r:r=><span style={{ fontSize:11.5, color:th.textMuted }}>{r.reason}</span> },
          { h:'時間', k:'at', w:120, mono:true },
          { h:'次', k:'tries', w:36, mono:true, align:'center' },
          { h:'重送', w:150, r:r=><PnRetryCell theme={th} r={r} retryState={r.id === retryRowId ? retryState : 'idle'}/> },
        ]} rows={FX_PN_DELIVERIES.map(r => {
          if (r.id === retryRowId) {
            if (retryState === 'queued') return { ...r, status: 'queued', reason: '已受理重新入列', retry: 'inflight' };
          }
          return r;
        })}/>
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 14px', borderTop:'1px solid '+th.border, fontSize:11, color:th.textMuted }}><span>48 筆 · 第 1 / 5 頁</span><span style={{ flex:1 }}/><Btn theme={th} size="xs" variant="ghost">上一頁</Btn><Btn theme={th} size="xs" variant="ghost" icon="arrow-right">下一頁</Btn></div>
      </>}
    </Card>
  );
}
function PA_PartnerNotify({ theme:th, bind='ready', test='passed_current', deliveries='list', inflight, failed, testingState='idle', enableState='idle', disableState='idle', resumeState='idle', retryState='idle', retryRowId=null, endpointAccess='management', bindingAccess='write', version=7 }) {
  const canEditBinding = bindingAccess === 'write';
  return (
    <PnShell theme={th} actions={<Btn theme={th} variant="primary" icon="edit" disabled={!canEditBinding}>編輯綁定</Btn>}>
      <div style={{ padding:24, display:'grid', gridTemplateColumns:'1.5fr 1fr', gap:16, alignItems:'start' }}>
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <PnBinding theme={th} state={bind} test={test} endpointAccess={endpointAccess} version={version}/>
          <PnDeliveries theme={th} mode={deliveries} retryState={retryState} retryRowId={retryRowId}/>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <PnLifecycle theme={th} state={bind} test={test} inflight={inflight} failed={failed} testingState={testingState} enableState={enableState} disableState={disableState} resumeState={resumeState} bindingAccess={bindingAccess}/>
          <Card theme={th} title="派送摘要 · 近 24h" subtitle="「已接受」≠ 裝置已收到">
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}><Kpi theme={th} label="端點已接受" en="ack ok" value="44" tone="warn"/><Kpi theme={th} label="ack 不符" en="ack_invalid" value="1" tone="danger"/><Kpi theme={th} label="失敗/耗盡" en="failed" value="3" tone="danger"/></div>
          </Card>
        </div>
      </div>
    </PnShell>
  );
}
// 編輯：PUT { webhookId, eventTypes, expectedVersion }
function PA_PartnerNotifyEdit({ theme:th, saveState="idle", endpointAccess="management", bindingAccess="write" }) {
  const isSaving = saveState === "pending";
  const canManageEndpoint = endpointAccess === 'management';
  const canReadEndpoint = endpointAccess === 'management' || endpointAccess === 'read_only';
  const isEndpointLoading = endpointAccess === 'loading';
  const isEndpointUnavailable = endpointAccess === 'unavailable' || endpointAccess === 'retry';
  const canEditBinding = bindingAccess === 'write';
  const endpointFetchFailed = isEndpointLoading || isEndpointUnavailable;
  const isSaveDisabled = isSaving || !canEditBinding || endpointFetchFailed || !canReadEndpoint;

  let disabledReasonCode = undefined;
  if (!canEditBinding) disabledReasonCode = 'missing_scope';
  else if (endpointFetchFailed || !canReadEndpoint) disabledReasonCode = 'endpoint_unavailable';
  else if (isSaving) disabledReasonCode = 'saving';

  return (
    <PnShell theme={th} actions={<><Btn theme={th} disabled={isSaving}>取消</Btn><ActionButton theme={th} descriptor={{ action:'save', enabled:!isSaveDisabled, riskLevel:'medium', requiresReason:true, disabledReasonCode }} variant="primary" icon="check" label={isSaving ? "儲存中..." : "儲存（expectedVersion 7）"} en="save"/></>}>
      <div style={{ padding:24, display:'grid', gridTemplateColumns:'1.4fr 1fr', gap:16, alignItems:'start' }}>
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          {!canEditBinding && <Banner theme={th} tone="warn" icon="lock" title="權限不足" body="您沒有本 entry 綁定的寫入權限，無法儲存（需要 entry 對應之 foundation/tenant write 權限）。"/>}
          {endpointAccess === 'denied' && <Banner theme={th} tone="danger" icon="lock" title="權限不足" body="您需要 tenant:webhooks:read 權限以列出可用的 Webhook。無法選擇端點。"/>}
          {saveState === 'failed' && <Banner theme={th} tone="danger" icon="warn" title="儲存失敗" body="請檢查連線或重試。"/>}
        <Card theme={th} title="編輯通知綁定" subtitle="PUT /partner-entries/:id/notification-binding · webhookId + eventTypes + expectedVersion">
          <Field theme={th} label="webhookId · 選擇既有 webhook" required hint="端點 URL、密鑰、逾時/重試由既有 webhook 管理維護，本頁不重複 CRUD">
            {canReadEndpoint ? <Select theme={th} value="wh_7f3a2c91 · https://api.nexus.example/drts/hook · active"/> : isEndpointLoading ? <div style={{ padding:'8px 12px', border:'1px solid '+th.border, borderRadius:4, background:th.surfaceLo, color:th.textDim, fontSize:13 }}>載入端點列表中...</div> : isEndpointUnavailable ? <div style={{ padding:'8px 12px', border:'1px solid '+th.border, borderRadius:4, background:th.surfaceLo, color:th.textDim, fontSize:13 }}>無法取得端點列表 {endpointAccess === 'retry' && <Btn theme={th} size="xs" variant="ghost">重試</Btn>}</div> : <div style={{ padding:'8px 12px', border:'1px solid '+th.border, borderRadius:4, background:th.surfaceLo, color:th.textDim, fontSize:13 }}>無權限存取端點列表</div>}
            {canManageEndpoint && <div style={{ marginTop:6 }}><Btn theme={th} size="xs" variant="ghost" icon="ext">前往既有 /webhooks 管理（需 tenant:webhooks:write）</Btn></div>}
          </Field>
          <Field theme={th} label="eventTypes · 內部事件" required>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>{PN_EVENTS.map(([i,o,zh],idx)=><div key={i} style={{ display:'flex', alignItems:'center', gap:10 }}><Checkbox theme={th} on={idx<4} label={i}/><span style={{ fontSize:10.5, fontFamily:SHELL_MONO, color:th.textDim }}>→ {o}</span><span style={{ fontSize:10.5, color:th.textDim }}>{zh}</span></div>)}</div>
          </Field>
          <Field theme={th} label="expectedVersion" hint="樂觀鎖 · 不符將回 409"><Input theme={th} value="7" mono readOnly/></Field>
        </Card>
        </div>
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
        <Card theme={th} title="500/503 · 綁定讀取失敗" padding={14}><Banner theme={th} tone="danger" icon="warn" title="無法載入綁定資訊" body="無法讀取目前綁定狀態與版本，請重新整理頁面或稍後再試。" actions={<Btn theme={th} size="xs" variant="primary" icon="refresh">重新整理</Btn>}/></Card>
        <Card theme={th} title="404 · WEBHOOK_NOT_FOUND" padding={14}><Banner theme={th} tone="neutral" icon="info" title="Webhook 端點已刪除" body="端點已刪除，請重新選擇有效的 Webhook 並儲存綁定。" actions={<Btn theme={th} size="xs" variant="primary" icon="edit">重新設定綁定</Btn>}/></Card>
        <Card theme={th} title="409 · PARTNER_NOTIFICATION_BINDING_ENTRY_INACTIVE" padding={14}><Banner theme={th} tone="danger" icon="warn" title="夥伴入口已停用" body="無法進行綁定操作，因為對應的夥伴入口已停用。"/></Card>
        <Card theme={th} title="409 · PARTNER_NOTIFICATION_BINDING_ENDPOINT_EVENTS_MISSING" padding={14}><Banner theme={th} tone="danger" icon="warn" title="Webhook 事件訂閱不足" body="目標 Webhook 未訂閱必要的事件類型，請先至 Webhook 管理介面補充。"/></Card>

        <Card theme={th} title="409 · PARTNER_NOTIFICATION_BINDING_VERSION_CONFLICT" padding={14}><Banner theme={th} tone="warn" icon="warn" title="綁定已被他人更新（expectedVersion 7，目前 8）" body="您的選擇已保留。請重新載入取得 version 8 後再儲存；不會靜默覆寫。" actions={<><Btn theme={th} size="xs" variant="primary" icon="refresh">重新載入</Btn><Btn theme={th} size="xs">比對差異</Btn></>}/></Card>
        <Card theme={th} title="404 · PARTNER_NOTIFICATION_BINDING_NOT_FOUND" padding={14}><Banner theme={th} tone="neutral" icon="info" title="此夥伴尚未建立通知綁定" body="選擇既有 webhook 與事件即可建立。" actions={<Btn theme={th} size="xs" variant="primary" icon="plus">建立綁定</Btn>}/></Card>
        <Card theme={th} title="409 · PARTNER_NOTIFICATION_BINDING_NOT_VALIDATED" padding={14}><Banner theme={th} tone="warn" icon="warn" title="綁定測試已失效" body="端點變更後需重新發送測試事件以驗證，驗證通過前無法啟用。" actions={<Btn theme={th} size="xs" variant="primary" icon="refresh">發送測試事件</Btn>}/></Card>
        <Card theme={th} title="403 · PARTNER_NOTIFICATION_BINDING_TENANT_SCOPE_DENIED（含 getBinding）" padding={14}>
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
// D1/D6 · 生命週期載入與復原狀態
function PA_PartnerNotifyRecoveryBoards({ theme:th }) {
  return (
    <PnShell theme={th}>
      <div style={{ padding:24, display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
        <Card theme={th} title="載入中 · Binding Fetch Loading" padding={14}><Banner theme={th} tone="neutral" icon="refresh" title="載入綁定資料中" body="正在取得通知綁定組態..." /></Card>
        <Card theme={th} title="操作進行中 · Ongoing Action" padding={14}><Banner theme={th} tone="neutral" icon="refresh" title="儲存/測試/啟用/停用 進行中" body="請稍候，操作正在處理中..." actions={<Btn theme={th} size="xs" disabled>處理中...</Btn>}/></Card>
        <Card theme={th} title="操作成功 · Action Success" padding={14}><Banner theme={th} tone="success" icon="check" title="操作已完成" body="綁定狀態已成功更新。"/></Card>
        <Card theme={th} title="操作失敗 · Action Failure" padding={14}><Banner theme={th} tone="danger" icon="warn" title="儲存/測試/啟用/停用 失敗" body="處理要求時發生錯誤，請重試。" actions={<Btn theme={th} size="xs" variant="primary" icon="refresh">重試</Btn>}/></Card>
      </div>
    </PnShell>
  );
}

Object.assign(window, { PN_BIND, PN_EVENTS, PnShell, PnBinding, PnLifecycle, PN_DLV, FX_PN_DELIVERIES, RETRY_DENY, PnRetryCell, PnDeliveries, PA_PartnerNotify, PA_PartnerNotifyEdit, PA_PartnerNotifyErrors, PA_PartnerNotifyRecoveryBoards });
