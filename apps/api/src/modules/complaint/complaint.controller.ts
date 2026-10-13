import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Param,
  Post,
  Res,
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
import { IdempotencyService } from "../../common/idempotency";
import type { PassthroughResponseLike } from "../../common/idempotency-http";
import { applyIdempotentResponseHeaders } from "../../common/idempotency-http";
import { IncidentService } from "../incident/incident.service";
import { ComplaintService } from "./complaint.service";

@Controller("complaints")
export class ComplaintController {
  constructor(
    private readonly complaintService: ComplaintService,
    private readonly incidentService: IncidentService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  @Post()
  async createComplaintCase(
    @Body() command: CreateComplaintCaseCommand,
    @Res({ passthrough: true }) response: PassthroughResponseLike,
    @Headers("idempotency-key") idempotencyKey?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const result = await this.idempotencyService.execute({
      scope: "crm:complaint:case_create",
      idempotencyKey,
      requestPath: "complaints",
      payload: command,
      execute: async () => {
        const data = this.complaintService.createComplaintCase(
          command,
          requestId,
        );
        await this.complaintService.awaitSettlementPersistence(data.caseNo);
        return { data, statusCode: HttpStatus.CREATED };
      },
    });

    applyIdempotentResponseHeaders(response, result);
    return toApiSuccessEnvelope(result.data, requestId);
  }

  @Get()
  async listComplaintCases(@Headers("x-request-id") requestId?: string) {
    await this.complaintService.refreshSettlementCases();
    return toApiSuccessEnvelope(
      {
        items: this.complaintService.listComplaintCases(),
      },
      requestId,
    );
  }

  @Post("evaluate-sla-breach")
  async evaluateAllSlaBreach(@Headers("x-request-id") requestId?: string) {
    await this.complaintService.refreshSettlementCases();
    const breached = this.complaintService.evaluateAllSlaBreach(requestId);
    await this.complaintService.awaitSettlementPersistence();
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
  async getComplaintCase(
    @Param("caseNo") caseNo: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    await this.complaintService.refreshSettlementCases();
    return toApiSuccessEnvelope(
      this.complaintService.getComplaintCase(caseNo),
      requestId,
    );
  }

  @Get(":caseNo/timeline")
  async getComplaintTimeline(
    @Param("caseNo") caseNo: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    await this.complaintService.refreshSettlementCases();
    return toApiSuccessEnvelope(
      {
        items: this.complaintService.getComplaintTimeline(caseNo),
      },
      requestId,
    );
  }

  @Post(":caseNo/assign")
  async assignComplaintCase(
    @Param("caseNo") caseNo: string,
    @Body() command: AssignComplaintCaseCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    await this.complaintService.refreshSettlementCases();
    const updated = this.complaintService.assignComplaintCase(
      caseNo,
      command,
      requestId,
    );
    await this.complaintService.awaitSettlementPersistence(caseNo);
    return toApiSuccessEnvelope(updated, requestId);
  }

  @Post(":caseNo/notes")
  async addComplaintCaseNote(
    @Param("caseNo") caseNo: string,
    @Body() command: AddComplaintCaseNoteCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    await this.complaintService.refreshSettlementCases();
    const updated = this.complaintService.addComplaintCaseNote(
      caseNo,
      command,
      requestId,
    );
    await this.complaintService.awaitSettlementPersistence(caseNo);
    return toApiSuccessEnvelope(updated, requestId);
  }

  @Get(":caseNo/export")
  async getComplaintExportView(
    @Param("caseNo") caseNo: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    await this.complaintService.refreshSettlementCases();
    return toApiSuccessEnvelope(
      this.complaintService.getComplaintExportView(caseNo),
      requestId,
    );
  }

  @Post(":caseNo/reopen")
  async reopenComplaintCase(
    @Param("caseNo") caseNo: string,
    @Body() command: ReopenComplaintCaseCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    await this.complaintService.refreshSettlementCases();
    const updated = this.complaintService.reopenComplaintCase(
      caseNo,
      command,
      requestId,
    );
    await this.complaintService.awaitSettlementPersistence(caseNo);
    return toApiSuccessEnvelope(updated, requestId);
  }

  @Post(":caseNo/resolve")
  async resolveComplaintCase(
    @Param("caseNo") caseNo: string,
    @Body() command: ResolveComplaintCaseCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    await this.complaintService.refreshSettlementCases();
    const updated = this.complaintService.resolveComplaintCase(
      caseNo,
      command,
      requestId,
    );
    await this.complaintService.awaitSettlementPersistence(caseNo);
    return toApiSuccessEnvelope(updated, requestId);
  }

  @Post(":caseNo/close")
  async closeComplaintCase(
    @Param("caseNo") caseNo: string,
    @Body() command: ResolveComplaintCaseCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    await this.complaintService.refreshSettlementCases();
    const updated = this.complaintService.closeComplaintCase(
      caseNo,
      command,
      requestId,
    );
    await this.complaintService.awaitSettlementPersistence(caseNo);
    return toApiSuccessEnvelope(updated, requestId);
  }

  @Post(":caseNo/escalate-to-incident")
  async escalateToIncident(
    @Param("caseNo") caseNo: string,
    @Body() command: EscalateComplaintToIncidentCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return this.complaintService.withIncidentLink(caseNo, async () => {
      await this.complaintService.refreshSettlementCases();
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
          complaintCase.category === "safety_concern"
            ? "safety"
            : "operational",
        severity: command.severity,
        reportedBy: complaintCase.assigneeId ?? "system",
      };
      if (complaintCase.relatedOrderId) {
        createIncidentInput.relatedOrderId = complaintCase.relatedOrderId;
      }
      const preparedIncident =
        this.incidentService.prepareIncident(createIncidentInput);
      return this.incidentService.withComplaintLink(
        preparedIncident.incident.incidentId,
        async () => {
          await this.complaintService.refreshSettlementCases();
          const currentCase = this.complaintService.getComplaintCase(caseNo);
          if (currentCase.relatedIncidentId) {
            throw new ApiRequestError(
              HttpStatus.CONFLICT,
              "COMPLAINT_ALREADY_ESCALATED",
              "This complaint case is already linked to an incident.",
              { caseNo, existingIncidentId: currentCase.relatedIncidentId },
            );
          }
          const updatedCase = this.complaintService.escalateToIncident(
            caseNo,
            preparedIncident.incident.incidentId,
            command.reason,
            requestId,
          );
          await this.complaintService.awaitSettlementPersistence(caseNo);
          const createdIncident = this.incidentService.publishPreparedIncident(
            preparedIncident,
            requestId,
          );
          const incident = currentCase.assigneeId
            ? this.incidentService.updateIncident(
                createdIncident.incidentId,
                { assignedTo: currentCase.assigneeId },
                requestId,
              )
            : createdIncident;
          const linkedIncident = this.incidentService.linkComplaint(
            incident.incidentId,
            caseNo,
            requestId,
          );
          return toApiSuccessEnvelope(
            { complaintCase: updatedCase, incident: linkedIncident },
            requestId,
          );
        },
      );
    });
  }

  @Post(":caseNo/link-incident")
  async linkIncident(
    @Param("caseNo") caseNo: string,
    @Body() command: LinkComplaintToIncidentCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return this.complaintService.withIncidentLink(caseNo, async () => {
      return this.incidentService.withComplaintLink(
        command.incidentId,
        async () => {
          await this.complaintService.refreshSettlementCases();
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
          await this.complaintService.awaitSettlementPersistence(caseNo);
          this.incidentService.linkComplaint(
            command.incidentId,
            caseNo,
            requestId,
          );
          return toApiSuccessEnvelope(updatedComplaintCase, requestId);
        },
      );
    });
  }

  @Post(":caseNo/sla-breach")
  async markComplaintSlaBreach(
    @Param("caseNo") caseNo: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    await this.complaintService.refreshSettlementCases();
    const updated = this.complaintService.markComplaintSlaBreach(
      caseNo,
      requestId,
    );
    await this.complaintService.awaitSettlementPersistence(caseNo);
    return toApiSuccessEnvelope(updated, requestId);
  }
}
