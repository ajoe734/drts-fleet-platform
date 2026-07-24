// ops-mtx-queue.jsx — MTX-QUEUE-UI-01..03 佇列營運 (red realm, extends Ops Console).
// v1.0 §7. queue mode 一律文字標示；multi_taxi_direct 禁 physical_rank / taxi_stand，不可 override。
const QMODE = { virtual_matching:['虛擬媒合','info'], physical_rank:['實體排班','neutral'], taxi_stand:['計程車招呼站','neutral'] };
function QueueModeChip({ theme:th, m }) { const x=QMODE[m]; return <Pill theme={th} tone={x[1]} dot>{x[0]}<span style={{ marginLeft:4, opacity:.6, fontFamily:SHELL_MONO, fontSize:9 }}>{m}</span></Pill>; }
const FX_QUEUE = [
  { drv:'吳明翰 · drv_0186', veh:'BKR-2208', profile:'multi_taxi_direct', mode:'virtual_matching', site:'—', area:'TPE', auth:'MTX-TPE-2026-001', elig:'eligible', in:'13:58', up:'14:29' },
  { drv:'林建成 · drv_0201', veh:'TDK-9317', profile:'multi_taxi_direct', mode:'virtual_matching', site:'—', area:'NWT', auth:'MTX-TPE-2026-001', elig:'eligible', in:'14:05', up:'14:28' },
  { drv:'張志豪 · drv_0114', veh:'AKQ-5566', profile:'ordinary_taxi', mode:'physical_rank', site:'STN-台北車站東', area:'TPE', auth:'—', elig:'eligible', in:'14:10', up:'14:30' },
  { drv:'游志豪 · drv_0079', veh:'BGX-1102', profile:'ordinary_taxi', mode:'taxi_stand', site:'STD-市府轉運站', area:'TPE', auth:'—', elig:'eligible', in:'14:12', up:'14:30' },
  { drv:'陳大明 · drv_0230', veh:'VEH-DEMO-0186', profile:'multi_taxi_direct', mode:'physical_rank', site:'STN-台北車站東', area:'TPE', auth:'MTX-TPE-2026-001', elig:'denied', in:'—', up:'14:31', hl:true },
];
function OC_QueueOverview({ theme:th }) {
  return (
    <Shell theme={th} nav={OPS_NAV} active="queue-ops" breadcrumb={['派遣','佇列營運']} env="production" actor={OPS_ACTOR} health={OPS_HEALTH} refreshTier="dispatch" dataFreshness="fresh">
      <PageHeader theme={th} title="佇列總覽 · Queue Overview" subtitle="MTX-QUEUE-UI-01 · queue mode 一律文字標示 · 空 siteId 不得使實體佇列看似虛擬媒合"
        meta={<><Select theme={th} value="佇列模式：全部"/><Select theme={th} value="runtime profile：全部"/><Select theme={th} value="營運區域：全部"/><Select theme={th} value="站點：全部"/><Select theme={th} value="資格：全部"/><Input theme={th} value="駕駛 / 車輛" style={{width:130}}/></>}/>
      <div style={{ padding:24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h:'駕駛', w:150, mono:true, r:r=><span style={{ fontWeight:600 }}>{r.drv}</span> },
            { h:'車輛', k:'veh', w:120, mono:true },
            { h:'runtime profile', w:140, mono:true, r:r=><span style={{ fontSize:10.5, color:r.profile==='multi_taxi_direct'?th.accent:th.textMuted }}>{r.profile}</span> },
            { h:'佇列模式', w:150, r:r=><QueueModeChip theme={th} m={r.mode}/> },
            { h:'站點 siteId', w:130, mono:true, r:r=>r.site==='—'?<span style={{ color:th.textDim }}>—（虛擬）</span>:r.site },
            { h:'區域', k:'area', w:56, mono:true },
            { h:'營運許可', w:150, mono:true, r:r=>r.auth==='—'?<span style={{ color:th.textDim }}>—</span>:r.auth },
            { h:'資格', w:96, r:r=>r.elig==='eligible'?<Pill theme={th} tone="success" dot>符合</Pill>:<Pill theme={th} tone="danger" dot>拒絕 · 法定</Pill> },
            { h:'進場', k:'in', w:60, mono:true },
            { h:'更新', k:'up', w:60, mono:true },
            { h:'', w:70, r:()=><Btn theme={th} size="xs" variant="ghost" icon="arrow-right">詳情</Btn> },
          ]} rows={FX_QUEUE}/>
        </Card>
      </div>
    </Shell>
  );
}
function OC_QueueEntry({ theme:th }) {
  return (
    <Shell theme={th} nav={OPS_NAV} active="queue-ops" breadcrumb={['佇列營運','drv_0186']} env="production" actor={OPS_ACTOR} health={OPS_HEALTH} refreshTier="dispatch" dataFreshness="fresh">
      <PageHeader theme={th} title={<span style={{ display:'inline-flex', alignItems:'center', gap:10 }}>吳明翰 · BKR-2208<QueueModeChip theme={th} m="virtual_matching"/></span>}
        subtitle="MTX-QUEUE-UI-02 · multi_taxi_direct · 進場 13:58 +08 · 最後更新 14:29"/>
      <div style={{ padding:24, display:'grid', gridTemplateColumns:'1.35fr 1fr', gap:16, alignItems:'start' }}>
        <Card theme={th} title="Runtime profile 與資格">
          <DL theme={th} cols={2} items={[
            { k:'runtime profile', v:'multi_taxi_direct', mono:true }, { k:'acquisitionMode', v:'platform_reserved', mono:true },
            { k:'timingMode', v:'on_demand | scheduled', mono:true }, { k:'佇列模式', v:<QueueModeChip theme={th} m="virtual_matching"/> },
            { k:'營運許可', v:'MTX-TPE-2026-001 · 已核准', mono:true }, { k:'授權車輛', v:'名單內 · 生效中', mono:false },
            { k:'生效費率', v:'FARE-MTX-2026-07 · active', mono:true }, { k:'資格判定', v:<Pill theme={th} tone="success" dot>符合 · eligible</Pill> },
          ]}/>
          <div style={{ marginTop:10 }}><Banner theme={th} tone="info" icon="info" body="多元計程車僅允許虛擬媒合；street_hail / physical_rank / taxi_stand 為法定禁止，本畫面僅顯示伺服器判定。"/></div>
        </Card>
        <Card theme={th} title="站點 · 服務區">
          <DL theme={th} cols={1} items={[
            { k:'siteId', v:'—（虛擬媒合無站點）', mono:true }, { k:'serviceAreaCode', v:'TPE · 臺北市', mono:true },
            { k:'check-in', v:'13:58:04 +08', mono:true }, { k:'last update', v:'14:29:12 +08', mono:true },
          ]}/>
        </Card>
      </div>
    </Shell>
  );
}
function OC_QueueDenial({ theme:th, stand }) {
  return (
    <Shell theme={th} nav={OPS_NAV} active="queue-ops" breadcrumb={['佇列營運','法定拒絕']} env="production" actor={OPS_ACTOR} health={OPS_HEALTH} refreshTier="dispatch" dataFreshness="fresh">
      <PageHeader theme={th} title="不可繞過之法定拒絕 · Legal Denial" subtitle={'MTX-QUEUE-UI-03 · '+(stand?'taxi_stand':'physical_rank')+' · 無 override / 強制進場'}/>
      <div style={{ padding:24, display:'flex', flexDirection:'column', gap:14, maxWidth:860 }}>
        <div style={{ border:'2px solid '+th.danger, borderRadius:12, overflow:'hidden' }}>
          <div style={{ background:th.danger, color:'#fff', padding:'10px 16px', display:'flex', alignItems:'center', gap:9 }}>
            <MgmtIcon name="incidents" size={17}/><span style={{ fontSize:14, fontWeight:800 }}>法定限制 · 不可繞過</span>
          </div>
          <div style={{ padding:16, background:th.surface }}>
            <div style={{ fontSize:15, fontWeight:800, color:th.text, lineHeight:1.6 }}>{stand?'此車輛屬多元化計程車服務，不得於計程車招呼站排班候客。':'此車輛屬多元化計程車服務，不得進入實體排班候客。'}</div>
            <div style={{ marginTop:12 }}>
              <DL theme={th} cols={2} items={[
                { k:'佇列模式 · 站點', v:<span><QueueModeChip theme={th} m={stand?'taxi_stand':'physical_rank'}/> <span style={{ fontFamily:SHELL_MONO, fontSize:11 }}>{stand?'STD-市府轉運站':'STN-台北車站東'}</span></span> },
                { k:'駕駛 / 車輛', v:'陳大明 · VEH-DEMO-0186', mono:true },
                { k:'runtime profile', v:'multi_taxi_direct', mono:true },
                { k:'營運許可參照', v:'MTX-TPE-2026-001', mono:true },
              ]}/>
            </div>
            <div style={{ marginTop:12, display:'flex', gap:8, flexWrap:'wrap' }}>
              <Btn theme={th} variant="primary" icon="refresh">回到虛擬媒合</Btn>
              <Btn theme={th} icon="users">聯絡權責管理員</Btn>
            </div>
            <div style={{ marginTop:10, fontSize:10.5, color:th.textDim }}>原始代碼僅供稽核：P5_QUEUE_MODE_FORBIDDEN · 本畫面無 override / force check-in 控制項。</div>
          </div>
        </div>
        <Banner theme={th} tone="neutral" icon="lock" body="拒絕訊息與「無覆寫」須直接可見，不得收合於次要面板；此訊息不自動消失。"/>
      </div>
    </Shell>
  );
}
Object.assign(window, { QMODE, QueueModeChip, FX_QUEUE, OC_QueueOverview, OC_QueueEntry, OC_QueueDenial });
