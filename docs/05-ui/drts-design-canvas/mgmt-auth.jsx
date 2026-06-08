// mgmt-auth.jsx — Authority-aware components.
// All behavior driven by backend contracts (Q-X13/X09/X15/X10/X11/X12).
// No role hard-coding in UI.

// ── ActionButton — driven by ResourceActionDescriptor (Q-X13) ───────────────
// descriptor: { action, enabled, disabledReasonCode?, requiresReason?, riskLevel }
// Three render states:
//   - enabled  → live button, riskLevel drives visual emphasis
//   - disabled → button with reason tooltip + dim styling
//   - hidden   → return null (descriptor absent from availableActions[])
function ActionButton({ theme: th, descriptor, label, en, icon, size = 'sm', children, style = {} }) {
  if (!descriptor) return null;
  const { enabled, disabledReasonCode, requiresReason, riskLevel = 'low' } = descriptor;
  const isHigh = riskLevel === 'high';
  const variant = isHigh ? 'danger' : riskLevel === 'medium' ? 'primary' : 'secondary';
  const tooltip = !enabled && disabledReasonCode
    ? `${disabledReasonCode}` + (requiresReason ? ' · 需原因' : '')
    : requiresReason ? '需填寫原因' : null;

  const sz = size === 'xs'
    ? { p: '4px 8px', fz: 11.5, h: 24, ic: 12 }
    : size === 'md' ? { p: '8px 14px', fz: 13, h: 34, ic: 14 }
    : { p: '5px 10px', fz: 12, h: 28, ic: 13 };

  const styleMap = {
    primary:   { bg: th.accent,  fg: '#fff',  bd: th.accent },
    secondary: { bg: th.surface, fg: th.text, bd: th.border },
    danger:    { bg: th.danger,  fg: '#fff',  bd: th.danger },
  };
  const s = styleMap[variant];

  return (
    <button title={tooltip} disabled={!enabled} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: sz.p, fontSize: sz.fz, height: sz.h,
      fontWeight: 500, background: s.bg, color: s.fg,
      border: '1px solid ' + s.bd, borderRadius: 7,
      cursor: enabled ? 'pointer' : 'not-allowed',
      opacity: enabled ? 1 : 0.5, lineHeight: 1,
      fontFamily: '"Inter", "Noto Sans TC", system-ui, sans-serif',
      position: 'relative', ...style,
    }}>
      {icon && <MgmtIcon name={icon} size={sz.ic} />}
      {children || (
        <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5 }}>
          <span>{label}</span>
          {en && <span style={{ fontSize: 10, opacity: 0.7, fontFamily: '"JetBrains Mono", monospace' }}>· {en}</span>}
        </span>
      )}
      {requiresReason && enabled && (
        <span style={{
          width: 5, height: 5, borderRadius: 3, background: 'currentColor',
          opacity: 0.6, marginLeft: 2,
        }} title="需原因" />
      )}
    </button>
  );
}

