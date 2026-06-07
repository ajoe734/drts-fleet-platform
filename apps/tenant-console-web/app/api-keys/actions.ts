"use server";

import { revalidatePath } from "next/cache";
import { TENANT_API_KEY_ALLOWED_SCOPES } from "@drts/contracts";
import { getTenantClient } from "@/lib/api-client";
import { formatTenantUiError, toTenantErrorMessage } from "@/lib/error-copy";
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
    throw new Error("至少選擇一個已發布的 API 金鑰權限範圍。");
  }

  const invalidScope = uniqueValues.find((scope) => !isAllowedScope(scope));
  if (invalidScope) {
    throw new Error(`不支援的 API 金鑰權限範圍：${invalidScope}`);
  }

  return uniqueValues;
}

function buildOptionalExpiry(expiresAt: string | undefined) {
  if (!expiresAt) {
    return {};
  }

  const hasExplicitTimezone = /(?:[zZ]|[+-]\d{2}:\d{2})$/.test(expiresAt);
  if (!hasExplicitTimezone) {
    throw new Error("到期時間必須包含明確時區 offset 或 Z 結尾。");
  }

  const parsedExpiry = new Date(expiresAt);
  if (Number.isNaN(parsedExpiry.getTime())) {
    throw new Error("到期時間必須是有效的 ISO 8601 時間戳記。");
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
      throw new Error("API 金鑰名稱為必填。");
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
      action: "issue",
      keyName: issued.apiKey.keyName,
      title: "API 金鑰已發行",
      description: `${issued.apiKey.keyName} 已啟用。請立即保存這次顯示的明文金鑰，之後只會顯示遮罩尾碼。`,
      plaintextKey: issued.plaintextKey,
    };
  } catch (error) {
    const message = formatTenantUiError(
      toTenantErrorMessage(error, "發行 API 金鑰失敗。"),
      "API 金鑰發行失敗",
    );
    payload = {
      tone: "warning",
      title: "API 金鑰發行失敗",
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
      throw new Error("輪替時必須指定 API 金鑰。");
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
      action: "rotate",
      keyName: issued.apiKey.keyName,
      title: "API 金鑰已輪替",
      description: `${issued.apiKey.keyName} 已產生新的明文金鑰，先前啟用的憑證會立即失效。`,
      plaintextKey: issued.plaintextKey,
    };
  } catch (error) {
    const message = formatTenantUiError(
      toTenantErrorMessage(error, "輪替 API 金鑰失敗。"),
      "API 金鑰輪替失敗",
    );
    payload = {
      tone: "warning",
      title: "API 金鑰輪替失敗",
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
    const reason = readTrimmedString(formData, "reason");

    if (!apiKeyId) {
      throw new Error("撤銷時必須指定 API 金鑰。");
    }

    if (!reason) {
      throw new Error("撤銷原因為必填。");
    }

    const client = getTenantClient();
    await client.revokeApiKey(apiKeyId);

    payload = {
      tone: "default",
      action: "revoke",
      keyName: keyName ?? apiKeyId,
      title: "API 金鑰已撤銷",
      description: `${keyName ?? apiKeyId} 已撤銷，之後不能再用來驗證。`,
    };
  } catch (error) {
    const message = formatTenantUiError(
      toTenantErrorMessage(error, "撤銷 API 金鑰失敗。"),
      "API 金鑰撤銷失敗",
    );
    payload = {
      tone: "warning",
      title: "API 金鑰撤銷失敗",
      description: message,
    };
  }

  revalidatePath("/api-keys");
  return payload;
}
