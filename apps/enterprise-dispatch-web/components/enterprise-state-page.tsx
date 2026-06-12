import Link from "next/link";
import {
  EnterpriseBanner,
  EnterpriseCard,
  EnterpriseDl,
  EnterprisePageHeader,
} from "@/components/enterprise-primitives";
import { EnterpriseEmbedShell } from "@/components/enterprise-shell";
import {
  getEnterpriseEmbedState,
  getEnterpriseGate,
  type EnterpriseEmbedStateKind,
  type EnterpriseGateKind,
} from "@/lib/enterprise-route-config";
import { enterprisePageStyle, enterpriseTheme } from "@/lib/enterprise-theme";

const actionLinkStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 34,
  padding: "8px 12px",
  borderRadius: 10,
  background: enterpriseTheme.surface,
  border: `1px solid ${enterpriseTheme.border}`,
  color: enterpriseTheme.text,
  fontSize: 12.5,
  fontWeight: 600,
  textDecoration: "none",
} as const;

export function EnterpriseGatePage({ kind }: { kind: EnterpriseGateKind }) {
  const gate = getEnterpriseGate(kind);

  return (
    <div style={{ ...enterprisePageStyle, maxWidth: 920 }}>
      <EnterprisePageHeader title={gate.title} subtitle={gate.subtitle} />
      <EnterpriseBanner
        tone={gate.tone}
        title="support-safe template"
        body="所有 gate state 都應提供原因、影響、下一步與企業支援資訊。"
      />
      <EnterpriseCard title="狀態詳情">
        <EnterpriseDl cols={1} items={[...gate.details]} />
        <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
          {gate.actions.map((action) => (
            <Link key={action.href} href={action.href} style={actionLinkStyle}>
              {action.label}
            </Link>
          ))}
        </div>
      </EnterpriseCard>
    </div>
  );
}

export function EnterpriseEmbedStatePage({
  kind,
}: {
  kind: EnterpriseEmbedStateKind;
}) {
  const state = getEnterpriseEmbedState(kind);
  const embedTone =
    state.tone === "danger"
      ? "err"
      : state.tone === "warn"
        ? "warn"
        : state.tone === "success"
          ? "live"
          : "neutral";

  return (
    <div style={{ ...enterprisePageStyle, maxWidth: 760 }}>
      <EnterprisePageHeader title={state.title} subtitle={state.subtitle} sticky={false} />
      <EnterpriseEmbedShell host="hongshuo-workspace" state={embedTone}>
        <div style={{ padding: 16, display: "grid", gap: 16 }}>
          <EnterpriseCard title="身分交付狀態">
            <EnterpriseDl cols={1} items={[...state.details]} />
          </EnterpriseCard>
          <EnterpriseBanner
            tone={state.tone}
            title="embed identity"
            body="內嵌版沿用相同 booking 語意，但由 host app 負責 session hand-off，且不顯示後台導覽。"
          />
          <EnterpriseCard title="下一步">
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {state.actions.map((action) => (
                <Link key={action.href} href={action.href} style={actionLinkStyle}>
                  {action.label}
                </Link>
              ))}
            </div>
          </EnterpriseCard>
        </div>
      </EnterpriseEmbedShell>
    </div>
  );
}
