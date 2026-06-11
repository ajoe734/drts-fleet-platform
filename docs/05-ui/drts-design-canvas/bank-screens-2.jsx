// bank-screens-2.jsx — Bank Console (2/3): 合約與 SLA (list+detail) · 對帳單 (list+逐趟detail)
// Read-only for bank. DRTS holds contract authority (via Ops /contracts). Masked refs.

function BkSlaTargetCard({ theme: th, c }) {
  const rows = [
    { label: '準點率', en: 'on_time_rate', value: c.onTime, target: c.onTimeTgt, unit: '%' },
    { label: '完成率', en: 'completion_rate', value: c.complete, target: c.completeTgt, unit: '%' },
    { label: '回應時間', en: 'response_time', value: c.resp, target: c.respTgt, unit: 's', invert: true },
  ];
  return (
    <Card theme={th} title="SLA 目標 vs 當期達成" subtitle="值 · 差距 · 達標狀態">
      {rows.map((r, i) => <BkSlaRow key={i} theme={th} {...r} />)}
    </Card>
  );
}

// ── 4a. /contracts — 合約列表 ─────────────────────────────────────────────────
function BK_Contracts({ theme: th }) {
  return (
    <Shell theme={th} nav={BK_NAV} active="contracts"
      breadcrumb={['合約與 SLA']} env="production" tenant="CTBC" actor={BK_ACTORS.admin} health={BK_HEALTH}
      refreshTier="medium_slow" dataFreshness="fresh">
      <PageHeader theme={th} title="合約與 SLA"
        subtitle="發卡行方案合約 · 唯讀（DRTS 經 Ops /contracts 持有權威）"
        meta={<Pill theme={th} tone="info" dot>GET /api/tenant/contracts</Pill>}
        actions={<Btn theme={th} icon="export">匯出</Btn>} />

      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Banner theme={th} tone="info" icon="info"
          title="合約對銀行唯讀 · read-only"
          body="合約條款與 SLA 目標由 DRTS 維護。此處呈現當期達成摘要與例外；如需異動請循合約窗口。" />
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: '合約號', k: 'no', w: 160, mono: true, r: r => <span style={{ color: th.accent, fontWeight: 600 }}>{r.no}</span> },
            { h: '方案', k: 'program', w: 200 },
            { h: '期間', k: 'period', w: 220, mono: true },
            { h: '準點率', w: 110, r: r => <span style={{ fontFamily: SHELL_MONO, color: r.onTime >= r.onTimeTgt ? th.text : th.danger }}>{r.onTime}% <span style={{ color: th.textDim, fontSize: 10.5 }}>/{r.onTimeTgt}</span></span> },
            { h: '完成率', w: 110, r: r => <span style={{ fontFamily: SHELL_MONO, color: r.complete >= r.completeTgt ? th.text : th.danger }}>{r.complete}% <span style={{ color: th.textDim, fontSize: 10.5 }}>/{r.completeTgt}</span></span> },
            { h: '例外', w: 70, align: 'center', r: r => <Pill theme={th} tone={r.exceptions > 2 ? 'warn' : 'neutral'}>{r.exceptions}</Pill> },
            { h: '狀態', w: 96, r: r => <Pill theme={th} tone={bkContractTone(r.status)} dot>{r.status}</Pill> },
          ]} rows={FX_BK_CONTRACTS} />
        </Card>
      </div>
    </Shell>
  );
}

