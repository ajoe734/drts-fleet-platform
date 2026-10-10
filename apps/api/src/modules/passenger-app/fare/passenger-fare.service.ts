import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { FareQuoteCommand, FaresResponse } from "@drts/contracts";
import { ApiRequestError } from "../../../common/api-envelope";
import type { RequestIdentity } from "../../../common/auth/auth.types";
import { GeoService } from "../../geo/geo.service";
import { ServiceAreaService } from "../../service-area/service-area.service";
import { PassengerAccountService } from "../account/passenger-account.service";
import { estimateFare } from "./fare.engine";
import {
  PassengerFareRepository,
  type PassengerFareStore,
} from "./passenger-fare.repository";
import type { PassengerFareQuoteResponse } from "./fare.types";

const QUOTE_TTL_MS = 15 * 60 * 1000;
const FIELDS: Record<string, keyof FareQuoteCommand> = {
  originLat: "originLat",
  origin_lat: "originLat",
  originLng: "originLng",
  origin_lng: "originLng",
  destinationLat: "destinationLat",
  destination_lat: "destinationLat",
  destinationLng: "destinationLng",
  destination_lng: "destinationLng",
  scheduledAt: "scheduledAt",
  scheduled_at: "scheduledAt",
};
function invalid(): never {
  throw new ApiRequestError(
    400,
    "validation_error",
    "A future scheduledAt and valid origin/destination coordinates are required.",
  );
}
export function parseFareQuote(body: unknown, now: number): FareQuoteCommand {
  if (!body || typeof body !== "object" || Array.isArray(body)) invalid();
  const command: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    const canonical = Object.prototype.hasOwnProperty.call(FIELDS, key)
      ? FIELDS[key]
      : undefined;
    if (!canonical || Object.prototype.hasOwnProperty.call(command, canonical))
      invalid();
    command[canonical] = value;
  }
  for (const [field, limit] of [
    ["originLat", 90],
    ["originLng", 180],
    ["destinationLat", 90],
    ["destinationLng", 180],
  ] as const) {
    const value = command[field];
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      Math.abs(value) > limit
    )
      invalid();
  }
  if (
    typeof command.scheduledAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      command.scheduledAt,
    )
  )
    invalid();
  const scheduledMs = Date.parse(command.scheduledAt);
  if (!Number.isFinite(scheduledMs) || scheduledMs <= now) invalid();
  const year = Number(command.scheduledAt.slice(0, 4));
  const month = Number(command.scheduledAt.slice(5, 7));
  const day = Number(command.scheduledAt.slice(8, 10));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth ||
    Number(command.scheduledAt.slice(11, 13)) > 23 ||
    Number(command.scheduledAt.slice(14, 16)) > 59 ||
    Number(command.scheduledAt.slice(17, 19)) > 59
  )
    invalid();
  return {
    ...command,
    scheduledAt: new Date(scheduledMs).toISOString(),
  } as unknown as FareQuoteCommand;
}

@Injectable()
export class PassengerFareService {
  constructor(
    @Inject(PassengerFareRepository) private readonly store: PassengerFareStore,
    private readonly accounts: PassengerAccountService,
    private readonly geo: GeoService,
    private readonly areas: ServiceAreaService,
  ) {}

  async fares(): Promise<FaresResponse> {
    const t = await this.store.publishedTariff(new Date().toISOString());
    if (!t)
      throw new ApiRequestError(
        503,
        "unavailable",
        "No approved effective fare version is available.",
        undefined,
        true,
      );
    // Public contract contains only the effective tariff, never account/quote data or drafts.
    return {
      currentVersion: {
        version: t.version,
        effectiveAt: t.effectiveAt,
        baseFare: t.baseFare,
        baseDistanceMeters: t.baseDistanceMeters,
        distanceRate: t.distanceRate,
        distanceIncrementMeters: t.distanceIncrementMeters,
        delayRate: t.delayRate,
        delayIncrementSeconds: t.delayIncrementSeconds,
        nightSurcharge: t.nightSurchargeBps / 10000,
        nightSurchargeWindowStart: t.nightSurchargeWindowStart,
        nightSurchargeWindowEnd: t.nightSurchargeWindowEnd,
        additionalFees: { ...t.additionalFees },
      },
    };
  }

  async quote(
    identity: RequestIdentity | null,
    body: unknown,
    requestId?: string,
  ): Promise<PassengerFareQuoteResponse> {
    const { account } = await this.accounts.getMe(identity); // Live session/account authority, never body passengerId.
    const command = parseFareQuote(body, Date.now());
    const origin = { lat: command.originLat, lng: command.originLng };
    const destination = {
      lat: command.destinationLat,
      lng: command.destinationLng,
    };
    let evaluation = this.areas.evaluate(
      {
        serviceProductType: "taxi_reservation",
        pickup: origin,
        dropoff: destination,
        requestedAt: command.scheduledAt,
      },
      requestId,
    );
    // The shared evaluator allows an empty active-area catalogue for older callers.
    // Passenger booking requires affirmative coverage for both stops.
    if (evaluation.stops.some((stop) => stop.serviceAreaCodes.length === 0)) {
      evaluation = {
        ...evaluation,
        decision: "not_serviceable",
        reasonCodes: [
          ...new Set([
            ...evaluation.reasonCodes,
            "SERVICE_AREA_COVERAGE_REQUIRED",
          ]),
        ],
        reasonMessages: [
          ...evaluation.reasonMessages,
          "Both stops require an effective service area.",
        ],
      };
    }
    if (evaluation.decision !== "serviceable") {
      // The SD contract is binary. Manual review cannot become an automatically serviceable quote.
      return {
        serviceAreaResult: "not_serviceable",
        serviceAreaEvaluation: evaluation,
        isGuaranteed: false,
      };
    }
    const t = await this.store.publishedTariff(command.scheduledAt);
    if (!t)
      throw new ApiRequestError(
        503,
        "unavailable",
        "No approved fare version covers the requested pickup time.",
        undefined,
        true,
      );
    const route = await this.geo.route({
      origin,
      destination,
      travelMode: "drive",
      requestedByActorId: account.drtsPassengerId,
    });
    let estimate;
    try {
      estimate = estimateFare(t, {
        ...route,
        scheduledAt: command.scheduledAt,
      });
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      throw new ApiRequestError(
        503,
        "unavailable",
        "Route metrics or approved tariff rules are unavailable.",
        undefined,
        true,
      );
    }
    const createdMs = Date.now();
    if (Date.parse(command.scheduledAt) <= createdMs) invalid();
    const createdAt = new Date(createdMs).toISOString();
    const expiresAt = new Date(createdMs + QUOTE_TTL_MS).toISOString();
    const fareSnapshotId = randomUUID();
    await this.store.insertSnapshot({
      ...estimate,
      fareSnapshotId,
      drtsPassengerId: account.drtsPassengerId,
      origin,
      destination,
      scheduledAt: command.scheduledAt,
      route,
      tariffSnapshot: t,
      serviceAreaEvaluation: evaluation,
      createdAt,
      expiresAt,
    });
    return {
      serviceAreaResult: "serviceable",
      ...estimate,
      fareSnapshotId,
      expiresAt,
      serviceAreaEvaluation: evaluation,
      route,
      isGuaranteed: false,
    };
  }
}
