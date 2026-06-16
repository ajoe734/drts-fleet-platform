import { BRAND_TEMPLATES, type PartnerBrandTemplate } from "@drts/ui-tokens";
import { t, type Locale, type TranslationKey } from "@/lib/translations";

export type BankDemoTenantCode =
  | "ctbc"
  | "cathay"
  | "taishin"
  | "dbs"
  | "fubon";
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

export const DEFAULT_BANK_DEMO_TENANT: BankDemoTenantCode = "ctbc";

export const BANK_DEMO_TENANTS: Record<BankDemoTenantCode, BankDemoTenant> = {
  ctbc: {
    code: "ctbc",
    issuerCode: "CTBC",
    nameKey: "tenant.ctbc.name",
    shortNameKey: "tenant.ctbc.shortName",
    contextKey: "tenant.ctbc.context",
    avatar: "周",
    actorEmail: "cw.chou@ctbcbank.com",
    roleCode: "bank_program_admin",
    tenantId: "tenant-ctbc-001",
    template: BRAND_TEMPLATES.CTBC,
    programSeedKeys: {
      premium: "tenant.program.ctbc.premium",
      business: "tenant.program.ctbc.business",
      starter: "tenant.program.ctbc.starter",
    },
  },
  cathay: {
    code: "cathay",
    issuerCode: "CATHAY",
    nameKey: "tenant.cathay.name",
    shortNameKey: "tenant.cathay.shortName",
    contextKey: "tenant.cathay.context",
    avatar: "國泰",
    actorEmail: "kh.lin@cathaybk.com.tw",
    roleCode: "bank_program_admin",
    tenantId: "tenant-cathay-001",
    template: BRAND_TEMPLATES.CATHAY,
    programSeedKeys: {
      premium: "tenant.program.cathay.premium",
      business: "tenant.program.cathay.business",
      starter: "tenant.program.cathay.starter",
    },
  },
  taishin: {
    code: "taishin",
    issuerCode: "TAISHIN",
    nameKey: "tenant.taishin.name",
    shortNameKey: "tenant.taishin.shortName",
    contextKey: "tenant.taishin.context",
    avatar: "台新",
    actorEmail: "ys.wang@taishinbank.com.tw",
    roleCode: "bank_program_admin",
    tenantId: "tenant-taishin-001",
    template: BRAND_TEMPLATES.TAISHIN,
    programSeedKeys: {
      premium: "tenant.program.taishin.premium",
      business: "tenant.program.taishin.business",
      starter: "tenant.program.taishin.starter",
    },
  },
  dbs: {
    code: "dbs",
    issuerCode: "DBS",
    nameKey: "tenant.dbs.name",
    shortNameKey: "tenant.dbs.shortName",
    contextKey: "tenant.dbs.context",
    avatar: "星展",
    actorEmail: "wt.koh@dbs.com",
    roleCode: "bank_program_admin",
    tenantId: "tenant-dbs-001",
    template: BRAND_TEMPLATES.DBS,
    programSeedKeys: {
      premium: "tenant.program.dbs.premium",
      business: "tenant.program.dbs.business",
      starter: "tenant.program.dbs.starter",
    },
  },
  fubon: {
    code: "fubon",
    issuerCode: "FUBON",
    nameKey: "tenant.fubon.name",
    shortNameKey: "tenant.fubon.shortName",
    contextKey: "tenant.fubon.context",
    avatar: "富邦",
    actorEmail: "py.chen@fubon.com",
    roleCode: "bank_program_admin",
    tenantId: "tenant-fubon-001",
    template: BRAND_TEMPLATES.FUBON,
    programSeedKeys: {
      premium: "tenant.program.fubon.premium",
      business: "tenant.program.fubon.business",
      starter: "tenant.program.fubon.starter",
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
