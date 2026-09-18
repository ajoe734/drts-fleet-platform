import { Injectable } from "@nestjs/common";

import { ApiRequestError } from "../../common/api-envelope";
import {
  VoiceBookingRepository,
  type VoiceLineBindingRecord,
  type VoiceResourceScopeRecord,
} from "./voice-booking.repository";

/**
 * SD §4.1 step 2 / §4.3: the trusted admission facts a provider webhook
 * supplies. `dnis` is the number the call actually reached (the destination
 * the provider terminated the call on), `providerAccountId` identifies the
 * signature-verified provider account. This type has no field for the
 * caller's asserted number (ANI) or any client-declared brand/scope --
 * there is structurally nothing here for a hidden/spoofed ANI to influence,
 * because line-scope resolution never reads a caller-number field at all.
 */
export interface TrustedCallAdmission {
  providerAccountId: string;
  dnis: string;
}

export interface ResolvedVoiceLineScope {
  lineBinding: VoiceLineBindingRecord;
  resourceScope: VoiceResourceScopeRecord;
}

@Injectable()
export class VoiceLineScopeService {
  constructor(private readonly repository: VoiceBookingRepository) {}

  /**
   * SD §4.3: "由已批准 runtime／ServiceProduct 推導 ... 未知／多重／未授權映射拒絕新單".
   * Resolves the DID the call actually reached to its brand/operating-profile
   * binding and then to the active resource scope authority for that brand.
   * Fails closed (VOICE_LINE_NOT_BOUND / VOICE_SCOPE_DENIED) on zero or more
   * than one match at either step -- never guesses or falls back to a
   * default brand.
   */
  async resolveLineScope(
    admission: TrustedCallAdmission,
  ): Promise<ResolvedVoiceLineScope> {
    const bindings = await this.repository.findEnabledLineBindings(
      admission.providerAccountId,
      admission.dnis,
    );

    if (bindings.length === 0) {
      throw new ApiRequestError(
        403,
        "VOICE_LINE_NOT_BOUND",
        "The dialed number is not bound to any active voice line configuration.",
        { providerAccountId: admission.providerAccountId, dnis: admission.dnis },
      );
    }

    if (bindings.length > 1) {
      throw new ApiRequestError(
        403,
        "VOICE_LINE_NOT_BOUND",
        "The dialed number resolved to more than one active voice line binding; refusing to guess.",
        { providerAccountId: admission.providerAccountId, dnis: admission.dnis },
      );
    }

    const lineBinding = bindings[0]!;

    // v1 admission (SD §4.3 row 1, "普通電話即時單") resolves a single
    // default resource scope per brand; no operating-unit disambiguation
    // input exists yet at this stage, so this deliberately passes `null`
    // rather than inferring one.
    const resourceScope = await this.repository.findActiveResourceScopeForBrand(
      lineBinding.brandId,
      null,
    );

    if (!resourceScope) {
      throw new ApiRequestError(
        403,
        "VOICE_SCOPE_DENIED",
        "The line's brand has no active resource scope authority.",
        { brandId: lineBinding.brandId },
      );
    }

    return { lineBinding, resourceScope };
  }
}
