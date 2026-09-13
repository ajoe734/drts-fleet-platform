import { afterEach, describe, expect, it, vi } from "vitest";

import {
  toApiErrorEnvelope,
  toApiListData,
  toApiSuccessEnvelope,
} from "../../../../apps/api/src/common/api-envelope";
import {
  createDriverAffiliation,
  createFleetPartner,
  createRevenueShareRule,
  listFleetPartnerDrivers,
  listFleetPartners,
  listFleetStatements,
  listRevenueShareRules,
  updateFleetPartner,
  type FleetPartnerFormState,
} from "../../../../apps/platform-admin-web/app/fleet-partners/fleet-partner-shared";
import { ApiClient, ApiClientError } from "../../../../packages/api-client/src";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("C101: 車隊夥伴主檔列表、管理、停用與關聯引用驗收", () => {
  const createMockClient = () =>
    new ApiClient({
      baseUrl: "http://governance-regression.test",
    }) as Parameters<typeof listFleetPartners>[0];

  it("正確解析 API 清單 envelope，且空清單安全回傳空陣列避免 .map is not a function 崩潰", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json(
        toApiSuccessEnvelope(toApiListData([]), "req-c101-empty-list"),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = createMockClient();
    const result = await listFleetPartners(client);
    expect(result).toEqual([]);
    expect(Array.isArray(result)).toBe(true);
  });

  it("正常解析包含多筆夥伴的清單，並保留標準駝峰命名與欄位型別", async () => {
    const rawRows = [
      {
        fleet_partner_id: "fleet-partner-001",
        legal_name: "大都會智慧計程車隊股份有限公司",
        display_name: "大都會車隊",
        business_registration_no: "88889999",
        contact_name: "林總經理",
        contact_phone: "0912-345-678",
        active: true,
        partnership_type: "fleet_management",
      },
      {
        fleet_partner_id: "fleet-partner-002",
        legal_name: "台灣多元車隊聯盟股份有限公司",
        display_name: "多元車隊聯盟",
        business_registration_no: "77776666",
        contact_name: "陳經理",
        contact_phone: "0922-111-222",
        active: false,
        partnership_type: "business_dispatch_fleet",
      },
    ];

    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json(
        toApiSuccessEnvelope(toApiListData(rawRows), "req-c101-populated"),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = createMockClient();
    const result = await listFleetPartners(client);
    expect(result).toHaveLength(2);
    expect(result[0]!).toEqual(
      expect.objectContaining({
        fleetPartnerId: "fleet-partner-001",
        legalName: "大都會智慧計程車隊股份有限公司",
        displayName: "大都會車隊",
        businessRegistrationNo: "88889999",
        active: true,
        partnershipType: "fleet_management",
      }),
    );
    expect(result[1]!.active).toBe(false);
  });

  it("API 遇到 403 Forbidden 或 503 錯誤封套時誠實拋出 ApiClientError，不被吞沒為假空清單", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      new Response(
        JSON.stringify(
          toApiErrorEnvelope(
            "FLEET_ACCESS_DENIED",
            "Caller does not possess fleet management permissions",
            { tenantId: "tenant-other" },
            "req-c101-forbidden",
          ),
        ),
        { status: 403, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = createMockClient();
    await expect(listFleetPartners(client)).rejects.toThrow(ApiClientError);
  });

  it("支援新建車隊夥伴，送出正確的 JSON 酬載並回讀已正規化主檔", async () => {
    let capturedUrl = "";
    let capturedMethod = "";
    let capturedBody: unknown = null;

    const newPartnerForm: FleetPartnerFormState = {
      legalName: "新北優良計程車合作社",
      displayName: "新北優良車隊",
      businessRegistrationNo: "12345678",
      contactName: "張副理",
      contactPhone: "0933-444-555",
      active: true,
      partnershipType: "fleet_management",
    };

    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      capturedUrl = String(input);
      capturedMethod = init?.method ?? "GET";
      capturedBody = init?.body ? JSON.parse(String(init.body)) : null;

      return Response.json(
        toApiSuccessEnvelope(
          {
            fleet_partner_id: "fleet-partner-003",
            legal_name: newPartnerForm.legalName,
            display_name: newPartnerForm.displayName,
            business_registration_no: newPartnerForm.businessRegistrationNo,
            contact_name: newPartnerForm.contactName,
            contact_phone: newPartnerForm.contactPhone,
            active: newPartnerForm.active,
            partnership_type: newPartnerForm.partnershipType,
            created_at: "2026-09-13T07:00:00.000Z",
          },
          "req-c101-create",
        ),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = createMockClient();
    const created = await createFleetPartner(client, newPartnerForm);

    expect(capturedUrl).toContain("/api/admin/fleet-partners");
    expect(capturedMethod).toBe("POST");
    expect(capturedBody).toEqual({
      legalName: "新北優良計程車合作社",
      displayName: "新北優良車隊",
      businessRegistrationNo: "12345678",
      contactName: "張副理",
      contactPhone: "0933-444-555",
      active: true,
      partnershipType: "fleet_management",
    });
    expect(created.fleetPartnerId).toBe("fleet-partner-003");
    expect(created.displayName).toBe("新北優良車隊");
    expect(created.active).toBe(true);
  });

  it("支援編輯與停用車隊夥伴，更新 active 狀態為 false", async () => {
    let capturedUrl = "";
    let capturedMethod = "";
    let capturedBody: unknown = null;

    const updateForm: FleetPartnerFormState = {
      legalName: "新北優良計程車合作社",
      displayName: "新北優良車隊（已停用）",
      businessRegistrationNo: "12345678",
      contactName: "張副理",
      contactPhone: "0933-444-555",
      active: false,
      partnershipType: "fleet_management",
    };

    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      capturedUrl = String(input);
      capturedMethod = init?.method ?? "GET";
      capturedBody = init?.body ? JSON.parse(String(init.body)) : null;

      return Response.json(
        toApiSuccessEnvelope(
          {
            fleet_partner_id: "fleet-partner-003",
            legal_name: updateForm.legalName,
            display_name: updateForm.displayName,
            business_registration_no: updateForm.businessRegistrationNo,
            contact_name: updateForm.contactName,
            contact_phone: updateForm.contactPhone,
            active: updateForm.active,
            partnership_type: updateForm.partnershipType,
            updated_at: "2026-09-13T07:05:00.000Z",
          },
          "req-c101-update",
        ),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = createMockClient();
    const updated = await updateFleetPartner(client, "fleet-partner-003", updateForm);

    expect(capturedUrl).toContain("/api/admin/fleet-partners/fleet-partner-003");
    expect(capturedMethod).toBe("PUT");
    expect((capturedBody as any).active).toBe(false);
    expect(updated.active).toBe(false);
    expect(updated.displayName).toBe("新北優良車隊（已停用）");
  });

  it("驗證車隊夥伴被司機歸屬與收益分配規則正常引用", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.includes("/fleet-affiliations") && method === "POST") {
        return Response.json(
          toApiSuccessEnvelope(
            {
              affiliation_id: "affil-c101-01",
              driver_id: "drv-001",
              fleet_partner_id: "fleet-partner-001",
              affiliation_type: "managed_by",
              effective_from: "2026-09-01T00:00:00.000Z",
              effective_until: null,
            },
            "req-c101-affil",
          ),
        );
      }

      if (url.includes("/revenue-share-rules") && method === "POST") {
        return Response.json(
          toApiSuccessEnvelope(
            {
              rule_id: "rule-c101-01",
              fleet_partner_id: "fleet-partner-001",
              applies_to: "all_trips",
              formula: "percent_of_gross",
              rate_bps: 1200,
              effective_from: "2026-09-01T00:00:00.000Z",
              active: true,
            },
            "req-c101-rule",
          ),
        );
      }

      return new Response(null, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = createMockClient();

    const affiliation = await createDriverAffiliation(client, "fleet-partner-001", {
      driverId: "drv-001",
      affiliationType: "managed_by",
      effectiveFrom: "2026-09-01T00:00:00.000Z",
      effectiveUntil: "",
    });
    expect(affiliation.fleetPartnerId).toBe("fleet-partner-001");
    expect(affiliation.affiliationId).toBe("affil-c101-01");

    const rule = await createRevenueShareRule(client, "fleet-partner-001", {
      appliesTo: "all_trips",
      formula: "percent_of_gross",
      effectiveFrom: "2026-09-01T00:00:00.000Z",
      effectiveUntil: "",
      rateBps: "1200",
      fixedAmountMinor: "",
      serviceProduct: "",
      tenantServiceProgramId: "",
      sourcePlatform: "",
      driverGroup: "",
    });
    expect(rule.fleetPartnerId).toBe("fleet-partner-001");
    expect(rule.rateBps).toBe(1200);
    expect(rule.ruleId).toBe("rule-c101-01");
  });
});
