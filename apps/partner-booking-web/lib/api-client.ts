import { createHash } from "node:crypto";

import { createBearerClient, type ApiClient } from "@drts/api-client";
import type {
  ApiSuccessEnvelope,
  BookingRecord,
  CreatePartnerBootstrapSessionCommand,
  CreateTenantBookingCommand,
  IdentityContext,
  OwnedOrderRecord,
  PartnerEntryBrandingMetadata,
  PartnerRecordAuditMetadata,
  PartnerBootstrapSession,
  PartnerChannelEntryRecord,
  PartnerEligibilityVerificationRecord,
  VerifyPartnerEligibilityCommand,
} from "@drts/contracts";
import {
  BRAND_TEMPLATES,
  type PartnerBrandTemplate,
  PARTNER_DEFAULT_THEME,
} from "@drts/ui-tokens";
import { getServerApiBaseUrl } from "./runtime-config";

export const API_URL = getServerApiBaseUrl();

type ApiErrorEnvelope = {
  error?: {
    code?: string;
    message?: string;
    details?: Record<string, unknown>;
    retryable?: boolean;
  };
};

function getServerAuthorityHeaders(): Record<string, string> {
  const internalKey = process.env.DRTS_INTERNAL_KEY?.trim();
  if (!internalKey) {
    return {};
  }

  return {
    "x-drts-internal-key": internalKey,
  };
}

export class PartnerAuthorityError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown> | undefined;
  readonly retryable: boolean;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: Record<string, unknown>,
    retryable = false,
  ) {
    super(message);
    this.name = "PartnerAuthorityError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.retryable = retryable;
  }
}

export type PartnerSessionRecord = {
  accessToken: string;
  expiresIn: string;
  expiresAt?: string;
  partnerEntry: PartnerChannelEntryRecord;
  identity: IdentityContext;
};

export type PartnerRouteProvenance = {
  source: "authority" | "authority_cache" | "local_fallback";
  requestId: string | null;
  timestamp: string | null;
  entryUpdatedAt: string | null;
  auditSource: string | null;
  auditRequestId: string | null;
  fallbackCode: string | null;
  fallbackStatus: number | null;
};

export type PartnerRouteContext = {
  brand: PartnerBrandTemplate;
  entry: PartnerChannelEntryRecord | null;
  inactive: boolean;
  provenance: PartnerRouteProvenance;
};

type PartnerEntryWireRecord = Partial<PartnerChannelEntryRecord> & {
  [key: string]: unknown;
  active_flag?: boolean;
  audit_metadata?: PartnerAuditMetadataWireRecord | null;
  auth_mode?: PartnerChannelEntryRecord["authMode"];
  bank_code?: string | null;
  branding_metadata?: PartnerBrandingMetadataWireRecord | null;
  business_dispatch_subtype?: PartnerChannelEntryRecord["businessDispatchSubtype"];
  created_at?: string;
  eligibility_contract?: PartnerChannelEntryRecord["eligibilityContract"];
  eligibility_mode?: PartnerChannelEntryRecord["eligibilityMode"];
  entry_host?: string | null;
  entry_path?: string | null;
  entry_slug?: string;
  partner_code?: string;
  partner_id?: string;
  partner_type?: string;
  program_code?: string | null;
  program_id?: string;
  revoked_at?: string | null;
  revoked_by?: string | null;
  revoke_reason?: string | null;
  tenant_id?: string;
  theme_accent?: string | null;
  updated_at?: string;
};

type PartnerBrandingMetadataWireRecord =
  Partial<PartnerEntryBrandingMetadata> & {
    display_name?: string;
    support_email?: string | null;
    support_phone?: string | null;
    theme_accent?: string | null;
  };

type PartnerAuditMetadataWireRecord = Partial<PartnerRecordAuditMetadata> & {
  created_by?: string | null;
  request_id?: string | null;
  updated_by?: string | null;
};

