// p5-screens.jsx — P-5 乘客端畫面 (P5-01..12 + A03/A04)。狀態 copy 依 brief §3.2；不顯示 raw error code。
function P5_S01(){ // Awaiting Assignment
  return <P5Phone><P5Header status="正在安排車輛"/>
    <P5Map state="missing"/>
    <P5Card><div style={{ display:'flex', gap:11, alignItems:'center' }}><span style={{ width:30, height:30, borderRadius:15, border:'3px solid '+P5.brandBg, borderTopColor:P5.brand, flexShrink:0 }}/><div><div style={{ fontSize:13.5, fontWeight:700 }}>正在為您安排合適的車輛</div><div style={{ fontSize:11.5, color:P5.mut, marginTop:2 }}>預約時間 今日 14:45 · 通常 1–3 分鐘完成指派</div></div></div></P5Card>
    <P5RouteFare/><div style={{ margin:'0 14px 12px' }}><P5Btn icon="x" danger>取消行程</P5Btn><div style={{ textAlign:'center', fontSize:11, color:P5.mut, marginTop:6 }}>指派前取消不收費</div></div><P5Notice/></P5Phone>;
}
function P5_S02(){ return <P5Phone><P5Header status="司機正在前往"/><P5Map state="fresh"/><P5Eta main="預計 6 分鐘抵達" sub="約 14:35 抵達"/><P5VehicleCard rating="rated"/><P5RouteFare/><P5Actions/><P5Notice/></P5Phone>; }
function P5_S03(){ return <P5Phone><P5Header status="車輛已指派"/><P5Map state="fresh"/><P5Eta main="預計 8 分鐘抵達" sub="約 14:37 抵達"/><P5VehicleCard rating="new"/><P5RouteFare/><P5Actions/><P5Notice/></P5Phone>; }
function P5_S04(){ // Redispatch in progress
  return <P5Phone><P5Header status="正在為您改派"/>
    <P5Map state="missing"/>
    <P5Card><div style={{ display:'flex', gap:11, alignItems:'center' }}><span style={{ width:30, height:30, borderRadius:15, border:'3px solid '+P5.brandBg, borderTopColor:P5.brand, flexShrink:0 }}/><div><div style={{ fontSize:13.5, fontWeight:700 }}>正在為您安排另一輛車</div><div style={{ fontSize:11.5, color:P5.mut, marginTop:2 }}>原車輛無法完成本趟服務，車資與行程不受影響</div></div></div></P5Card>
    <P5VehicleCard rating="rated" dimmed tag={<span style={{ fontSize:10, fontWeight:700, color:P5.mut, background:P5.bg, border:'1px solid '+P5.line, padding:'2px 8px', borderRadius:999 }}>已取消指派</span>}/>
    <div style={{ margin:'0 14px 12px' }}><P5Btn icon="x" danger>取消行程</P5Btn><div style={{ textAlign:'center', fontSize:11, color:P5.mut, marginTop:6 }}>改派期間取消不收費</div></div><P5Notice/></P5Phone>;
}
function P5_S05(){ // Redispatch completed
  return <P5Phone><P5Header status="車輛已指派"/>
    <div style={{ margin:'12px 14px 0', display:'flex', gap:9, alignItems:'center', background:P5.okBg, border:'1px solid '+P5.okBd, borderRadius:12, padding:'10px 14px' }}><P5Icon name="check" size={15} style={{ color:P5.ok }}/><div style={{ flex:1, fontSize:12.5, fontWeight:700, color:P5.ok }}>已為您改派新的車輛</div><span style={{ fontSize:10.5, color:P5.mut, fontFamily:P5.mono }}>14:31 已完成改派</span></div>
    <P5Map state="fresh"/><P5Eta main="預計 5 分鐘抵達" sub="約 14:36 抵達"/>
    <P5VehicleCard rating="rated" plate="TDK-9317" driver="林建成" plateChanged/>
    <P5Actions/><P5Notice/></P5Phone>;
}
function P5_S06(){ return <P5Phone><P5Header status="司機已抵達"/><P5Map state="fresh"/><P5Eta main="司機已抵達上車點" sub="請於 3 分鐘內上車 · 核對車牌後再上車" tone="ok"/><P5VehicleCard rating="rated"/><P5Seatbelt/><P5Actions cancelNote="取消可能產生 NT$ 80 費用"/><P5Notice/></P5Phone>; }
function P5_S07(){ return <P5Phone><P5Header status="行程進行中"/><P5Map state="stale"/><P5Eta main="約 14:58 抵達目的地" sub="剩餘約 4.1 公里"/><P5Seatbelt/><P5VehicleCard rating="rated"/><P5RouteFare/><P5Notice/></P5Phone>; }
function P5Stars({ picked=5 }){
  return <div style={{ display:'flex', justifyContent:'center', gap:10 }}>{[1,2,3,4,5].map(i=><span key={i} role="button" aria-label={i+' 星'} style={{ width:46, height:46, display:'flex', alignItems:'center', justifyContent:'center', color:i<=picked?'#C7860B':P5.line }}><svg width="34" height="34" viewBox="0 0 24 24" fill={i<=picked?'#C7860B':'none'} stroke="currentColor" strokeWidth="1.6"><path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-3-5.4 3 1.1-6L3.2 9.4l6.1-.8z"/></svg></span>)}</div>;
}
function P5_S08(){ // Completed + rating
  return <P5Phone><P5Header status="行程已完成"/>
    <P5Card><div style={{ textAlign:'center', padding:'6px 0 2px' }}><div style={{ fontSize:17, fontWeight:800 }}>這趟服務如何？</div><div style={{ fontSize:11.5, color:P5.mut, marginTop:3 }}>吳明翰 · BKR-2208 · 14:32–15:07</div></div>
      <div style={{ margin:'12px 0 4px' }}><P5Stars picked={5}/><div style={{ textAlign:'center', fontSize:12.5, fontWeight:700, color:'#C7860B', marginTop:4 }}>5 非常滿意</div></div>
      <div style={{ display:'flex', flexWrap:'wrap', gap:7, justifyContent:'center', marginTop:8 }}>{['準時抵達','駕駛有禮','車內整潔','行車平穩','路線適當'].map((t,i)=><span key={t} style={{ fontSize:12, fontWeight:600, padding:'7px 13px', borderRadius:999, border:'1px solid '+(i<2?P5.brand:P5.line), color:i<2?P5.brand:P5.mut, background:i<2?P5.brandBg:P5.surface }}>{t}</span>)}</div>
    </P5Card>
    <div style={{ margin:'0 14px 10px' }}><P5Btn kind="primary" icon="check">送出評價</P5Btn></div>
    <P5Card><div style={{ display:'flex', justifyContent:'space-between', fontSize:13 }}><span style={{ color:P5.mut }}>本趟車資</span><b>NT$ 355</b></div></P5Card><P5Notice/></P5Phone>;
}
function P5_S09(){ return <P5Phone><P5Header status="行程已完成"/>
  <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:10, padding:'0 30px', textAlign:'center' }}>
    <span style={{ width:56, height:56, borderRadius:28, background:P5.okBg, color:P5.ok, display:'flex', alignItems:'center', justifyContent:'center' }}><P5Icon name="check" size={26}/></span>
    <div style={{ fontSize:18, fontWeight:800 }}>感謝您的評價</div>
    <div style={{ fontSize:12.5, color:P5.mut }}>您的意見會協助我們維持服務品質。</div>
  </div>
  <div style={{ margin:'0 14px 10px', display:'flex', flexDirection:'column', gap:8 }}><P5Btn icon="doc">查看電子乘車證明</P5Btn><P5Btn kind="ghost">回到首頁</P5Btn></div><P5Notice/></P5Phone>; }
