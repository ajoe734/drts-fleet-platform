import { HttpStatus, Injectable } from "@nestjs/common";

import type { ActionIntent, ProposeActionToolInput } from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import {
  ASSISTANT_PROPOSE_ACTION_TOOL,
  ASSISTANT_RUNTIME_DEFINITION,
  type AssistantRuntimeDefinition,
} from "./assistant.instructions";

@Injectable()
export class AssistantService {
  getRuntimeDefinition(): AssistantRuntimeDefinition {
    return structuredClone(ASSISTANT_RUNTIME_DEFINITION);
  }

  invokeTool(toolName: string, input: unknown): ActionIntent {
    if (toolName !== ASSISTANT_PROPOSE_ACTION_TOOL) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "ASSISTANT_TOOL_UNSUPPORTED",
        `Assistant tool '${toolName}' is not supported.`,
        { toolName },
      );
    }

    return this.proposeAction(this.coerceProposeActionInput(input));
  }

  proposeAction(input: ProposeActionToolInput): ActionIntent {
    const resourceKind = this.requireNonBlank(
      input.resourceKind,
      "resourceKind",
    );
    const resourceId = this.requireNonBlank(input.resourceId, "resourceId");
    const action = this.requireNonBlank(input.action, "action");
    const args = this.normalizeArgs(input.args);

    return {
      type: "action_intent",
      tool: "proposeAction",
      resourceKind,
      resourceId,
      action,
      args,
      confirmationRequired: true,
      mutates: false,
    };
  }

  private coerceProposeActionInput(input: unknown): ProposeActionToolInput {
    if (!this.isPlainObject(input)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "ASSISTANT_TOOL_INPUT_INVALID",
        "Assistant tool input must be an object.",
      );
    }

    const { resourceKind, resourceId, action, args } = input;

    if (
      typeof resourceKind !== "string" ||
      typeof resourceId !== "string" ||
      typeof action !== "string"
    ) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "ASSISTANT_TOOL_INPUT_INVALID",
        "Assistant tool input requires string resourceKind, resourceId, and action fields.",
      );
    }

    if (args !== undefined && !this.isPlainObject(args)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "ASSISTANT_ACTION_ARGS_INVALID",
        "Assistant proposeAction args must be an object.",
      );
    }

    return {
      resourceKind,
      resourceId,
      action,
      ...(args === undefined ? {} : { args: structuredClone(args) }),
    };
  }

  private requireNonBlank(value: string, field: string) {
    const normalized = value.trim();
    if (normalized.length > 0) {
      return normalized;
    }

    throw new ApiRequestError(
      HttpStatus.BAD_REQUEST,
      "ASSISTANT_ACTION_FIELD_REQUIRED",
      `Assistant proposeAction requires a non-empty ${field}.`,
      { field },
    );
  }

  private normalizeArgs(
    args: ProposeActionToolInput["args"],
  ): Record<string, unknown> {
    if (args === undefined) {
      return {};
    }

    if (!this.isPlainObject(args)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "ASSISTANT_ACTION_ARGS_INVALID",
        "Assistant proposeAction args must be an object.",
      );
    }

    return structuredClone(args);
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }

    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }
}