type PartnerEntryAuthorityEnvelope = ApiSuccessEnvelope<
  PartnerChannelEntryRecord | PartnerEntryWireRecord
>;

const PARTNER_ENTRY_AUTHORITY_CACHE_TTL_MS = 60_000;
const partnerEntryAuthorityCache = new Map<
  string,
  {
    envelope: PartnerEntryAuthorityEnvelope;
    expiresAt: number;
  }
>();

function getPartnerEntryAuthorityCacheKey(entrySlug: string) {
  const internalKey = process.env.DRTS_INTERNAL_KEY?.trim();
  const internalKeyHash = internalKey
    ? createHash("sha256").update(internalKey).digest("hex").slice(0, 16)
    : "no-internal-key";

  return [API_URL, internalKeyHash, entrySlug.trim().toLowerCase()].join("|");
}

export function clearPartnerEntryAuthorityCacheForTests() {
  partnerEntryAuthorityCache.clear();
}

async function requestPartnerEntryAuthorityEnvelope(
  entrySlug: string,
): Promise<{
  cacheHit: boolean;
  envelope: PartnerEntryAuthorityEnvelope;
}> {
  const cacheKey = getPartnerEntryAuthorityCacheKey(entrySlug);
  const now = Date.now();
  const cached = partnerEntryAuthorityCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return { cacheHit: true, envelope: cached.envelope };
  }

  const envelope = await requestAuthorityEnvelope<
    PartnerChannelEntryRecord | PartnerEntryWireRecord
  >("/api/partner/entries/" + encodeURIComponent(entrySlug));

  partnerEntryAuthorityCache.set(cacheKey, {
    envelope,
    expiresAt: now + PARTNER_ENTRY_AUTHORITY_CACHE_TTL_MS,
  });

  return { cacheHit: false, envelope };
}

function normalizeBrandingMetadata(
  metadata: PartnerBrandingMetadataWireRecord | null | undefined,
): PartnerEntryBrandingMetadata | null {
  if (!metadata) {
    return null;
  }

  return {
    displayName: metadata.displayName ?? metadata.display_name ?? "",
    themeAccent: metadata.themeAccent ?? metadata.theme_accent ?? null,
    supportEmail: metadata.supportEmail ?? metadata.support_email ?? null,
    supportPhone: metadata.supportPhone ?? metadata.support_phone ?? null,
  };
}

function normalizeAuditMetadata(
  metadata: PartnerAuditMetadataWireRecord | null | undefined,
): PartnerRecordAuditMetadata {
  return {
    source: metadata?.source ?? null,
    requestId: metadata?.requestId ?? metadata?.request_id ?? null,
    createdBy: metadata?.createdBy ?? metadata?.created_by ?? null,
    updatedBy: metadata?.updatedBy ?? metadata?.updated_by ?? null,
  };
}

