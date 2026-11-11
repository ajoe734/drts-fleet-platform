import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { LlmGatewayModule } from "../../common/llm-gateway";
import { VoiceHandoffQueueRepository } from "../callcenter/voice-handoff-queue.repository";
import { VoiceHandoffQueueService } from "../callcenter/voice-handoff-queue.service";
import { CallcenterAssistRepository } from "./callcenter-assist.repository";
import { CallcenterAssistService } from "./callcenter-assist.service";
import { CallcenterFrequentPlacesService } from "./frequent-places.service";

/**
 * CALLCENTER-AI-ASSIST-20261111. Owns the single human handoff queue and the
 * AI-prefilled booking drafts. Both the voice module (which hands calls to a
 * human) and the callcenter module (where agents take them) import this
 * module, so they share one queue instead of each keeping its own.
 */
@Module({
  imports: [DatabaseModule, LlmGatewayModule],
  providers: [
    VoiceHandoffQueueRepository,
    VoiceHandoffQueueService,
    CallcenterAssistRepository,
    CallcenterAssistService,
    CallcenterFrequentPlacesService,
  ],
  exports: [
    VoiceHandoffQueueService,
    CallcenterAssistService,
    CallcenterFrequentPlacesService,
  ],
})
export class CallcenterAssistModule {}
