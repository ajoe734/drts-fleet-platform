// fleet-supply.jsx — Packet 1 · 車行供給自主建檔 write-flow. EXTENDS Fleet Partner Portal (emerald realm).
// Two-layer model: fleet edits a SUBMISSION (draft); platform approves → canonical registry.
// Reuses FlpShell/FLP_NAV + mgmt primitives. zh-TW primary · en secondary. Fleet-scoped.

// ── reason codes (SA §4.9) → readable zh + fix action ────────────────────────
const FLP_REASONS = {
  DRIVER_LICENSE_MISSING:      { zh: '缺職業駕照', fix: '上傳職業駕駛執照' },
  DRIVER_LICENSE_EXPIRED:      { zh: '職業駕照過期', fix: '更新駕照到期日與附件' },
  DRIVER_REGISTRATION_MISSING: { zh: '缺計程車登記證', fix: '上傳登記證' },
  DRIVER_REGISTRATION_EXPIRED: { zh: '登記證過期', fix: '更新登記證' },
  VEHICLE_DOCUMENT_MISSING:    { zh: '缺車輛文件', fix: '上傳行照' },
  INSURANCE_MISSING:           { zh: '缺保險', fix: '送出 insurance_update' },
  INSURANCE_EXPIRED:           { zh: '保險過期', fix: '更新保單' },
  CONTRACT_MISSING:            { zh: '缺契約', fix: '送出 contract_update' },
  CONTRACT_INACTIVE:           { zh: '契約未生效', fix: '確認契約期間' },
  DRIVER_AFFILIATION_MISSING:  { zh: '司機未掛靠', fix: '建立掛靠關係' },
  VEHICLE_AFFILIATION_MISSING: { zh: '車輛未掛靠', fix: '建立掛靠關係' },
  SERVICE_PRODUCT_NOT_SUPPORTED:{ zh: '不支援該服務產品', fix: '調整支援產品' },
  TRAINING_REQUIRED:           { zh: '需完成訓練', fix: '前往訓練' },
  FLEET_PARTNER_INACTIVE:      { zh: '車行未啟用', fix: '聯絡平台' },
  MANUALLY_SUSPENDED:          { zh: '人工停權', fix: '聯絡平台申訴' },
};

// ── submission status (SA §4.7 state machine) ────────────────────────────────
const FLP_SUB_STATUS = {
  draft:          { zh: '草稿', en: 'draft', tone: 'neutral' },
  submitted:      { zh: '已送審', en: 'submitted', tone: 'info' },
  in_review:      { zh: '審核中', en: 'in_review', tone: 'accent' },
  needs_revision: { zh: '待補正', en: 'needs_revision', tone: 'warn' },
  approved:       { zh: '已核可', en: 'approved', tone: 'success' },
  rejected:       { zh: '已駁回', en: 'rejected', tone: 'danger' },
  withdrawn:      { zh: '已撤回', en: 'withdrawn', tone: 'neutral' },
};
function subPill(th, s) { const m = FLP_SUB_STATUS[s] || FLP_SUB_STATUS.draft; return <Pill theme={th} tone={m.tone} dot>{m.zh}<span style={{ marginLeft: 4, opacity: .6, fontFamily: SHELL_MONO, fontSize: 9.5 }}>{m.en}</span></Pill>; }

