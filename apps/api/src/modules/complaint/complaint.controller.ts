import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
} from "@nestjs/common";

import type {
  ActionReceipt,
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
import {
  ComplaintService,
  type ComplaintAuditActor,
} from "./complaint.service";
import { toActionReceipt } from "../../common/action-receipt";
import { CurrentIdentity } from "../../common/auth/auth.decorators";

function toComplaintActionEnvelope<T>(
  data: T,
  actionReceipt: ActionReceipt,
  requestId?: string,
) {
  const envelope = toApiSuccessEnvelope(
    data,
    requestId ?? actionReceipt.actionId,
  );
  return { ...envelope, meta: { ...envelope.meta, actionReceipt } };
}

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
        await this.complaintService.refreshSettlementCases();
        const created = await this.complaintService.createComplaintCase(
          command,
          requestId,
          {
            captureAudit: true,
            commandIdentity: {
              scope: "crm:complaint:case_create",
              key: idempotencyKey!,
            },
          },
        );
        const data = created.data;
        await this.complaintService.awaitSettlementPersistence(data.caseNo);
        return {
          data,
          statusCode: HttpStatus.CREATED,
          actionReceipt: toActionReceipt({
            auditLog: created.auditLog,
            message: "Complaint case created.",
          }),
        };
      },
    });

    applyIdempotentResponseHeaders(response, result);
    const actionReceipt =
      result.actionReceipt ??
      toActionReceipt({
        auditLog: (
          await this.complaintService.acknowledgeExistingCaseAction(
            result.data,
            "create_complaint_case",
            requestId,
          )
        ).auditLog,
        message: "Existing complaint case returned.",
      });
    return toComplaintActionEnvelope(result.data, actionReceipt, requestId);
  }

  @Get()
  async listComplaintCases(@Headers("x-request-id") requestId?: string) {
    await this.complaintService.refreshSettlementCases();
    return toApiSuccessEnvelope(
      {
        items: await this.complaintService.listComplaintCasesForOps(),
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
      await this.complaintService.getComplaintCaseForOps(caseNo),
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
        items: await this.complaintService.getComplaintTimelineForOps(caseNo),
      },
      requestId,
    );
  }

  @Post(":caseNo/assign")
  async assignComplaintCase(
    @Param("caseNo") caseNo: string,
    @Body() command: AssignComplaintCaseCommand,
    @Headers("x-request-id") requestId?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
    @CurrentIdentity() identity: ComplaintAuditActor | null = null,
  ) {
    await this.complaintService.refreshSettlementCases();
    const updated = await this.complaintService.assignComplaintCase(
      caseNo,
      command,
      requestId,
      {
        captureAudit: true,
        ...(identity
          ? {
              auditActor: {
                actorId: identity.actorId,
                actorType: identity.actorType,
                tenantId: identity.tenantId,
              },
            }
          : {}),
        ...(idempotencyKey?.trim()
          ? {
              commandIdentity: {
                scope: `crm:complaint:${caseNo}:assignComplaintCase`,
                key: idempotencyKey,
              },
            }
          : {}),
      },
    );
    await this.complaintService.awaitSettlementPersistence(caseNo);
    return toComplaintActionEnvelope(
      updated.data,
      toActionReceipt({
        auditLog: updated.auditLog,
        message: "Complaint case updated.",
      }),
      requestId,
    );
  }

  @Post(":caseNo/notes")
  async addComplaintCaseNote(
    @Param("caseNo") caseNo: string,
    @Body() command: AddComplaintCaseNoteCommand,
    @Headers("x-request-id") requestId?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
    @CurrentIdentity() identity: ComplaintAuditActor | null = null,
  ) {
    await this.complaintService.refreshSettlementCases();
    const updated = await this.complaintService.addComplaintCaseNote(
      caseNo,
      command,
      requestId,
      {
        captureAudit: true,
        ...(identity
          ? {
              auditActor: {
                actorId: identity.actorId,
                actorType: identity.actorType,
                tenantId: identity.tenantId,
              },
            }
          : {}),
        ...(idempotencyKey?.trim()
          ? {
              commandIdentity: {
                scope: `crm:complaint:${caseNo}:addComplaintCaseNote`,
                key: idempotencyKey,
              },
            }
          : {}),
      },
    );
    await this.complaintService.awaitSettlementPersistence(caseNo);
    return toComplaintActionEnvelope(
      updated.data,
      toActionReceipt({
        auditLog: updated.auditLog,
        message: "Complaint case updated.",
      }),
      requestId,
    );
  }

  @Get(":caseNo/export")
  async getComplaintExportView(
    @Param("caseNo") caseNo: string,
    @Headers("x-request-id") requestId?: string,
    @Query("action_receipt") captureReceipt?: string,
  ) {
    await this.complaintService.refreshSettlementCases();
    if (captureReceipt === "true") {
      const result =
        await this.complaintService.getComplaintExportViewWithReceipt(
          caseNo,
          requestId,
        );
      return toComplaintActionEnvelope(
        result.data,
        toActionReceipt({
          auditLog: result.auditLog,
          message: "Complaint export view prepared.",
        }),
        requestId,
      );
    }
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
    @Headers("idempotency-key") idempotencyKey?: string,
    @CurrentIdentity() identity: ComplaintAuditActor | null = null,
  ) {
    await this.complaintService.refreshSettlementCases();
    const updated = await this.complaintService.reopenComplaintCase(
      caseNo,
      command,
      requestId,
      {
        captureAudit: true,
        ...(identity
          ? {
              auditActor: {
                actorId: identity.actorId,
                actorType: identity.actorType,
                tenantId: identity.tenantId,
              },
            }
          : {}),
        ...(idempotencyKey?.trim()
          ? {
              commandIdentity: {
                scope: `crm:complaint:${caseNo}:reopenComplaintCase`,
                key: idempotencyKey,
              },
            }
          : {}),
      },
    );
    await this.complaintService.awaitSettlementPersistence(caseNo);
    return toComplaintActionEnvelope(
      updated.data,
      toActionReceipt({
        auditLog: updated.auditLog,
        message: "Complaint case updated.",
      }),
      requestId,
    );
  }

  @Post(":caseNo/resolve")
  async resolveComplaintCase(
    @Param("caseNo") caseNo: string,
    @Body() command: ResolveComplaintCaseCommand,
    @Headers("x-request-id") requestId?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
    @CurrentIdentity() identity: ComplaintAuditActor | null = null,
  ) {
    await this.complaintService.refreshSettlementCases();
    const updated = await this.complaintService.resolveComplaintCase(
      caseNo,
      command,
      requestId,
      {
        captureAudit: true,
        ...(identity
          ? {
              auditActor: {
                actorId: identity.actorId,
                actorType: identity.actorType,
                tenantId: identity.tenantId,
              },
            }
          : {}),
        ...(idempotencyKey?.trim()
          ? {
              commandIdentity: {
                scope: `crm:complaint:${caseNo}:resolveComplaintCase`,
                key: idempotencyKey,
              },
            }
          : {}),
      },
    );
    await this.complaintService.awaitSettlementPersistence(caseNo);
    return toComplaintActionEnvelope(
      updated.data,
      toActionReceipt({
        auditLog: updated.auditLog,
        message: "Complaint case updated.",
      }),
      requestId,
    );
  }

  @Post(":caseNo/close")
  async closeComplaintCase(
    @Param("caseNo") caseNo: string,
    @Body() command: ResolveComplaintCaseCommand,
    @Headers("x-request-id") requestId?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
    @CurrentIdentity() identity: ComplaintAuditActor | null = null,
  ) {
    await this.complaintService.refreshSettlementCases();
    const updated = await this.complaintService.closeComplaintCase(
      caseNo,
      command,
      requestId,
      {
        captureAudit: true,
        ...(identity
          ? {
              auditActor: {
                actorId: identity.actorId,
                actorType: identity.actorType,
                tenantId: identity.tenantId,
              },
            }
          : {}),
        ...(idempotencyKey?.trim()
          ? {
              commandIdentity: {
                scope: `crm:complaint:${caseNo}:closeComplaintCase`,
                key: idempotencyKey,
              },
            }
          : {}),
      },
    );
    await this.complaintService.awaitSettlementPersistence(caseNo);
    return toComplaintActionEnvelope(
      updated.data,
      toActionReceipt({
        auditLog: updated.auditLog,
        message: "Complaint case updated.",
      }),
      requestId,
    );
  }

  @Post(":caseNo/escalate-to-incident")
  async escalateToIncident(
    @Param("caseNo") caseNo: string,
    @Body() command: EscalateComplaintToIncidentCommand,
    @Headers("x-request-id") requestId?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const options = {
      captureAudit: true as const,
      ...(idempotencyKey?.trim()
        ? {
            commandIdentity: {
              scope: `crm:complaint:${caseNo}:escalateToIncident`,
              key: idempotencyKey,
            },
            commandPayload: command,
          }
        : {}),
    };
    return this.complaintService.withIncidentLink(caseNo, async () => {
      await this.complaintService.refreshSettlementCases();
      const complaintCase = this.complaintService.getComplaintCase(caseNo);
      const originalIncidentId =
        this.complaintService.getPreparedEscalationIncidentId(caseNo, options);
      if (
        complaintCase.relatedIncidentId &&
        complaintCase.relatedIncidentId !== originalIncidentId
      ) {
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
      if (originalIncidentId)
        preparedIncident.incident.incidentId = originalIncidentId;
      return this.incidentService.withComplaintLink(
        preparedIncident.incident.incidentId,
        async () => {
          await this.complaintService.refreshSettlementCases();
          const currentCase = this.complaintService.getComplaintCase(caseNo);
          if (
            currentCase.relatedIncidentId &&
            currentCase.relatedIncidentId !== originalIncidentId
          ) {
            throw new ApiRequestError(
              HttpStatus.CONFLICT,
              "COMPLAINT_ALREADY_ESCALATED",
              "This complaint case is already linked to an incident.",
              { caseNo, existingIncidentId: currentCase.relatedIncidentId },
            );
          }
          const updatedCase = await this.complaintService.escalateToIncident(
            caseNo,
            preparedIncident.incident.incidentId,
            command.reason,
            requestId,
            options,
          );
          await this.complaintService.awaitSettlementPersistence(caseNo);
          let existingIncident;
          if (originalIncidentId) {
            try {
              existingIncident =
                this.incidentService.getIncident(originalIncidentId);
            } catch (error) {
              if (
                !(
                  error instanceof ApiRequestError && error.code === "NOT_FOUND"
                )
              )
                throw error;
            }
          }
          const createdIncident =
            existingIncident ??
            (await this.incidentService.publishPreparedIncidentForCommit(
              preparedIncident,
              requestId,
            ));
          const incident =
            !existingIncident && currentCase.assigneeId
              ? await this.incidentService.updateIncidentForCommit(
                  createdIncident.incidentId,
                  { assignedTo: currentCase.assigneeId },
                  requestId,
                )
              : createdIncident;
          const linkedIncident =
            await this.incidentService.linkComplaintForCommit(
              incident.incidentId,
              caseNo,
              requestId,
            );
          this.complaintService.completePreparedEscalation(caseNo);
          return toComplaintActionEnvelope(
            { complaintCase: updatedCase.data, incident: linkedIncident },
            toActionReceipt({
              auditLog: updatedCase.auditLog,
              message: "Complaint escalated to incident.",
            }),
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
    @Headers("idempotency-key") idempotencyKey?: string,
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
          const updatedComplaintCase = await this.complaintService.linkIncident(
            caseNo,
            command,
            requestId,
            {
              captureAudit: true,
              ...(idempotencyKey?.trim()
                ? {
                    commandIdentity: {
                      scope: `crm:complaint:${caseNo}:linkIncident`,
                      key: idempotencyKey,
                    },
                  }
                : {}),
            },
          );
          await this.complaintService.awaitSettlementPersistence(caseNo);
          await this.incidentService.linkComplaintForCommit(
            command.incidentId,
            caseNo,
            requestId,
          );
          return toComplaintActionEnvelope(
            updatedComplaintCase.data,
            toActionReceipt({
              auditLog: updatedComplaintCase.auditLog,
              message: "Complaint linked to incident.",
            }),
            requestId,
          );
        },
      );
    });
  }

  @Post(":caseNo/sla-breach")
  async markComplaintSlaBreach(
    @Param("caseNo") caseNo: string,
    @Headers("x-request-id") requestId?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    await this.complaintService.refreshSettlementCases();
    const updated = await this.complaintService.markComplaintSlaBreach(
      caseNo,
      requestId,
      {
        captureAudit: true,
        ...(idempotencyKey?.trim()
          ? {
              commandIdentity: {
                scope: `crm:complaint:${caseNo}:markComplaintSlaBreach`,
                key: idempotencyKey,
              },
            }
          : {}),
      },
    );
    await this.complaintService.awaitSettlementPersistence(caseNo);
    return toComplaintActionEnvelope(
      updated.data,
      toActionReceipt({
        auditLog: updated.auditLog,
        message: "Complaint case updated.",
      }),
      requestId,
    );
  }
}
