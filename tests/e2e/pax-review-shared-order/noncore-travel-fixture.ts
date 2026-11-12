import { createHash, randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import type {
  FleetPartnerRecord,
  PartnerChannelEntryRecord,
  PartnerIngressCredentialIssued,
  PartnerIngressHandoffSession,
} from "@drts/contracts";
import { PartnerFixture } from "../system-remediation/sr-partner-notify-qa-20260917/partner-fixture";

type Data = Record<string, any>;
export const PARTNER_ORIGIN = "http://127.0.0.1:3007";
export const NONCORE_API = "http://127.0.0.1:3001";
export function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing normal hosted fixture ${name}`);
  return value;
}
export const camel = (value: any): any =>
  Array.isArray(value)
    ? value.map(camel)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value).map(([key, item]) => [
            key.replace(/_([a-z])/g, (_, letter: string) =>
              letter.toUpperCase(),
            ),
            camel(item),
          ]),
        )
      : value;

/** All mutations are normal HTTP; SQL below is independently read-only. */
export class NoncoreTravelFixture {
  readonly fixture = new PartnerFixture(); // Never starts notification receivers.
  readonly marker = randomUUID();
  readonly scopes: {
    entry: PartnerChannelEntryRecord;
    keyId: string | null;
  }[] = [];
  readonly platform = required("DRTS_UAT_TOKEN_PLATFORM");
  readonly tenantId = required("DRTS_UAT_TENANT_A");
  readonly tenantToken = required("DRTS_UAT_TOKEN_A");

  async entry(
    partnerType: "fleet_partner" | "travel_agency" | "insurance_company",
    fleetPartnerId?: string,
  ) {
    const slug = `travel-completion-${randomUUID()}`;
    const entry = await this.fixture.call<PartnerChannelEntryRecord>(
      "platform-admin/partner-entries",
      this.platform,
      "POST",
      {
        tenantId: this.tenantId,
        partnerCode: slug,
        partnerType,
        programId: `program-${slug}`,
        programCode: `SIM-${slug}`,
        entrySlug: slug,
        displayName: `SIM noncore completion ${partnerType}`,
        businessDispatchSubtype:
          partnerType === "fleet_partner"
            ? "enterprise_dispatch"
            : partnerType === "insurance_company"
              ? "insurance_replacement_vehicle"
              : "travel_agency_transfer",
        authMode: "partner_api_key",
        eligibilityMode:
          partnerType === "fleet_partner" ? "none" : "reference_required",
        entryHost: new URL(PARTNER_ORIGIN).host,
        entryPath: `/${slug}/book`,
        status: "active",
        activeFlag: true,
        ...(fleetPartnerId ? { fleetPartnerId } : {}),
      },
    );
    const owned = { entry, keyId: null as string | null };
    this.scopes.push(owned);
    const issued = await this.fixture.call<PartnerIngressCredentialIssued>(
      `platform-admin/partner-entries/${encodeURIComponent(slug)}/credentials/issue`,
      this.platform,
      "POST",
      {
        purpose:
          "Disposable normal travel completion; external facts explicitly SIM",
        ...(partnerType === "fleet_partner"
          ? {
              ownerRef: slug,
              ownerName: "Synthetic hosted fleet caller",
              ownerType: "operational_acceptance",
              scopes: ["billing:read", "partner:read", "partner:write"],
              expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
            }
          : {}),
      },
    );
    expect(issued.plaintextKey).toBeTruthy();
    owned.keyId = issued.credential.keyId;
    expect(entry.tenantId).toBe(this.tenantId);
    return { entry, apiKey: issued.plaintextKey };
  }

  async fleetSupply(
    subtype:
      | "travel_agency_transfer"
      | "insurance_replacement_vehicle" = "travel_agency_transfer",
  ) {
    const fleet = await this.fixture.call<FleetPartnerRecord>(
      "admin/fleet-partners",
      this.platform,
      "POST",
      {
        legalName: `SIM synthetic travel fleet ${this.marker}`,
        displayName: "SIM hosted travel fleet",
        businessRegistrationNo: `SIM-${this.marker}`,
        contactName: "SIM Fleet Contact",
        contactPhone: "0900000034",
        active: true,
        partnershipType: "business_dispatch_fleet",
      },
    );
    const authority = await this.entry("fleet_partner", fleet.fleetPartnerId);
    expect(authority.entry.partnerId).toBe(fleet.fleetPartnerId);
    const bootstrap = await this.fixture.call<Data>(
      "auth/partner/bootstrap-session",
      null,
      "POST",
      {
        entrySlug: authority.entry.entrySlug,
        apiKey: authority.apiKey,
      },
    );
    expect(bootstrap.tokenType).toBe("Bearer");
    expect(bootstrap.partnerEntry.partnerId).toBe(fleet.fleetPartnerId);
    const token = bootstrap.accessToken as string;
    expect(token).toBeTruthy();
    const session = await this.fixture.call<Data>("auth/session", token);
    expect(session).toMatchObject({
      active: true,
      identity: {
        realm: "partner",
        actorType: "partner_api_key",
        partnerId: fleet.fleetPartnerId,
      },
    });
    const headers = {
      Authorization: `Bearer ${token}`,
      "x-fleet-partner-id": fleet.fleetPartnerId,
    };
    const fleetCall = async (
      apiPath: string,
      method = "GET",
      data?: unknown,
    ) => {
      const response = await fetch(`${NONCORE_API}/api/${apiPath}`, {
        method,
        headers: { ...headers, "Content-Type": "application/json" },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }),
        redirect: "error",
        signal: AbortSignal.timeout(20_000),
      });
      const wire = camel(await response.json());
      expect(
        response.status,
        `${method} fleet API ${apiPath}: ${wire.error?.code ?? "response"}`,
      ).toBe(method === "POST" ? 201 : 200);
      expect(response.headers.get("x-drts-candidate-sha")).toBe(
        required("CANDIDATE_SHA"),
      );
      expect(wire.data).toBeDefined();
      return wire.data as Data;
    };
    const from = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const until = new Date(Date.now() + 365 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const approve = async (submissionId: string, documentTypes: string[]) => {
      const base = `fleet-partner/supply-submissions/${encodeURIComponent(submissionId)}`;
      for (const documentType of documentTypes) {
        const before = await fleetCall(base);
        const revision = before.submission.revisionNo;
        expect(before.submission.fleetPartnerId).toBe(fleet.fleetPartnerId);
        const originalFileName = `${documentType}-SIM.pdf`;
        const grant = await fleetCall(`${base}/documents/upload-url`, "POST", {
          expectedRevisionNo: revision,
          documentType,
          originalFileName,
          contentType: "application/pdf",
        });
        const bytes = Buffer.from(
          `%PDF-1.4\n% SIM ${documentType} ${this.marker}\n%%EOF\n`,
        );
        const sha256 = createHash("sha256").update(bytes).digest("hex");
        const uploaded = await fetch(new URL(grant.uploadUrl, NONCORE_API), {
          method: "PUT",
          headers: { ...headers, "Content-Type": "application/octet-stream" },
          body: new Uint8Array(bytes),
          redirect: "error",
          signal: AbortSignal.timeout(20_000),
        });
        expect(uploaded.status).toBe(200);
        expect(camel(await uploaded.json()).data.scanState).toBe("clean");
        const confirmed = await fleetCall(`${base}/documents/confirm`, "POST", {
          expectedRevisionNo: revision,
          documentType,
          originalFileName,
          objectKey: grant.objectKey,
          contentType: "application/pdf",
          fileSize: bytes.length,
          checksumSha256: sha256,
          effectiveFrom: from,
          effectiveUntil: until,
        });
        const read = await fetch(
          `${NONCORE_API}/api/${base}/documents/${encodeURIComponent(confirmed.documentId)}/download`,
          {
            headers,
            redirect: "error",
            signal: AbortSignal.timeout(20_000),
          },
        );
        expect(read.status).toBe(200);
        expect(
          createHash("sha256")
            .update(Buffer.from(await read.arrayBuffer()))
            .digest("hex"),
        ).toBe(sha256);
      }
      const current = await fleetCall(base);
      await fleetCall(`${base}/submit`, "POST", {
        expectedRevisionNo: current.submission.revisionNo,
      });
      for (const action of ["start", "approve"]) {
        const detail = await fleetCall(base);
        await this.fixture.call(
          `admin/supply-review/submissions/${encodeURIComponent(submissionId)}/${action}`,
          this.platform,
          "POST",
          {
            expectedRevisionNo: detail.submission.revisionNo,
            reasonCode: "synthetic_dev_demo",
            comment: "明示SIM文件／車司／設備；非真營運資格。",
          },
        );
      }
      const result = (await fleetCall(base)).submission;
      expect(result).toMatchObject({
        submissionId,
        fleetPartnerId: fleet.fleetPartnerId,
        status: "approved",
      });
      return result;
    };
    // Registry's existing bucket mapping recognizes 'dispatch'; declaring both
    // real supported products prevents travel being misclassified standard_taxi.
    const supportedServiceProductCodes = ["enterprise_dispatch", subtype];
    const driverDraft = await fleetCall(
      "fleet-partner/supply-submissions/drivers",
      "POST",
      {
        name: "SIM hosted travel driver",
        mobile: "0900000035",
        professionalDriverLicenseNo: `SIM-DL-${this.marker}`,
        professionalDriverLicenseExpiry: until,
        taxiDriverRegistrationNo: `SIM-REG-${this.marker}`,
        taxiDriverRegistrationArea: "TPE",
        taxiDriverRegistrationExpiry: until,
        supportedServiceProductCodes,
        preferredVehicleSubmissionId: null,
      },
    );
    const driver = await approve(driverDraft.submission.submissionId, [
      "professional_driver_license",
      "taxi_driver_registration",
    ]);
    // Approval provides canonical registration, not the separate own-Fleet
    // driver affiliation. Establish that existing durable relation normally.
    await this.fixture.call(
      `admin/drivers/${encodeURIComponent(driver.canonicalDriverId)}/fleet-affiliations`,
      this.platform,
      "POST",
      {
        fleetPartnerId: fleet.fleetPartnerId,
        affiliationType: "contracted_under",
        effectiveFrom: `${from}T00:00:00.000Z`,
        effectiveUntil: `${until}T23:59:59.000Z`,
      },
    );
    const vehicleDraft = await fleetCall(
      "fleet-partner/supply-submissions/vehicles",
      "POST",
      {
        plateNo: `SIM-${this.marker.slice(0, 8).toUpperCase()}`,
        licenseType: "business_vehicle",
        brand: "SIM",
        model: "synthetic travel vehicle",
        modelYear: new Date().getUTCFullYear(),
        seatCount: 5,
        luggageCapacity: 4,
        businessArea: "TPE",
        supportedServiceProductCodes,
        airportTransferEligible: true,
        fixedFareAllowed: true,
        currentDriverSubmissionId: driver.submissionId,
        doorCount: 4,
        color: "白色",
      },
    );
    const vehicle = await approve(vehicleDraft.submission.submissionId, [
      "vehicle_registration",
      "insurance_policy",
      "fleet_participation_contract",
    ]);
    expect(vehicle.canonicalContractId).toBeTruthy();
    expect(vehicle.canonicalPolicyId).toBeTruthy();
    const vehicleId = vehicle.canonicalVehicleId as string;
    const driverId = driver.canonicalDriverId as string;
    const exclusivity = `regulatory-registry/exclusivities/${encodeURIComponent(vehicleId)}`;
    await this.fixture.call(
      `${exclusivity}/submit-review`,
      this.platform,
      "POST",
      {
        exclusiveProviderName: "SIM synthetic hosted fleet",
        exclusiveOperatorId: fleet.fleetPartnerId,
        effectiveStart: `${from}T00:00:00.000Z`,
        effectiveEnd: `${until}T23:59:59.000Z`,
      },
    );
    await this.fixture.call(
      `${exclusivity}/approve`,
      this.platform,
      "POST",
      {},
    );
    await this.fixture.call(
      `regulatory-registry/drivers/${encodeURIComponent(driverId)}/work-state`,
      this.platform,
      "POST",
      { workState: "available" },
    );
    const driverReadiness = await fleetCall(
      `fleet-partner/readiness/drivers/${encodeURIComponent(driverId)}`,
    );
    const vehicleReadiness = await fleetCall(
      `fleet-partner/readiness/vehicles/${encodeURIComponent(vehicleId)}`,
    );
    expect(driverReadiness).toMatchObject({ state: "ready", reasonCodes: [] });
    expect(vehicleReadiness).toMatchObject({ state: "ready", reasonCodes: [] });
    return {
      driverId,
      vehicleId,
      fleetPartnerId: fleet.fleetPartnerId,
      driverSubmissionId: driver.submissionId,
      vehicleSubmissionId: vehicle.submissionId,
      contractId: vehicle.canonicalContractId,
      policyId: vehicle.canonicalPolicyId,
    };
  }

  async activateTravel() {
    return this.activateProduct("travel_agency_transfer");
  }

  async activateInsurance() {
    return this.activateProduct("insurance_replacement_vehicle");
  }

  private async activateProduct(
    subtype: "travel_agency_transfer" | "insurance_replacement_vehicle",
  ) {
    const before = await this.fixture.call<{ items: Data[] }>(
      "admin/service-products",
      this.platform,
    );
    const product = before.items.find(
      (item) => item.serviceProductType === subtype,
    );
    if (!product || product.serviceProductId.startsWith("seed-")) {
      await this.fixture.call("admin/service-products", this.platform, "POST", {
        serviceProductType: subtype,
        displayName:
          subtype === "travel_agency_transfer"
            ? "SIM hosted travel transfer"
            : "SIM hosted insurance replacement vehicle",
        timing: "reservation",
        active: true,
        defaultBillingMode: "partner_settlement",
        defaultProofRequirements: ["photo", "signoff"],
      });
    } else if (!product.active) {
      await this.fixture.call(
        `admin/service-products/${encodeURIComponent(product.serviceProductId)}`,
        this.platform,
        "PUT",
        { active: true, timing: "reservation" },
      );
    }
    const actual = await this.fixture.call<{ items: Data[] }>(
      "admin/service-products",
      this.platform,
    );
    expect(
      actual.items.filter(
        (item) => item.serviceProductType === subtype && item.active,
      ),
    ).toHaveLength(1);
  }

  async fresh(
    scope: Awaited<ReturnType<NoncoreTravelFixture["entry"]>>,
    partnerUserRef: string,
    bookingId: string,
    orderId: string,
  ) {
    const session = await this.fixture.call<PartnerIngressHandoffSession>(
      "partner/ingress/handoff",
      null,
      "POST",
      {
        entrySlug: scope.entry.entrySlug,
        apiKey: scope.apiKey,
        partnerUserRef,
      },
    );
    expect(session.identity).toMatchObject({
      realm: "partner",
      actorType: "referral_passenger",
      tenantId: this.tenantId,
      partnerId: scope.entry.partnerId,
      partnerProgramId: scope.entry.programId,
      partnerEntrySlug: scope.entry.entrySlug,
    });
    const order = await this.fixture.call<Data>(
      `partner/orders/${encodeURIComponent(orderId)}`,
      session.accessToken,
      "GET",
      undefined,
      this.tenantId,
    );
    const booking = await this.fixture.call<Data>(
      `partner/bookings/${encodeURIComponent(bookingId)}`,
      session.accessToken,
      "GET",
      undefined,
      this.tenantId,
    );
    const receipt = await this.fixture.call<Data>(
      `partner/orders/${encodeURIComponent(orderId)}/receipt`,
      session.accessToken,
      "GET",
      undefined,
      this.tenantId,
    );
    expect(order).toMatchObject({
      orderId,
      bookingId,
      partnerEntrySlug: scope.entry.entrySlug,
    });
    expect(booking).toMatchObject({ orderId, bookingId });
    expect(receipt).toMatchObject({ orderId, bookingId });
    return { order, booking, receipt };
  }

  async close() {
    const errors: string[] = [];
    try {
      for (const scope of [...this.scopes].reverse()) {
        try {
          if (scope.keyId)
            await this.fixture.call(
              `platform-admin/partner-entries/${encodeURIComponent(scope.entry.entrySlug)}/credentials/${encodeURIComponent(scope.keyId)}/revoke`,
              this.platform,
              "POST",
              { revokeReason: "Disposable hosted travel scenario complete" },
            );
        } catch {
          errors.push(`credential ${scope.entry.entrySlug}`);
        }
        try {
          await this.fixture.call(
            `platform-admin/partner-entries/${encodeURIComponent(scope.entry.entrySlug)}/deactivate`,
            this.platform,
            "POST",
            {},
          );
        } catch {
          errors.push(`entry ${scope.entry.entrySlug}`);
        }
      }
    } finally {
      await this.fixture.db.end();
    }
    expect(errors, "normal own credential/entry cleanup").toEqual([]);
    // Keep actual completed order/invoice and supply evidence in disposable PG.
  }
}
