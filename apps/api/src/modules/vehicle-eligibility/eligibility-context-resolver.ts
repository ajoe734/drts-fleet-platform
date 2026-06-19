import { Injectable } from "@nestjs/common";

import type {
  ExactServiceProductContext,
  OwnedOrderRecord,
} from "@drts/contracts";

@Injectable()
export class EligibilityContextResolver {
  resolveExactProductContext(
    _order: OwnedOrderRecord,
  ): ExactServiceProductContext | null {
    return null;
  }
}