function P5_S10(){ // Certificate
  const R=(k,v,mono)=><div style={{ display:'flex', justifyContent:'space-between', gap:12, padding:'8px 0', borderBottom:'1px solid '+P5.lineSoft, fontSize:12.5 }}><span style={{ color:P5.mut }}>{k}</span><span style={{ fontWeight:600, fontFamily:mono?P5.mono:'inherit', textAlign:'right' }}>{v}</span></div>;
  return <P5Phone><P5Header status="電子乘車證明"/>
    <P5Card>
      {R('車牌','BKR-2208',1)}{R('上車 / 下車','14:32 / 15:07',1)}{R('行駛時間','35 分鐘')}{R('起訖','信義區松仁路 100 號 → 中山區南京東路二段 100 號')}{R('行駛里程','6.4 公里',1)}{R('車資','NT$ 355',1)}{R('通行費','NT$ 0',1)}{R('客服電話','0800-090-000',1)}
      <div style={{ display:'flex', justifyContent:'space-between', gap:12, padding:'8px 0', fontSize:12.5 }}><span style={{ color:P5.mut }}>主管機關申訴電話</span><span style={{ fontWeight:600, fontFamily:P5.mono }}>1999</span></div>
      <div style={{ fontSize:10, color:P5.dim, marginTop:4 }}>證明編號 RC-2607••-0186 · 個資已遮碼</div>
    </P5Card>
    <div style={{ margin:'0 14px 12px', display:'flex', flexDirection:'column', gap:8 }}><P5Btn kind="primary" icon="download">下載 PDF</P5Btn><P5Btn icon="share">分享</P5Btn><P5Btn kind="ghost">返回行程</P5Btn></div><P5Notice/></P5Phone>;
}
function P5_S11(){ // Disclosure unavailable — fail closed
  return <P5Phone><P5Header status="正在安排車輛"/>
    <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:10, padding:'0 28px', textAlign:'center' }}>
      <span style={{ width:56, height:56, borderRadius:28, background:P5.warnBg, color:P5.warn, display:'flex', alignItems:'center', justifyContent:'center' }}><P5Icon name="warn" size={26}/></span>
      <div style={{ fontSize:17, fontWeight:800 }}>派車資訊尚未完整</div>
      <div style={{ fontSize:12.5, color:P5.mut, lineHeight:1.6 }}>系統正在重新確認車輛與駕駛資料，尚未完成指派。完成後會立即通知您。</div>
    </div>
    <div style={{ margin:'0 14px 12px', display:'flex', flexDirection:'column', gap:8 }}><P5Btn kind="primary" icon="refresh">重新整理</P5Btn><P5Btn icon="phone">聯絡客服</P5Btn></div><P5Notice/></P5Phone>;
}
function P5_S12(){ // Contact not provisioned
  return <P5Phone><P5Header status="司機正在前往"/><P5Map state="fresh"/><P5Eta main="預計 6 分鐘抵達" sub="約 14:35 抵達"/><P5VehicleCard rating="rated"/>
    <div style={{ margin:'0 14px 12px', background:P5.surface, border:'1px solid '+P5.line, borderRadius:12, padding:'12px 14px' }}>
      <div style={{ display:'flex', gap:9 }}><P5Icon name="info" size={16} style={{ color:P5.brand, marginTop:1 }}/><div style={{ flex:1 }}><div style={{ fontSize:13, fontWeight:700 }}>目前無法直接聯絡司機</div><div style={{ fontSize:11.5, color:P5.mut, marginTop:2 }}>請改聯絡客服，我們會協助轉達。</div></div></div>
      <div style={{ marginTop:10 }}><P5Btn kind="primary" icon="phone">聯絡客服 0800-090-000</P5Btn></div>
    </div>
    <div style={{ margin:'0 14px 12px' }}><P5Btn icon="x" danger>取消行程</P5Btn></div><P5Notice/></P5Phone>;
}
function P5_A04(){ return <P5Phone><P5Header status="正在確認預約"/><P5Map state="missing"/><P5RouteFare mode="anomaly"/>
  <div style={{ margin:'0 14px 12px', display:'flex', flexDirection:'column', gap:8 }}><P5Btn kind="primary" icon="refresh">重新取得報價</P5Btn><P5Btn icon="phone">聯絡客服</P5Btn></div>
  <div style={{ margin:'0 14px', fontSize:10.5, color:P5.dim, textAlign:'center' }}>正式報價完成前不會為您確認訂單</div><P5Notice/></P5Phone>; }
