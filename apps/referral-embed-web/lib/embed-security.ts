export type EmbedSecurityDecision = {
  allowedEntryHosts: string[];
  allowedPostMessageOrigins: string[];
  contentSecurityPolicy: string;
  requestedEntryHost: string | null;
  sourceOrigin: string | null;
  block: boolean;
  blockReason: string | null;
  xFrameOptions: "DENY" | null;
};

const ENTRY_HOST_QUERY_PARAM = "entryHost";
const ENTRY_HOST_HEADER = "x-drts-entry-host";
const ORIGIN_HEADER = "origin";
const REFERER_HEADER = "referer";
const LOCALHOST_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function parseAllowedEntryHosts(rawValue: string | undefined): string[] {
  if (!rawValue) {
    return [];
  }

  const hosts = rawValue
    .split(/[,\n\s]+/)
    .map((value) => normalizeHost(value))
    .filter((value): value is string => value !== null);

  return Array.from(new Set(hosts));
}

export function normalizeHost(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  try {
    const url = trimmed.includes("://")
      ? new URL(trimmed)
      : new URL(`https://${trimmed}`);

    if (!url.host || url.pathname !== "/" || url.search || url.hash) {
      return null;
    }

    return url.host.toLowerCase();
  } catch {
    return null;
  }
}

export function hostToOrigins(host: string): string[] {
  const normalized = normalizeHost(host);

  if (!normalized) {
    return [];
  }

  const hostname = normalized.replace(/:\d+$/, "");

  if (LOCALHOST_HOSTS.has(hostname)) {
    return [`http://${normalized}`, `https://${normalized}`];
  }

  return [`https://${normalized}`];
}

export function extractSourceOrigin(headers: Headers): string | null {
  const originHeader = headers.get(ORIGIN_HEADER);
  const refererHeader = headers.get(REFERER_HEADER);

  if (originHeader) {
    return normalizeOrigin(originHeader);
  }

  if (refererHeader) {
    return normalizeOrigin(refererHeader);
  }

  return null;
}

export function extractRequestedEntryHost(
  requestUrl: URL,
  headers: Headers,
): string | null {
  return normalizeHost(
    requestUrl.searchParams.get(ENTRY_HOST_QUERY_PARAM) ??
      headers.get(ENTRY_HOST_HEADER),
  );
}

export function buildEmbedSecurityDecision(input: {
  allowedEntryHostsEnv: string | undefined;
  headers: Headers;
  requestUrl: URL;
}): EmbedSecurityDecision {
  const allowedEntryHosts = parseAllowedEntryHosts(input.allowedEntryHostsEnv);
  const requestedEntryHost = extractRequestedEntryHost(
    input.requestUrl,
    input.headers,
  );
  const sourceOrigin = extractSourceOrigin(input.headers);
  const scopedEntryHosts = requestedEntryHost
    ? [requestedEntryHost]
    : allowedEntryHosts;
  const allowedPostMessageOrigins = Array.from(
    new Set(scopedEntryHosts.flatMap((host) => hostToOrigins(host))),
  );

  if (allowedEntryHosts.length === 0) {
    return buildBlockedDecision({
      allowedEntryHosts,
      blockReason: "embed_allowlist_missing",
      requestedEntryHost,
      sourceOrigin,
    });
  }

  if (requestedEntryHost && !allowedEntryHosts.includes(requestedEntryHost)) {
    return buildBlockedDecision({
      allowedEntryHosts,
      blockReason: "entry_host_not_authorized",
      requestedEntryHost,
      sourceOrigin,
    });
  }

  if (sourceOrigin && !allowedPostMessageOrigins.includes(sourceOrigin)) {
    return buildBlockedDecision({
      allowedEntryHosts,
      blockReason: "origin_not_authorized",
      requestedEntryHost,
      sourceOrigin,
    });
  }

  return {
    allowedEntryHosts,
    allowedPostMessageOrigins,
    contentSecurityPolicy: buildContentSecurityPolicy(
      allowedPostMessageOrigins,
    ),
    requestedEntryHost,
    sourceOrigin,
    block: false,
    blockReason: null,
    xFrameOptions: null,
  };
}

export function applyEmbedSecurityHeaders(
  headers: Headers,
  decision: EmbedSecurityDecision,
) {
  headers.set("Content-Security-Policy", decision.contentSecurityPolicy);
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set(
    "X-DRTS-PostMessage-Allowed-Origins",
    decision.allowedPostMessageOrigins.join(","),
  );
  headers.set("X-DRTS-Embed-Decision", decision.block ? "blocked" : "allowed");

  if (decision.blockReason) {
    headers.set("X-DRTS-Embed-Block-Reason", decision.blockReason);
  } else {
    headers.delete("X-DRTS-Embed-Block-Reason");
  }

  if (decision.xFrameOptions) {
    headers.set("X-Frame-Options", decision.xFrameOptions);
  } else {
    headers.delete("X-Frame-Options");
  }

  appendVary(headers, "Origin");
  appendVary(headers, "Referer");
  appendVary(headers, "X-DRTS-Entry-Host");
}

function buildBlockedDecision(input: {
  allowedEntryHosts: string[];
  blockReason: string;
  requestedEntryHost: string | null;
  sourceOrigin: string | null;
}): EmbedSecurityDecision {
  return {
    allowedEntryHosts: input.allowedEntryHosts,
    allowedPostMessageOrigins: [],
    contentSecurityPolicy: buildContentSecurityPolicy([]),
    requestedEntryHost: input.requestedEntryHost,
    sourceOrigin: input.sourceOrigin,
    block: true,
    blockReason: input.blockReason,
    xFrameOptions: "DENY",
  };
}

function buildContentSecurityPolicy(allowedOrigins: string[]): string {
  const frameAncestors =
    allowedOrigins.length > 0 ? allowedOrigins.join(" ") : "'none'";

  return [
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    `frame-ancestors ${frameAncestors}`,
  ].join("; ");
}

function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    return url.origin.toLowerCase();
  } catch {
    return null;
  }
}

function appendVary(headers: Headers, value: string) {
  const current = headers.get("Vary");

  if (!current) {
    headers.set("Vary", value);
    return;
  }

  const existingValues = current
    .split(",")
    .map((entry) => entry.trim().toLowerCase());

  if (!existingValues.includes(value.toLowerCase())) {
    headers.set("Vary", `${current}, ${value}`);
  }
}
