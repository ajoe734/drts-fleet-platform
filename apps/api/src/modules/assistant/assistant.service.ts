import { HttpStatus, Injectable } from "@nestjs/common";

import type { ActionIntent, ProposeActionToolInput } from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";

@Injectable()
export class AssistantService {
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
