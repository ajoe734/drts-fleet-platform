import { randomUUID } from "node:crypto";

import { HttpStatus } from "@nestjs/common";

import type {
  ActionReceipt,
  ApiSuccessEnvelope,
  AuditLogRecord,
} from "@drts/contracts";

import { ApiRequestError, toApiSuccessEnvelope } from "./api-envelope";

export interface AuditedActionResult<T> {
  data: T;
  auditLog: AuditLogRecord;
}

export interface ActionReceiptEnvelopeInput {
  auditLog: Pick<
    AuditLogRecord,
    "auditId" | "requestId" | "resourceType" | "resourceId"
  >;
  actionId?: string;
  resourceType?: string;
  resourceId?: string;
  status?: ActionReceipt["status"];
  message: string;
}

function normalizeNonBlank(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function toActionReceipt(
  input: ActionReceiptEnvelopeInput,
): ActionReceipt {
  const resourceType =
    normalizeNonBlank(input.resourceType) ??
    normalizeNonBlank(input.auditLog.resourceType);
  const resourceId =
    normalizeNonBlank(input.resourceId) ??
    normalizeNonBlank(input.auditLog.resourceId);

  if (!resourceType || !resourceId) {
    throw new ApiRequestError(
      HttpStatus.INTERNAL_SERVER_ERROR,
      "ACTION_RECEIPT_RESOURCE_REQUIRED",
      "ActionReceipt requires a non-empty resourceType and resourceId.",
      {
        auditId: input.auditLog.auditId,
        resourceType: input.auditLog.resourceType,
        resourceId: input.auditLog.resourceId,
      },
    );
  }

  return {
    actionId:
      normalizeNonBlank(input.actionId) ??
      normalizeNonBlank(input.auditLog.requestId) ??
      randomUUID(),
    auditId: input.auditLog.auditId,
    resourceType,
    resourceId,
    status: input.status ?? "completed",
    message: input.message,
  };
}

export function toActionReceiptEnvelope(
  input: ActionReceiptEnvelopeInput,
  requestId?: string,
): ApiSuccessEnvelope<ActionReceipt> {
  const receipt = toActionReceipt(input);
  const resolvedRequestId =
    normalizeNonBlank(requestId) ??
    normalizeNonBlank(input.auditLog.requestId) ??
    receipt.actionId;

  return toApiSuccessEnvelope(receipt, resolvedRequestId);
}
