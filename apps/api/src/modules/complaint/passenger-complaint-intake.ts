import { HttpStatus } from "@nestjs/common";
import type { CreatePassengerComplaintCommand } from "@drts/contracts";
import { ApiRequestError } from "../../common/api-envelope";

/** Internal, authenticated context; never accepted from the request body. */
export interface PassengerComplaintIntake {
  passengerId: string;
  orderId: string;
  idempotencyKey: string;
  /** Internal namespace prevents user supplied keys colliding with ratings. */
  origin?: "low_rating";
  command: CreatePassengerComplaintCommand;
}

export function normalizePassengerComplaintIntake(
  input: PassengerComplaintIntake,
): PassengerComplaintIntake {
  const { command } = input;
  if (
    !/^drts_passenger_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      input.passengerId,
    ) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      input.orderId,
    )
  ) {
    throw new ApiRequestError(
      HttpStatus.NOT_FOUND,
      "PASSENGER_RIDE_NOT_FOUND",
      "Ride not found.",
    );
  }
  if (!command || command.rideId !== input.orderId) {
    throw new ApiRequestError(
      HttpStatus.BAD_REQUEST,
      "PASSENGER_COMPLAINT_RIDE_MISMATCH",
      "rideId must match the requested ride.",
    );
  }
  if (!["service", "fare", "lost_item", "other"].includes(command.category)) {
    throw new ApiRequestError(
      HttpStatus.BAD_REQUEST,
      "PASSENGER_COMPLAINT_CATEGORY_INVALID",
      "Unsupported complaint category.",
    );
  }
  if (typeof command.contactConsent !== "boolean") {
    throw new ApiRequestError(
      HttpStatus.BAD_REQUEST,
      "PASSENGER_COMPLAINT_CONSENT_REQUIRED",
      "An explicit contact consent choice is required.",
    );
  }
  const content = requireText(command.content, "content", 2000);
  const lostItemDescription =
    command.lostItemDescription === undefined
      ? undefined
      : requireText(command.lostItemDescription, "lostItemDescription", 1000);
  if (command.category === "lost_item" && !lostItemDescription) {
    throw new ApiRequestError(
      HttpStatus.BAD_REQUEST,
      "PASSENGER_LOST_ITEM_DESCRIPTION_REQUIRED",
      "A lost item description is required.",
    );
  }
  if (command.category !== "lost_item" && lostItemDescription !== undefined) {
    throw new ApiRequestError(
      HttpStatus.BAD_REQUEST,
      "PASSENGER_LOST_ITEM_CATEGORY_REQUIRED",
      "Lost item details require the lost_item category.",
    );
  }
  const idempotencyKey = requireText(
    input.idempotencyKey,
    "Idempotency-Key",
    255,
  );
  return {
    passengerId: input.passengerId,
    orderId: input.orderId,
    idempotencyKey,
    ...(input.origin ? { origin: input.origin } : {}),
    command: {
      rideId: input.orderId,
      category: command.category,
      content,
      contactConsent: command.contactConsent,
      ...(lostItemDescription === undefined ? {} : { lostItemDescription }),
    },
  };
}

function requireText(value: unknown, field: string, maxLength: number): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    Array.from(value.trim()).length > maxLength
  ) {
    throw new ApiRequestError(
      HttpStatus.BAD_REQUEST,
      "PASSENGER_COMPLAINT_FIELD_INVALID",
      `${field} is required and must be at most ${maxLength} characters.`,
    );
  }
  return value.trim();
}
