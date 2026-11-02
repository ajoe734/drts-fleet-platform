import { cookies } from "next/headers";
import { AGENCY_LOCALE_COOKIE } from "./locale-config";
import { type Locale, normalizeLocale } from "./translations";

export function resolveServerLocaleFromCookieValue(
  rawValue: string | undefined | null,
): Locale {
  return normalizeLocale(rawValue);
}

export async function getServerLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const value = cookieStore.get(AGENCY_LOCALE_COOKIE)?.value;
  return resolveServerLocaleFromCookieValue(value);
}
