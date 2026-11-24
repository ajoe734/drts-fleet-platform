export const NATIVE_PASSENGER_OAUTH_CALLBACK_URI =
  "drtspassenger://auth/callback";
export const NATIVE_PASSENGER_OAUTH_STATE_PREFIX = "drtspassenger.";
const SUPPORTED_NATIVE_PASSENGER_OAUTH_CALLBACK_PATTERN =
  /^drtspassenger:\/\/(?:auth|oauth)(?:\/callback)?$/;
const NATIVE_STATE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,}$/;

export function isSupportedNativePassengerOAuthCallbackUri(
  callbackUri: string | null | undefined,
): callbackUri is string {
  return (
    typeof callbackUri === "string" &&
    SUPPORTED_NATIVE_PASSENGER_OAUTH_CALLBACK_PATTERN.test(callbackUri)
  );
}

function encodeBase64UrlAscii(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeBase64UrlAscii(encoded: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/.test(encoded) || encoded.length % 4 === 1) {
    return null;
  }
  const padded =
    encoded.replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat((4 - (encoded.length % 4)) % 4);
  try {
    const decoded = atob(padded);
    return encodeBase64UrlAscii(decoded) === encoded ? decoded : null;
  } catch {
    return null;
  }
}

export function resolveNativePassengerOAuthCallbackUriFromState(
  state: string | null | undefined,
): string | null {
  if (
    typeof state !== "string" ||
    !state.startsWith(NATIVE_PASSENGER_OAUTH_STATE_PREFIX)
  ) {
    return null;
  }
  const parts = state.split(".");
  if (parts.length === 2) {
    return NATIVE_STATE_TOKEN_PATTERN.test(parts[1] ?? "")
      ? NATIVE_PASSENGER_OAUTH_CALLBACK_URI
      : null;
  }
  if (parts.length === 3) {
    const [, encodedCallbackUri, token] = parts;
    if (!encodedCallbackUri || !NATIVE_STATE_TOKEN_PATTERN.test(token ?? "")) {
      return null;
    }
    const decodedCallbackUri = decodeBase64UrlAscii(encodedCallbackUri);
    return isSupportedNativePassengerOAuthCallbackUri(decodedCallbackUri)
      ? decodedCallbackUri
      : null;
  }
  return null;
}

export function isNativePassengerOAuthState(
  state: string | null | undefined,
): state is string {
  return resolveNativePassengerOAuthCallbackUriFromState(state) !== null;
}

export function buildNativePassengerOAuthReturnUrl(
  provider: string | string[] | undefined,
  search: { get(name: string): string | null },
): string | null {
  if (provider !== "google") return null;
  const state = search.get("state");
  const callbackUri = resolveNativePassengerOAuthCallbackUriFromState(state);
  if (!state || !callbackUri) return null;
  const code = search.get("code")?.trim() ?? "";
  const error = search.get("error")?.trim() ?? "";
  const params = new URLSearchParams();
  if (error) {
    params.set("error", error);
  } else if (code) {
    params.set("code", code);
  } else {
    params.set("error", "invalid_grant");
  }
  params.set("state", state);
  return `${callbackUri}?${params.toString()}`;
}

export function redirectToNativePassengerApp(url: string) {
  const [base, query] = url.split("?", 2);
  if (!base || !query || !isSupportedNativePassengerOAuthCallbackUri(base)) {
    throw new Error("Invalid native passenger OAuth callback redirect");
  }
  if (
    typeof window !== "undefined" &&
    typeof window.location?.assign === "function"
  ) {
    try {
      window.location.assign(url);
    } catch {
      /* Fallback anchor remains interactive when custom-scheme assign is blocked. */
    }
  }
}
