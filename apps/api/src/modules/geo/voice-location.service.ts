import { Injectable } from "@nestjs/common";
import { isValidGeoPoint, type VoiceResolvedLocation } from "@drts/contracts";
import { ApiRequestError } from "../../common/api-envelope";
import { GeoService } from "./geo.service";

export interface VoiceLocationSelection {
  rawText: string;
  candidateId: string;
  entranceId?: string;
}

/** Selection references are resolved again by GeoService, never model coordinates. */
@Injectable()
export class VoiceLocationService {
  constructor(private readonly geo: GeoService) {}

  async resolve(
    selection: VoiceLocationSelection,
  ): Promise<VoiceResolvedLocation> {
    const health = this.geo.health();
    if (
      health.status !== "healthy" ||
      health.failClosed ||
      health.mode !== "external"
    )
      throw new ApiRequestError(
        409,
        "VOICE_ADDRESS_PROVIDER_UNAVAILABLE",
        "Live address truth is unavailable.",
      );
    const result = await this.geo.search({
      q: selection.rawText,
      limit: 3,
      surface: "callcenter",
    });
    const matches = result.candidates.filter(
      (candidate) => candidate.candidateId === selection.candidateId,
    );
    if (result.degraded || matches.length !== 1)
      throw new ApiRequestError(
        409,
        "VOICE_ADDRESS_SELECTION_REQUIRED",
        "Select a current address candidate.",
      );
    const candidate = matches[0]!;
    const entranceId =
      typeof candidate.metadata?.entranceId === "string"
        ? candidate.metadata.entranceId
        : null;
    if (
      (candidate.metadata?.requiresEntranceSelection === true ||
        (Array.isArray(candidate.metadata?.types) &&
          candidate.metadata.types.some((type) =>
            ["hospital", "university", "airport"].includes(String(type)),
          )) ||
        candidate.metadata?.campusId ||
        entranceId ||
        selection.entranceId) &&
      (!entranceId || entranceId !== selection.entranceId)
    )
      throw new ApiRequestError(
        409,
        "VOICE_ENTRANCE_SELECTION_REQUIRED",
        "Select the provider's pickup entrance.",
      );
    if (!candidate.placeId && !candidate.providerCandidateId)
      throw new ApiRequestError(
        409,
        "VOICE_ADDRESS_TRUTH_REQUIRED",
        "Provider place identity is required.",
      );
    const resolved = await this.geo.resolve({
      candidateId: candidate.candidateId,
      placeId: candidate.placeId ?? null,
      providerCandidateId: candidate.providerCandidateId ?? null,
      addressText: candidate.address,
      surface: "callcenter",
    });
    if (
      !isValidGeoPoint(resolved.address) ||
      resolved.address.coordinateSource !== "provider_candidate" ||
      resolved.address.geocodeConfidence !== "exact" ||
      !resolved.address.normalizedAddress ||
      resolved.provider !== candidate.provider ||
      (candidate.placeId && resolved.address.placeId !== candidate.placeId)
    )
      throw new ApiRequestError(
        409,
        "VOICE_ADDRESS_TRUTH_REQUIRED",
        "An exact provider-resolved address is required.",
      );
    const resolvedMs = Date.parse(resolved.resolvedAt);
    if (
      !Number.isFinite(resolvedMs) ||
      resolvedMs > Date.now() ||
      Date.now() - resolvedMs >= 120_000
    )
      throw new ApiRequestError(
        409,
        "VOICE_ADDRESS_EXPIRED",
        "Address resolution expired.",
      );
    return {
      rawText: selection.rawText,
      selectedCandidateId: candidate.candidateId,
      entranceId,
      address: structuredClone(resolved.address),
      resolutionVersion: `${resolved.provider}:${resolved.resolvedAt}`,
      validUntil: new Date(resolvedMs + 120_000).toISOString(),
    };
  }
}
