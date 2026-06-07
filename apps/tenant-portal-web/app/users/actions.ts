"use server";

import { revalidatePath } from "next/cache";
import { getTenantClient } from "@/lib/api-client";
import { getTenantRoleSnapshot, requireCapability } from "@/lib/rbac";
import type {
  CreateTenantUserCommand,
  UpdateTenantRoleCommand,
  TenantUserRoleRecord,
} from "@drts/contracts";

async function requireAdmin(): Promise<void> {
  const snapshot = await getTenantRoleSnapshot();
  requireCapability(
    snapshot.capabilities.canManageUsers,
    "需要租戶管理員權限。",
  );
}

export async function getUsers(): Promise<{
  users: TenantUserRoleRecord[];
  error: string | null;
}> {
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
      error: e instanceof Error ? e.message : "未知錯誤",
    };
  }
}

export async function inviteUser(formData: FormData): Promise<void> {
  await requireAdmin();
  const client = await getTenantClient();

  const email = formData.get("email") as string;
  const displayName = formData.get("displayName") as string;
  const roleCode = formData.get("roleCode") as string;

  if (!email || !displayName || !roleCode) {
    throw new Error("電子郵件、顯示名稱與角色為必填。");
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
  const client = await getTenantClient();

  const userId = formData.get("userId") as string;
  const roleCode = formData.get("roleCode") as string;
  const status = formData.get("status") as "active" | "suspended" | undefined;

  if (!userId || !roleCode) {
    throw new Error("使用者 ID 與角色為必填。");
  }

  const command: UpdateTenantRoleCommand = {
    roleCode,
    ...(status ? { status } : {}),
  };

  await client.updateTenantRole(userId, command);
  revalidatePath("/users");
}
