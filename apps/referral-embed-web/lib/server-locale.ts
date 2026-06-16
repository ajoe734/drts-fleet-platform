import { cookies } from "next/headers";
import { PASSENGER_LOCALE_COOKIE } from "./locale-config";
import { type Locale, translations } from "./translations";

export async function getServerLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const value = cookieStore.get(PASSENGER_LOCALE_COOKIE)?.value;
  return value && value in translations ? (value as Locale) : "zh";
}
