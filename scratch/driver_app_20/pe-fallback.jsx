// pe-fallback.jsx — Phase 2 V1 · passenger AV→human fallback state screens (4 states).
// Serves passenger-embed (pe) + the pattern for passenger-web. Reuses ent-kit + PeShell idiom.
//
// HARD RULES (per V1 / decisions C3·C4):
//  · ALL passenger copy is rendered from backend `passengerMessageCode` — canvas shows a
//    MESSAGE SLOT, never hardcoded marketing text. Slots are visibly marked.
//  · Passenger NEVER sees: Tesla reason code, FSD transition, operational hold, incident
//    classification, evidence freeze / legal hold, safety-operator / ROC personnel names.
//  · No second booking, no surcharge prompt (fallbackSurchargeApplied=false).

// message-slot component — makes the "text comes from messageCode" rule explicit in the canvas
function MsgSlot({ t, code, sample, lines = 2 }) {
  return (
    <div style={{ position: 'relative', padding: '11px 13px', borderRadius: 10, background: t.surfaceLo, border: '1px dashed ' + t.line }}>
      <div style={{ position: 'absolute', top: -8, left: 10, fontSize: 9, fontFamily: t.mono, fontWeight: 600, color: t.muted, background: t.surface, padding: '0 5px', borderRadius: 4 }}>
        messageCode · {code}
      </div>
      <div style={{ fontSize: 13, color: t.ink2, lineHeight: 1.55, marginTop: 2 }}>{sample}</div>
      <div style={{ fontSize: 10, color: t.faint, marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
        <EIcon name="info" size={11} />文案由後端 messageCode 渲染 · 此為示意
      </div>
    </div>
  );
}

// fallback progress (passenger-safe: shows service continuity, NOT AV internals)
function PaxFallbackRail({ t, stage }) {
  const steps = [
    { k: 'vehicle_change_in_progress', zh: '重新安排車輛' },
    { k: 'human_fallback_assigned', zh: '新車已指派' },
    { k: 'service_continuing', zh: '行程繼續' },
  ];
  const cur = steps.findIndex(s => s.k === stage);
  const idx = cur < 0 ? 0 : cur;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start' }}>
      {steps.map((s, i) => {
        const done = i <= idx;
        return (
          <React.Fragment key={s.k}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, position: 'relative' }}>
              {i < steps.length - 1 && <span style={{ position: 'absolute', top: 12, left: '50%', right: '-50%', height: 2, background: i < idx ? t.primary : t.line }} />}
              <span style={{ width: 24, height: 24, borderRadius: 12, zIndex: 1, background: done ? t.primary : t.surface, border: '2px solid ' + (done ? t.primary : t.line), color: done ? '#fff' : t.faint, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>
                {done ? <EIcon name="check" size={12} stroke={3} /> : i + 1}</span>
              <span style={{ fontSize: 10.5, fontWeight: i === idx ? 700 : 500, color: i === idx ? t.ink : t.muted, textAlign: 'center', lineHeight: 1.25 }}>{s.zh}</span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// shared scaffold for the 4 fallback states
function PeFallbackBase({ t, p, icon, tone, titleCode, titleSample, stage, bodyCode, bodySample, eta, footer }) {
  return (
    <PeShell t={t} p={p} badgeTone={tone === 'success' ? 'live' : 'warn'} footer={footer}>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 13 }}>
        <PeHero t={t} icon={icon} tone={tone} title={<span style={{ fontSize: 16 }}>{titleSample}</span>} />
        <div style={{ marginTop: -2, display: 'flex', justifyContent: 'center' }}>
          <span style={{ fontSize: 9.5, fontFamily: t.mono, color: t.faint, background: t.surfaceLo, padding: '2px 8px', borderRadius: 999, border: '1px dashed ' + t.line }}>title ← {titleCode}</span>
        </div>

        {stage && <ECard t={t} pad={15}><PaxFallbackRail t={t} stage={stage} /></ECard>}

        {eta != null && (
          <ECard t={t} accent={t.primary} pad={16}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: t.primaryBg, color: t.primary, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><EIcon name="car" size={22} /></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12.5, color: t.muted }}>預計上車 · ETA</div>
                <div style={{ fontSize: 11, color: t.faint }}>估計值，非保證</div>
              </div>
              <div style={{ textAlign: 'center', background: t.primaryBg, border: '1px solid ' + t.primaryBd, borderRadius: 12, padding: '8px 16px' }}>
                <div style={{ fontSize: 26, fontWeight: 800, fontFamily: t.mono, color: t.primary, lineHeight: 1 }}>{eta}</div>
                <div style={{ fontSize: 10, color: t.muted, marginTop: 3 }}>分鐘</div>
              </div>
            </div>
          </ECard>
        )}

        <MsgSlot t={t} code={bodyCode} sample={bodySample} />

        {/* trip identity stays stable — same booking, no re-book */}
        <ECard t={t} pad={15}>
          <ERow t={t} k="行程編號" v="PT-9F20K7" mono />
          <ERow t={t} k="目的地" v="台北榮民總醫院" />
          <ERow t={t} k="費用" v="維持原價 · 無額外收費" last />
        </ECard>

        {/* C4 guardrail — no surcharge, no second booking */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '9px 11px', background: t.successBg, border: '1px solid ' + t.successBd, borderRadius: 10 }}>
          <EIcon name="check" size={14} style={{ color: t.success, flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 11, color: t.ink2, lineHeight: 1.45 }}>同一筆行程繼續 · 不會重新下單，也不會加收費用。</span>
        </div>

        <div style={{ fontSize: 10, color: t.faint, textAlign: 'center', lineHeight: 1.5 }}>接送由 {p.operator} 提供 · 服務狀態僅供參考</div>
      </div>
    </PeShell>
  );
}

// ── State 1 · vehicle_change_in_progress ─────────────────────────────────────
function PE_FbVehicleChange({ t, p }) {
  return (
    <PeFallbackBase t={t} p={p} icon="refresh" tone="warn"
      titleCode="pax.fallback.vehicle_change.title" titleSample="正在為您重新安排車輛"
      stage="vehicle_change_in_progress"
      bodyCode="pax.fallback.vehicle_change.body"
      bodySample="您的車輛正在重新安排，我們會盡快為您指派新車，行程目的地不變。"
      eta={null}
      footer={<EBtn t={t} variant="default" block icon="phone">聯絡客服</EBtn>} />
  );
}

// ── State 2 · human_fallback_assigned ────────────────────────────────────────
function PE_FbHumanAssigned({ t, p }) {
  return (
    <PeFallbackBase t={t} p={p} icon="user" tone="success"
      titleCode="pax.fallback.human_assigned.title" titleSample="新車已為您指派"
      stage="human_fallback_assigned"
      bodyCode="pax.fallback.human_assigned.body"
      bodySample="已為您指派新的車輛前往接您，請於原上車點稍候。"
      eta={7}
      footer={<><EBtn t={t} variant="primary" block icon="car">查看行程</EBtn><EBtn t={t} variant="default" block size="sm" icon="phone">聯絡司機</EBtn></>} />
  );
}

// ── State 3 · service_continuing ─────────────────────────────────────────────
function PE_FbServiceContinuing({ t, p }) {
  return (
    <PeFallbackBase t={t} p={p} icon="check" tone="success"
      titleCode="pax.fallback.service_continuing.title" titleSample="行程繼續進行"
      stage="service_continuing"
      bodyCode="pax.fallback.service_continuing.body"
      bodySample="您的行程正常進行中，感謝耐心等候。"
      eta={4}
      footer={<EBtn t={t} variant="primary" block icon="car">追蹤行程</EBtn>} />
  );
}

// ── State 4 · eta_updated ────────────────────────────────────────────────────
function PE_FbEtaUpdated({ t, p }) {
  return (
    <PeFallbackBase t={t} p={p} icon="clock" tone="warn"
      titleCode="pax.fallback.eta_updated.title" titleSample="預計時間已更新"
      stage={null}
      bodyCode="pax.fallback.eta_updated.body"
      bodySample="因重新安排車輛，預計上車時間已更新，造成不便敬請見諒。"
      eta={9}
      footer={<EBtn t={t} variant="primary" block icon="car">查看行程</EBtn>} />
  );
}

Object.assign(window, {
  MsgSlot, PaxFallbackRail, PeFallbackBase,
  PE_FbVehicleChange, PE_FbHumanAssigned, PE_FbServiceContinuing, PE_FbEtaUpdated,
});
