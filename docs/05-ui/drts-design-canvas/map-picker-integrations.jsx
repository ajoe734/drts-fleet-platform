// map-picker-integrations.jsx — A · 三線整合：租戶(訂車建立+通訊錄) / 夥伴(訂車表單) / 禮賓(訂車建立) + 9 態總覽 + 共同降級。
// 不另開彈窗/抽屜/分步；地圖中斷只能走明示人工複核，不得靜默變普通訂單。

// ── 9 態總覽（mgmt skin） ──
function MP_StatesBoard({ theme:th }) {
  return (
    <Shell theme={th} nav={TN_NAV} active="new" breadcrumb={['共用元件','地址選點 · 9 態']} env="production" tenant="YAMATO" actor={TN_ACTOR} health={TN_HEALTH} refreshTier="manual">
      <PageHeader theme={th} title="地址搜尋＋落點元件 · 9 個必畫狀態" subtitle="address-map-picker · 中性工具平面 · 每態可見下一步 · 降級/阻擋不得看似可派車"/>
      <div style={{ padding:24, display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14 }}>
        {Object.keys(MP_STATES).map(s=><Card theme={th} key={s} title={MP_STATES[s].zh} subtitle={s} padding={10}><MapPicker theme={th} state={s} compact/></Card>)}
      </div>
    </Shell>
  );
}
// ── 租戶線：訂車建立（兩欄保留，左行程卡 / 右審核卡，上下車換成成對選點） ──
function TN_NewBookingMap({ theme:th, degraded, pick, drop, reason }) {
  const ps = degraded?'provider_down':(pick||'selected'), ds = degraded?'provider_down':(drop||'selected');
  const HARD = ['out_of_area'];                                   // 服務範圍外：任何路徑皆不可送
  const UNRESOLVED = ['no_results','empty','searching','candidates','missing_coordinate']; // 尚未定點：不可送
  const MANUAL = ['manual_review','provider_down']; // 走人工複核 (含手動座標帶理由)

  // 檢查是否有 manual_coords 並帶有理由
  const hasManualCoords = ps === 'manual_coords' || ds === 'manual_coords';
  const reasonValid = (reason || '').trim() !== '';

  const hardBlocked = HARD.includes(ps) || HARD.includes(ds);
  const unresolved = UNRESOLVED.includes(ps) || UNRESOLVED.includes(ds);
  const manualPath = degraded || MANUAL.includes(ps) || MANUAL.includes(ds);
  const manualReady = manualPath && !hardBlocked && !unresolved && (!hasManualCoords || reasonValid);   // 有地址文字＋理由即可送人工複核
  const normalReady = !manualPath && !hardBlocked && !unresolved && (!hasManualCoords || reasonValid);
  return (
    <Shell theme={th} nav={TN_NAV} active="new" breadcrumb={['訂單','新增']} env="production" tenant="YAMATO" actor={TN_ACTOR} health={TN_HEALTH} refreshTier="manual">
      <PageHeader theme={th} title="建立叫車" subtitle="代訂或本人 · 預約 / 即時 · 同步 command (Q-TEN04) · 上下車改為成對地址選點"
        meta={<Pill theme={th} tone="info" dot>POST /api/tenant/bookings/commands/create</Pill>}/>
      <div style={{ padding:24, display:'grid', gridTemplateColumns:'1.4fr 1fr', gap:16, alignItems:'start' }}>
        <Card theme={th} title="行程">
          {degraded && <div style={{ marginBottom:12 }}><Banner theme={th} tone="danger" icon="warn" title="地圖服務中斷 · 本單只能送交人工複核" body="無法解析地址與落點。您可繼續填寫並送交客服人工複核；系統不會將此單靜默建立為一般訂單。"/></div>}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <Field theme={th} label="服務類型 · service_type" required><Select theme={th} value="airport_pickup"/></Field>
            <Field theme={th} label="預約 / 即時 · timing" required><Select theme={th} value="預約 · scheduled"/></Field>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:10 }}>
            <Field theme={th} label="已存上車點"><Select theme={th} value="-- 自行搜尋或地圖選點 --" /></Field>
            <Field theme={th} label="已存下車點"><Select theme={th} value={ds==='selected' ? '桃園機場 第二航廈 出境大廳' : '-- 自行搜尋或地圖選點 --'} /></Field>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:14 }}>
            <MapPicker theme={th} label="上車" state={degraded ? 'provider_down' : ps} value={ps==='empty'?'':undefined} requiresReason={manualPath} reason={reason}/>
            <MapPicker theme={th} label="下車" state={degraded ? 'provider_down' : ds} value={ds==='empty'?'':(ds==='no_results'?'桃園機場 第三航廈':'桃園機場 第二航廈 出境大廳')} requiresReason={manualPath} reason={reason}/>
            {(ps==='out_of_area'||ds==='out_of_area') && <Banner theme={th} tone="danger" icon="warn" title="有地點不在服務範圍 · 無法送出" body="請更換該地點；不可提交人工複核繞過服務範圍。"/>}
            {ds==='no_results' && <Banner theme={th} tone="warn" icon="info" title="下車查無結果 · 復原路徑" body="換關鍵字重搜，或改用手動座標（需填理由，落點將轉人工複核）。"/>}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <Field theme={th} label="出發時間 · departAt" required><Input theme={th} value="2026-09-25 17:30" mono/></Field>
            <Field theme={th} label="passenger 數 · headcount" required><Input theme={th} value="1" mono/></Field>
            <Field theme={th} label="行李 · luggage"><Input theme={th} value="2 件"/></Field>
            <Field theme={th} label="特殊需求 · note"><Input theme={th} value="兒童安全座椅"/></Field>
          </div>
        </Card>
        <Card theme={th} title="關聯與審批">
          <Field theme={th} label="passenger · 從通訊錄" required><Select theme={th} value="林士群 · Y2103"/></Field>
          <Field theme={th} label="cost center" required><Select theme={th} value="CC-FIN-04 財務處"/></Field>
          <Field theme={th} label="專案碼 · project_code"><Input theme={th} value="PRJ-2026-Q3-AUDIT" mono/></Field>
          <DL theme={th} cols={1} items={[
            { k:'預估費用 · estimate', v: degraded?'無法估算 · 待人工複核':'NT$ 1,580 · pr_v23', mono:!degraded },
            { k:'審批 · approval', v:'主管預核免簽 (r_002)' },
            { k:'配額影響 · quota', v:'本月剩餘 1,180 / 5,000' },
          ]}/>
          <div style={{ display:'flex', gap:8, marginTop:12 }}>
            <Btn theme={th}>取消</Btn><span style={{ flex:1 }}/><Btn theme={th}>另存草稿</Btn>
            {manualPath
              ? <ActionButton theme={th} descriptor={{ action:'submit_manual_review', enabled:manualReady, disabledReasonCode:hardBlocked?'OUT_OF_SERVICE_AREA':unresolved?'location_not_ready':undefined, riskLevel:'medium', requiresReason:true }} variant="primary" icon="users" label="送交人工複核" en="manual_review"/>
              : <ActionButton theme={th} descriptor={{ action:'submit_command', enabled:normalReady, disabledReasonCode:hardBlocked?'OUT_OF_SERVICE_AREA':unresolved?'location_not_ready':undefined, riskLevel:'medium' }} variant="primary" icon="check" label="送出 command" en="commit"/>}
          </div>
        </Card>
      </div>
    </Shell>
  );
}
// ── 租戶線：通訊錄（地址簿新增／編輯，內嵌選點） ──
function TN_AddressesMap({ theme:th, state='manual_review', coordinateData }) {
  const rows=[
    { name:'總部 · 信義', addr:'台北市信義區松仁路 100 號', geo:'已定位', tone:'success' },
    { name:'桃園廠', addr:'桃園市龜山區文化一路 250 號', geo:'已定位', tone:'success' },
    { name:'新竹據點（後門）', addr:'新竹市東區光復路二段 101 號 後門', geo:'待人工複核', tone:'warn' },
    { name:'舊倉庫', addr:'宜蘭縣頭城鎮濱海路 12 號', geo:'不在服務範圍', tone:'danger' },
  ];
  const requiresReason = state === 'manual_review' || state === 'manual_coords';
  const reason = requiresReason ? "貨車專用道無門牌，依現場實測定位" : "";
  return (
    <Shell theme={th} nav={TN_NAV} active="addresses" breadcrumb={['通訊錄','地址簿']} env="production" tenant="YAMATO" actor={TN_ACTOR} health={TN_HEALTH} refreshTier="manual">
      <PageHeader theme={th} title="地址簿 · Addresses" subtitle="租戶通訊錄 · 每筆地址帶落點狀態 · 新增/編輯內嵌選點元件（不開彈窗）" actions={<Btn theme={th} variant="primary" icon="plus">新增地址</Btn>}/>
      <div style={{ padding:24, display:'grid', gridTemplateColumns:'1.3fr 1fr', gap:16, alignItems:'start' }}>
        <Card theme={th} padding={0} title="地址清單">
          <Table theme={th} columns={[
            { h:'名稱', k:'name', w:130, r:r=><span style={{ fontWeight:600 }}>{r.name}</span> },
            { h:'地址', k:'addr', w:230 },
            { h:'落點狀態', w:120, r:r=><Pill theme={th} tone={r.tone} dot>{r.geo}</Pill> },
            { h:'', w:70, r:()=><Btn theme={th} size="xs" variant="ghost" icon="edit">編輯</Btn> },
          ]} rows={rows}/>
        </Card>
        <Card theme={th} title="編輯 · 新竹據點（後門）" subtitle="選點元件內嵌於表單">
          <Field theme={th} label="名稱" required><Input theme={th} value="新竹據點（後門）"/></Field>
          <div style={{ marginBottom:14 }}>
            <MapPicker theme={th} label="地址" state={state} value="新竹市東區光復路二段 101 號 後門" coordinateData={coordinateData} requiresReason={requiresReason} reason={reason}/>
            {state === 'missing_coordinate' && <div style={{ marginTop:8 }}><Banner theme={th} tone="warn" icon="warn" title="缺少座標" body="此地址目前沒有座標，請在地圖上定位。"/></div>}
          </div>
          <Field theme={th} label="備註"><Input theme={th} value="貨運出入口，正門不可停車"/></Field>
          <div style={{ display:'flex', gap:8 }}><Btn theme={th}>取消</Btn><span style={{ flex:1 }}/><Btn theme={th} variant="primary" icon="check" disabled={state==='missing_coordinate'}>儲存</Btn></div>
        </Card>
      </div>
    </Shell>
  );
}
// ── 夥伴線：訂車表單（保留方案膠囊、資格橫幅、送出鈕位置） ──
function PB_BookCardMap({ state='selected', drop='selected', reason }) {
  const p = PROGRAMS.card;
  const th = buildMgmtTheme({ console: 'partner' }); th.accent = p.primary;
  const hard = state==='out_of_area' || drop==='out_of_area';
  const unresolved = ['no_results','empty','searching','candidates','missing_coordinate'].some(s=>s===state||s===drop);
  const manualPath = ['provider_down','manual_review'].some(s=>s===state||s===drop);
  const hasManualCoords = state === 'manual_coords' || drop === 'manual_coords';
  const reasonValid = (reason || '').trim() !== '';
  const down = state==='provider_down' || drop==='provider_down';
  const blocked = manualPath && !hard && !unresolved && reasonValid;
  const notReady = hard || unresolved || (manualPath && !reasonValid) || (hasManualCoords && !reasonValid);
  return (
    <PBScreen p={p}>
      <PBHeader p={p} title="建立行程" sub="信用卡機場接送 · 桃園 T2" back/>
      <PBBody>
        <div><PBChip p={p} tone="accent">World Elite 機場接送 · 第 4 趟</PBChip></div>
        {hard
          ? <div style={{ background:th.dangerBg, border:'1px solid '+th.dangerBorder, borderRadius:12, padding:'10px 14px', fontSize:12.5, color:th.danger, fontWeight:600 }}>有地點不在服務範圍 · 無法預約，亦不可改送人工複核</div>
          : blocked
          ? <div style={{ background:th.dangerBg, border:'1px solid '+th.dangerBorder, borderRadius:12, padding:'10px 14px', fontSize:12.5, color:th.danger, fontWeight:600 }}>{down?'地圖服務中斷 · 本次預約將送交人工複核，客服確認地點後才派車':'地點需人工確認 · 送出後由客服核對後才派車'}</div>
          : <div style={{ background:p.accentBg, border:'1px solid '+p.accent+'40', borderRadius:12, padding:'10px 14px', fontSize:12.5, color:p.primaryDark, fontWeight:600 }}>資格已確認 · 剩 8 趟免費接送</div>}
        <PBCard p={p} title="機場接送資訊">
          <PBField label="航廈方向" value="出發 → 桃園機場" req/>
          <PBField label="航班編號" value="BR198" req/>
          <PBField label="航廈" value="第二航廈 T2" req/>
        </PBCard>
        <PBCard p={p} title="上下車地點">
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            <MapPicker theme={th} skin="pb" label="上車" state={state} compact requiresReason={manualPath||hasManualCoords} reason={reason}/>
            <MapPicker theme={th} skin="pb" label="下車" state={drop} value="桃園機場 第二航廈 出境大廳" compact requiresReason={manualPath||hasManualCoords} reason={reason}/>
          </div>
          {state==='out_of_area' && <div style={{ marginTop:8, fontSize:11.5, color:th.danger, fontWeight:700 }}>上車地點不在服務範圍，無法送出；請更換地點。</div>}
          <div style={{ marginTop:12 }}><PBField label="出發時間" value="2026-09-26 05:30" req/></div>
        </PBCard>
        <PBCard p={p} accentBar>
          <PBRow k="基本費用" v="NT$ 1,580" mono/><PBRow k="World Elite 禮遇" v="− NT$ 1,580" mono/><PBRow k="您將支付" v="免費"/>
        </PBCard>
      </PBBody>
      <PBFooter>{notReady
          ? <PBBtn p={p} disabled>{hard?'不在服務範圍 · 請更換地點':'請先選定上下車地點，並填寫必填理由'}</PBBtn>
        : blocked
        ? <PBBtn p={p} primary>送交人工複核</PBBtn>
        : <PBBtn p={p} primary>前往確認</PBBtn>}</PBFooter>
    </PBScreen>
  );
}
// ── 夥伴線：保險代步表單 ──
function PB_BookInsuranceMap({ state='selected', drop='selected', reason }) {
  const p = PROGRAMS.insurance;
  const th = buildMgmtTheme({ console: 'partner' }); th.accent = p.primary;
  const hard = state==='out_of_area' || drop==='out_of_area';
  const unresolved = ['no_results','empty','searching','candidates','missing_coordinate'].some(s=>s===state||s===drop);
  const manualPath = ['provider_down','manual_review'].some(s=>s===state||s===drop);
  const hasManualCoords = state === 'manual_coords' || drop === 'manual_coords';
  const reasonValid = (reason || '').trim() !== '';
  const down = state==='provider_down' || drop==='provider_down';
  const blocked = manualPath && !hard && !unresolved && reasonValid;
  const notReady = hard || unresolved || (manualPath && !reasonValid) || (hasManualCoords && !reasonValid);

  return (
    <PBScreen p={p}>
      <PBHeader p={p} title="建立代步行程" sub="保險理賠代步 · 回診接送" back />
      <PBBody>
        <PBMeter p={p} label="代步額度剩餘" en="replacement_days" used={16} total={30} unit="天" secondary="本案剩 14 天 · 含 4 趟" />
        {hard
          ? <div style={{ background:th.dangerBg, border:'1px solid '+th.dangerBorder, borderRadius:12, padding:'10px 14px', fontSize:12.5, color:th.danger, fontWeight:600 }}>有地點不在服務範圍 · 無法預約，亦不可改送人工複核</div>
          : blocked
          ? <div style={{ background:th.dangerBg, border:'1px solid '+th.dangerBorder, borderRadius:12, padding:'10px 14px', fontSize:12.5, color:th.danger, fontWeight:600 }}>{down?'地圖服務中斷 · 本次預約將送交人工複核，客服確認地點後才派車':'地點需人工確認 · 送出後由客服核對後才派車'}</div>
          : null}
        <PBCard p={p} title="理賠資訊">
          <PBField label="保單號 · policy number" value="POL-558-22019" req />
          <PBField label="理賠號 · claim number" value="CLM-2026-88142" req />
          <PBField label="理賠申請人 · claimant" value="王〇華" req />
          <PBFieldLocked label="代步期間 · replacement period" value="2026-06-01 ~ 06-30" sub="由理賠案件帶入 · 剩 14 天" />
          <PBFieldLocked label="承辦人 · case handler" value="富邦產險 · 李專員" />
        </PBCard>
        <PBCard p={p} title="行程地點">
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            <MapPicker theme={th} skin="pb" label="上車" state={state} value="新北市板橋區文化路一段 88 號" compact requiresReason={manualPath||hasManualCoords} reason={reason}/>
            <MapPicker theme={th} skin="pb" label="下車" state={drop} value="台北榮民總醫院" compact requiresReason={manualPath||hasManualCoords} reason={reason}/>
          </div>
          {state==='out_of_area' && <div style={{ marginTop:8, fontSize:11.5, color:th.danger, fontWeight:700 }}>上車地點不在服務範圍，無法送出；請更換地點。</div>}
          <PBFieldLocked label="車型權益 · vehicle class" value="一般車型 (權益內)" sub="依理賠核定 · 不可變更" />
          <PBField label="出發時間" value="2026-06-06 08:30" req />
        </PBCard>
        <PBCard p={p} accentBar>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 12, color: '#56657F', fontWeight: 600 }}>費用方向</span>
            <PBMoneyBadge kind="insurer" />
          </div>
          <PBRow k="代步權益狀態 · entitlement" v="核定通過" />
          <PBRow k="本趟費用" v="NT$ 480 · 理賠給付" mono />
          <PBRow k="您將支付" v="免費" />
        </PBCard>
      </PBBody>
      <PBFooter>{notReady
        ? <PBBtn p={p} disabled>{hard?'不在服務範圍 · 請更換地點':'請先選定上下車地點，並填寫必填理由'}</PBBtn>
        : blocked
        ? <PBBtn p={p} primary>送交人工複核</PBBtn>
        : <PBBtn p={p} primary>前往確認</PBBtn>}</PBFooter>
    </PBScreen>
  );
}

