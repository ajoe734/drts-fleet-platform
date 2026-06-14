import type { ReactNode } from "react";
import { BRAND_TEMPLATES } from "@drts/ui-tokens";
import { StatusChip } from "@drts/ui-web";
import type { ContractHealth } from "@/lib/contracts-data";
import { t } from "@/lib/translations";

const ctbcDarkTokens = BRAND_TEMPLATES.CTBC.tokens.dark;

export function IssuerBrandPill() {
  return (
    <span
      className="issuer-brand-pill"
      style={{
        color: ctbcDarkTokens.text.strong,
        background: ctbcDarkTokens.theme.panel,
        borderColor: ctbcDarkTokens.surface.border,
        boxShadow: `inset 0 0 0 1px ${ctbcDarkTokens.theme.panelBorder}`,
      }}
    >
      <span
        className="issuer-brand-pill__mark"
        style={{
          background: `linear-gradient(135deg, ${ctbcDarkTokens.primary}, ${ctbcDarkTokens.accent})`,
        }}
      />
      <span className="issuer-brand-pill__text">
        {BRAND_TEMPLATES.CTBC.cardArt.issuerLabel}
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
