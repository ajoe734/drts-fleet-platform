// platform-regulator.jsx — Phase 2 V2 (S2 ruling) · Regulator / Local Authority Viewer DELTA.
// Built in the Platform Admin GOVERNANCE SHELL (PA_NAV / platform realm) — NOT a standalone portal.
// Extends the existing CMP_Regulator panel with the requested component slots:
//   experiment/case selector · evidence manifest summary · investigation bundle status ·
//   regulatory notification status · controlled export button · legal hold / masking indicator ·
//   access log table · export receipt panel.
// Scoped read-only · PII masked. zh-TW · en secondary.

const PRG_ACTOR = { name: 'GV', display: '主管機關 · 交通局', role: 'regulator_viewer' };

// masking indicator chip — makes the "this field is masked for regulator scope" rule explicit
function PrgMask({ theme: th, label }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontFamily: SHELL_MONO, color: th.warn, background: th.warnBg, border: '1px solid ' + th.warnBorder, padding: '2px 7px', borderRadius: 999 }}>
      <MgmtIcon name="lock" size={10} />{label || 'masked'}
    </span>
  );
}

function PRG_RegulatorViewer({ theme: th }) {
  return (
    <Shell theme={th} nav={PA_NAV} active="supply-review"
      breadcrumb={['合作夥伴治理', '主管機關檢視']} env="regulator" tenant="FSD_SANDBOX" actor={PRG_ACTOR} health={PA_HEALTH}
      refreshTier="manual" dataFreshness="fresh">
      <PageHeader theme={th} title="主管機關檢視 · Regulator Viewer" subtitle="受控唯讀 delta · 沿用 governance shell · scoped access · PII 遮罩"
        meta={<><Pill theme={th} tone="neutral" dot>read-only</Pill><Pill theme={th} tone="warn">PII 遮罩</Pill><Pill theme={th} tone="platform">交通局 scope</Pill></>}
        actions={<>
          {/* controlled export button slot */}
          <Btn theme={th} icon="audit">存取紀錄</Btn>
          <Btn theme={th} variant="primary" icon="download">受控匯出證據包</Btn>
        </>} />

      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* ── experiment / case selector slot ── */}
        <Card theme={th} title="實驗 / 案件選擇" subtitle="experiment / case selector" padding={16}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <Select theme={th} value="實驗：exp_fsd_taipei_01" />
            <Select theme={th} value="案件：acc_0214" />
            <Select theme={th} value="期間：2026-W25" />
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 11.5, color: th.textMuted, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <MgmtIcon name="info" size={12} />僅顯示貴轄區核准範圍內的去識別資訊
            </span>
          </div>
          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
            <Kpi theme={th} label="核准車輛" en="approved_vehicles" value="5" sub="enrolled" />
            <Kpi theme={th} label="進行中行程" en="active_trips" value="3" sub="去識別" />
            <Kpi theme={th} label="本期接管" en="takeovers" value="41" sub="W25" />
            <Kpi theme={th} label="事故" en="incidents" value="1" sub="L2" tone="warn" />
          </div>
        </Card>

        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* ── evidence manifest summary slot ── */}
            <Card theme={th} title="證據清單摘要 · Evidence Manifest" subtitle="acc_0214 · 雜湊鏈 · 來源標記（不含原始檔內容）" padding={0}>
              <Table theme={th} columns={[
                { h: '#', w: 36, mono: true, align: 'center', r: (r, i) => i + 1 },
                { h: '類型', k: 'type', w: 150 },
                { h: '來源', w: 130, r: r => <Pill theme={th} tone={r.srcTone}>{r.src}</Pill> },
                { h: 'SHA-256', k: 'hash', w: 100, mono: true },
                { h: '狀態', w: 100, r: r => <Pill theme={th} tone={r.state === 'sealed' ? 'success' : r.state === 'missing' ? 'warn' : 'info'} dot>{r.state}</Pill> },
                { h: '內容', w: 90, r: () => <PrgMask theme={th} label="需申請" /> },
              ]} rows={[
                { type: '前鏡頭影像', src: '車載錄製', srcTone: 'neutral', hash: '9f2a…7c41', state: 'sealed' },
                { type: '車內影像', src: '車載錄製', srcTone: 'neutral', hash: '3b81…22aa', state: 'sealed' },
                { type: '安全員報告', src: '安全員回報', srcTone: 'accent', hash: '7c0d…91ef', state: 'sealed' },
                { type: '原廠事件記錄', src: '原廠未提供', srcTone: 'warn', hash: '—', state: 'missing' },
              ]} />
              <div style={{ padding: '10px 16px', borderTop: '1px solid ' + th.border }}>
                <span style={{ fontSize: 11.5, color: th.textMuted }}>4 項 · 3 已封存 · 1 原廠缺口（明示，不臆補）· 檔案內容須經受控匯出核發</span>
              </div>
            </Card>

            {/* ── access log table slot ── */}
            <Card theme={th} title="存取紀錄 · Access Log" subtitle="append-only · 主管機關每次調閱皆記錄" padding={0}>
              <Table theme={th} columns={[
                { h: '時間', k: 'at', w: 150, mono: true },
                { h: '操作者', w: 150, r: r => r.actor },
                { h: '動作', k: 'action', w: 160, mono: true },
                { h: '對象', k: 'subject', w: 150 },
                { h: '結果', w: 90, r: r => <Pill theme={th} tone={r.ok ? 'success' : 'warn'} dot>{r.ok ? 'ok' : 'denied'}</Pill> },
              ]} rows={[
                { at: '2026-06-26 09:14', actor: '交通局 · 葉審查員', action: 'view_experiment', subject: 'exp_fsd_taipei_01', ok: true },
                { at: '2026-06-26 09:16', actor: '交通局 · 葉審查員', action: 'view_manifest', subject: 'acc_0214', ok: true },
                { at: '2026-06-26 09:18', actor: '交通局 · 葉審查員', action: 'request_bundle', subject: 'acc_0214', ok: true },
                { at: '2026-06-26 09:20', actor: '交通局 · 葉審查員', action: 'view_evidence_raw', subject: 'front_cam', ok: false },
              ]} />
            </Card>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* ── investigation bundle status slot ── */}
            <Card theme={th} title="調查包狀態 · Bundle Status">
              <DL theme={th} cols={1} items={[
                { k: '案件', v: 'acc_0214', mono: true },
                { k: '調查包', v: 'bundle_0214_v2', mono: true },
                { k: '狀態', v: <Pill theme={th} tone="info" dot>preparing</Pill> },
                { k: '完整度', v: '3 / 4 件（1 原廠缺口）', mono: false },
              ]} />
              <div style={{ marginTop: 8, height: 6, borderRadius: 3, background: th.surfaceLo, overflow: 'hidden' }}><div style={{ width: '75%', height: '100%', background: th.accent }} /></div>
            </Card>

            {/* ── regulatory notification status slot ── */}
            <Card theme={th} title="監理通報狀態 · Notification">
              <Timeline theme={th} events={[
                { at: '06-25 15:10', tone: 'success', t: '初報已送出', body: '≤ 1 小時 (policy) · 交通局' },
                { at: '06-25 15:42', tone: 'success', t: '主管機關已簽收', body: 'acknowledged' },
                { tone: 'warn', t: '結報待提交', body: '≤ 10 日 (policy) · 倒數 9 日', current: true },
              ]} />
            </Card>

            {/* ── legal hold / masking indicator slot ── */}
            <Card theme={th} title="法律保留 / 遮罩" subtitle="legal hold · masking">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 11px', borderRadius: 9, background: th.warnBg, border: '1px solid ' + th.warnBorder }}>
                  <MgmtIcon name="lock" size={14} style={{ color: th.warn }} />
                  <span style={{ flex: 1, fontSize: 12.5, color: th.text }}>法律保留中 · hold_0214</span>
                  <Pill theme={th} tone="warn" dot>active</Pill>
                </div>
                <div style={{ fontSize: 11.5, color: th.textMuted, lineHeight: 1.5 }}>保留期間證據凍結刪除；對主管機關之揭露仍套用 PII 遮罩。</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
                  <PrgMask theme={th} label="乘客個資" /><PrgMask theme={th} label="人員姓名" /><PrgMask theme={th} label="商業費率" />
                </div>
              </div>
            </Card>

            {/* ── export receipt panel slot ── */}
            <Card theme={th} title="匯出收據 · Export Receipt" style={{ borderTop: '2px solid ' + th.accent }}>
              <DL theme={th} cols={1} items={[
                { k: '匯出編號', v: 'exp_rcpt_0091', mono: true },
                { k: '收件單位', v: '台北市交通局', mono: false },
                { k: '範圍', v: '3 件證據 + 監理報告', mono: false },
                { k: '雜湊', v: 'bundle 8f1c…40ab', mono: true },
                { k: '浮水印', v: '交通局 + 2026-06-26', mono: false },
                { k: '覆核', v: <Pill theme={th} tone="success" dot>雙人已覆核</Pill> },
              ]} />
              <div style={{ marginTop: 10 }}>
                <Banner theme={th} tone="neutral" icon="lock" body="匯出收據與雜湊清單寫入 append-only audit；證據包經受控匯出流程雙人覆核後核發。" />
              </div>
            </Card>
          </div>
        </div>
      </div>
    </Shell>
  );
}

Object.assign(window, { PRG_ACTOR, PrgMask, PRG_RegulatorViewer });
