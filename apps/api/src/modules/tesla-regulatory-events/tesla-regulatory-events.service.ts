import { randomUUID } from "node:crypto";

import {
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  Optional,
} from "@nestjs/common";

import type {
  TeslaRegulatoryCapabilityProfile,
  TeslaRegulatoryEvent,
  TeslaRegulatoryReasonCodeDictionary,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { TeslaRegulatoryMockAdapter } from "./tesla-regulatory-mock.adapter";
import {
  TESLA_REGULATORY_EVENT_PROVIDER,
  type TeslaRegulatoryEventProvider,
} from "./tesla-regulatory-events.ports";
import { TeslaRegulatoryEventsRepository } from "./tesla-regulatory-events.repository";

/**
 * TeslaRegulatoryEventsService keeps a persisted VIN-keyed capability profile,
 * versioned reason-code dictionaries, and signed regulatory sample events for
 * the Tesla Phase 2 sandbox. It remains adapter-driven: the sandbox adapter is
 * a contract placeholder while the mock adapter provides deterministic signed
 * sample data for local/runtime tests.
 */
@Injectable()
export class TeslaRegulatoryEventsService implements OnModuleInit {
  private readonly logger = new Logger(TeslaRegulatoryEventsService.name);
  private readonly capabilityProfilesByVin = new Map<
    string,
    TeslaRegulatoryCapabilityProfile
  >();
  private readonly reasonCodeDictionariesByVersion = new Map<
    string,
    TeslaRegulatoryReasonCodeDictionary
  >();
  private readonly regulatoryEventsByVin = new Map<string, TeslaRegulatoryEvent[]>();

  private readonly eventProvider: TeslaRegulatoryEventProvider;

  constructor(
    @Optional()
    private readonly repository?: TeslaRegulatoryEventsRepository,
    @Optional()
    @Inject(TESLA_REGULATORY_EVENT_PROVIDER)
    eventProvider?: TeslaRegulatoryEventProvider,
  ) {
    this.eventProvider = eventProvider ?? new TeslaRegulatoryMockAdapter();
  }

  async onModuleInit() {
    if (!this.repository) {
      return;
    }

    try {
      const state = await this.repository.loadState();
      for (const profile of state.capabilityProfiles) {
        this.capabilityProfilesByVin.set(this.normalizeVin(profile.vin), profile);
      }
      for (const dictionary of state.reasonCodeDictionaries) {
        this.reasonCodeDictionariesByVersion.set(
          this.dictionaryMapKey(
            dictionary.providerCode,
            dictionary.dictionaryVersion,
          ),
          dictionary,
        );
      }
    } catch (error) {
      this.repository.reportPersistenceFailure(error, "module init");
    }
  }

  async getVehicleCapabilities(
    vin: string,
    options?: {
      refresh?: boolean;
    },
  ) {
    const normalizedVin = this.normalizeVin(vin);
    const cached = this.capabilityProfilesByVin.get(normalizedVin);
    if (cached && !options?.refresh) {
      return this.cloneCapabilityProfile(cached);
    }

    return this.refreshVehicleCapabilities(normalizedVin);
  }

  getStoredCapabilityProfile(vin: string) {
    const normalizedVin = this.normalizeVin(vin);
    const cached = this.capabilityProfilesByVin.get(normalizedVin);
    return cached ? this.cloneCapabilityProfile(cached) : null;
  }

  listStoredEvents(vin: string) {
    const normalizedVin = this.normalizeVin(vin);
    return (this.regulatoryEventsByVin.get(normalizedVin) ?? []).map((event) =>
      this.cloneEvent(event),
    );
  }

  listReasonCodeDictionaries() {
    return [...this.reasonCodeDictionariesByVersion.values()].map((dictionary) =>
      this.cloneReasonCodeDictionary(dictionary),
    );
  }

  assertPassengerServiceEligible(vin: string) {
    const normalizedVin = this.normalizeVin(vin);
    const profile = this.capabilityProfilesByVin.get(normalizedVin);
    if (!profile) {
      throw new ApiRequestError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "PHASE2_PROVIDER_UNAVAILABLE",
        "Tesla capability profile is unavailable for the requested VIN. Query the capability profile before enabling passenger service.",
        {
          vin: normalizedVin,
        },
        true,
      );
    }

    if (
      profile.passengerServiceStatus === "gated" ||
      profile.missingRequiredCapabilities.length > 0
    ) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "PHASE2_PROVIDER_CAPABILITY_MISSING",
        "Passenger service is gated because the Tesla provider is missing required capabilities for this VIN.",
        {
          vin: normalizedVin,
          reasonCode: profile.passengerServiceReasonCode,
          missingRequiredCapabilities: profile.missingRequiredCapabilities,
          reasonCodeDictionaryVersion: profile.reasonCodeDictionaryVersion,
        },
      );
    }

    return this.cloneCapabilityProfile(profile);
  }

  private async refreshVehicleCapabilities(vin: string) {
    const profile = await this.eventProvider.getCapabilities({
      vin,
      externalVehicleRef: vin,
    });
    const dictionary = await this.eventProvider.getReasonCodeDictionary({
      providerCode: profile.providerCode,
      vin,
    });
    const events = await this.eventProvider.fetchEvents({
      vin,
      vehicleId: profile.vehicleId,
      externalVehicleRef: profile.externalVehicleRef,
      since: this.computeSyncWindowStart(),
      until: profile.checkedAt,
    });

    const persistedProfile = this.hydrateCapabilityProfile(profile, dictionary, vin);

    this.reasonCodeDictionariesByVersion.set(
      this.dictionaryMapKey(
        dictionary.providerCode,
        dictionary.dictionaryVersion,
      ),
      this.cloneReasonCodeDictionary(dictionary),
    );
    this.capabilityProfilesByVin.set(
      vin,
      this.cloneCapabilityProfile(persistedProfile),
    );
    this.regulatoryEventsByVin.set(
      vin,
      events.map((event) => this.cloneEvent(event)),
    );

    try {
      await Promise.all([
        this.repository?.upsertCapabilityProfile(persistedProfile),
        this.repository?.upsertReasonCodeDictionary(dictionary),
        this.repository?.appendRegulatoryEvents(events),
      ]);
    } catch (error) {
      this.repository?.reportPersistenceFailure(
        error,
        "refresh vehicle capabilities",
      );
    }

    return this.cloneCapabilityProfile(persistedProfile);
  }

  private hydrateCapabilityProfile(
    profile: TeslaRegulatoryCapabilityProfile,
    dictionary: TeslaRegulatoryReasonCodeDictionary,
    vin: string,
  ): TeslaRegulatoryCapabilityProfile {
    const missingRequiredCapabilities = profile.requiredCapabilities.filter(
      (requiredCapability) =>
        !profile.capabilities.some(
          (capability) =>
            capability.capability === requiredCapability && capability.available,
        ),
    );

    return {
      ...profile,
      profileId: profile.profileId || randomUUID(),
      vin,
      reasonCodeDictionaryVersion:
        profile.reasonCodeDictionaryVersion || dictionary.dictionaryVersion,
      missingRequiredCapabilities,
      passengerServiceStatus:
        missingRequiredCapabilities.length === 0 ? "eligible" : "gated",
      passengerServiceReasonCode:
        missingRequiredCapabilities.length === 0
          ? null
          : "required-capability-missing",
    };
  }

  private normalizeVin(vin: string) {
    const normalizedVin = vin.trim().toUpperCase();
    if (!normalizedVin) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VIN_REQUIRED",
        "vin path parameter is required.",
      );
    }

    return normalizedVin;
  }

  private computeSyncWindowStart() {
    return "2026-06-25T00:00:00.000Z";
  }

  private dictionaryMapKey(providerCode: string, dictionaryVersion: string) {
    return `${providerCode}:${dictionaryVersion}`;
  }

  private cloneCapabilityProfile(profile: TeslaRegulatoryCapabilityProfile) {
    return JSON.parse(
      JSON.stringify(profile),
    ) as TeslaRegulatoryCapabilityProfile;
  }

  private cloneReasonCodeDictionary(
    dictionary: TeslaRegulatoryReasonCodeDictionary,
  ) {
    return JSON.parse(
      JSON.stringify(dictionary),
    ) as TeslaRegulatoryReasonCodeDictionary;
  }

  private cloneEvent(event: TeslaRegulatoryEvent) {
    return JSON.parse(JSON.stringify(event)) as TeslaRegulatoryEvent;
  }
}
