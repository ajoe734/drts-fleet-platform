import { BRAND_TEMPLATES, type PartnerBrandTemplate } from "@drts/ui-tokens";
import { t, type Locale, type TranslationKey } from "@/lib/translations";

export type BankDemoTenantCode =
  | "acme"
  | "contoso"
  | "fabrikam"
  | "northwind"
  | "tailspin";
export type BankProgramSeed = "premium" | "business" | "starter";

export type BankDemoTenant = {
  code: BankDemoTenantCode;
  issuerCode: string;
  nameKey: TranslationKey;
  shortNameKey: TranslationKey;
  contextKey: TranslationKey;
  avatar: string;
  actorEmail: string;
  roleCode: string;
  tenantId: string;
  template: PartnerBrandTemplate;
  programSeedKeys: Record<BankProgramSeed, TranslationKey>;
};

export const DEFAULT_BANK_DEMO_TENANT: BankDemoTenantCode = "acme";

export const BANK_DEMO_TENANTS: Record<BankDemoTenantCode, BankDemoTenant> = {
  acme: {
    code: "acme",
    issuerCode: "ACME",
    nameKey: "tenant.acme.name",
    shortNameKey: "tenant.acme.shortName",
    contextKey: "tenant.acme.context",
    avatar: "周",
    actorEmail: "cw.chou@acme.example",
    roleCode: "bank_program_admin",
    // This is the canonical ACME issuer ledger configured by the Dev API.
    // The former display-only identifier returned an empty, valid response.
    tenantId: "tenant-demo-001",
    template: BRAND_TEMPLATES.ACME,
    programSeedKeys: {
      premium: "tenant.program.acme.premium",
      business: "tenant.program.acme.business",
      starter: "tenant.program.acme.starter",
    },
  },
  contoso: {
    code: "contoso",
    issuerCode: "CONTOSO",
    nameKey: "tenant.contoso.name",
    shortNameKey: "tenant.contoso.shortName",
    contextKey: "tenant.contoso.context",
    avatar: "康拓索",
    actorEmail: "kh.lin@contoso.example",
    roleCode: "bank_program_admin",
    tenantId: "tenant-contoso-001",
    template: BRAND_TEMPLATES.CONTOSO,
    programSeedKeys: {
      premium: "tenant.program.contoso.premium",
      business: "tenant.program.contoso.business",
      starter: "tenant.program.contoso.starter",
    },
  },
  fabrikam: {
    code: "fabrikam",
    issuerCode: "FABRIKAM",
    nameKey: "tenant.fabrikam.name",
    shortNameKey: "tenant.fabrikam.shortName",
    contextKey: "tenant.fabrikam.context",
    avatar: "法碧康",
    actorEmail: "ys.wang@fabrikam.example",
    roleCode: "bank_program_admin",
    tenantId: "tenant-fabrikam-001",
    template: BRAND_TEMPLATES.FABRIKAM,
    programSeedKeys: {
      premium: "tenant.program.fabrikam.premium",
      business: "tenant.program.fabrikam.business",
      starter: "tenant.program.fabrikam.starter",
    },
  },
  northwind: {
    code: "northwind",
    issuerCode: "NORTHWIND",
    nameKey: "tenant.northwind.name",
    shortNameKey: "tenant.northwind.shortName",
    contextKey: "tenant.northwind.context",
    avatar: "北風",
    actorEmail: "wt.koh@northwind.example",
    roleCode: "bank_program_admin",
    tenantId: "tenant-northwind-001",
    template: BRAND_TEMPLATES.NORTHWIND,
    programSeedKeys: {
      premium: "tenant.program.northwind.premium",
      business: "tenant.program.northwind.business",
      starter: "tenant.program.northwind.starter",
    },
  },
  tailspin: {
    code: "tailspin",
    issuerCode: "TAILSPIN",
    nameKey: "tenant.tailspin.name",
    shortNameKey: "tenant.tailspin.shortName",
    contextKey: "tenant.tailspin.context",
    avatar: "泰思賓",
    actorEmail: "py.chen@tailspin.example",
    roleCode: "bank_program_admin",
    tenantId: "tenant-tailspin-001",
    template: BRAND_TEMPLATES.TAILSPIN,
    programSeedKeys: {
      premium: "tenant.program.tailspin.premium",
      business: "tenant.program.tailspin.business",
      starter: "tenant.program.tailspin.starter",
    },
  },
};

export function getBankTenantName(tenant: BankDemoTenant, locale: Locale) {
  return t(tenant.nameKey, locale);
}

export function getBankTenantShortName(tenant: BankDemoTenant, locale: Locale) {
  return t(tenant.shortNameKey, locale);
}

export function getBankTenantContext(tenant: BankDemoTenant, locale: Locale) {
  return t(tenant.contextKey, locale);
}

export function getBankProgramSeedLabel(
  tenant: BankDemoTenant,
  seed: BankProgramSeed,
  locale: Locale,
) {
  return t(tenant.programSeedKeys[seed], locale);
}

export function resolveBankDemoTenant(
  value: string | string[] | null | undefined,
): BankDemoTenant {
  const raw = Array.isArray(value) ? value[0] : value;
  const code = raw?.toLowerCase();

  if (code && code in BANK_DEMO_TENANTS) {
    return BANK_DEMO_TENANTS[code as BankDemoTenantCode];
  }

  return BANK_DEMO_TENANTS[DEFAULT_BANK_DEMO_TENANT];
}

export function resolveLocale(
  value: string | string[] | null | undefined,
): Locale {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "en" ? "en" : "zh";
}

export function getLocaleTag(locale: Locale) {
  return locale === "en" ? "en" : "zh-Hant";
}