// ── 4b. /contracts/[id] — 合約詳情 ────────────────────────────────────────────
function BK_ContractDetail({ theme: th }) {
  const c = FX_BK_CONTRACTS[1]; // 警示 — 有 SLA 未達
  return (
    <Shell theme={th} nav={BK_NAV} active="contracts"
      breadcrumb={['合約與 SLA', c.no]} env="production" tenant="CTBC" actor={BK_ACTORS.admin} health={BK_HEALTH}
      refreshTier="medium_slow" dataFreshness="fresh">
      <PageHeader theme={th}
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>{c.no}<Pill theme={th} tone={bkContractTone(c.status)} dot>{c.status}</Pill></span>}
        subtitle={c.program + ' · ' + c.period}
        actions={<Btn theme={th} icon="download">下載合約 PDF</Btn>} />

      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card theme={th} title="合約期間與狀態">
            <DL theme={th} cols={1} items={[
              { k: '合約號 CONTRACT', v: c.no, mono: true },
              { k: '方案 PROGRAM', v: c.program },
              { k: '期間 PERIOD', v: c.period, mono: true },
              { k: '狀態 STATUS', v: <Pill theme={th} tone={bkContractTone(c.status)} dot>{c.status}</Pill> },
              { k: '權威 AUTHORITY', v: 'DRTS · Ops /contracts' },
            ]} />
          </Card>
          <BkSlaTargetCard theme={th} c={c} />
        </div>
        <Card theme={th} title="例外清單" subtitle="SLA 未達 / 爭議趟次 · 各連到訂單詳情"
          actions={<Pill theme={th} tone="warn">{c.exceptions} 筆</Pill>} padding={0}>
          <Table theme={th} columns={[
            { h: '類型', w: 120, r: r => <Pill theme={th} tone={r.tone}>{r.type}</Pill> },
            { h: '說明', r: r => <span style={{ fontSize: 12 }}>{r.desc}</span> },
            { h: '指標', w: 110, mono: true, r: r => <span style={{ color: th.danger }}>{r.metric}</span> },
            { h: '連結', w: 110, r: r => <Btn theme={th} size="xs" variant="ghost" icon="arrow">{r.entity}</Btn> },
          ]} rows={[
            { tone: 'warn',   type: 'SLA 未達', desc: '5 月準點率低於合約目標', metric: '94.2% / 95%', entity: '本合約' },
            { tone: 'danger', type: '爭議趟次', desc: '七人座差額爭議，卡友申訴中', metric: 'BK-2K7AA0', entity: 'BK-2K7AA0' },
            { tone: 'warn',   type: 'SLA 未達', desc: '單日回應時間尖峰超標', metric: '72s / 60s', entity: 'BK-2K7DZ8' },
            { tone: 'neutral',type: '觀察', desc: '凌晨時段供給偏緊，建議擴隊', metric: '04:00–05:00', entity: 'CTB-AIR-WE' },
          ]} />
        </Card>
      </div>
    </Shell>
  );
}

// ── 5a. /statements — 對帳單列表（期別）──────────────────────────────────────
function BK_Statements({ theme: th }) {
  return (
    <Shell theme={th} nav={BK_NAV} active="statements"
      breadcrumb={['對帳單']} env="production" tenant="CTBC" actor={BK_ACTORS.finance} health={BK_HEALTH}
      refreshTier="medium_slow" dataFreshness="fresh">
      <PageHeader theme={th} title="對帳單"
        subtitle="逐趟對帳 · 金流方向＝發卡行付 DRTS · 有別於企業發票"
        meta={<Pill theme={th} tone="info" dot>GET /api/tenant/settlement-statements</Pill>}
        actions={<Btn theme={th} icon="export">匯出</Btn>} />

      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <Kpi theme={th} label="當期應付" en="current_due" value="NT$ 1.28M" delta="2026-05 · due 06-15" deltaTone="warn" />
          <Kpi theme={th} label="今年累計" en="ytd_paid" value="NT$ 5.55M" sub="4 期 · 已付 3 · 待付 1" />
          <Kpi theme={th} label="爭議趟次" en="disputed" value="1" delta="報 DRTS 處理中" deltaTone="warn" />
        </div>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: '期別', k: 'period', w: 100, mono: true, r: r => <span style={{ color: th.accent, fontWeight: 600 }}>{r.period}</span> },
            { h: '趟次', k: 'trips', w: 80, mono: true, align: 'right' },
            { h: '總額', k: 'total', w: 150, mono: true, align: 'right' },
            { h: '開立日', k: 'issued', w: 120, mono: true },
            { h: '到期日', k: 'due', w: 120, mono: true },
            { h: '簽名檔', w: 130, r: r => <span style={{ fontSize: 11.5, color: r.sig.includes('過期') ? th.warn : th.textMuted, display: 'inline-flex', alignItems: 'center', gap: 5 }}><MgmtIcon name={r.sig.includes('過期') ? 'warn' : 'lock'} size={12} />{r.sig}</span> },
            { h: '狀態', w: 96, r: r => <Pill theme={th} tone={bkStmtTone(r.status)} dot>{r.status}</Pill> },
            { h: '', w: 130, align: 'right', r: r => (
              <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                <Btn theme={th} size="xs" variant="ghost" icon="download">簽名檔</Btn>
                <Btn theme={th} size="xs" variant="ghost" icon="arrow">明細</Btn>
              </div>
            )},
          ]} rows={FX_BK_STATEMENTS} />
        </Card>
      </div>
    </Shell>
  );
}

