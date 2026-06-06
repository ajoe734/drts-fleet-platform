import type {
  CreatePlatformNoticeCommand,
  PlatformMaintenanceModeRecord,
  PlatformNoticeRecord,
  ResourceActionDescriptor,
  SetPlatformMaintenanceModeCommand,
} from "@drts/contracts";

import type { AuditedActionResult } from "../../common/action-receipt";
import type { PlatformAdminService } from "../platform-admin/platform-admin.service";
import type {
  PlatformAdminAssistantActionCommand,
  PlatformAdminAssistantActionToolName,
} from "./platform-admin-assistant.types";

export interface PlatformAdminAssistantResolvedAction {
  toolName: PlatformAdminAssistantActionToolName;
  descriptor: ResourceActionDescriptor;
  successMessage: string;
  confirmationTitle: string;
  confirmationMessage: string;
  resourceLabel?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  reasonHint?: string;
  execute(
    service: PlatformAdminService,
    requestId?: string,
  ): AuditedActionResult<PlatformNoticeRecord | PlatformMaintenanceModeRecord>;
}

export function resolvePlatformAdminAssistantAction(
  platformAdminService: PlatformAdminService,
  command: PlatformAdminAssistantActionCommand,
): PlatformAdminAssistantResolvedAction | null {
  switch (command.toolName) {
    case "action.create_platform_notice":
      return resolveCreatePlatformNoticeAction(
        command.payload as CreatePlatformNoticeCommand,
      );
    case "action.set_maintenance_mode":
      return resolveSetMaintenanceModeAction(
        platformAdminService,
        command.payload as SetPlatformMaintenanceModeCommand,
      );
    default:
      return null;
  }
}

function resolveCreatePlatformNoticeAction(
  payload: CreatePlatformNoticeCommand,
): PlatformAdminAssistantResolvedAction {
  return {
    toolName: "action.create_platform_notice",
    descriptor: {
      action: "create_platform_notice",
      enabled: true,
      riskLevel: "medium",
      requiresReason: false,
    },
    successMessage: payload.scheduledAt
      ? "Platform notice scheduled."
      : "Platform notice created.",
    confirmationTitle: payload.scheduledAt
      ? "Confirm platform notice schedule"
      : "Confirm platform notice creation",
    confirmationMessage: payload.scheduledAt
      ? `This will schedule a ${payload.severity} notice for ${payload.targetAudience}.`
      : `This will publish a ${payload.severity} notice for ${payload.targetAudience}.`,
    resourceLabel: `${payload.title} · ${payload.severity} · ${payload.targetAudience}`,
    confirmLabel: payload.scheduledAt ? "Schedule notice" : "Create notice",
    cancelLabel: "Keep draft",
    reasonLabel: "Operator note",
    reasonPlaceholder: "Optional note for the audit trail.",
    reasonHint:
      "A note is optional for medium-risk notice creation and will be attached when supplied.",
    execute(service, requestId) {
      return service.createPlatformNoticeWithAudit(payload, requestId);
    },
  };
}

function resolveSetMaintenanceModeAction(
  platformAdminService: PlatformAdminService,
  payload: SetPlatformMaintenanceModeCommand,
): PlatformAdminAssistantResolvedAction {
  const currentState = platformAdminService.getMaintenanceMode();
  const alreadyInRequestedState = currentState.enabled === payload.enabled;

  return {
    toolName: "action.set_maintenance_mode",
    descriptor: {
      action: "set_maintenance_mode",
      enabled: !alreadyInRequestedState,
      ...(alreadyInRequestedState
        ? {
            disabledReasonCode: currentState.enabled
              ? "maintenance_mode_already_enabled"
              : "maintenance_mode_already_disabled",
          }
        : {}),
      riskLevel: "high",
      requiresReason: true,
    },
    successMessage: payload.enabled
      ? "Maintenance mode enabled."
      : "Maintenance mode disabled.",
    confirmationTitle: payload.enabled
      ? "Confirm maintenance mode enablement"
      : "Confirm maintenance mode disablement",
    confirmationMessage: payload.enabled
      ? "This high-risk action will place the platform into maintenance mode."
      : "This high-risk action will return the platform to normal operation.",
    resourceLabel: payload.enabled
      ? "Platform maintenance mode -> enabled"
      : "Platform maintenance mode -> disabled",
    confirmLabel: payload.enabled
      ? "Enable maintenance mode"
      : "Disable maintenance mode",
    cancelLabel: "Cancel",
    reasonLabel: "Execution reason",
    reasonPlaceholder: payload.enabled
      ? "Describe why maintenance mode must be enabled."
      : "Describe why maintenance mode can be disabled.",
    reasonHint:
      "A non-empty reason is required and will be written to the assistant and domain audit trail.",
    execute(service, requestId) {
      return service.setMaintenanceModeWithAudit(payload, requestId);
    },
  };
}
