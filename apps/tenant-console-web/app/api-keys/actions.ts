"use server";

import { revalidatePath } from "next/cache";
import { TENANT_API_KEY_ALLOWED_SCOPES } from "@drts/contracts";
import { getTenantClient } from "@/lib/api-client";
import type { ApiKeyFlashPayload } from "./constants";

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

function isAllowedScope(value: string): boolean {
  return TENANT_API_KEY_ALLOWED_SCOPES.includes(
    value as (typeof TENANT_API_KEY_ALLOWED_SCOPES)[number],
  );
}

function readScopes(formData: FormData): string[] {
  const values = formData
    .getAll("scopes")
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  const uniqueValues = [...new Set(values)];

  if (uniqueValues.length === 0) {
    throw new Error("Select at least one published API key scope.");
  }

  const invalidScope = uniqueValues.find((scope) => !isAllowedScope(scope));
  if (invalidScope) {
    throw new Error(`Unsupported API key scope: ${invalidScope}`);
  }

  return uniqueValues;
}

function buildOptionalExpiry(expiresAt: string | undefined) {
  if (!expiresAt) {
    return {};
  }

  const hasExplicitTimezone = /(?:[zZ]|[+-]\d{2}:\d{2})$/.test(expiresAt);
  if (!hasExplicitTimezone) {
    throw new Error(
      "Expiry must include an explicit timezone offset or Z suffix.",
    );
  }

  const parsedExpiry = new Date(expiresAt);
  if (Number.isNaN(parsedExpiry.getTime())) {
    throw new Error("Expiry must be a valid ISO 8601 timestamp.");
  }

  return { expiresAt: parsedExpiry.toISOString() };
}

export async function issueTenantApiKeyAction(
  formData: FormData,
): Promise<ApiKeyFlashPayload> {
  let payload: ApiKeyFlashPayload;

  try {
    const keyName = readTrimmedString(formData, "keyName");
    if (!keyName) {
      throw new Error("API key label is required.");
    }

    const client = getTenantClient();
    const expiresAt = readTrimmedString(formData, "expiresAt");
    const issued = await client.issueApiKey({
      keyName,
      scopes: readScopes(formData),
      ...buildOptionalExpiry(expiresAt),
    });

    payload = {
      tone: "default",
      title: "API key issued",
      description: `${issued.apiKey.keyName} is now active. Save the plaintext value now because subsequent fetches only show the masked suffix.`,
      plaintextKey: issued.plaintextKey,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to issue API key.";
    payload = {
      tone: "warning",
      title: "API key could not be issued",
      description: message,
    };
  }

  revalidatePath("/api-keys");
  return payload;
}

export async function rotateTenantApiKeyAction(
  formData: FormData,
): Promise<ApiKeyFlashPayload> {
  let payload: ApiKeyFlashPayload;

  try {
    const apiKeyId = readTrimmedString(formData, "apiKeyId");
    const keyName = readTrimmedString(formData, "keyName");

    if (!apiKeyId) {
      throw new Error("API key selection is required for rotation.");
    }

    const client = getTenantClient();
    const expiresAt = readTrimmedString(formData, "expiresAt");
    const issued = await client.rotateApiKey(apiKeyId, {
      ...(keyName ? { keyName } : {}),
      scopes: readScopes(formData),
      ...buildOptionalExpiry(expiresAt),
    });

    payload = {
      tone: "default",
      title: "API key rotated",
      description: `${issued.apiKey.keyName} has a new plaintext value. The previously active credential is invalidated immediately.`,
      plaintextKey: issued.plaintextKey,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to rotate API key.";
    payload = {
      tone: "warning",
      title: "API key could not be rotated",
      description: message,
    };
  }

  revalidatePath("/api-keys");
  return payload;
}

export async function revokeTenantApiKeyAction(
  formData: FormData,
): Promise<ApiKeyFlashPayload> {
  let payload: ApiKeyFlashPayload;

  try {
    const apiKeyId = readTrimmedString(formData, "apiKeyId");
    const keyName = readTrimmedString(formData, "keyName");

    if (!apiKeyId) {
      throw new Error("API key selection is required for revocation.");
    }

    const client = getTenantClient();
    await client.revokeApiKey(apiKeyId);

    payload = {
      tone: "default",
      title: "API key revoked",
      description: `${keyName ?? apiKeyId} is now revoked and cannot authenticate again.`,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to revoke API key.";
    payload = {
      tone: "warning",
      title: "API key could not be revoked",
      description: message,
    };
  }

  revalidatePath("/api-keys");
  return payload;
}
