import { HttpStatus, Injectable, Logger } from "@nestjs/common";

import type {
  ActionReceipt,
  IdempotencyExecutionResult,
} from "@drts/contracts";
import {
  IDEMPOTENCY_IN_PROGRESS,
  IDEMPOTENCY_KEY_REQUIRED,
  IDEMPOTENCY_KEY_REUSED,
  IDEMPOTENCY_KEY_TOO_LONG,
} from "@drts/contracts";

import { ApiRequestError } from "../api-envelope";
import { computePayloadHash } from "./canonical-json";
import { IdempotencyRepository } from "./idempotency.repository";
import type { ExecuteIdempotentOptions } from "./idempotency.types";

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);

  constructor(private readonly repository: IdempotencyRepository) {}

  /**
   * Executes a command with transactional idempotency semantics.
   *
   * 1. If key is missing:
   *    - when required (default true): throws 400 IDEMPOTENCY_KEY_REQUIRED
   *    - when optional (required: false): executes directly without idempotency storage
   * 2. If key exists with IDENTICAL payload hash:
   *    - when completed: replays stored response (status code & body) without re-executing
   *    - when processing: throws 409 IDEMPOTENCY_IN_PROGRESS (retryable)
   * 3. If key exists with DIFFERENT payload hash:
   *    - throws 409 IDEMPOTENCY_KEY_REUSED (non-retryable)
   * 4. If key is unseen:
   *    - registers processing state atomically via DB UNIQUE constraint
   *    - executes command callback
   *    - stores completed response body and status code
   *    - returns fresh execution result (isReplay: false)
   */
  async execute<TBody, TResponse>(
    options: ExecuteIdempotentOptions<TBody, TResponse>,
  ): Promise<IdempotencyExecutionResult<TResponse>> {
    const rawKey = options.idempotencyKey;
    const isRequired = options.required ?? true;

    if (!rawKey || !rawKey.trim()) {
      if (isRequired) {
        throw new ApiRequestError(
          HttpStatus.BAD_REQUEST,
          IDEMPOTENCY_KEY_REQUIRED,
          "Idempotency-Key header is required for this command.",
          { scope: options.scope },
          false,
        );
      }

      // Key omitted and not required -> pass-through execution
      const execResult = await options.execute();
      const isWrapped =
        typeof execResult === "object" &&
        execResult !== null &&
        "data" in (execResult as Record<string, unknown>);
      const data = isWrapped
        ? (execResult as { data: TResponse }).data
        : (execResult as TResponse);
      const statusCode =
        isWrapped &&
        (execResult as { statusCode?: number | undefined }).statusCode !==
          undefined
          ? (execResult as { statusCode: number }).statusCode
          : 200;
      const actionReceipt = isWrapped
        ? ((execResult as { actionReceipt?: ActionReceipt | null | undefined })
            .actionReceipt ?? null)
        : null;

      return {
        data,
        statusCode,
        isReplay: false,
        actionReceipt,
      };
    }

    const idempotencyKey = rawKey.trim();
    if (idempotencyKey.length > 255) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        IDEMPOTENCY_KEY_TOO_LONG,
        "Idempotency-Key exceeds maximum allowed length of 255 characters.",
        { scope: options.scope, length: idempotencyKey.length },
        false,
      );
    }

    const payloadHash = computePayloadHash(options.payload);

    // 1. Initial look-up
    const existing = await this.repository.findByKey(
      options.scope,
      idempotencyKey,
    );

    if (existing) {
      if (existing.payloadHash !== payloadHash) {
        throw new ApiRequestError(
          HttpStatus.CONFLICT,
          IDEMPOTENCY_KEY_REUSED,
          "Idempotency-Key was already used for a different command payload.",
          {
            scope: options.scope,
            idempotencyKey,
            storedHash: existing.payloadHash,
            currentHash: payloadHash,
          },
          false,
        );
      }

      if (existing.status === "completed") {
        return {
          data: existing.responseBody as TResponse,
          statusCode: existing.statusCode ?? 200,
          isReplay: true,
          actionReceipt: existing.actionReceipt,
        };
      }

      if (existing.status === "processing") {
        throw new ApiRequestError(
          HttpStatus.CONFLICT,
          IDEMPOTENCY_IN_PROGRESS,
          "A concurrent request with the same Idempotency-Key is currently being processed.",
          { scope: options.scope, idempotencyKey },
          true,
        );
      }
    }

    // 2. Atomic insert of processing record (guarded by DB UNIQUE constraint)
    const { record: processingRecord, inserted } =
      await this.repository.createProcessing({
        scope: options.scope,
        idempotencyKey,
        tenantId: options.tenantId ?? null,
        actorId: options.actorId ?? null,
        requestPath: options.requestPath ?? null,
        payloadHash,
      });

    if (!inserted) {
      // Race condition occurred: another concurrent worker won the insert
      if (processingRecord.payloadHash !== payloadHash) {
        throw new ApiRequestError(
          HttpStatus.CONFLICT,
          IDEMPOTENCY_KEY_REUSED,
          "Idempotency-Key was already used for a different command payload.",
          {
            scope: options.scope,
            idempotencyKey,
            storedHash: processingRecord.payloadHash,
            currentHash: payloadHash,
          },
          false,
        );
      }

      if (processingRecord.status === "completed") {
        return {
          data: processingRecord.responseBody as TResponse,
          statusCode: processingRecord.statusCode ?? 200,
          isReplay: true,
          actionReceipt: processingRecord.actionReceipt,
        };
      }

      if (processingRecord.status === "processing") {
        throw new ApiRequestError(
          HttpStatus.CONFLICT,
          IDEMPOTENCY_IN_PROGRESS,
          "A concurrent request with the same Idempotency-Key is currently being processed.",
          { scope: options.scope, idempotencyKey },
          true,
        );
      }
    }

    // 3. Execute target command
    let data: TResponse;
    let statusCode = 200;
    let actionReceipt: ActionReceipt | null = null;

    try {
      const execResult = await options.execute();
      const isWrapped =
        typeof execResult === "object" &&
        execResult !== null &&
        "data" in (execResult as Record<string, unknown>);

      data = isWrapped
        ? (execResult as { data: TResponse }).data
        : (execResult as TResponse);
      if (
        isWrapped &&
        (execResult as { statusCode?: number | undefined }).statusCode !==
          undefined
      ) {
        statusCode = (execResult as { statusCode: number }).statusCode;
      }
      if (isWrapped) {
        actionReceipt =
          (execResult as { actionReceipt?: ActionReceipt | null | undefined })
            .actionReceipt ?? null;
      }

      await this.repository.complete({
        scope: options.scope,
        idempotencyKey,
        statusCode,
        responseBody: data,
        actionReceipt,
      });

      return {
        data,
        statusCode,
        isReplay: false,
        actionReceipt,
      };
    } catch (error) {
      // On failure, delete or mark failed so retries can proceed cleanly
      try {
        await this.repository.delete(options.scope, idempotencyKey);
      } catch (deleteError) {
        this.logger.warn(
          `Failed to clean up idempotency record after execution error for ${options.scope}:${idempotencyKey}: ${
            deleteError instanceof Error
              ? deleteError.message
              : String(deleteError)
          }`,
        );
      }
      throw error;
    }
  }
}

/**
 * Functional convenience helper to execute with idempotency without NestJS DI.
 */
export async function executeWithIdempotency<TBody, TResponse>(
  repository: IdempotencyRepository,
  options: ExecuteIdempotentOptions<TBody, TResponse>,
): Promise<IdempotencyExecutionResult<TResponse>> {
  const service = new IdempotencyService(repository);
  return service.execute(options);
}
