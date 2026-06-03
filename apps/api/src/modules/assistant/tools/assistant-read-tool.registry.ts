import { Injectable } from "@nestjs/common";
import type {
  ComplaintCaseRecord,
  ComplaintExportViewRecord,
  ComplaintTimelineEntry,
  DispatchJobRecord,
  OwnedOrderRecord,
} from "@drts/contracts";

import { ApiRequestError } from "../../../common/api-envelope";
import type { BootstrapRequestIdentity } from "../../../common/auth";
import {
  maskAddress,
  maskEmail,
  maskName,
  maskOpaqueToken,
  maskPhone,
} from "../../../common/sensitive-data-policy";
import { ComplaintService } from "../../complaint/complaint.service";
import { OwnedMobilityService } from "../../owned-mobility/owned-mobility.service";
import type {
  AssistantReadToolDefinition,
  AssistantReadToolExecutionRequest,
  AssistantReadToolExecutionResult,
  AssistantReadToolName,
} from "./assistant-read-tool.types";

const REDACTED_TEXT = "[redacted]";

const TOOL_DEFINITIONS: AssistantReadToolDefinition[] = [
  {
    name: "list_dispatch_jobs",
    description:
      "List dispatch jobs visible to the current caller without broadening realm scope.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "get_order",
    description:
      "Read a single order under caller scope and return a PII-masked snapshot.",
    inputSchema: {
      type: "object",
      properties: {
        orderId: {
          type: "string",
          minLength: 1,
        },
      },
      required: ["orderId"],
      additionalProperties: false,
    },
  },
  {
    name: "get_complaint_case",
    description:
      "Read one complaint case under caller scope and return a PII-masked snapshot.",
    inputSchema: {
      type: "object",
      properties: {
        caseNo: {
          type: "string",
          minLength: 1,
        },
      },
      required: ["caseNo"],
      additionalProperties: false,
    },
  },
  {
    name: "get_complaint_timeline",
    description:
      "Read the complaint timeline under caller scope with free-text notes redacted.",
    inputSchema: {
      type: "object",
      properties: {
        caseNo: {
          type: "string",
          minLength: 1,
        },
      },
      required: ["caseNo"],
      additionalProperties: false,
    },
  },
  {
    name: "get_complaint_export_view",
    description:
      "Read the complaint export view under caller scope and return a masked export payload.",
    inputSchema: {
      type: "object",
      properties: {
        caseNo: {
          type: "string",
          minLength: 1,
        },
      },
      required: ["caseNo"],
      additionalProperties: false,
    },
  },
];

@Injectable()
export class AssistantReadToolRegistry {
  constructor(
    private readonly ownedMobilityService: OwnedMobilityService,
    private readonly complaintService: ComplaintService,
  ) {}

  listDefinitions(): AssistantReadToolDefinition[] {
    return TOOL_DEFINITIONS.map((definition) => ({
      ...definition,
      inputSchema: {
        ...definition.inputSchema,
        properties: { ...definition.inputSchema.properties },
        ...(definition.inputSchema.required
          ? { required: [...definition.inputSchema.required] }
          : {}),
      },
    }));
  }

  execute(
    request: AssistantReadToolExecutionRequest,
  ): AssistantReadToolExecutionResult {
    const identity = this.requireIdentity(request.identity);

    switch (request.toolName) {
      case "list_dispatch_jobs":
        return {
          toolName: request.toolName,
          output: this.listDispatchJobs(identity),
        };
      case "get_order":
        return {
          toolName: request.toolName,
          output: this.getOrder(
            identity,
            this.requireString(request.input, "orderId"),
          ),
        };
      case "get_complaint_case":
        return {
          toolName: request.toolName,
          output: this.getComplaintCase(
            identity,
            this.requireString(request.input, "caseNo"),
          ),
        };
      case "get_complaint_timeline":
        return {
          toolName: request.toolName,
          output: this.getComplaintTimeline(
            identity,
            this.requireString(request.input, "caseNo"),
          ),
        };
      case "get_complaint_export_view":
        return {
          toolName: request.toolName,
          output: this.getComplaintExportView(
            identity,
            this.requireString(request.input, "caseNo"),
          ),
        };
      default:
        return this.handleUnknownTool(request.toolName);
    }
  }

  hasTool(toolName: string): toolName is AssistantReadToolName {
    return TOOL_DEFINITIONS.some((definition) => definition.name === toolName);
  }

  private listDispatchJobs(identity: BootstrapRequestIdentity) {
    const visibleOrderIds = new Set(
      this.ownedMobilityService
        .listOrders()
        .filter((order) => this.canReadOrder(identity, order))
        .map((order) => order.orderId),
    );

    return this.ownedMobilityService
      .listDispatchJobs()
      .filter((job) => visibleOrderIds.has(job.orderId))
      .map((job) => this.maskPayload(job) as DispatchJobRecord);
  }

  private getOrder(identity: BootstrapRequestIdentity, orderId: string) {
    const order = this.requireVisibleOrder(identity, orderId);
    return this.maskPayload(order) as OwnedOrderRecord;
  }

  private getComplaintCase(identity: BootstrapRequestIdentity, caseNo: string) {
    const complaintCase = this.requireVisibleComplaint(identity, caseNo);
    return this.maskPayload(complaintCase) as ComplaintCaseRecord;
  }

