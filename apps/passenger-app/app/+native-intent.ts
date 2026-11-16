/** AuthSession consumes its own original Linking event; keep that return out of page routing. */
export function redirectSystemPath({
  path,
  initial,
}: {
  path: string;
  initial: boolean;
}): string {
  const callbackUri =
    process.env.EXPO_PUBLIC_PASSENGER_OAUTH_CALLBACK_URI?.trim();
  if (
    initial ||
    process.env.EXPO_PUBLIC_PASSENGER_MODE !== "configured" ||
    !callbackUri
  )
    return path;

  const callbackPath = callbackUri.split(/[?#]/, 1)[0];
  const returnedPath = path.split(/[?#]/, 1)[0];
  return returnedPath === callbackPath ? "" : path;
}