// ── Readiness widget (§5.7 / VQ-3) ───────────────────────────────────────────
function Readiness({ theme: th, state = 'ready', reasons = [], compact }) {
  const M = { ready: { tone: 'success', zh: '可派 · ready', icon: 'check' }, not_ready: { tone: 'warn', zh: '不可派 · not_ready', icon: 'warn' }, suspended: { tone: 'danger', zh: '停權 · suspended', icon: 'lock' } }[state];
  return (
    <div style={{ border: '1px solid ' + th.border, borderRadius: 10, padding: compact ? 12 : 14, background: th.surface }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: reasons.length ? 10 : 0 }}>
        <MgmtIcon name={M.icon} size={15} style={{ color: th[M.tone] }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: th.text }}>派遣資格</span>
        <Pill theme={th} tone={M.tone} dot>{M.zh}</Pill>
      </div>
      {reasons.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {reasons.map(rc => {
            const r = FLP_REASONS[rc] || { zh: rc, fix: '補件' };
            return (
              <span key={rc} title={rc} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, padding: '4px 9px', borderRadius: 999, background: th.warnBg, border: '1px solid ' + th.warnBorder, color: th.warn, cursor: 'pointer' }}>
                <MgmtIcon name="warn" size={11} />{r.zh}
                <span style={{ opacity: .55, fontFamily: SHELL_MONO, fontSize: 9 }}>→ {r.fix}</span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── fixtures ─────────────────────────────────────────────────────────────────
const FX_SUPPLY_GROUPS = {
  draft:    [{ id: 'sub_d41', t: '司機 · 周建良', sub: 'driver draft', note: '尚未送審' }],
  review:   [{ id: 'sub_s38', t: '司機 · 蔡明憲', sub: 'submitted · rev 1', note: '等待審核人受理' }, { id: 'sub_s39', t: '車輛 · KAB-7720', sub: 'in_review · rev 1', note: '審核人 林專員 審核中' }],
  revision: [{ id: 'sub_r33', t: '車輛 · KAB-6610', sub: 'needs_revision · rev 2', note: '行照模糊，請重新上傳' }],
  approved: [{ id: 'sub_a20', t: '司機 · 高至誠', sub: 'approved → d_9120', note: '已寫入 canonical' }],
  expiring: [{ id: 'ins_8851', t: '保險 · KAB-3308', sub: 'insurance · 2026-07-02 到期', note: '14 天內到期' }, { id: 'reg_8851', t: '登記證 · 黃文豪', sub: 'registration · 2026-07-10 到期', note: '22 天內到期' }],
  notready: [{ id: 'rd_8881', t: '吳鎮宇 · d_8881', sub: 'not_ready', reasons: ['DRIVER_REGISTRATION_EXPIRED', 'TRAINING_REQUIRED'] }],
};

const FX_SUBMISSIONS = [
  { id: 'sub_s39', type: 'vehicle', typeZh: '車輛', status: 'in_review', rev: 1, subject: 'KAB-7720 · Hyundai Custo', submittedAt: '2026-06-18 14:02', note: '審核人受理中', missing: 0 },
  { id: 'sub_s38', type: 'driver', typeZh: '司機', status: 'submitted', rev: 1, subject: '蔡明憲 · 0922-•••-118', submittedAt: '2026-06-18 09:40', note: '—', missing: 0 },
  { id: 'sub_r33', type: 'vehicle', typeZh: '車輛', status: 'needs_revision', rev: 2, subject: 'KAB-6610 · Toyota Sienta', submittedAt: '2026-06-17 16:20', note: '行照模糊，請重新上傳', missing: 1 },
  { id: 'sub_d41', type: 'driver', typeZh: '司機', status: 'draft', rev: 0, subject: '周建良 · 草稿', submittedAt: '—', note: '尚未送審', missing: 2 },
  { id: 'sub_a20', type: 'driver', typeZh: '司機', status: 'approved', rev: 1, subject: '高至誠 → d_9120', submittedAt: '2026-06-15 11:08', note: '已核可', missing: 0 },
  { id: 'sub_x17', type: 'insurance', typeZh: '保險', status: 'rejected', rev: 1, subject: 'KAB-2891 · 保單', submittedAt: '2026-06-12 10:30', note: '保額不足', missing: 0 },
];

const FX_SUPPLY_DOCS = [
  { type: 'professional_driver_license', typeZh: '職業駕駛執照', file: 'license_tsai.pdf', from: '2024-03-01', until: '2028-03-01', status: 'approved' },
  { type: 'taxi_driver_registration', typeZh: '計程車登記證', file: 'taxi_reg_tsai.jpg', from: '2024-05-10', until: '2027-05-10', status: 'pending' },
  { type: 'vehicle_registration', typeZh: '行照', file: 'reg_kab7720.pdf', from: '2024-01-12', until: '2029-01-12', status: 'approved' },
  { type: 'insurance_policy', typeZh: '保險保單', file: 'policy_kab7720.pdf', from: '2026-01-05', until: '2027-01-05', status: 'expired' },
  { type: 'fleet_participation_contract', typeZh: '車隊參與契約', file: 'contract_metro.pdf', from: '2025-06-01', until: '2027-06-01', status: 'approved' },
];
const DOC_STATUS = { approved: { zh: '已核可', tone: 'success' }, pending: { zh: '審核中', tone: 'info' }, rejected: { zh: '已退回', tone: 'danger' }, expired: { zh: '已過期', tone: 'warn' } };

// ════════════════════════════════════════════════════════════════════════════
// 5.1 · Supply Dashboard /supply — 6 groups (VQ-6)
// ════════════════════════════════════════════════════════════════════════════
function FLP_SupplyDashboard({ theme: th }) {
  const G = ({ title, en, tone, items, addable }) => (
    <Card theme={th} title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>{title}<Pill theme={th} tone={tone}>{items.length}</Pill></span>} subtitle={en} padding={0}>
      {items.length === 0
        ? <div style={{ padding: '18px 16px' }}><EmptyState theme={th} reason="no_data" compact messageOverride="目前沒有項目" /></div>
        : <div style={{ display: 'flex', flexDirection: 'column' }}>
            {items.map((it, i) => (
              <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', borderTop: i ? '1px solid ' + th.borderSoft : 'none' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: th.text }}>{it.t}</div>
                  <div style={{ fontSize: 11, color: th.textDim, fontFamily: SHELL_MONO }}>{it.sub}</div>
                  {it.reasons && <div style={{ marginTop: 6, display: 'flex', gap: 5, flexWrap: 'wrap' }}>{it.reasons.map(rc => <span key={rc} style={{ fontSize: 10.5, padding: '2px 7px', borderRadius: 999, background: th.warnBg, color: th.warn, border: '1px solid ' + th.warnBorder }}>{(FLP_REASONS[rc] || {}).zh || rc}</span>)}</div>}
                </div>
                {it.note && !it.reasons && <span style={{ fontSize: 11, color: th.textMuted, textAlign: 'right', maxWidth: 130 }}>{it.note}</span>}
                <Btn theme={th} size="xs" variant="ghost" icon="arrow-right">開啟</Btn>
              </div>
            ))}
          </div>}
    </Card>
  );
  return (
    <FlpShell theme={th} active="supply" breadcrumb={['送件總覽']}>
      <PageHeader theme={th} title="供給送件總覽 · Supply" subtitle="自主建檔 → 送審 → 核可寫入 registry · 僅顯示本車行資料"
        actions={<><Btn theme={th} icon="audit">上傳文件</Btn><Btn theme={th} icon="vehicles">新增車輛</Btn><Btn theme={th} variant="primary" icon="users">新增司機</Btn></>} />
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          <G title="草稿" en="draft" tone="neutral" items={FX_SUPPLY_GROUPS.draft} />
          <G title="待審" en="submitted / in_review" tone="info" items={FX_SUPPLY_GROUPS.review} />
          <G title="附件補正" en="needs_revision" tone="warn" items={FX_SUPPLY_GROUPS.revision} />
          <G title="已核可" en="approved" tone="success" items={FX_SUPPLY_GROUPS.approved} />
          <G title="即將到期" en="insurance / license expiry" tone="warn" items={FX_SUPPLY_GROUPS.expiring} />
          <G title="不可派原因" en="not_ready reason codes" tone="danger" items={FX_SUPPLY_GROUPS.notready} />
        </div>
      </div>
    </FlpShell>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 5.2 · Driver draft — multi-step wizard (VQ-1 basic→docs→confirm)
// ════════════════════════════════════════════════════════════════════════════
function FLP_DriverDraft({ theme: th, step = 0 }) {
  return (
    <FlpShell theme={th} active="supply" breadcrumb={['送件總覽', '新增司機']}>
      <PageHeader theme={th} title="新增司機 · Driver Draft" subtitle="DriverSupplyDraft · 送審後由平台審核寫入 canonical"
        actions={<><Btn theme={th}>儲存草稿</Btn><Btn theme={th} variant="primary" icon="check">送審</Btn></>} />
      <div style={{ padding: 24 }}>
        <div style={{ marginBottom: 20 }}><Stepper theme={th} current={step} steps={['基本資料', '文件附件', '確認送審']} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16, alignItems: 'start' }}>
          <Card theme={th} title="基本資料 · driver fields">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
              <Field theme={th} label="姓名 · name" required><Input theme={th} value="蔡明憲" /></Field>
              <Field theme={th} label="手機 · mobile" required hint="同平台手機重複將提示，非硬擋"><Input theme={th} value="0922-118-446" mono /></Field>
              <Field theme={th} label="職業駕照號 · license no" required><Input theme={th} value="A1-2208-44102" mono /></Field>
              <Field theme={th} label="駕照到期 · license expiry" required><Input theme={th} value="2028-03-01" mono /></Field>
              <Field theme={th} label="計程車登記證號 · taxi reg no" required><Input theme={th} value="TXR-118-2204" mono /></Field>
              <Field theme={th} label="登記區域 · area" required><Input theme={th} value="台北市" /></Field>
              <Field theme={th} label="登記證到期 · reg expiry" required><Input theme={th} value="2027-05-10" mono /></Field>
              <Field theme={th} label="偏好車輛 · preferred vehicle"><Select theme={th} value="KAB-7720 (draft)" /></Field>
            </div>
            <Field theme={th} label="支援服務產品 · supported products" required hint="須為存在且 active 的 product code">
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                <Checkbox theme={th} on label="即時叫車" /><Checkbox theme={th} on label="商務" /><Checkbox theme={th} on label="機場接送" /><Checkbox theme={th} label="保險代步" /><Checkbox theme={th} label="旅行社" />
              </div>
            </Field>
          </Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Card theme={th} title="文件檢核 · documents" subtitle="送審前須齊全">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[['職業駕駛執照', true], ['計程車登記證', true], ['身分證明', false]].map(([t, ok], i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5, color: th.text }}>
                    <MgmtIcon name={ok ? 'check' : 'warn'} size={14} style={{ color: ok ? th.success : th.warn }} />
                    <span style={{ flex: 1 }}>{t}</span>
                    {ok ? <Pill theme={th} tone="success">已附</Pill> : <Btn theme={th} size="xs" variant="secondary" icon="audit">上傳</Btn>}
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 12 }}><Banner theme={th} tone="warn" icon="warn" body="缺『身分證明』· DOCUMENT_REQUIRED，補齊後才能送審。" /></div>
            </Card>
            <Readiness theme={th} state="not_ready" reasons={['DRIVER_REGISTRATION_MISSING']} />
          </div>
        </div>
      </div>
    </FlpShell>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 5.3 · Vehicle draft
// ════════════════════════════════════════════════════════════════════════════
function FLP_VehicleDraft({ theme: th }) {
  return (
    <FlpShell theme={th} active="supply" breadcrumb={['送件總覽', '新增車輛']}>
      <PageHeader theme={th} title="新增車輛 · Vehicle Draft" subtitle="VehicleSupplyDraft · 車牌若已在 canonical 將轉為 update flow"
        actions={<><Btn theme={th}>儲存草稿</Btn><Btn theme={th} variant="primary" icon="check">送審</Btn></>} />
      <div style={{ padding: 24 }}>
        <div style={{ marginBottom: 20 }}><Stepper theme={th} current={0} steps={['基本資料', '文件附件', '確認送審']} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16, alignItems: 'start' }}>
          <Card theme={th} title="車輛資料 · vehicle fields">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
              <Field theme={th} label="車牌 · plate no" required hint="同平台唯一；重複→PLATE_ALREADY_EXISTS"><Input theme={th} value="KAB-7720" mono /></Field>
              <Field theme={th} label="牌照類型 · license type" required><Select theme={th} value="計程車牌照" /></Field>
              <Field theme={th} label="廠牌 · brand"><Input theme={th} value="Hyundai" /></Field>
              <Field theme={th} label="車型 · model"><Input theme={th} value="Custo" /></Field>
              <Field theme={th} label="年份 · model year"><Input theme={th} value="2024" mono /></Field>
              <Field theme={th} label="座位數 · seat count" required><Input theme={th} value="9" mono /></Field>
              <Field theme={th} label="行李容量 · luggage" required><Input theme={th} value="6" mono /></Field>
              <Field theme={th} label="營業區 · business area" required><Select theme={th} value="台北市" /></Field>
              <Field theme={th} label="目前司機 · current driver"><Select theme={th} value="蔡明憲 (draft)" /></Field>
            </div>
            <Field theme={th} label="支援服務產品 · supported products" required>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                <Checkbox theme={th} on label="即時叫車" /><Checkbox theme={th} on label="商務" /><Checkbox theme={th} on label="機場接送" /><Checkbox theme={th} label="保險代步" />
              </div>
            </Field>
            <div style={{ display: 'flex', gap: 24, marginTop: 4 }}>
              <Toggle theme={th} on label="機場接送資格 · airport eligible" />
              <Toggle theme={th} label="固定價可行 · fixed fare allowed" />
            </div>
          </Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Card theme={th} title="文件 · documents" subtitle="行照 / 保險">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[['行照 · registration', true], ['保險保單 · insurance', false]].map(([t, ok], i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5 }}>
                    <MgmtIcon name={ok ? 'check' : 'warn'} size={14} style={{ color: ok ? th.success : th.warn }} />
                    <span style={{ flex: 1 }}>{t}</span>
                    {ok ? <Pill theme={th} tone="success">已附</Pill> : <Btn theme={th} size="xs" variant="secondary" icon="audit">上傳</Btn>}
                  </div>
                ))}
              </div>
            </Card>
            <Readiness theme={th} state="not_ready" reasons={['INSURANCE_MISSING']} />
          </div>
        </div>
      </div>
    </FlpShell>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 5.4 · Documents /documents (VQ-4 · pre-signed upload + expiry + review)