function normalizePartnerEntry(
  entry: PartnerChannelEntryRecord | PartnerEntryWireRecord,
): PartnerChannelEntryRecord {
  const wire = entry as PartnerEntryWireRecord;
  return {
    partnerId: wire.partnerId ?? wire.partner_id ?? "",
    partnerCode: wire.partnerCode ?? wire.partner_code ?? "",
    partnerType: wire.partnerType ?? wire.partner_type ?? "",
    programId: wire.programId ?? wire.program_id ?? "",
    programCode: wire.programCode ?? wire.program_code ?? null,
    tenantId: wire.tenantId ?? wire.tenant_id ?? "",
    bankCode: wire.bankCode ?? wire.bank_code ?? null,
    entrySlug: wire.entrySlug ?? wire.entry_slug ?? "",
    displayName: wire.displayName ?? wire.display_name ?? "",
    businessDispatchSubtype:
      wire.businessDispatchSubtype ?? wire.business_dispatch_subtype,
    authMode: wire.authMode ?? wire.auth_mode,
    eligibilityMode: wire.eligibilityMode ?? wire.eligibility_mode,
    entryHost: wire.entryHost ?? wire.entry_host ?? null,
    entryPath: wire.entryPath ?? wire.entry_path ?? null,
    themeAccent: wire.themeAccent ?? wire.theme_accent ?? null,
    brandingMetadata: normalizeBrandingMetadata(
      wire.brandingMetadata ?? wire.branding_metadata,
    ),
    eligibilityContract:
      wire.eligibilityContract ?? wire.eligibility_contract ?? null,
    status: wire.status ?? "inactive",
    activeFlag: wire.activeFlag ?? wire.active_flag ?? false,
    revokedAt: wire.revokedAt ?? wire.revoked_at ?? null,
    revokedBy: wire.revokedBy ?? wire.revoked_by ?? null,
    revokeReason: wire.revokeReason ?? wire.revoke_reason ?? null,
    createdAt: wire.createdAt ?? wire.created_at ?? "",
    updatedAt: wire.updatedAt ?? wire.updated_at ?? "",
    auditMetadata: normalizeAuditMetadata(
      wire.auditMetadata ?? wire.audit_metadata,
    ),
  } as PartnerChannelEntryRecord;
}

function canUseLocalPartnerShellFallback(
  error: PartnerAuthorityError,
  options?: {
    allowInactive?: boolean;
    allowMissing?: boolean;
  },
) {
  const publicShellFallbackAllowed =
    options?.allowInactive || options?.allowMissing;

  if (error.code === "PARTNER_ENTRY_INACTIVE") {
    return options?.allowInactive;
  }

  if (error.code === "PARTNER_ENTRY_NOT_FOUND") {
    return publicShellFallbackAllowed;
  }

  if (
    publicShellFallbackAllowed &&
    (error.retryable ||
      error.status >= 500 ||
      error.code === "PARTNER_AUTHORITY_REQUEST_FAILED")
  ) {
    return true;
  }

  return (
    (error.code === "INTERNAL_KEY_REQUIRED" ||
      error.code === "INTERNAL_KEY_INVALID" ||
      error.code === "PARTNER_AUTHORITY_UNAVAILABLE") &&
    publicShellFallbackAllowed
  );
}

function buildPartnerHeaders(
  session: PartnerSessionRecord,
): Record<string, string> {
  return {
    Authorization: `Bearer ${session.accessToken}`,
    "x-realm": "partner",
    ...(session.identity.tenantId
      ? { "x-tenant-id": session.identity.tenantId }
      : {}),
  };
}

async function requestAuthorityEnvelope<T>(
  path: string,
  init?: RequestInit,
): Promise<ApiSuccessEnvelope<T>> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      cache: "no-store",
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...getServerAuthorityHeaders(),
        ...(init?.headers ?? {}),
      },
    });
  } catch (error) {
    throw new PartnerAuthorityError(
      503,
      "PARTNER_AUTHORITY_UNAVAILABLE",
      error instanceof Error
        ? error.message
        : "Partner authority is unavailable.",
      undefined,
      true,
    );
  }

  if (!response.ok) {
    let envelope: ApiErrorEnvelope | null = null;
    try {
      envelope = (await response.json()) as ApiErrorEnvelope;
    } catch {
      envelope = null;
    }

    const code = envelope?.error?.code ?? "PARTNER_AUTHORITY_REQUEST_FAILED";
    const message =
      envelope?.error?.message ??
      `Authority request failed with HTTP ${response.status}.`;
    throw new PartnerAuthorityError(
      response.status,
      code,
      message,
      envelope?.error?.details,
      envelope?.error?.retryable ?? false,
    );
  }

  const envelope = (await response.json()) as ApiSuccessEnvelope<T>;
  return envelope;
}

async function requestAuthority<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const envelope = await requestAuthorityEnvelope<T>(path, init);
  return envelope.data;
}

