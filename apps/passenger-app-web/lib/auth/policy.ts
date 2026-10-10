import type { ConsentPolicy } from "../../../../packages/passenger-client/src/auth/state";

function contentUrl(value: string | undefined) {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "https:" && !url.username && !url.password
      ? url.toString()
      : "";
  } catch {
    return "";
  }
}
export function consentPolicy(): ConsentPolicy {
  return {
    termsVersion: process.env.NEXT_PUBLIC_PASSENGER_TERMS_VERSION?.trim() ?? "",
    privacyVersion:
      process.env.NEXT_PUBLIC_PASSENGER_PRIVACY_VERSION?.trim() ?? "",
    termsUrl: contentUrl(process.env.NEXT_PUBLIC_TERMS_URL),
    privacyUrl: contentUrl(process.env.NEXT_PUBLIC_PRIVACY_URL),
  };
}
