import type {
  TenantApprovalEvaluationInputSnapshot,
  TenantApprovalMode,
  TenantBookingApprovalDecisionRecord,
  TenantBookingApprovalRequestStatus,
  TenantPrincipalRef,
} from "@drts/contracts";

export const APPROVAL_REEVALUATION_FIELDS = [
  "costCenterCode",
  "businessDispatchSubtype",
  "reservationWindowStart",
  "reservationWindowEnd",
  "passengerId",
  "passengerRole",
  "amountMinor",
  "vehiclePreference",
  "partnerEntrySlug",
  "eligibilityVerificationId",
  "signoffRequired",
  "expenseProofRequired",
] as const;

export type ApprovalReevaluationField =
  (typeof APPROVAL_REEVALUATION_FIELDS)[number];

type ActiveTenantUserDirectory = {
  hasUser(userId: string): boolean;
  listUserIdsByRole(roleCode: string): string[];
  getCostCenterOwnerUserId(costCenterCode: string): string | null;
};

export type ApprovalApproverFallbackRecord = {
  descriptor: TenantPrincipalRef;
  fallbackDescriptor: TenantPrincipalRef;
  reasonCode: "COST_CENTER_OWNER_MISSING";
};

export type ApprovalApproverResolutionResult = {
  resolvedApproverUserIds: string[];
  fallbackRecords: ApprovalApproverFallbackRecord[];
  unresolvedDescriptors: TenantPrincipalRef[];
};

export function shouldReevaluateTenantBookingApproval(
  previousSnapshot: TenantApprovalEvaluationInputSnapshot,
  nextSnapshot: TenantApprovalEvaluationInputSnapshot,
) {
  return APPROVAL_REEVALUATION_FIELDS.some(
    (field) => previousSnapshot[field] !== nextSnapshot[field],
  );
}

export function resolveApprovalModeForExecution(
  approvalMode: TenantApprovalMode,
): "any_of" | "all_of_parallel" {
  return approvalMode === "any_of" ? "any_of" : "all_of_parallel";
}

export function resolveApprovalApproverUserIds(
  input: {
    approvers: readonly TenantPrincipalRef[];
    escalationTarget: TenantPrincipalRef | null;
    bookingCostCenterCode: string | null;
  },
  directory: ActiveTenantUserDirectory,
): ApprovalApproverResolutionResult {
  const resolvedApproverUserIds = new Set<string>();
  const unresolvedDescriptors: TenantPrincipalRef[] = [];
  const fallbackRecords: ApprovalApproverFallbackRecord[] = [];

  for (const descriptor of input.approvers) {
    const resolved = resolveDescriptorToUserIds(
      descriptor,
      input.bookingCostCenterCode,
      directory,
    );
    if (resolved.length > 0) {
      resolved.forEach((userId) => resolvedApproverUserIds.add(userId));
      continue;
    }

    if (descriptor.kind === "cost_center_owner") {
      const fallbackDescriptor = input.escalationTarget ?? {
        kind: "tenant_admin" as const,
      };
      const fallbackResolved = resolveDescriptorToUserIds(
        fallbackDescriptor,
        input.bookingCostCenterCode,
        directory,
      );
      if (fallbackResolved.length > 0) {
        fallbackResolved.forEach((userId) =>
          resolvedApproverUserIds.add(userId),
        );
        fallbackRecords.push({
          descriptor: { ...descriptor },
          fallbackDescriptor: { ...fallbackDescriptor },
          reasonCode: "COST_CENTER_OWNER_MISSING",
        });
        continue;
      }
    }

    unresolvedDescriptors.push({ ...descriptor });
  }

  return {
    resolvedApproverUserIds: [...resolvedApproverUserIds],
    fallbackRecords,
    unresolvedDescriptors,
  };
}

export function computeApprovalRequestStatus(input: {
  approvalMode: TenantApprovalMode;
  resolvedApproverUserIds: readonly string[];
  decisions: readonly TenantBookingApprovalDecisionRecord[];
}): {
  status: Extract<
    TenantBookingApprovalRequestStatus,
    "pending" | "approved" | "rejected"
  >;
  resolved: boolean;
} {
  const executionMode = resolveApprovalModeForExecution(input.approvalMode);
  const approveActors = new Set(
    input.decisions
      .filter((decision) => decision.decision === "approve")
      .map((decision) => decision.actorUserId),
  );
  const hasReject = input.decisions.some(
    (decision) => decision.decision === "reject",
  );

  if (hasReject) {
    return { status: "rejected", resolved: true };
  }

  if (executionMode === "any_of" && approveActors.size > 0) {
    return { status: "approved", resolved: true };
  }

  if (
    executionMode === "all_of_parallel" &&
    input.resolvedApproverUserIds.length > 0 &&
    input.resolvedApproverUserIds.every((userId) => approveActors.has(userId))
  ) {
    return { status: "approved", resolved: true };
  }

  return { status: "pending", resolved: false };
}

export function hasActorDecidedApprovalRequest(
  decisions: readonly TenantBookingApprovalDecisionRecord[],
  actorUserId: string,
) {
  return decisions.some((decision) => decision.actorUserId === actorUserId);
}

function resolveDescriptorToUserIds(
  descriptor: TenantPrincipalRef,
  bookingCostCenterCode: string | null,
  directory: ActiveTenantUserDirectory,
) {
  if (descriptor.kind === "tenant_user") {
    const userId = descriptor.userId?.trim();
    return userId && directory.hasUser(userId) ? [userId] : [];
  }

  const roleCode = resolveDescriptorRoleCode(descriptor);
  if (roleCode) {
    return directory.listUserIdsByRole(roleCode);
  }

  if (descriptor.kind === "cost_center_owner") {
    const costCenterCode =
      descriptor.costCenterCode?.trim() ?? bookingCostCenterCode;
    if (!costCenterCode) {
      return [];
    }
    const ownerUserId = directory.getCostCenterOwnerUserId(costCenterCode);
    return ownerUserId ? [ownerUserId] : [];
  }

  return [];
}

function resolveDescriptorRoleCode(descriptor: TenantPrincipalRef) {
  switch (descriptor.kind) {
    case "tenant_role":
      return descriptor.roleCode?.trim() ?? null;
    case "tenant_finance_admin":
      return "tenant_finance_admin";
    case "tenant_admin":
      return "tenant_admin";
    default:
      return null;
  }
}
