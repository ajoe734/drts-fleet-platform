import type { CSSProperties } from "react";
import Link from "next/link";
import { resolveBankDemoTenant, resolveLocale } from "../../lib/demo-tenants";
import { loadBankUsersData } from "../../lib/bank-dev-read-models";
import {
  BankUserApiError,
  getBankUserIdentity,
} from "../../lib/bank-user-identity";
import { t } from "../../lib/translations";
import UsersManagement from "./users-management";
import { userManagementText } from "./translations";

export default async function UsersPage({
  searchParams,
}: {
  searchParams?: Promise<{
    bank?: string | string[];
    locale?: string | string[];
    role?: string | string[];
    status?: string;
  }>;
}) {
  const params = await searchParams;
  const locale = resolveLocale(params?.locale);
  // Query-selected bank affects branding only. Authority and data come from
  // the verified tenant session, never the display persona or this selector.
  const tenant = resolveBankDemoTenant(params?.bank);
  const tokens = tenant.template.tokens.dark;
  const issuerVars = {
    "--issuer-primary": tokens.primary,
    "--issuer-primary-dark": tokens.primaryDark,
    "--issuer-accent": tokens.accent,
    "--issuer-ink": tokens.ink,
    "--issuer-surface": tokens.surface.bg,
    "--issuer-border": tokens.surface.border,
  } as CSSProperties;
  let directory;
  let failure: string | null = null;
  try {
    directory = await loadBankUsersData(await getBankUserIdentity());
  } catch (error) {
    failure =
      error instanceof BankUserApiError
        ? `HTTP ${error.status}`
        : userManagementText("serviceUnavailable", locale);
  }
  return (
    <div className="page-shell bank-users-page" style={issuerVars}>
      <section className="users-hero">
        <div className="users-hero-copy">
          <span className="eyebrow">{t("users.eyebrow", locale)}</span>
          <h1>{t("users.title", locale)}</h1>
          <p>{t("users.lead", locale)}</p>
        </div>
      </section>
      {directory ? (
        <UsersManagement
          initial={directory}
          locale={locale}
          initialFilter={params?.status}
        />
      ) : (
        <section className="surface-card">
          <p role="alert">{failure}</p>
          <Link href="/api/auth/tenant/login?return_url=%2Fusers">
            {userManagementText("managedSignIn", locale)}
          </Link>
        </section>
      )}
    </div>
  );
}
