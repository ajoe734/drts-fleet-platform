import { HttpStatus, Injectable, OnModuleInit, Optional } from "@nestjs/common";

import type {
  AuditLogRecord,
  AttachCallRecordingCommand,
  CallSessionRecord,
  CallType,
  CloseCallSessionCommand,
  OpenCallSessionCommand,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
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
      status: "active",
      startedAt: now,
      endedAt: null,
      recordingId: null,
      providerRecordingRef: null,
      recordingUrl: null,
      linkedOrderId: null,
      linkedCaseNo: null,
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

  getCallSession(callId: string) {
    return this.cloneSession(this.requireSession(callId));
  }

  listCallSessions() {
    return this.callSessions.map((s) => this.cloneSession(s));
  }

  closeCallSession(
    callId: string,
    command: CloseCallSessionCommand,
    requestId?: string,
  ) {
    const session = this.requireSession(callId);
    const endedAt =
      command.endedAt ?? session.endedAt ?? new Date().toISOString();
    session.status = "closed";
    session.endedAt = endedAt;
    this.addFlag(session, "closed");
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
        status: "active",
        startedAt: now,
        endedAt: null,
        recordingId,
        providerRecordingRef,
        recordingUrl,
        linkedOrderId: input.linkedOrderId,
        linkedCaseNo: null,
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
      this.addFlag(existingSession, "recording_bound");
    } else {
      this.removeFlag(existingSession, "recording_bound");
      this.addFlag(existingSession, "recording_pending");
    }

    this.persistSessions([existingSession], "link_order_to_call_session");

    return this.cloneSession(existingSession);
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
      flags: [...session.flags],
    };
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
