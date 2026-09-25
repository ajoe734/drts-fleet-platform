// platform-mtx-commerce.jsx — P5-RATE-UI-01..03 評價治理 + P5-COM-UI-01..05 商務/紀錄 (platform realm).
// v1.0 §8/§9/§10. 樣本資料 §18 虛構。fail-closed；不提供 mark-paid / 直接改評分 / 瀏覽器端匯出。
const RATE_ST = { active:['有效','success'], under_review:['審查中','warn'], invalidated:['已作廢','neutral'] };
function RateChip({ theme:th, s }) { const m=RATE_ST[s]; return <Pill theme={th} tone={m[1]} dot>{m[0]}<span style={{ marginLeft:4, opacity:.6, fontFamily:SHELL_MONO, fontSize:9 }}>{s}</span></Pill>; }
const FX_RATINGS = [
  { id:'rat_88231', score:1, tags:'繞路 · 態度', comment:'司機繞路且態度惡劣，多收 200 元…', driver:'吳明翰', ref:'ZX-240720-0186', s:'under_review', at:'07-20 15:20', up:'07-22 09:11', hl:true },
  { id:'rat_88198', score:5, tags:'準時 · 有禮', comment:'服務很好，車內乾淨。', driver:'吳明翰', ref:'ZX-240718-0102', s:'active', at:'07-18 19:02', up:'07-18 19:02' },
  { id:'rat_88102', score:2, tags:'車內異味', comment:'（內容含個資已遮）電話 09**-***-***…', driver:'林建成', ref:'ZX-240715-0071', s:'invalidated', at:'07-15 12:40', up:'07-16 10:00' },
];
function P5R_Queue({ theme:th }) {
  return (
    <Shell theme={th} nav={PA_NAV} active="p5-ratings" breadcrumb={['平台商務','評價治理']} env="production" actor={PSB_ACTOR} health={PA_HEALTH} refreshTier="medium_slow" dataFreshness="fresh">
      <PageHeader theme={th} title="評價治理 · Rating Review" subtitle="P5-RATE-UI-01 · rating:moderate"
        tabs={[{id:'review',label:'審查中',badge:'1',tone:'warn'},{id:'active',label:'有效'},{id:'invalid',label:'已作廢'}]} activeTab="review"
        meta={<><Select theme={th} value="分數：全部"/><Select theme={th} value="標籤：全部"/><Select theme={th} value="駕駛：全部"/><Select theme={th} value="送出日期：近 30 天"/></>}/>
      <div style={{ padding:24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h:'分數', w:70, r:r=><span style={{ fontWeight:800, color:r.score<=2?th.danger:th.text }}>{r.score} ★</span> },
            { h:'標籤', k:'tags', w:110 },
            { h:'留言摘錄', w:230, r:r=><span style={{ fontSize:11.5, color:th.textMuted }}>{r.comment}</span> },
            { h:'駕駛', k:'driver', w:80 },
            { h:'行程/訂單', k:'ref', w:150, mono:true },
            { h:'狀態', w:110, r:r=><RateChip theme={th} s={r.s}/> },
            { h:'送出', k:'at', w:96, mono:true },
            { h:'更新', k:'up', w:96, mono:true },
            { h:'', w:80, r:()=><Btn theme={th} size="xs" variant="ghost" icon="arrow-right">審查</Btn> },
          ]} rows={FX_RATINGS}/>
        </Card>
      </div>
    </Shell>
  );
}
function P5R_Detail({ theme:th, confirm }) {
  return (
    <Shell theme={th} nav={PA_NAV} active="p5-ratings" breadcrumb={['評價治理','rat_88231']} env="production" actor={PSB_ACTOR} health={PA_HEALTH} refreshTier="medium_slow" dataFreshness="fresh">
      <PageHeader theme={th} title={<span style={{ display:'inline-flex', alignItems:'center', gap:10 }}>rat_88231 · 1★<RateChip theme={th} s="under_review"/></span>}
        subtitle="P5-RATE-UI-02 · ZX-240720-0186 · 已完成行程之評價"
        actions={<><Btn theme={th} variant="secondary" danger icon="x">作廢此評價</Btn><Btn theme={th} disabled title="design-only / command pending">恢復有效 · 命令未核准</Btn></>}/>
      <div style={{ padding:24, display:'grid', gridTemplateColumns:'1.4fr 1fr', gap:16, alignItems:'start' }}>
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <Card theme={th} title="評價內容">
            <DL theme={th} cols={2} items={[
              { k:'分數', v:'1 ★' }, { k:'標籤', v:'繞路 · 態度' },
              { k:'送出時間', v:'07-20 15:20 +08', mono:true }, { k:'乘客參照', v:<span style={{ fontFamily:SHELL_MONO }}>psg-••••-4A2 <Pill theme={th} tone="neutral">遮罩</Pill></span> },
            ]}/>
            <div style={{ marginTop:10, padding:'10px 12px', borderRadius:8, background:th.surfaceLo, fontSize:12.5, lineHeight:1.6 }}>「司機繞路且態度惡劣，多收 200 元…」</div>
          </Card>
          <Card theme={th} title="行程參照 · 駕駛">
            <DL theme={th} cols={2} items={[
              { k:'行程', v:'ZX-240720-0186', mono:true }, { k:'完成時間', v:'07-20 15:07 +08', mono:true },
              { k:'駕駛', v:'吳明翰 · drv_0186', mono:true }, { k:'車牌', v:'BKR-2208', mono:true },
            ]}/>
          </Card>
          <Card theme={th} title="治理歷程 · ModerationHistory">
            <Timeline theme={th} events={[
              { at:'07-20 15:20', tone:'neutral', t:'評價送出 · active' },
              { at:'07-22 09:11', tone:'warn', t:'轉入審查 · under_review', body:'駕駛申訴 CS-2260 · 王審核員' },
              { tone:'accent', t:'審查中', body:'待決策', current:true },
            ]}/>
          </Card>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <Card theme={th} title="目前彙總 · aggregate">
            <DL theme={th} cols={2} items={[
              { k:'averageRating', v:'4.9', mono:true }, { k:'ratingCount', v:'328', mono:true },
              { k:'lastRatedAt', v:'07-20 15:20', mono:true }, { k:'aggregateVersion', v:'v212 · calc 07-22 02:00', mono:true },
            ]}/>
            <div style={{ marginTop:8 }}><Banner theme={th} tone="neutral" icon="lock" body="彙總為 server-owned；不提供直接編輯分數/次數/平均。作廢後彙總將重建。"/></div>
          </Card>
          <Card theme={th} title="稽核"><DL theme={th} cols={1} items={[{ k:'audit', v:'aud_rate_0441', mono:true },{ k:'操作者', v:'王審核員 · rating:moderate' }]}/></Card>
        </div>
      </div>
      {confirm && <ConfirmModal theme={th} risk="high" title="作廢此評價？" body="rat_88231 · 1★ 將標記為已作廢；駕駛彙總（4.9 / 328）將由系統重建。需填寫作廢理由並寫入稽核。" confirmLabel="確認作廢" reasonField/>}
    </Shell>
  );
}
function P5R_Authority({ theme:th }) {
  const C=({t,children})=><Card theme={th} title={t} padding={14}>{children}</Card>;
  return (
    <Shell theme={th} nav={PA_NAV} active="p5-ratings" breadcrumb={['評價治理','駕駛評價權威']} env="production" actor={PSB_ACTOR} health={PA_HEALTH} refreshTier="medium_slow" dataFreshness="fresh">
      <PageHeader theme={th} title="駕駛評價權威 · DriverRatingAuthorityCard" subtitle="P5-RATE-UI-03 · unavailable 永不呈現為 5.0 / 0.0 / 新加入駕駛"/>
      <div style={{ padding:24, display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14 }}>
        <C t="rated · 有評價">
          <div style={{ fontSize:26, fontWeight:800 }}>4.9 <span style={{ fontSize:13, color:th.textMuted, fontWeight:500 }}>· 328 則評價</span></div>
          <DL theme={th} cols={1} items={[{ k:'lastRatedAt', v:'07-20 15:20', mono:true },{ k:'aggregateVersion', v:'v212', mono:true },{ k:'calculatedAt', v:'07-22 02:00', mono:true }]}/>
        </C>
        <C t="new_driver · 新加入駕駛">
          <Pill theme={th} tone="info">新加入駕駛</Pill>
          <div style={{ fontSize:12, color:th.textMuted, marginTop:8 }}>尚無乘車評價；不顯示任何星等數字。</div>
        </C>
        <C t="unavailable · 無法使用">
          <Banner theme={th} tone="warn" icon="warn" title="評價資料目前無法使用" body="P5_RATING_STATE_UNINITIALIZED · 不得以 5.0 / 0.0 / 新加入駕駛 代替。"/>
        </C>
      </div>
    </Shell>
  );
}
// ── P5-COM-UI-01 fare anomaly ──
const FX_ANOMALIES = [
  { ref:'REQ-240723-0031', route:'信義 松仁路 → 南港展覽館', reason:'quote_provider_unavailable', zh:'暫時無法取得預估車資', fare:'—', at:'09:41', retry:true },
  { ref:'REQ-240723-0028', route:'中山 南京東路 → 桃機 T2', reason:'quote_out_of_range', zh:'預估車資超出可接受範圍', fare:'NT$ 9,400', at:'09:22', retry:false },
  { ref:'REQ-240723-0022', route:'內湖 瑞光路 →（未解析）', reason:'route_unresolved', zh:'尚無法確認預估路線', fare:'—', at:'08:50', retry:true },
  { ref:'REQ-240723-0017', route:'板橋 文化路 → 台大醫院', reason:'fare_policy_missing', zh:'目前沒有可用的生效費率', fare:'—', at:'08:12', retry:false },
  { ref:'REQ-240722-0090', route:'高雄 博愛路 → 左營高鐵', reason:'calculation_mismatch', zh:'車資計算結果需要重新確認', fare:'NT$ 310 / 355', at:'昨 22:10', retry:true },
];
function P5C_Anomaly({ theme:th }) {
  return (
    <Shell theme={th} nav={PA_NAV} active="p5-commerce" breadcrumb={['平台商務','費率異常']} env="production" actor={PSB_ACTOR} health={PA_HEALTH} refreshTier="dispatch" dataFreshness="fresh">
      <PageHeader theme={th} title="費率異常 · Fare Anomalies" subtitle="P5-COM-UI-01 · fail-closed：正式報價完成前不確認訂單 · 無人工金額欄位"
        meta={<Pill theme={th} tone="warn" dot>5 筆待處理</Pill>}/>
      <div style={{ padding:24, display:'flex', flexDirection:'column', gap:12 }}>
        {FX_ANOMALIES.map(a=>(
          <Card theme={th} key={a.ref} padding={14}>
            <div style={{ display:'flex', alignItems:'center', gap:11, flexWrap:'wrap' }}>
              <MgmtIcon name="warn" size={16} style={{ color:th.warn }}/>
              <span style={{ fontFamily:SHELL_MONO, fontSize:12, color:th.accent, fontWeight:700 }}>{a.ref}</span>
              <span style={{ fontSize:12.5, flex:1, minWidth:180 }}>{a.route}</span>
              <span style={{ fontSize:12.5, fontWeight:700, color:th.warn }}>{a.zh}</span>
              <span style={{ fontFamily:SHELL_MONO, fontSize:10.5, color:th.textDim }}>{a.reason}</span>
              <span style={{ fontFamily:SHELL_MONO, fontSize:11 }}>{a.fare}</span>
              <span style={{ fontFamily:SHELL_MONO, fontSize:10.5, color:th.textDim }}>{a.at} +08</span>
              {a.retry?<Btn theme={th} size="xs" variant="primary" icon="refresh">重新取得報價</Btn>:<Pill theme={th} tone="neutral">不可重試 · 待費率生效</Pill>}
            </div>
            <div style={{ marginTop:7, fontSize:10.5, color:th.textDim }}>費率版本 FARE-MTX-2026-07 · 可否重試由後端回傳 · 不提供手動金額覆寫</div>
          </Card>
        ))}
      </div>
    </Shell>
  );
}
// ── P5-COM-UI-02 payment exception ──
const PAY_ST = { not_selected:['尚未選擇','neutral'], authorized:['已授權','info'], captured:['已完成','success'], failed:['付款失敗','danger'], refunded:['已退款','neutral'], manual_recovery:['人工處理中','warn'] };
function P5C_Payment({ theme:th }) {
  return (
    <Shell theme={th} nav={PA_NAV} active="p5-commerce" breadcrumb={['平台商務','付款例外','ZX-240720-0186']} env="production" actor={PSB_ACTOR} health={PA_HEALTH} refreshTier="medium" dataFreshness="fresh">
      <PageHeader theme={th} title={<span style={{ display:'inline-flex', alignItems:'center', gap:10 }}>付款例外 · ZX-240720-0186<Pill theme={th} tone="danger" dot>付款失敗<span style={{ marginLeft:4, opacity:.6, fontFamily:SHELL_MONO, fontSize:9 }}>failed</span></Pill></span>}
        subtitle="P5-COM-UI-02 · 不顯示卡號 · failed / manual_recovery 永不呈現為已付款"
        actions={<><ActionButton theme={th} descriptor={{ action:'retry_capture', enabled:true, riskLevel:'medium' }} icon="refresh" label="重試請款（後端允許）" en="retry"/><Btn theme={th} disabled title="不提供 mark-paid">標記已付 · 不存在</Btn></>}/>
      <div style={{ padding:24, display:'grid', gridTemplateColumns:'1.35fr 1fr', gap:16, alignItems:'start' }}>
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <Card theme={th} title="付款資訊">
            <DL theme={th} cols={2} items={[
              { k:'應付金額', v:'NT$ 355 · TWD', mono:true }, { k:'狀態', v:<Pill theme={th} tone="danger" dot>付款失敗</Pill> },
              { k:'provider 參照', v:'pay_••••_88f2（安全遮罩）', mono:true }, { k:'嘗試 / 更新', v:'3 次 · 07-20 15:12 +08', mono:true },
            ]}/>
          </Card>
          <Card theme={th} title="稽核時間軸">
            <Timeline theme={th} events={[
              { at:'15:07', tone:'info', t:'行程完成 · 產生應收 NT$ 355' },
              { at:'15:08', tone:'warn', t:'第 1 次請款失敗', body:'發卡行拒絕' },
              { at:'15:10', tone:'warn', t:'第 2–3 次請款失敗' },
              { at:'15:12', tone:'danger', t:'轉入付款例外 · failed', current:true },
            ]}/>
          </Card>
        </div>
        <Card theme={th} title="狀態一覽 · PaymentStatusChip">
          <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
            {Object.entries(PAY_ST).map(([k,[zh,tone]])=><Pill key={k} theme={th} tone={tone} dot>{zh}<span style={{ marginLeft:4, opacity:.6, fontFamily:SHELL_MONO, fontSize:9 }}>{k}</span></Pill>)}
          </div>
          <div style={{ marginTop:10 }}><Banner theme={th} tone="neutral" icon="lock" body="可用回復動作由後端回傳；不發明 mark-paid 控制。"/></div>
        </Card>
      </div>
    </Shell>
  );
}
// ── P5-COM-UI-03 certificate support ──
function P5C_Cert({ theme:th }) {
  const states=[['available','可開啟 HTML/PDF','success'],['generating','產生中','info'],['unavailable','不可用','neutral'],['failed','產生失敗','danger'],['access denied','無存取權','neutral'],['superseded','已被新版取代','warn']];
  return (
    <Shell theme={th} nav={PA_NAV} active="p5-commerce" breadcrumb={['平台商務','乘車證明支援']} env="production" actor={PSB_ACTOR} health={PA_HEALTH} refreshTier="manual" dataFreshness="fresh">
      <PageHeader theme={th} title="電子乘車證明支援 · Certificate Support" subtitle="P5-COM-UI-03 · 定位與重開既有證明 · 重產生為 design-only / command pending"
        meta={<Input theme={th} value="搜尋 訂單 / 行程 / 證明編號" style={{width:230}}/>}/>
      <div style={{ padding:24, display:'grid', gridTemplateColumns:'1.4fr 1fr', gap:16, alignItems:'start' }}>
        <Card theme={th} title="RC-2607••-0186 · v2">
          <DL theme={th} cols={2} items={[
            { k:'訂單 / 行程', v:'ZX-240720-0186', mono:true }, { k:'車牌', v:'BKR-2208', mono:true },
            { k:'上車 / 下車', v:'14:32 / 15:07 +08', mono:true }, { k:'時間 / 里程', v:'35 分 · 6,420 m', mono:true },
            { k:'車資 / 通行費', v:'NT$ 355 / NT$ 0', mono:true }, { k:'路線摘要', v:'松仁路 → 南京東路二段' },
            { k:'客服 / 申訴電話', v:'0800-090-000 · 1999', mono:true }, { k:'簽發 / 版本', v:'07-20 15:08 · v2', mono:true },
          ]}/>
          <div style={{ display:'flex', gap:8, marginTop:12 }}>
            <Btn theme={th} variant="primary" icon="eye">開啟 HTML</Btn><Btn theme={th} icon="download">開啟 PDF</Btn>
            <Btn theme={th} disabled title="design-only / command pending">重新產生 · 命令未核准</Btn>
          </div>
          <div style={{ marginTop:8 }}><Banner theme={th} tone="warn" icon="info" body="v1 已被 v2 取代（superseded）；僅提供最新有效版本。"/></div>
        </Card>
        <Card theme={th} title="支援狀態 ×6">
          <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
            {states.map(([k,zh,tone])=><div key={k} style={{ display:'flex', alignItems:'center', gap:9, fontSize:12 }}><Pill theme={th} tone={tone} dot>{zh}</Pill><span style={{ fontFamily:SHELL_MONO, fontSize:10, color:th.textDim }}>{k}</span></div>)}
          </div>
        </Card>
      </div>
    </Shell>
  );
}
// ── P5-COM-UI-04/05 records + export/retention ──
const HOLD_ST = { not_held:['未保留','neutral'], held:['法律保留中','warn'], release_pending:['待解除','info'], released:['已解除','neutral'] };
function P5C_Records({ theme:th }) {
  const rows=[
    { ref:'ZX-240720-0186', plate:'BKR-2208', res:'07-20 13:50', pick:'14:32', drop:'15:07', dist:'6.4 km', pay:'NT$ 355', act:'NT$ 355', toll:'NT$ 0', fv:'FARE-MTX-2026-07', mode:'跳表', retain:'2028-07-20', hold:'held' },
    { ref:'ZX-240720-0171', plate:'TDK-9317', res:'07-20 12:10', pick:'12:44', drop:'13:20', dist:'8.1 km', pay:'NT$ 410', act:'NT$ 410', toll:'NT$ 40', fv:'FARE-MTX-2026-07', mode:'固定報價', retain:'2028-07-20', hold:'not_held' },
    { ref:'ZX-240719-0158', plate:'AKQ-5566', res:'07-19 18:02', pick:'未取得', drop:'未完成', dist:'未取得', pay:'NT$ 265', act:'未取得', toll:'NT$ 0', fv:'FARE-MTX-2026-07', mode:'跳表', retain:'2028-07-19', hold:'not_held' },
  ];
  return (
    <Shell theme={th} nav={PA_NAV} active="mtx-records" breadcrumb={['平台商務','多元營運紀錄']} env="production" actor={PSB_ACTOR} health={PA_HEALTH} refreshTier="manual" dataFreshness="fresh">
      <PageHeader theme={th} title="營運紀錄查詢 · Operational Records" subtitle="P5-COM-UI-04 · 缺值顯示未取得/未完成（不得為 0）· 保存下限：完成後 730 天"
        meta={<><Input theme={th} value="訂單 / 行程 / 車牌" style={{width:160}}/><Select theme={th} value="預約日期：07-18 ~ 07-23"/><Select theme={th} value="費率版本：全部"/><Select theme={th} value="計費：全部"/><Select theme={th} value="保存狀態：全部"/><Select theme={th} value="法律保留：全部"/></>}
        actions={<ActionButton theme={th} descriptor={{ action:'export', enabled:true, riskLevel:'medium' }} icon="export" label="建立受控匯出" en="export"/>}/>
      <div style={{ padding:24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h:'訂單/行程', w:140, mono:true, r:r=><span style={{ color:th.accent, fontWeight:600 }}>{r.ref}</span> },
            { h:'車牌', k:'plate', w:86, mono:true },
            { h:'預約', k:'res', w:96, mono:true },
            { h:'上車', w:66, mono:true, r:r=><span style={{ color:r.pick==='未取得'?th.warn:th.text }}>{r.pick}</span> },
            { h:'下車', w:66, mono:true, r:r=><span style={{ color:r.drop==='未完成'?th.warn:th.text }}>{r.drop}</span> },
            { h:'里程', k:'dist', w:70, mono:true },
            { h:'應付/實收', w:110, mono:true, r:r=>r.pay+' / '+r.act },
            { h:'通行費', k:'toll', w:66, mono:true },
            { h:'費率版本', k:'fv', w:140, mono:true },
            { h:'計費', k:'mode', w:70 },
            { h:'保存至', k:'retain', w:90, mono:true },
            { h:'法律保留', w:100, r:r=><Pill theme={th} tone={HOLD_ST[r.hold][1]} dot>{HOLD_ST[r.hold][0]}</Pill> },
          ]} rows={rows}/>
        </Card>
        <div style={{ marginTop:12 }}><Banner theme={th} tone="neutral" icon="lock" body="法律保留中之紀錄不承諾於 retainUntil 即刪除；保留與保存期限為兩個獨立狀態。Hold 建立/解除為 design-only / command pending。"/></div>
      </div>
    </Shell>
  );
}
function P5C_Export({ theme:th, phase='confirm' }) {
  return (
    <Shell theme={th} nav={PA_NAV} active="mtx-records" breadcrumb={['多元營運紀錄','受控匯出']} env="production" actor={PSB_ACTOR} health={PA_HEALTH} refreshTier="manual" dataFreshness="fresh">
      <PageHeader theme={th} title="受控匯出 · Controlled Export" subtitle="P5-COM-UI-05 · 匯出於伺服器端產生 · 全程稽核 · EXP-MTX-20260723-001"/>
      <div style={{ padding:24, display:'grid', gridTemplateColumns:'1.3fr 1fr', gap:16, alignItems:'start' }}>
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <Card theme={th} title="範圍預覽 → 確認 → 工作 · 流程">
            <div style={{ marginBottom:14 }}><Stepper theme={th} current={phase==='confirm'?1:2} steps={['查詢/篩選','範圍確認','匯出工作','受控下載']}/></div>
            <DL theme={th} cols={2} items={[
              { k:'篩選範圍', v:'2026-07-01 ~ 07-23 · 全車牌' }, { k:'紀錄筆數（server-owned）', v:'1,204 筆', mono:true },
              { k:'匯出目的（必填）', v:'主管機關季報 · 稽核用' }, { k:'資料敏感度', v:'含行程軌跡摘要 · 個資遮罩' },
              { k:'申請人', v:'駱思賢 · multi_taxi_records:export' }, { k:'稽核', v:'寫入 append-only audit', mono:false },
            ]}/>
            {phase==='confirm'
              ? <div style={{ marginTop:12, display:'flex', gap:8 }}><Btn theme={th} variant="primary" icon="check">確認建立匯出工作</Btn><Btn theme={th}>返回調整範圍</Btn></div>
              : <div style={{ marginTop:12 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                    <Pill theme={th} tone="info" dot>running</Pill>
                    <span style={{ fontFamily:SHELL_MONO, fontSize:11 }}>EXP-MTX-20260723-001 · 64%</span>
                  </div>
                  <div style={{ height:6, borderRadius:3, background:th.surfaceLo, overflow:'hidden' }}><div style={{ width:'64%', height:'100%', background:th.accent }}/></div>
                  <div style={{ display:'flex', gap:6, marginTop:10, flexWrap:'wrap' }}>
                    {[['pending','neutral'],['running','info'],['completed','success'],['failed','danger']].map(([s,tone])=><Pill key={s} theme={th} tone={tone}>{s}</Pill>)}
                    <span style={{ flex:1 }}/>
                    <Btn theme={th} size="xs" disabled title="完成後才可下載">受控下載 · 待完成</Btn>
                  </div>
                </div>}
          </Card>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <Card theme={th} title="保存 / 法律保留 · RetentionStatus">
            <DL theme={th} cols={1} items={[
              { k:'保存下限', v:'完成後 730 天', mono:true }, { k:'本範圍最早 retainUntil', v:'2028-07-01', mono:true },
              { k:'含法律保留紀錄', v:'18 筆 · hold 優先於刪除', mono:false },
            ]}/>
            <div style={{ marginTop:8, display:'flex', flexWrap:'wrap', gap:6 }}>{Object.entries(HOLD_ST).map(([k,[zh,tone]])=><Pill key={k} theme={th} tone={tone} dot>{zh}<span style={{ marginLeft:3, opacity:.55, fontFamily:SHELL_MONO, fontSize:9 }}>{k}</span></Pill>)}</div>
          </Card>
          <Card theme={th} title="稽核通知"><Banner theme={th} tone="neutral" icon="lock" body="匯出建立、下載與範圍雜湊皆寫入稽核；不在瀏覽器端生成檔案。"/></Card>
        </div>
      </div>
    </Shell>
  );
}
Object.assign(window, { RATE_ST, RateChip, FX_RATINGS, P5R_Queue, P5R_Detail, P5R_Authority, FX_ANOMALIES, P5C_Anomaly, PAY_ST, P5C_Payment, P5C_Cert, HOLD_ST, P5C_Records, P5C_Export });
