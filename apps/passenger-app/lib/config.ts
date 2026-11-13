export type NativePassengerBootstrapConfig =
  | { mode: "demo" }
  | {
      mode: "configured";
      baseUrl: string;
      callbackUri: string;
      notificationConsentVersion?: string;
    };
export interface NativePassengerBootstrapEnvironment {
  mode: string | undefined;
  apiBaseUrl: string | undefined;
  callbackUri: string | undefined;
  notificationConsentVersion?: string | undefined;
}

/** Public Expo values only; no inferred cloud hostname, credential or demo fallback. */
export function readNativePassengerBootstrapConfig(
  environment: NativePassengerBootstrapEnvironment = {
    mode: process.env.EXPO_PUBLIC_PASSENGER_MODE,
    apiBaseUrl: process.env.EXPO_PUBLIC_PASSENGER_API_BASE_URL,
    callbackUri: process.env.EXPO_PUBLIC_PASSENGER_OAUTH_CALLBACK_URI,
    notificationConsentVersion:
      process.env.EXPO_PUBLIC_PASSENGER_NOTIFICATION_CONSENT_VERSION,
  },
): NativePassengerBootstrapConfig {
  if (environment.mode === "demo") return { mode: "demo" };
  if (environment.mode !== "configured")
    throw new Error("passenger_mode_unconfigured");
  const baseUrl = environment.apiBaseUrl?.trim();
  const callbackUri = environment.callbackUri?.trim();
  if (!baseUrl || !callbackUri)
    throw new Error("passenger_connection_unconfigured");
  const notificationConsentVersion =
    environment.notificationConsentVersion?.trim();
  return {
    mode: "configured",
    baseUrl,
    callbackUri,
    ...(notificationConsentVersion ? { notificationConsentVersion } : {}),
  };
}