// ── EmptyState — driven by EmptyReason (Q-X15) ──────────────────────────────
// Each of 6 reasons gets distinct treatment + optional nextAction CTA
function EmptyState({ theme: th, reason = 'no_data', messageOverride, nextAction, compact }) {
  const e = EMPTY_REASONS[reason] || EMPTY_REASONS.no_data;
  const map = {
    no_data:              { icon: 'check',  tone: th.textMuted, bg: th.surfaceLo,    bd: th.border },
    not_provisioned:      { icon: 'info',   tone: th.info,      bg: th.infoBg,       bd: th.infoBorder },
    fetch_failed:         { icon: 'danger', tone: th.danger,    bg: th.dangerBg,     bd: th.dangerBorder },
    permission_denied:    { icon: 'lock',   tone: th.warn,      bg: th.warnBg,       bd: th.warnBorder },
    external_unavailable: { icon: 'warn',   tone: th.warn,      bg: th.warnBg,       bd: th.warnBorder },
    filtered_empty:       { icon: 'filter', tone: th.textMuted, bg: th.surfaceLo,    bd: th.border },
    driver_not_eligible:  { icon: 'lock',   tone: th.warn,      bg: th.warnBg,       bd: th.warnBorder },
  };
  const c = map[reason] || map.no_data;
  const p = compact ? { vp: 16, ic: 24, gap: 10, fz: 12, ttl: 13 } : { vp: 36, ic: 36, gap: 14, fz: 13, ttl: 15 };

  return (
    <div style={{
      padding: `${p.vp}px 16px`, display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: p.gap, textAlign: 'center', background: c.bg, border: '1px dashed ' + c.bd,
      borderRadius: 10,
    }}>
      <div style={{
        width: p.ic + 16, height: p.ic + 16, borderRadius: (p.ic + 16) / 2,
        background: th.surface, color: c.tone,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: '1px solid ' + c.bd,
      }}>
        <MgmtIcon name={c.icon} size={p.ic} stroke={1.4} />
      </div>
      <div>
        <div style={{ fontSize: p.ttl, fontWeight: 600, color: th.text, display: 'flex', alignItems: 'baseline', gap: 6, justifyContent: 'center' }}>
          <span>{e.label}</span>
          <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: p.ttl - 3, color: th.textDim, fontWeight: 500 }}>· {reason}</span>
        </div>
        <div style={{ fontSize: p.fz, color: th.textMuted, marginTop: 4, maxWidth: 380, lineHeight: 1.5 }}>
          {messageOverride || e.hint}
        </div>
      </div>
      {nextAction && (
        <Btn theme={th} size="sm" variant="primary" icon={nextAction.icon}>{nextAction.label}</Btn>
      )}
    </div>
  );
}

// ── ConfirmModal — risk-classified (Q-X09) ─────────────────────────────────
function ConfirmModal({ theme: th, risk = 'medium', title, body, confirmLabel = '確認', cancelLabel = '取消', reason, reasonField }) {
  const r = RISK_LEVELS[risk];
  const tone = risk === 'high' ? th.danger : risk === 'medium' ? th.accent : th.success;
  const toneBg = risk === 'high' ? th.dangerBg : risk === 'medium' ? th.accentBg : th.successBg;

  return (
    <Modal theme={th} accent={tone}
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 22, height: 22, borderRadius: 11, background: toneBg, color: tone,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}><MgmtIcon name={r.icon} size={13} /></span>
          {title}
        </span>
      }
      subtitle={<span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10.5 }}>{r.label.toUpperCase()} · {risk} · {r.pattern}</span>}
      footer={
        <>
          <Btn theme={th} variant="secondary">{cancelLabel}</Btn>
          <Btn theme={th} variant="primary" style={risk === 'high' ? { background: th.danger, borderColor: th.danger } : {}}
            disabled={risk === 'high' && !reason}>
            {confirmLabel}
          </Btn>
        </>
      }
    >
      <div style={{ fontSize: 13, color: th.text, lineHeight: 1.55, marginBottom: 14 }}>
        {body}
      </div>
      {risk === 'high' && (
        <Field theme={th} label="原因 · reason" required hint="此操作為高風險，原因將寫入稽核紀錄並可被後續調閱。">
          <textarea style={{
            width: '100%', minHeight: 70, padding: 10, borderRadius: 7,
            border: '1px solid ' + (reason ? th.border : th.danger),
            background: th.bgRaised, color: th.text, fontFamily: 'inherit', fontSize: 13,
            resize: 'vertical', boxSizing: 'border-box',
          }} defaultValue={reason} placeholder={reasonField || '請說明操作原因…'}></textarea>
        </Field>
      )}
      {risk === 'medium' && (
        <div style={{ fontSize: 11.5, color: th.textMuted, padding: '8px 10px', background: th.surfaceLo, borderRadius: 6 }}>
          <MgmtIcon name="info" size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
          此操作將記錄至稽核紀錄。
        </div>
      )}
    </Modal>
  );
}

