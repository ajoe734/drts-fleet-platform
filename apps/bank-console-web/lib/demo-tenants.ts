import { BRAND_TEMPLATES, type PartnerBrandTemplate } from "@drts/ui-tokens";
import type { Locale } from "@/lib/translations";

export type BankDemoTenantCode = "ctbc" | "cathay" | "fubon";

type LocalizedText = Record<Locale, string>;

export type BankDemoTenant = {
  code: BankDemoTenantCode;
  issuerCode: string;
  name: LocalizedText;
  shortName: LocalizedText;
  context: LocalizedText;
  avatar: string;
  actorName: string;
  actorEmail: string;
  roleLabel: LocalizedText;
  roleCode: string;
  tenantId: string;
  template: PartnerBrandTemplate;
  programSeed: {
    premium: LocalizedText;
    business: LocalizedText;
    starter: LocalizedText;
  };
};

export const DEFAULT_BANK_DEMO_TENANT: BankDemoTenantCode = "ctbc";

export const BANK_DEMO_TENANTS: Record<BankDemoTenantCode, BankDemoTenant> = {
  ctbc: {
    code: "ctbc",
    issuerCode: "CTBC",
    name: { zh: "中信銀行", en: "CTBC Bank" },
    shortName: { zh: "中信", en: "CTBC" },
    context: { zh: "中信銀行 · CTBC ISSUER", en: "CTBC Bank · issuer" },
    avatar: "周",
    actorName: "周敬文",
    actorEmail: "cw.chou@ctbcbank.com",
    roleLabel: { zh: "方案管理員", en: "Program admin" },
    roleCode: "bank_program_admin",
    tenantId: "tenant-ctbc-001",
    template: BRAND_TEMPLATES.CTBC,
    programSeed: {
      premium: { zh: "鼎極卡機場接送", en: "World Elite airport transfer" },
      business: { zh: "商旅御璽卡禮遇", en: "Business Signature benefit" },
      starter: { zh: "晶緻卡新戶禮遇", en: "New-card airport welcome" },
    },
  },
  cathay: {
    code: "cathay",
    issuerCode: "CATHAY",
    name: { zh: "國泰世華銀行", en: "Cathay United Bank" },
    shortName: { zh: "國泰", en: "Cathay" },
    context: {
      zh: "國泰世華銀行 · CATHAY ISSUER",
      en: "Cathay United Bank · issuer",
    },
    avatar: "國泰",
    actorName: "林可欣",
    actorEmail: "kh.lin@cathaybk.com.tw",
    roleLabel: { zh: "方案管理員", en: "Program admin" },
    roleCode: "bank_program_admin",
    tenantId: "tenant-cathay-001",
    template: BRAND_TEMPLATES.CATHAY,
    programSeed: {
      premium: { zh: "尊榮卡機場接送", en: "Prestige airport transfer" },
      business: { zh: "商務御璽旅遊禮遇", en: "Business travel benefit" },
      starter: { zh: "新戶旅遊接送禮遇", en: "New-card travel welcome" },
    },
  },
  fubon: {
    code: "fubon",
    issuerCode: "FUBON",
    name: { zh: "富邦銀行", en: "Fubon Bank" },
    shortName: { zh: "富邦", en: "Fubon" },
    context: { zh: "富邦銀行 · FUBON ISSUER", en: "Fubon Bank · issuer" },
    avatar: "富邦",
    actorName: "陳品妤",
    actorEmail: "py.chen@fubon.com",
    roleLabel: { zh: "方案管理員", en: "Program admin" },
    roleCode: "bank_program_admin",
    tenantId: "tenant-fubon-001",
    template: BRAND_TEMPLATES.FUBON,
    programSeed: {
      premium: { zh: "尊御卡機場接送", en: "Premier airport transfer" },
      business: { zh: "商務鈦金卡接送禮遇", en: "Business titanium benefit" },
      starter: { zh: "新戶核卡接送禮遇", en: "New-card mobility welcome" },
    },
  },
};

export function resolveBankDemoTenant(
  value: string | string[] | null | undefined,
): BankDemoTenant {
  const raw = Array.isArray(value) ? value[0] : value;
  const code = raw?.toLowerCase();

  if (code === "cathay" || code === "fubon" || code === "ctbc") {
    return BANK_DEMO_TENANTS[code];
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
