const ACTIVATION_URL = "https://api.smarttransport.tw/driver-activate";
const ACTIVATION_ROUTE = "/driver-activate";

let pendingToken: string | null = null;
const listeners = new Set<() => void>();

export function routeDriverActivationLink(path: string): string {
  if (
    path !== ACTIVATION_URL &&
    !path.startsWith(ACTIVATION_URL + "#") &&
    !path.startsWith(ACTIVATION_URL + "?")
  ) {
    return path;
  }

  // Only the exact verified HTTPS URL can carry a proof. Keep it out of
  // router state and discard it from memory as soon as redemption starts.
  const fragment = path.slice(ACTIVATION_URL.length);
  pendingToken = /^#token=([A-Za-z0-9_-]{32,128})$/.exec(fragment)?.[1] ?? null;
  for (const listener of listeners) {
    listener();
  }

  return ACTIVATION_ROUTE;
}

export function takeDriverActivationToken(): string | null {
  const token = pendingToken;
  pendingToken = null;
  return token;
}

export function subscribeToDriverActivation(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
