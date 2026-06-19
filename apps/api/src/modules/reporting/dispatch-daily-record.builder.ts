import { Injectable } from "@nestjs/common";

import type { DispatchDailyRecord } from "@drts/contracts";

@Injectable()
export class DispatchDailyRecordBuilder {
  build(_filters: Record<string, unknown>): DispatchDailyRecord[] {
    return [];
  }
}
