import { headers } from "next/headers";
import type { PartnerChannelEntryRecord } from "@drts/contracts";
import type { PartnerIngressHandoffSession } from "@drts/contracts";
import { REALM_COLORS, STATUS_TONES, SURFACE_ACCENTS } from "@drts/ui-tokens";
import {
  buildEmbedSecurityDecision,
  type EmbedSecurityDecision,
} from "./embed-security";
import {
  getPartnerEntry,
  isEmbedAuthorityError,
  issuePartnerIngressHandoff,
} from "./embed-api";

export type EmbedState =
  | "handoff"
  | "reauth"
  | "unsupported"
  | "consent"
  | "fallback";

export type EmbedScreen =
  | "book"
  | "trip"
  | "trips"
  | "receipt"
  | "completed"
  | "cancelled"
  | "nosupply"
  | "ineligible"
  | "denied"
  | "degraded";

export type EmbedContext = {
  entry: PartnerChannelEntryRecord;
  session: PartnerIngressHandoffSession | null;
  state: EmbedState;
  screen: EmbedScreen;
  handoff: {
    apiKey: string | null;
    partnerUserRef: string | null;
  };
  decision: EmbedSecurityDecision;
  accent: string;
  strings: {
    appName: string;
    displayName: string;
    supportPhone: string;
  };
  issues: string[];
};

const defaultEntryHost = "unknown-host";

function resolveAccent(entry: PartnerChannelEntryRecord) {
  return (
    entry.themeAccent?.trim() ||
    entry.brandingMetadata?.themeAccent?.trim() ||
    SURFACE_ACCENTS.tenant.light.fg
  );
}

function resolveDisplayName(entry: PartnerChannelEntryRecord) {
  return entry.brandingMetadata?.displayName?.trim() || entry.displayName;
}

function resolveAppName(entry: PartnerChannelEntryRecord) {
  const displayName = resolveDisplayName(entry);
  return displayName.endsWith("社區")
    ? `${displayName} App`
    : `${displayName}生活`;
}

function resolveSupportPhone(entry: PartnerChannelEntryRecord) {
  return entry.brandingMetadata?.supportPhone?.trim() || "0800-911-200";
}

function toEmbedState(
  requested: string | undefined,
  decision: EmbedSecurityDecision,
  session: PartnerIngressHandoffSession | null,
  issues: string[],
): EmbedState {
  if (requested === "reauth") return "reauth";
  if (requested === "consent") return "consent";
  if (requested === "fallback") return "fallback";
  if (requested === "unsupported") return "unsupported";
  if (decision.block) return "unsupported";
  if (issues.some((issue) => issue.startsWith("reauth:"))) return "reauth";
  if (session && requested === "handoff") return "handoff";
  if (session && requested === "book") return "handoff";
  if (session) return "handoff";
  return "fallback";
}

function toEmbedScreen(value: string | undefined): EmbedScreen {
  switch (value) {
    case "trip":
    case "trips":
    case "receipt":
    case "completed":
    case "cancelled":
    case "nosupply":
    case "ineligible":
    case "denied":
    case "degraded":
      return value;
    default:
      return "book";
  }
}

export async function resolveEmbedContext(input: {
  entrySlug: string;
  state?: string;
  screen?: string;
  entryHost?: string;
  apiKey?: string;
  partnerUserRef?: string;
}): Promise<EmbedContext> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") || "localhost:3005";
  const url = new URL(`https://${host}/embed/${input.entrySlug}`);

  if (input.entryHost) {
    url.searchParams.set("entryHost", input.entryHost);
  }

  const decision = buildEmbedSecurityDecision({
    allowedEntryHostsEnv: process.env.PASSENGER_WEB_EMBED_ALLOWED_HOSTS,
    headers: new Headers(requestHeaders),
    requestUrl: url,
  });

  const entry = await getPartnerEntry(input.entrySlug);
  const issues: string[] = [];
  let session: PartnerIngressHandoffSession | null = null;

  if (!decision.block && input.apiKey && input.partnerUserRef) {
    try {
      session = await issuePartnerIngressHandoff({
        entrySlug: input.entrySlug,
        apiKey: input.apiKey,
        partnerUserRef: input.partnerUserRef,
        consentScope: "passenger_identity_link",
      });
    } catch (error) {
      if (isEmbedAuthorityError(error)) {
        if (
          error.status === 401 ||
          error.status === 403 ||
          error.code === "PARTNER_USER_IDENTITY_REVOKED"
        ) {
          issues.push(`reauth:${error.code}`);
        } else {
          issues.push(`fallback:${error.code}`);
        }
      } else {
        issues.push("fallback:unknown");
      }
    }
  } else if (!decision.block) {
    issues.push("fallback:missing_handoff_credentials");
  }

  const state = toEmbedState(input.state, decision, session, issues);

  return {
    entry,
    session,
    state,
    screen: toEmbedScreen(input.screen),
    handoff: {
      apiKey: input.apiKey ?? null,
      partnerUserRef: input.partnerUserRef ?? null,
    },
    decision,
    accent: resolveAccent(entry),
    strings: {
      appName: resolveAppName(entry),
      displayName: resolveDisplayName(entry),
      supportPhone: resolveSupportPhone(entry),
    },
    issues,
  };
}

export function buildEmbedTheme(accent: string) {
  return {
    accent,
    accentHi: accent,
    accentSoft: `${accent}22`,
    tenantFg: REALM_COLORS.tenant.light.fg,
    tenantBg: REALM_COLORS.tenant.light.bg,
    tenantBorder: REALM_COLORS.tenant.light.border,
    infoFg: STATUS_TONES.info.light.fg,
    infoBg: STATUS_TONES.info.light.bg,
    infoBorder: STATUS_TONES.info.light.border,
    warnFg: STATUS_TONES.warning.light.fg,
    warnBg: STATUS_TONES.warning.light.bg,
    warnBorder: STATUS_TONES.warning.light.border,
    dangerFg: STATUS_TONES.danger.light.fg,
    dangerBg: STATUS_TONES.danger.light.bg,
    dangerBorder: STATUS_TONES.danger.light.border,
    successFg: STATUS_TONES.success.light.fg,
    successBg: STATUS_TONES.success.light.bg,
    successBorder: STATUS_TONES.success.light.border,
    neutralFg: STATUS_TONES.neutral.light.fg,
    neutralBg: STATUS_TONES.neutral.light.bg,
    neutralBorder: STATUS_TONES.neutral.light.border,
  };
}

export function getEntryHost(entry: PartnerChannelEntryRecord) {
  return entry.entryHost?.trim() || defaultEntryHost;
}