  private getComplaintTimeline(
    identity: BootstrapRequestIdentity,
    caseNo: string,
  ) {
    this.requireVisibleComplaint(identity, caseNo);
    return this.complaintService
      .getComplaintTimeline(caseNo)
      .map((entry) => this.maskPayload(entry) as ComplaintTimelineEntry);
  }

  private getComplaintExportView(
    identity: BootstrapRequestIdentity,
    caseNo: string,
  ) {
    this.requireVisibleComplaint(identity, caseNo);
    return this.maskPayload(
      this.complaintService.getComplaintExportView(caseNo),
    ) as ComplaintExportViewRecord;
  }

  private requireVisibleOrder(
    identity: BootstrapRequestIdentity,
    orderId: string,
  ) {
    const order = this.ownedMobilityService.getOrder(orderId);
    if (this.canReadOrder(identity, order)) {
      return order;
    }

    throw new ApiRequestError(404, "ORDER_NOT_FOUND", "Order not found.", {
      orderId,
    });
  }

  private requireVisibleComplaint(
    identity: BootstrapRequestIdentity,
    caseNo: string,
  ) {
    const complaintCase = this.complaintService.getComplaintCase(caseNo);
    if (this.canReadComplaint(identity, complaintCase)) {
      return complaintCase;
    }

    throw new ApiRequestError(
      404,
      "COMPLAINT_CASE_NOT_FOUND",
      "Complaint case not found.",
      {
        caseNo,
      },
    );
  }

  private canReadComplaint(
    identity: BootstrapRequestIdentity,
    complaintCase: ComplaintCaseRecord,
  ) {
    if (this.hasGlobalReadAccess(identity)) {
      return true;
    }

    if (!complaintCase.relatedOrderId) {
      return false;
    }

    try {
      const linkedOrder = this.ownedMobilityService.getOrder(
        complaintCase.relatedOrderId,
      );
      return this.canReadOrder(identity, linkedOrder);
    } catch {
      return false;
    }
  }

  private canReadOrder(
    identity: BootstrapRequestIdentity,
    order: OwnedOrderRecord,
  ) {
    if (this.hasGlobalReadAccess(identity)) {
      return true;
    }

    if (identity.realm === "tenant") {
      return Boolean(identity.tenantId && identity.tenantId === order.tenantId);
    }

    if (identity.realm === "partner") {
      return Boolean(
        identity.partnerId &&
        identity.partnerId === order.partnerId &&
        (!identity.partnerProgramId ||
          identity.partnerProgramId === order.partnerProgramId) &&
        (!identity.partnerEntrySlug ||
          identity.partnerEntrySlug === order.partnerEntrySlug),
      );
    }

    return false;
  }

  private hasGlobalReadAccess(identity: BootstrapRequestIdentity) {
    return (
      identity.realm === "system" ||
      identity.realm === "platform" ||
      identity.realm === "ops"
    );
  }

  private requireIdentity(identity: BootstrapRequestIdentity | null) {
    if (identity) {
      return identity;
    }

    throw new ApiRequestError(
      403,
      "ASSISTANT_TOOL_IDENTITY_REQUIRED",
      "Assistant read tools require caller identity context.",
    );
  }

  private requireString(
    input: Record<string, unknown> | undefined,
    field: string,
  ) {
    const value = input?.[field];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    throw new ApiRequestError(
      400,
      "ASSISTANT_TOOL_INPUT_INVALID",
      `Assistant read tool field '${field}' is required.`,
      { field },
    );
  }

  private maskPayload(value: unknown, key?: string): unknown {
    if (key === "lat" || key === "lng") {
      return null;
    }

    if (typeof value === "string") {
      return this.maskString(key, value);
    }

    if (Array.isArray(value)) {
      return value.map((entry) => this.maskPayload(entry));
    }

    if (!value || typeof value !== "object") {
      return value;
    }

    const masked: Record<string, unknown> = {};
    for (const [entryKey, entryValue] of Object.entries(
      value as Record<string, unknown>,
    )) {
      masked[entryKey] = this.maskPayload(entryValue, entryKey);
    }

    return masked;
  }

  private maskString(key: string | undefined, value: string) {
    switch (key) {
      case "name":
      case "fullName":
      case "displayName":
      case "accountName":
        return maskName(value) ?? null;
      case "phone":
      case "mobile":
        return maskPhone(value) ?? null;
      case "email":
        return maskEmail(value) ?? null;
      case "address":
      case "addressText":
      case "normalizedAddress":
      case "maskedAddress":
      case "maskedAddressText":
        return maskAddress(value) ?? null;
      case "callId":
      case "relatedCallId":
      case "recordingId":
      case "providerRecordingRef":
      case "issuerAuthorizationRef":
      case "benefitReference":
        return maskOpaqueToken(value, 8, 4) ?? null;
      case "description":
      case "note":
      case "notes":
      case "closingNote":
        return REDACTED_TEXT;
      default:
        return value;
    }
  }

  private handleUnknownTool(toolName: string): never {
    throw new ApiRequestError(
      400,
      "ASSISTANT_TOOL_NOT_REGISTERED",
      "Assistant read tool is not registered.",
      { toolName },
    );
  }
}
