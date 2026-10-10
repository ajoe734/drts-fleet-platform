import { Injectable, HttpStatus } from "@nestjs/common";
import { PassengerBookingRepository } from "./passenger-booking.repository";
import { MultiTaxiService } from "../../multi-taxi/multi-taxi.service";
import { PassengerFareRepository } from "../fare/passenger-fare.repository";
import { PassengerAccountRepository } from "../account/passenger-account.repository";
import { ApiRequestError } from "../../../common/api-envelope";
import type { CreateMultiTaxiRideCommand } from "@drts/contracts";
import {
  CreatePassengerRideCommand,
  PassengerRideListResponse,
} from "@drts/contracts";

@Injectable()
export class PassengerBookingService {
  constructor(
    private readonly repository: PassengerBookingRepository,
    private readonly multiTaxiService: MultiTaxiService,
    private readonly fareRepository: PassengerFareRepository,
    private readonly accountRepository: PassengerAccountRepository,
  ) {}

  async createRide(
    passengerId: string,
    req: CreatePassengerRideCommand,
    requestId?: string,
  ) {
    const account = await this.accountRepository.transaction((tx) =>
      tx.lockAccount(passengerId),
    );
    if (!account) {
      throw new ApiRequestError(
        HttpStatus.UNAUTHORIZED,
        "PASSENGER_ACCOUNT_NOT_FOUND",
        "Passenger account not found.",
      );
    }

    const requireSms = process.env.REQUIRE_SMS_VERIFICATION === "true";
    let phone = "";
    if (requireSms) {
      if (!account.contactPhoneVerified || !account.contactPhone) {
        throw new ApiRequestError(
          HttpStatus.BAD_REQUEST,
          "PASSENGER_PHONE_REQUIRED",
          "Verified contact phone is required",
        );
      }
      phone = account.contactPhone;
    } else {
      phone = account.contactPhone || account.verifiedPhone || "";
      if (!phone) {
        throw new ApiRequestError(
          HttpStatus.BAD_REQUEST,
          "PASSENGER_PHONE_REQUIRED",
          "Phone number is required",
        );
      }
    }

    const snapshot = await this.fareRepository.findOwnedSnapshot(
      req.fareSnapshotId,
      passengerId,
    );
    if (!snapshot) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "FARE_QUOTE_NOT_FOUND",
        "Quote not found or does not belong to the passenger.",
      );
    }

    if (new Date(snapshot.expiresAt).getTime() < Date.now()) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "FARE_QUOTE_EXPIRED",
        "The fare quote has expired.",
      );
    }

    if (!req.passengerConfirmedAt) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "PASSENGER_NOT_CONFIRMED",
        "E-19b confirmation time is required.",
      );
    }

    const now = Date.now();
    const confirmedTime = new Date(req.passengerConfirmedAt).getTime();
    if (isNaN(confirmedTime) || confirmedTime > now) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "PASSENGER_NOT_CONFIRMED",
        "E-19b confirmation time is required and cannot be in the future.",
      );
    }

    if (!snapshot.scheduledAt) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "FARE_QUOTE_NOT_SCHEDULED",
        "Only scheduled rides are supported.",
      );
    }

    if (
      !req.scheduledAt ||
      new Date(req.scheduledAt).getTime() !== new Date(snapshot.scheduledAt).getTime() ||
      req.origin.lat !== snapshot.origin.lat ||
      req.origin.lng !== snapshot.origin.lng ||
      req.destination.lat !== snapshot.destination.lat ||
      req.destination.lng !== snapshot.destination.lng
    ) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "FARE_QUOTE_MISMATCH",
        "The requested route or schedule does not match the quote.",
      );
    }

    const command: CreateMultiTaxiRideCommand = {
      pickup: {
        lat: req.origin.lat,
        lng: req.origin.lng,
        address: req.origin.address || "Origin",
      },
      dropoff: {
        lat: req.destination.lat,
        lng: req.destination.lng,
        address: req.destination.address || "Destination",
      },
      passenger: {
        passengerId,
        name: account.displayName || "Passenger",
        phone,
      },
      requestedPickupAt: snapshot.scheduledAt,
      timingMode: "scheduled",
      paymentMethodTokenRef: req.paymentMethodId || null,
    };

    const result = await this.multiTaxiService.createTrustedPassengerRide(
      command,
      passengerId,
      requestId,
    );

    try {
      await this.repository.createBookingHistory(
        passengerId,
        result.ride.orderId,
        req.fareSnapshotId,
        new Date(req.passengerConfirmedAt).toISOString(),
      );
    } catch {
      try {
        await this.multiTaxiService.compensateFailedTrustedPassengerRide(
          result.ride.orderId,
          "passenger_booking_history_failed",
          requestId,
        );
      } catch {
        // The persistence failure remains the authoritative error.
      }
      throw new ApiRequestError(
        HttpStatus.INTERNAL_SERVER_ERROR,
        "PASSENGER_BOOKING_HISTORY_FAILED",
        "Failed to save booking history",
      );
    }

    const view = await this.multiTaxiService.getPassengerRideById(
      result.ride.orderId,
      passengerId,
    );
    return { ride: view };
  }

  async getRideList(
    passengerId: string,
    limit: number,
    cursor?: string,
    status?: "active" | "completed" | "cancelled",
  ): Promise<PassengerRideListResponse> {
    let currentCursorCreatedAt = undefined;
    let currentCursorOrderId = undefined;

    if (cursor) {
      try {
        const decoded = JSON.parse(
          Buffer.from(cursor, "base64").toString("utf-8"),
        );
        if (!decoded || typeof decoded !== 'object') {
          throw new Error("Missing fields");
        }
        if (typeof decoded.createdAt !== 'string' || typeof decoded.orderId !== 'string') {
          throw new Error("Invalid types");
        }
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(decoded.orderId)) {
          throw new Error("Invalid UUID");
        }
        if (isNaN(new Date(decoded.createdAt).getTime())) {
          throw new Error("Invalid date");
        }
        currentCursorCreatedAt = decoded.createdAt;
        currentCursorOrderId = decoded.orderId;
      } catch {
        throw new ApiRequestError(
          HttpStatus.BAD_REQUEST,
          "INVALID_CURSOR",
          "Invalid cursor",
        );
      }
    }

    const maxItems = limit;
    const rides = [];
    let nextCursor = undefined;
    let hasMore = true;

    while (rides.length < maxItems && hasMore) {
      const fetchLimit = status
        ? Math.max(maxItems - rides.length, 50)
        : maxItems - rides.length;
      const historyBatch = await this.repository.listBookingHistories(
        passengerId,
        fetchLimit,
        currentCursorCreatedAt,
        currentCursorOrderId,
      );

      if (historyBatch.length === 0) {
        hasMore = false;
        break;
      }

      for (const history of historyBatch) {
        currentCursorCreatedAt = history.createdAt;
        currentCursorOrderId = history.orderId;

        try {
          const view = await this.multiTaxiService.getPassengerRideById(
            history.orderId,
            passengerId,
          );

          let matches = true;
          if (status === "active") {
            matches = !["completed", "cancelled", "exception_hold"].includes(
              view.order.status,
            );
          } else if (status === "completed" || status === "cancelled") {
            matches = view.order.status === status;
          }

          if (matches) {
            rides.push(view);
          }
        } catch {
          // skip not found
        }

        if (rides.length >= maxItems) {
          nextCursor = Buffer.from(
            JSON.stringify({
              createdAt: currentCursorCreatedAt,
              orderId: currentCursorOrderId,
            }),
          ).toString("base64");
          break;
        }
      }

      if (historyBatch.length < fetchLimit) {
        hasMore = false;
      }
    }

    return { rides, ...(nextCursor ? { nextCursor } : {}) };
  }

  async getActiveRides(passengerId: string) {
    const rides = [];
    let currentCursorCreatedAt = undefined;
    let currentCursorOrderId = undefined;
    let hasMore = true;

    while (hasMore) {
      const historyBatch = await this.repository.listBookingHistories(
        passengerId,
        50,
        currentCursorCreatedAt,
        currentCursorOrderId,
      );

      if (historyBatch.length === 0) {
        hasMore = false;
        break;
      }

      for (const history of historyBatch) {
        currentCursorCreatedAt = history.createdAt;
        currentCursorOrderId = history.orderId;

        try {
          const view = await this.multiTaxiService.getPassengerRideById(
            history.orderId,
            passengerId,
          );
          if (
            !["completed", "cancelled", "exception_hold"].includes(
              view.order.status,
            )
          ) {
            rides.push(view);
          }
        } catch {
          /* ignore */
        }
      }

      if (historyBatch.length < 50) {
        hasMore = false;
      }
    }
    return { rides };
  }

  async getRide(passengerId: string, orderId: string) {
    const ownerId = await this.repository.getBookingHistoryOwner(orderId);
    if (ownerId !== passengerId) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "PASSENGER_RIDE_NOT_FOUND",
        "Ride not found",
      );
    }
    return this.multiTaxiService.getPassengerRideById(orderId, passengerId);
  }
}
