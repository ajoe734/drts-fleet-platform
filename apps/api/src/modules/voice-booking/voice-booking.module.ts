import { VoiceConfirmationService } from "./voice-confirmation.service";
import { GeoModule } from "../geo/geo.module";
import { ServiceAreaModule } from "../service-area/service-area.module";
import { ServiceProductModule } from "../service-product/service-product.module";
import { VoiceBookingDraftService } from "./voice-booking-draft.service";
import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { VoiceBookingAuthorizationService } from "./voice-booking-authorization.service";
import { VoiceBookingRepository } from "./voice-booking.repository";
import { VoiceLineScopeService } from "./voice-line-scope.service";
import { VoiceCheckpointRepository } from "./voice-checkpoint.repository";
import { VoiceEvidenceService } from "./voice-evidence.service";
import { VoiceDispatchProjectionService } from "./voice-dispatch-projection.service";
import { VoiceBookingCommandService } from "./voice-booking-command.service";
import { VoiceCommandRunnerService } from "./voice-command-runner.service";
import { OwnedMobilityRepository } from "../owned-mobility/owned-mobility.repository";

import { VoiceHandoffService } from "./voice-handoff.service";
import { VoiceSessionService } from "./voice-session.service";
import { VoiceSessionRepository } from "./voice-session.repository";
import { VoiceHandoffQueueService } from "../callcenter/voice-handoff-queue.service";

import { VoiceContactService } from "./voice-contact.service";
import { VoiceCallbackService } from "./voice-callback.service";

/**
 * UV-EXEC-003 built VoiceBookingRepository/VoiceBookingAuthorizationService/
 * VoiceLineScopeService as free-standing injectables with no module wiring
 * ("legacy controller wiring is out of scope"). UV-EXEC-005 is that wiring:
 * legacy callcenter/multi-taxi/owned-mobility writers need
 * VoiceBookingRepository to fence against an already-bound voice intent
 * (SD §7.4/§7.5).
 */
@Module({
  imports: [DatabaseModule, GeoModule, ServiceAreaModule, ServiceProductModule],
  providers: [
    OwnedMobilityRepository,
    VoiceBookingCommandService,
    VoiceCommandRunnerService,
    VoiceBookingDraftService,
    VoiceConfirmationService,
    VoiceCheckpointRepository,
    VoiceEvidenceService,
    VoiceBookingRepository,
    VoiceBookingAuthorizationService,
    VoiceLineScopeService,
    VoiceDispatchProjectionService,
    VoiceSessionRepository,
    VoiceSessionService,
    VoiceHandoffQueueService,
    VoiceHandoffService,
    VoiceContactService,
    VoiceCallbackService,
  ],
  exports: [
    VoiceBookingCommandService,
    VoiceCommandRunnerService,
    VoiceBookingDraftService,
    VoiceConfirmationService,
    VoiceEvidenceService,
    VoiceBookingRepository,
    VoiceBookingAuthorizationService,
    VoiceLineScopeService,
    VoiceDispatchProjectionService,
    VoiceSessionRepository,
    VoiceSessionService,
    VoiceHandoffQueueService,
    VoiceHandoffService,
    VoiceContactService,
    VoiceCallbackService,
  ],
})
export class VoiceBookingModule {}

