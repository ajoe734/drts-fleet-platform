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
    execute(service, requestId) {
      return service.setMaintenanceModeWithAudit(payload, requestId);
    },
  };
}
