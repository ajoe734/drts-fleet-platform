import { Injectable, HttpStatus, Optional } from "@nestjs/common";
import { PassengerBookingRepository } from "./passenger-booking.repository";
import { MultiTaxiService } from "../../multi-taxi/multi-taxi.service";
import { PassengerFareRepository } from "../fare/passenger-fare.repository";
import { PassengerAccountRepository } from "../account/passenger-account.repository";
import { ApiRequestError } from "../../../common/api-envelope";
import type {
  CreateMultiTaxiRideCommand,
  RatePassengerRideCommand,
} from "@drts/contracts";
import { ComplaintService } from "../../complaint/complaint.service";
import { bookingPaymentMethodId } from "../payment/booking-payment.guard";
import {
  CreatePassengerRideCommand,
  PassengerBookingSettingsResponse,
  PassengerRideListResponse,
} from "@drts/contracts";

@Injectable()
export class PassengerBookingService {
  constructor(
    private readonly repository: PassengerBookingRepository,
    private readonly multiTaxiService: MultiTaxiService,
    private readonly fareRepository: PassengerFareRepository,
    private readonly accountRepository: PassengerAccountRepository,
    @Optional() private readonly complaintService?: ComplaintService,
  ) {}

  getBookingSettings(): PassengerBookingSettingsResponse {
    return {
      minLeadTimeMinutes: this.multiTaxiService.getMinLeadTimeMinutes(),
      requireSmsVerification: process.env.REQUIRE_SMS_VERIFICATION === "true",
    };
  }

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

    const expiresAt = Date.parse(snapshot.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "FARE_QUOTE_EXPIRED",
        "The fare quote has expired.",
      );
    }

    if (
      typeof req.passengerConfirmedAt !== "string" ||
      !req.passengerConfirmedAt
    ) {
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
      new Date(req.scheduledAt).getTime() !==
        new Date(snapshot.scheduledAt).getTime() ||
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

    const paymentMethodId = bookingPaymentMethodId(req.paymentMethodId);
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
      paymentMethodTokenRef: paymentMethodId,
    };

    const result = await this.multiTaxiService.createTrustedPassengerRide(
      command,
      passengerId,
      requestId,
      (orderId, persistRide) =>
        this.repository.commitBooking(
          passengerId,
          orderId,
          req.fareSnapshotId,
          new Date(req.passengerConfirmedAt).toISOString(),
          paymentMethodId,
          persistRide,
        ),
    );

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
        if (!decoded || typeof decoded !== "object") {
          throw new Error("Missing fields");
        }
        if (
          typeof decoded.createdAt !== "string" ||
          typeof decoded.orderId !== "string"
        ) {
          throw new Error("Invalid types");
        }
        if (
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            decoded.orderId,
          )
        ) {
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
        } catch (error) {
          if (!(error instanceof ApiRequestError) || error.getStatus() !== 404)
            throw error;
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
        } catch (error) {
          if (!(error instanceof ApiRequestError) || error.getStatus() !== 404)
            throw error;
        }
      }

      if (historyBatch.length < 50) {
        hasMore = false;
      }
    }
    return { rides };
  }

  async rateRide(
    passengerId: string,
    orderId: string,
    body: RatePassengerRideCommand,
  ) {
    await this.getRide(passengerId, orderId);
    const score = body?.rating;
    if (
      score !== 1 &&
      score !== 2 &&
      score !== 3 &&
      score !== 4 &&
      score !== 5
    ) {
      throw new ApiRequestError(
        400,
        "PASSENGER_RATING_SCORE_INVALID",
        "Rating must be between 1 and 5.",
      );
    }
    if (
      body.contactRequested !== undefined &&
      typeof body.contactRequested !== "boolean"
    ) {
      throw new ApiRequestError(
        400,
        "PASSENGER_RATING_CONSENT_INVALID",
        "Contact requested must be a boolean.",
      );
    }
    if (
      body.comments !== undefined &&
      (typeof body.comments !== "string" ||
        Array.from(body.comments).length > 200)
    ) {
      throw new ApiRequestError(
        400,
        "PASSENGER_RATING_COMMENT_INVALID",
        "Comments must be at most 200 characters.",
      );
    }
    if (!this.complaintService)
      throw new ApiRequestError(
        503,
        "PASSENGER_COMPLAINT_STORAGE_UNAVAILABLE",
        "Rating consent storage is unavailable.",
      );
    const command = {
      score,
      tags: body.tags ?? [],
      comment: body.comments?.trim() || null,
    };
    const hook = this.complaintService.preparePassengerRatingHook(
      passengerId,
      orderId,
      body.contactRequested === true,
      command,
    );
    await this.multiTaxiService.submitTrustedPassengerRating(
      orderId,
      command,
      passengerId,
      hook,
    );
    await hook.afterCommit();
    return { success: true };
  }

  async getRide(passengerId: string, orderId: string) {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        orderId,
      )
    ) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "PASSENGER_RIDE_NOT_FOUND",
        "Ride not found",
      );
    }
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
