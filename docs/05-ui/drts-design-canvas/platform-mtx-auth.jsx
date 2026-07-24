// platform-mtx-auth.jsx — MTX-AUTH-UI-01..06 多元計程車營運許可 (platform realm, extends Platform Admin).
// Canonical fields/status per Multi-Taxi Ops UI v1.0 §6. Sample data §18 (fictional). Capability-driven.
const MTX_ST = { draft:['草稿','neutral'], approved:['已核准','success'], suspended:['已暫停','warn'], expired:['已失效','neutral'], revoked:['已撤銷','danger'] };
function MtxStatusChip({ theme:th, s }) { const m=MTX_ST[s]; return <Pill theme={th} tone={m[1]} dot>{m[0]}<span style={{ marginLeft:4, opacity:.6, fontFamily:SHELL_MONO, fontSize:9 }}>{s}</span></Pill>; }
function MtxWindow({ theme:th, from, until, warnExpiry }) {
  return <span style={{ fontFamily:SHELL_MONO, fontSize:11 }}>{from} → {until||'無預定失效日'}<span style={{ color:th.textDim, fontSize:9.5 }}> +08</span>{warnExpiry && <span style={{ color:th.warn, fontWeight:700, fontSize:10.5, marginLeft:6 }}>⚠ 30 天內到期 {until}</span>}</span>;
}
const FX_MTX_AUTH = [
  { code:'MTX-TPE-2026-001', op:'智行示範車隊', plan:'BP-2026.07', status:'approved', areas:['TPE','NWT'], fare:'FARE-MTX-2026-07', from:'2026-07-01', until:null, updated:'07-20 09:12' },
  { code:'MTX-TPE-2026-002', op:'智行示範車隊', plan:'BP-2026.07', status:'draft', areas:['TPE'], fare:'FARE-MTX-2026-07', from:'2026-09-01', until:null, updated:'07-22 16:40' },
  { code:'MTX-TYC-2025-006', op:'桃園示範運輸', plan:'BP-2025.11', status:'approved', areas:['TYC'], fare:'FARE-MTX-2025-11', from:'2025-12-01', until:'2026-08-15', warn:true, updated:'07-18 11:02' },
  { code:'MTX-TPE-2025-004', op:'智行示範車隊', plan:'BP-2025.06', status:'suspended', areas:['TPE'], fare:'FARE-MTX-2025-06', from:'2025-07-01', until:'2026-12-31', updated:'06-30 14:20' },
  { code:'MTX-KHH-2024-002', op:'南方示範車隊', plan:'BP-2024.03', status:'expired', areas:['KHH'], fare:'FARE-MTX-2024-03', from:'2024-04-01', until:'2026-04-01', updated:'04-01 00:00' },
  { code:'MTX-TPE-2024-001', op:'已除名業者', plan:'BP-2024.01', status:'revoked', areas:['TPE'], fare:'—', from:'2024-02-01', until:'2025-06-30', updated:'25-06-30' },
];
const AREA_ZH = { TPE:'臺北市', NWT:'新北市', TYC:'桃園市', KHH:'高雄市' };
function MtxAreas({ theme:th, areas }) { return <span style={{ display:'inline-flex', gap:4, flexWrap:'wrap' }}>{areas.map(a=><Pill key={a} theme={th} tone="neutral">{AREA_ZH[a]||a}<span style={{ marginLeft:3, opacity:.55, fontFamily:SHELL_MONO, fontSize:9 }}>{a}</span></Pill>)}</span>; }