function P5_A03(){ // Public fare version page
  const R=(k,v)=><div style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid '+P5.lineSoft, fontSize:12.5 }}><span style={{ color:P5.mut }}>{k}</span><b style={{ fontFamily:P5.mono }}>{v}</b></div>;
  return <P5Phone url="ride.zhixing.tw/fares"><P5Header status="計費說明" order="公開資訊"/>
    <P5Card title="現行計費表" tag={<span style={{ fontSize:10, fontWeight:700, color:P5.ok, background:P5.okBg, border:'1px solid '+P5.okBd, padding:'2px 8px', borderRadius:999 }}>已生效</span>}>
      <div style={{ fontSize:11, color:P5.mut, marginBottom:6 }}>版本 F-2026-03 · 生效日 2026/07/01 · 備查 北市交運字第1130042號</div>
      {R('起程運價（1.25 公里）','NT$ 85')}{R('續程運價（每 200 公尺）','NT$ 5')}{R('延滯計時（每 80 秒）','NT$ 5')}
      <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', fontSize:12.5 }}><span style={{ color:P5.mut }}>夜間加成（23:00–06:00）</span><b style={{ fontFamily:P5.mono }}>+20%</b></div>
    </P5Card>
    <P5Card title="車資變更規則"><div style={{ fontSize:12, color:P5.mut, lineHeight:1.65 }}>若乘客要求變更目的地、增加停靠點，或因依法需支付通行費，實際車資可能調整。固定報價行程以確認時之應付金額為準。</div></P5Card>
    <div style={{ margin:'0 14px', fontSize:10.5, color:P5.dim, textAlign:'center' }}>本頁依主管機關備查之現行版本公告</div><P5Notice/></P5Phone>;
}
Object.assign(window, { P5_S01,P5_S02,P5_S03,P5_S04,P5_S05,P5_S06,P5_S07,P5Stars,P5_S08,P5_S09,P5_S10,P5_S11,P5_S12,P5_A03,P5_A04 });