// ════════════════════════════════════════════════════════════════════════════
function FLP_SupplyDocuments({ theme: th }) {
  return (
    <FlpShell theme={th} active="documents" breadcrumb={['文件']}>
      <PageHeader theme={th} title="文件 · Documents" subtitle="pre-signed 上傳 · 到期追蹤 · 審核狀態"
        actions={<Btn theme={th} variant="primary" icon="audit">上傳文件</Btn>} />
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Banner theme={th} tone="info" icon="info" title="pre-signed 上傳流程"
          body="取得簽名 URL → 前端直傳物件儲存 → confirm 回填 objectKey/checksum。API 不直接接大檔。" />
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: '文件類型 · type', w: 200, r: r => <div><div style={{ fontWeight: 600 }}>{r.typeZh}</div><div style={{ fontSize: 10.5, color: th.textDim, fontFamily: SHELL_MONO }}>{r.type}</div></div> },
            { h: '原始檔名 · file', k: 'file', w: 180, mono: true },
            { h: '生效起 · from', k: 'from', w: 120, mono: true },
            { h: '到期 · until', w: 120, mono: true, r: r => <span style={{ color: r.status === 'expired' ? th.warn : th.text }}>{r.until}</span> },
            { h: '審核狀態 · status', w: 120, r: r => <Pill theme={th} tone={DOC_STATUS[r.status].tone} dot>{DOC_STATUS[r.status].zh}</Pill> },
            { h: '', w: 130, r: r => r.status === 'expired'
              ? <Btn theme={th} size="xs" variant="primary" icon="audit">重新上傳</Btn>
              : <div style={{ display: 'flex', gap: 4 }}><Btn theme={th} size="xs" variant="ghost" icon="eye">預覽</Btn><Btn theme={th} size="xs" variant="ghost" icon="trash">刪除</Btn></div> },
          ]} rows={FX_SUPPLY_DOCS} />
        </Card>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Card theme={th} title="保險送件 · insurance_update" subtitle="SA §4.5">
            <DL theme={th} cols={2} items={[
              { k: '關聯車輛', v: 'KAB-7720', mono: true }, { k: 'insuranceType', v: '營業用綜合', mono: true },
              { k: 'insurer', v: '富邦產險', mono: true }, { k: 'policyNo', v: 'POL-•••-7720', mono: true },
              { k: 'effective', v: '2026-07 ~ 2027-07', mono: true }, { k: 'coverage', v: 'NT$ 3,000,000', mono: true },
            ]} />
            <div style={{ marginTop: 10 }}><Btn theme={th} size="xs" variant="secondary" icon="audit">附 policyFile</Btn></div>
          </Card>
          <Card theme={th} title="契約送件 · contract_update" subtitle="SA §4.6">
            <DL theme={th} cols={2} items={[
              { k: 'contractType', v: 'fleet_participation', mono: true }, { k: '關聯', v: 'METRO_FLEET', mono: true },
              { k: 'effective', v: '2025-06 ~ 2027-06', mono: true }, { k: '狀態', v: <Pill theme={th} tone="success">active</Pill> },
            ]} />
            <div style={{ marginTop: 10 }}><Btn theme={th} size="xs" variant="secondary" icon="audit">附 contractFile</Btn></div>
          </Card>
        </div>
      </div>
    </FlpShell>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 5.5 · Submissions list /supply/submissions
