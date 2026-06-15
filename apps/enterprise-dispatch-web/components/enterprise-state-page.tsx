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
import { getServerLocale } from "@/lib/server-locale";
import { enterprisePageStyle, enterpriseTheme } from "@/lib/enterprise-theme";
import { t } from "@/lib/translations";

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

export async function EnterpriseGatePage({
  kind,
}: {
  kind: EnterpriseGateKind;
}) {
  const locale = await getServerLocale();
  const gate = getEnterpriseGate(kind, locale);

  return (
    <div style={{ ...enterprisePageStyle, maxWidth: 920 }}>
      <EnterprisePageHeader title={gate.title} subtitle={gate.subtitle} />
      <EnterpriseBanner
        tone={gate.tone}
        title={t("state.supportTemplate", undefined, locale)}
        body={t("state.supportTemplateBody", undefined, locale)}
      />
      <EnterpriseCard title={t("state.details", undefined, locale)}>
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

export async function EnterpriseEmbedStatePage({
  kind,
}: {
  kind: EnterpriseEmbedStateKind;
}) {
  const locale = await getServerLocale();
  const state = getEnterpriseEmbedState(kind, locale);
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
          <EnterpriseCard title={t("state.embedStatus", undefined, locale)}>
            <EnterpriseDl cols={1} items={[...state.details]} />
          </EnterpriseCard>
          <EnterpriseBanner
            tone={state.tone}
            title={t("state.embedBanner", undefined, locale)}
            body={t("state.embedBannerBody", undefined, locale)}
          />
          <EnterpriseCard title={t("state.next", undefined, locale)}>
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
