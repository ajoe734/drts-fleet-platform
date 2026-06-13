import { Injectable } from "@nestjs/common";

import {
  PARTNER_REFERRAL_CHANNEL_KEY,
  REFERRAL_SETTLEMENT_DIRECTION_DRTS_PAYS_PARTNER,
  type ReferralSettlementChannelKey,
  type ReferralSettlementDirection,
} from "@drts/contracts";

@Injectable()
export class ReferralSettlementScaffoldService {
  getReferralSettlementScaffold(): {
    channelKey: ReferralSettlementChannelKey;
    direction: ReferralSettlementDirection;
    payer: "drts_platform";
    payee: "partner";
  } {
    return {
      channelKey: PARTNER_REFERRAL_CHANNEL_KEY,
      direction: REFERRAL_SETTLEMENT_DIRECTION_DRTS_PAYS_PARTNER,
      payer: "drts_platform",
      payee: "partner",
    };
  }
}