// ════════════════════════════════════════════════════════════════════════════
function FLP_Submissions({ theme: th }) {
  return (
    <FlpShell theme={th} active="submissions" breadcrumb={['送件紀錄']}>
      <PageHeader theme={th} title="送件紀錄 · Submissions" subtitle="draft / submitted / in_review / needs_revision / approved / rejected"
        actions={<><Select theme={th} value="狀態：全部" /><Select theme={th} value="類型：全部" /></>} />
      <div style={{ padding: 24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'ID', k: 'id', w: 110, mono: true, r: r => <span style={{ color: th.accent, fontWeight: 600 }}>{r.id}</span> },
            { h: '類型 · type', w: 90, r: r => <Pill theme={th} tone="neutral">{r.typeZh}</Pill> },
            { h: 'subject', k: 'subject', w: 230 },
            { h: 'rev', w: 56, mono: true, align: 'center', r: r => r.rev },
            { h: '狀態 · status', w: 150, r: r => subPill(th, r.status) },
            { h: '送審時間', k: 'submittedAt', w: 150, mono: true },
            { h: 'reviewer note / 缺件', w: 200, r: r => <span style={{ fontSize: 12, color: r.missing ? th.warn : th.textMuted }}>{r.missing ? '缺件 ' + r.missing + ' · ' : ''}{r.note}</span> },
            { h: '', w: 80, r: () => <Btn theme={th} size="xs" variant="ghost" icon="arrow-right">詳情</Btn> },
          ]} rows={FX_SUBMISSIONS} />
        </Card>
      </div>
    </FlpShell>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 5.6 · Submission detail (VQ-2 diff · VQ-5 revision timeline · state machine)
// ════════════════════════════════════════════════════════════════════════════
function FLP_SubmissionDetail({ theme: th, variant = 'needs_revision' }) {
  const isApproved = variant === 'approved';
  const st = isApproved ? 'approved' : 'needs_revision';
  return (
    <FlpShell theme={th} active="submissions" breadcrumb={['送件紀錄', 'sub_r33']}>
      <PageHeader theme={th}
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>sub_r33 · 車輛送件 {subPill(th, st)}</span>}
        subtitle="KAB-6610 · Toyota Sienta · revision 2"
        actions={isApproved
          ? <Banner theme={th} tone="info" icon="info" body="已核可不可編輯，需新建 submission 才能更新。" />
          : <><Btn theme={th} variant="secondary" icon="edit">編輯草稿</Btn><Btn theme={th} variant="primary" icon="check">重新送審 · resubmit</Btn></>} />
      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* VQ-2 side-by-side draft vs canonical */}
          <Card theme={th} title="提交值 vs 已核可值" subtitle="draft vs canonical · 逐欄位對照">
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 0, fontSize: 12.5 }}>
              <div style={{ fontWeight: 700, color: th.textMuted, padding: '8px 10px', borderBottom: '1px solid ' + th.border }}>欄位</div>
              <div style={{ fontWeight: 700, color: th.accent, padding: '8px 10px', borderBottom: '1px solid ' + th.border }}>提交值 · draft</div>
              <div style={{ fontWeight: 700, color: th.textMuted, padding: '8px 10px', borderBottom: '1px solid ' + th.border }}>canonical</div>
              {[['座位數', '9', '7', true], ['行李容量', '6', '6', false], ['機場接送資格', '是', '否', true], ['保險到期', '2027-07-01', '2026-07-02', true]].map((r, i) => (
                <React.Fragment key={i}>
                  <div style={{ padding: '8px 10px', borderBottom: '1px solid ' + th.borderSoft }}>{r[0]}</div>
                  <div style={{ padding: '8px 10px', borderBottom: '1px solid ' + th.borderSoft, fontFamily: SHELL_MONO, background: r[3] ? th.accentBg : 'transparent', fontWeight: r[3] ? 700 : 400 }}>{r[1]}</div>
                  <div style={{ padding: '8px 10px', borderBottom: '1px solid ' + th.borderSoft, fontFamily: SHELL_MONO, color: th.textMuted }}>{r[2]}</div>
                </React.Fragment>
              ))}
            </div>
            <div style={{ marginTop: 10, fontSize: 11, color: th.textMuted }}>變更欄位以強調色標示 · 核可後將更新 canonical 紀錄。</div>
          </Card>
          {!isApproved && (
            <Card theme={th} title="審核人意見 · reviewer note">
              <Banner theme={th} tone="warn" icon="warn" title="needs_revision · DOCUMENT_REJECTED"
                body="行照掃描檔模糊無法辨識車牌，請重新上傳清晰版本後重新送審。— 林專員 06-18 15:10" />
            </Card>
          )}
          {isApproved && (
            <Card theme={th} title="核可結果 · canonical IDs">
              <DL theme={th} cols={2} items={[
                { k: 'canonical vehicle', v: 'veh_9120', mono: true }, { k: 'affiliation', v: 'aff_4471', mono: true },
                { k: 'readiness', v: <Pill theme={th} tone="success" dot>ready</Pill> }, { k: 'auditId', v: 'aud_88210', mono: true },
              ]} />
            </Card>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* VQ-5 revision history timeline */}
          <Card theme={th} title="修訂歷程 · revision history">
            <Timeline theme={th} events={[
              { at: '06-18 15:10', tone: 'warn', t: 'rev 2 · 退回補正', body: '審核人要求重傳行照' },
              { at: '06-18 11:02', tone: 'accent', t: 'rev 2 · 審核中', body: '林專員 start_review' },
              { at: '06-18 09:40', tone: 'info', t: 'rev 2 · 重新送審', body: 'resubmit by 陳家豪' },
              { at: '06-17 16:20', tone: 'warn', t: 'rev 1 · 退回補正', body: '座位數與行照不符' },
              { at: '06-17 14:00', tone: 'neutral', t: 'rev 1 · 建立草稿', body: 'draft created' },
            ]} />
          </Card>
          <Card theme={th} title="文件 · documents">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[['行照', 'rejected'], ['保險保單', 'expired']].map(([t, s], i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5 }}>
                  <MgmtIcon name="audit" size={14} style={{ color: th.textMuted }} />
                  <span style={{ flex: 1 }}>{t}</span>
                  <Pill theme={th} tone={DOC_STATUS[s].tone} dot>{DOC_STATUS[s].zh}</Pill>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </FlpShell>
  );
}

