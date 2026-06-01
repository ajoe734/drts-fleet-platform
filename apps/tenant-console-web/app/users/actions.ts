"use server";

import { revalidatePath } from "next/cache";
import type {
  CreateTenantUserCommand,
  TenantUserRoleStatus,
  UpdateTenantRoleCommand,
} from "@drts/contracts";
import { getTenantClient } from "@/lib/api-client";
import type { UsersFlashPayload } from "./constants";

const STATUS_VALUES: readonly TenantUserRoleStatus[] = [
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

function assertStatus(value: string): TenantUserRoleStatus {
  if (!STATUS_VALUES.includes(value as TenantUserRoleStatus)) {
    throw new Error(`Unsupported tenant user status: ${value}`);
  }

  return value as TenantUserRoleStatus;
}

export async function inviteTenantUserAction(
  formData: FormData,
): Promise<UsersFlashPayload> {
  let payload: UsersFlashPayload;

  try {
    const email = readTrimmedString(formData, "email");
    const displayName = readTrimmedString(formData, "displayName");
    const roleCode = readTrimmedString(formData, "roleCode");

    if (!email) {
      throw new Error("Email is required to invite a tenant user.");
    }
    if (!displayName) {
      throw new Error("Display name is required to invite a tenant user.");
    }
    if (!roleCode) {
      throw new Error("Select an assignable role before sending the invite.");
    }

    const command: CreateTenantUserCommand = { email, displayName, roleCode };
    await getTenantClient().createTenantUser(command);

    payload = {
      tone: "success",
      title: "已送出邀請",
      description: `${displayName} (${email}) 已以 ${roleCode} 角色加入租戶名冊，狀態為 invited。`,
    };
  } catch (error) {
    payload = {
      tone: "warning",
      title: "邀請未送出",
      description:
        error instanceof Error ? error.message : "無法邀請租戶使用者。",
    };
  }

  revalidatePath("/users");
  return payload;
}

export async function updateTenantUserRoleAction(
  formData: FormData,
): Promise<UsersFlashPayload> {
  let payload: UsersFlashPayload;

  try {
    const userId = readTrimmedString(formData, "userId");
    const roleCode = readTrimmedString(formData, "roleCode");
    const displayName = readTrimmedString(formData, "displayName");

    if (!userId) {
      throw new Error("Select a user before updating the role.");
    }
    if (!roleCode) {
      throw new Error("A target role code is required.");
    }

    const command: UpdateTenantRoleCommand = { roleCode };
    await getTenantClient().updateTenantRole(userId, command);

    payload = {
      tone: "success",
      title: "角色已更新",
      description: `${displayName ?? userId} 現在的角色為 ${roleCode}。`,
    };
  } catch (error) {
    payload = {
      tone: "warning",
      title: "角色未更新",
      description:
        error instanceof Error ? error.message : "無法更新租戶使用者角色。",
    };
  }

  revalidatePath("/users");
  return payload;
}

export async function setTenantUserStatusAction(
  formData: FormData,
): Promise<UsersFlashPayload> {
  let payload: UsersFlashPayload;

  try {
    const userId = readTrimmedString(formData, "userId");
    const roleCode = readTrimmedString(formData, "roleCode");
    const statusValue = readTrimmedString(formData, "status");
    const displayName = readTrimmedString(formData, "displayName");
    const reason = readTrimmedString(formData, "reason");

    if (!userId) {
      throw new Error("Select a user before changing the status.");
    }
    if (!roleCode) {
      // UpdateTenantRoleCommand keeps roleCode required, so a status change
      // must carry the user's current role code verbatim.
      throw new Error("The user's current role code is required.");
    }
    if (!statusValue) {
      throw new Error("A target status is required.");
    }

    const status = assertStatus(statusValue);

    // High-risk suspend requires a reason in the confirmation UI (packet
    // §3.4), but the canonical UpdateTenantRoleCommand exposes no reason
    // field (packet §5.7 contract note) — so the reason is surfaced in the
    // receipt only and never sent as an unsupported payload field.
    if (status === "suspended" && !reason) {
      throw new Error("A reason is required to suspend a tenant user.");
    }

    const command: UpdateTenantRoleCommand = { roleCode, status };
    await getTenantClient().updateTenantRole(userId, command);

    payload = {
      tone: "success",
      title: status === "suspended" ? "已停用使用者" : "已恢復使用者",
      description:
        status === "suspended"
          ? `${displayName ?? userId} 已停用${reason ? `（原因：${reason}）` : ""}。`
          : `${displayName ?? userId} 已恢復為 active 狀態。`,
    };
  } catch (error) {
    payload = {
      tone: "warning",
      title: "狀態未變更",
      description:
        error instanceof Error ? error.message : "無法變更租戶使用者狀態。",
    };
  }

  revalidatePath("/users");
  return payload;
}
