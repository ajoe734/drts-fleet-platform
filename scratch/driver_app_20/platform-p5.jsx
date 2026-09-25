// platform-p5.jsx — P-5 後台補充 (brief §21 + A01/A02/A05 + 車資版本)。platform realm，擴充 Platform Admin。
const FX_P5_QUEUE = [
  { fleet:'大都會車隊', subject:'BKR-2208 · 車輛', missing:'車門數 · 車身顏色', status:'待補正', tone:'warn', submitted:'07-14', updated:'07-18' },
  { fleet:'大都會車隊', subject:'吳明翰 · 駕駛', missing:'執登效期證明', status:'審核中', tone:'info', submitted:'07-15', updated:'07-19' },
  { fleet:'海線車隊', subject:'TXG-1180 · 車輛', missing:'出廠年份', status:'已退件', tone:'danger', submitted:'07-10', updated:'07-16' },
  { fleet:'蘭陽小客車', subject:'游志豪 · 駕駛', missing:'—', status:'已核准', tone:'success', submitted:'07-08', updated:'07-12' },
];
function PA_P5Disclosure({ theme:th }) {
  return (
    <Shell theme={th} nav={PA_NAV} active="p5-disclosure" breadcrumb={['智行叫車', '揭露欄位審核']}
      env="production" actor={PSB_ACTOR} health={PA_HEALTH} refreshTier="medium_slow" dataFreshness="fresh">
      <PageHeader theme={th} title="車輛 / 駕駛揭露欄位審核" subtitle="P5-A01 · 乘客法定揭露資料 · 核准後才能進入派車資格"
        actions={<><Btn theme={th}>退件補正</Btn><Btn theme={th} variant="primary" icon="check">核准</Btn></>}/>
      <div style={{ padding:24, display:'grid', gridTemplateColumns:'1.35fr 1fr', gap:16, alignItems:'start' }}>
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <Card theme={th} title="車輛揭露欄位" subtitle="BKR-2208 · 大都會車隊">
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 16px' }}>
              <Field theme={th} label="廠牌" required><Input theme={th} value="Toyota"/></Field>
              <Field theme={th} label="車款" required><Input theme={th} value="Corolla Altis"/></Field>
              <Field theme={th} label="出廠年份" required><Input theme={th} value="2024" mono/></Field>
              <Field theme={th} label="車門數 (3–6)" required><Input theme={th} value="4" mono/></Field>
              <Field theme={th} label="車身顏色（臺北方案必填）"><Input theme={th} value="珍珠白"/></Field>
            </div>
            <Banner theme={th} tone="success" icon="check" body="欄位齊全 · 揭露狀態 complete · 核准與 canonical 車輛同一交易寫入。"/>
          </Card>
          <Card theme={th} title="駕駛執登 credential" subtitle="吳明翰 · 人工審核 + 效期共同判定，不以既有駕照旗標帶入">
            <DL theme={th} cols={2} items={[
              { k:'執業登記證號', v:'北市計字第12***67號（遮碼）', mono:true }, { k:'區域', v:'臺北市' },
              { k:'效期', v:'2027/12/31', mono:true }, { k:'審核狀態', v:<Pill theme={th} tone="success" dot>verified_active</Pill> },
              { k:'審核人', v:'駱思賢 · 07-18' }, { k:'完整證號', v:'僅存後端 · 不入乘客 API / 稽核', mono:false },
            ]}/>
          </Card>
        </div>
        <Card theme={th} title="乘客顯示預覽" subtitle="核准後乘客端呈現">
          <div style={{ border:'1px solid '+th.border, borderRadius:12, padding:14, background:th.surfaceLo }}>
            <div style={{ fontSize:13.5, fontWeight:700, color:th.text }}>Toyota Corolla Altis</div>
            <div style={{ fontSize:11, color:th.textMuted }}>2024 年出廠 · 4 門 · 珍珠白</div>
            <div style={{ fontFamily:SHELL_MONO, fontSize:22, fontWeight:700, letterSpacing:1.5, margin:'8px 0', color:th.text }}>BKR-2208</div>
            <div style={{ display:'flex', alignItems:'center', gap:7 }}>
              <span style={{ fontSize:12.5, fontWeight:700, color:th.text }}>吳明翰</span>
              <Pill theme={th} tone="success">執登有效</Pill>
            </div>
            <div style={{ fontSize:10.5, color:th.textMuted, fontFamily:SHELL_MONO, marginTop:3 }}>北市計字第12***67號 · 有效至 2027/12/31</div>
            <div style={{ fontSize:11.5, color:th.textMuted, marginTop:6 }}>★ 4.9 · 328 則評價</div>
          </div>
          <div style={{ marginTop:10 }}><Banner theme={th} tone="neutral" icon="lock" body="遮碼顯示由 server 產生；效期逾期或未審核將直接阻擋派車（fail closed）。"/></div>
        </Card>
      </div>
    </Shell>
  );
}
function PA_P5Queue({ theme:th }) {
  return (
    <Shell theme={th} nav={PA_NAV} active="p5-disclosure" breadcrumb={['智行叫車', '補正佇列']}
      env="production" actor={PSB_ACTOR} health={PA_HEALTH} refreshTier="medium_slow" dataFreshness="fresh">
      <PageHeader theme={th} title="揭露補正佇列" subtitle="P5-A02 · 缺漏欄位不得以預設值填補 · 逐筆補正後核准"
        meta={<Pill theme={th} tone="warn">3 筆待處理</Pill>}/>
      <div style={{ padding:24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h:'車行', k:'fleet', w:120 },
            { h:'車牌 / 駕駛', k:'subject', w:170, mono:true },
            { h:'缺漏欄位', w:170, r:r=><span style={{ color:r.missing==='—'?th.textDim:th.warn, fontWeight:r.missing==='—'?400:600, fontSize:12 }}>{r.missing}</span> },
            { h:'目前狀態', w:100, r:r=><Pill theme={th} tone={r.tone} dot>{r.status}</Pill> },
            { h:'送審日期', k:'submitted', w:90, mono:true },
            { h:'最後更新', k:'updated', w:90, mono:true },
            { h:'', w:190, r:r=><div style={{ display:'flex', gap:5 }}><Btn theme={th} size="xs" variant="ghost" icon="eye">查看</Btn><Btn theme={th} size="xs" variant="secondary">退件補正</Btn><Btn theme={th} size="xs" variant="primary" icon="check">核准</Btn></div> },
          ]} rows={FX_P5_QUEUE}/>
        </Card>
      </div>
    </Shell>
  );
}
function PA_P5Fare({ theme:th }) {
  const rows=[
    { id:'F-2026-04', name:'2026 Q4 調整版', status:'已備查', tone:'info', from:'2026-10-01', ref:'北市交運字第1130077號' },
    { id:'F-2026-03', name:'現行計費表', status:'已生效', tone:'success', from:'2026-07-01', ref:'北市交運字第1130042號' },
    { id:'F-2026-05', name:'夜間費率研議', status:'草稿', tone:'neutral', from:'—', ref:'—' },
    { id:'F-2025-11', name:'2025 舊版', status:'已停用', tone:'neutral', from:'2025-11-01', ref:'北市交運字第1120198號' },
  ];
  return (
    <Shell theme={th} nav={PA_NAV} active="p5-disclosure" breadcrumb={['智行叫車', '公開車資版本']}
      env="production" actor={PSB_ACTOR} health={PA_HEALTH} refreshTier="manual" dataFreshness="fresh">
      <PageHeader theme={th} title="公開車資版本" subtitle="P5-A03 後台 · 訂單僅使用已生效版本 · 未來生效版本不可提前套用 · 啟停用寫稽核"
        actions={<Btn theme={th} variant="primary" icon="plus">建立版本</Btn>}/>
      <div style={{ padding:24, display:'grid', gridTemplateColumns:'1.5fr 1fr', gap:16, alignItems:'start' }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h:'版本', k:'id', w:110, mono:true, r:r=><span style={{ color:th.accent, fontWeight:700 }}>{r.id}</span> },
            { h:'名稱', k:'name', w:150 },
            { h:'狀態', w:96, r:r=><Pill theme={th} tone={r.tone} dot>{r.status}</Pill> },
            { h:'生效日', k:'from', w:110, mono:true },
            { h:'備查文號', k:'ref', w:190, mono:true },
            { h:'', w:110, r:r=>r.status==='已備查'?<Btn theme={th} size="xs" variant="primary">排程生效</Btn>:<Btn theme={th} size="xs" variant="ghost" icon="eye">公開預覽</Btn> },
          ]} rows={rows}/>
        </Card>
        <Card theme={th} title="公開頁預覽 · /fares" subtitle="F-2026-03 · 已生效">
          <DL theme={th} cols={1} items={[
            { k:'起程運價（1.25 公里）', v:'NT$ 85', mono:true }, { k:'續程運價（每 200 公尺）', v:'NT$ 5', mono:true },
            { k:'延滯計時（每 80 秒）', v:'NT$ 5', mono:true }, { k:'夜間加成', v:'+20% · 23:00–06:00', mono:true },
          ]}/>
          <div style={{ marginTop:10 }}><Banner theme={th} tone="neutral" icon="info" body="F-2026-04 已備查、生效日 2026-10-01；生效前訂單一律沿用現行版本。"/></div>
        </Card>
      </div>
    </Shell>
  );
}
function PA_P5Records({ theme:th }) {
  const rows=[
    { order:'ZX-240720-0186', plate:'BKR-2208', reserved:'07-20 13:50', pickup:'14:32', dropoff:'15:07', fare:'NT$ 355', retain:'2028-07-20' },
    { order:'ZX-240720-0171', plate:'TDK-9317', reserved:'07-20 12:10', pickup:'12:44', dropoff:'13:20', fare:'NT$ 410', retain:'2028-07-20' },
    { order:'ZX-240719-0158', plate:'AKQ-5566', reserved:'07-19 18:02', pickup:'18:30', dropoff:'18:58', fare:'NT$ 265', retain:'2028-07-19' },
  ];
  return (
    <Shell theme={th} nav={PA_NAV} active="p5-disclosure" breadcrumb={['智行叫車', '行程營運紀錄']}
      env="production" actor={PSB_ACTOR} health={PA_HEALTH} refreshTier="manual" dataFreshness="fresh">
      <PageHeader theme={th} title="行程營運紀錄（保存 2 年）" subtitle="P5-A05 · 每筆完成行程之紀錄與匯出 · 覆蓋率須 100%"
        meta={<><Select theme={th} value="期間：2026-07"/><Pill theme={th} tone="success" dot>覆蓋率 100%</Pill></>}
        actions={<Btn theme={th} variant="primary" icon="export">匯出</Btn>}/>
      <div style={{ padding:24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h:'訂單', k:'order', w:150, mono:true, r:r=><span style={{ color:th.accent, fontWeight:600 }}>{r.order}</span> },
            { h:'車牌', k:'plate', w:96, mono:true },
            { h:'預約', k:'reserved', w:110, mono:true },
            { h:'上車', k:'pickup', w:70, mono:true },
            { h:'下車', k:'dropoff', w:70, mono:true },
            { h:'車資', k:'fare', w:90, mono:true, align:'right' },
            { h:'保存至', k:'retain', w:110, mono:true },
            { h:'', w:80, r:()=><Btn theme={th} size="xs" variant="ghost" icon="eye">明細</Btn> },
          ]} rows={rows}/>
          <div style={{ padding:'10px 16px', borderTop:'1px solid '+th.border }}>
            <span style={{ fontSize:11, color:th.textMuted }}>紀錄含路線軌跡摘要、應付/實收車資、通行費與計費版本 · 完成後保存 730 天</span>
          </div>
        </Card>
      </div>
    </Shell>
  );
}
Object.assign(window, { FX_P5_QUEUE, PA_P5Disclosure, PA_P5Queue, PA_P5Fare, PA_P5Records });
