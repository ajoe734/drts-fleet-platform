"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type {
  CreateTenantUserCommand,
  TenantUserRoleStatus,
  UpdateTenantRoleCommand,
} from "@drts/contracts";
import { getTenantClient } from "@/lib/api-client";

const USERS_PATH = "/users";
const VALID_STATUSES: readonly TenantUserRoleStatus[] = [
  "invited",
  "active",
  "suspended",
] as const;

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

function sanitizeRedirectTo(value: string | undefined) {
  if (!value || !value.startsWith(USERS_PATH)) {
    return USERS_PATH;
  }
  return value;
}

function buildRedirectTarget(
  redirectTo: string | undefined,
  flash: string,
  userId?: string,
) {
  const safeRedirect = sanitizeRedirectTo(redirectTo);
  const url = new URL(safeRedirect, "http://tenant-console.local");
  url.searchParams.set("flash", flash);
  if (userId) {
    url.searchParams.set("userId", userId);
  }
  return `${url.pathname}${url.search}`;
}

function assertStatus(
  value: string | undefined,
): TenantUserRoleStatus | undefined {
  if (!value) {
    return undefined;
  }

  if (VALID_STATUSES.includes(value as TenantUserRoleStatus)) {
    return value as TenantUserRoleStatus;
  }

  throw new Error(`Unsupported tenant user status: ${value}`);
}

export async function inviteTenantUserAction(formData: FormData) {
  const redirectTo = readTrimmedString(formData, "redirectTo");

  try {
    const email = readTrimmedString(formData, "email");
    const displayName = readTrimmedString(formData, "displayName");
    const roleCode = readTrimmedString(formData, "roleCode");

    if (!email || !displayName || !roleCode) {
      throw new Error("Email, display name, and role are required.");
    }

    const command: CreateTenantUserCommand = {
      email,
      displayName,
      roleCode,
    };

    const client = getTenantClient();
    await client.createTenantUser(command);
    revalidatePath(USERS_PATH);
    redirect(buildRedirectTarget(redirectTo, "invite_success"));
  } catch {
    revalidatePath(USERS_PATH);
    redirect(buildRedirectTarget(redirectTo, "invite_error"));
  }
}

export async function updateTenantUserAction(formData: FormData) {
  const redirectTo = readTrimmedString(formData, "redirectTo");
  const userId = readTrimmedString(formData, "userId");

  try {
    const roleCode = readTrimmedString(formData, "roleCode");
    const status = assertStatus(readTrimmedString(formData, "status"));

    if (!userId || !roleCode || !status) {
      throw new Error("User, role, and status are required.");
    }

    const command: UpdateTenantRoleCommand = {
      roleCode,
      status,
    };

    const client = getTenantClient();
    await client.updateTenantRole(userId, command);
    revalidatePath(USERS_PATH);
    redirect(buildRedirectTarget(redirectTo, "update_success", userId));
  } catch {
    revalidatePath(USERS_PATH);
    redirect(buildRedirectTarget(redirectTo, "update_error", userId));
  }
}
