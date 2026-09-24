// platform-partner-notify.jsx — D · 夥伴詳情頁「通知」分頁 (partner-notification-screen-requirements-20260923).
// 6 組狀態：綁定讀取 / 派送紀錄 / 編輯表單 / 生命週期 / 重送 / 錯誤與復原。密鑰一律遮罩。
// 硬性文案（不得改寫）：「端點已接受，但裝置未知」
const PN_BIND = { ready:['就緒','success'], test_pending:['待測試','warn'], disabled:['已停用','neutral'] };
const PN_EVENTS = ['assignment_disclosure_ready','assignment_replaced','eta_changed','driver_arrived','receipt_ready'];
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
function PnBinding({ theme:th, state='ready' }) {
  const m = PN_BIND[state];
  return (
    <Card theme={th} title="回呼綁定 · Callback Binding" subtitle="目前綁定 · 密鑰遮罩" actions={<Pill theme={th} tone={m[1]} dot>{m[0]}<span style={{ marginLeft:4, opacity:.6, fontFamily:SHELL_MONO, fontSize:9 }}>{state}</span></Pill>}>
      <DL theme={th} cols={2} items={[
        { k:'webhookId', v:'wh_7f3a2c91', mono:true }, { k:'端點', v:'https://api.ctbc-partner.example/drts/hook', mono:true },
        { k:'簽章密鑰', v:<span style={{ fontFamily:SHELL_MONO }}>whsec_••••••••••••4c1e <Pill theme={th} tone="neutral">遮罩</Pill></span> }, { k:'預期版本 expectedVersion', v:'7', mono:true },
        { k:'最後測試', v: state==='test_pending' ? '尚未測試' : '09-23 14:02 · 200 OK', mono:true }, { k:'最後更新', v:'09-23 13:58 · 駱思賢', mono:false },
      ]}/>
      <div style={{ marginTop:10 }}>
        <div style={{ fontSize:11, fontWeight:700, color:th.textMuted, marginBottom:6 }}>訂閱事件類型</div>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>{PN_EVENTS.slice(0, state==='disabled'?0:4).map(e=><Pill key={e} theme={th} tone="accent">{e}</Pill>)}{state==='disabled' && <span style={{ fontSize:11.5, color:th.textDim }}>已停用 · 不派送任何事件</span>}</div>
      </div>
    </Card>
  );
}
function PnLifecycle({ theme:th, state='ready' }) {
  return (
    <Card theme={th} title="生命週期控制" subtitle="test / enable / disable">
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        <ActionButton theme={th} descriptor={{ action:'test', enabled: true, riskLevel:'low' }} icon="refresh" label="發送測試事件" en="test"/>
        <ActionButton theme={th} descriptor={{ action:'enable', enabled: state==='test_pending' || state==='disabled', disabledReasonCode: state==='ready'?'already_enabled':undefined, riskLevel:'medium', requiresReason:true }} icon="check" label="啟用 / 恢復" en="enable"/>
        <ActionButton theme={th} descriptor={{ action:'disable', enabled: state==='ready', riskLevel:'high', requiresReason:true }} icon="lock" label="停用" en="disable"/>
      </div>
      <div style={{ fontSize:10.5, color:th.textDim, marginTop:9 }}>待測試狀態需先通過測試事件才可啟用。</div>
    </Card>
  );
}
const FX_PN_DELIVERIES = [
  { id:'dlv_0915', event:'receipt_ready', target:'…/drts/hook', status:'accepted_unknown_device', code:'200', reason:'端點已接受，但裝置未知', at:'09-24 09:50:12', tries:1 },
  { id:'dlv_0914', event:'driver_arrived', target:'…/drts/hook', status:'failed', code:'429', reason:'budget_exhausted (耗盡次數)', at:'09-24 09:48:30', tries:5 },
  { id:'dlv_0913', event:'eta_changed', target:'…/drts/hook', status:'failed', code:'408', reason:'lease_active (有效 lease)', at:'09-24 09:45:00', tries:2 },
  { id:'dlv_0912', event:'assignment_replaced', target:'…/drts/hook', status:'failed', code:'410', reason:'superseded (被新通知取代)', at:'09-24 09:41:12', tries:1 },
  { id:'dlv_0911', event:'assignment_disclosure_ready', target:'…/drts/hook', status:'failed', code:'401', reason:'expired (過期)', at:'09-24 09:38:50', tries:1 },
  { id:'dlv_0910', event:'assignment_disclosure_ready', target:'…/drts/hook', status:'enqueued', code:'—', reason:'重新入列', at:'09-24 09:30:07', tries:0 },
  { id:'dlv_0909', event:'driver_arrived', target:'…/drts/hook', status:'failed', code:'503', reason:'binding_not_ready (綁定未就緒)', at:'09-24 08:55:41', tries:3 },
  { id:'dlv_0908', event:'receipt_ready', target:'…/drts/hook', status:'accepted_unknown_device', code:'201', reason:'端點已接受，但裝置未知', at:'09-24 08:12:30', tries:1 },
];
const PN_DLV = { accepted_unknown_device:['已接受 · 裝置未知','warn'], failed:['失敗','danger'], pending:['待送','neutral'], enqueued:['入列','neutral'] };
function PnDeliveries({ theme:th, mode='list' }) {
  return (
    <Card theme={th} title="派送紀錄 · Deliveries" subtitle="分頁列表 · 單筆失敗可手動重送" padding={0}
      actions={<><Select theme={th} value="狀態：全部"/><Btn theme={th} size="xs" icon="refresh">重新整理</Btn></>}>
      {mode==='loading' && <div style={{ padding:16 }}>{[0,1,2,3].map(i=><div key={i} style={{ height:14, borderRadius:4, background:th.surfaceLo, marginBottom:10, animation:'pulse 1.4s infinite', animationDelay:i*.15+'s' }}/>)}</div>}
      {mode==='empty' && <div style={{ padding:24 }}><EmptyState theme={th} reason="no_data" compact messageOverride="尚無派送紀錄。啟用綁定並發送測試事件後，紀錄會顯示於此。" nextAction="發送測試事件"/></div>}
      {mode==='list' && <>
        <Table theme={th} columns={[
          { h:'ID', k:'id', w:90, mono:true, r:r=><span style={{ color:th.accent, fontWeight:600 }}>{r.id}</span> },
          { h:'事件', k:'event', w:150, mono:true },
          { h:'目標', k:'target', w:120, mono:true },
          { h:'狀態', w:170, r:r=><Pill theme={th} tone={PN_DLV[r.status][1]} dot>{PN_DLV[r.status][0]}</Pill> },
          { h:'回應', k:'code', w:60, mono:true },
          { h:'失敗原因', w:180, r:r=><span style={{ fontSize:11.5, color:r.status==='failed'?th.danger:th.textMuted }}>{r.reason}</span> },
          { h:'時間', k:'at', w:130, mono:true },
          { h:'嘗試', k:'tries', w:50, mono:true, align:'center' },
          { h:'', w:80, r:r=>r.status==='failed'?<ActionButton theme={th} size="xs" descriptor={{ action:'resend', enabled:true, riskLevel:'low' }} icon="refresh" label="重送" en="resend"/>:<span style={{ fontSize:10.5, color:th.textDim }}>—</span> },
        ]} rows={FX_PN_DELIVERIES}/>
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 14px', borderTop:'1px solid '+th.border, fontSize:11, color:th.textMuted }}><span>48 筆 · 第 1 / 5 頁</span><span style={{ flex:1 }}/><Btn theme={th} size="xs" variant="ghost">上一頁</Btn><Btn theme={th} size="xs" variant="ghost" icon="arrow-right">下一頁</Btn></div>
      </>}
    </Card>
  );
}
// D1 · 綁定讀取（三態）+ 派送紀錄
function PA_PartnerNotify({ theme:th, bind='ready', deliveries='list' }) {
  return (
    <PnShell theme={th} actions={<Btn theme={th} variant="primary" icon="edit">編輯綁定</Btn>}>
      <div style={{ padding:24, display:'grid', gridTemplateColumns:'1.5fr 1fr', gap:16, alignItems:'start' }}>
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <PnBinding theme={th} state={bind}/>
          <PnDeliveries theme={th} mode={deliveries}/>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <PnLifecycle theme={th} state={bind}/>
          <Card theme={th} title="派送摘要 · 近 24h"><div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}><Kpi theme={th} label="送達" en="delivered" value="44"/><Kpi theme={th} label="裝置未知" en="202" value="2" tone="warn"/><Kpi theme={th} label="失敗" en="failed" value="2" tone="danger"/></div></Card>
        </div>
      </div>
    </PnShell>
  );
}
// D3 · 編輯表單
function PA_PartnerNotifyEdit({ theme:th }) {
  return (
    <PnShell theme={th} actions={<><Btn theme={th}>取消</Btn><ActionButton theme={th} descriptor={{ action:'save', enabled:true, riskLevel:'medium', requiresReason:true }} variant="primary" icon="check" label="儲存綁定（7 → 8）" en="save"/></>}>
      <div style={{ padding:24, display:'grid', gridTemplateColumns:'1.4fr 1fr', gap:16, alignItems:'start' }}>
        <Card theme={th} title="編輯回呼綁定" subtitle="expectedVersion: 7 · 版本衝突將阻擋儲存">
          <Field theme={th} label="選擇 Webhook (webhookId)" required hint="重用既有 webhook 管理入口">
            <Select theme={th} value="wh_7f3a2c91 (https://api.ctbc-partner.example/drts/hook)"/>
          </Field>
          <Field theme={th} label="訂閱事件類型" required>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>{PN_EVENTS.map((e,i)=><Checkbox key={e} theme={th} on={i<4} label={e}/>)}</div>
          </Field>
        </Card>
        <Card theme={th} title="變更摘要"><DL theme={th} cols={1} items={[{ k:'目前版本', v:'7', mono:true },{ k:'儲存後', v:'8', mono:true },{ k:'事件變更', v:'+ receipt_ready' },{ k:'Webhook', v:'不變更' }]}/><div style={{ marginTop:8 }}><Banner theme={th} tone="neutral" icon="lock" body="儲存後綁定回到「待測試」，需重新通過測試事件才可啟用。"/></div></Card>
      </div>
    </PnShell>
  );
}
// D6 · 錯誤與復原
function PA_PartnerNotifyErrors({ theme:th }) {
  return (
    <PnShell theme={th}>
      <div style={{ padding:24, display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
        <Card theme={th} title="409 · 版本衝突" padding={14}><Banner theme={th} tone="warn" icon="warn" title="綁定已被他人更新（7 → 8）" body="您的表單輸入已保留。請重新載入取得最新版本後再儲存；不會靜默覆寫。" actions={<><Btn theme={th} size="xs" variant="primary" icon="refresh">重新載入 8</Btn><Btn theme={th} size="xs">比對差異</Btn></>}/></Card>
        <Card theme={th} title="404 · 找不到綁定" padding={14}><Banner theme={th} tone="neutral" icon="info" title="此夥伴尚未建立回呼綁定" body="建立綁定後即可訂閱事件並查看派送紀錄。" actions={<Btn theme={th} size="xs" variant="primary" icon="plus">建立綁定</Btn>}/></Card>
        <Card theme={th} title="403 · 無權限" padding={14}><Banner theme={th} tone="danger" icon="lock" title="您沒有讀取此綁定的權限" body="無法讀取綁定資料，需要 tenant_partner:read 權限。" /></Card>
        <Card theme={th} title="202 · 端點已接受，但裝置未知（硬性文案）" padding={14}><Banner theme={th} tone="warn" icon="info" title="端點已接受，但裝置未知" body="夥伴端點回傳 200/201/202，但未回報處理裝置。視為送達待確認，不自動重送。"/></Card>
      </div>
    </PnShell>
  );
}
Object.assign(window, { PN_BIND, PN_EVENTS, PnShell, PnBinding, PnLifecycle, FX_PN_DELIVERIES, PN_DLV, PnDeliveries, PA_PartnerNotify, PA_PartnerNotifyEdit, PA_PartnerNotifyErrors });
