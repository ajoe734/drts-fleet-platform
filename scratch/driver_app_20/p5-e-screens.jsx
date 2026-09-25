// p5-e-screens.jsx — G201011 送審補件：E-18 行程評分 / E-18b 低分導流 / E-19a 費用與優惠說明 / E-19b 下單前確認。
// 費用政策文字為定稿，不得改寫。客服 02-2944-0985。運價寫「依主管機關核定運價」，不虛構文號。
const E_FEES = [
  ['車資','依主管機關核定運價計費（含延滯計時）'],
  ['預約費','不另收取'],
  ['取消費','不收取（指派前取消不收費）'],
  ['等待費','不另收取（車資依核定運價含延滯計時計收）'],
  ['遺失物返還補償金','不收取；如要求專程送還，所生車資由乘客負擔並於送還前確認'],
  ['車內汙損清潔費','由可歸責之乘客負擔實際清潔費用，實支實付、憑單據計收'],
  ['國道通行費','經乘客同意行駛後實收'],
  ['優惠活動','目前無；如有，依規定備查後於本頁公告'],
];
const E_STAR_TXT = { 1:'很差', 2:'不滿意', 3:'普通', 4:'滿意', 5:'非常滿意' };
function EChip({ on, tone='pos', children }) {
  const c = on ? { bd:P5.brand, fg:P5.brand, bg:P5.brandBg } : { bd:P5.line, fg:P5.mut, bg:P5.surface };
  return <span style={{ fontSize:12, fontWeight:600, padding:'7px 12px', borderRadius:999, border:'1px solid '+c.bd, color:c.fg, background:c.bg }}>{children}</span>;
}
function ESummary(){
  const R=(k,v,mono)=><div style={{ display:'flex', justifyContent:'space-between', gap:12, padding:'6px 0', fontSize:12.5 }}><span style={{ color:P5.mut }}>{k}</span><span style={{ fontWeight:600, fontFamily:mono?P5.mono:'inherit', textAlign:'right' }}>{v}</span></div>;
  return <P5Card title="本次行程">{R('上車','信義區松仁路 100 號')}{R('下車','中山區南京東路二段 100 號')}{R('時間','2026/07/20 14:32 – 15:07',1)}{R('車牌 · 駕駛','BKR-2208 · 蔡○○',1)}{R('車資','NT$ 355',1)}</P5Card>;
}
// E-18 / E-18b
function P5_E18({ stars=4 }) {
  const low = stars<=2;
  return <P5Phone><P5Header status="行程已完成"/>
    <div style={{ margin:'12px 14px 0', fontSize:12.5, color:P5.mut }}>感謝您的搭乘，請為本次服務評分</div>
    <div style={{ height:10 }}/>
    <ESummary/>
    <P5Card title={<span>服務評分 <span style={{ color:P5.danger, fontSize:11 }}>*必填</span></span>}>
      <P5Stars picked={stars}/>
      <div style={{ textAlign:'center', fontSize:12.5, fontWeight:700, color:low?P5.danger:'#C7860B', marginTop:4 }}>{stars} {E_STAR_TXT[stars]}</div>
      <div style={{ fontSize:11.5, fontWeight:700, color:P5.mut, margin:'12px 0 6px' }}>做得好（可複選）</div>
      <div style={{ display:'flex', flexWrap:'wrap', gap:7 }}>{['車內整潔','駕駛親切','路線順暢','準時到達'].map((t,i)=><EChip key={t} on={!low && i<3}>{t}</EChip>)}</div>
      <div style={{ fontSize:11.5, fontWeight:700, color:P5.mut, margin:'12px 0 6px' }}>待改善（可複選）</div>
      <div style={{ display:'flex', flexWrap:'wrap', gap:7 }}>{['駕駛態度','車內氣味','繞路','遲到','駕駛違規'].map((t,i)=><EChip key={t} on={low && (i===0||i===2)}>{t}</EChip>)}</div>
      <div style={{ marginTop:12, border:'1px solid '+P5.line, borderRadius:10, padding:'10px 12px', minHeight:64, fontSize:12.5, color:low?P5.ink:P5.dim }}>{low?'司機未依導航路線行駛，且對詢問態度不佳。':'補充意見（選填）'}</div>
      <div style={{ textAlign:'right', fontSize:10.5, color:P5.dim, marginTop:3 }}>{low?'24':'0'} / 200</div>
      {low && <div style={{ marginTop:10, display:'flex', alignItems:'center', gap:10, background:P5.warnBg, border:'1px solid '+P5.warnBd, borderRadius:10, padding:'10px 12px' }}>
        <div style={{ flex:1 }}><div style={{ fontSize:12.5, fontWeight:700 }}>需要客服與您聯繫嗎？</div><div style={{ fontSize:10.5, color:P5.mut, marginTop:1 }}>開啟後送出將自動建立客訴案件</div></div>
        <span style={{ width:40, height:22, borderRadius:11, background:P5.brand, position:'relative', flexShrink:0 }}><span style={{ position:'absolute', right:2, top:2, width:18, height:18, borderRadius:9, background:'#fff' }}/></span>
      </div>}
    </P5Card>
    <div style={{ margin:'0 14px 8px' }}><P5Btn kind="primary" icon="check">送出評分</P5Btn></div>
    <div style={{ margin:'0 22px 12px', fontSize:10.5, color:P5.mut, textAlign:'center', lineHeight:1.55 }}>評分送出後不可修改；評分以匿名方式提供駕駛，並用於駕駛服務品質管理</div>
    <P5Notice/></P5Phone>;
}
// E-19a 首頁費用與優惠說明
function P5_E19a() {
  return <P5Phone url="ride.zhixing.tw/fees"><P5Header status="費用與優惠說明" order="公開資訊"/>
    <div style={{ margin:'12px 14px 10px', fontSize:12.5, color:P5.mut }}>下單前請確認以下收費規則</div>
    <P5Card>
      {E_FEES.map(([k,v],i)=>(
        <div key={k} style={{ padding:'9px 0', borderBottom:i<E_FEES.length-1?'1px solid '+P5.lineSoft:'none' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}><span style={{ fontSize:13, fontWeight:700, color:P5.brand }}>{k}</span>{k==='優惠活動' && <span style={{ fontSize:10, fontWeight:700, color:P5.mut, background:P5.bg, border:'1px solid '+P5.line, padding:'1px 8px', borderRadius:999 }}>目前無</span>}</div>
          <div style={{ fontSize:12.5, color:P5.ink, marginTop:3, lineHeight:1.55 }}>{v}</div>
        </div>
      ))}
    </P5Card>
    <div style={{ margin:'0 14px 12px', fontSize:10.5, color:P5.dim }}>版本 F-2026-01 · 生效日 2026/10/01 · 依主管機關核定運價及備查優惠辦理</div>
    <div style={{ margin:'0 14px 8px' }}><P5Btn kind="primary" icon="check">我已閱讀並同意</P5Btn></div>
    <div style={{ margin:'0 14px 12px', fontSize:10.5, color:P5.mut, textAlign:'center' }}>下單前將再次顯示費用摘要供您確認</div>
    <P5Notice/></P5Phone>;
}
// E-19b 下單前確認（bottom sheet）
function P5_E19b({ checked=true }) {
  const R=(k,v,mono)=><div style={{ display:'flex', justifyContent:'space-between', gap:12, padding:'6px 0', fontSize:12.5 }}><span style={{ color:P5.mut }}>{k}</span><span style={{ fontWeight:600, fontFamily:mono?P5.mono:'inherit', textAlign:'right' }}>{v}</span></div>;
  return <P5Phone url="ride.zhixing.tw/r/••••K2"><P5Header status="建立乘車需求"/>
    <div style={{ flex:1, position:'relative', display:'flex', flexDirection:'column' }}>
      <div style={{ flex:1, background:'rgba(22,33,44,.45)' }}/>
      <div style={{ background:P5.surface, borderRadius:'20px 20px 0 0', padding:'10px 14px 14px', boxShadow:'0 -8px 30px rgba(0,0,0,.18)' }}>
        <div style={{ width:40, height:4, borderRadius:2, background:P5.line, margin:'0 auto 10px' }}/>
        <div style={{ fontSize:18, fontWeight:800, marginBottom:8 }}>確認叫車</div>
        <div style={{ border:'1px solid '+P5.line, borderRadius:12, padding:'8px 14px', marginBottom:10 }}>
          {R('上車','信義區松仁路 100 號')}{R('下車','中山區南京東路二段 100 號')}{R('預約時間','今日 14:45',1)}{R('預估車資','NT$ 320–380',1)}{R('支付方式','信用卡 ••••1234',1)}
        </div>
        <div style={{ border:'1px solid '+P5.line, borderRadius:12, padding:'10px 14px', marginBottom:10 }}>
          <div style={{ fontSize:13, fontWeight:700, marginBottom:6 }}>費用規則</div>
          {['車資依核定運價計費（含延滯計時）','預約費、取消費（指派前）、等待費：不另收','國道通行費經您同意行駛後實收','車內汙損清潔費實支實付'].map(t=><div key={t} style={{ display:'flex', gap:7, fontSize:12, color:P5.ink, padding:'3px 0' }}><span style={{ color:P5.ok }}>✓</span><span>{t}</span></div>)}
          <div style={{ textAlign:'right', marginTop:4 }}><span style={{ fontSize:11.5, color:P5.brand, fontWeight:700 }}>查看完整費用與優惠說明 ›</span></div>
        </div>
        <label style={{ display:'flex', alignItems:'center', gap:9, fontSize:12.5, fontWeight:600, marginBottom:10 }}>
          <span style={{ width:20, height:20, borderRadius:5, border:'1.5px solid '+(checked?P5.brand:P5.line), background:checked?P5.brand:P5.surface, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13 }}>{checked?'✓':''}</span>我已確認費用與優惠說明
        </label>
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          <button disabled={!checked} aria-disabled={!checked} style={{ width:'100%', minHeight:46, borderRadius:12, fontSize:14, fontWeight:700, border:'none', background:checked?P5.brand:P5.line, color:checked?'#fff':P5.dim, cursor:checked?'pointer':'not-allowed', fontFamily:'inherit' }}>確認叫車</button>
          <P5Btn>返回修改</P5Btn>
        </div>
        {!checked && <div style={{ fontSize:10.5, color:P5.warn, textAlign:'center', marginTop:6 }}>請先勾選「我已確認費用與優惠說明」</div>}
        <div style={{ fontSize:10.5, color:P5.dim, textAlign:'center', marginTop:8 }}>系統將記錄您的確認時間，作為爭議處理依據</div>
      </div>
    </div></P5Phone>;
}
Object.assign(window, { E_FEES, E_STAR_TXT, EChip, ESummary, P5_E18, P5_E19a, P5_E19b });
