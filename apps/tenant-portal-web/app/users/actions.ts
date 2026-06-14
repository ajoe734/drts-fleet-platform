"use server";

import { revalidatePath } from "next/cache";
import { getTenantClient } from "@/lib/api-client";
import { getTenantRoleSnapshot, requireCapability } from "@/lib/rbac";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import type {
  CreateTenantUserCommand,
  UpdateTenantRoleCommand,
  TenantUserRoleRecord,
} from "@drts/contracts";

async function requireAdmin(): Promise<void> {
  const locale = await getServerLocale();
  const snapshot = await getTenantRoleSnapshot();
  requireCapability(
    snapshot.capabilities.canManageUsers,
    t("users.error.adminRequired", locale),
  );
}

export async function getUsers(): Promise<{
  users: TenantUserRoleRecord[];
  error: string | null;
}> {
  const locale = await getServerLocale();
  const client = await getTenantClient();
  try {
    const result = await client.listTenantUsers();
    return {
      users: Array.isArray(result) ? result : result.items,
      error: null,
    };
  } catch (e) {
    return {
      users: [],
      error: e instanceof Error ? e.message : t("users.error.unknown", locale),
    };
  }
}

export async function inviteUser(formData: FormData): Promise<void> {
  await requireAdmin();
  const locale = await getServerLocale();
  const client = await getTenantClient();

  const email = formData.get("email") as string;
  const displayName = formData.get("displayName") as string;
  const roleCode = formData.get("roleCode") as string;

  if (!email || !displayName || !roleCode) {
    throw new Error(t("users.error.inviteFieldsRequired", locale));
  }

  const command: CreateTenantUserCommand = {
    email,
    displayName,
    roleCode,
  };

  await client.createTenantUser(command);
  revalidatePath("/users");
}

export async function updateUserRole(formData: FormData): Promise<void> {
  await requireAdmin();
  const locale = await getServerLocale();
  const client = await getTenantClient();

  const userId = formData.get("userId") as string;
  const roleCode = formData.get("roleCode") as string;
  const status = formData.get("status") as "active" | "suspended" | undefined;

  if (!userId || !roleCode) {
    throw new Error(t("users.error.roleFieldsRequired", locale));
  }

  const command: UpdateTenantRoleCommand = {
    roleCode,
    ...(status ? { status } : {}),
  };

  await client.updateTenantRole(userId, command);
  revalidatePath("/users");
}
