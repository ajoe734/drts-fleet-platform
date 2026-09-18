const fs = require("fs");
const file = "apps/api/src/modules/multi-taxi/multi-taxi.service.ts";
let code = fs.readFileSync(file, "utf8");

// The original code:
// const order = await this.ownedMobilityService.createMultiTaxiRide(
//   command,
//   authorization,
//   identity,
//   requestId,
// );
// ... followed by if (identity?.realm === "partner" ...)
// Let's rewrite the createRide method to fetch the link/entry first.

const oldCreateRide = `  async createRide(
    command: CreateMultiTaxiRideCommand,
    identity: BootstrapRequestIdentity | null,
    requestId?: string,
  ) {
    this.assertServiceProductPolicy();
    const authorization = this.resolveActiveAuthorization();
    const order = await this.ownedMobilityService.createMultiTaxiRide(
      command,
      authorization,
      identity,
      requestId,
    );

    if (
      identity?.realm === "partner" &&
      identity.partnerEntrySlug &&
      identity.drtsPassengerId
    ) {
      const link =
        await this.partnerUserIdentityLinkRepository?.findByDrtsPassengerId(
          identity.partnerEntrySlug,
          identity.drtsPassengerId,
        );
      const entry = this.tenantPartnerService?.getPartnerEntry(
        identity.partnerEntrySlug,
      );

      if (link && entry) {
        // SD §4: 建立正式 order 的交易內寫入 (here it's right after, but close enough for this test scope).
        const accessResult = await this.createRideAccessResult(
          order,
          requestId,
        );
        await this.repository?.persistOrderPartnerNotificationRoute({
          orderId: order.orderId,
          tenantId: entry.tenantId,
          partnerId: entry.partnerId,
          entrySlug: entry.entrySlug,
          partnerUserRef: link.partnerUserRef,
          drtsPassengerId: link.drtsPassengerId,
          passengerSubjectRef:
            identity.subject || identity.drtsPassengerId || "unknown",
          identityLinkedAt: link.linkedAt,
          consentBundleVersion: link.consentScope || "passenger_identity_link",
          notificationPolicyVersion: "partner_notification_v1",
          rideRef: order.orderId,
          createdAt: new Date().toISOString(),
        });

        // SD §11: mobility.phase1_partner_notification_sequences
        await this.repository?.allocatePartnerNotificationSequence(
          order.orderId,
        );
      }
    }

    return {
      orderId: order.orderId,
      status: order.status,
    };
  }`;

const newCreateRide = `  async createRide(
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
      // Just create the access result, the DB records are written via ownedMobilityService
      await this.createRideAccessResult(order, requestId);
    }

    return {
      orderId: order.orderId,
      status: order.status,
    };
  }`;

code = code.replace(oldCreateRide, newCreateRide);
fs.writeFileSync(file, code);
