import type { ReactNode } from "react";
import { StatusChip } from "@drts/ui-web";
import { BANK_DEMO_TENANTS, type BankDemoTenant } from "@/lib/demo-tenants";
import type { ContractHealth } from "@/lib/contracts-data";
import { t } from "@/lib/translations";

const defaultTenant = BANK_DEMO_TENANTS.ctbc;

export function IssuerBrandPill({
  tenant = defaultTenant,
}: {
  tenant?: BankDemoTenant;
}) {
  const tokens = tenant.template.tokens.dark;

  return (
    <span
      className="issuer-brand-pill"
      style={{
        color: tokens.text.strong,
        background: tokens.theme.panel,
        borderColor: tokens.surface.border,
        boxShadow: `inset 0 0 0 1px ${tokens.theme.panelBorder}`,
      }}
    >
      <span
        className="issuer-brand-pill__mark"
        style={{
          background: `linear-gradient(135deg, ${tokens.primary}, ${tokens.accent})`,
        }}
      />
      <span className="issuer-brand-pill__text">
        {tenant.template.cardArt.issuerLabel}
      </span>
    </span>
  );
}

export function ContractHealthBadge({ health }: { health: ContractHealth }) {
  const tone =
    health === "healthy"
      ? "success"
      : health === "at_risk"
        ? "warning"
        : "danger";

  return <StatusChip tone={tone} label={t(`contracts.health.${health}`)} />;
}

export function ReadOnlyPanel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <section className="callout-panel">
      <div className="contracts-inline-header">
        <strong>{title}</strong>
        <span className="status-chip">{t("contracts.readOnly")}</span>
      </div>
      <p>{description}</p>
      {children}
    </section>
  );
}
