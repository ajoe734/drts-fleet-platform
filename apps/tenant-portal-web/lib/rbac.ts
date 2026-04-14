/**
 * Simple RBAC scope helper for the tenant portal.
 *
 * In Phase 1 demo mode, the current user's role is resolved from a cookie
 * (defaulting to "viewer"). In production this would be replaced by proper
 * session/auth middleware.
 *
 * Admin operations:
 * - Invite users
 * - Change user roles
 * - Suspend/activate users
 */

import { cookies } from "next/headers";

export type RbacScope = "admin" | "operator" | "viewer";

const ADMIN_ACTIONS = new Set([
  "invite_user",
  "update_user_role",
  "suspend_user",
  "activate_user",
]);

export async function getCurrentRole(): Promise<RbacScope> {
  const cookieStore = await cookies();
  const role = cookieStore.get("tenant_role")?.value as RbacScope | undefined;
  return role ?? "viewer";
}

export function canPerformAction(role: RbacScope, action: string): boolean {
  if (role === "admin") return true;
  if (role === "operator") return !ADMIN_ACTIONS.has(action);
  return false; // viewer: read-only
}

export function isAdmin(role: RbacScope): boolean {
  return role === "admin";
}