// ── 夥伴線：旅行社表單 ──
function PB_BookTravelMap({ state='selected', drop='selected', reason }) {
  const p = PROGRAMS.travel;
  const th = buildMgmtTheme({ console: 'partner' }); th.accent = p.primary;
  const hard = state==='out_of_area' || drop==='out_of_area';
  const unresolved = ['no_results','empty','searching','candidates','missing_coordinate'].some(s=>s===state||s===drop);
  const manualPath = ['provider_down','manual_review'].some(s=>s===state||s===drop);
  const hasManualCoords = state === 'manual_coords' || drop === 'manual_coords';
  const reasonValid = (reason || '').trim() !== '';
  const down = state==='provider_down' || drop==='provider_down';
  const blocked = manualPath && !hard && !unresolved && reasonValid;
  const notReady = hard || unresolved || (manualPath && !reasonValid) || (hasManualCoords && !reasonValid);

  return (
    <PBScreen p={p}>
      <PBHeader p={p} title="建立團體接送" sub="旅行社接送 · 機場 → 飯店" back />
      <PBBody>
        <PBMeter p={p} label="團體接送段數" en="transfer_legs" used={1} total={4} unit="段" secondary="本團 12 席 · 第 1 段" />
        {hard
          ? <div style={{ background:th.dangerBg, border:'1px solid '+th.dangerBorder, borderRadius:12, padding:'10px 14px', fontSize:12.5, color:th.danger, fontWeight:600 }}>有地點不在服務範圍 · 無法預約，亦不可改送人工複核</div>
          : blocked
          ? <div style={{ background:th.dangerBg, border:'1px solid '+th.dangerBorder, borderRadius:12, padding:'10px 14px', fontSize:12.5, color:th.danger, fontWeight:600 }}>{down?'地圖服務中斷 · 本次預約將送交人工複核，客服確認地點後才派車':'地點需人工確認 · 送出後由客服核對後才派車'}</div>
          : null}
        <PBCard p={p} title="團體資訊">
          <PBField label="團號 · group number" value="LION-TPE-0628" req />
          <PBField label="旅客人數 · traveler count" value="12 人" req />
          <PBField label="行李件數 · luggage" value="18 件" req />
          <PBField label="領隊 / 導遊 · guide contact" value="林〇雄 · 0922-118-456" req />
          <PBField label="航班編號 · flight number" value="JX802" />
        </PBCard>
        <PBCard p={p} title="接送行程">
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            <MapPicker theme={th} skin="pb" label="上車" state={state} value="桃園機場 第一航廈 入境大廳" compact requiresReason={manualPath||hasManualCoords} reason={reason}/>
            <MapPicker theme={th} skin="pb" label="下車" state={drop} value="台北車站" compact requiresReason={manualPath||hasManualCoords} reason={reason}/>
          </div>
          {state==='out_of_area' && <div style={{ marginTop:8, fontSize:11.5, color:th.danger, fontWeight:700 }}>上車地點不在服務範圍，無法送出；請更換地點。</div>}
          <PBField label="多點停靠 · multi-stop" value="台北車站 → 西門商旅" />
          <PBField label="舉牌需求 · signage" value="需要 · 雄獅旅遊 LION-TPE-0628" />
          <PBField label="出發時間" value="2026-06-28 14:20" req />
        </PBCard>
        <PBCard p={p} accentBar>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 12, color: '#56657F', fontWeight: 600 }}>費用方向</span>
            <PBMoneyBadge kind="tour" />
          </div>
          <PBFieldLocked label="車輛配置 · fleet" value="中型巴士 ×1" sub="依團體人數配置" />
          <PBRow k="接送段數" v="第 1 / 4 段" mono />
          <PBRow k="費用" v="已含團費" />
        </PBCard>
      </PBBody>
      <PBFooter>{notReady
        ? <PBBtn p={p} disabled>{hard?'不在服務範圍 · 請更換地點':'請先選定上下車地點，並填寫必填理由'}</PBBtn>
        : blocked
        ? <PBBtn p={p} primary>送交人工複核</PBBtn>
        : <PBBtn p={p} primary>前往確認</PBBtn>}</PBFooter>
    </PBScreen>
  );
}

