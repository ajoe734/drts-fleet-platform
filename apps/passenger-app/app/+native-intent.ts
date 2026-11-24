export const NATIVE_PASSENGER_PAYMENT_RETURN_URI =
  "drtspassenger://payment-methods/return";

/** AuthSession consumes its own original Linking event; keep that return out of page routing. */
export function redirectSystemPath({
  path,
  initial,
}: {
  path: string;
  initial: boolean;
}): string {
  if (process.env.EXPO_PUBLIC_PASSENGER_MODE !== "configured") return path;

  const returnedPath = path.split(/[?#]/, 1)[0];
  // The OS may have ended the app during the card check, so the link can also
  // start it. There is no such page in the app; open it normally.
  if (returnedPath === NATIVE_PASSENGER_PAYMENT_RETURN_URI)
    return initial ? "/" : "";

  const callbackUri =
    process.env.EXPO_PUBLIC_PASSENGER_OAUTH_CALLBACK_URI?.trim();
  if (initial || !callbackUri) return path;

  const callbackPath = callbackUri.split(/[?#]/, 1)[0];
  return returnedPath === callbackPath ? "" : path;
}
