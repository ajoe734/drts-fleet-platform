import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Param,
  Post,
  Patch,
} from "@nestjs/common";

import type {
  CreateIncidentCommand,
  CreateIncidentFromDispatchExceptionCommand,
  LinkComplaintToIncidentCommand,
  RecordServiceRecoveryActionCommand,
  UpdateIncidentCommand,
} from "@drts/contracts";

import {
  ApiRequestError,
  toApiSuccessEnvelope,
} from "../../common/api-envelope";
import { ComplaintService } from "../complaint/complaint.service";
import { IncidentService } from "./incident.service";

@Controller("incidents")
export class IncidentController {
  constructor(
    private readonly incidentService: IncidentService,
    private readonly complaintService: ComplaintService,
  ) {}

  @Post()
  createIncident(
    @Body() command: CreateIncidentCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.incidentService.createIncident(command, requestId),
      requestId,
    );
  }

  @Get()
  listIncidents(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      { items: this.incidentService.listIncidents() },
      requestId,
    );
  }

  @Get(":incidentId")
  getIncident(
    @Param("incidentId") incidentId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.incidentService.getIncident(incidentId),
      requestId,
    );
  }

  @Patch(":incidentId")
  updateIncident(
    @Param("incidentId") incidentId: string,
    @Body() command: UpdateIncidentCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.incidentService.updateIncident(incidentId, command, requestId),
      requestId,
    );
  }

  @Get(":incidentId/timeline")
  getTimeline(
    @Param("incidentId") incidentId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      { items: this.incidentService.getTimeline(incidentId) },
      requestId,
    );
  }

  @Post("from-dispatch-exception")
  createFromDispatchException(
    @Body() command: CreateIncidentFromDispatchExceptionCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.incidentService.createFromDispatchException(command, requestId),
      requestId,
    );
  }

  @Post(":incidentId/service-recovery")
  recordServiceRecoveryAction(
    @Param("incidentId") incidentId: string,
    @Body() command: RecordServiceRecoveryActionCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.incidentService.recordServiceRecoveryAction(
        incidentId,
        command,
        requestId,
      ),
      requestId,
    );
  }

  @Get(":incidentId/service-recovery")
  getServiceRecoveryActions(
    @Param("incidentId") incidentId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      {
        items: this.incidentService.getServiceRecoveryActions(incidentId),
      },
      requestId,
    );
  }

  @Post(":incidentId/link-complaint")
  linkComplaint(
    @Param("incidentId") incidentId: string,
    @Body() body: { complaintCaseNo: string },
    @Headers("x-request-id") requestId?: string,
  ) {
    const incidentRecord = this.incidentService.getIncident(incidentId);
    const complaintCase = this.complaintService.getComplaintCase(
      body.complaintCaseNo,
    );
    if (
      incidentRecord.relatedComplaintCaseNo &&
      incidentRecord.relatedComplaintCaseNo !== complaintCase.caseNo
    ) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "INCIDENT_COMPLAINT_LINK_CONFLICT",
        "This incident is already linked to a different complaint case.",
        {
          incidentId,
          existingComplaintCaseNo: incidentRecord.relatedComplaintCaseNo,
          requestedComplaintCaseNo: complaintCase.caseNo,
        },
      );
    }
    if (
      complaintCase.relatedIncidentId &&
      complaintCase.relatedIncidentId !== incidentRecord.incidentId
    ) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "COMPLAINT_INCIDENT_LINK_CONFLICT",
        "This complaint case is already linked to a different incident.",
        {
          caseNo: complaintCase.caseNo,
          existingIncidentId: complaintCase.relatedIncidentId,
          requestedIncidentId: incidentRecord.incidentId,
        },
      );
    }
    const incident = this.incidentService.linkComplaint(
      incidentId,
      body.complaintCaseNo,
      requestId,
    );
    this.complaintService.linkIncident(
      body.complaintCaseNo,
      {
        incidentId,
      } satisfies LinkComplaintToIncidentCommand,
      requestId,
    );
    return toApiSuccessEnvelope(incident, requestId);
  }
}
