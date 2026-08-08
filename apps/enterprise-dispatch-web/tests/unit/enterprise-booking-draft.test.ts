import { describe, expect, it } from "vitest";
import {
  buildEnterpriseBookingCommand,
  createEnterpriseBookingDraft,
  getEnterpriseBookingPreview,
  parseEnterpriseBookingDraft,
  serializeEnterpriseBookingDraft,
} from "@/lib/enterprise-booking-draft";

describe("enterprise booking draft", () => {
  it("round-trips editable draft values through review query params", () => {
    const initial = {
      ...createEnterpriseBookingDraft("zh"),
      passenger: "訪客 · Ito Aki",
      pickup: "台北總部",
      dropoff: "桃園機場 T1",
      reservationDate: "2026-08-12",
      reservationTime: "09:40",
      costCenterCode: "CC-OPS-03",
      costCenterLabel: "CC-OPS-03 · 營運部 · 客戶支援",
      vehicle: "van" as const,
    };

    const parsed = parseEnterpriseBookingDraft(
      Object.fromEntries(serializeEnterpriseBookingDraft(initial)),
      "zh",
    );

    expect(parsed).toEqual(initial);
  });

  it("preserves cleared optional fields through review query params", () => {
    const initial = {
      ...createEnterpriseBookingDraft("zh"),
      notes: "",
      flight: "",
      terminal: "",
      luggageCount: "",
    };

    const parsed = parseEnterpriseBookingDraft(
      Object.fromEntries(serializeEnterpriseBookingDraft(initial)),
      "zh",
    );

    expect(parsed).toEqual(initial);
  });

  it("derives live approval preview from current draft values", () => {
    const draft = {
      ...createEnterpriseBookingDraft("zh"),
      pickup: "桃園機場 T1",
      dropoff: "新竹科學園區",
      vehicle: "van" as const,
      luggageCount: "4",
    };

    const preview = getEnterpriseBookingPreview(draft, "zh");

    expect(preview.approvalRequired).toBe(true);
    expect(preview.bannerTone).toBe("warn");
    expect(preview.estimatedFare).toBeGreaterThan(1500);
  });

  it("maps the live draft to a tenant booking command without fixture helpers", () => {
    const command = buildEnterpriseBookingCommand(
      {
        ...createEnterpriseBookingDraft("en"),
        passengerMode: "self",
        bookedBy: "Alex Booker",
        passenger: "ignored passenger",
        reservationDate: "2026-08-14",
        reservationTime: "07:15",
        costCenterCode: "CC-PRD-07",
        onsiteContactPhone: "+886900000123",
        notes: "Meet at lobby",
        flight: "",
        terminal: "",
        luggageCount: "",
      },
      new Date("2026-08-08T00:00:00.000Z"),
    );

    expect(command).toEqual(
      expect.objectContaining({
        businessDispatchSubtype: "enterprise_dispatch",
        costCenter: "CC-PRD-07",
        passenger: expect.objectContaining({
          name: "Alex Booker",
          phone: "+886900000123",
        }),
        onsiteContact: expect.objectContaining({
          name: "Alex Booker",
          phone: "+886900000123",
        }),
        notes: "Meet at lobby",
      }),
    );
    expect(command).not.toHaveProperty("bookedBy");
    expect(command).not.toHaveProperty("flightNo");
    expect(command).not.toHaveProperty("terminal");
    expect(command).not.toHaveProperty("luggageCount");
    expect(command.reservationWindowStart).toBe("2026-08-13T23:15:00.000Z");
    expect(command.reservationWindowEnd).toBe("2026-08-13T23:45:00.000Z");
  });
});
