// platform-iam.jsx — C · 平台管理 身分治理工作區 (platform-admin-iam-security-screen-requirements-20260813).
// 5 分頁：使用者與成員 / 連線階段 / 特權角色審批 / 存取複核 / 緊急破窗 + 常駐破窗橫幅（≤60 分鐘）。
const IAM_TABS = [{id:'users',label:'使用者與成員'},{id:'sessions',label:'連線階段'},{id:'privileged',label:'特權角色審批',badge:'2',tone:'warn'},{id:'review',label:'存取複核',badge:'1'},{id:'breakglass',label:'緊急破窗'}];
function BreakGlassBanner({ theme:th }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:12, padding:'9px 18px', background:th.dangerBg, borderBottom:'1px solid '+th.danger, color:th.text, flexShrink:0 }}>
      <MgmtIcon name="incidents" size={16} style={{ color:th.danger }}/>
      <span style={{ fontSize:12.5, fontWeight:800, color:th.danger }}>緊急破窗授權生效中</span>
      <span style={{ fontFamily:SHELL_MONO, fontSize:13, fontWeight:800, color:th.danger }}>剩餘 41:27</span>
      <span style={{ fontSize:11.5, color:th.textMuted }}>· BG-20260924-003 · 駱思賢 · 核准：林安全</span>
      <span style={{ display:'inline-flex', gap:5, marginLeft:6 }}>{['identity:read','security:audit:read'].map(s=><Pill key={s} theme={th} tone="danger">{s}</Pill>)}</span>
      <span style={{ flex:1 }}/>
      <Btn theme={th} size="xs" variant="secondary" danger icon="x">退出破窗</Btn>
    </div>
  );
}
function IamShell({ theme:th, tab, children, actions, breakglass }) {
  return (
    <Shell theme={th} nav={PA_NAV} active="users" breadcrumb={['身分治理', IAM_TABS.find(t=>t.id===tab).label]} env="production" actor={PSB_ACTOR} health={PA_HEALTH} refreshTier="medium" dataFreshness="fresh">
      {breakglass && <BreakGlassBanner theme={th}/>}
      <PageHeader theme={th} title="身分治理 · IAM & Security" subtitle="platform-admin-iam-security · 職責分離 · 最後管理員保護 · 全程稽核" tabs={IAM_TABS} activeTab={tab} actions={actions}/>
      {children}
    </Shell>
  );
}
const FX_IAM_USERS = [
  { name:'駱思賢', email:'sx.luo@drts.example', role:'platform_admin', mfa:'已啟用 · TOTP', last:'09-24 09:58', status:'active' },
  { name:'林安全', email:'sec.lin@drts.example', role:'security_admin', mfa:'已啟用 · FIDO2', last:'09-24 09:12', status:'active' },
  { name:'陳稽核', email:'audit.chen@drts.example', role:'auditor', mfa:'未啟用', last:'09-20 17:40', status:'active', warn:true },
  { name:'王新人', email:'new.wang@drts.example', role:'ops_viewer', mfa:'—', last:'尚未登入', status:'invited' },
  { name:'李離職', email:'ex.li@drts.example', role:'platform_viewer', mfa:'已啟用', last:'08-30 18:02', status:'suspended' },
];
const IAM_UST = { active:['啟用中','success'], invited:['已邀請','info'], suspended:['已停用','neutral'] };
// C1 · 使用者與成員（+ 邀請抽屜 / 詳情抽屜）
function PA_IamUsers({ theme:th, drawer }) {
  return (
    <IamShell theme={th} tab="users" actions={<Btn theme={th} variant="primary" icon="plus">邀請成員</Btn>}>
      <div style={{ padding:24, position:'relative' }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h:'成員', w:220, r:r=><div><div style={{ fontWeight:600 }}>{r.name}</div><div style={{ fontSize:10.5, color:th.textDim, fontFamily:SHELL_MONO }}>{r.email}</div></div> },
            { h:'角色', k:'role', w:140, mono:true },
            { h:'多重驗證', w:140, r:r=><span style={{ fontSize:11.5, color:r.warn?th.warn:th.text, fontWeight:r.warn?700:400 }}>{r.mfa}</span> },
            { h:'最後登入', k:'last', w:110, mono:true },
            { h:'狀態', w:96, r:r=><Pill theme={th} tone={IAM_UST[r.status][1]} dot>{IAM_UST[r.status][0]}</Pill> },
            { h:'', w:120, r:r=><div style={{ display:'flex', gap:5 }}><Btn theme={th} size="xs" variant="ghost" icon="eye">詳情</Btn>{r.status==='active'&&<Btn theme={th} size="xs" variant="ghost" icon="lock">停用</Btn>}</div> },
          ]} rows={FX_IAM_USERS}/>
        </Card>
        {drawer==='invite' && (
          <Drawer theme={th} title="邀請成員" subtitle="寄送邀請連結 · 72 小時有效" footer={<><Btn theme={th}>取消</Btn><Btn theme={th} variant="primary" icon="check">送出邀請</Btn></>}>
            <Field theme={th} label="Email" required><Input theme={th} value="new.member@drts.example" mono/></Field>
            <Field theme={th} label="角色" required><Select theme={th} value="ops_viewer"/></Field>
            <Field theme={th} label="要求多重驗證"><Toggle theme={th} on label="首次登入須完成 MFA 綁定"/></Field>
            <Banner theme={th} tone="neutral" icon="info" body="特權角色（platform_admin / security_admin）不可直接邀請，須經特權角色審批。"/>
          </Drawer>
        )}
        {drawer==='detail' && (
          <Drawer theme={th} title="陳稽核" subtitle="auditor · audit.chen@drts.example" footer={<><Btn theme={th} icon="lock" danger>停用帳號</Btn><span style={{ flex:1 }}/><Btn theme={th} variant="primary">關閉</Btn></>}>
            <DL theme={th} cols={2} items={[{ k:'多重驗證', v:<Pill theme={th} tone="warn" dot>未啟用</Pill> },{ k:'最後登入', v:'09-20 17:40 +08', mono:true },{ k:'加入', v:'2025-11-03' },{ k:'狀態', v:<Pill theme={th} tone="success" dot>啟用中</Pill> }]}/>
            <div style={{ marginTop:14, fontSize:12, fontWeight:700, color:th.textMuted, marginBottom:8 }}>成員資格與範圍 · memberships / scope</div>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {[['auditor','platform · 全域','2026-08-01'],['ops_viewer','tenant:YAMATO','2025-11-03']].map(([r,s,d])=><div key={r} style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 10px', border:'1px solid '+th.border, borderRadius:8, fontSize:12 }}><Pill theme={th} tone="accent">{r}</Pill><span style={{ flex:1, fontFamily:SHELL_MONO, fontSize:11, color:th.textMuted }}>{s}</span><span style={{ fontSize:10.5, color:th.textDim }}>{d}</span></div>)}
            </div>
            <div style={{ marginTop:14, fontSize:12, fontWeight:700, color:th.textMuted, marginBottom:8 }}>連線階段 · 逐筆撤銷</div>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {[['sess_••••••33de','Windows · Edge','09-20 18:55'],['sess_••••••c1b4','Android · Chrome','09-19 12:30']].map(([t,d,l])=><div key={t} style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 10px', border:'1px solid '+th.border, borderRadius:8, fontSize:11.5 }}><span style={{ fontFamily:SHELL_MONO, fontSize:10.5 }}>{t}</span><span style={{ flex:1, color:th.textMuted }}>{d} · {l}</span><ActionButton theme={th} size="xs" descriptor={{ action:'revoke_session', enabled:true, riskLevel:'medium', requiresReason:true }} icon="x" label="撤銷" en="revoke"/></div>)}
            </div>
            <div style={{ marginTop:14, fontSize:12, fontWeight:700, color:th.textMuted, marginBottom:8 }}>歷史稽核時間軸</div>
            <Timeline theme={th} events={[
              { at:'09-20 17:40', tone:'neutral', t:'登入 · 密碼' },
              { at:'09-18 10:02', tone:'warn', t:'MFA 提醒已寄送 · 未完成' },
              { at:'08-01 09:00', tone:'info', t:'角色變更 ops_viewer → auditor', body:'審批 PR-0071 · 駱思賢' },
              { at:'2025-11-03', tone:'success', t:'接受邀請 · 建立帳號' },
            ]}/>
          </Drawer>
        )}
      </div>
    </IamShell>
  );
}
// C2 · 連線階段
function PA_IamSessions({ theme:th }) {
  const rows=[
    { user:'駱思賢', dev:'macOS · Chrome 128', ip:'203.•••.•••.18', token:'sess_••••••7f21', since:'09-24 08:31', last:'09:58', cur:true },
    { user:'駱思賢', dev:'iOS · Safari', ip:'42.•••.•••.201', token:'sess_••••••a90c', since:'09-23 21:10', last:'09-23 22:40' },
    { user:'陳稽核', dev:'Windows · Edge', ip:'61.•••.•••.77', token:'sess_••••••33de', since:'09-20 17:40', last:'09-20 18:55' },
    { user:'陳稽核', dev:'Android · Chrome', ip:'114.•••.•••.9', token:'sess_••••••c1b4', since:'09-19 12:03', last:'09-19 12:30' },
  ];
  return (
    <IamShell theme={th} tab="sessions">
      <div style={{ padding:24 }}>
        <Card theme={th} padding={0} title="現存連線階段" subtitle="權杖摘要遮罩 · 可遠端終止單一階段">
          <Table theme={th} columns={[
            { h:'使用者', k:'user', w:90 },
            { h:'裝置 / 瀏覽器', k:'dev', w:170 },
            { h:'IP（遮罩）', k:'ip', w:130, mono:true },
            { h:'權杖摘要', k:'token', w:150, mono:true },
            { h:'建立', k:'since', w:110, mono:true },
            { h:'最後活動', k:'last', w:110, mono:true },
            { h:'', w:150, r:r=>r.cur?<Pill theme={th} tone="success" dot>目前階段</Pill>:<ActionButton theme={th} size="xs" descriptor={{ action:'revoke_session', enabled:true, riskLevel:'medium', requiresReason:true }} icon="x" label="遠端終止" en="revoke"/> },
          ]} rows={rows}/>
        </Card>
      </div>
    </IamShell>
  );
}
// C3 · 特權角色審批
function PA_IamPrivileged({ theme:th, stepUpState = "none" }) {
  return (
    <IamShell theme={th} tab="privileged" actions={<Btn theme={th} variant="primary" icon="plus">申請特權角色</Btn>}>
      <div style={{ padding:24, display:'grid', gridTemplateColumns:'1.3fr 1fr', gap:16, alignItems:'start' }}>
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <Card theme={th} title="申請 PR-0088 · 林安全" subtitle="申請 platform_admin · 待審批" actions={<Pill theme={th} tone="warn" dot>待審批</Pill>}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
              <Pill theme={th} tone="neutral">現持 · security_admin</Pill><MgmtIcon name="arrow-right" size={14} style={{ color:th.textDim }}/><Pill theme={th} tone="accent">申請 · platform_admin</Pill>
            </div>
            <DL theme={th} cols={2} items={[{ k:'申請人', v:'林安全' },{ k:'申請時間', v:'09-24 09:30', mono:true },{ k:'理由', v:'代理平台管理' },{ k:'審批人', v:'需 platform_admin（非本人）' }]}/>
            <div style={{ marginTop:12 }}><Banner theme={th} tone="danger" icon="lock" title="職責分離衝突 · 核准已被系統阻擋" body="林安全現持 security_admin，申請 platform_admin 屬同 realm 不相容角色配對（INCOMPATIBLE_ROLE_PAIRS）。後端 checkSodPolicy 回 403 IAM_SOD_VIOLATION；無例外理由放行。需先卸除 security_admin 或改申請其他角色。"/></div>
            <div style={{ display:'flex', gap:8, marginTop:12 }}>
              <ActionButton theme={th} descriptor={{ action:'approve', enabled:false, disabledReasonCode:'IAM_SOD_VIOLATION', riskLevel:'high' }} variant="primary" icon="check" label="核准" en="approve"/>
              <ActionButton theme={th} descriptor={{ action:'reject', enabled:true, riskLevel:'medium', requiresReason:true }} icon="x" label="駁回" en="reject"/>
              <Btn theme={th} icon="arrow-right">請申請人先卸除 security_admin</Btn>
            </div>
          </Card>
          <Card theme={th} title="申請 PR-0087 · 李離職 降權" subtitle="platform_admin → 無" actions={<Pill theme={th} tone="danger" dot>受阻</Pill>}>
            <Banner theme={th} tone="danger" icon="lock" title="最後一名管理員保護" body="李離職為目前唯一具 platform_admin 的啟用帳號；移除前須先有另一名核准的 platform_admin。此操作已被系統阻擋。"/>
          </Card>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
        <Card theme={th} title="申請 PR-0086 · 王新人 → security_admin" subtitle="待審批 · 單人核准" actions={<Pill theme={th} tone="warn" dot>待審批</Pill>}>
          <Stepper theme={th} current={1} steps={['送出','非本人核准 + step-up','生效']}/>
          <div style={{ marginTop:12 }}>
            {stepUpState === "none" && <Banner theme={th} tone="warn" icon="lock" title="需 Fresh MFA 重新驗證" body="核准高權限角色前，需具有有效的 Fresh MFA 或伺服器憑證。若驗證失效，伺服器將拒絕並回傳 401 IAM_STEP_UP_REQUIRED。"/>}
            {stepUpState === "verifying" && <Banner theme={th} tone="info" icon="clock" title="正在驗證身分..."/>}
            {stepUpState === "valid" && <Banner theme={th} tone="success" icon="check" title="身分驗證有效" body="已符合 Fresh MFA 或伺服器憑證要求，可進行核准操作。"/>}
            {stepUpState === "expired" && <Banner theme={th} tone="danger" icon="alert-triangle" title="驗證過期 (401 IAM_STEP_UP_REQUIRED)" body="目前的登入憑證已失效，請重新登入 (Fresh MFA) 後再試。" actions={<Btn theme={th} size="xs" variant="primary" icon="refresh">重新登入</Btn>}/>}
          </div>
          <div style={{ display:'flex', gap:8, marginTop: 12 }}>
            <ActionButton theme={th} descriptor={{ action:'approve', enabled: stepUpState === 'valid', disabledReasonCode:'IAM_STEP_UP_REQUIRED', riskLevel:'high', requiresReason:true }} variant="primary" icon="check" label="核准" en="approve"/>
          </div>
        </Card>
        <Card theme={th} title="申請表單">
          <Field theme={th} label="對象成員" required><Select theme={th} value="王新人"/></Field>
          <Field theme={th} label="目標角色" required><Select theme={th} value="security_admin"/></Field>
          <Field theme={th} label="理由" required><Input theme={th} value="接手資安事件處理"/></Field>
          <Field theme={th} label="有效期限"><Select theme={th} value="永久（需季度存取複核）"/></Field>
          <ActionButton theme={th} descriptor={{ action:'submit', enabled:true, riskLevel:'medium' }} variant="primary" icon="check" label="送出申請" en="submit"/>
        </Card>
        </div>
      </div>
    </IamShell>
  );
}
// C4 · 存取複核
function PA_IamReview({ theme:th, create }) {
  const rows=[
    { user:'駱思賢', role:'platform_admin', last:'09-24', decision:null },
    { user:'林安全', role:'security_admin', last:'09-24', decision:'確認' },
    { user:'陳稽核', role:'auditor', last:'09-20', decision:null, flag:'MFA 未啟用' },
    { user:'李離職', role:'platform_viewer', last:'08-30', decision:null, flag:'逾期 25 天未登入' },
  ];
  const DEC = { '確認':'success', '降權':'warn', '移除':'danger' };
  return (
    <IamShell theme={th} tab="review" actions={<><Btn theme={th} icon="refresh">逾期掃描</Btn><Btn theme={th} variant="primary" icon="plus">建立複核活動</Btn></>}>
      <div style={{ padding:24, display:'grid', gridTemplateColumns:'1fr 1.6fr', gap:16, alignItems:'start', position:'relative' }}>
        {create && (
          <Drawer theme={th} title="建立複核活動" subtitle="access review campaign" footer={<><Btn theme={th}>取消</Btn><Btn theme={th} variant="primary" icon="check">建立並指派複核人</Btn></>}>
            <Field theme={th} label="名稱" required><Input theme={th} value="2026 Q4 季度複核"/></Field>
            <Field theme={th} label="範圍" required><Select theme={th} value="所有特權角色（platform_admin / security_admin / platform_viewer）"/></Field>
            <Field theme={th} label="複核人" required><Select theme={th} value="林安全 · security_admin"/></Field>
            <Field theme={th} label="截止日" required><Input theme={th} value="2026-12-15" mono/></Field>
            <Field theme={th} label="逾期未登入門檻"><Input theme={th} value="30 天" mono/></Field>
            <Banner theme={th} tone="neutral" icon="info" body="建立後系統自動掃描逾期帳號並標旗；複核人不可複核自己的角色。"/>
          </Drawer>
        )}
        <Card theme={th} title="複核活動" padding={0}>
          {[['AR-2026-Q3','2026 Q3 季度複核','進行中','warn','4 項 · 1 已決定'],['AR-2026-Q2','2026 Q2 季度複核','已完成','success','5 項'],['AR-2026-ADHOC-02','離職稽核','已完成','success','1 項']].map(([id,n,s,t,sub],i)=>(
            <div key={id} style={{ padding:'11px 14px', borderTop:i?'1px solid '+th.borderSoft:'none', background:i===0?th.accentBg:'transparent' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}><span style={{ fontWeight:700, fontSize:12.5, flex:1 }}>{n}</span><Pill theme={th} tone={t} dot>{s}</Pill></div>
              <div style={{ fontSize:10.5, color:th.textDim, fontFamily:SHELL_MONO, marginTop:2 }}>{id} · {sub}</div>
            </div>
          ))}
        </Card>
        <Card theme={th} title="AR-2026-Q3 · 項目" subtitle="四種決定：確認 / 降權 / 移除 / 逾期掃描" padding={0}>
          <Table theme={th} columns={[
            { h:'成員', k:'user', w:90, r:r=><span style={{ fontWeight:600 }}>{r.user}</span> },
            { h:'角色', k:'role', w:130, mono:true },
            { h:'最後登入', k:'last', w:80, mono:true },
            { h:'旗標', w:130, r:r=>r.flag?<Pill theme={th} tone="warn">{r.flag}</Pill>:<span style={{ color:th.textDim }}>—</span> },
            { h:'決定', w:230, r:r=>r.decision?<Pill theme={th} tone={DEC[r.decision]} dot>{r.decision}</Pill>:<div style={{ display:'flex', gap:4 }}><Btn theme={th} size="xs" variant="secondary" icon="check">確認</Btn><Btn theme={th} size="xs" variant="secondary">降權</Btn><Btn theme={th} size="xs" variant="secondary" danger>移除</Btn></div> },
          ]} rows={rows}/>
        </Card>
      </div>
    </IamShell>
  );
}
// C5 · 緊急破窗（申請 → 單人核准 → 啟用 → 短效權杖）
function PA_IamBreakGlass({ theme:th, active, state = "form", stepUpState = "none" }) {
  // Backwards compatibility with 'active' prop
  const resolvedState = active ? "active" : state;
  const isForm = resolvedState === "form";
  const isRequested = resolvedState === "requested";
  const isApproved = resolvedState === "approved";
  const isActive = resolvedState === "active" || resolvedState === "exit_failed";
  const isClosed = resolvedState === "closed";
  const isExpiredGrant = resolvedState === "expired_grant";

  const stepMap = {
    form: 0,
    requested: 1,
    approved: 2,
    active: 3,
    exit_failed: 3,
    closed: 3,
    expired_grant: 3,
  };

  return (
    <IamShell theme={th} tab="breakglass" breakglass={isActive}>
      <div style={{ padding:24, display:'grid', gridTemplateColumns:'1.3fr 1fr', gap:16, alignItems:'start' }}>
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <Card theme={th} title={isActive || isClosed ? 'BG-20260924-003' : '申請緊急破窗'} subtitle="單人核准 · 上限 60 分鐘 · 全程稽核">
            <div style={{ marginBottom:14 }}><Stepper theme={th} current={stepMap[resolvedState]} steps={['申請','核准','啟用 · 發放短效權杖']}/></div>

            {isForm && (
              <>
                <Field theme={th} label="事故 / 理由" required><Input theme={th} value="INC-20260924-07 · 租戶帳務凍結需緊急解除"/></Field>
                <Field theme={th} label="申請範圍" required><div style={{ display:'flex', gap:7, flexWrap:'wrap' }}><Checkbox theme={th} on label="identity:read"/><Checkbox theme={th} on label="security:audit:read"/><Checkbox theme={th} label="identity:sessions:revoke"/></div></Field>
                <Field theme={th} label="持續時間（≤ 60 分鐘）" required><Input theme={th} value="60 分鐘" mono/></Field>
                <div style={{ marginTop:12 }}>
                  {stepUpState === "none" && <Banner theme={th} tone="warn" icon="lock" title="操作前請先取得 step-up 憑證或重新登入 (Fresh MFA)" actions={<Btn theme={th} size="xs" variant="primary" icon="lock">取得 step-up proof</Btn>}/>}
                  {stepUpState === "verifying" && <Banner theme={th} tone="info" icon="clock" title="正在向伺服器請求身分驗證憑證..."/>}
                  {stepUpState === "valid" && <Field theme={th} label="stepUpReference" required hint="已由 step-up 驗證回填"><Input theme={th} value="sup_••••••••b3e1" mono readOnly/></Field>}
                  {stepUpState === "expired" && (
                    <>
                      <Banner theme={th} tone="danger" icon="alert-triangle" title="憑證無效 (403 IAM_STEP_UP_REQUIRED)" body="憑證已過期或被拒絕，請重新登入 (Fresh MFA) 後再試。" actions={<Btn theme={th} size="xs" variant="primary" icon="refresh">重新取得</Btn>}/>
                      <Field theme={th} label="stepUpReference" required hint="已失效"><Input theme={th} value="sup_••••••••b3e1" mono readOnly disabled/></Field>
                    </>
                  )}
                </div>
                <div style={{ marginTop: 12 }}>
                  <ActionButton theme={th} descriptor={{ action:'request_breakglass', enabled:stepUpState === "valid", riskLevel:'high', requiresReason:true }} variant="primary" icon="incidents" label="送出破窗申請" en="request"/>
                </div>
              </>
            )}

            {isRequested && (
              <>
                <DL theme={th} cols={2} items={[
                  { k:'申請人', v:'駱思賢' }, { k:'狀態', v:<Pill theme={th} tone="warn" dot>待核准</Pill> },
                  { k:'申請範圍', v:'identity:read · security:audit:read', mono:true }
                ]}/>
                <div style={{ marginTop:12 }}>
                  {stepUpState === "none" && <Banner theme={th} tone="warn" icon="lock" title="需 step-up proof" body="操作前需重新驗證取得 stepUpReference。核准請求須附此參照；過期或缺漏將回傳 403 IAM_STEP_UP_REQUIRED。" actions={<Btn theme={th} size="xs" variant="primary" icon="lock">取得 step-up proof</Btn>}/>}
                  {stepUpState === "verifying" && <Banner theme={th} tone="info" icon="clock" title="正在向伺服器請求身分驗證憑證..."/>}
                  {stepUpState === "valid" && <Banner theme={th} tone="success" icon="check" title="身分驗證憑證有效" body="可進行高風險操作。"/>}
                  {stepUpState === "expired" && <Banner theme={th} tone="danger" icon="alert-triangle" title="憑證無效 (403 IAM_STEP_UP_REQUIRED)" body="憑證已過期或被拒絕，請重新取得。" actions={<Btn theme={th} size="xs" variant="primary" icon="refresh">重新取得</Btn>}/>}
                </div>
                <div style={{ marginTop:10 }}>
                  {stepUpState === "none" && <Field theme={th} label="stepUpReference" required hint="尚未取得 · 核准前先完成 step-up"><Input theme={th} value="—" mono readOnly/></Field>}
                  {stepUpState === "verifying" && <Field theme={th} label="stepUpReference" required hint="驗證中"><Input theme={th} value="驗證中..." mono readOnly disabled/></Field>}
                  {stepUpState === "valid" && <Field theme={th} label="stepUpReference" required hint="由 step-up 驗證回填 · 到期 09-24 10:41"><Input theme={th} value="sup_••••••••b3e1 · 剩 04:12" mono readOnly/></Field>}
                  {stepUpState === "expired" && <Field theme={th} label="stepUpReference" required hint="已失效"><Input theme={th} value="sup_••••••••b3e1 (已失效)" mono readOnly disabled/></Field>}
                </div>
                <div style={{ marginTop:12, display:'flex', gap:8 }}>
                  <ActionButton theme={th} descriptor={{ action:'approve', enabled:stepUpState === "valid", disabledReasonCode:'IAM_STEP_UP_REQUIRED', riskLevel:'high' }} variant="primary" icon="check" label="核准 (需 proof)" en="approve"/>
                </div>
              </>
            )}

            {isApproved && (
              <>
                <DL theme={th} cols={2} items={[
                  { k:'申請人', v:'駱思賢' },{ k:'核准', v:'林安全' },
                  { k:'狀態', v:<Pill theme={th} tone="success" dot>已核准，待啟用</Pill> },
                  { k:'到期時間', v:'不自動到期 (待啟用)' }
                ]}/>
                <div style={{ marginTop:12 }}>
                  {stepUpState === "none" && <Banner theme={th} tone="warn" icon="lock" title="啟用前請先取得 step-up 憑證或重新登入 (Fresh MFA)" actions={<Btn theme={th} size="xs" variant="primary" icon="lock">取得 step-up proof</Btn>}/>}
                  {stepUpState === "verifying" && <Banner theme={th} tone="info" icon="clock" title="正在向伺服器請求身分驗證憑證..."/>}
                  {stepUpState === "valid" && <Field theme={th} label="stepUpReference" required hint="已由 step-up 驗證回填"><Input theme={th} value="sup_••••••••b3e1" mono readOnly/></Field>}
                  {stepUpState === "expired" && (
                    <>
                      <Banner theme={th} tone="danger" icon="alert-triangle" title="無法啟用緊急權限 (403 IAM_STEP_UP_REQUIRED)" body="由於系統未能驗證您的身分憑證，目前無法核發權杖。請重新登入 (Fresh MFA) 後再試。" actions={<Btn theme={th} size="xs" variant="primary" icon="refresh">重新取得</Btn>}/>
                      <Field theme={th} label="stepUpReference" required hint="已失效"><Input theme={th} value="sup_••••••••b3e1" mono readOnly disabled/></Field>
                    </>
                  )}
                </div>
                <div style={{ marginTop:12, display:'flex', gap:8 }}>
                  <ActionButton theme={th} descriptor={{ action:'activate', enabled:stepUpState === "valid", disabledReasonCode:stepUpState === "valid" ? undefined : 'NO_API_POLICY', riskLevel:'high' }} variant="primary" danger icon="power" label="啟用緊急權限" en="activate"/>
                </div>
              </>
            )}

            {isActive && (
              <>
                <DL theme={th} cols={2} items={[
                  { k:'申請人', v:'駱思賢' },{ k:'核准', v:'林安全' },
                  { k:'啟用時間', v:'09-24 10:18:33 +08', mono:true },{ k:'到期', v:'11:18:33 · 剩 41:27', mono:true },
                  { k:'短效權杖', v:<span style={{ fontFamily:SHELL_MONO }}>bgt_••••••••••••9e2f <Pill theme={th} tone="neutral">僅顯示一次</Pill></span> },{ k:'已授權範圍', v:'identity:read · security:audit:read', mono:true },
                ]}/>
                {resolvedState === "exit_failed" && (
                  <div style={{ marginTop:12 }}><Banner theme={th} tone="danger" icon="alert-triangle" title="無法自動退出 (403 IAM_STEP_UP_REQUIRED)" body="由於系統未能驗證您的身分憑證，無法正常撤銷權杖。請聯絡系統管理員手動介入。"/></div>
                )}
                <div style={{ marginTop:12, display:'flex', gap:8 }}><Btn theme={th} variant="secondary" danger icon="x">提前退出破窗</Btn><Btn theme={th} icon="audit">檢視稽核紀錄</Btn></div>
              </>
            )}

            {isClosed && (
              <>
                <DL theme={th} cols={2} items={[
                  { k:'申請人', v:'駱思賢' },{ k:'核准', v:'林安全' },
                  { k:'狀態', v:<Pill theme={th} tone="neutral" dot>已結束</Pill> },
                  { k:'結束時間', v:'09-24 10:45:12 +08', mono:true }
                ]}/>
                <div style={{ marginTop:12, display:'flex', gap:8 }}><Btn theme={th} icon="audit">檢視稽核紀錄</Btn></div>
              </>
            )}

            {isExpiredGrant && (
              <>
                <DL theme={th} cols={2} items={[
                  { k:'申請人', v:'駱思賢' },{ k:'核准', v:'林安全' },
                  { k:'狀態', v:<Pill theme={th} tone="danger" dot>授權已逾時</Pill> },
                  { k:'過期時間', v:'09-24 11:18:33 +08', mono:true }
                ]}/>
                <div style={{ marginTop:12 }}>
                  <Banner theme={th} tone="danger" icon="alert-triangle" title="短效權杖已撤銷" body="超過 60 分鐘授權上限，系統已自動撤銷您的破窗權杖及所有相關連線。"/>
                </div>
                <div style={{ marginTop:12, display:'flex', gap:8 }}><Btn theme={th} icon="audit">檢視稽核紀錄</Btn></div>
              </>
            )}



          </Card>
        </div>
        <Card theme={th} title="破窗規則">
          <div style={{ display:'flex', flexDirection:'column', gap:8, fontSize:12 }}>
            {['授權時間上限 60 分鐘，不可延長，需重新申請','需一位非本人核准者','啟用期間外殼常駐紅色橫幅（倒數 + 範圍 + 退出）','所有動作標記 break_glass 進入稽核','到期或退出即撤銷短效權杖'].map((t,i)=><div key={i} style={{ display:'flex', gap:8 }}><MgmtIcon name="check" size={13} style={{ color:th.success, marginTop:1 }}/><span>{t}</span></div>)}
          </div>
        </Card>
      </div>
    </IamShell>
  );
}
Object.assign(window, { IAM_TABS, BreakGlassBanner, IamShell, FX_IAM_USERS, IAM_UST, PA_IamUsers, PA_IamSessions, PA_IamPrivileged, PA_IamReview, PA_IamBreakGlass });
