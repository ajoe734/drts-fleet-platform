import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { VoiceBookingAuthorizationService } from "./voice-booking-authorization.service";
import { VoiceBookingRepository } from "./voice-booking.repository";
import { VoiceLineScopeService } from "./voice-line-scope.service";
import { VoiceSessionRepository } from "./voice-session.repository";

/**
 * UV-EXEC-003 built VoiceBookingRepository/VoiceBookingAuthorizationService/
 * VoiceLineScopeService as free-standing injectables with no module wiring
 * ("legacy controller wiring is out of scope"). UV-EXEC-005 is that wiring:
 * legacy callcenter/multi-taxi/owned-mobility writers need
 * VoiceBookingRepository to fence against an already-bound voice intent
 * (SD §7.4/§7.5). UV-EXEC-010 adds VoiceSessionRepository.
 */
@Module({
  imports: [DatabaseModule],
  providers: [
    VoiceBookingRepository,
    VoiceBookingAuthorizationService,
    VoiceLineScopeService,
    VoiceSessionRepository,
  ],
  exports: [
    VoiceBookingRepository,
    VoiceBookingAuthorizationService,
    VoiceLineScopeService,
    VoiceSessionRepository,
  ],
})
export class VoiceBookingModule {}
