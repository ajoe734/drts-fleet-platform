import { Injectable } from "@nestjs/common";

import type { SixMonthOperationsSummary } from "@drts/contracts";

@Injectable()
export class OperationsSummaryAggregator {
  aggregate(_filters: Record<string, unknown>): SixMonthOperationsSummary[] {
    return [];
  }
}
