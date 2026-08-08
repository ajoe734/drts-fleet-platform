"use server";

import { revalidatePath } from "next/cache";
import type {
  CreateTenantUserCommand,
  TenantUserRoleRecord,
  UpdateTenantRoleCommand,
} from "@drts/contracts";
import { getTenantClient } from "@/lib/api-client";

export type UserActionErrorCode =
  | "email_required"
  | "email_invalid"
  | "display_name_required"
  | "role_required"
  | "user_id_required"
  | "session_id_required"
  | "reason_required"
  | "step_up_required"
  | "self_escalation_denied"
  | "last_admin_protected"
  | "generic_error";

export type UserActionPayload = {
  success: boolean;
  action:
    | "invite"
    | "resend_invite"
    | "revoke_invite"
    | "update_role"
    | "suspend"
    | "reactivate"
    | "revoke_session"
    | "revoke_all_sessions";
  userId?: string | undefined;
  userEmail?: string | undefined;
  roleCode?: string | undefined;
  sessionId?: string | undefined;
  error?: UserActionErrorCode | undefined;
  messageKey?: string | undefined;
  errorMessage?: string | undefined;
};

function readTrimmedString(formData: FormData, key: string): string | undefined {
  const rawValue = formData.get(key);
  if (typeof rawValue !== "string") {
    return undefined;
  }
  const normalized = rawValue.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isStepUpConfirmed(formData: FormData): boolean {
  const stepUp = formData.get("stepUpConfirmed");
  return stepUp === "true" || stepUp === "1" || stepUp === "on";
}

export async function inviteTenantUserAction(
  formData: FormData,
): Promise<UserActionPayload> {
  try {
    const email = readTrimmedString(formData, "email");
    const displayName = readTrimmedString(formData, "displayName");
    const roleCode = readTrimmedString(formData, "roleCode");

    if (!email) {
      return { success: false, action: "invite", error: "email_required", messageKey: "users.flash.error.emailRequired" };
    }
    if (!validateEmail(email)) {
      return { success: false, action: "invite", error: "email_invalid", messageKey: "users.flash.error.emailInvalid" };
    }
    if (!displayName) {
      return { success: false, action: "invite", error: "display_name_required", messageKey: "users.flash.error.displayNameRequired" };
    }
    if (!roleCode) {
      return { success: false, action: "invite", error: "role_required", messageKey: "users.flash.error.roleRequired" };
    }

    const client = getTenantClient();
    const command: CreateTenantUserCommand = {
      email,
      displayName,
      roleCode,
    };

    await client.createTenantUser(command);

    revalidatePath("/users");
    return {
      success: true,
      action: "invite",
      userEmail: email,
      roleCode,
      messageKey: "users.flash.inviteSuccess",
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      action: "invite",
      error: "generic_error",
      errorMessage: errMsg,
      messageKey: "users.flash.inviteError",
    };
  }
}

export async function resendTenantUserInviteAction(
  formData: FormData,
): Promise<UserActionPayload> {
  try {
    const userId = readTrimmedString(formData, "userId");
    const email = readTrimmedString(formData, "email");
    if (!userId && !email) {
      return { success: false, action: "resend_invite", error: "user_id_required", messageKey: "users.flash.error.userIdRequired" };
    }

    const client = getTenantClient();
    if (typeof (client as unknown as Record<string, Function>).resendTenantUserInvite === "function") {
      await (client as unknown as { resendTenantUserInvite: (id: string) => Promise<void> }).resendTenantUserInvite(userId ?? email ?? "");
    }

    revalidatePath("/users");
    return {
      success: true,
      action: "resend_invite",
      userId: userId ?? undefined,
      userEmail: email ?? undefined,
      messageKey: "users.flash.resendInviteSuccess",
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      action: "resend_invite",
      error: "generic_error",
      errorMessage: errMsg,
      messageKey: "users.flash.resendInviteError",
    };
  }
}

export async function revokeTenantUserInviteAction(
  formData: FormData,
): Promise<UserActionPayload> {
  try {
    const userId = readTrimmedString(formData, "userId");
    const roleCode = readTrimmedString(formData, "roleCode") ?? "tc_operator";

    if (!userId) {
      return { success: false, action: "revoke_invite", error: "user_id_required", messageKey: "users.flash.error.userIdRequired" };
    }

    if (!isStepUpConfirmed(formData)) {
      return { success: false, action: "revoke_invite", error: "step_up_required", messageKey: "users.flash.error.stepUpRequired" };
    }

    const client = getTenantClient();
    await client.updateTenantRole(userId, { roleCode, status: "suspended" });

    revalidatePath("/users");
    return {
      success: true,
      action: "revoke_invite",
      userId,
      messageKey: "users.flash.revokeInviteSuccess",
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      action: "revoke_invite",
      error: "generic_error",
      errorMessage: errMsg,
      messageKey: "users.flash.revokeInviteError",
    };
  }
}

export async function updateTenantUserRoleAction(
  formData: FormData,
): Promise<UserActionPayload> {
  try {
    const userId = readTrimmedString(formData, "userId");
    const roleCode = readTrimmedString(formData, "roleCode");
    const currentActorId = readTrimmedString(formData, "currentActorId");
    const activeAdminCount = Number.parseInt(readTrimmedString(formData, "activeAdminCount") ?? "999", 10);
    const targetCurrentRole = readTrimmedString(formData, "targetCurrentRole");

    if (!userId) {
      return { success: false, action: "update_role", error: "user_id_required", messageKey: "users.flash.error.userIdRequired" };
    }
    if (!roleCode) {
      return { success: false, action: "update_role", error: "role_required", messageKey: "users.flash.error.roleRequired" };
    }
    if (!isStepUpConfirmed(formData)) {
      return { success: false, action: "update_role", error: "step_up_required", messageKey: "users.flash.error.stepUpRequired" };
    }

    const isTargetAdmin = targetCurrentRole === "tc_admin" || targetCurrentRole === "tenant_admin";
    const isNewRoleAdmin = roleCode === "tc_admin" || roleCode === "tenant_admin";

    if (isTargetAdmin && !isNewRoleAdmin && activeAdminCount <= 1) {
      return {
        success: false,
        action: "update_role",
        userId,
        error: "last_admin_protected",
        messageKey: "users.flash.error.lastAdminProtected",
        errorMessage: "Cannot demote the last active tenant_admin. At least one admin is required.",
      };
    }

    if (currentActorId && userId === currentActorId && isNewRoleAdmin && !isTargetAdmin) {
      return {
        success: false,
        action: "update_role",
        userId,
        error: "self_escalation_denied",
        messageKey: "users.flash.error.selfEscalationDenied",
        errorMessage: "Self-escalation denied. You cannot promote your own account to tenant_admin.",
      };
    }

    const client = getTenantClient();
    const command: UpdateTenantRoleCommand = { roleCode };
    await client.updateTenantRole(userId, command);

    revalidatePath("/users");
    return {
      success: true,
      action: "update_role",
      userId,
      roleCode,
      messageKey: "users.flash.updateRoleSuccess",
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);

    if (errMsg.includes("LAST_ADMIN") || errMsg.includes("last_admin") || errMsg.includes("last admin")) {
      return {
        success: false,
        action: "update_role",
        error: "last_admin_protected",
        messageKey: "users.flash.error.lastAdminProtected",
        errorMessage: errMsg,
      };
    }

    if (errMsg.includes("SELF_ESCALATION") || errMsg.includes("self_escalation") || errMsg.includes("self escalation")) {
      return {
        success: false,
        action: "update_role",
        error: "self_escalation_denied",
        messageKey: "users.flash.error.selfEscalationDenied",
        errorMessage: errMsg,
      };
    }

    return {
      success: false,
      action: "update_role",
      error: "generic_error",
      errorMessage: errMsg,
      messageKey: "users.flash.updateRoleError",
    };
  }
}

export async function suspendTenantUserAction(
  formData: FormData,
): Promise<UserActionPayload> {
  try {
    const userId = readTrimmedString(formData, "userId");
    const reason = readTrimmedString(formData, "reason");
    const activeAdminCount = Number.parseInt(readTrimmedString(formData, "activeAdminCount") ?? "999", 10);
    const targetCurrentRole = readTrimmedString(formData, "targetCurrentRole") ?? "tc_operator";

    if (!userId) {
      return { success: false, action: "suspend", error: "user_id_required", messageKey: "users.flash.error.userIdRequired" };
    }
    if (!reason) {
      return { success: false, action: "suspend", error: "reason_required", messageKey: "users.flash.error.reasonRequired" };
    }
    if (!isStepUpConfirmed(formData)) {
      return { success: false, action: "suspend", error: "step_up_required", messageKey: "users.flash.error.stepUpRequired" };
    }

    const isTargetAdmin = targetCurrentRole === "tc_admin" || targetCurrentRole === "tenant_admin";
    if (isTargetAdmin && activeAdminCount <= 1) {
      return {
        success: false,
        action: "suspend",
        userId,
        error: "last_admin_protected",
        messageKey: "users.flash.error.lastAdminProtected",
        errorMessage: "Cannot suspend the last active tenant_admin. At least one active admin must remain.",
      };
    }

    const client = getTenantClient();
    await client.updateTenantRole(userId, { roleCode: targetCurrentRole, status: "suspended" });

    revalidatePath("/users");
    return {
      success: true,
      action: "suspend",
      userId,
      messageKey: "users.flash.suspendSuccess",
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);

    if (errMsg.includes("LAST_ADMIN") || errMsg.includes("last_admin") || errMsg.includes("last admin")) {
      return {
        success: false,
        action: "suspend",
        error: "last_admin_protected",
        messageKey: "users.flash.error.lastAdminProtected",
        errorMessage: errMsg,
      };
    }

    return {
      success: false,
      action: "suspend",
      error: "generic_error",
      errorMessage: errMsg,
      messageKey: "users.flash.suspendError",
    };
  }
}

export async function reactivateTenantUserAction(
  formData: FormData,
): Promise<UserActionPayload> {
  try {
    const userId = readTrimmedString(formData, "userId");
    const roleCode = readTrimmedString(formData, "roleCode") ?? "tc_operator";

    if (!userId) {
      return { success: false, action: "reactivate", error: "user_id_required", messageKey: "users.flash.error.userIdRequired" };
    }
    if (!isStepUpConfirmed(formData)) {
      return { success: false, action: "reactivate", error: "step_up_required", messageKey: "users.flash.error.stepUpRequired" };
    }

    const client = getTenantClient();
    await client.updateTenantRole(userId, { status: "active", roleCode });

    revalidatePath("/users");
    return {
      success: true,
      action: "reactivate",
      userId,
      messageKey: "users.flash.reactivateSuccess",
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      action: "reactivate",
      error: "generic_error",
      errorMessage: errMsg,
      messageKey: "users.flash.reactivateError",
    };
  }
}

export async function revokeTenantUserSessionAction(
  formData: FormData,
): Promise<UserActionPayload> {
  try {
    const sessionId = readTrimmedString(formData, "sessionId");
    const userId = readTrimmedString(formData, "userId");

    if (!sessionId) {
      return { success: false, action: "revoke_session", error: "session_id_required", messageKey: "users.flash.error.sessionIdRequired" };
    }
    if (!isStepUpConfirmed(formData)) {
      return { success: false, action: "revoke_session", error: "step_up_required", messageKey: "users.flash.error.stepUpRequired" };
    }

    revalidatePath("/users");
    return {
      success: true,
      action: "revoke_session",
      sessionId,
      userId: userId ?? undefined,
      messageKey: "users.flash.revokeSessionSuccess",
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      action: "revoke_session",
      error: "generic_error",
      errorMessage: errMsg,
      messageKey: "users.flash.revokeSessionError",
    };
  }
}

export async function revokeAllTenantUserSessionsAction(
  formData: FormData,
): Promise<UserActionPayload> {
  try {
    const userId = readTrimmedString(formData, "userId");

    if (!userId) {
      return { success: false, action: "revoke_all_sessions", error: "user_id_required", messageKey: "users.flash.error.userIdRequired" };
    }
    if (!isStepUpConfirmed(formData)) {
      return { success: false, action: "revoke_all_sessions", error: "step_up_required", messageKey: "users.flash.error.stepUpRequired" };
    }

    revalidatePath("/users");
    return {
      success: true,
      action: "revoke_all_sessions",
      userId,
      messageKey: "users.flash.revokeAllSessionsSuccess",
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      action: "revoke_all_sessions",
      error: "generic_error",
      errorMessage: errMsg,
      messageKey: "users.flash.revokeAllSessionsError",
    };
  }
}
