"use server";

import "server-only";

import type {
  BookingRecord,
  CreateTenantBookingCommand,
  OwnedOrderRecord,
  PartnerChannelEntryRecord,
} from "@drts/contracts";
import {
  createPartnerBooking,
  createPartnerBootstrapSession,
  getPartnerConfirmation,
  getPartnerRouteContext,
  getPartnerReceipt,
  type PartnerSessionRecord,
} from "@/lib/api-client";

function toEnvKeySegment(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9]+/g, "_").toUpperCase();
}

function resolvePartnerIngressKey(entrySlug: string, tenantSlug: string) {
  const candidates = [
    `PARTNER_INGRESS_KEY_${toEnvKeySegment(entrySlug)}`,
    `PARTNER_INGRESS_KEY_${toEnvKeySegment(tenantSlug)}`,
  ];

  for (const candidate of candidates) {
    const value = process.env[candidate]?.trim();
    if (value) {
      return value;
    }
  }

  throw new Error(
    `Missing partner ingress key for tenant "${tenantSlug}" / entry "${entrySlug}".`,
  );
}

async function createPartnerSession(
  entry: PartnerChannelEntryRecord,
): Promise<PartnerSessionRecord> {
  const apiKey = resolvePartnerIngressKey(entry.entrySlug, entry.entrySlug);
  const session = await createPartnerBootstrapSession({
    entrySlug: entry.entrySlug,
    apiKey,
  });

  return {
    accessToken: session.accessToken,
    expiresIn: session.expiresIn,
    partnerEntry: session.partnerEntry,
    identity: session.identity,
  };
}

async function getActivePartnerEntry(tenantSlug: string) {
  const { entry, provenance } = await getPartnerRouteContext(tenantSlug);
  if (!entry) {
    throw new Error(
      provenance.fallbackCode
        ? `Partner entry unavailable for tenant "${tenantSlug}".`
        : `Missing partner entry for tenant "${tenantSlug}".`,
    );
  }
  return entry;
}

function requireEligibilityVerificationId(
  entry: Pick<
    PartnerChannelEntryRecord,
    "businessDispatchSubtype" | "eligibilityMode" | "entrySlug"
  >,
  command: CreateTenantBookingCommand,
) {
  if (
    entry.businessDispatchSubtype === "credit_card_airport_transfer" &&
    entry.eligibilityMode !== "none" &&
    !command.eligibilityVerificationId?.trim()
  ) {
    throw new Error(
      `eligibilityVerificationId is required for partner entry "${entry.entrySlug}".`,
    );
  }
}

export async function createProgramBooking(params: {
  tenantSlug: string;
  command: CreateTenantBookingCommand;
}): Promise<{
  booking: BookingRecord;
  receipt: OwnedOrderRecord;
}> {
  const entry = await getActivePartnerEntry(params.tenantSlug);
  requireEligibilityVerificationId(entry, params.command);
  const session = await createPartnerSession(entry);
  const created = await createPartnerBooking(session, {
    ...params.command,
    partnerEntrySlug: session.partnerEntry.entrySlug,
  });
  const booking = await getPartnerConfirmation(session, created.bookingId);
  const receipt = await getPartnerReceipt(session, created.orderId);

  return { booking, receipt };
}

export async function getProgramBookingArtifacts(params: {
  tenantSlug: string;
  bookingId: string;
  orderId: string;
}): Promise<{
  booking: BookingRecord;
  receipt: OwnedOrderRecord;
}> {
  const entry = await getActivePartnerEntry(params.tenantSlug);
  const session = await createPartnerSession(entry);
  const booking = await getPartnerConfirmation(session, params.bookingId);
  const receipt = await getPartnerReceipt(session, params.orderId);

  return { booking, receipt };
}
