// platform-supply-review.jsx — Packet 2 · Platform Admin 供給審核. EXTENDS Platform Admin (platform realm).
// Reviewer receives fleet supply submission → side-by-side diff → approve(provision canonical) / request_revision / reject.
// Reuses PA_NAV/PA_ACTOR + mgmt primitives. Optimistic concurrency (expectedRevisionNo). zh-TW.

const PSR_REVIEWER = { name: 'LP', display: '林佩璇', role: 'platform_supply_reviewer' };

const PSR_SUB_STATUS = {
  submitted:      { zh: '待受理', en: 'submitted', tone: 'info' },
  in_review:      { zh: '審核中', en: 'in_review', tone: 'accent' },
  needs_revision: { zh: '已退補正', en: 'needs_revision', tone: 'warn' },
  approved:       { zh: '已核可', en: 'approved', tone: 'success' },
  rejected:       { zh: '已駁回', en: 'rejected', tone: 'danger' },
  withdrawn:      { zh: '已撤回', en: 'withdrawn', tone: 'neutral' },
};
function psrPill(th, s) { const m = PSR_SUB_STATUS[s] || PSR_SUB_STATUS.submitted; return <Pill theme={th} tone={m.tone} dot>{m.zh}<span style={{ marginLeft: 4, opacity: .6, fontFamily: SHELL_MONO, fontSize: 9.5 }}>{m.en}</span></Pill>; }

const FX_PSR_QUEUE = [
  { id: 'sub_s39', type: '車輛', fleet: '大都會車隊', subject: 'KAB-7720 · Hyundai Custo', rev: 1, status: 'in_review', at: '06-18 14:02', missing: 0, lockedBy: '林佩璇', area: '台北市', svc: 'airport' },
  { id: 'sub_s38', type: '司機', fleet: '大都會車隊', subject: '蔡明憲', rev: 1, status: 'submitted', at: '06-18 09:40', missing: 0, lockedBy: null, area: '台北市', svc: 'realtime' },
  { id: 'sub_t02', type: '司機', fleet: '蘭陽小客車', subject: '游志豪', rev: 1, status: 'submitted', at: '06-18 08:15', missing: 1, lockedBy: null, area: '宜蘭縣', svc: 'realtime' },
  { id: 'sub_r33', type: '車輛', fleet: '大都會車隊', subject: 'KAB-6610 · Toyota Sienta', rev: 2, status: 'submitted', at: '06-18 09:42', missing: 0, lockedBy: null, area: '台北市', svc: 'business' },
  { id: 'sub_u51', type: '保險', fleet: '海線車隊', subject: 'TXG-1180 · 保單', rev: 1, status: 'in_review', at: '06-17 16:50', missing: 0, lockedBy: '張哲瑋', area: '台中市', svc: 'insurance' },
  { id: 'sub_a20', type: '司機', fleet: '大都會車隊', subject: '高至誠 → d_9120', rev: 1, status: 'approved', at: '06-15 11:08', missing: 0, lockedBy: null, area: '台北市', svc: 'realtime' },
];

// ── 5.1 · Supply Review Queue /supply-review ─────────────────────────────────
function PA_SupplyReviewQueue({ theme: th }) {
  return (
    <Shell theme={th} nav={PA_NAV} active="supply-review"
      breadcrumb={['合作夥伴治理', '供給審核']} env="production" actor={PSR_REVIEWER} health={PA_HEALTH}
      refreshTier="medium" dataFreshness="fresh">
      <PageHeader theme={th} title="供給審核佇列 · Supply Review" subtitle="車行送件 → 審核 → 核可寫入 canonical registry"
        tabs={[{ id: 'pending', label: '待審', badge: '4', tone: 'accent' }, { id: 'mine', label: '我審核中', badge: '1' }, { id: 'history', label: '歷史' }]}
        activeTab="pending"
        meta={<><Select theme={th} value="車行：全部" /><Select theme={th} value="類型：全部" /><Select theme={th} value="服務產品：全部" /><Select theme={th} value="營業區：全部" /></>}
        actions={<Btn theme={th} icon="filter">更多篩選</Btn>} />
      <div style={{ padding: 24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'ID', k: 'id', w: 100, mono: true, r: r => <span style={{ color: th.accent, fontWeight: 600 }}>{r.id}</span> },
            { h: '類型', w: 72, r: r => <Pill theme={th} tone="neutral">{r.type}</Pill> },
            { h: '車行 · fleet', k: 'fleet', w: 130 },
            { h: 'subject', k: 'subject', w: 210 },
            { h: '營業區', k: 'area', w: 84 },
            { h: 'rev', w: 48, align: 'center', mono: true, r: r => r.rev },
            { h: '狀態', w: 140, r: r => psrPill(th, r.status) },
            { h: '送審', k: 'at', w: 100, mono: true },
            { h: '缺件 / 鎖定', w: 150, r: r => (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {r.missing > 0 && <Pill theme={th} tone="warn">缺 {r.missing}</Pill>}
                {r.lockedBy && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: th.textMuted }}><MgmtIcon name="lock" size={11} />{r.lockedBy}</span>}
                {r.missing === 0 && !r.lockedBy && <span style={{ fontSize: 11, color: th.textDim }}>—</span>}
              </div>
            )},
            { h: '', w: 110, r: r => r.status === 'submitted'
              ? <Btn theme={th} size="xs" variant="primary">受理審核</Btn>
              : <Btn theme={th} size="xs" variant="ghost" icon="arrow-right">開啟</Btn> },
          ]} rows={FX_PSR_QUEUE} />
        </Card>
      </div>
    </Shell>
  );
}