// ── §7 error / edge states reference card ────────────────────────────────────
function FLP_SupplyErrors({ theme: th }) {
  const errs = [
    ['SUBMISSION_NOT_EDITABLE', 'approved/in_review 嘗試編輯', '需新建 submission 才能更新'],
    ['SUBMISSION_REVISION_CONFLICT', 'revision 已被他人更新', '請重新載入後再編輯'],
    ['SUBMISSION_INCOMPLETE', '必填欄位或文件不齊', '補齊後才能送審'],
    ['DOCUMENT_REQUIRED', '缺必要文件', '上傳對應文件類型'],
    ['DOCUMENT_EXPIRED', '文件已過期', '更新到期日並重傳'],
    ['PLATE_ALREADY_EXISTS', '車牌已存在', '改走 update flow'],
    ['DRIVER_IDENTITY_ALREADY_EXISTS', '司機身分重複', '確認是否已建檔'],
    ['FLEET_SCOPE_DENIED', '存取他車行資料', '僅能存取本車行'],
  ];
  return (
    <FlpShell theme={th} active="supply" breadcrumb={['送件總覽', '錯誤狀態']}>
      <PageHeader theme={th} title="送件錯誤 / Edge States" subtitle="SA §9 Supply · 每個錯誤皆有中文訊息與後續指引" />
      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {errs.map(([code, when, fix]) => (
          <Card theme={th} key={code} padding={14}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
              <MgmtIcon name="warn" size={15} style={{ color: th.danger }} />
              <code style={{ fontSize: 12, fontFamily: SHELL_MONO, color: th.danger, fontWeight: 600 }}>{code}</code>
            </div>
            <div style={{ fontSize: 12.5, color: th.text, marginBottom: 4 }}>{when}</div>
            <div style={{ fontSize: 12, color: th.textMuted, display: 'flex', alignItems: 'center', gap: 5 }}><MgmtIcon name="arrow-right" size={12} />{fix}</div>
          </Card>
        ))}
      </div>
    </FlpShell>
  );
}

Object.assign(window, {
  FLP_REASONS, FLP_SUB_STATUS, Readiness, subPill,
  FLP_SupplyDashboard, FLP_DriverDraft, FLP_VehicleDraft, FLP_SupplyDocuments,
  FLP_Submissions, FLP_SubmissionDetail, FLP_SupplyErrors,
});
