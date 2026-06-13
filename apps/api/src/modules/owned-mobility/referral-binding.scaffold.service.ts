import { Injectable } from "@nestjs/common";

import type { PartnerUserIdentityLinkRecord } from "@drts/contracts";

@Injectable()
export class ReferralBindingScaffoldService {
  buildBindingSnapshot(
    link: PartnerUserIdentityLinkRecord,
  ): Pick<
    PartnerUserIdentityLinkRecord,
    "entrySlug" | "partnerUserRef" | "drtsPassengerId" | "status" | "lastSeenAt"
  > {
    return {
      entrySlug: link.entrySlug,
      partnerUserRef: link.partnerUserRef,
      drtsPassengerId: link.drtsPassengerId,
      status: link.status,
      lastSeenAt: link.lastSeenAt,
    };
  }
}