// ── 禮賓線：訂車建立（保留主視覺區、服務台姿態卡、護欄卡） ──
const CG_NAV = [
  { divider:'禮賓 · Concierge' },
  { key:'desk', icon:'callcenter', label:'服務台 · Desk' },
  { key:'new', icon:'plus', label:'建立叫車 · New' },
  { key:'active', icon:'tracking', label:'進行中 · Active', badge:'3' },
  { key:'guests', icon:'users', label:'賓客 · Guests' },
];
const CG_ACTOR = { name:'CH', display:'周禮賓', role:'concierge_agent' };
function CG_NewBookingMap({ theme:th, degraded, drop, pick, success, reason, backendError }) {
  const ps = pick||'selected';
  const ds = drop||'candidates';
  const HARD = ['out_of_area'];
  const UNRESOLVED = ['no_results','empty','searching','candidates','missing_coordinate'];
  const MANUAL = ['manual_review', 'provider_down'];

  const hasManualCoords = ps === 'manual_coords' || ds === 'manual_coords';
  const reasonValid = (reason || '').trim() !== '';

  const hard = HARD.includes(ps) || HARD.includes(ds);
  const unresolved = UNRESOLVED.includes(ps) || UNRESOLVED.includes(ds);
  // Degraded or endpoint outage forces manual review path for concierge
  const manualPath = degraded || MANUAL.includes(ps) || MANUAL.includes(ds);
  const manualReady = manualPath && !hard && !unresolved && (!hasManualCoords || reasonValid);
  const normalReady = !manualPath && !hard && !unresolved && (!hasManualCoords || reasonValid);
  return (
    <Shell theme={th} nav={CG_NAV} active="new" breadcrumb={['禮賓','建立叫車']} env="production" tenant="GRAND HOTEL" actor={CG_ACTOR} health={TN_HEALTH} refreshTier="manual">
      <div style={{ padding:'26px 24px 18px', background:'linear-gradient(135deg,'+th.accentBg+','+th.surface+')', borderBottom:'1px solid '+th.border }}>
        <div style={{ fontSize:11, fontFamily:SHELL_MONO, letterSpacing:1.2, color:th.accent, fontWeight:700 }}>CONCIERGE DESK · 大廳服務台</div>
        <div style={{ fontSize:22, fontWeight:800, color:th.text, marginTop:4 }}>為賓客安排車輛</div>
        <div style={{ fontSize:12.5, color:th.textMuted, marginTop:3 }}>賓客地點以選點元件確認；地圖中斷時僅可送交人工複核</div>
      </div>
      <div style={{ padding:24, display:'grid', gridTemplateColumns:'1.4fr 1fr', gap:16, alignItems:'start' }}>
        <Card theme={th} title="行程">
          {degraded && <div style={{ marginBottom:12 }}><Banner theme={th} tone="danger" icon="warn" title="地圖服務中斷 · 只能送交人工複核" body="不會靜默建立一般訂單。請告知賓客：客服確認地點後才會派車。"/></div>}
          {backendError && <div style={{ marginBottom:12 }}><Banner theme={th} tone="danger" icon="x" title="訂單建立失敗" body={backendError}/></div>}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <Field theme={th} label="賓客" required><Select theme={th} value="Mr. Tanaka · 1208 房"/></Field>
            <Field theme={th} label="用車時間" required><Input theme={th} value="今日 15:30" mono/></Field>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:14 }}>
            <MapPicker theme={th} label="上車" state={degraded ? 'provider_down' : ps} value="圓山大飯店 正門車道" requiresReason={manualPath} reason={reason}/>
            <MapPicker theme={th} label="下車" state={degraded ? 'provider_down' : ds} value={ds==='out_of_area'?'宜蘭縣頭城鎮濱海路 12 號':'松山機場'} requiresReason={manualPath} reason={reason}/>
            {ds==='out_of_area' && <Banner theme={th} tone="danger" icon="warn" title="下車地點不在服務範圍" body="無法建立叫車；請與賓客確認其他地點。"/>}
          </div>
          <Field theme={th} label="車型偏好"><Select theme={th} value="商務轎車"/></Field>
        </Card>
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <Card theme={th} title="服務台姿態 · Desk posture">
            <DL theme={th} cols={1} items={[{ k:'代訂人', v:'周禮賓 · 大廳' },{ k:'付款', v:'掛房帳 · 1208' },{ k:'通知', v:'賓客手機 + 服務台' }]}/>
          </Card>
          <Card theme={th} title="護欄 · Guardrails">
            <div style={{ display:'flex', flexDirection:'column', gap:7, fontSize:12 }}>
              {[['上車點須為飯店核准車道',true],['下車點須在服務範圍內',!hard],['地圖中斷→人工複核',true]].map(([t,ok],i)=>(
                <div key={i} style={{ display:'flex', gap:8, alignItems:'center' }}><MgmtIcon name={ok?'check':'warn'} size={13} style={{ color:ok?th.success:th.warn }}/><span>{t}</span></div>
              ))}
            </div>
            <div style={{ marginTop:12 }}>
              {success
                ? <Banner theme={th} tone="success" icon="check" title="已建立叫車 · BK-260924-0412" body="商務轎車 · 預計 15:30 抵達正門車道 · 已通知賓客與服務台。" actions={<><Btn theme={th} size="xs" variant="primary" icon="arrow-right">追蹤行程</Btn><Btn theme={th} size="xs">再建一筆</Btn></>}/>
                : manualPath
                ? <ActionButton theme={th} descriptor={{ action:'submit_manual_review', enabled:manualReady, disabledReasonCode:hard?'OUT_OF_SERVICE_AREA':unresolved?'location_not_ready':undefined, riskLevel:'medium', requiresReason:true }} variant="primary" icon="users" label="送交人工複核" en="manual_review"/>
                : <ActionButton theme={th} descriptor={{ action:'create', enabled:normalReady, disabledReasonCode: hard?'OUT_OF_SERVICE_AREA':unresolved?'dropoff_not_selected':undefined, riskLevel:'medium' }} variant="primary" icon="check" label="建立叫車" en="create"/>}
            </div>
          </Card>
        </div>
      </div>
    </Shell>
  );
}
Object.assign(window, { MP_StatesBoard, TN_NewBookingMap, TN_AddressesMap, PB_BookCardMap, PB_BookInsuranceMap, PB_BookTravelMap, CG_NAV, CG_ACTOR, CG_NewBookingMap });
