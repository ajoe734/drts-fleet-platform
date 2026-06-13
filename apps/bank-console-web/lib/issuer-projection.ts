import type { BankDemoTenant } from "@/lib/demo-tenants";
import type { Locale } from "@/lib/translations";

export function projectIssuerText(
  value: string,
  tenant: BankDemoTenant | undefined,
  locale: Locale = "zh",
) {
  if (!tenant || tenant.code === "ctbc") {
    return value;
  }

  const issuerCode = tenant.issuerCode;
  const issuerLower = issuerCode.toLowerCase();
  const shortName = tenant.shortName[locale];
  const fullName = tenant.name[locale];

  return value
    .replaceAll("中信銀行", fullName)
    .replaceAll("中信", shortName)
    .replaceAll("CTBC", issuerCode)
    .replaceAll("ctbc", issuerLower)
    .replaceAll("CTB", issuerCode);
}

export function bankScopedHref(
  href: string,
  tenant: BankDemoTenant,
  locale: Locale = "zh",
) {
  const [path, query = ""] = href.split("?");
  const params = new URLSearchParams(query);
  params.set("bank", tenant.code);
  params.set("locale", locale);

  return `${path}?${params.toString()}`;
}