function getAuthorityClient(session: PartnerSessionRecord): ApiClient {
  return createBearerClient(API_URL, session.accessToken, {
    ...getServerAuthorityHeaders(),
    "x-realm": "partner",
    ...(session.identity.tenantId
      ? { "x-tenant-id": session.identity.tenantId }
      : {}),
  });
}

function fallbackBrandTemplate(slug: string): PartnerBrandTemplate {
  const normalizedSlug = slug.toLowerCase();
  const base =
    Object.values(BRAND_TEMPLATES).find((brand) => {
      return (
        brand.slug.toLowerCase() === normalizedSlug ||
        brand.code.toLowerCase() === normalizedSlug
      );
    }) ?? BRAND_TEMPLATES.CTBC;
  const isKnownBrand =
    base.slug.toLowerCase() === normalizedSlug ||
    base.code.toLowerCase() === normalizedSlug;
  return {
    ...base,
    slug,
    displayName: base.displayName,
    host: `${slug}.partner.invalid`,
    tagline: `${base.tagline} · 等待後端合作入口啟用`,
    theme: isKnownBrand ? base.theme : PARTNER_DEFAULT_THEME,
  };
}

function matchBrandTemplate(
  entry: Pick<
    PartnerChannelEntryRecord,
    | "entrySlug"
    | "displayName"
    | "programCode"
    | "bankCode"
    | "entryHost"
    | "businessDispatchSubtype"
  >,
): PartnerBrandTemplate | undefined {
  const candidates = [
    entry.entrySlug,
    entry.entryHost,
    entry.programCode,
    entry.bankCode,
    entry.displayName,
    entry.businessDispatchSubtype,
  ]
    .filter((candidate): candidate is string => Boolean(candidate?.trim()))
    .map((candidate) => candidate.toLowerCase());

  return Object.values(BRAND_TEMPLATES).find((brand) =>
    candidates.some((candidate) => {
      return (
        candidate === brand.slug.toLowerCase() ||
        candidate === brand.code.toLowerCase() ||
        candidate === brand.host.toLowerCase() ||
        candidate.includes(brand.slug.toLowerCase()) ||
        candidate.includes(brand.code.toLowerCase()) ||
        candidate.includes(brand.bankName.toLowerCase()) ||
        candidate.includes(brand.programName.toLowerCase())
      );
    }),
  );
}

export function resolvePartnerBrand(
  entry: Pick<
    PartnerChannelEntryRecord,
    | "entrySlug"
    | "displayName"
    | "programCode"
    | "bankCode"
    | "themeAccent"
    | "entryHost"
    | "businessDispatchSubtype"
    | "brandingMetadata"
  >,
): PartnerBrandTemplate {
  const base =
    matchBrandTemplate(entry) ?? fallbackBrandTemplate(entry.entrySlug);
  const displayName =
    entry.brandingMetadata?.displayName?.trim() || entry.displayName;
  const accent = entry.themeAccent?.trim() || base.primary;
  const hotlinePhone =
    entry.brandingMetadata?.supportPhone?.trim() || base.hotline.phone;
  const supportEmail = entry.brandingMetadata?.supportEmail?.trim();

  return {
    ...base,
    slug: entry.entrySlug,
    displayName,
    host: entry.entryHost?.trim() || base.host,
    bankName: entry.bankCode?.trim() || base.bankName,
    programName: entry.programCode?.trim() || base.programName,
    tagline: supportEmail ? `${base.tagline} · ${supportEmail}` : base.tagline,
    primary: accent,
    accent,
    theme: {
      ...base.theme,
      accentText: accent,
      accentSoft: `${accent}1A`,
    },
    hotline: {
      ...base.hotline,
      phone: hotlinePhone,
      note: supportEmail
        ? `${base.hotline.note} · ${supportEmail}`
        : base.hotline.note,
    },
  };
}