// ── ActionReceipt toast — with auditId + cross-app deep link (Q-X10) ────────
function ActionReceipt({ theme: th, status = 'completed', title, message, auditId, auditLink, resourceLink, dismissible = true }) {
  const tones = {
    completed: { fg: th.success, bg: th.successBg, bd: th.successBorder, icon: 'check', label: '已完成' },
    accepted:  { fg: th.info,    bg: th.infoBg,    bd: th.infoBorder,    icon: 'clock', label: '已受理' },
    failed:    { fg: th.danger,  bg: th.dangerBg,  bd: th.dangerBorder,  icon: 'danger', label: '失敗' },
  };
  const t = tones[status];
  return (
    <div style={{
      display: 'flex', gap: 12, padding: '12px 14px',
      background: th.surface, border: '1px solid ' + th.border, borderLeft: '4px solid ' + t.fg,
      borderRadius: 8, boxShadow: th.shadow,
      width: 380, fontSize: 12.5,
    }}>
      <div style={{
        width: 26, height: 26, borderRadius: 13, flexShrink: 0,
        background: t.bg, color: t.fg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}><MgmtIcon name={t.icon} size={14} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontWeight: 600, color: th.text }}>{title}</span>
          <Pill theme={th} tone={status === 'failed' ? 'danger' : status === 'accepted' ? 'info' : 'success'}>{t.label}</Pill>
        </div>
        {message && <div style={{ marginTop: 4, color: th.textMuted, lineHeight: 1.45 }}>{message}</div>}
        {auditId && (
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
            <span style={{ color: th.textDim }}>audit</span>
            <span style={{ fontFamily: '"JetBrains Mono", monospace', color: th.text, fontSize: 11 }}>{auditId}</span>
            {auditLink && (
              <a style={{ color: th.accent, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                View audit
                {auditLink.crossApp && <MgmtIcon name="ext" size={10} />}
              </a>
            )}
          </div>
        )}
        {resourceLink && (
          <div style={{ marginTop: 6, fontSize: 11 }}>
            <a style={{ color: th.accent, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              {resourceLink.label}
              {resourceLink.openMode === 'new_tab' && <MgmtIcon name="ext" size={10} />}
            </a>
          </div>
        )}
      </div>
      {dismissible && <MgmtIcon name="x" size={13} style={{ color: th.textDim, cursor: 'pointer', flexShrink: 0, marginTop: 2 }} />}
    </div>
  );
}

// ── SecretRevealModal — plaintext-once pattern (Q-ADM07 / Q-TEN09) ──────────
function SecretRevealModal({ theme: th, secretType = 'API key', name, secret = 'drts_live_8AB2k1Mvqp_aE32xQ19LzPnT8B2kK1yQ4z',
                             scope, expiresAt, acknowledged = false }) {
  return (
    <Modal theme={th} accent={th.warn}
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 22, height: 22, borderRadius: 11, background: th.warnBg, color: th.warn,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}><MgmtIcon name="key" size={13} /></span>
          {secretType} 已產生 · only shown once
        </span>
      }
      subtitle={
        <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10.5 }}>
          PLAINTEXT-ONCE · Q-ADM07 / Q-TEN09
        </span>
      }
      w={520}
      footer={
        <>
          <Btn theme={th} variant="secondary">取消</Btn>
          <Btn theme={th} variant="primary" disabled={!acknowledged}
            style={!acknowledged ? {} : { background: th.success, borderColor: th.success }}>
            <MgmtIcon name="check" size={13} />
            完成 · I stored this key
          </Btn>
        </>
      }
    >
      <Banner theme={th} tone="warn" icon="warn"
        title="關閉此視窗後永遠不再顯示完整 secret"
        body="若遺失必須重新建立並輪替。我們只儲存遮罩後綴 (••••8B2k)，不可還原。" />
      <div style={{ marginTop: 14 }}>
        <Field theme={th} label={`${secretType} 名稱`}>
          <Input theme={th} value={name || 'production · ride-portal'} />
        </Field>
        <Field theme={th} label="Secret · 完整值" hint="複製後再進行接續操作；下方確認方框必須勾選。">
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: th.warnBg, border: '1px solid ' + th.warnBorder, borderRadius: 7,
            padding: '10px 12px', fontFamily: '"JetBrains Mono", monospace', fontSize: 12, color: th.text,
            overflowX: 'auto',
          }}>
            <span style={{ flex: 1, userSelect: 'all', whiteSpace: 'nowrap' }}>{secret}</span>
            <Btn theme={th} size="xs" icon="copy">複製</Btn>
            <Btn theme={th} size="xs" icon="download">.txt</Btn>
          </div>
        </Field>
        {scope && (
          <DL theme={th} cols={2} items={[
            { k: 'SCOPE', v: scope, mono: true },
            { k: 'EXPIRES AT', v: expiresAt || '—', mono: true },
            { k: '建立者', v: '林宜君 (pa_super_admin)' },
            { k: '建立時間', v: '2026-05-25 14:55:12', mono: true },
          ]} />
        )}
        <div style={{ marginTop: 14, padding: '10px 12px', background: th.surfaceLo, borderRadius: 7, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Checkbox theme={th} on={acknowledged} label="I have stored this key in a secure location · 我已妥善保存此 secret" />
        </div>
      </div>
    </Modal>
  );
}