// ── 5b. /statements/[period] — 逐趟明細 ──────────────────────────────────────
function BK_StatementDetail({ theme: th }) {
  const s = FX_BK_STATEMENTS[0]; // 2026-05 due
  return (
    <Shell theme={th} nav={BK_NAV} active="statements"
      breadcrumb={['對帳單', s.period]} env="production" tenant="CTBC" actor={BK_ACTORS.finance} health={BK_HEALTH}
      refreshTier="medium_slow" dataFreshness="fresh">
      <PageHeader theme={th}
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>對帳單 {s.period}<Pill theme={th} tone={bkStmtTone(s.status)} dot>{s.status}</Pill></span>}
        subtitle={`${s.trips} 趟 · 開立 ${s.issued} · 到期 ${s.due} · 金流：發卡行付 DRTS`}
        actions={<>
          <Btn theme={th} icon="download">下載簽名檔</Btn>
          <Btn theme={th} variant="primary" icon="download">匯出逐趟 CSV</Btn>
        </>} />

      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <Kpi theme={th} label="期別總額" en="period_total" value="NT$ 1.28M" sub="812 趟" />
          <Kpi theme={th} label="補助合計" en="subsidy" value="NT$ 1.21M" sub="權益扣抵" />
          <Kpi theme={th} label="自付合計" en="out_of_pocket" value="NT$ 78.6K" sub="升等 / 加成差額" />
          <Kpi theme={th} label="爭議" en="disputed" value="1" delta="報 DRTS" deltaTone="warn" />
        </div>
        <Card theme={th} title="逐趟明細 · trip lines" subtitle="車資 · 補助 vs 自付拆分 · 參照一律遮罩"
          actions={<Btn theme={th} size="xs" icon="filter">篩選</Btn>} padding={0}>
          <Table theme={th} columns={[
            { h: '趟次 ID', k: 'trip', w: 110, mono: true, r: r => <span style={{ color: th.accent, fontWeight: 600 }}>{r.trip}</span> },
            { h: '日期', k: 'date', w: 70, mono: true },
            { h: '車資', k: 'fare', w: 100, mono: true, align: 'right' },
            { h: '補助', k: 'subsidy', w: 100, mono: true, align: 'right', r: r => <span style={{ color: BK_GOLD }}>{r.subsidy}</span> },
            { h: '自付', k: 'oop', w: 90, mono: true, align: 'right', r: r => <span style={{ color: r.oop === 'NT$ 0' ? th.textDim : th.text }}>{r.oop}</span> },
            { h: '權益參照', k: 'benefitRef', w: 110, mono: true, r: r => <span style={{ color: th.textMuted }}>{r.benefitRef}</span> },
            { h: '卡友', k: 'cardholderRef', w: 84, mono: true, r: r => <span style={{ color: th.textMuted }}>{r.cardholderRef}</span> },
            { h: '備註', k: 'note', r: r => <span style={{ fontSize: 11.5, color: r.note.includes('爭議') ? th.danger : th.textMuted }}>{r.note}</span> },
          ]} rows={FX_BK_STMT_LINES} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 24, padding: '12px 16px', borderTop: '1px solid ' + th.border, background: th.surfaceLo }}>
            <span style={{ fontSize: 12, color: th.textMuted }}>期別總計</span>
            <span style={{ fontFamily: SHELL_MONO, fontSize: 14, fontWeight: 700, color: th.text }}>NT$ 1,284,600</span>
          </div>
        </Card>
        <Banner theme={th} tone="neutral" icon="lock"
          body="本對帳單為逐趟核對之依據（非企業發票）。單筆爭議請點趟次「報 DRTS」；簽名檔過期時系統會標記重出。" />
      </div>
    </Shell>
  );
}

Object.assign(window, {
  BkSlaTargetCard, BK_Contracts, BK_ContractDetail, BK_Statements, BK_StatementDetail,
});