export async function getPublicPartnerEntry(
  entrySlug: string,
): Promise<PartnerChannelEntryRecord> {
  const entry = await requestAuthority<PartnerChannelEntryRecord>(
    `/api/partner/entries/${encodeURIComponent(entrySlug)}`,
  );
  return normalizePartnerEntry(entry);
}

export async function getPartnerRouteContext(
  tenantSlug: string,
  options?: {
    allowInactive?: boolean;
    allowMissing?: boolean;
  },
): Promise<PartnerRouteContext> {
  try {
    const { cacheHit, envelope } =
      await requestPartnerEntryAuthorityEnvelope(tenantSlug);
    const entry = normalizePartnerEntry(envelope.data);
    return {
      brand: resolvePartnerBrand(entry),
      entry,
      inactive: false,
      provenance: {
        source: cacheHit ? "authority_cache" : "authority",
        requestId: envelope.meta.requestId,
        timestamp: envelope.meta.timestamp,
        entryUpdatedAt: entry.updatedAt || null,
        auditSource: entry.auditMetadata.source,
        auditRequestId: entry.auditMetadata.requestId,
        fallbackCode: null,
        fallbackStatus: null,
      },
    };
  } catch (error) {
    if (
      error instanceof PartnerAuthorityError &&
      canUseLocalPartnerShellFallback(error, options)
    ) {
      return {
        brand: fallbackBrandTemplate(tenantSlug),
        entry: null,
        inactive: true,
        provenance: {
          source: "local_fallback",
          requestId: null,
          timestamp: null,
          entryUpdatedAt: null,
          auditSource: null,
          auditRequestId: null,
          fallbackCode: error.code,
          fallbackStatus: error.status,
        },
      };
    }
    throw error;
  }
}

export async function createPartnerBootstrapSession(
  command: CreatePartnerBootstrapSessionCommand,
): Promise<PartnerBootstrapSession> {
  return requestAuthority<PartnerBootstrapSession>(
    "/api/auth/partner/bootstrap-session",
    {
      method: "POST",
      body: JSON.stringify(command),
    },
  );
}

export async function verifyPartnerEligibility(
  session: PartnerSessionRecord,
  command: Omit<VerifyPartnerEligibilityCommand, "entrySlug">,
): Promise<PartnerEligibilityVerificationRecord> {
  return requestAuthority<PartnerEligibilityVerificationRecord>(
    "/api/partner/eligibility/verify",
    {
      method: "POST",
      headers: buildPartnerHeaders(session),
      body: JSON.stringify({
        ...command,
        entrySlug: session.partnerEntry.entrySlug,
      } satisfies VerifyPartnerEligibilityCommand),
    },
  );
}

export async function createPartnerBooking(
  session: PartnerSessionRecord,
  command: CreateTenantBookingCommand,
): Promise<BookingRecord> {
  const response = (await getAuthorityClient(session).createTenantBooking(
    command,
  )) as BookingRecord | { booking?: BookingRecord };

  if (response && typeof response === "object" && "bookingId" in response) {
    return response as BookingRecord;
  }

  const booking = (response as { booking?: BookingRecord }).booking;
  if (!booking) {
    throw new Error("Backend did not return a booking record.");
  }
  return booking;
}

export async function getPartnerConfirmation(
  session: PartnerSessionRecord,
  bookingId: string,
): Promise<BookingRecord> {
  return (await getAuthorityClient(session).getTenantBooking(
    bookingId,
  )) as BookingRecord;
}

export async function getPartnerTrip(
  session: PartnerSessionRecord,
  orderId: string,
): Promise<OwnedOrderRecord> {
  return (await getAuthorityClient(session).getOrder(
    orderId,
  )) as OwnedOrderRecord;
}

export async function getPartnerReceipt(
  session: PartnerSessionRecord,
  orderId: string,
): Promise<OwnedOrderRecord> {
  return getPartnerTrip(session, orderId);
}
