import { headers } from "next/headers";
import type { PartnerChannelEntryRecord } from "@drts/contracts";
import type { ReferralEmbedSession } from "@drts/contracts";
import {
  buildEmbedSecurityDecision,
  type EmbedSecurityDecision,
} from "./embed-security";
import { getReferralEmbedSession } from "./embed-partner-session";
import { resolveAccent } from "./embed-presentation";
import { getPartnerEntry } from "./embed-api";
import {
  EMBED_TRIP_FALLBACK_SCREENS,
  type EmbedTripFallbackScreen,
} from "./embed-fixtures";

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
  | "degraded"
  | EmbedTripFallbackScreen;

export type EmbedContext = {
  entry: PartnerChannelEntryRecord;
  session: ReferralEmbedSession | null;
  state: EmbedState;
  screen: EmbedScreen;
  decision: EmbedSecurityDecision;
  accent: string;
  strings: {
    appName: string;
    displayName: string;
    supportPhone: string;
  };
  issues: string[];
};

function resolveDisplayName(entry: PartnerChannelEntryRecord) {
  return entry.brandingMetadata?.displayName?.trim() || entry.displayName;
}

function resolveAppName(entry: PartnerChannelEntryRecord) {
  return `${resolveDisplayName(entry)} App`;
}

function resolveSupportPhone(entry: PartnerChannelEntryRecord) {
  return entry.brandingMetadata?.supportPhone?.trim() || "0800-911-200";
}

function toEmbedState(
  requested: string | undefined,
  decision: EmbedSecurityDecision,
  session: ReferralEmbedSession | null,
  issues: string[],
  demo: boolean,
): EmbedState {
  if (requested === "reauth") return "reauth";
  if (requested === "consent") return "consent";
  if (requested === "fallback") return "fallback";
  if (requested === "unsupported") return "unsupported";
  if (decision.block) return "unsupported";
  if (issues.some((issue) => issue.startsWith("reauth:"))) return "reauth";
  if (session && !session.identityActive) return "consent";
  if (session && requested === "handoff") return "handoff";
  if (session && requested === "book") return "handoff";
  if (session) return "handoff";
  // Demo mode (dev): no property-app backend issues a real hand-off token, so
  // a direct open would always drop to the fallback-to-web screen — which is
  // wrong here (there is no standalone passenger site). Land on the hand-off
  // ride flow with demo identity instead, so the embed is reviewable directly.
  if (demo) return "handoff";
  return "fallback";
}

function toEmbedScreen(value: string | undefined): EmbedScreen {
  if (
    value &&
    (EMBED_TRIP_FALLBACK_SCREENS as readonly string[]).includes(value)
  ) {
    return value as EmbedTripFallbackScreen;
  }

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
}): Promise<EmbedContext> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") || "localhost:3005";
  const url = new URL(`https://${host}/embed/${input.entrySlug}`);

  if (input.entryHost) {
    url.searchParams.set("entryHost", input.entryHost);
  }

  const decision = buildEmbedSecurityDecision({
    allowedEntryHostsEnv: process.env.REFERRAL_EMBED_ALLOWED_HOSTS,
    headers: new Headers(requestHeaders),
    requestUrl: url,
  });

  const entry = await getPartnerEntry(input.entrySlug);
  const issues: string[] = [];
  let session = await getReferralEmbedSession();

  if (session) {
    if (session.partnerEntrySlug !== input.entrySlug) {
      issues.push("reauth:cross_entry_session");
      session = null;
    } else if (
      decision.requestedEntryHost &&
      session.entryHost !== decision.requestedEntryHost
    ) {
      issues.push("reauth:entry_host_session_mismatch");
      session = null;
    }
  }

  if (!decision.block && !session) {
    issues.push("fallback:missing_embed_session");
  }

  const demoMode = process.env.REFERRAL_EMBED_DEMO === "true";
  const state = toEmbedState(input.state, decision, session, issues, demoMode);

  return {
    entry,
    session,
    state,
    screen: toEmbedScreen(input.screen),
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
