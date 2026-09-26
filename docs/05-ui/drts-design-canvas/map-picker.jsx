// map-picker.jsx — A · 共用地址搜尋＋落點元件 (address-map-picker-screen-requirements-20260630).
// 9 個必畫狀態：empty / searching / candidates / selected / manual_coords / provider_down / no_results / manual_review / out_of_area
// 預覽區＝中性工具平面：無品牌地圖外殼、無裝飾插畫、無 app chrome；不依賴即時圖貼或 SDK 才能顯示。
// 兩種 skin：mgmt (theme token) 與 pb (partner booking 淺色)。降級/阻擋狀態不得看似可正常派車。
const MP_STATES = {
  empty:         { zh:'尚未輸入', tone:'neutral', next:'輸入地址或地標開始搜尋' },
  searching:     { zh:'搜尋中', tone:'info', next:'正在查詢候選地點' },
  candidates:    { zh:'請選擇候選', tone:'info', next:'從清單選一個地點以定位' },
  selected:      { zh:'已選定落點', tone:'success', next:'可繼續填寫或拖曳微調' },
  saved_pin:     { zh:'已載入落點', tone:'success', next:'可繼續填寫或拖曳微調' },
  missing_coordinate: { zh:'尚無落點', tone:'warn', next:'此地址尚無座標，請搜尋或手動標記' },
  manual_coords: { zh:'手動座標', tone:'warn', next:'請確認座標對應的實際位置' },
  provider_down: { zh:'地圖服務無回應', tone:'danger', next:'僅可送交人工複核，不會直接派車' },
  no_results:    { zh:'查無結果', tone:'warn', next:'換個關鍵字，或改用手動座標' },
  manual_review: { zh:'待人工複核', tone:'warn', next:'此地點將由客服確認後才派車' },
  out_of_area:   { zh:'不在服務範圍', tone:'danger', next:'請更換地點；此地點無法派車' },
};
function MapPicker({ theme:th, label='上車地點', state='selected', value, compact, coordinateData, reason, skin='mgmt' }) {
  const m = MP_STATES[state];
  const c = { text:th.text, muted:th.textMuted, dim:th.textDim, line:th.border, surface:th.surface, lo:th.surfaceLo, accent:th.accent, success:th.success, warn:th.warn, danger:th.danger, mono:th.mono || (typeof SHELL_MONO !== 'undefined' ? SHELL_MONO : 'ui-monospace, Menlo, monospace') };
  const tone = c[m.tone==='neutral'?'muted':m.tone==='info'?'accent':m.tone];
  const blocked = state==='provider_down' || state==='out_of_area';
  const H = compact ? 96 : 130;
  const vals = { empty:'', searching:'松仁路 1', candidates:'松仁路 100', selected:'台北市信義區松仁路 100 號', manual_coords:'25.0330, 121.5654', provider_down:'台北市信義區松仁路 100 號', saved_pin:'新竹市東區光復路二段 101 號 後門', missing_coordinate:'宜蘭縣頭城鎮濱海路 12 號', no_results:'松人路 1000 巷', manual_review:'台北市信義區松仁路 100 號 後門', out_of_area:'宜蘭縣頭城鎮濱海路 12 號' };
  const v = value ?? vals[state];
  return (
    <div style={{ border:'1px solid '+c.line, borderRadius:10, background:c.surface, overflow:'hidden' }}>
      {/* search row */}
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 10px', borderBottom:'1px solid '+c.line }}>
        <span style={{ fontSize:11, fontWeight:700, color:c.muted, width:64, flexShrink:0 }}>{label}</span>
        <div style={{ flex:1, display:'flex', alignItems:'center', gap:7, padding:'6px 10px', borderRadius:7, border:'1px solid '+(blocked?c.danger:c.line), background:c.lo }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={c.dim} strokeWidth="2"><path d="M11 4a7 7 0 105.2 11.9L21 21M11 4a7 7 0 010 14"/></svg>
          <span style={{ flex:1, fontSize:12.5, color:v?c.text:c.dim, fontFamily:state==='manual_coords'?c.mono:'inherit' }}>{v||'輸入地址、地標或座標'}</span>
          {state==='searching' && <span style={{ width:12, height:12, border:'2px solid '+c.line, borderTopColor:c.accent, borderRadius:6 }}/>}
        </div>
        <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:10.5, fontWeight:700, color:tone, whiteSpace:'nowrap' }}><span style={{ width:6, height:6, borderRadius:3, background:tone }}/>{m.zh}</span>
      </div>
      {/* candidates dropdown */}
      {state==='candidates' && (
        <div style={{ borderBottom:'1px solid '+c.line }}>
          {[['台北市信義區松仁路 100 號','台北 101 附近 · 0.1 km','TGOS 門牌','高'],['台北市信義區松仁路 100 號 B1','停車場入口','地圖服務商','中'],['新北市板橋區松仁路 100 號','2 筆同名 · 請確認縣市','TGOS 門牌','低']].map(([a,b,src,conf],i)=>(
            <div key={i} style={{ display:'flex', alignItems:'center', gap:9, padding:'8px 12px', background:i===0?c.lo:'transparent', borderTop:i?'1px solid '+c.line:'none' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={c.accent} strokeWidth="2"><path d="M12 21s-7-5.4-7-11a7 7 0 0114 0c0 5.6-7 11-7 11z"/></svg>
              <div style={{ flex:1 }}><div style={{ fontSize:12.5, color:c.text }}>{a}</div><div style={{ fontSize:10.5, color:c.dim }}>{b}</div></div>
              <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:2 }}><span style={{ fontSize:9.5, color:c.dim }}>{src}</span><span style={{ fontSize:9.5, fontWeight:700, color:conf==='高'?c.success:conf==='中'?c.warn:c.danger }}>可信度 {conf}</span></div>
            </div>
          ))}
        </div>
      )}
      {/* neutral preview plane */}
      <div style={{ height:H, position:'relative', background:'repeating-linear-gradient(0deg,'+c.lo+' 0 1px,transparent 1px 24px),repeating-linear-gradient(90deg,'+c.lo+' 0 1px,transparent 1px 24px),'+c.surface, opacity:blocked?.55:1 }}>
        {(state==='selected'||state==='manual_coords'||state==='manual_review'||state==='provider_down'||state==='saved_pin') && (
          <div style={{ position:'absolute', left:'50%', top:'50%', transform:'translate(-50%,-100%)' }}>
            <svg width="26" height="30" viewBox="0 0 24 28" fill={state==='selected'?c.accent:tone} stroke="#fff" strokeWidth="1.5"><path d="M12 27s-9-7-9-15a9 9 0 0118 0c0 8-9 15-9 15z"/><circle cx="12" cy="12" r="3.5" fill="#fff"/></svg>
          </div>
        )}
        {state==='out_of_area' && <div style={{ position:'absolute', inset:'12px 30%', border:'2px dashed '+c.danger, borderRadius:8, opacity:.6 }}/>}
        {state==='out_of_area' && <div style={{ position:'absolute', right:'14%', top:'40%' }}><svg width="26" height="30" viewBox="0 0 24 28" fill={c.danger} stroke="#fff" strokeWidth="1.5"><path d="M12 27s-9-7-9-15a9 9 0 0118 0c0 8-9 15-9 15z"/></svg></div>}
        {(state==='empty'||state==='searching'||state==='no_results'||state==='candidates'||state==='missing_coordinate') && <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11.5, color:c.dim }}>{state==='no_results'?'找不到符合的地點':state==='candidates'?'選擇候選後顯示落點':state==='missing_coordinate'?'地圖上無標記點':'預覽區 · 選定後顯示落點'}</div>}
        {state==='provider_down' && <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(255,255,255,.55)', fontSize:12, fontWeight:700, color:c.danger }}>地圖服務暫時無回應</div>}
        {(state==='selected' || state==='saved_pin') && <div style={{ position:'absolute', left:8, bottom:6, fontSize:10, fontFamily:c.mono, color:c.muted, background:c.surface, padding:'2px 6px', borderRadius:4 }}>{coordinateData ? `${coordinateData.lat}, ${coordinateData.lng}` : '25.0330, 121.5654'} · 可拖曳微調</div>}
        {state==='manual_coords' && <div style={{ position:'absolute', left:8, bottom:6, fontSize:10, color:c.warn, background:c.surface, padding:'2px 6px', borderRadius:4 }}>未經地址解析 · 請核對位置</div>}
        {(state==='selected'||state==='manual_coords'||state==='saved_pin') && <div style={{ position:'absolute', right:8, bottom:6, fontSize:9.5, fontFamily:c.mono, color:c.dim, background:c.surface, padding:'2px 6px', borderRadius:4 }}>↑↓←→ 微調 · Shift 大步</div>}
      </div>
      {(state==='manual_coords'||state==='manual_review') && (
        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 10px', borderTop:'1px solid '+c.line, background:c.lo }}>
          <span style={{ fontSize:10.5, fontWeight:700, color:c.warn, flexShrink:0 }}>{state==='manual_coords'?'手動座標理由 *':'複核理由 *'}</span>
          <span style={{ flex:1, fontSize:11.5, color:c.text, padding:'4px 8px', border:'1px solid '+c.line, borderRadius:6, background:c.surface }}>{reason !== undefined ? (reason || ' ') : (state==='manual_coords'?'新建案無門牌，依現場實測座標':'地址解析落點與實際入口不符（後門）')}</span>
        </div>
      )}
      {/* next-step footer */}
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 10px', borderTop:'1px solid '+c.line, background:blocked?(skin==='pb'?theme.dangerBg:theme.dangerBg):c.surface }}>
        <span style={{ flex:1, fontSize:11, color:blocked?c.danger:c.muted, fontWeight:blocked?700:500 }}>{m.next}</span>
        {state==='no_results' && <span style={{ fontSize:11, color:c.accent, fontWeight:700 }}>改用手動座標</span>}
        {state==='provider_down' && <span style={{ fontSize:11, color:c.danger, fontWeight:700 }}>送交人工複核 →</span>}
        {state==='out_of_area' && <span style={{ fontSize:11, color:c.danger, fontWeight:700 }}>更換地點</span>}
        {state==='manual_review' && <span style={{ fontSize:11, color:c.warn, fontWeight:700 }}>客服確認後派車</span>}
        {state==='candidates' && <span style={{ fontSize:11, color:c.dim }}>3 筆候選</span>}
      </div>
    </div>
  );
}
Object.assign(window, { MP_STATES, MapPicker });
