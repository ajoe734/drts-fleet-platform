"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type {
  TenantAddressRecord,
  UpsertTenantAddressCommand,
} from "@drts/contracts";
import { getTenantClient } from "@/lib/api-client";

function readTrimmedString(
  formData: FormData,
  key: string,
): string | undefined {
  const rawValue = formData.get(key);
  if (typeof rawValue !== "string") {
    return undefined;
  }

  const normalizedValue = rawValue.trim();
  return normalizedValue.length > 0 ? normalizedValue : undefined;
}

function readOptionalNumber(formData: FormData, key: string) {
  const rawValue = readTrimmedString(formData, key);
  if (!rawValue) {
    return undefined;
  }

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${key} must be a valid number.`);
  }

  return parsed;
}

function readTags(formData: FormData) {
  const rawValue = readTrimmedString(formData, "tags");
  if (!rawValue) {
    return [];
  }

  return rawValue
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function readCheckbox(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function buildReturnPath(
  formData: FormData,
  message: string,
  tone: "default" | "warning",
) {
  const returnTo = readTrimmedString(formData, "returnTo") ?? "/addresses";
  const separator = returnTo.includes("?") ? "&" : "?";
  return `${returnTo}${separator}notice=${encodeURIComponent(message)}&tone=${tone}`;
}

function buildUpsertCommand(formData: FormData): UpsertTenantAddressCommand {
  const addressName = readTrimmedString(formData, "addressName");
  const addressText = readTrimmedString(formData, "addressText");
  const addressId = readTrimmedString(formData, "addressId");
  const ownerPassengerId = readTrimmedString(formData, "ownerPassengerId");
  const lat = readOptionalNumber(formData, "lat");
  const lng = readOptionalNumber(formData, "lng");
  const geocodeSource = readTrimmedString(formData, "geocodeSource");

  if (!addressName) {
    throw new Error("addressName is required.");
  }
  if (!addressText) {
    throw new Error("addressText is required.");
  }

  const command: UpsertTenantAddressCommand = {
    addressName,
    addressText,
    ownerPassengerId: ownerPassengerId ?? null,
    tags: readTags(formData),
    sensitiveFlag: readCheckbox(formData, "sensitiveFlag"),
    activeFlag: readCheckbox(formData, "activeFlag"),
  };

  if (addressId) {
    command.addressId = addressId;
  }
  if (lat !== undefined) {
    command.lat = lat;
  }
  if (lng !== undefined) {
    command.lng = lng;
  }
  if (
    geocodeSource === "none" ||
    geocodeSource === "manual" ||
    geocodeSource === "provider"
  ) {
    command.geocodeSource = geocodeSource;
  }

  return command;
}

export async function upsertAddressAction(formData: FormData) {
  try {
    const client = getTenantClient();
    const command = buildUpsertCommand(formData);
    const saved = (await client.upsertAddress(command)) as TenantAddressRecord;

    revalidatePath("/addresses");
    redirect(
      buildReturnPath(
        formData,
        `${saved.addressName} 已同步到地址簿。`,
        "default",
      ),
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to update address.";
    redirect(buildReturnPath(formData, message, "warning"));
  }
}

function buildLifecycleCommand(
  existing: TenantAddressRecord,
  nextState: "deactivate" | "reactivate",
  reasonNote: string | undefined,
): UpsertTenantAddressCommand {
  const command: UpsertTenantAddressCommand = {
    addressId: existing.addressId,
    ownerPassengerId: existing.ownerPassengerId,
    addressName: existing.addressName,
    addressText: existing.addressText,
    sensitiveFlag: Boolean(existing.sensitiveFlag),
    lat: existing.lat,
    lng: existing.lng,
    tags: [...existing.tags],
    activeFlag: nextState === "reactivate",
  };

  if (existing.geocodeSource) {
    command.geocodeSource = existing.geocodeSource;
  }
  if (reasonNote) {
    command.reasonNote = reasonNote;
  }

  return command;
}

export async function changeAddressLifecycleAction(formData: FormData) {
  try {
    const addressId = readTrimmedString(formData, "addressId");
    const nextState = readTrimmedString(formData, "nextState");
    const reasonNote = readTrimmedString(formData, "reasonNote");

    if (!addressId) {
      throw new Error("addressId is required.");
    }
    if (nextState !== "deactivate" && nextState !== "reactivate") {
      throw new Error("Unsupported address lifecycle action.");
    }

    const client = getTenantClient();
    const existing = (await client.listAddresses()).find(
      (row) => row.addressId === addressId,
    );
    if (!existing) {
      throw new Error("Address not found.");
    }

    const saved = (await client.upsertAddress(
      buildLifecycleCommand(existing, nextState, reasonNote),
    )) as TenantAddressRecord;

    revalidatePath("/addresses");
    redirect(
      buildReturnPath(
        formData,
        nextState === "deactivate"
          ? `${saved.addressName} 已停用。`
          : `${saved.addressName} 已重新啟用。`,
        "default",
      ),
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to change address state.";
    redirect(buildReturnPath(formData, message, "warning"));
  }
}
