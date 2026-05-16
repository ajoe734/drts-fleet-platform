import { describe, expect, it } from "vitest";
import {
  conciergeDeskCatalog,
  evaluateDeskEligibility,
  resolveDeskAccess,
} from "../../lib/desk-catalog";

describe("desk catalog", () => {
  it("denies a concierge operator from the clinic call-point desk", () => {
    const clinicDesk = conciergeDeskCatalog.find(
      (desk) => desk.deskId === "riverside-clinic",
    );

    expect(clinicDesk).toBeTruthy();
    expect(resolveDeskAccess(clinicDesk!, "concierge_operator")).toMatchObject({
      allowed: false,
      reasonCode: "mode_denied",
    });
  });

  it("marks airport-assist ineligible at the Acme lobby desk", () => {
    const acmeDesk = conciergeDeskCatalog.find(
      (desk) => desk.deskId === "acme-reception",
    );

    expect(acmeDesk).toBeTruthy();
    expect(
      evaluateDeskEligibility(
        acmeDesk!,
        "airport_assist",
        "台北市信義區市府路 1 號 1F",
        "台北市大安區仁愛路 4 段 12 號",
      ),
    ).toMatchObject({
      state: "ineligible",
      reasonCode: "product_not_authorized",
    });
  });

  it("accepts a clinic discharge trip inside the clinic service area", () => {
    const clinicDesk = conciergeDeskCatalog.find(
      (desk) => desk.deskId === "riverside-clinic",
    );

    expect(clinicDesk).toBeTruthy();
    expect(
      evaluateDeskEligibility(
        clinicDesk!,
        "medical_discharge",
        "新北市板橋區文化路 2 段 188 號",
        "新北市板橋區文化路 1 段 33 號",
      ),
    ).toMatchObject({
      state: "eligible",
    });
  });
});
