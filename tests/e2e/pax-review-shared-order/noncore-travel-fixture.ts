import { createHash, randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import type {
  FleetPartnerRecord,
  PartnerChannelEntryRecord,
  PartnerIngressCredentialIssued,
  PartnerIngressHandoffSession,
  BookingRecord,
  TenantBookingsPageRecord,
  ServiceAreaAdminMutationResponse,
  ServiceAreaBoundaryRecord,
} from "@drts/contracts";
import { PartnerFixture } from "../system-remediation/sr-partner-notify-qa-20260917/partner-fixture";

type Data = Record<string, any>;
export type FleetSupplyPhase = {
  operation: string;
  status?: number;
  code?: string;
};
type FleetSupplyControl = {
  check: () => void;
  phase: (phase: FleetSupplyPhase) => void;
};
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
  private readonly airportAreas: ServiceAreaBoundaryRecord[] = [];
  get platform() {
    return required("DRTS_UAT_TOKEN_PLATFORM");
  }
  readonly tenantId = required("DRTS_UAT_TENANT_A");
  get tenantToken() {
    return required("DRTS_UAT_TOKEN_A");
  }

  async entry(
    partnerType:
      | "fleet_partner"
      | "travel_agency"
      | "insurance_company"
      | "bank_partner",
    fleetPartnerId?: string,
    beforeRequest?: () => void,
  ) {
    beforeRequest?.();
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
            : partnerType === "bank_partner"
              ? "credit_card_airport_transfer"
              : partnerType === "insurance_company"
                ? "insurance_replacement_vehicle"
                : "travel_agency_transfer",
        authMode: "partner_api_key",
        eligibilityMode:
          partnerType === "fleet_partner"
            ? "none"
            : partnerType === "bank_partner"
              ? "bank_card_inline"
              : "reference_required",
        entryHost: new URL(PARTNER_ORIGIN).host,
        entryPath:
          partnerType === "bank_partner"
            ? `/${slug}/eligibility`
            : `/${slug}/book`,
        status: "active",
        activeFlag: true,
        ...(fleetPartnerId ? { fleetPartnerId } : {}),
      },
    );
    const owned = { entry, keyId: null as string | null };
    this.scopes.push(owned);
    beforeRequest?.();
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
    beforeRequest?.();
    expect(entry.tenantId).toBe(this.tenantId);
    return { entry, apiKey: issued.plaintextKey };
  }

  async fleetSupply(
    subtype:
      | "travel_agency_transfer"
      | "insurance_replacement_vehicle"
      | "credit_card_airport_transfer" = "travel_agency_transfer",
    control?: FleetSupplyControl,
  ) {
    const operation = async <T>(name: string, run: () => Promise<T>) => {
      control?.check();
      control?.phase({ operation: name });
      const result = await run();
      control?.check();
      return result;
    };
    const call = <T>(...args: Parameters<PartnerFixture["call"]>) =>
      operation(`${args[2] ?? "GET"} ${args[0]}`, () =>
        this.fixture.call<T>(...args),
      );
    // Several real allocations may share one tour fixture. Every normal
    // supply application still needs its own registry identities.
    const supplyMarker = randomUUID();
    const supplyMobile = `09${(Number.parseInt(supplyMarker.slice(0, 8), 16) % 100_000_000).toString().padStart(8, "0")}`;
    const fleet = await call<FleetPartnerRecord>(
      "admin/fleet-partners",
      this.platform,
      "POST",
      {
        legalName: `SIM synthetic travel fleet ${supplyMarker}`,
        displayName: "SIM hosted travel fleet",
        businessRegistrationNo: `SIM-${supplyMarker}`,
        contactName: "SIM Fleet Contact",
        contactPhone: "0900000034",
        active: true,
        partnershipType: "business_dispatch_fleet",
      },
    );
    const authority = await operation(
      "Create the normal Fleet entry and credential",
      () => this.entry("fleet_partner", fleet.fleetPartnerId, control?.check),
    );
    expect(authority.entry.partnerId).toBe(fleet.fleetPartnerId);
    const bootstrap = await call<Data>(
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
    const session = await call<Data>("auth/session", token);
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
      control?.check();
      const name = `${method} fleet API ${apiPath}`;
      control?.phase({ operation: name });
      const response = await fetch(`${NONCORE_API}/api/${apiPath}`, {
        method,
        headers: { ...headers, "Content-Type": "application/json" },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }),
        redirect: "error",
        signal: AbortSignal.timeout(20_000),
      });
      control?.phase({ operation: name, status: response.status });
      const wire = camel(await response.json());
      control?.phase({
        operation: name,
        status: response.status,
        ...(typeof wire.error?.code === "string"
          ? { code: wire.error.code }
          : {}),
      });
      expect(
        response.status,
        `${method} fleet API ${apiPath}: ${wire.error?.code ?? "response"}`,
      ).toBe(method === "POST" ? 201 : 200);
      expect(response.headers.get("x-drts-candidate-sha")).toBe(
        required("CANDIDATE_SHA"),
      );
      expect(wire.data).toBeDefined();
      control?.check();
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
        control?.check();
        control?.phase({ operation: `PUT ${base}/documents/${documentType}` });
        const uploaded = await fetch(new URL(grant.uploadUrl, NONCORE_API), {
          method: "PUT",
          headers: { ...headers, "Content-Type": "application/octet-stream" },
          body: new Uint8Array(bytes),
          redirect: "error",
          signal: AbortSignal.timeout(20_000),
        });
        control?.phase({
          operation: `PUT ${base}/documents/${documentType}`,
          status: uploaded.status,
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
        control?.check();
        const download = `${base}/documents/${encodeURIComponent(confirmed.documentId)}/download`;
        control?.phase({ operation: `GET ${download}` });
        const read = await fetch(
          `${NONCORE_API}/api/${base}/documents/${encodeURIComponent(confirmed.documentId)}/download`,
          {
            headers,
            redirect: "error",
            signal: AbortSignal.timeout(20_000),
          },
        );
        control?.phase({ operation: `GET ${download}`, status: read.status });
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
        await call(
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
        mobile: supplyMobile,
        professionalDriverLicenseNo: `SIM-DL-${supplyMarker}`,
        professionalDriverLicenseExpiry: until,
        taxiDriverRegistrationNo: `SIM-REG-${supplyMarker}`,
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
    await call(
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
        plateNo: `SIM-${supplyMarker.slice(0, 8).toUpperCase()}`,
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
    await call(`${exclusivity}/submit-review`, this.platform, "POST", {
      exclusiveProviderName: "SIM synthetic hosted fleet",
      exclusiveOperatorId: fleet.fleetPartnerId,
      effectiveStart: `${from}T00:00:00.000Z`,
      effectiveEnd: `${until}T23:59:59.000Z`,
    });
    await call(`${exclusivity}/approve`, this.platform, "POST", {});
    await call(
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

  async activateAirport() {
    return this.activateProduct("credit_card_airport_transfer");
  }

  private async activateProduct(
    subtype:
      | "travel_agency_transfer"
      | "insurance_replacement_vehicle"
      | "credit_card_airport_transfer",
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
            : subtype === "credit_card_airport_transfer"
              ? "SIM hosted airport transfer"
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

  /** External geography is SIM; create/publish/readback uses the normal API3001 store. */
  async configureAirportAreas(): Promise<ServiceAreaBoundaryRecord[]> {
    const effectiveFrom = new Date(Date.now() - 60_000).toISOString();
    const effectiveUntil = new Date(Date.now() + 2 * 60 * 60_000).toISOString();
    const suffix = randomUUID().replaceAll("-", "").toUpperCase();
    const definitions: {
      areaCode: string;
      displayName: string;
      geometry: ServiceAreaBoundaryRecord["geometry"];
      metadata: Record<string, unknown>;
    }[] = [
      {
        areaCode: `SHARED_SIM_CITY_${suffix}`,
        displayName: "SIM shared airport-transfer city catchment",
        geometry: {
          type: "polygon",
          coordinates: [
            { lat: 25.0005, lng: 121.4505 },
            { lat: 25.0005, lng: 121.625 },
            { lat: 25.125, lng: 121.625 },
            { lat: 25.125, lng: 121.4505 },
          ],
        },
        metadata: { source: "shared-external-geography-SIM", fixture: true },
      },
      {
        areaCode: `SHARED_SIM_AIRPORT_${suffix}`,
        displayName: "SIM shared declared TPE airport boundary",
        geometry: {
          type: "circle",
          center: { lat: 25.0797, lng: 121.2342 },
          radiusMeters: 6500,
        },
        metadata: {
          source: "shared-external-geography-SIM",
          fixture: true,
          airportIataCode: "TPE",
        },
      },
    ];
    const publishedAreas: ServiceAreaBoundaryRecord[] = [];
    for (const definition of definitions) {
      const created = await this.fixture.call<ServiceAreaAdminMutationResponse>(
        "service-area/admin/service-areas",
        this.platform,
        "POST",
        {
          ...definition,
          serviceProductTypes: ["credit_card_airport_transfer"],
          effectiveFrom,
          effectiveUntil,
        },
      );
      if (!created.serviceArea)
        throw new Error("Normal airport area creation returned no record");
      const area = created.serviceArea;
      // Own the ID before any later assertion/publish/readback can fail.
      this.airportAreas.push(area);
      expect(area.serviceAreaId).toMatch(/^[a-f0-9-]{36}$/);
      const published =
        await this.fixture.call<ServiceAreaAdminMutationResponse>(
          `service-area/admin/service-areas/${encodeURIComponent(area.serviceAreaId)}/publish`,
          this.platform,
          "POST",
          {
            reason:
              "Disposable shared external geography SIM; real internal evaluation",
          },
        );
      if (!published.serviceArea)
        throw new Error("Normal airport area publication returned no record");
      const actual = published.serviceArea;
      expect(actual).toMatchObject({
        serviceAreaId: area.serviceAreaId,
        areaCode: definition.areaCode,
        status: "active",
        geometry: definition.geometry,
        serviceProductTypes: ["credit_card_airport_transfer"],
        effectiveFrom,
        effectiveUntil,
        metadata: definition.metadata,
      });
      expect(Number.isInteger(actual.version) && actual.version > 0).toBe(true);
      const persisted = await this.fixture.db.query(
        "SELECT record FROM ops.service_area_boundaries WHERE service_area_id=$1",
        [area.serviceAreaId],
      );
      expect(persisted.rows).toHaveLength(1);
      expect(persisted.rows[0]!.record).toMatchObject({ ...actual });
      publishedAreas.push(actual);
    }
    return publishedAreas;
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

  /** Read the existing scoped history, without manufacturing a group result. */
  async history(
    scope: Awaited<ReturnType<NoncoreTravelFixture["entry"]>>,
    partnerUserRef: string,
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
    const readPage = (page: number) =>
      this.fixture.call<TenantBookingsPageRecord>(
        `partner/bookings?page=${page}&pageSize=20`,
        session.accessToken,
        "GET",
        undefined,
        this.tenantId,
      );
    const first = await readPage(1);
    const { totalItems, totalPages } = first.pagination;
    expect(totalPages).toBe(Math.ceil(totalItems / 20));
    const items: BookingRecord[] = [];
    for (let page = 1; page <= Math.max(1, totalPages); page += 1) {
      const result = page === 1 ? first : await readPage(page);
      expect(result.pagination).toMatchObject({
        page,
        pageSize: 20,
        totalItems,
        totalPages,
      });
      expect(result.items).toHaveLength(
        Math.min(20, Math.max(0, totalItems - (page - 1) * 20)),
      );
      for (const booking of result.items) {
        expect(booking).toMatchObject({
          tenantId: this.tenantId,
          partnerId: scope.entry.partnerId,
          partnerProgramId: scope.entry.programId,
          partnerEntrySlug: scope.entry.entrySlug,
          businessDispatchSubtype: "travel_agency_transfer",
        });
        items.push(booking);
      }
    }
    expect(items).toHaveLength(totalItems);
    expect(new Set(items.map((booking) => booking.bookingId)).size).toBe(
      items.length,
    );
    expect(new Set(items.map((booking) => booking.orderId)).size).toBe(
      items.length,
    );
    return { items, totalItems, pagesRead: Math.max(1, totalPages) };
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
      for (const area of [...this.airportAreas].reverse()) {
        try {
          const retired =
            await this.fixture.call<ServiceAreaAdminMutationResponse>(
              `service-area/admin/service-areas/${encodeURIComponent(area.serviceAreaId)}/retire`,
              this.platform,
              "POST",
              { reason: "Disposable shared airport geography SIM complete" },
            );
          expect(retired.serviceArea).toMatchObject({
            serviceAreaId: area.serviceAreaId,
            status: "retired",
          });
        } catch {
          errors.push(`service-area ${area.serviceAreaId}`);
        }
      }
    } finally {
      await this.fixture.db.end();
    }
    expect(errors, "normal own credential/entry cleanup").toEqual([]);
    // Keep actual completed order/invoice and supply evidence in disposable PG.
  }
}
