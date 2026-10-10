import { Injectable, HttpStatus } from "@nestjs/common";
import { PassengerBookingRepository } from "./passenger-booking.repository";
import { MultiTaxiService } from "../../multi-taxi/multi-taxi.service";
import { PassengerFareRepository } from "../fare/passenger-fare.repository";
import { PassengerAccountRepository } from "../account/passenger-account.repository";
import { ApiRequestError } from "../../../common/api-envelope";
import { CreateMultiTaxiRideCommand } from "@drts/contracts";

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
    fareSnapshotId: string,
    passengerConfirmedAt: string,
    paymentMethodTokenRef: string | null,
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

    const snapshot = await this.fareRepository.findOwnedSnapshot(
      fareSnapshotId,
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

    if (!passengerConfirmedAt) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "PASSENGER_NOT_CONFIRMED",
        "E-19b confirmation time is required.",
      );
    }

    if (!snapshot.scheduledAt) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "FARE_QUOTE_NOT_SCHEDULED",
        "Only scheduled rides are supported.",
      );
    }

    const command: CreateMultiTaxiRideCommand = {
      pickup: {
        lat: snapshot.origin.lat,
        lng: snapshot.origin.lng,
        address: "Origin",
      },
      dropoff: {
        lat: snapshot.destination.lat,
        lng: snapshot.destination.lng,
        address: "Destination",
      },
      passenger: {
        name: account.displayName || "Passenger",
        phone: account.contactPhone || account.verifiedPhone || "",
      },
      requestedPickupAt: snapshot.scheduledAt,
      timingMode: "scheduled",
      paymentMethodTokenRef,
    };

    const result = await this.multiTaxiService.createTrustedPassengerRide(
      command,
      passengerId,
      requestId,
    );

    await this.repository.createBookingHistory(
      passengerId,
      result.ride.orderId,
      fareSnapshotId,
      passengerConfirmedAt,
    );

    return result;
  }

  async getRideList(passengerId: string, limit: number, offset: number) {
    const orderIds = await this.repository.listBookingHistories(
      passengerId,
      limit,
      offset,
    );
    const rides = [];
    for (const orderId of orderIds) {
      try {
        const view = await this.multiTaxiService.getPassengerRideById(
          orderId,
          passengerId,
        );
        rides.push(view);
      } catch {
        // skip not found
      }
    }
    return { rides };
  }

  async getActiveRides(passengerId: string) {
    const orderIds = await this.repository.listBookingHistories(
      passengerId,
      50,
      0,
    );
    const rides = [];
    for (const orderId of orderIds) {
      try {
        const view = await this.multiTaxiService.getPassengerRideById(
          orderId,
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