// ── 5.2 · Review Detail /supply-review/[id] ──────────────────────────────────
function PA_SupplyReviewDetail({ theme: th, mode = 'review' }) {
  // mode: 'review' (in_review, actions live) | 'approve_confirm' (confirm modal) | 'conflict' (revision conflict)
  const diff = [
    ['座位數 · seat count', '9', '7', true],
    ['行李容量 · luggage', '6', '6', false],
    ['機場接送資格 · airport eligible', '是 true', '否 false', true],
    ['支援產品 · products', 'realtime, business, airport', 'realtime, business', true],
    ['保險到期 · insurance until', '2027-07-01', '2026-07-02', true],
  ];
  const onlyDiff = false;
  return (
    <Shell theme={th} nav={PA_NAV} active="supply-review"
      breadcrumb={['供給審核', 'sub_s39']} env="production" actor={PSR_REVIEWER} health={PA_HEALTH}
      refreshTier="medium" dataFreshness="fresh">
      <PageHeader theme={th}
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>sub_s39 · 車輛審核 {psrPill(th, 'in_review')}</span>}
        subtitle="大都會車隊 · KAB-7720 · Hyundai Custo · revision 1 · expectedRevisionNo=1"
        actions={<>
          <Btn theme={th} variant="secondary" icon="edit">退回補正</Btn>
          <Btn theme={th} variant="secondary" danger icon="x">駁回</Btn>
          <Btn theme={th} variant="primary" icon="check">核可 · provision</Btn>
        </>} />

      {mode === 'conflict' && (
        <div style={{ padding: '16px 24px 0' }}>
          <Banner theme={th} tone="danger" icon="warn" title="SUBMISSION_REVISION_CONFLICT · 409"
            body="此 submission 已被更新（revision 1 → 2）。請重新載入後再審，系統不允許盲蓋。"
            actions={<Btn theme={th} variant="primary" icon="refresh">重新載入</Btn>} />
        </div>
      )}

      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* VQ-1 side-by-side diff */}
          <Card theme={th} title="逐欄位對照 · submission vs canonical" subtitle="VQ-1 · 變更欄位以強調色標示"
            actions={<div style={{ display: 'flex', gap: 6 }}><Pill theme={th} tone={onlyDiff ? 'neutral' : 'accent'}>看全部</Pill><Pill theme={th} tone={onlyDiff ? 'accent' : 'neutral'}>只看差異</Pill></div>}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr', fontSize: 12.5 }}>
              <div style={{ fontWeight: 700, color: th.textMuted, padding: '8px 10px', borderBottom: '1px solid ' + th.border }}>欄位</div>
              <div style={{ fontWeight: 700, color: th.accent, padding: '8px 10px', borderBottom: '1px solid ' + th.border }}>提交值 · submission</div>
              <div style={{ fontWeight: 700, color: th.textMuted, padding: '8px 10px', borderBottom: '1px solid ' + th.border }}>目前 · canonical</div>
              {diff.map((r, i) => (
                <React.Fragment key={i}>
                  <div style={{ padding: '9px 10px', borderBottom: '1px solid ' + th.borderSoft, display: 'flex', alignItems: 'center', gap: 6 }}>{r[3] && <span style={{ width: 6, height: 6, borderRadius: 3, background: th.accent }} />}{r[0]}</div>
                  <div style={{ padding: '9px 10px', borderBottom: '1px solid ' + th.borderSoft, fontFamily: SHELL_MONO, background: r[3] ? th.accentBg : 'transparent', fontWeight: r[3] ? 700 : 400 }}>{r[1]}</div>
                  <div style={{ padding: '9px 10px', borderBottom: '1px solid ' + th.borderSoft, fontFamily: SHELL_MONO, color: th.textMuted }}>{r[2]}</div>
                </React.Fragment>
              ))}
            </div>
          </Card>

          {/* document review */}
          <Card theme={th} title="文件檢視 · documents" subtitle="VQ-2 · 類型 / 檔名 / 生效 / 審核狀態">
            <Table theme={th} columns={[
              { h: '類型', w: 150, r: r => r.zh },
              { h: '檔名', k: 'file', w: 170, mono: true },
              { h: '生效起迄', w: 170, mono: true, r: r => r.from + ' ~ ' + r.until },
              { h: '狀態', w: 100, r: r => <Pill theme={th} tone={r.tone} dot>{r.s}</Pill> },
              { h: '', w: 80, r: () => <Btn theme={th} size="xs" variant="ghost" icon="eye">預覽</Btn> },
            ]} rows={[
              { zh: '行照 · registration', file: 'reg_kab7720.pdf', from: '2024-01', until: '2029-01', s: '已核可', tone: 'success' },
              { zh: '保險保單 · insurance', file: 'policy_kab7720.pdf', from: '2026-07', until: '2027-07', s: '待審', tone: 'info' },
            ]} />
          </Card>

          {/* validation warnings */}
          <Card theme={th} title="完整性檢核 · validation">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Banner theme={th} tone="success" icon="check" body="必填欄位齊全 · 文件類型完整 · 無重複車牌。" />
              <Banner theme={th} tone="info" icon="info" body="保險保單為新附件，核可後將同步更新 canonical 保險到期日。" />
            </div>
          </Card>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* reviewer note + reason code (VQ-3) */}
          <Card theme={th} title="審核意見 · reviewer note" subtitle="VQ-3 · 退補/駁回需填 reason code">
            <Field theme={th} label="reason code（退補 / 駁回必填）">
              <Select theme={th} value="— 核可免填 —" />
            </Field>
            <Field theme={th} label="comment">
              <div style={{ border: '1px solid ' + th.border, borderRadius: 8, padding: '10px 12px', minHeight: 64, fontSize: 12.5, color: th.textDim }}>輸入給車行的審核說明…</div>
            </Field>
          </Card>

          {/* VQ-4 · approve confirm — what canonical records will be written */}
          <Card theme={th} title="核可將寫入 · canonical preview" subtitle="VQ-4 · approve 會改動 registry（不可逆）" style={{ borderTop: '2px solid ' + th.accent }}>
            <DL theme={th} cols={1} items={[
              { k: '建立 / 更新 vehicle', v: 'veh_9120 (update)', mono: true },
              { k: 'affiliation', v: 'METRO_FLEET ↔ veh_9120', mono: true },
              { k: '重算 readiness', v: <Pill theme={th} tone="success" dot>ready</Pill> },
              { k: '通知', v: '車行 + 司機', mono: false },
            ]} />
            <div style={{ marginTop: 10 }}>
              <Banner theme={th} tone="warn" icon="warn" body="核可為單一交易：provision canonical + affiliation + readiness + audit。完整性未過則 SUBMISSION_INCOMPLETE，不可核可。" />
            </div>
          </Card>

          {/* self-approval guardrail */}
          <Card theme={th} title="把關 · guardrail">
            <Banner theme={th} tone="neutral" icon="lock" body="審核人不得核可自己以車行身分提交的資料（REVIEWER_SELF_APPROVAL_DENIED），不得繞過必填文件。" />
          </Card>
        </div>
      </div>

      {mode === 'approve_confirm' && (
        <ConfirmModal theme={th} risk="high" title="確認核可並寫入 canonical？"
          body="此動作將在單一交易內建立/更新 canonical vehicle veh_9120、建立 affiliation、重算 readiness 並寫入 audit。動作具不可逆語意。"
          confirmLabel="確認核可 · provision" reason reasonField={false} />
      )}
    </Shell>
  );
}

Object.assign(window, {
  PSR_REVIEWER, PSR_SUB_STATUS, psrPill, FX_PSR_QUEUE,
  PA_SupplyReviewQueue, PA_SupplyReviewDetail,
});
