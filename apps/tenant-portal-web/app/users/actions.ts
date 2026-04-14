"use server";

import { revalidatePath } from "next/cache";
import { getTenantClient } from "@/lib/api-client";
import { getCurrentRole, isAdmin } from "@/lib/rbac";
import type {
  CreateTenantUserCommand,
  UpdateTenantRoleCommand,
  TenantUserRoleRecord,
} from "@drts/contracts";

async function requireAdmin(): Promise<void> {
  const role = await getCurrentRole();
  if (!isAdmin(role)) {
    throw new Error("Admin access required.");
  }
}

export async function getUsers(): Promise<{
  users: TenantUserRoleRecord[];
  error: string | null;
}> {
  const client = getTenantClient();
  try {
    const users = await client.listTenantUsers();
    return { users, error: null };
  } catch (e) {
    return {
      users: [],
      error: e instanceof Error ? e.message : "Unknown error",
    };
  }
}

export async function inviteUser(formData: FormData): Promise<void> {
  await requireAdmin();
  const client = getTenantClient();

  const email = formData.get("email") as string;
  const displayName = formData.get("displayName") as string;
  const roleCode = formData.get("roleCode") as string;

  if (!email || !displayName || !roleCode) {
    throw new Error("Email, display name, and role are required.");
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
  const client = getTenantClient();

  const userId = formData.get("userId") as string;
  const roleCode = formData.get("roleCode") as string;
  const status = formData.get("status") as "active" | "suspended" | undefined;

  if (!userId || !roleCode) {
    throw new Error("User ID and role are required.");
  }

  const command: UpdateTenantRoleCommand = {
    roleCode,
    ...(status ? { status } : {}),
  };

  await client.updateTenantRole(userId, command);
  revalidatePath("/users");
}
