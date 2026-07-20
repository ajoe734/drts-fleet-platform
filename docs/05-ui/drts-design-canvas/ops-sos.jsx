// ops-sos.jsx — S-3 值班端 (S3-O01..O06)。智行叫車 duty surface：專屬精簡 nav，不與其他營運模組混排。
const S3O_NAV = [
  { divider: '智行叫車 · 值班' },
  { key: 'board', icon: 'dispatch', label: '派車看板 · Board' },
  { key: 'sos', icon: 'incidents', label: 'SOS 緊急事件', badge: '1', badgeTone: 'danger' },
  { key: 'trips', icon: 'reports', label: '行程 · Trips' },
  { key: 'records', icon: 'audit', label: '營運紀錄 · Records' },
];
const S3O_ACTOR = { name: 'WX', display: '王小明', role: 'duty_operator' };
const S3O_HEALTH = { status: 'healthy', lastCheckedAt: '3s' };
function S3oShell({ theme:th, active='sos', breadcrumb, children }) {
  return <Shell theme={th} nav={S3O_NAV} active={active} breadcrumb={['智行叫車', ...breadcrumb]} env="production" tenant="智行叫車" actor={S3O_ACTOR} health={S3O_HEALTH} refreshTier="dispatch" dataFreshness="fresh">{children}</Shell>;
}
const FX_SOS_ROWS = [
  { no:'SOS-20260720-0012', status:'待確認', tone:'danger', wait:'00:42', driver:'吳明翰', plate:'BKR-2208', order:'ZX-240720-0186', loc:'信義區松仁路 100 號附近', type:'交通事故', ack:'—', hl:true },
  { no:'SOS-20260720-0011', status:'調查中', tone:'warn', wait:'—', driver:'林建成', plate:'TDK-9317', order:'ZX-240720-0171', loc:'中山區民生東路二段', type:'乘客急病', ack:'王小明' },
  { no:'SOS-20260719-0009', status:'駕駛回報誤觸', tone:'neutral', wait:'—', driver:'張志豪', plate:'AKQ-5566', order:'—', loc:'內湖區瑞光路', type:'—', ack:'陳雅雯' },
  { no:'SOS-20260718-0007', status:'已結案', tone:'success', wait:'—', driver:'吳明翰', plate:'BKR-2208', order:'ZX-240718-0102', loc:'大安區復興南路一段', type:'治安事件', ack:'王小明' },
];
function SosSoundChip({ theme:th, on=true }) {
  return <Pill theme={th} tone={on?'success':'warn'} dot>{on?'提示音已啟用':'提示音未啟用'}<span style={{ marginLeft:4, opacity:.6, fontFamily:SHELL_MONO, fontSize:9 }}>{on?'sound_on':'sound_off'}</span></Pill>;
}
// O01 · Critical alert overlay
function S3O_Alert({ theme:th }) {
  return (
    <S3oShell theme={th} breadcrumb={['SOS 佇列']}>
      <div style={{ position:'relative', minHeight:'100%' }}>
        <div style={{ opacity:.35, pointerEvents:'none' }}><SosQueueBody theme={th}/></div>
        <div style={{ position:'absolute', top:18, left:'50%', transform:'translateX(-50%)', width:640, background:th.surface, border:'2px solid '+th.danger, borderRadius:14, boxShadow:'0 24px 60px -18px rgba(150,20,12,.45)', overflow:'hidden' }}>
          <div style={{ background:th.danger, color:'#fff', padding:'10px 16px', display:'flex', alignItems:'center', gap:10 }}>
            <MgmtIcon name="incidents" size={18}/>
            <span style={{ fontSize:14.5, fontWeight:800, flex:1 }}>SOS 緊急通報 · 待確認</span>
            <span style={{ fontFamily:SHELL_MONO, fontSize:13, fontWeight:700 }}>已等待 00:42</span>
          </div>
          <div style={{ padding:16 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
              <span style={{ fontFamily:SHELL_MONO, fontSize:15, fontWeight:800, color:th.danger }}>SOS-20260720-0012</span>
              <Pill theme={th} tone="danger" dot>交通事故 · 重大</Pill>
              <span style={{ flex:1 }}/>
              <SosSoundChip theme={th} on/>
            </div>
            <DL theme={th} cols={3} items={[
              { k:'駕駛', v:'吳明翰' }, { k:'車牌', v:'BKR-2208', mono:true }, { k:'行程', v:'ZX-240720-0186', mono:true },
              { k:'位置', v:'信義區松仁路 100 號附近' }, { k:'觸發時間', v:'14:30:12', mono:true }, { k:'附件', v:'照片 2 · 語音 1' },
            ]}/>
            <div style={{ display:'flex', gap:9, marginTop:14 }}>
              <Btn theme={th} variant="primary" icon="check">確認接手 · Acknowledge</Btn>
              <Btn theme={th} icon="arrow-right">開啟詳情</Btn>
              <span style={{ flex:1 }}/>
              <span style={{ fontSize:10.5, color:th.textDim, alignSelf:'center' }}>此警示不會自動消失</span>
            </div>
          </div>
        </div>
      </div>
    </S3oShell>
  );
}
function SosQueueBody({ theme:th, soundOff }) {
  return (
    <div style={{ padding:24, display:'flex', flexDirection:'column', gap:14 }}>
      {soundOff && <Banner theme={th} tone="warn" icon="warn" title="SOS 提示音尚未啟用"
        body="請點此啟用瀏覽器提示音。啟用前系統仍會以持續視覺警示呈現新事件，不會僅依聲音。"
        actions={<Btn theme={th} size="xs" variant="primary">啟用提示音</Btn>}/>}
      <Card theme={th} padding={0} title="SOS 佇列" actions={<SosSoundChip theme={th} on={!soundOff}/>}>
        <Table theme={th} columns={[
          { h:'事件編號', w:170, mono:true, r:r=><span style={{ color:r.hl?th.danger:th.accent, fontWeight:700 }}>{r.no}</span> },
          { h:'狀態', w:120, r:r=><Pill theme={th} tone={r.tone} dot>{r.status}</Pill> },
          { h:'等待', w:70, mono:true, r:r=><span style={{ color:r.hl?th.danger:th.text, fontWeight:r.hl?700:400 }}>{r.wait}</span> },
          { h:'駕駛', k:'driver', w:80 },
          { h:'車牌', k:'plate', w:96, mono:true },
          { h:'行程', k:'order', w:150, mono:true },
          { h:'位置', k:'loc', w:180 },
          { h:'事件類型', k:'type', w:90 },
          { h:'值班確認人', k:'ack', w:96 },
        ]} rows={FX_SOS_ROWS}/>
      </Card>
    </div>
  );
}
function S3O_Queue({ theme:th, soundOff }) {
  return (
    <S3oShell theme={th} breadcrumb={['SOS 佇列']}>
      <PageHeader theme={th} title="SOS 緊急事件" subtitle="線上通報 p95 ≤ 5 秒送達值班端 · 先確認者取得處理權"
        meta={<Pill theme={th} tone="danger" dot>1 件待確認</Pill>} actions={<Btn theme={th} icon="filter">篩選</Btn>}/>
      <SosQueueBody theme={th} soundOff={soundOff}/>
    </S3oShell>
  );
}
// O03/O04/O05 · Detail (+acknowledged / investigation)
function S3O_Detail({ theme:th, phase='new' }) {
  const acked = phase!=='new';
  const TL = [
    { at:'14:30:12', tone:'danger', t:'駕駛啟動 SOS', body:'行程中長按啟動' },
    { at:'14:30:14', tone:'danger', t:'駕駛確認通報車隊' },
    { at:'14:30:15', tone:'info', t:'系統收到通報', body:'事件編號 SOS-20260720-0012' },
    { at:'14:30:16', tone:'info', t:'已通知值班端' },
    ...(acked?[{ at:'14:31:02', tone:'success', t:'值班人員已確認', body:'王小明 接手處理' }]:[]),
    ...(phase==='inv'?[
      { at:'14:33', tone:'accent', t:'駕駛補充資訊', body:'交通事故 · 重大 · 文字說明' },
      { at:'14:35', tone:'accent', t:'附件已上傳', body:'照片 2 · 語音 1' },
      { at:'14:40', tone:'warn', t:'開始調查', body:'關聯事件案件 INC-20260720-031' },
      { at:'15:02', tone:'success', t:'已處理', body:'已聯繫駕駛並確認人員平安' },
    ]:[]),
  ];
  return (
    <S3oShell theme={th} breadcrumb={['SOS 佇列','SOS-20260720-0012']}>
      <PageHeader theme={th}
        title={<span style={{ display:'inline-flex', alignItems:'center', gap:10 }}>SOS-20260720-0012<Pill theme={th} tone={phase==='inv'?'warn':acked?'accent':'danger'} dot>{phase==='inv'?'調查中':acked?'已確認':'待確認'}</Pill></span>}
        subtitle="交通事故 · 重大 · 吳明翰 · BKR-2208 · ZX-240720-0186"
        meta={acked && <Pill theme={th} tone="success">已由 王小明 於 14:31 確認</Pill>}
        actions={<>
          {!acked && <Btn theme={th} variant="primary" icon="check">確認接手</Btn>}
          {acked && phase!=='inv' && <Btn theme={th} variant="primary" icon="governance">開始調查</Btn>}
          {phase==='inv' && <Btn theme={th} variant="primary" icon="check">結案</Btn>}
          <Btn theme={th} icon="ext">關聯事件案件</Btn>
        </>}/>
      <div style={{ padding:24, display:'grid', gridTemplateColumns:'1.45fr 1fr', gap:16, alignItems:'start' }}>
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <Card theme={th} padding={0} title="位置 · 通報當下座標">
            <div style={{ height:190, background:'linear-gradient(135deg,'+th.accentBg+','+th.surfaceLo+')', position:'relative' }}>
              <div style={{ position:'absolute', left:'46%', top:'40%' }}><span style={{ display:'block', width:16, height:16, borderRadius:8, background:th.danger, border:'3px solid '+th.surface, boxShadow:'0 0 0 4px '+th.danger+'33' }}/></div>
              <div style={{ position:'absolute', left:12, bottom:10, fontSize:11, background:th.surface, padding:'4px 9px', borderRadius:6, color:th.textMuted }}>信義區松仁路 100 號附近 · 精度 12m · 14:30:12</div>
            </div>
          </Card>
          <Card theme={th} title="SOS 時間軸" subtitle="occurredAt / actor / source 完整入稽核">
            <Timeline theme={th} events={TL}/>
          </Card>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <Card theme={th} title="自動附帶內容">
            <DL theme={th} cols={1} items={[
              { k:'行程編號', v:'ZX-240720-0186', mono:true }, { k:'車牌', v:'BKR-2208', mono:true }, { k:'駕駛', v:'吳明翰' },
              { k:'原始觸發時間', v:'2026/07/20 14:30:12', mono:true }, { k:'觸發時網路', v:'連線中 · 即時送達' },
            ]}/>
          </Card>
          <Card theme={th} title="駕駛補充 / 附件">
            {phase==='inv'
              ? <>
                <DL theme={th} cols={1} items={[{ k:'事件類型', v:'交通事故 · 重大' }, { k:'說明', v:'與後方車輛擦撞，人員無明顯外傷。' }]}/>
                <div style={{ display:'flex', gap:8, marginTop:10 }}>
                  {['照片 1','照片 2'].map(p=><div key={p} style={{ width:74, height:74, borderRadius:9, background:th.surfaceLo, border:'1px solid '+th.border, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10.5, color:th.textMuted }}>{p}</div>)}
                  <div style={{ flex:1, borderRadius:9, background:th.surfaceLo, border:'1px solid '+th.border, display:'flex', alignItems:'center', justifyContent:'center', gap:6, fontSize:11.5, color:th.textMuted }}><MgmtIcon name="audio" size={13}/>語音 0:42</div>
                </div>
              </>
              : <EmptyState theme={th} reason="no_data" compact messageOverride="駕駛尚未補充；不影響值班處置。"/>}
          </Card>
          <Card theme={th} title="處理權">
            <Banner theme={th} tone={acked?'success':'neutral'} icon={acked?'check':'info'}
              body={acked?'已由 王小明 於 14:31 確認接手；其他值班人員不再顯示主要確認按鈕。':'先確認者取得處理權；其他人將看到目前負責人。'}/>
          </Card>
        </div>
      </div>
    </S3oShell>
  );
}
Object.assign(window, { S3O_NAV, S3O_ACTOR, S3oShell, FX_SOS_ROWS, SosSoundChip, SosQueueBody, S3O_Alert, S3O_Queue, S3O_Detail });
