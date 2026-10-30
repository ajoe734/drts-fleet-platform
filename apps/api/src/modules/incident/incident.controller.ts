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
  ExtendDriverMatchingSuppressionCommand,
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
    const result = this.incidentService.createIncidentForCommit(
      command,
      requestId,
      identity,
    );
    return result instanceof Promise
      ? result.then((item) => toApiSuccessEnvelope(item, requestId))
      : toApiSuccessEnvelope(result, requestId);
  }

  @Get()
  listIncidents(
    @Headers("x-request-id") requestId?: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
  ) {
    const respond = (items: ReturnType<IncidentService["listIncidents"]>) =>
      toApiSuccessEnvelope(
        buildUiReadModelList(items, {
          staleAfterMs: INCIDENT_REFRESH_STALE_AFTER_MS,
          emptyState: buildEmptyStateEnvelope("no_data", "incidents.empty"),
        }),
        requestId,
      );
    const items = this.incidentService.listIncidentsForReadback(identity);
    return items instanceof Promise ? items.then(respond) : respond(items);
  }

  @Get(":incidentId")
  getIncident(
    @Param("incidentId") incidentId: string,
    @Headers("x-request-id") requestId?: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
  ) {
    const respond = (item: ReturnType<IncidentService["getIncident"]>) =>
      toApiSuccessEnvelope(
        buildUiReadModelResource(item, {
          staleAfterMs: INCIDENT_REFRESH_STALE_AFTER_MS,
        }),
        requestId,
      );
    const item = this.incidentService.getIncidentForReadback(
      incidentId,
      identity,
    );
    return item instanceof Promise ? item.then(respond) : respond(item);
  }

  @Patch(":incidentId")
  updateIncident(
    @Param("incidentId") incidentId: string,
    @Body() command: UpdateIncidentCommand,
    @Headers("x-request-id") requestId?: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
  ) {
    const result = this.incidentService.updateIncidentForCommit(
      incidentId,
      command,
      requestId,
      identity,
    );
    return result instanceof Promise
      ? result.then((item) => toApiSuccessEnvelope(item, requestId))
      : toApiSuccessEnvelope(result, requestId);
  }

  @Get(":incidentId/timeline")
  getTimeline(
    @Param("incidentId") incidentId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const respond = (items: ReturnType<IncidentService["getTimeline"]>) =>
      toApiSuccessEnvelope(
        buildUiReadModelList(items, {
          staleAfterMs: INCIDENT_REFRESH_STALE_AFTER_MS,
          emptyState: buildEmptyStateEnvelope(
            "no_data",
            "incidents.timeline.empty",
          ),
        }),
        requestId,
      );
    const items = this.incidentService.getTimelineForReadback(incidentId);
    return items instanceof Promise ? items.then(respond) : respond(items);
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
    const result = this.incidentService.recordServiceRecoveryActionForCommit(
      incidentId,
      command,
      requestId,
    );
    return result instanceof Promise
      ? result.then((item) => toApiSuccessEnvelope(item, requestId))
      : toApiSuccessEnvelope(result, requestId);
  }

  @Post(":incidentId/matching-suppression/extend")
  extendMatchingSuppression(
    @Param("incidentId") incidentId: string,
    @Body() command: ExtendDriverMatchingSuppressionCommand,
    @Headers("x-request-id") requestId?: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
  ) {
    const result = this.incidentService.extendMatchingSuppressionForCommit(
      incidentId,
      command,
      identity,
      requestId,
    );
    return result instanceof Promise
      ? result.then((item) => toApiSuccessEnvelope(item, requestId))
      : toApiSuccessEnvelope(result, requestId);
  }

  @Get(":incidentId/service-recovery")
  getServiceRecoveryActions(
    @Param("incidentId") incidentId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const respond = (
      items: ReturnType<IncidentService["getServiceRecoveryActions"]>,
    ) =>
      toApiSuccessEnvelope(
        buildUiReadModelList(items, {
          staleAfterMs: INCIDENT_REFRESH_STALE_AFTER_MS,
          emptyState: buildEmptyStateEnvelope(
            "no_data",
            "incidents.service_recovery.empty",
          ),
        }),
        requestId,
      );
    const items =
      this.incidentService.getServiceRecoveryActionsForReadback(incidentId);
    return items instanceof Promise ? items.then(respond) : respond(items);
  }

  @Post(":incidentId/link-complaint")
  async linkComplaint(
    @Param("incidentId") incidentId: string,
    @Body() body: { complaintCaseNo: string },
    @Headers("x-request-id") requestId?: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
  ) {
    return this.complaintService.withIncidentLink(
      body.complaintCaseNo,
      async () => {
        return this.incidentService.withComplaintLink(incidentId, async () => {
          await this.complaintService.refreshSettlementCases();
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
          this.complaintService.linkIncident(
            body.complaintCaseNo,
            {
              incidentId,
            } satisfies LinkComplaintToIncidentCommand,
            requestId,
          );
          await this.complaintService.awaitSettlementPersistence(
            body.complaintCaseNo,
          );
          const incident = await this.incidentService.linkComplaintForCommit(
            incidentId,
            body.complaintCaseNo,
            requestId,
            identity,
          );
          return toApiSuccessEnvelope(incident, requestId);
        });
      },
    );
  }
}
