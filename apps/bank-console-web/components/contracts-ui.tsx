import type { ReactNode } from "react";
import { StatusChip } from "@drts/ui-web";
import { getBankTenantName, type BankDemoTenant } from "@/lib/demo-tenants";
import type { ContractHealth } from "@/lib/contracts-data";
import { t, type Locale } from "@/lib/translations";

export function IssuerBrandPill({
  locale,
  tenant,
}: {
  locale: Locale;
  tenant: BankDemoTenant;
}) {
  const issuerTokens = tenant.template.tokens.dark;

  return (
    <span
      className="issuer-brand-pill"
      style={{
        color: issuerTokens.text.strong,
        background: issuerTokens.theme.panel,
        borderColor: issuerTokens.surface.border,
        boxShadow: `inset 0 0 0 1px ${issuerTokens.theme.panelBorder}`,
      }}
    >
      <span
        className="issuer-brand-pill__mark"
        style={{
          background: `linear-gradient(135deg, ${issuerTokens.primary}, ${issuerTokens.accent})`,
        }}
      />
      <span className="issuer-brand-pill__text">
        {getBankTenantName(tenant, locale)}
      </span>
    </span>
  );
}

export function ContractHealthBadge({
  health,
  locale = "zh",
}: {
  health: ContractHealth;
  locale?: Locale;
}) {
  const tone =
    health === "healthy"
      ? "success"
      : health === "at_risk"
        ? "warning"
        : "danger";

  return (
    <StatusChip tone={tone} label={t(`contracts.health.${health}`, locale)} />
  );
}

export function ReadOnlyPanel({
  title,
  description,
  children,
  locale = "zh",
}: {
  title: string;
  description: string;
  children?: ReactNode;
  locale?: Locale;
}) {
  return (
    <section className="callout-panel">
      <div className="contracts-inline-header">
        <strong>{title}</strong>
        <span className="status-chip">{t("contracts.readOnly", locale)}</span>
      </div>
      <p>{description}</p>
      {children}
    </section>
  );
}
