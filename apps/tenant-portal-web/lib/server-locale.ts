import { cookies } from "next/headers";
import { type Locale, translations } from "./translations";
import { TENANT_LOCALE_COOKIE } from "./locale-config";

export async function getServerLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const value = cookieStore.get(TENANT_LOCALE_COOKIE)?.value;
  return value && value in translations ? (value as Locale) : "zh";
}
