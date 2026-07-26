"use server";

import "server-only";

import type {
  BookingRecord,
  CreateTenantBookingCommand,
  OwnedOrderRecord,
} from "@drts/contracts";
import {
  createPartnerBooking,
  createPartnerBootstrapSession,
  getPartnerConfirmation,
  getPartnerReceipt,
  getPublicPartnerEntry,
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
  tenantSlug: string,
): Promise<PartnerSessionRecord> {
  const entry = await getPublicPartnerEntry(tenantSlug);
  const apiKey = resolvePartnerIngressKey(entry.entrySlug, tenantSlug);
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

export async function createProgramBooking(params: {
  tenantSlug: string;
  command: CreateTenantBookingCommand;
}): Promise<{
  booking: BookingRecord;
  receipt: OwnedOrderRecord;
}> {
  const session = await createPartnerSession(params.tenantSlug);
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
  const session = await createPartnerSession(params.tenantSlug);
  const booking = await getPartnerConfirmation(session, params.bookingId);
  const receipt = await getPartnerReceipt(session, params.orderId);

  return { booking, receipt };
}
