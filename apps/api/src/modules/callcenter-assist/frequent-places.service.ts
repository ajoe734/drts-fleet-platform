import { Injectable, Logger } from "@nestjs/common";

import { CallcenterAssistRepository } from "./callcenter-assist.repository";
import {
  aggregateFrequentPlaces,
  FREQUENT_PLACE_LOOKBACK_DAYS,
  FREQUENT_PLACE_ORDER_STATUSES,
  type FrequentPickupPlace,
  taiwanPhoneVariants,
} from "./frequent-places";

/**
 * CALLCENTER-AI-ASSIST-20261111: a phone number's most used pickup places
 * over the last year. See `frequent-places.ts` for what callers of this
 * service may and may not do with the result.
 */
@Injectable()
export class CallcenterFrequentPlacesService {
  private readonly logger = new Logger(CallcenterFrequentPlacesService.name);

  constructor(private readonly repository: CallcenterAssistRepository) {}

  async forPhone(
    phone: string | null | undefined,
    now: Date = new Date(),
  ): Promise<FrequentPickupPlace[]> {
    const variants = taiwanPhoneVariants(phone);
    if (!variants.length) {
      return [];
    }
    const since = new Date(
      now.getTime() - FREQUENT_PLACE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
    );
    const rows = await this.repository.findRecentPickupsByPhone(
      variants,
      FREQUENT_PLACE_ORDER_STATUSES,
      since,
    );
    return aggregateFrequentPlaces(rows);
  }

  /** Same lookup, but a failure only means "no suggestions". */
  async forPhoneBestEffort(phone: string | null | undefined) {
    try {
      return await this.forPhone(phone);
    } catch (error) {
      this.logger.warn(
        `Frequent pickup lookup failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }
}
