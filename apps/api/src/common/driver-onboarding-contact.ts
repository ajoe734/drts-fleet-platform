const TAIWAN_LOCAL_MOBILE = /^09[0-9]{8}$/;
const TAIWAN_INTERNATIONAL_MOBILE = /^\+8869[0-9]{8}$/;
const EMAIL_LOCAL_PART =
  /^[A-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Z0-9!#$%&'*+/=?^_`{|}~-]+)*$/i;
const EMAIL_DOMAIN =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

export function normalizeDriverOnboardingMobile(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const mobile = value.trim().replace(/[ -]/g, "");
  if (TAIWAN_LOCAL_MOBILE.test(mobile)) return `+886${mobile.slice(1)}`;
  return TAIWAN_INTERNATIONAL_MOBILE.test(mobile) ? mobile : null;
}

export function normalizeDriverOnboardingEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim();
  const [local, domain, ...rest] = email.split("@");
  if (
    !local ||
    !domain ||
    rest.length ||
    email.length > 254 ||
    local.length > 64 ||
    !EMAIL_LOCAL_PART.test(local) ||
    !EMAIL_DOMAIN.test(domain)
  ) {
    return null;
  }
  return `${local}@${domain.toLowerCase()}`;
}