// ── StaleBanner — UiRefreshMetadata.dataFreshness != 'fresh' ────────────────
function StaleBanner({ theme: th, dataFreshness = 'stale', generatedAt = '2 min 前', tier = 'medium_slow' }) {
  const t = REFRESH_TIERS[tier];
  return (
    <Banner theme={th} tone={dataFreshness === 'degraded' ? 'danger' : 'warn'} icon="clock"
      title={
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span>{dataFreshness === 'degraded' ? '資料來源降級' : '資料已過時'}</span>
          <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10.5, opacity: 0.6 }}>· dataFreshness={dataFreshness}</span>
        </span>
      }
      body={`目前顯示的內容於 ${generatedAt}從後端產生 (refresh tier ${t.code} · ${t.label})；請手動 refresh 或等候下次自動 poll。`}
      actions={<Btn theme={th} size="xs" icon="refresh" variant="secondary">立即重整</Btn>}
    />
  );
}

// ── HealthBanner — UiHealthEnvelope page-critical degraded (Q-X12) ──────────
function HealthBanner({ theme: th, status = 'degraded', degradedServices = [] }) {
  if (status === 'healthy') return null;
  return (
    <div style={{ padding: '12px 24px 0' }}>
      <Banner theme={th} tone={status === 'down' ? 'danger' : 'warn'} icon="warn"
        title={
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span>{status === 'down' ? '頁面依賴 service 不可用' : '頁面依賴 service 降級中'}</span>
            <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10.5, opacity: 0.7 }}>· UiHealthEnvelope.status={status}</span>
          </span>
        }
        body={
          degradedServices.length > 0
            ? degradedServices.map(s => `${s.service} (${s.impact})`).join(' · ')
            : '部分顯示資料可能不完整；下方仍可瀏覽，但 mutation 可能失敗。'
        }
      />
    </div>
  );
}

// ── ActorRealmChip — for cross-actor audit (Q-TEN13) ────────────────────────
function ActorRealmChip({ theme: th, realm = 'tenant', actor }) {
  const labels = { tenant: '租戶', ops: '營運', platform: '平台', system: '系統', driver: '司機' };
  const ens    = { tenant: 'tenant', ops: 'ops', platform: 'platform', system: 'system', driver: 'driver' };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <Pill theme={th} tone={realm} dot>{labels[realm]}<span style={{ marginLeft: 4, opacity: 0.7, fontFamily: '"JetBrains Mono", monospace', fontSize: 9.5 }}>{ens[realm]}</span></Pill>
      {actor && <span style={{ fontSize: 12, color: th.text }}>{actor}</span>}
    </span>
  );
}

Object.assign(window, {
  ActionButton, EmptyState, ConfirmModal, ActionReceipt,
  SecretRevealModal, StaleBanner, HealthBanner, ActorRealmChip,
});
