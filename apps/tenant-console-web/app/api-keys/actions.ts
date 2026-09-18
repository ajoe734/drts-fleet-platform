"use server";

import { revalidatePath } from "next/cache";
import { TENANT_API_KEY_ALLOWED_SCOPES } from "@drts/contracts";
import { getTenantClient } from "@/lib/api-client";
import type { ApiKeyFlashPayload } from "./constants";

class ApiKeyActionError extends Error {
  constructor(
    readonly code:
      | "scopeRequired"
      | "scopeUnsupported"
      | "expiryTimezoneRequired"
      | "expiryInvalid"
      | "keyNameRequired"
      | "apiKeySelectionRequired"
      | "revocationReasonRequired",
    readonly params?: Record<string, string | number>,
  ) {
    super(code);
  }
}

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
    throw new ApiKeyActionError("scopeRequired");
  }

  const invalidScope = uniqueValues.find((scope) => !isAllowedScope(scope));
  if (invalidScope) {
    throw new ApiKeyActionError("scopeUnsupported", { scope: invalidScope });
  }

  return uniqueValues;
}

function buildOptionalExpiry(expiresAt: string | undefined) {
  if (!expiresAt) {
    return {};
  }

  const hasExplicitTimezone = /(?:[zZ]|[+-]\d{2}:\d{2})$/.test(expiresAt);
  if (!hasExplicitTimezone) {
    throw new ApiKeyActionError("expiryTimezoneRequired");
  }

  const parsedExpiry = new Date(expiresAt);
  if (Number.isNaN(parsedExpiry.getTime())) {
    throw new ApiKeyActionError("expiryInvalid");
  }

  return { expiresAt: parsedExpiry.toISOString() };
}

function buildErrorPayload(
  action: "issue" | "rotate" | "revoke",
  error: unknown,
): ApiKeyFlashPayload {
  const titlePrefix = `apiKeys.flash.${action}Error.title` as const;
  const genericDescriptionKey =
    `apiKeys.flash.${action}Error.description.generic` as const;

  if (error instanceof ApiKeyActionError) {
    const descriptionKeyMap = {
      scopeRequired: "apiKeys.flash.error.scopeRequired",
      scopeUnsupported: "apiKeys.flash.error.scopeUnsupported",
      expiryTimezoneRequired: "apiKeys.flash.error.expiryTimezoneRequired",
      expiryInvalid: "apiKeys.flash.error.expiryInvalid",
      keyNameRequired: "apiKeys.flash.error.keyNameRequired",
      apiKeySelectionRequired: "apiKeys.flash.error.apiKeySelectionRequired",
      revocationReasonRequired: "apiKeys.flash.error.revocationReasonRequired",
    } as const;

    return {
      tone: "warning",
      action,
      titleKey: titlePrefix,
      descriptionKey: descriptionKeyMap[error.code],
      ...(error.params ? { descriptionParams: error.params } : {}),
    };
  }

  return {
    tone: "warning",
    action,
    titleKey: titlePrefix,
    descriptionKey: genericDescriptionKey,
  };
}

export async function issueTenantApiKeyAction(
  formData: FormData,
): Promise<ApiKeyFlashPayload> {
  let payload: ApiKeyFlashPayload;

  try {
    const keyName = readTrimmedString(formData, "keyName");
    if (!keyName) {
      throw new ApiKeyActionError("keyNameRequired");
    }

    const client = await getTenantClient();
    const expiresAt = readTrimmedString(formData, "expiresAt");
    const issued = await client.issueApiKey({
      keyName,
      scopes: readScopes(formData),
      ...buildOptionalExpiry(expiresAt),
    });

    payload = {
      tone: "default",
      action: "issue",
      keyName: issued.apiKey.keyName,
      titleKey: "apiKeys.flash.issueSuccess.title",
      descriptionKey: "apiKeys.flash.issueSuccess.description",
      descriptionParams: { keyName: issued.apiKey.keyName },
      plaintextKey: issued.plaintextKey,
    };
  } catch (error) {
    payload = buildErrorPayload("issue", error);
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
      throw new ApiKeyActionError("apiKeySelectionRequired");
    }

    const client = await getTenantClient();
    const expiresAt = readTrimmedString(formData, "expiresAt");
    const issued = await client.rotateApiKey(apiKeyId, {
      ...(keyName ? { keyName } : {}),
      scopes: readScopes(formData),
      ...buildOptionalExpiry(expiresAt),
    });

    payload = {
      tone: "default",
      action: "rotate",
      keyName: issued.apiKey.keyName,
      titleKey: "apiKeys.flash.rotateSuccess.title",
      descriptionKey: "apiKeys.flash.rotateSuccess.description",
      descriptionParams: { keyName: issued.apiKey.keyName },
      plaintextKey: issued.plaintextKey,
    };
  } catch (error) {
    payload = buildErrorPayload("rotate", error);
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
    const reason = readTrimmedString(formData, "reason");

    if (!apiKeyId) {
      throw new ApiKeyActionError("apiKeySelectionRequired");
    }

    if (!reason) {
      throw new ApiKeyActionError("revocationReasonRequired");
    }

    const client = await getTenantClient();
    await client.revokeApiKey(apiKeyId);

    payload = {
      tone: "default",
      action: "revoke",
      keyName: keyName ?? apiKeyId,
      titleKey: "apiKeys.flash.revokeSuccess.title",
      descriptionKey: "apiKeys.flash.revokeSuccess.description",
      descriptionParams: { keyName: keyName ?? apiKeyId },
    };
  } catch (error) {
    payload = buildErrorPayload("revoke", error);
  }

  revalidatePath("/api-keys");
  return payload;
}
