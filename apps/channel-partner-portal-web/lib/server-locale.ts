import { cookies } from "next/headers";
import { type Locale, translations } from "./translations";

export async function getServerLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const value = cookieStore.get("drts-locale-v2")?.value;
  return value && value in translations ? (value as Locale) : "zh";
}
