// driver-sos.jsx — S-3 司機端 SOS (S3-01..11)。獨立全螢幕、不露原工作台；110/119 撥號不依賴網路。
// 事件樣本：SOS-20260720-0012 · ZX-240720-0186 · BKR-2208 · 吳明翰。禁止多平台/外部詞彙。
const SOS_RED = '#C4271B', SOS_RED_D = '#9A1D13';
function SosDial({ n, sub, outline }) {
  return (
    <button style={{ display:'flex', alignItems:'center', gap:13, width:'100%', minHeight:60, borderRadius:14, padding:'0 18px', cursor:'pointer', fontFamily:'inherit',
      background: outline ? 'transparent' : SOS_RED, color: outline ? SOS_RED : '#fff', border:'2px solid '+SOS_RED }}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 4h4l2 5-2.5 1.5a12 12 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2"/></svg>
      <span style={{ textAlign:'left' }}><span style={{ display:'block', fontSize:17, fontWeight:800 }}>撥打 {n}</span><span style={{ display:'block', fontSize:11.5, opacity:.85 }}>{sub}</span></span>
    </button>
  );
}
function SosCtx({ theme:t, locState='ok', noTrip }) {
  const R=(k,v,mono)=><div style={{ display:'flex', justifyContent:'space-between', gap:10, padding:'6px 0', fontSize:12 }}><span style={{ color:t.textMuted }}>{k}</span><span style={{ fontWeight:600, color:t.text, fontFamily:mono?'monospace':'inherit', textAlign:'right' }}>{v}</span></div>;
  return (
    <DrvCard theme={t}>
      <div style={{ fontSize:11.5, fontWeight:700, color:t.textMuted, marginBottom:4 }}>將自動附帶</div>
      {noTrip
        ? <div style={{ fontSize:12, color:t.text, lineHeight:1.6 }}>目前沒有進行中的行程<br/><span style={{ color:t.textMuted, fontSize:11 }}>仍可通報車隊，系統會附上駕駛與裝置位置。</span></div>
        : <>{R('行程編號','ZX-240720-0186',1)}{R('車牌','BKR-2208',1)}{R('駕駛','吳明翰')}
          {R('目前位置', locState==='resolving' ? '正在取得定位' : '信義區松仁路 100 號附近')}
          {R('原始觸發時間','2026/07/20 14:30:12',1)}</>}
    </DrvCard>
  );
}
function SosFrame({ theme:t, children, footer }) {
  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', minHeight:0, background:t.bg }}>
      <div style={{ background:SOS_RED_D, color:'#fff', padding:'12px 16px', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:9 }}>
          <DrvIcon name="warn" size={18} stroke={2.2}/>
          <span style={{ fontSize:17, fontWeight:800, flex:1 }}>SOS 緊急通報</span>
          <DrvIcon name="x" size={18}/>
        </div>
        <div style={{ fontSize:11.5, opacity:.85, marginTop:3 }}>需要立即協助時，請選擇下列方式</div>
      </div>
      <div style={{ flex:1, overflowY:'auto', padding:14, display:'flex', flexDirection:'column', gap:11 }}>{children}</div>
      {footer && <div style={{ flexShrink:0, padding:12, borderTop:'1px solid '+t.border, background:t.bgRaised, display:'flex', flexDirection:'column', gap:8 }}>{footer}</div>}
    </div>
  );
}
// S3-01 · Persistent entry in active trip
function S3D_ActiveTrip({ theme:t, hold }) {
  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', minHeight:0, background:t.bg }}>
      <div style={{ padding:'10px 14px', background:t.bgRaised, borderBottom:'1px solid '+t.border, flexShrink:0 }}>
        <DrvBi zh="行程進行中" en="on trip" theme={t} size={16}/>
        <div style={{ fontSize:11, color:t.textMuted, marginTop:2, fontFamily:'monospace' }}>ZX-240720-0186 · BKR-2208</div>
      </div>
      <div style={{ flex:1, padding:14, display:'flex', flexDirection:'column', gap:11 }}>
        <div style={{ height:150, borderRadius:12, background:t.surfaceLo, border:'1px solid '+t.border, display:'flex', alignItems:'center', justifyContent:'center', color:t.textDim }}><DrvIcon name="pin" size={22}/></div>
        <DrvCard theme={t}>
          <div style={{ fontSize:13.5, fontWeight:700, color:t.text }}>前往：中山區南京東路二段 100 號</div>
          <div style={{ fontSize:11.5, color:t.textMuted, marginTop:3 }}>剩餘 4.1 公里 · 約 12 分</div>
        </DrvCard>
        {hold && (
          <div style={{ marginTop:'auto', alignSelf:'center', textAlign:'center' }}>
            <div style={{ position:'relative', width:96, height:96, margin:'0 auto' }}>
              <svg width="96" height="96" viewBox="0 0 96 96"><circle cx="48" cy="48" r="42" fill={SOS_RED}/><circle cx="48" cy="48" r="45" fill="none" stroke={SOS_RED} strokeOpacity=".25" strokeWidth="5"/><circle cx="48" cy="48" r="45" fill="none" stroke={SOS_RED} strokeWidth="5" strokeDasharray="283" strokeDashoffset="99" strokeLinecap="round" transform="rotate(-90 48 48)"/></svg>
              <span style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:20, fontWeight:900, letterSpacing:1 }}>SOS</span>
            </div>
            <div style={{ fontSize:12.5, fontWeight:700, color:t.text, marginTop:8 }}>請長按 2 秒啟動 SOS</div>
            <div style={{ fontSize:10.5, color:t.textMuted, marginTop:2 }}>放開未滿 2 秒不會送出 · 震動回饋</div>
          </div>
        )}
      </div>
      <div style={{ flexShrink:0, padding:12, borderTop:'1px solid '+t.border, background:t.bgRaised, display:'flex', gap:10, alignItems:'center' }}>
        <div style={{ flex:1 }}><DrvBigBtn theme={t} kind="secondary">完成行程</DrvBigBtn></div>
        <button aria-label="SOS 長按 2 秒" style={{ width:64, height:64, borderRadius:32, border:'none', background:SOS_RED, color:'#fff', fontSize:15, fontWeight:900, letterSpacing:1, cursor:'pointer', boxShadow:'0 4px 14px rgba(196,39,27,.4)', flexShrink:0 }}>SOS</button>
      </div>
    </div>
  );
}
// S3-03 · Independent SOS home
function S3D_Home({ theme:t, locState }) {
  return (
    <SosFrame theme={t}>
      <SosDial n="110" sub="警察協助"/>
      <SosDial n="119" sub="消防／救護" outline/>
      <button style={{ display:'flex', alignItems:'center', gap:13, width:'100%', minHeight:60, borderRadius:14, padding:'0 18px', cursor:'pointer', fontFamily:'inherit', background:t.brand, color:'#fff', border:'2px solid '+t.brand }}>
        <DrvIcon name="bell" size={21} stroke={2}/>
        <span style={{ textAlign:'left' }}><span style={{ display:'block', fontSize:16.5, fontWeight:800 }}>通報車隊值班</span><span style={{ display:'block', fontSize:11.5, opacity:.85 }}>建立緊急事件並通知值班人員</span></span>
      </button>
      <SosCtx theme={t} locState={locState}/>
      <div style={{ fontSize:10.5, color:t.textDim, textAlign:'center' }}>撥號功能不依賴行動網路</div>
    </SosFrame>
  );
}
// S3-04/05/06 · sending / submitted / offline
function S3D_Sending({ theme:t }) {
  return (
    <SosFrame theme={t}>
      <DrvCard theme={t}>
        <div style={{ display:'flex', gap:11, alignItems:'center' }}>
          <span style={{ width:26, height:26, borderRadius:13, border:'3px solid '+t.surfaceLo, borderTopColor:t.brand, flexShrink:0 }}/>
          <div><div style={{ fontSize:14, fontWeight:800, color:t.text }}>正在通報車隊值班</div><div style={{ fontSize:11.5, color:t.textMuted, marginTop:2 }}>請保持此頁開啟</div></div>
        </div>
      </DrvCard>
      <SosCtx theme={t}/>
      <div style={{ marginTop:'auto', display:'flex', gap:8 }}><div style={{flex:1}}><SosDial n="110" sub="警察協助"/></div><div style={{flex:1}}><SosDial n="119" sub="消防／救護" outline/></div></div>
    </SosFrame>
  );
}
function S3D_Submitted({ theme:t }) {
  return (
    <SosFrame theme={t} footer={<><DrvBigBtn theme={t} kind="primary">補充事件資訊</DrvBigBtn><DrvBigBtn theme={t} kind="ghost">查看通報狀態</DrvBigBtn></>}>
      <div style={{ textAlign:'center', padding:'12px 0 2px' }}>
        <span style={{ width:56, height:56, borderRadius:28, background:t.successBg, color:t.success, display:'inline-flex', alignItems:'center', justifyContent:'center' }}><DrvIcon name="check" size={26} stroke={2.4}/></span>
        <div style={{ fontSize:17, fontWeight:800, color:t.text, marginTop:9 }}>車隊已收到通報</div>
        <div style={{ fontSize:14, fontFamily:'monospace', fontWeight:700, color:t.brand, marginTop:5 }}>事件編號 SOS-20260720-0012</div>
        <div style={{ fontSize:12, color:t.textMuted, marginTop:4 }}>值班人員將優先處理</div>
      </div>
      <SosCtx theme={t}/>
    </SosFrame>
  );
}
function S3D_Offline({ theme:t }) {
  return (
    <SosFrame theme={t}>
      <div style={{ padding:'11px 13px', borderRadius:12, background:t.warnBg, border:'1px solid '+t.warn, display:'flex', gap:10 }}>
        <DrvIcon name="warn" size={17} stroke={2} style={{ color:t.warn, flexShrink:0, marginTop:1 }}/>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:13.5, fontWeight:800, color:t.text }}>目前無網路，通報已保存在手機</div>
          <div style={{ fontSize:11.5, color:t.textMuted, marginTop:2 }}>恢復連線後會自動送出</div>
          <span style={{ display:'inline-flex', alignItems:'center', gap:5, marginTop:7, fontSize:11, fontWeight:700, color:t.warn, background:t.bgRaised, border:'1px solid '+t.warn, padding:'2px 9px', borderRadius:999 }}><DrvIcon name="refresh" size={11}/>等待補送</span>
        </div>
      </div>
      <SosDial n="110" sub="警察協助 · 撥號不需網路"/>
      <SosDial n="119" sub="消防／救護 · 撥號不需網路" outline/>
      <SosCtx theme={t}/>
    </SosFrame>
  );
}
// S3-07 · Supplement
function S3D_Supplement({ theme:t }) {
  const Chip=({on,children})=><span style={{ padding:'8px 14px', borderRadius:999, fontSize:12.5, fontWeight:700, border:'1.5px solid '+(on?t.brand:t.border), color:on?t.brand:t.textMuted, background:on?t.surfaceLo:'transparent' }}>{children}</span>;
  return (
    <SosFrame theme={t} footer={<DrvBigBtn theme={t} kind="primary" icon="check">送出補充</DrvBigBtn>}>
      <DrvCard theme={t}>
        <div style={{ fontSize:11.5, fontWeight:700, color:t.textMuted, marginBottom:7 }}>事件類型</div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:7 }}><Chip on>交通事故</Chip><Chip>治安事件</Chip><Chip>乘客急病</Chip><Chip>其他</Chip></div>
        <div style={{ fontSize:11.5, fontWeight:700, color:t.textMuted, margin:'12px 0 7px' }}>嚴重度</div>
        <div style={{ display:'flex', gap:7 }}><Chip on>重大</Chip><Chip>一般</Chip></div>
        <div style={{ fontSize:11.5, fontWeight:700, color:t.textMuted, margin:'12px 0 7px' }}>文字說明</div>
        <div style={{ border:'1px solid '+t.border, borderRadius:10, padding:'9px 12px', minHeight:56, fontSize:12.5, color:t.text }}>與後方車輛擦撞，人員無明顯外傷，車輛靠邊停妥。</div>
        <div style={{ display:'flex', gap:8, marginTop:11 }}>
          <DrvBigBtn theme={t} kind="outline" icon="camera" style={{ flex:1, height:44, fontSize:12.5 }}>照片 (2)</DrvBigBtn>
          <DrvBigBtn theme={t} kind="outline" icon="bell" style={{ flex:1, height:44, fontSize:12.5 }}>語音 0:42</DrvBigBtn>
        </div>
      </DrvCard>
      <DrvCard theme={t}>
        <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:11.5, fontWeight:700, color:t.textMuted, marginBottom:5 }}><DrvIcon name="lock" size={12}/>系統鎖定欄位（唯讀）</div>
        {[['位置','信義區松仁路 100 號附近'],['原始觸發時間','2026/07/20 14:30:12'],['行程','ZX-240720-0186'],['車牌','BKR-2208'],['駕駛','吳明翰']].map(([k,v])=>(
          <div key={k} style={{ display:'flex', justifyContent:'space-between', gap:10, padding:'5px 0', fontSize:12 }}><span style={{ color:t.textMuted }}>{k}</span><span style={{ color:t.text, fontWeight:600, fontFamily:'monospace' }}>{v}</span></div>
        ))}
      </DrvCard>
    </SosFrame>
  );
}
// S3-08 · Attachments
function S3D_Attach({ theme:t }) {
  return (
    <SosFrame theme={t} footer={<DrvBigBtn theme={t} kind="primary" icon="check">完成</DrvBigBtn>}>
      <DrvCard theme={t}>
        <div style={{ fontSize:11.5, fontWeight:700, color:t.textMuted, marginBottom:8 }}>照片（最多 10 張 · 每張 ≤10MB）</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
          {[['已上傳','done'],['62%','up'],['上傳失敗','fail']].map(([l,s],i)=>(
            <div key={i} style={{ aspectRatio:'1', borderRadius:10, background:t.surfaceLo, border:'1px solid '+(s==='fail'?t.danger:t.border), position:'relative', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:4 }}>
              <DrvIcon name="camera" size={18} style={{ color:t.textDim }}/>
              {s==='up'&&<div style={{ position:'absolute', left:6, right:6, bottom:6, height:4, borderRadius:2, background:t.border }}><div style={{ width:'62%', height:'100%', borderRadius:2, background:t.brand }}/></div>}
              <span style={{ fontSize:9.5, fontWeight:700, color:s==='fail'?t.danger:s==='done'?t.success:t.textMuted }}>{l}</span>
              {s==='fail'&&<span style={{ fontSize:9.5, fontWeight:800, color:t.danger, textDecoration:'underline' }}>重試</span>}
            </div>
          ))}
          <div style={{ aspectRatio:'1', borderRadius:10, border:'1.5px dashed '+t.border, display:'flex', alignItems:'center', justifyContent:'center', color:t.textDim, fontSize:22 }}>＋</div>
        </div>
      </DrvCard>
      <DrvCard theme={t}>
        <div style={{ fontSize:11.5, fontWeight:700, color:t.textMuted, marginBottom:8 }}>語音（最長 5 分鐘）</div>
        <div style={{ display:'flex', alignItems:'center', gap:11 }}>
          <span style={{ width:44, height:44, borderRadius:22, background:t.dangerBg, color:t.danger, display:'flex', alignItems:'center', justifyContent:'center' }}><span style={{ width:14, height:14, borderRadius:3, background:t.danger }}/></span>
          <div style={{ flex:1 }}><div style={{ fontSize:14, fontWeight:800, fontFamily:'monospace', color:t.text }}>0:42 <span style={{ fontSize:10.5, color:t.textDim, fontWeight:500 }}>/ 5:00</span></div><div style={{ height:4, borderRadius:2, background:t.surfaceLo, marginTop:5 }}><div style={{ width:'14%', height:'100%', borderRadius:2, background:t.danger }}/></div></div>
          <DrvBigBtn theme={t} kind="outline" full={false} style={{ height:38, fontSize:12 }}>試聽</DrvBigBtn>
        </div>
      </DrvCard>
      <div style={{ fontSize:10.5, color:t.textDim, textAlign:'center' }}>附件上傳失敗不影響已送出的通報內容</div>
    </SosFrame>
  );
}
// S3-09/10 · False alarm
function S3D_FalseAlarm({ theme:t, done }) {
  return (
    <SosFrame theme={t}>
      {done
        ? <div style={{ textAlign:'center', padding:'26px 0' }}>
            <span style={{ width:56, height:56, borderRadius:28, background:t.surfaceLo, color:t.textMuted, display:'inline-flex', alignItems:'center', justifyContent:'center' }}><DrvIcon name="check" size={24}/></span>
            <div style={{ fontSize:17, fontWeight:800, color:t.text, marginTop:9 }}>已回報為誤觸</div>
            <div style={{ fontSize:12, color:t.textMuted, marginTop:5, lineHeight:1.6 }}>事件紀錄仍會保留，值班端也會收到誤觸狀態。</div>
          </div>
        : <>
          <DrvCard theme={t}>
            <div style={{ fontSize:13.5, fontWeight:800, color:t.text }}>確定是誤觸嗎？</div>
            <div style={{ fontSize:11.5, color:t.textMuted, marginTop:3, lineHeight:1.55 }}>事件紀錄仍會保留，值班端也會收到誤觸狀態。</div>
          </DrvCard>
          <div style={{ marginTop:'auto', padding:'5px 5px', borderRadius:999, background:t.surfaceLo, border:'1px solid '+t.border, display:'flex', alignItems:'center', position:'relative' }}>
            <span style={{ width:52, height:52, borderRadius:26, background:t.bgRaised, border:'1px solid '+t.border, display:'flex', alignItems:'center', justifyContent:'center', color:t.textMuted, boxShadow:'0 2px 8px rgba(0,0,0,.12)' }}><DrvIcon name="ext" size={18}/></span>
            <span style={{ flex:1, textAlign:'center', fontSize:13.5, fontWeight:700, color:t.textMuted }}>誤觸？滑動解除 →</span>
          </div>
        </>}
      <SosCtx theme={t}/>
    </SosFrame>
  );
}
// S3-11 · Resolved
function S3D_Resolved({ theme:t }) {
  const TL=[['駕駛啟動 SOS','14:30:12'],['駕駛確認通報車隊','14:30:14'],['系統收到通報','14:30:15'],['值班人員已確認','14:31:02'],['開始調查','14:40'],['已處理','15:02'],['已結案','16:20']];
  return (
    <SosFrame theme={t}>
      <DrvCard theme={t}>
        <div style={{ display:'flex', alignItems:'center', gap:9 }}>
          <span style={{ fontSize:14, fontFamily:'monospace', fontWeight:800, color:t.brand, flex:1 }}>SOS-20260720-0012</span>
          <DrvPill theme={t} tone="success" dot>已結案</DrvPill>
        </div>
      </DrvCard>
      <DrvCard theme={t}>
        {TL.map(([l,at],i)=>(
          <div key={i} style={{ display:'flex', gap:10, alignItems:'baseline', padding:'6px 0', borderBottom:i<TL.length-1?'1px solid '+t.surfaceLo:'none' }}>
            <span style={{ width:8, height:8, borderRadius:4, background:i>=5?t.success:t.brand, flexShrink:0, alignSelf:'center' }}/>
            <span style={{ flex:1, fontSize:12.5, color:t.text, fontWeight:600 }}>{l}</span>
            <span style={{ fontSize:10.5, fontFamily:'monospace', color:t.textDim }}>{at}</span>
          </div>
        ))}
      </DrvCard>
    </SosFrame>
  );
}
Object.assign(window, { SOS_RED, SosDial, SosCtx, SosFrame, S3D_ActiveTrip, S3D_Home, S3D_Sending, S3D_Submitted, S3D_Offline, S3D_Supplement, S3D_Attach, S3D_FalseAlarm, S3D_Resolved });
