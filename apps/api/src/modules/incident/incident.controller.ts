import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Param,
  Patch,
  Post,
} from "@nestjs/common";

import type {
  CreateIncidentCommand,
  CreateIncidentFromDispatchExceptionCommand,
  IncidentMutationResult,
  IncidentServiceRecoveryActionResult,
  LinkComplaintToIncidentCommand,
  RecordServiceRecoveryActionCommand,
  UpdateIncidentCommand,
} from "@drts/contracts";

import {
  ApiRequestError,
  toApiSuccessEnvelope,
} from "../../common/api-envelope";
import {
  CurrentIdentity,
  type BootstrapRequestIdentity,
} from "../../common/auth";
import {
  buildEmptyStateEnvelope,
  buildUiReadModelList,
  buildUiReadModelResource,
} from "../../common/ui-read-model";
import { ComplaintService } from "../complaint/complaint.service";
import { IncidentService } from "./incident.service";

const INCIDENT_REFRESH_STALE_AFTER_MS = 15_000;

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
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
  ) {
    return toApiSuccessEnvelope(
      this.incidentService.createIncident(command, requestId, identity),
      requestId,
    );
  }

  @Get()
  listIncidents(
    @Headers("x-request-id") requestId?: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
  ) {
    return toApiSuccessEnvelope(
      buildUiReadModelList(this.incidentService.listIncidents(identity), {
        staleAfterMs: INCIDENT_REFRESH_STALE_AFTER_MS,
        emptyState: buildEmptyStateEnvelope("no_data", "incidents.empty"),
      }),
      requestId,
    );
  }

  @Get(":incidentId")
  getIncident(
    @Param("incidentId") incidentId: string,
    @Headers("x-request-id") requestId?: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
  ) {
    return toApiSuccessEnvelope(
      buildUiReadModelResource(
        this.incidentService.getIncident(incidentId, identity),
        {
          staleAfterMs: INCIDENT_REFRESH_STALE_AFTER_MS,
        },
      ),
      requestId,
    );
  }

  @Patch(":incidentId")
  updateIncident(
    @Param("incidentId") incidentId: string,
    @Body() command: UpdateIncidentCommand,
    @Headers("x-request-id") requestId?: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
  ) {
    return toApiSuccessEnvelope(
      this.incidentService.updateIncidentWithReceipt(
        incidentId,
        command,
        requestId,
      ) satisfies IncidentMutationResult,
      requestId,
    );
  }

  @Get(":incidentId/timeline")
  getTimeline(
    @Param("incidentId") incidentId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      buildUiReadModelList(this.incidentService.getTimeline(incidentId), {
        staleAfterMs: INCIDENT_REFRESH_STALE_AFTER_MS,
        emptyState: buildEmptyStateEnvelope("no_data", "incidents.timeline.empty"),
      }),
      requestId,
    );
  }

  @Post("from-dispatch-exception")
  createFromDispatchException(
    @Body() command: CreateIncidentFromDispatchExceptionCommand,
    @Headers("x-request-id") requestId?: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
  ) {
    return toApiSuccessEnvelope(
      this.incidentService.createFromDispatchException(
        command,
        requestId,
        identity,
      ),
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
      this.incidentService.recordServiceRecoveryActionWithReceipt(
        incidentId,
        command,
        requestId,
      ) satisfies IncidentServiceRecoveryActionResult,
      requestId,
    );
  }

  @Post(":incidentId/matching-suppression/extend")
  extendMatchingSuppression(
    @Param("incidentId") incidentId: string,
    @Body() command: ExtendDriverMatchingSuppressionCommand,
    @Headers("x-request-id") requestId?: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
  ) {
    return toApiSuccessEnvelope(
      this.incidentService.extendMatchingSuppression(
        incidentId,
        command,
        identity,
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
      buildUiReadModelList(
        this.incidentService.getServiceRecoveryActions(incidentId),
        {
          staleAfterMs: INCIDENT_REFRESH_STALE_AFTER_MS,
          emptyState: buildEmptyStateEnvelope(
            "no_data",
            "incidents.service_recovery.empty",
          ),
        },
      ),
      requestId,
    );
  }

  @Post(":incidentId/link-complaint")
  linkComplaint(
    @Param("incidentId") incidentId: string,
    @Body() body: { complaintCaseNo: string },
    @Headers("x-request-id") requestId?: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
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
      identity,
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
