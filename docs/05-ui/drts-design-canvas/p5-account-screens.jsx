// p5-account-screens.jsx - Passenger Account, Auth, History, Payment Screens

// ==========================================
// A-01 ~ A-09: Auth & Login
// ==========================================

const P5A_S01 = () => (
  <P5Phone>
    <P5Header status="登入智行叫車" order="" />
    <div style={{ padding: '32px 14px', flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 12, textAlign: 'center' }}>歡迎使用智行叫車</div>
      <P5Btn kind="primary" icon="phone">手機號碼登入</P5Btn>
      <P5Btn kind="secondary" icon="doc">Email 登入</P5Btn>
      <div style={{ margin: '16px 0', textAlign: 'center', fontSize: 13, color: P5.mut }}>或使用社群帳號快速登入</div>
      <P5Btn kind="secondary">Google</P5Btn>
      <P5Btn kind="secondary">Facebook</P5Btn>
      <P5Btn kind="secondary" style={{color: '#06C755'}}>LINE</P5Btn>
    </div>
  </P5Phone>
);

const P5A_S02 = () => (
  <P5Phone>
    <P5Header status="登入智行叫車" order="" />
    <div style={{ padding: '32px 14px', flex: 1, display: 'flex', flexDirection: 'column', gap: 12, justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', color: P5.mut, fontSize: 15 }}>系統維護中，目前未開放任何登入方式。</div>
    </div>
  </P5Phone>
);

const P5A_S03 = () => (
  <P5Phone>
    <P5Header status="手機號碼登入" order="" />
    <div style={{ padding: '24px 14px', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 15, fontWeight: 700 }}>請輸入您的手機號碼</div>
      <div style={{ background: P5.surface, border: '1px solid '+P5.line, padding: '12px 16px', borderRadius: 12, fontSize: 18, fontFamily: P5.mono }}>0912-345-678</div>
      <P5Btn kind="primary">取得驗證碼</P5Btn>
    </div>
  </P5Phone>
);

const P5A_S04 = () => (
  <P5Phone>
    <P5Header status="輸入驗證碼" order="" />
    <div style={{ padding: '24px 14px', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 15 }}>驗證碼已發送至 <span style={{fontFamily:P5.mono, fontWeight:700}}>0912-345-678</span></div>
      <div style={{ display: 'flex', gap: 8 }}>
        {[1,2,3,4,5,6].map(i => <div key={i} style={{ flex: 1, height: 50, background: P5.surface, border: '1px solid '+P5.line, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontFamily: P5.mono }}>{i<=4 ? '8' : ''}</div>)}
      </div>
      <div style={{ fontSize: 13, color: P5.mut, textAlign: 'center' }}>重新發送 (45s)</div>
      <P5Btn kind="primary">驗證</P5Btn>
    </div>
  </P5Phone>
);

const P5A_S05 = () => (
  <P5Phone>
    <P5Header status="輸入驗證碼" order="" />
    <div style={{ padding: '24px 14px', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <P5Notice kind="danger">驗證碼錯誤，剩餘 3 次機會</P5Notice>
      <div style={{ display: 'flex', gap: 8 }}>
        {[1,2,3,4,5,6].map(i => <div key={i} style={{ flex: 1, height: 50, background: P5.surface, border: '1px solid '+P5.dangerBd, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontFamily: P5.mono, color: P5.danger }}>8</div>)}
      </div>
      <P5Btn kind="ghost" icon="refresh">重新發送驗證碼</P5Btn>
    </div>
  </P5Phone>
);

const P5A_S06 = () => (
  <P5Phone>
    <P5Header status="首次登入" order="" />
    <div style={{ padding: '24px 14px', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 16, fontWeight: 700 }}>歡迎加入，請同意服務條款</div>
      <div style={{ flex: 1, background: P5.surface, border: '1px solid '+P5.line, borderRadius: 12, padding: 16, overflowY: 'auto', fontSize: 13, color: P5.mut, lineHeight: 1.6 }}>
        <p>歡迎使用智行叫車。我們提供預約叫車服務...</p>
        <p>依照個人資料保護法，我們會妥善保護您的乘車與付款紀錄。</p>
        <p>取消政策：指派前取消不收費。</p>
        <p>客服聯絡：02-2944-0985</p>
      </div>
      <P5Btn kind="primary" icon="check">我已閱讀並同意服務條款與隱私權</P5Btn>
    </div>
  </P5Phone>
);

const P5A_S07 = () => (
  <P5Phone>
    <P5Header status="授權登入" order="" />
    <div style={{ padding: '24px 14px', flex: 1, display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 40, height: 40, borderRadius: 20, border: '3px solid '+P5.line, borderTopColor: P5.brand, animation: 'spin 1s linear infinite' }} />
      <div style={{ color: P5.mut }}>正在導向 Google 登入...</div>
    </div>
  </P5Phone>
);

const P5A_S08 = () => (
  <P5Phone>
    <P5Header status="登入失敗" order="" />
    <div style={{ padding: '24px 14px', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <P5Notice kind="danger">此社群帳號已綁定於其他智行叫車帳戶。</P5Notice>
      <P5Btn kind="primary">返回登入頁</P5Btn>
    </div>
  </P5Phone>
);

// ==========================================
// A-10 ~ A-15: Account Management
// ==========================================

const P5A_S10 = () => (
  <P5Phone>
    <P5Header status="我的帳號" order="" />
    <div style={{ padding: '16px 0', flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <P5Card title="個人資料">
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid '+P5.line }}>
          <span style={{ color: P5.mut }}>顯示名稱</span><span>王大明</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
          <span style={{ color: P5.mut }}>聯絡手機</span><span style={{ fontFamily: P5.mono }}>0912-***-678 <span style={{ color: P5.ok, fontSize: 12 }}>(已驗證)</span></span>
        </div>
      </P5Card>
      
      <div style={{ margin: '0 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <P5Btn kind="secondary">付款方式管理</P5Btn>
        <P5Btn kind="secondary" icon="clock">行程紀錄</P5Btn>
        <P5Btn kind="secondary" icon="shield">登入方式管理</P5Btn>
      </div>
      
      <div style={{ margin: 'auto 14px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <P5Btn kind="ghost" danger>登出</P5Btn>
        <div style={{ textAlign: 'center', fontSize: 12 }}><a href="#" style={{ color: P5.mut, textDecoration: 'underline' }}>刪除帳號</a></div>
      </div>
    </div>
  </P5Phone>
);

const P5A_S11 = () => (
  <P5Phone>
    <P5Header status="登入方式管理" order="" />
    <div style={{ padding: '16px 0', flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <P5Card title="已綁定">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid '+P5.line }}>
          <span>手機號碼</span>
          <P5Btn kind="ghost" danger style={{ width: 'auto', minHeight: 30, fontSize: 12 }}>解除綁定</P5Btn>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
          <span>Google</span>
          <P5Btn kind="ghost" danger style={{ width: 'auto', minHeight: 30, fontSize: 12 }}>解除綁定</P5Btn>
        </div>
      </P5Card>
      <P5Card title="新增綁定">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          <P5Btn kind="secondary">綁定 Email</P5Btn>
          <P5Btn kind="secondary">綁定 Facebook</P5Btn>
          <P5Btn kind="secondary">綁定 LINE</P5Btn>
        </div>
      </P5Card>
    </div>
  </P5Phone>
);

const P5A_S12 = () => (
  <P5Phone>
    <P5Header status="解除綁定失敗" order="" />
    <div style={{ padding: '24px 14px', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <P5Notice kind="warn">無法解除綁定。您的帳號必須至少保留一種登入方式。</P5Notice>
      <P5Btn kind="primary">返回管理</P5Btn>
    </div>
  </P5Phone>
);

const P5A_S14 = () => (
  <P5Phone>
    <P5Header status="刪除帳號" order="" />
    <div style={{ padding: '24px 14px', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: P5.danger }}>確認要刪除帳號嗎？</div>
      <div style={{ fontSize: 14, color: P5.ink, lineHeight: 1.6 }}>
        <p>刪除後，您將無法再登入智行叫車，所有綁定的登入方式都會解除。</p>
        <p style={{ color: P5.mut }}>註：依據法規要求，您過往的行程與財務交易紀錄將依法定年限保留，但會與您的個人身分解除連結。</p>
      </div>
      <div style={{ flex: 1 }} />
      <P5Btn kind="ghost">取消</P5Btn>
      <P5Btn kind="primary" danger icon="warn">確定刪除帳號</P5Btn>
    </div>
  </P5Phone>
);

// ==========================================
// A-16 ~ A-19: Trip History & Complaints
// ==========================================

const P5A_S16 = () => (
  <P5Phone>
    <P5Header status="行程紀錄" order="" />
    <div style={{ padding: '16px 0', flex: 1, overflowY: 'auto' }}>
      <P5Card title="進行中行程" tag={<span style={{background:P5.brand,color:P5.surface,padding:'2px 6px',borderRadius:4,fontSize:10,marginLeft:8}}>進行中</span>}>
        <div style={{ fontSize: 12, color: P5.mut, marginBottom: 4 }}>2026-10-10 14:30</div>
        <div style={{ fontSize: 14 }}>台北市信義區松仁路 100 號</div>
        <P5Btn kind="secondary" style={{marginTop:8, minHeight:36}}>查看行程</P5Btn>
      </P5Card>
      
      <P5Card title="已完成">
        <div style={{ display:'flex', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize: 12, color: P5.mut, marginBottom: 4 }}>2026-10-09 09:15</div>
            <div style={{ fontSize: 14 }}>車資 NT$ 245</div>
          </div>
          <P5Btn kind="secondary" style={{width:'auto', minHeight:30, fontSize:12, padding:'0 12px'}}>填寫評價</P5Btn>
        </div>
      </P5Card>

      <P5Card title="已取消" dimmed>
        <div style={{ fontSize: 12, color: P5.mut, marginBottom: 4 }}>2026-10-08 18:20</div>
        <div style={{ fontSize: 14 }}>乘客取消</div>
      </P5Card>
    </div>
  </P5Phone>
);

const P5A_S17 = () => (
  <P5Phone>
    <P5Header status="行程紀錄" order="" />
    <div style={{ padding: '32px 14px', flex: 1, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', justifyContent: 'center' }}>
      <P5Icon name="car" size={48} style={{ color: P5.line }} />
      <div style={{ color: P5.mut, fontSize: 15 }}>目前沒有行程紀錄</div>
      <P5Btn kind="primary" style={{marginTop: 16}}>預約叫車</P5Btn>
    </div>
  </P5Phone>
);

const P5A_S18 = () => (
  <P5Phone>
    <P5Header status="聯絡客服" order="ZX-240720-0186" />
    <div style={{ padding: '24px 14px', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>問題類別</div>
        <select style={{ width: '100%', padding: 12, borderRadius: 8, border: '1px solid '+P5.line, background: P5.surface, fontSize: 14 }}>
          <option>尋找遺失物</option>
          <option>駕駛服務品質</option>
          <option>費用問題</option>
          <option>其他</option>
        </select>
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>詳細說明</div>
        <textarea style={{ width: '100%', height: 120, padding: 12, borderRadius: 8, border: '1px solid '+P5.line, background: P5.surface, fontSize: 14 }} placeholder="請描述您的問題，如為遺失物請說明特徵..."></textarea>
      </div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: P5.ink }}>
        <input type="checkbox" defaultChecked style={{ marginTop: 2 }} />
        同意客服人員透過 02-2944-0985 或您留存的聯絡方式與您聯繫
      </label>
      <P5Btn kind="primary">送出</P5Btn>
    </div>
  </P5Phone>
);

const P5A_S19 = () => (
  <P5Phone>
    <P5Header status="已送出" order="ZX-240720-0186" />
    <div style={{ padding: '40px 14px', flex: 1, display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
      <div style={{ width: 64, height: 64, borderRadius: 32, background: P5.okBg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: P5.ok }}>
        <P5Icon name="check" size={32} />
      </div>
      <div style={{ fontSize: 18, fontWeight: 700 }}>我們已收到您的問題</div>
      <div style={{ fontSize: 14, color: P5.mut, textAlign: 'center' }}>客服專員將盡快為您處理，如有需要會主動與您聯繫。</div>
      <P5Btn kind="secondary" style={{marginTop: 24}}>返回行程</P5Btn>
    </div>
  </P5Phone>
);

// ==========================================
// A-20 ~ A-23: Payment
// ==========================================

const P5A_S20 = () => (
  <P5Phone>
    <P5Header status="付款方式" order="" />
    <div style={{ padding: '16px 0', flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <P5Card title="信用卡">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid '+P5.line }}>
          <div>
            <div style={{ fontSize: 15, fontFamily: P5.mono, fontWeight: 700 }}>VISA •••• 1234</div>
            <div style={{ fontSize: 12, color: P5.mut, marginTop: 4 }}>預設付款卡片</div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0' }}>
          <div>
            <div style={{ fontSize: 15, fontFamily: P5.mono, fontWeight: 700 }}>MasterCard •••• 5678</div>
          </div>
          <P5Btn kind="ghost" style={{ width: 'auto', minHeight: 30, fontSize: 12 }}>設為預設</P5Btn>
        </div>
      </P5Card>
      <div style={{ margin: '0 14px' }}>
        <P5Btn kind="primary" icon="doc">新增信用卡</P5Btn>
      </div>
    </div>
  </P5Phone>
);

const P5A_S21 = () => (
  <P5Phone>
    <P5Header status="新增信用卡" order="" />
    <div style={{ padding: '24px 14px', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ background: P5.lineSoft, border: '1px dashed '+P5.dim, height: 160, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: P5.mut }}>
        [PSP Hosted Fields 刷卡元件位置]
      </div>
      <P5Btn kind="primary">綁定卡片</P5Btn>
    </div>
  </P5Phone>
);

const P5A_S22 = () => (
  <P5Phone>
    <P5Header status="選擇付款方式" order="" />
    <div style={{ padding: '24px 14px', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <P5Notice kind="info">請先設定付款卡片才能預約叫車</P5Notice>
      <P5Btn kind="primary">新增信用卡</P5Btn>
      <div style={{ marginTop: 24, fontSize: 13, color: P5.mut, textAlign: 'center' }}>本服務採行程完成後自動扣款，無需車上付款。</div>
    </div>
  </P5Phone>
);

const P5A_S23 = () => (
  <P5Phone>
    <P5Header status="未付款行程" order="" />
    <div style={{ padding: '24px 14px', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <P5Notice kind="danger">您有一筆行程扣款失敗，請結清後再繼續叫車。</P5Notice>
      <P5Card title="2026-10-10 12:00">
        <div style={{ fontSize: 16, fontWeight: 700, margin: '8px 0' }}>車資 NT$ 180</div>
        <div style={{ fontSize: 13, color: P5.mut }}>原卡片扣款失敗，請選擇其他卡片重試。</div>
      </P5Card>
      <P5Btn kind="primary">選擇卡片並結清</P5Btn>
      <P5Btn kind="secondary" icon="phone">聯絡客服 (02-2944-0985)</P5Btn>
    </div>
  </P5Phone>
);
