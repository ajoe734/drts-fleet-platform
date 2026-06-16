import type { BankRole as HomeRole } from "@/lib/home-data";
import type { BankDemoTenant, BankDemoTenantCode } from "@/lib/demo-tenants";
import { t, type Locale, type TranslationKey } from "@/lib/translations";

export type BankConsoleRole =
  | "bank_program_admin"
  | "bank_ops_viewer"
  | "bank_finance";

type ActorProfile = {
  emailLocal: string;
  nameKeys: Record<BankDemoTenantCode, TranslationKey>;
};

const DEFAULT_ROLE: BankConsoleRole = "bank_program_admin";

const ROLE_ALIASES: Record<string, BankConsoleRole> = {
  admin: "bank_program_admin",
  bank_program_admin: "bank_program_admin",
  finance: "bank_finance",
  bank_finance: "bank_finance",
  ops: "bank_ops_viewer",
  viewer: "bank_ops_viewer",
  bank_ops_viewer: "bank_ops_viewer",
};

const ACTOR_PROFILES: Record<BankConsoleRole, ActorProfile> = {
  bank_program_admin: {
    emailLocal: "program-admin",
    nameKeys: {
      ctbc: "session.actor.bank_program_admin.ctbc",
      cathay: "session.actor.bank_program_admin.cathay",
      taishin: "session.actor.bank_program_admin.taishin",
      dbs: "session.actor.bank_program_admin.dbs",
      fubon: "session.actor.bank_program_admin.fubon",
    },
  },
  bank_ops_viewer: {
    emailLocal: "ops-viewer",
    nameKeys: {
      ctbc: "session.actor.bank_ops_viewer.ctbc",
      cathay: "session.actor.bank_ops_viewer.cathay",
      taishin: "session.actor.bank_ops_viewer.taishin",
      dbs: "session.actor.bank_ops_viewer.dbs",
      fubon: "session.actor.bank_ops_viewer.fubon",
    },
  },
  bank_finance: {
    emailLocal: "finance",
    nameKeys: {
      ctbc: "session.actor.bank_finance.ctbc",
      cathay: "session.actor.bank_finance.cathay",
      taishin: "session.actor.bank_finance.taishin",
      dbs: "session.actor.bank_finance.dbs",
      fubon: "session.actor.bank_finance.fubon",
    },
  },
};

export function resolveBankConsoleRole(
  value: string | string[] | null | undefined,
): BankConsoleRole {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) {
    return DEFAULT_ROLE;
  }

  return ROLE_ALIASES[raw] ?? DEFAULT_ROLE;
}

export function toHomeRole(role: BankConsoleRole): HomeRole {
  if (role === "bank_finance") {
    return "finance";
  }
  if (role === "bank_ops_viewer") {
    return "ops";
  }
  return "admin";
}

export function getBankConsoleSession(
  bank: BankDemoTenant,
  locale: Locale,
  rawRole: string | string[] | null | undefined,
) {
  const role = resolveBankConsoleRole(rawRole);
  const profile = ACTOR_PROFILES[role];
  const emailDomain =
    bank.code === "ctbc"
      ? "ctbcbank.com"
      : `${bank.issuerCode.toLowerCase()}.demo`;

  return {
    actorEmail: `${profile.emailLocal}@${emailDomain}`,
    actorName: t(profile.nameKeys[bank.code], locale),
    role,
    roleCode: t(`users.roleCode.${role}`, locale),
    roleLabel: t(`users.role.${role}`, locale),
  };
}

export function bankConsoleQuery(
  bank: BankDemoTenant,
  locale: Locale,
  role: BankConsoleRole,
  extra?: Record<string, string | undefined>,
) {
  const params = new URLSearchParams({ bank: bank.code, locale, role });

  for (const [key, value] of Object.entries(extra ?? {})) {
    if (value) {
      params.set(key, value);
    }
  }

  return params;
}

export function bankConsoleHref(
  path: string,
  bank: BankDemoTenant,
  locale: Locale,
  role: BankConsoleRole,
  extra?: Record<string, string | undefined>,
) {
  const query = bankConsoleQuery(bank, locale, role, extra).toString();
  return `${path}?${query}`;
}
