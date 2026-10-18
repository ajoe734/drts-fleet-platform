import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import {
  VoiceCallbackTaskIdSchema,
  VoiceCallbackActionKeySchema,
  VoiceCallbackReceiptLookupSchema,
  VoiceCallbackQueueFilterSchema,
  VoiceCallbackCreateRequestSchema,
  VoiceCallbackOperationRequestSchema,
} from "@drts/contracts";
import {
  ApiRequestError,
  toApiSuccessEnvelope,
} from "../../common/api-envelope";
import {
  CurrentIdentity,
  RequireRealms,
  type BootstrapRequestIdentity,
} from "../../common/auth";
import { VoiceSessionRepository } from "./voice-session.repository";
import {
  VoiceCallbackService,
  type VoiceCallbackOperationInput,
} from "./voice-callback.service";

function parse<T>(
  schema: {
    safeParse(
      value: unknown,
    ):
      | { success: true; data: T }
      | { success: false; error: { flatten(): unknown } };
  },
  value: unknown,
): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new ApiRequestError(
      400,
      "VALIDATION_ERROR",
      "Callback request is invalid.",
      { errors: result.error.flatten() },
    );
  return result.data;
}

@Controller("voice")
@RequireRealms("ops", "platform")
export class VoiceCallbackController {
  constructor(
    @Inject(VoiceCallbackService)
    private readonly callbacks: VoiceCallbackService,
    @Inject(VoiceSessionRepository)
    private readonly sessions: VoiceSessionRepository,
  ) {}

  @Get("callback-scopes")
  async listScopes(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      { items: await this.callbacks.listTaskScopesForRead() },
      requestId,
    );
  }

  @Get("callbacks")
  async list(
    @Query("resourceScopeId") resourceScopeId: string,
    @Query("status") status?: string,
    @Query("voiceSessionId") voiceSessionId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const filter = parse(VoiceCallbackQueueFilterSchema, {
      resourceScopeId,
      status,
      voiceSessionId,
    });
    return toApiSuccessEnvelope(
      { items: await this.callbacks.listTasksForRead(filter) },
      requestId,
    );
  }

  @Get("callbacks/:taskId")
  async get(
    @Param("taskId") rawId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const taskId = parse(VoiceCallbackTaskIdSchema, rawId);
    const task = await this.callbacks.getTaskForRead(taskId);
    if (!task)
      throw new ApiRequestError(
        404,
        "CALLBACK_TASK_NOT_FOUND",
        "Callback task was not found.",
      );
    const [attempts, commands] = await Promise.all([
      this.callbacks.getAttemptsForRead(taskId),
      this.callbacks.getTaskCommandHistoryForRead(taskId),
    ]);
    return toApiSuccessEnvelope({ task, attempts, commands }, requestId);
  }

  @Get("callback-receipts")
  async receipt(
    @Query("actionKey") rawKey: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.callbacks.getReceiptByActionKeyForRead(
        parse(VoiceCallbackReceiptLookupSchema, rawKey),
      ),
      requestId,
    );
  }

  @Post("sessions/:sessionId/callbacks")
  async create(
    @Param("sessionId") rawId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") key?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const voiceSessionId = parse(VoiceCallbackTaskIdSchema, rawId);
    const input = parse(VoiceCallbackCreateRequestSchema, body);
    const actionKey = `${voiceSessionId}:create_callback:${parse(VoiceCallbackActionKeySchema, key)}`;
    const session = await this.sessions.findSessionById(voiceSessionId);
    if (!session)
      throw new ApiRequestError(
        404,
        "VOICE_SESSION_NOT_FOUND",
        "Voice session was not found.",
      );
    return toApiSuccessEnvelope(
      await this.callbacks.createCallbackDurable({
        ...input,
        voiceSessionId,
        actionKey,
        resourceScopeId: session.resourceScopeId,
      }),
      requestId,
    );
  }

  private async command(
    action: VoiceCallbackOperationInput["action"],
    rawId: string,
    rawBody: unknown,
    identity: BootstrapRequestIdentity | null,
    key?: string,
    requestId?: string,
  ) {
    const taskId = parse(VoiceCallbackTaskIdSchema, rawId);
    const body = parse(VoiceCallbackOperationRequestSchema, rawBody);
    const operatorId =
      identity?.actorId ?? identity?.principalId ?? identity?.subject;
    if (!operatorId)
      throw new ApiRequestError(
        400,
        "CALLBACK_OPERATOR_REQUIRED",
        "Current operator identity is required.",
      );
    return toApiSuccessEnvelope(
      await this.callbacks.executeTaskCommandForWrite({
        ...body,
        taskId,
        action,
        operatorId,
        idempotencyKey: parse(VoiceCallbackActionKeySchema, key),
      }),
      requestId,
    );
  }

  @Post("callbacks/:taskId/claim")
  claim(
    @Param("taskId") id: string,
    @Body() body: unknown,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("idempotency-key") key?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return this.command("claim", id, body, identity, key, requestId);
  }

  @Post("callbacks/:taskId/attempts")
  attempt(
    @Param("taskId") id: string,
    @Body() body: unknown,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("idempotency-key") key?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return this.command("attempt", id, body, identity, key, requestId);
  }

  @Post("callbacks/:taskId/complete")
  complete(
    @Param("taskId") id: string,
    @Body() body: unknown,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("idempotency-key") key?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return this.command("complete", id, body, identity, key, requestId);
  }

  @Post("callbacks/:taskId/cancel")
  cancel(
    @Param("taskId") id: string,
    @Body() body: unknown,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("idempotency-key") key?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return this.command("cancel", id, body, identity, key, requestId);
  }

  @Post("callbacks/:taskId/transfer")
  transfer(
    @Param("taskId") id: string,
    @Body() body: unknown,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("idempotency-key") key?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return this.command("transfer", id, body, identity, key, requestId);
  }
}
