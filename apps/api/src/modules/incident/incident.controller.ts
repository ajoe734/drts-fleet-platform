import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Patch,
} from "@nestjs/common";

import type {
  CreateIncidentCommand,
  UpdateIncidentCommand,
} from "@drts/contracts";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import { IncidentService } from "./incident.service";

@Controller("incidents")
export class IncidentController {
  constructor(private readonly incidentService: IncidentService) {}

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

  @Post(":incidentId/link-complaint")
  linkComplaint(
    @Param("incidentId") incidentId: string,
    @Body() body: { complaintCaseNo: string },
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.incidentService.linkComplaint(
        incidentId,
        body.complaintCaseNo,
        requestId,
      ),
      requestId,
    );
  }
}
