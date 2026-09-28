// fleet-errors.jsx — B · 車隊夥伴後台 錯誤與缺權限 (fleet-portal-missing-scope-screen-requirements-20260808).
// 只用畫板現有 Card / Pill / Btn 三種基本元件；fleet realm 深色緊湊。
function FLP_MissingScope({ theme:th }) {
  return (
    <FlpShell theme={th} active="dashboard" breadcrumb={['錯誤']}>
      <div style={{ minHeight:'100%', display:'flex', alignItems:'center', justifyContent:'center', padding:40 }}>
        <Card theme={th} style={{ width:520 }} padding={28}>
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', textAlign:'center', gap:12 }}>
            <Pill theme={th} tone="danger" dot>缺少車隊身分<span style={{ marginLeft:4, opacity:.6, fontFamily:SHELL_MONO, fontSize:9 }}>FLEET_SCOPE_MISSING</span></Pill>
            <div style={{ fontSize:20, fontWeight:800, color:th.text, marginTop:4 }}>無法辨識您所屬的車隊</div>
            <div style={{ fontSize:13, color:th.textMuted, lineHeight:1.65, maxWidth:400 }}>您的帳號缺少有效的車隊識別設定，因此無法載入任何車隊資料。請聯絡您的車隊管理員或平台客服重新綁定車隊身分。</div>
            <div style={{ display:'flex', gap:8, marginTop:6 }}>
              <Btn theme={th} variant="primary" icon="users">聯絡車隊管理員</Btn>
              <Btn theme={th} icon="lock">登出</Btn>
            </div>
            <div style={{ fontSize:10.5, color:th.textDim, fontFamily:SHELL_MONO, marginTop:6 }}>trace c-fp-88a1 · 09-24 10:02 +08</div>
          </div>
        </Card>
      </div>
    </FlpShell>
  );
}
function FLP_PageError({ theme:th }) {
  return (
    <FlpShell theme={th} active="trips" breadcrumb={['行程']}>
      <div style={{ minHeight:'100%', display:'flex', alignItems:'center', justifyContent:'center', padding:40 }}>
        <Card theme={th} style={{ width:520 }} padding={28}>
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', textAlign:'center', gap:12 }}>
            <Pill theme={th} tone="warn" dot>頁面發生錯誤<span style={{ marginLeft:4, opacity:.6, fontFamily:SHELL_MONO, fontSize:9 }}>UNHANDLED_ERROR</span></Pill>
            <div style={{ fontSize:20, fontWeight:800, color:th.text, marginTop:4 }}>這個頁面暫時無法顯示</div>
            <div style={{ fontSize:13, color:th.textMuted, lineHeight:1.65, maxWidth:400 }}>發生未預期的錯誤，您的資料沒有受到影響。請重試一次；若持續發生，請附上追蹤編號回報。</div>
            <div style={{ display:'flex', gap:8, marginTop:6 }}>
              <Btn theme={th} variant="primary" icon="refresh">重試</Btn>
              <Btn theme={th} icon="arrow-right">回營運總覽</Btn>
            </div>
            <div style={{ fontSize:10.5, color:th.textDim, fontFamily:SHELL_MONO, marginTop:6 }}>trace c-fp-91c4 · 09-24 10:05 +08</div>
          </div>
        </Card>
      </div>
    </FlpShell>
  );
}
Object.assign(window, { FLP_MissingScope, FLP_PageError });
