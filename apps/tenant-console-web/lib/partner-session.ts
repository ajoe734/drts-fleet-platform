import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type {
  CreatePartnerBootstrapSessionCommand,
  IdentityContext,
  PartnerBootstrapSession,
  PartnerChannelEntryRecord,
} from "@drts/contracts";
import {
  type ApiClient,
  createBearerClient,
  createPublicClient,
} from "@drts/api-client";
import { API_URL } from "@/lib/api-client";

export const PARTNER_LOGIN_PATH = "/partner/login";
export const PARTNER_START_PATH = "/partner/start";

const PARTNER_SESSION_COOKIE = "drts_partner_session_v1";
const DEFAULT_SESSION_TTL_SECONDS = 8 * 60 * 60;

export type PartnerSessionRecord = {
  accessToken: string;
  expiresIn: string;
  expiresAt: string;
  partnerEntry: PartnerChannelEntryRecord;
  identity: IdentityContext;
};

function parseExpiresInToSeconds(expiresIn: string): number {
  const numeric = Number.parseInt(expiresIn, 10);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric;
  }

  const isoDuration = expiresIn.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (isoDuration) {
    const hours = Number.parseInt(isoDuration[1] ?? "0", 10);
    const minutes = Number.parseInt(isoDuration[2] ?? "0", 10);
    const seconds = Number.parseInt(isoDuration[3] ?? "0", 10);
    const total = hours * 3600 + minutes * 60 + seconds;
    if (total > 0) {
      return total;
    }
  }

  return DEFAULT_SESSION_TTL_SECONDS;
}

function encodeSession(session: PartnerSessionRecord): string {
  return Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
}

function decodeSession(value: string): PartnerSessionRecord | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<PartnerSessionRecord>;
    if (
      !parsed.accessToken ||
      !parsed.expiresAt ||
      !parsed.partnerEntry ||
      !parsed.identity
    ) {
      return null;
    }
    if (new Date(parsed.expiresAt).getTime() <= Date.now()) {
      return null;
    }
    return parsed as PartnerSessionRecord;
  } catch {
    return null;
  }
}

export async function getPartnerSession(): Promise<PartnerSessionRecord | null> {
  const cookieStore = await cookies();
  const encoded = cookieStore.get(PARTNER_SESSION_COOKIE)?.value;
  if (!encoded) {
    return null;
  }
  return decodeSession(encoded);
}

export async function requirePartnerSession(): Promise<PartnerSessionRecord> {
  const session = await getPartnerSession();
  if (!session) {
    redirect(PARTNER_LOGIN_PATH);
  }
  return session;
}

export function buildPartnerClient(session: PartnerSessionRecord): ApiClient {
  const headers: Record<string, string> = { "x-realm": "partner" };
  if (session.identity.tenantId) {
    headers["x-tenant-id"] = session.identity.tenantId;
  }
  return createBearerClient(API_URL, session.accessToken, headers);
}

export async function createPartnerSession(
  command: CreatePartnerBootstrapSessionCommand,
): Promise<PartnerBootstrapSession> {
  const publicClient = createPublicClient(API_URL);
  const session = await publicClient.createPartnerBootstrapSession(command);
  const ttlSeconds = parseExpiresInToSeconds(session.expiresIn);
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

  const record: PartnerSessionRecord = {
    accessToken: session.accessToken,
    expiresIn: session.expiresIn,
    expiresAt,
    partnerEntry: session.partnerEntry,
    identity: session.identity,
  };

  const cookieStore = await cookies();
  cookieStore.set(PARTNER_SESSION_COOKIE, encodeSession(record), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ttlSeconds,
  });

  return session;
}

export async function clearPartnerSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(PARTNER_SESSION_COOKIE);
}
