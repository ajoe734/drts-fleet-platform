import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Param,
  Post,
} from "@nestjs/common";

import type {
  AddComplaintCaseNoteCommand,
  AssignComplaintCaseCommand,
  CreateComplaintCaseCommand,
  EscalateComplaintToIncidentCommand,
  LinkComplaintToIncidentCommand,
  ReopenComplaintCaseCommand,
  ResolveComplaintCaseCommand,
} from "@drts/contracts";

import {
  ApiRequestError,
  toApiSuccessEnvelope,
} from "../../common/api-envelope";
import { IncidentService } from "../incident/incident.service";
import { ComplaintService } from "./complaint.service";

@Controller("complaints")
export class ComplaintController {
  constructor(
    private readonly complaintService: ComplaintService,
    private readonly incidentService: IncidentService,
  ) {}

  @Post()
  createComplaintCase(
    @Body() command: CreateComplaintCaseCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.complaintService.createComplaintCase(command, requestId),
      requestId,
    );
  }

  @Get()
  listComplaintCases(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      this.complaintService.listComplaintCases(),
      requestId,
    );
  }

  @Post("evaluate-sla-breach")
  evaluateAllSlaBreach(@Headers("x-request-id") requestId?: string) {
    const breached = this.complaintService.evaluateAllSlaBreach(requestId);
    return toApiSuccessEnvelope(
      { breachedCount: breached.length, items: breached },
      requestId,
    );
  }

  @Get("resolution-codes/:category")
  getValidResolutionCodes(
    @Param("category") category: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      {
        category,
        codes: this.complaintService.getValidResolutionCodes(category),
      },
      requestId,
    );
  }

  @Get(":caseNo")
  getComplaintCase(
    @Param("caseNo") caseNo: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.complaintService.getComplaintCase(caseNo),
      requestId,
    );
  }

  @Get(":caseNo/timeline")
  getComplaintTimeline(
    @Param("caseNo") caseNo: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      {
        items: this.complaintService.getComplaintTimeline(caseNo),
      },
      requestId,
    );
  }

  @Post(":caseNo/assign")
  assignComplaintCase(
    @Param("caseNo") caseNo: string,
    @Body() command: AssignComplaintCaseCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.complaintService.assignComplaintCase(caseNo, command, requestId),
      requestId,
    );
  }

  @Post(":caseNo/notes")
  addComplaintCaseNote(
    @Param("caseNo") caseNo: string,
    @Body() command: AddComplaintCaseNoteCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.complaintService.addComplaintCaseNote(caseNo, command, requestId),
      requestId,
    );
  }

  @Get(":caseNo/export")
  getComplaintExportView(
    @Param("caseNo") caseNo: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.complaintService.getComplaintExportView(caseNo),
      requestId,
    );
  }

  @Post(":caseNo/reopen")
  reopenComplaintCase(
    @Param("caseNo") caseNo: string,
    @Body() command: ReopenComplaintCaseCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.complaintService.reopenComplaintCase(caseNo, command, requestId),
      requestId,
    );
  }

  @Post(":caseNo/resolve")
  resolveComplaintCase(
    @Param("caseNo") caseNo: string,
    @Body() command: ResolveComplaintCaseCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.complaintService.resolveComplaintCase(caseNo, command, requestId),
      requestId,
    );
  }

  @Post(":caseNo/close")
  closeComplaintCase(
    @Param("caseNo") caseNo: string,
    @Body() command: ResolveComplaintCaseCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.complaintService.closeComplaintCase(caseNo, command, requestId),
      requestId,
    );
  }

  @Post(":caseNo/escalate-to-incident")
  escalateToIncident(
    @Param("caseNo") caseNo: string,
    @Body() command: EscalateComplaintToIncidentCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    const complaintCase = this.complaintService.getComplaintCase(caseNo);
    if (complaintCase.relatedIncidentId) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "COMPLAINT_ALREADY_ESCALATED",
        "This complaint case is already linked to an incident.",
        {
          caseNo,
          existingIncidentId: complaintCase.relatedIncidentId,
        },
      );
    }
    const createIncidentInput: Parameters<
      typeof this.incidentService.createIncident
    >[0] = {
      title: command.title,
      description: `Escalated from complaint ${caseNo}: ${command.reason}`,
      category:
        complaintCase.category === "safety_concern" ? "safety" : "operational",
      severity: command.severity,
      reportedBy: complaintCase.assigneeId ?? "system",
    };
    if (complaintCase.relatedOrderId) {
      createIncidentInput.relatedOrderId = complaintCase.relatedOrderId;
    }
    const createdIncident = this.incidentService.createIncident(
      createIncidentInput,
      requestId,
    );
    const incident = complaintCase.assigneeId
      ? this.incidentService.updateIncident(
          createdIncident.incidentId,
          {
            assignedTo: complaintCase.assigneeId,
          },
          requestId,
        )
      : createdIncident;
    const updatedCase = this.complaintService.escalateToIncident(
      caseNo,
      incident.incidentId,
      command.reason,
      requestId,
    );
    this.incidentService.linkComplaint(incident.incidentId, caseNo, requestId);
    return toApiSuccessEnvelope(
      { complaintCase: updatedCase, incident },
      requestId,
    );
  }

  @Post(":caseNo/link-incident")
  linkIncident(
    @Param("caseNo") caseNo: string,
    @Body() command: LinkComplaintToIncidentCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    const complaintCase = this.complaintService.getComplaintCase(caseNo);
    const incident = this.incidentService.getIncident(command.incidentId);
    if (
      complaintCase.relatedIncidentId &&
      complaintCase.relatedIncidentId !== incident.incidentId
    ) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "COMPLAINT_INCIDENT_LINK_CONFLICT",
        "This complaint case is already linked to a different incident.",
        {
          caseNo,
          existingIncidentId: complaintCase.relatedIncidentId,
          requestedIncidentId: incident.incidentId,
        },
      );
    }
    if (
      incident.relatedComplaintCaseNo &&
      incident.relatedComplaintCaseNo !== caseNo
    ) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "INCIDENT_COMPLAINT_LINK_CONFLICT",
        "This incident is already linked to a different complaint case.",
        {
          incidentId: incident.incidentId,
          existingComplaintCaseNo: incident.relatedComplaintCaseNo,
          requestedComplaintCaseNo: caseNo,
        },
      );
    }
    const updatedComplaintCase = this.complaintService.linkIncident(
      caseNo,
      command,
      requestId,
    );
    this.incidentService.linkComplaint(command.incidentId, caseNo, requestId);
    return toApiSuccessEnvelope(updatedComplaintCase, requestId);
  }

  @Post(":caseNo/sla-breach")
  markComplaintSlaBreach(
    @Param("caseNo") caseNo: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.complaintService.markComplaintSlaBreach(caseNo, requestId),
      requestId,
    );
  }
}
