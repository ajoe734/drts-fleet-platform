import { randomUUID } from "node:crypto";

import { HttpStatus, Injectable, OnModuleInit, Optional } from "@nestjs/common";

import type {
  AnnounceCallAgentIdentityCommand,
  AuditLogRecord,
  AttachCallRecordingCommand,
  CallRecordingState,
  CallbackTaskRecord,
  CallSessionRecord,
  CallType,
  CloseCallSessionCommand,
  CompleteCallbackTaskCommand,
  CreateCallbackTaskCommand,
  LinkCallOrderCommand,
  OpenCallSessionCommand,
  QuoteCallEtaCommand,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import {
  assertEvidenceAccess,
  buildEvidenceAccessAuditSummary,
  type EvidenceAccessIdentity,
} from "../../common/evidence-governance";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import { CallcenterRepository } from "./callcenter.repository";

type RecordingAttachmentEvent = {
  callId: string;
  recordingId: string;
  providerRecordingRef: string | null;
  recordingUrl: string | null;
  startedAt: string | null;
  endedAt: string | null;
  agentId: string | null;
  requestId?: string;
};

type PhoneOrderSessionInput = {
  callId: string;
  callType: CallType;
  callerPhone: string;
  agentId: string | null;
  linkedOrderId: string;
  recordingId: string | null;
  providerRecordingRef?: string | null;
  recordingUrl?: string | null;
};

@Injectable()
export class CallcenterService implements OnModuleInit {
  private callSequence = 1;

  private callSessions: CallSessionRecord[] = [];

  private readonly recordingAttachmentListeners: Array<
    (event: RecordingAttachmentEvent) => void
  > = [];

  constructor(
    private readonly auditNotificationService: AuditNotificationService,
    @Optional() private readonly callcenterRepository?: CallcenterRepository,
  ) {}

  async onModuleInit() {
    if (!this.callcenterRepository) {
      return;
    }

    try {
      const persistedSessions = await this.callcenterRepository.loadSessions();
      if (persistedSessions.length === 0) {
        return;
      }

      this.callSessions = persistedSessions.map((session) =>
        this.cloneSession(session),
      );
      this.callSequence = this.deriveNextCallSequence(persistedSessions);
    } catch (error) {
      this.callcenterRepository.reportPersistenceFailure(error, "module init");
    }
  }

  registerRecordingAttachmentListener(
    listener: (event: RecordingAttachmentEvent) => void,
  ) {
    this.recordingAttachmentListeners.push(listener);
  }

  openCallSession(command: OpenCallSessionCommand, requestId?: string) {
    this.assertCallerPhone(command.callerPhone);

    const now = new Date().toISOString();
    const session: CallSessionRecord = {
      callId: this.nextCallId(),
      callType: command.callType,
      callerPhone: command.callerPhone,
      agentId: command.agentId ?? null,
      agentIdentityAnnounced: Boolean(command.agentIdentityAnnounced),
      agentIdentityAnnouncedAt: command.agentIdentityAnnounced ? now : null,
      status: "active",
      startedAt: now,
      endedAt: null,
      recordingId: null,
      providerRecordingRef: null,
      recordingUrl: null,
      linkedOrderId: null,
      linkedCaseNo: null,
      lastEtaQuotedMinutes: null,
      lastEtaQuotedAt: null,
      callbackTask: null,
      recordingState: "pending",
      flags: ["recording_pending"],
    };

    this.callSessions = [session, ...this.callSessions];
    this.persistSessions([session], "open_call_session");
    this.recordAudit(
      {
        actorId: command.agentId ?? null,
        actorType: "ops_user",
        tenantId: null,
        moduleName: "callcenter",
        actionName: "open_call_session",
        resourceType: "call_session",
        resourceId: session.callId,
        newValuesSummary: {
          callType: session.callType,
          callerPhone: session.callerPhone,
          status: session.status,
        },
      },
      requestId,
    );

    return this.cloneSession(session);
  }

  getCallSession(
    callId: string,
    requestId?: string,
    identity?: EvidenceAccessIdentity | null,
  ) {
    const policy = assertEvidenceAccess({
      family: "call_recording",
      identity,
    });
    const session = this.cloneSession(this.requireSession(callId));
    this.recordAudit(
      {
        actorId: identity?.actorId ?? null,
        actorType:
          (identity?.actorType as AuditLogRecord["actorType"] | undefined) ??
          "system",
        tenantId: identity?.tenantId ?? null,
        moduleName: "callcenter",
        actionName: policy.auditAction,
        resourceType: "call_session",
        resourceId: session.callId,
        newValuesSummary: buildEvidenceAccessAuditSummary(policy, "read", {
          linkedOrderId: session.linkedOrderId,
          hasRecordingId: Boolean(session.recordingId),
          hasRecordingUrl: Boolean(session.recordingUrl),
        }),
      },
      requestId,
    );
    return session;
  }

  listCallSessions(
    requestId?: string,
    identity?: EvidenceAccessIdentity | null,
  ) {
    const policy = assertEvidenceAccess({
      family: "call_recording",
      identity,
    });
    const items = this.callSessions.map((session) =>
      this.cloneSession(session),
    );
    this.recordAudit(
      {
        actorId: identity?.actorId ?? null,
        actorType:
          (identity?.actorType as AuditLogRecord["actorType"] | undefined) ??
          "system",
        tenantId: identity?.tenantId ?? null,
        moduleName: "callcenter",
        actionName: "list_call_recording_evidence",
        resourceType: "call_session",
        resourceId: null,
        newValuesSummary: buildEvidenceAccessAuditSummary(policy, "list", {
          itemCount: items.length,
        }),
      },
      requestId,
    );
    return items;
  }

  announceAgentIdentity(
    callId: string,
    command: AnnounceCallAgentIdentityCommand,
    requestId?: string,
  ) {
    const session = this.requireSession(callId);
    const announcedAt = command.announcedAt ?? new Date().toISOString();
    session.agentId = command.agentId?.trim() || session.agentId;
    session.agentIdentityAnnounced = true;
    session.agentIdentityAnnouncedAt = announcedAt;
    this.persistSessions([session], "announce_agent_identity");

    this.recordAudit(
      {
        actorId: session.agentId,
        actorType: "ops_user",
        tenantId: null,
        moduleName: "callcenter",
        actionName: "announce_agent_identity",
        resourceType: "call_session",
        resourceId: session.callId,
        newValuesSummary: {
          agentId: session.agentId,
          agentIdentityAnnouncedAt: announcedAt,
        },
      },
      requestId,
    );

    return this.cloneSession(session);
  }

  closeCallSession(
    callId: string,
    command: CloseCallSessionCommand = {},
    requestId?: string,
  ) {
    const session = this.requireSession(callId);
    const endedAt =
      command.endedAt ?? session.endedAt ?? new Date().toISOString();
    session.status = "closed";
    session.endedAt = endedAt;
    this.addFlag(session, "closed");
    if (session.linkedOrderId && !session.recordingId) {
      this.addFlag(session, "recording_missing");
    }
    this.persistSessions([session], "close_call_session");

    this.recordAudit(
      {
        actorId: session.agentId,
        actorType: "ops_user",
        tenantId: null,
        moduleName: "callcenter",
        actionName: "close_call_session",
        resourceType: "call_session",
        resourceId: session.callId,
        newValuesSummary: {
          status: session.status,
          endedAt: session.endedAt,
        },
      },
      requestId,
    );

    return this.cloneSession(session);
  }

  quoteEta(callId: string, command: QuoteCallEtaCommand, requestId?: string) {
    this.assertPositiveEta(command.etaMinutes);
    const session = this.requireSession(callId);
    session.lastEtaQuotedMinutes = command.etaMinutes;
    session.lastEtaQuotedAt = command.quotedAt ?? new Date().toISOString();
    this.persistSessions([session], "quote_call_eta");

    this.recordAudit(
      {
        actorId: session.agentId,
        actorType: "ops_user",
        tenantId: null,
        moduleName: "callcenter",
        actionName: "quote_call_eta",
        resourceType: "call_session",
        resourceId: session.callId,
        newValuesSummary: {
          linkedOrderId: session.linkedOrderId,
          etaMinutes: session.lastEtaQuotedMinutes,
          quotedAt: session.lastEtaQuotedAt,
        },
      },
      requestId,
    );

    return this.cloneSession(session);
  }

  linkOrderToExistingSession(
    callId: string,
    command: LinkCallOrderCommand,
    requestId?: string,
  ) {
    const orderId = command.orderId.trim();
    if (!orderId) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "ORDER_ID_REQUIRED",
        "Order ID is required.",
      );
    }

    const session = this.requireSession(callId);
    session.linkedOrderId = orderId;
    if (!session.recordingId) {
      if (session.status === "closed") {
        this.removeFlag(session, "recording_pending");
        this.addFlag(session, "recording_missing");
      } else {
        this.removeFlag(session, "recording_missing");
        this.addFlag(session, "recording_pending");
      }
    }
    if (session.callbackTask) {
      session.callbackTask = {
        ...session.callbackTask,
        linkedOrderId: orderId,
        updatedAt: new Date().toISOString(),
      };
    }
    this.persistSessions([session], "link_call_order");

    this.recordAudit(
      {
        actorId: session.agentId,
        actorType: "ops_user",
        tenantId: null,
        moduleName: "callcenter",
        actionName: "link_call_order",
        resourceType: "call_session",
        resourceId: session.callId,
        newValuesSummary: {
          linkedOrderId: session.linkedOrderId,
        },
      },
      requestId,
    );

    return this.cloneSession(session);
  }

  attachRecordingCallback(
    callId: string,
    command: AttachCallRecordingCommand,
    requestId?: string,
  ) {
    if (!command.recordingId.trim()) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "RECORDING_ID_REQUIRED",
        "Recording ID is required.",
      );
    }

    const session = this.requireSession(callId);
    const nextRecordingId = command.recordingId.trim();
    const nextProviderRecordingRef =
      command.providerRecordingRef?.trim() || null;
    const nextRecordingUrl = command.recordingUrl?.trim() || null;
    const nextStartedAt = command.startedAt ?? session.startedAt;
    const nextEndedAt = command.endedAt ?? session.endedAt;
    const recordingAlreadyBound =
      session.recordingId === nextRecordingId &&
      session.providerRecordingRef === nextProviderRecordingRef &&
      session.recordingUrl === nextRecordingUrl &&
      session.startedAt === nextStartedAt &&
      session.endedAt === nextEndedAt &&
      session.flags.includes("recording_bound");

    if (recordingAlreadyBound) {
      return this.cloneSession(session);
    }

    session.recordingId = nextRecordingId;
    session.providerRecordingRef = nextProviderRecordingRef;
    session.recordingUrl = nextRecordingUrl;
    session.startedAt = nextStartedAt;
    session.endedAt = nextEndedAt;
    this.removeFlag(session, "recording_pending");
    this.removeFlag(session, "recording_missing");
    this.addFlag(session, "recording_bound");
    this.persistSessions([session], "attach_recording_callback");

    const event: RecordingAttachmentEvent = {
      callId: session.callId,
      recordingId: nextRecordingId,
      providerRecordingRef: nextProviderRecordingRef,
      recordingUrl: nextRecordingUrl,
      startedAt: nextStartedAt,
      endedAt: nextEndedAt,
      agentId: command.agentId ?? session.agentId,
    };
    if (requestId) {
      event.requestId = requestId;
    }

    for (const listener of this.recordingAttachmentListeners) {
      listener(event);
    }

    this.recordAudit(
      {
        actorId: command.agentId ?? session.agentId,
        actorType: "ops_user",
        tenantId: null,
        moduleName: "callcenter",
        actionName: "attach_recording_callback",
        resourceType: "call_session",
        resourceId: session.callId,
        newValuesSummary: {
          recordingId: session.recordingId,
          providerRecordingRef: session.providerRecordingRef,
          recordingUrl: session.recordingUrl,
          status: session.status,
        },
      },
      requestId,
    );

    return this.cloneSession(session);
  }

  listCallbackTasks() {
    return this.callSessions
      .flatMap((session) =>
        session.callbackTask
          ? [this.cloneCallbackTask(session.callbackTask)]
          : [],
      )
      .sort((left, right) => left.dueAt.localeCompare(right.dueAt));
  }

  createCallbackTask(
    callId: string,
    command: CreateCallbackTaskCommand,
    requestId?: string,
  ) {
    const session = this.requireSession(callId);
    this.assertTimestamp(command.dueAt, "dueAt");

    const now = new Date().toISOString();
    const callbackTask: CallbackTaskRecord = session.callbackTask
      ? {
          ...session.callbackTask,
          dueAt: command.dueAt,
          note: this.normalizeNullableText(command.note),
          status: "pending",
          updatedAt: now,
        }
      : {
          callbackTaskId: `callback-${randomUUID()}`,
          callId: session.callId,
          callerPhone: session.callerPhone,
          agentId: session.agentId,
          linkedOrderId: session.linkedOrderId,
          linkedCaseNo: session.linkedCaseNo,
          dueAt: command.dueAt,
          note: this.normalizeNullableText(command.note),
          status: "pending",
          createdAt: now,
          updatedAt: now,
        };

    session.callbackTask = callbackTask;
    this.addFlag(session, "callback_pending");
    this.removeFlag(session, "callback_completed");
    this.persistSessions([session], "create_callback_task");

    this.recordAudit(
      {
        actorId: session.agentId,
        actorType: "ops_user",
        tenantId: null,
        moduleName: "callcenter",
        actionName: "create_callback_task",
        resourceType: "callback_task",
        resourceId: callbackTask.callbackTaskId,
        newValuesSummary: {
          callId: session.callId,
          linkedOrderId: callbackTask.linkedOrderId,
          linkedCaseNo: callbackTask.linkedCaseNo,
          dueAt: callbackTask.dueAt,
          status: callbackTask.status,
        },
      },
      requestId,
    );

    return this.cloneCallbackTask(callbackTask);
  }

  completeCallbackTask(
    callbackTaskId: string,
    command: CompleteCallbackTaskCommand,
    requestId?: string,
  ) {
    const session = this.findSessionByCallbackTaskId(callbackTaskId);
    if (!session.callbackTask) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "CALLBACK_TASK_NOT_FOUND",
        "Callback task not found.",
        {
          callbackTaskId,
        },
      );
    }

    if (session.callbackTask.status === "completed") {
      return this.cloneCallbackTask(session.callbackTask);
    }

    this.assertOptionalTimestamp(command.completedAt, "completedAt");
    const updatedAt = command.completedAt ?? new Date().toISOString();
    session.callbackTask = {
      ...session.callbackTask,
      note:
        this.normalizeNullableText(command.note) ?? session.callbackTask.note,
      status: "completed",
      updatedAt,
    };
    this.removeFlag(session, "callback_pending");
    this.addFlag(session, "callback_completed");
    this.persistSessions([session], "complete_callback_task");

    this.recordAudit(
      {
        actorId: session.agentId,
        actorType: "ops_user",
        tenantId: null,
        moduleName: "callcenter",
        actionName: "complete_callback_task",
        resourceType: "callback_task",
        resourceId: session.callbackTask.callbackTaskId,
        newValuesSummary: {
          callId: session.callId,
          status: session.callbackTask.status,
          updatedAt,
        },
      },
      requestId,
    );

    return this.cloneCallbackTask(session.callbackTask);
  }

  linkOrderToCallSession(input: PhoneOrderSessionInput) {
    const now = new Date().toISOString();
    const recordingId = input.recordingId?.trim() || null;
    const providerRecordingRef = input.providerRecordingRef?.trim() || null;
    const recordingUrl = input.recordingUrl?.trim() || null;
    const existingSession = this.callSessions.find(
      (session) => session.callId === input.callId,
    );

    if (!existingSession) {
      const session: CallSessionRecord = {
        callId: input.callId,
        callType: input.callType,
        callerPhone: input.callerPhone,
        agentId: input.agentId,
        agentIdentityAnnounced: false,
        agentIdentityAnnouncedAt: null,
        status: "active",
        startedAt: now,
        endedAt: null,
        recordingId,
        providerRecordingRef,
        recordingUrl,
        linkedOrderId: input.linkedOrderId,
        linkedCaseNo: null,
        lastEtaQuotedMinutes: null,
        lastEtaQuotedAt: null,
        callbackTask: null,
        recordingState: recordingId ? "ready" : "pending",
        flags: recordingId ? ["recording_bound"] : ["recording_pending"],
      };
      this.callSessions = [session, ...this.callSessions];
      this.persistSessions([session], "link_order_to_call_session");
      return this.cloneSession(session);
    }

    existingSession.callType = input.callType;
    existingSession.callerPhone = input.callerPhone;
    existingSession.agentId = input.agentId ?? existingSession.agentId;
    existingSession.linkedOrderId = input.linkedOrderId;
    existingSession.recordingId = recordingId || existingSession.recordingId;
    existingSession.providerRecordingRef =
      providerRecordingRef || existingSession.providerRecordingRef;
    existingSession.recordingUrl = recordingUrl || existingSession.recordingUrl;

    if (existingSession.recordingId) {
      this.removeFlag(existingSession, "recording_pending");
      this.removeFlag(existingSession, "recording_missing");
      this.addFlag(existingSession, "recording_bound");
    } else {
      this.removeFlag(existingSession, "recording_bound");
      if (existingSession.status === "closed") {
        this.removeFlag(existingSession, "recording_pending");
        this.addFlag(existingSession, "recording_missing");
      } else {
        this.removeFlag(existingSession, "recording_missing");
        this.addFlag(existingSession, "recording_pending");
      }
    }

    if (existingSession.callbackTask) {
      existingSession.callbackTask = {
        ...existingSession.callbackTask,
        linkedOrderId: input.linkedOrderId,
        updatedAt: now,
      };
    }

    this.persistSessions([existingSession], "link_order_to_call_session");

    return this.cloneSession(existingSession);
  }

  linkCaseToCallSession(callId: string, caseNo: string, requestId?: string) {
    const nextCaseNo = caseNo.trim();
    if (!nextCaseNo) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "CASE_NO_REQUIRED",
        "Case number is required.",
      );
    }

    const session = this.requireSession(callId);
    session.linkedCaseNo = nextCaseNo;
    if (session.callbackTask) {
      session.callbackTask = {
        ...session.callbackTask,
        linkedCaseNo: nextCaseNo,
        updatedAt: new Date().toISOString(),
      };
    }
    this.persistSessions([session], "link_call_case");

    this.recordAudit(
      {
        actorId: session.agentId,
        actorType: "ops_user",
        tenantId: null,
        moduleName: "callcenter",
        actionName: "link_call_case",
        resourceType: "call_session",
        resourceId: session.callId,
        newValuesSummary: {
          linkedCaseNo: session.linkedCaseNo,
        },
      },
      requestId,
    );

    return this.cloneSession(session);
  }

  recordIncidentTransfer(
    callId: string,
    incidentId: string,
    requestId?: string,
  ) {
    const session = this.requireSession(callId);
    this.addFlag(session, "incident_transferred");
    this.persistSessions([session], "record_incident_transfer");

    this.recordAudit(
      {
        actorId: session.agentId,
        actorType: "ops_user",
        tenantId: null,
        moduleName: "callcenter",
        actionName: "transfer_call_to_incident",
        resourceType: "call_session",
        resourceId: session.callId,
        newValuesSummary: {
          incidentId,
          linkedOrderId: session.linkedOrderId,
          linkedCaseNo: session.linkedCaseNo,
        },
      },
      requestId,
    );

    return this.cloneSession(session);
  }

  private nextCallId() {
    const current = String(this.callSequence++).padStart(6, "0");
    return `CALL-20260410-${current}`;
  }

  private deriveNextCallSequence(sessions: readonly CallSessionRecord[]) {
    const maxSequence = sessions.reduce((currentMax, session) => {
      const rawSequence = session.callId.split("-").at(-1) ?? "0";
      const parsedSequence = Number.parseInt(rawSequence, 10);
      if (!Number.isInteger(parsedSequence)) {
        return currentMax;
      }
      return Math.max(currentMax, parsedSequence);
    }, 0);

    return maxSequence + 1;
  }

  private persistSessions(
    sessions: readonly CallSessionRecord[],
    context: string,
  ) {
    if (!this.callcenterRepository) {
      return;
    }

    void Promise.all(
      sessions.map((session) =>
        this.callcenterRepository!.upsertSession(this.cloneSession(session)),
      ),
    ).catch((error: unknown) => {
      this.callcenterRepository!.reportPersistenceFailure(error, context);
    });
  }

  private requireSession(callId: string) {
    const session = this.callSessions.find(
      (candidateSession) => candidateSession.callId === callId,
    );
    if (!session) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "CALL_SESSION_NOT_FOUND",
        "Call session not found.",
        {
          callId,
        },
      );
    }
    return session;
  }

  private assertCallerPhone(callerPhone: string) {
    if (!callerPhone.trim()) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "CALLER_PHONE_REQUIRED",
        "Caller phone is required.",
      );
    }
  }

  private assertPositiveEta(etaMinutes: number) {
    if (!Number.isFinite(etaMinutes) || etaMinutes <= 0) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "ETA_MINUTES_INVALID",
        "ETA minutes must be greater than zero.",
      );
    }
  }

  private assertTimestamp(value: string, field: string) {
    if (!value.trim()) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        `${field.toUpperCase()}_REQUIRED`,
        `${field} is required.`,
      );
    }
    this.assertOptionalTimestamp(value, field);
  }

  private assertOptionalTimestamp(value: string | undefined, field: string) {
    if (!value) {
      return;
    }
    if (Number.isNaN(Date.parse(value))) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        `${field.toUpperCase()}_INVALID`,
        `${field} must be a valid ISO timestamp.`,
      );
    }
  }

  private addFlag(session: CallSessionRecord, flag: string) {
    if (!session.flags.includes(flag)) {
      session.flags = [...session.flags, flag];
    }
  }

  private removeFlag(session: CallSessionRecord, flag: string) {
    if (!session.flags.includes(flag)) {
      return;
    }
    session.flags = session.flags.filter(
      (candidate: string) => candidate !== flag,
    );
  }

  private cloneSession(session: CallSessionRecord) {
    return {
      ...session,
      callbackTask: session.callbackTask
        ? this.cloneCallbackTask(session.callbackTask)
        : null,
      recordingState: this.deriveRecordingState(session),
      flags: [...session.flags],
    };
  }

  private deriveRecordingState(session: CallSessionRecord): CallRecordingState {
    if (session.recordingId || session.flags.includes("recording_bound")) {
      return "ready";
    }
    if (session.flags.includes("recording_missing")) {
      return "missing";
    }
    return "pending";
  }

  private cloneCallbackTask(callbackTask: CallbackTaskRecord) {
    return {
      ...callbackTask,
    };
  }

  private findSessionByCallbackTaskId(callbackTaskId: string) {
    const session = this.callSessions.find(
      (candidateSession) =>
        candidateSession.callbackTask?.callbackTaskId === callbackTaskId,
    );
    if (!session) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "CALLBACK_TASK_NOT_FOUND",
        "Callback task not found.",
        {
          callbackTaskId,
        },
      );
    }
    return session;
  }

  private normalizeNullableText(value: string | null | undefined) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private recordAudit(
    input: Omit<AuditLogRecord, "auditId" | "createdAt" | "requestId">,
    requestId?: string,
  ) {
    const auditInput: Omit<
      AuditLogRecord,
      "auditId" | "createdAt" | "requestId"
    > & {
      requestId?: string;
    } = { ...input };
    if (requestId) {
      auditInput.requestId = requestId;
    }
    const log = this.auditNotificationService.recordAuditLog(auditInput);
    return log;
  }
}
