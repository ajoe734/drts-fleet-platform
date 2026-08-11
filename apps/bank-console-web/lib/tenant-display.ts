import type { CSSProperties } from "react";
import {
  getBankTenantName,
  getBankTenantShortName,
  type BankDemoTenant,
} from "@/lib/demo-tenants";

function issuerShortCode(tenant: BankDemoTenant) {
  return tenant.issuerCode.slice(0, 3).toUpperCase();
}

export function tenantDisplayText(
  value: string,
  tenant: BankDemoTenant,
): string {
  if (!value || typeof value !== "string") {
    return value ?? "";
  }
  return value
    .replaceAll("中信銀行", getBankTenantName(tenant, "zh"))
    .replaceAll("中信", getBankTenantShortName(tenant, "zh"))
    .replaceAll("CTBC", tenant.issuerCode)
    .replaceAll("ctbc", tenant.code)
    .replace(/\bCTB(?=[-_A-Z0-9])/g, issuerShortCode(tenant));
}

export function tenantIssuerVars(tenant: BankDemoTenant): CSSProperties {
  const issuerTokens = tenant.template.tokens.dark;

  return {
    "--issuer-primary": issuerTokens.primary,
    "--issuer-primary-dark": issuerTokens.primaryDark,
    "--issuer-accent": issuerTokens.accent,
    "--issuer-ink": issuerTokens.ink,
    "--issuer-surface": issuerTokens.surface.bg,
    "--issuer-border": issuerTokens.surface.border,
    "--issuer-soft": issuerTokens.theme.accentSoft,
    "--issuer-panel": issuerTokens.theme.panel,
    "--issuer-panel-border": issuerTokens.theme.panelBorder,
  } as CSSProperties;
}
