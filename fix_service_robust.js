const fs = require("fs");
const file = "apps/api/src/modules/multi-taxi/multi-taxi.service.ts";
let code = fs.readFileSync(file, "utf8");

const regex =
  /async createRide\([\s\S]*?return \{[\s\S]*?orderId: order\.orderId,\n\s*status: order\.status,\n\s*\};\n\s*\}/;

const newCreateRide = `async createRide(
    command: CreateMultiTaxiRideCommand,
    identity: BootstrapRequestIdentity | null,
    requestId?: string,
  ) {
    this.assertServiceProductPolicy();
    const authorization = this.resolveActiveAuthorization();

    let link: any = null;
    let entry: any = null;
    if (
      identity?.realm === "partner" &&
      identity.partnerEntrySlug &&
      identity.drtsPassengerId
    ) {
      link = await this.partnerUserIdentityLinkRepository?.findByDrtsPassengerId(
        identity.partnerEntrySlug,
        identity.drtsPassengerId,
      );
      entry = this.tenantPartnerService?.getPartnerEntry(
        identity.partnerEntrySlug,
      );
    }

    const partnerNotificationContextFactory = (link && entry) ? (orderId: string) => ({
      route: {
        orderId,
        tenantId: entry.tenantId,
        partnerId: entry.partnerId,
        entrySlug: entry.entrySlug,
        partnerUserRef: link.partnerUserRef,
        drtsPassengerId: link.drtsPassengerId,
        passengerSubjectRef: identity!.subject || identity!.drtsPassengerId || "unknown",
        identityLinkedAt: link.linkedAt,
        consentBundleVersion: link.consentScope || "passenger_identity_link",
        notificationPolicyVersion: "partner_notification_v1",
        rideRef: orderId,
        createdAt: new Date().toISOString(),
      },
      sequence: {
        orderId,
        nextSequence: 1,
      }
    }) : undefined;

    const order = await this.ownedMobilityService.createMultiTaxiRide(
      command,
      authorization,
      identity,
      requestId,
      undefined,
      partnerNotificationContextFactory
    );

    if (link && entry) {
      // SD §4: 建立正式 order 的同一交易內寫入 route 及 sequence。 (Now done via partnerNotificationContextFactory inside OwnedMobilityService's transaction)
      const accessResult = await this.createRideAccessResult(order, requestId);
      return accessResult;
    }

    return {
      orderId: order.orderId,
      status: order.status,
    };
  }`;

code = code.replace(regex, newCreateRide);
fs.writeFileSync(file, code);
