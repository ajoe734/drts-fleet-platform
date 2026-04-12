import { Controller, Get, Headers } from "@nestjs/common";

import type { Phase1FoundationManifest } from "@drts/contracts";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import {
  CANONICAL_HARD_RULES,
  EXECUTION_MODE,
  FOUNDATION_MODULE_STATUSES,
} from "./foundation.constants";

@Controller("system/foundation")
export class FoundationController {
  @Get("manifest")
  getManifest(@Headers("x-request-id") requestId?: string) {
    const manifest: Phase1FoundationManifest = {
      phase: "phase1",
      executionMode: EXECUTION_MODE,
      canonicalHardRules: [...CANONICAL_HARD_RULES],
      modules: FOUNDATION_MODULE_STATUSES.map((moduleStatus) => ({
        ...moduleStatus,
        notes: [...moduleStatus.notes],
      })),
    };

    return toApiSuccessEnvelope(manifest, requestId);
  }
}
