import { ApiRequestError } from "./api-envelope";

export const PUBLIC_TENANT_AUTH_ERROR_CODE = "AUTH_SESSION_EXCHANGE_DENIED";
export const PUBLIC_PARTNER_AUTH_ERROR_CODE = "AUTH_CREDENTIALS_INVALID";

export function toPublicTenantAuthError(error: unknown) {
  if (!(error instanceof ApiRequestError)) {
    return error;
  }

  return new ApiRequestError(
    403,
    PUBLIC_TENANT_AUTH_ERROR_CODE,
    "The authentication proof could not be matched to an active session exchange.",
    undefined,
  );
}

export function toPublicPartnerAuthError(error: unknown) {
  if (!(error instanceof ApiRequestError)) {
    return error;
  }

  return new ApiRequestError(
    401,
    PUBLIC_PARTNER_AUTH_ERROR_CODE,
    "The supplied authentication credentials are invalid for this exchange.",
    undefined,
  );
}