// UI-01 Registry
function MTX_Registry({ theme:th }) {
  return (
    <Shell theme={th} nav={PA_NAV} active="mtx-auth" breadcrumb={['車隊方案','多元營運許可']} env="production" actor={PSB_ACTOR} health={PA_HEALTH} refreshTier="medium_slow" dataFreshness="fresh">
      <PageHeader theme={th} title="多元計程車營運許可 · Registry" subtitle="MTX-AUTH-UI-01 · 排序：已核准 → 最近生效邊界 → 最近更新 · 不推斷後端以外的法規效力"
        meta={<><Select theme={th} value="業者：全部"/><Select theme={th} value="狀態：全部"/><Select theme={th} value="營運區域：全部"/><Select theme={th} value="有效日期：全部"/><Input theme={th} value="許可代碼／版本關鍵字" style={{width:170}}/></>}
        actions={<Btn theme={th} variant="primary" icon="plus">建立草稿</Btn>}/>
      <div style={{ padding:24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h:'許可代碼', w:170, mono:true, r:r=><span style={{ color:th.accent, fontWeight:700 }}>{r.code}</span> },
            { h:'業者', k:'op', w:120 },
            { h:'營業計畫版本', k:'plan', w:100, mono:true },
            { h:'狀態', w:110, r:r=><MtxStatusChip theme={th} s={r.status}/> },
            { h:'營運區域', w:150, r:r=><MtxAreas theme={th} areas={r.areas}/> },
            { h:'生效費率版本', w:150, mono:true, r:r=>r.fare==='—'?<span style={{color:th.textDim}}>—</span>:<span style={{ color:th.accent, textDecoration:'underline', cursor:'pointer' }}>{r.fare}</span> },
            { h:'有效期間', w:230, r:r=><MtxWindow theme={th} from={r.from} until={r.until} warnExpiry={r.warn}/> },
            { h:'最後更新', k:'updated', w:100, mono:true },
          ]} rows={FX_MTX_AUTH}/>
        </Card>
      </div>
    </Shell>
  );
}
// UI-02 Detail (approved)
function MTX_Detail({ theme:th, status='approved' }) {
  const a = FX_MTX_AUTH.find(x=>x.status===status) || FX_MTX_AUTH[0];
  const can = { edit:status==='draft', activate:status==='draft'||status==='suspended', suspend:status==='approved' };
  const ro = status==='expired'||status==='revoked';
  return (
    <Shell theme={th} nav={PA_NAV} active="mtx-auth" breadcrumb={['多元營運許可', a.code]} env="production" actor={PSB_ACTOR} health={PA_HEALTH} refreshTier="medium_slow" dataFreshness="fresh">
      <PageHeader theme={th} title={<span style={{ display:'inline-flex', alignItems:'center', gap:10 }}>{a.code}<MtxStatusChip theme={th} s={status}/></span>}
        subtitle={'MTX-AUTH-UI-02 · '+a.op+' · '+a.plan}
        meta={ro && <Pill theme={th} tone="neutral" dot>唯讀 · 不提供撤銷/還原/刪除（命令未核准）</Pill>}
        actions={<>
          <ActionButton theme={th} descriptor={{ action:'edit', enabled:can.edit, disabledReasonCode:can.edit?undefined:'AUTHORIZATION_NOT_EDITABLE', riskLevel:'low' }} icon="edit" label="編輯草稿" en="edit"/>
          <ActionButton theme={th} descriptor={{ action:'activate', enabled:can.activate, disabledReasonCode:can.activate?undefined:'AUTHORIZATION_CANNOT_ACTIVATE', riskLevel:'high', requiresReason:true }} icon="check" label="啟用" en="activate"/>
          <ActionButton theme={th} descriptor={{ action:'suspend', enabled:can.suspend, disabledReasonCode:can.suspend?undefined:'AUTHORIZATION_NOT_ACTIVE', riskLevel:'high', requiresReason:true }} icon="lock" label="暫停" en="suspend"/>
        </>}/>
      <div style={{ padding:24, display:'grid', gridTemplateColumns:'1.4fr 1fr', gap:16, alignItems:'start' }}>
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <Card theme={th} title="識別與授權" subtitle="identity · business plan authority">
            <DL theme={th} cols={2} items={[
              { k:'許可代碼 authorityCode', v:a.code, mono:true }, { k:'業者 operatorId', v:a.op+' · op_zx01', mono:true },
              { k:'營業計畫版本', v:a.plan, mono:true }, { k:'許可 ID（稽核）', v:<span style={{ fontFamily:SHELL_MONO }}>auth_9f2a17c4 <Btn theme={th} size="xs" variant="ghost" icon="copy">複製</Btn></span> },
              { k:'營運區域', v:<MtxAreas theme={th} areas={a.areas}/> }, { k:'生效費率版本', v:<span style={{ color:th.accent, fontFamily:SHELL_MONO, textDecoration:'underline', cursor:'pointer' }}>{a.fare}</span> },
              { k:'生效時間', v:a.from+' 00:00 +08 (Asia/Taipei)', mono:true }, { k:'失效時間', v:a.until?a.until+' 23:59 +08':'無預定失效日', mono:true },
            ]}/>
          </Card>
          <Card theme={th} title="授權車輛摘要" subtitle="authorized vehicles" actions={<Btn theme={th} size="xs" variant="ghost" icon="arrow-right">管理名單</Btn>}>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
              <Kpi theme={th} label="生效中" en="active" value="12"/><Kpi theme={th} label="已暫停" en="suspended" value="1"/><Kpi theme={th} label="已移除" en="removed" value="3"/>
            </div>
            <div style={{ marginTop:10 }}><Banner theme={th} tone="neutral" icon="info" body="車種本身不等於授權；車輛須列入本許可名單且在效期內才具派車資格。"/></div>
          </Card>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <Card theme={th} title="生命週期 / 稽核" subtitle="lifecycle · audit">
            <DL theme={th} cols={1} items={[
              { k:'建立時間 createdAt', v:'2026-06-12 10:04 +08', mono:true }, { k:'最後更新 updatedAt', v:a.updated+' +08', mono:true },
              { k:'核准動作', v:'駱思賢 · activate · 07-01', mono:false }, { k:'audit', v:'aud_mtx_0091', mono:true },
            ]}/>
          </Card>
          <Card theme={th} title="動作可用性 · 依狀態">
            <Table theme={th} columns={[
              { h:'狀態', w:80, r:r=><MtxStatusChip theme={th} s={r.s}/> }, { h:'編輯', w:50, align:'center', r:r=>r.e }, { h:'啟用', w:70, align:'center', r:r=>r.a }, { h:'暫停', w:70, align:'center', r:r=>r.x },
            ]} rows={[{s:'draft',e:'✓',a:'✓*',x:'—'},{s:'approved',e:'—',a:'—',x:'✓*'},{s:'suspended',e:'—',a:'✓*',x:'—'},{s:'expired',e:'—',a:'—',x:'—'},{s:'revoked',e:'—',a:'—',x:'—'}]}/>
            <div style={{ fontSize:10.5, color:th.textDim, marginTop:8 }}>* 需 multi_taxi_authorization:activate 能力</div>
          </Card>
        </div>
      </div>
    </Shell>
  );
}
// UI-03 Draft editor (+validation)
function MTX_Draft({ theme:th, error }) {
  return (
    <Shell theme={th} nav={PA_NAV} active="mtx-auth" breadcrumb={['多元營運許可','建立草稿']} env="production" actor={PSB_ACTOR} health={PA_HEALTH} refreshTier="medium_slow" dataFreshness="fresh">
      <PageHeader theme={th} title="許可草稿編輯 · Draft Editor" subtitle="MTX-AUTH-UI-03 · 表單僅建立草稿；啟用一律為獨立受控動作 · 未存檔離開需確認"
        actions={<><Btn theme={th}>取消</Btn><Btn theme={th} variant="primary" icon="check">儲存草稿</Btn></>}/>
      <div style={{ padding:24, display:'grid', gridTemplateColumns:'1.4fr 1fr', gap:16, alignItems:'start' }}>
        <Card theme={th} title="草稿欄位">
          {error && <div style={{ marginBottom:12 }}><Banner theme={th} tone="danger" icon="warn" title="請完成所有必填欄位 · 2 項錯誤"
            body="① 營運區域至少需選擇一項（MULTI_TAXI_FIELD_REQUIRED）② 失效時間必須晚於生效時間（MULTI_TAXI_EFFECTIVE_WINDOW_INVALID）"/></div>}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 16px' }}>
            <Field theme={th} label="業者 operatorId" required><Select theme={th} value="智行示範車隊 · op_zx01"/></Field>
            <Field theme={th} label="許可代碼 authorityCode" required><Input theme={th} value="MTX-TPE-2026-002" mono/></Field>
            <Field theme={th} label="營業計畫版本" required><Input theme={th} value="BP-2026.07" mono/></Field>
            <Field theme={th} label="生效費率版本" required hint="顯示狀態與效期"><Select theme={th} value="FARE-MTX-2026-07 · active · 07-01 起"/></Field>
            <Field theme={th} label="生效時間 (Asia/Taipei +08)" required><Input theme={th} value="2026-09-01 00:00" mono/></Field>
            <Field theme={th} label="失效時間（可空 = 無預定失效日）"><Input theme={th} value={error?'2026-08-01 00:00':'—'} mono style={error?{borderColor:th.danger}:{}}/></Field>
          </div>
          <Field theme={th} label="營運區域 serviceAreaCodes（至少一項）" required>
            <div style={{ display:'flex', gap:7, flexWrap:'wrap' }}>
              <Checkbox theme={th} on={!error} label="臺北市 TPE"/><Checkbox theme={th} label="新北市 NWT"/><Checkbox theme={th} label="桃園市 TYC"/><Checkbox theme={th} label="高雄市 KHH"/>
            </div>
          </Field>
        </Card>
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <Card theme={th} title="費率版本檢核">
            <DL theme={th} cols={1} items={[
              { k:'選定版本', v:'FARE-MTX-2026-07', mono:true }, { k:'狀態', v:<Pill theme={th} tone="success" dot>active</Pill> },
              { k:'效期', v:'2026-07-01 → 無預定', mono:true },
            ]}/>
            <div style={{ marginTop:8 }}><Banner theme={th} tone="info" icon="info" body="僅 active 費率可作為訂單依據；未生效版本不可提前套用（P5_FARE_VERSION_NOT_ACTIVE）。"/></div>
          </Card>
          <Card theme={th} title="離開確認"><Banner theme={th} tone="warn" icon="warn" body="有未儲存變更；離開將捨棄本次編輯。此提示需明確確認，不可誤按 Esc 關閉。"/></Card>
        </div>
      </div>
    </Shell>
  );
}
// UI-04 Lifecycle confirmation (activate)
function MTX_Confirm({ theme:th, kind='activate' }) {
  const act = kind==='activate';
  return (
    <Shell theme={th} nav={PA_NAV} active="mtx-auth" breadcrumb={['多元營運許可','MTX-TPE-2026-001', act?'啟用確認':'暫停確認']} env="production" actor={PSB_ACTOR} health={PA_HEALTH} refreshTier="medium_slow" dataFreshness="fresh">
      <div data-screen-id="MTX-AUTH-UI-04" style={{ position:'relative', minHeight:'100%' }}>
        <div style={{ opacity:.3, pointerEvents:'none' }}><div style={{ padding:24 }}><Card theme={th} title="許可詳情"/></div></div>
        <div style={{ position:'absolute', top:40, left:'50%', transform:'translateX(-50%)', width:560 }}>
          <ConfirmModal theme={th} risk="high" title={act?'啟用多元計程車營運許可？':'暫停多元計程車營運許可？'}
            body={<span>
              <DL theme={th} cols={2} items={[
                { k:'許可代碼', v:'MTX-TPE-2026-001', mono:true }, { k:'業者', v:'智行示範車隊' },
                { k:'營業計畫版本', v:'BP-2026.07', mono:true }, { k:'營運區域', v:'臺北市 · 新北市' },
                { k:'生效費率版本', v:'FARE-MTX-2026-07', mono:true }, { k:'有效期間', v:'2026-07-01 → 無預定', mono:true },
                { k:'授權車輛數（後端）', v:'12 輛 · server-owned', mono:true }, { k:'影響數', v:'未提供 server preview · 不顯示推估' },
              ]}/>
              <span style={{ display:'block', marginTop:10, fontSize:12 }}>{act?'啟用後，之後的多元計程車派車資格檢核將可採用此許可。':'暫停後，新的派車資格檢核將不再採用此許可；進行中行程不受影響。'}</span>
            </span>}
            confirmLabel={act?'確認啟用':'確認暫停'} reasonField/>
        </div>
      </div>
    </Shell>
  );
}
// UI-05 Authorized vehicles
const MTX_VST = { active:['生效中','success'], suspended:['已暫停','warn'], removed:['已移除','neutral'] };
function MTX_Vehicles({ theme:th }) {
  const rows=[
    { id:'av_0186', veh:'VEH-DEMO-0186 · BKR-2208', s:'active', from:'2026-07-01', until:null },
    { id:'av_0187', veh:'VEH-DEMO-0187 · TDK-9317', s:'active', from:'2026-07-01', until:null },
    { id:'av_0171', veh:'VEH-DEMO-0171 · AKQ-5566', s:'suspended', from:'2026-07-01', until:'2026-07-15' },
    { id:'av_0102', veh:'VEH-DEMO-0102 · BGX-1102', s:'removed', from:'2025-07-01', until:'2026-06-30' },
  ];
  return (
    <Shell theme={th} nav={PA_NAV} active="mtx-auth" breadcrumb={['多元營運許可','MTX-TPE-2026-001','授權車輛']} env="production" actor={PSB_ACTOR} health={PA_HEALTH} refreshTier="medium_slow" dataFreshness="fresh">
      <PageHeader theme={th} title="授權車輛名單 · Authorized Vehicles" subtitle="MTX-AUTH-UI-05 · MTX-TPE-2026-001 · 車種不等於授權，須列名單且在效期內"
        meta={<Input theme={th} value="搜尋車輛 ID 或車牌" style={{width:200}}/>}
        actions={<Btn theme={th} variant="primary" icon="plus">加入車輛（含效期）</Btn>}/>
      <div style={{ padding:24, display:'flex', flexDirection:'column', gap:14 }}>
        <Card theme={th} padding={0} title="目前與歷史名單">
          <Table theme={th} columns={[
            { h:'名單紀錄 ID', k:'id', w:100, mono:true },
            { h:'車輛', w:220, mono:true, r:r=><span style={{ fontWeight:600 }}>{r.veh}</span> },
            { h:'名單狀態', w:110, r:r=><Pill theme={th} tone={MTX_VST[r.s][1]} dot>{MTX_VST[r.s][0]}<span style={{ marginLeft:4, opacity:.6, fontFamily:SHELL_MONO, fontSize:9 }}>{r.s}</span></Pill> },
            { h:'生效時間', w:110, mono:true, r:r=>r.from+' +08' },
            { h:'失效時間', w:130, mono:true, r:r=>r.until?r.until+' +08':'無預定失效日' },
            { h:'', w:150, r:r=><div style={{ display:'flex', gap:5 }}>
              <ActionButton theme={th} size="xs" descriptor={{ action:'remove', enabled:r.s==='active', riskLevel:'medium', requiresReason:true }} label="移除" en="remove"/>
              <Btn theme={th} size="xs" variant="ghost" disabled title="design-only / command pending">暫停 · 命令未核准</Btn>
            </div> },
          ]} rows={rows}/>
        </Card>
        <Banner theme={th} tone="neutral" icon="lock" body="車輛暫停動作為 design-only / command pending：對應系統命令核准前不提供。移除需確認且寫入稽核。"/>
      </div>
    </Shell>
  );
}
// UI-06 Conflict / permission states
function MTX_States({ theme:th }) {
  const cells=[
    ['讀取被拒 read denied', <EmptyState theme={th} reason="permission_denied" compact messageOverride="您沒有「多元計程車營運許可」的檢視權限（multi_taxi_authorization:read）。其他已授權區域仍可使用。"/>],
    ['可讀不可改 mutation denied', <Banner theme={th} tone="neutral" icon="lock" body="唯讀檢視：您具備讀取能力，但編輯/名單維護需 multi_taxi_authorization:write。動作已隱藏，非等待 API 拒絕。"/>],
    ['可改不可啟用 activation denied', <Banner theme={th} tone="warn" icon="lock" body="您可編輯草稿，但啟用/暫停需 multi_taxi_authorization:activate。啟用鈕顯示停用理由。"/>],
    ['匯出被拒 export denied', <Banner theme={th} tone="neutral" icon="lock" body="查詢可用；建立受控匯出需 multi_taxi_records:export。"/>],
    ['session 過期', <Banner theme={th} tone="danger" icon="warn" title="登入已逾時" body="請重新登入後繼續；表單輸入已在本機保留。" actions={<Btn theme={th} size="xs" variant="primary">重新登入</Btn>}/>],
    ['開啟中能力變更', <Banner theme={th} tone="warn" icon="warn" title="您的權限已變更" body="管理員已調整您的能力；畫面已重新載入可用動作，未儲存輸入保留。" actions={<Btn theme={th} size="xs" icon="refresh">重新整理能力</Btn>}/>],
    ['資料過期 stale', <Banner theme={th} tone="warn" icon="warn" title="此許可已被他人更新（v6 → v7）" body="您的輸入已保留。請重新載入比對後再送出；系統不允許靜默覆寫較新的生命週期狀態。" actions={<><Btn theme={th} size="xs" variant="primary" icon="refresh">重新載入</Btn><Btn theme={th} size="xs">比對差異</Btn></>}/>],
    ['授權來源不可用', <Banner theme={th} tone="danger" icon="warn" title="目前沒有可用的多元計程車營運許可" body="MULTI_TAXI_AUTHORIZATION_UNAVAILABLE · 不代入預設值；相關異動已停用。"/>],
  ];
  return (
    <Shell theme={th} nav={PA_NAV} active="mtx-auth" breadcrumb={['多元營運許可','狀態']} env="production" actor={PSB_ACTOR} health={PA_HEALTH} refreshTier="medium_slow" dataFreshness="stale">
      <PageHeader theme={th} title="衝突 / 權限狀態 · MTX-AUTH-UI-06" subtitle="§3 六種權限態 + stale/unavailable · PermissionBoundary / StaleDataBanner"/>
      <div style={{ padding:24, display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
        {cells.map(([t,el],i)=><Card theme={th} key={i} title={t} padding={14}>{el}</Card>)}
      </div>
    </Shell>
  );
}
Object.assign(window, { MTX_ST, MtxStatusChip, MtxWindow, FX_MTX_AUTH, AREA_ZH, MtxAreas, MTX_Registry, MTX_Detail, MTX_Draft, MTX_Confirm, MTX_Vehicles, MTX_VST, MTX_States });
