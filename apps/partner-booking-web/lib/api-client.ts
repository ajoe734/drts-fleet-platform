import { createBearerClient, type ApiClient } from "@drts/api-client";
import type {
  ApiSuccessEnvelope,
  BookingRecord,
  CreatePartnerBootstrapSessionCommand,
  CreateTenantBookingCommand,
  IdentityContext,
  OwnedOrderRecord,
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

export type PartnerRouteContext = {
  brand: PartnerBrandTemplate;
  entry: PartnerChannelEntryRecord | null;
  inactive: boolean;
};

function canUseLocalPartnerShellFallback(
  error: PartnerAuthorityError,
  options?: {
    allowInactive?: boolean;
    allowMissing?: boolean;
  },
) {
  if (error.code === "PARTNER_ENTRY_INACTIVE") {
    return options?.allowInactive;
  }

  if (error.code === "PARTNER_ENTRY_NOT_FOUND") {
    return options?.allowInactive || options?.allowMissing;
  }

  return (
    error.code === "INTERNAL_KEY_REQUIRED" &&
    !process.env.DRTS_INTERNAL_KEY?.trim() &&
    (options?.allowInactive || options?.allowMissing)
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

async function requestAuthority<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    cache: "no-store",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...getServerAuthorityHeaders(),
      ...(init?.headers ?? {}),
    },
  });

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
  return {
    ...base,
    slug,
    displayName: base.displayName,
    host: `${slug}.partner.invalid`,
    tagline: `${base.tagline} · 等待後端合作入口啟用`,
    theme: PARTNER_DEFAULT_THEME,
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
  return requestAuthority<PartnerChannelEntryRecord>(
    `/api/partner/entries/${encodeURIComponent(entrySlug)}`,
  );
}

export async function getPartnerRouteContext(
  tenantSlug: string,
  options?: {
    allowInactive?: boolean;
    allowMissing?: boolean;
  },
): Promise<PartnerRouteContext> {
  try {
    const entry = await getPublicPartnerEntry(tenantSlug);
    return {
      brand: resolvePartnerBrand(entry),
      entry,
      inactive: false,
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
