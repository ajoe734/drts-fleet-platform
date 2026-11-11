import type { AddressPayload } from "@drts/contracts";
import { describe, expect, it } from "vitest";

import {
  acceptAssistOffer,
  applyAssistDraft,
  assistFieldStatus,
  blockingUncertainFields,
  buildAssistOutcomeReport,
  composeOrderNotes,
  confirmAssistField,
  editAssistField,
  emptyAssistForm,
  formatAccuracy,
  formatCapabilities,
  frequentPlaceToAddress,
  handoffWaitMinutes,
  matchFrequentPlace,
  sameAddress,
  type AssistDraftView,
  type AssistFieldView,
} from "../../app/callcenter/ai-assist";

function field(
  value: string,
  status: AssistFieldView["status"] = "filled",
): AssistFieldView {
  return {
    value,
    rawText: value,
    confidence: status === "filled" ? 0.9 : 0.5,
    status,
    candidates: [],
    origin: "rules",
  };
}

function draft(
  version: number,
  fields: AssistDraftView["fields"],
  callId = "call-1",
): AssistDraftView {
  return {
    callId,
    source: "agent_assist",
    handoffId: null,
    fields,
    transcript: [],
    draftVersion: version,
    extractor: "rules",
    submittedOrderId: null,
  };
}

describe("applyAssistDraft", () => {
  it("fills empty fields and reports what changed", () => {
    const { state, changed } = applyAssistDraft(
      emptyAssistForm("call-1"),
      draft(1, {
        pickup: field("中山北路二段45巷3號"),
        passengerPhone: field("0912345678"),
      }),
    );
    expect(changed).toEqual(["pickup", "passengerPhone"]);
    expect(state.values.pickup).toBe("中山北路二段45巷3號");
    expect(state.aiApplied.pickup).toBe(true);
    expect(state.draftVersion).toBe(1);
  });

  it("ignores stale or repeated versions", () => {
    const first = applyAssistDraft(
      emptyAssistForm("call-1"),
      draft(2, { pickup: field("A路1號") }),
    ).state;
    const stale = applyAssistDraft(
      first,
      draft(1, { pickup: field("B路2號") }),
    );
    expect(stale.changed).toEqual([]);
    expect(stale.state.values.pickup).toBe("A路1號");
  });

  it("never overwrites a field the agent edited, but offers the new value", () => {
    let state = applyAssistDraft(
      emptyAssistForm("call-1"),
      draft(1, { dropoff: field("台北車站") }),
    ).state;
    state = editAssistField(state, "dropoff", "松山機場");
    const result = applyAssistDraft(
      state,
      draft(2, { dropoff: field("板橋車站") }),
    );
    expect(result.changed).toEqual([]);
    expect(result.state.values.dropoff).toBe("松山機場");
    expect(result.state.offers.dropoff).toBe("板橋車站");

    const accepted = acceptAssistOffer(result.state, "dropoff");
    expect(accepted.values.dropoff).toBe("板橋車站");
    expect(accepted.agentEdited.dropoff).toBe(false);
    expect(accepted.offers.dropoff).toBeUndefined();
  });

  it("starts over when the draft belongs to another call", () => {
    const state = applyAssistDraft(
      emptyAssistForm("call-1"),
      draft(5, { pickup: field("A路1號") }),
    ).state;
    const other = applyAssistDraft(
      state,
      draft(1, { pickup: field("B路2號") }, "call-2"),
    );
    expect(other.state.callId).toBe("call-2");
    expect(other.state.values.pickup).toBe("B路2號");
  });
});

describe("agent edits and confirmation", () => {
  const applied = applyAssistDraft(
    emptyAssistForm("call-1"),
    draft(1, {
      pickup: field("中山路100號"),
      dropoff: field("台北車站", "uncertain"),
    }),
  ).state;

  it("retyping the AI's own value is not an edit", () => {
    expect(
      editAssistField(applied, "pickup", " 中山路100號 ").agentEdited.pickup,
    ).toBe(false);
    expect(
      editAssistField(applied, "pickup", "中山路200號").agentEdited.pickup,
    ).toBe(true);
  });

  it("blocks submit on uncertain AI values until confirmed or edited", () => {
    const view = draft(1, {
      pickup: field("中山路100號"),
      dropoff: field("台北車站", "uncertain"),
    });
    expect(blockingUncertainFields(applied, view)).toEqual(["dropoff"]);
    expect(assistFieldStatus(applied, view, "dropoff")).toBe("ai_uncertain");
    const confirmed = confirmAssistField(applied, "dropoff");
    expect(blockingUncertainFields(confirmed, view)).toEqual([]);
    expect(assistFieldStatus(confirmed, view, "dropoff")).toBe("confirmed");
    const edited = editAssistField(applied, "dropoff", "松山車站");
    expect(blockingUncertainFields(edited, view)).toEqual([]);
    expect(assistFieldStatus(edited, view, "dropoff")).toBe("agent_edited");
    expect(assistFieldStatus(applied, view, "pickup")).toBe("ai_filled");
    expect(assistFieldStatus(applied, view, "notes")).toBe("empty");
  });

  it("does not block when the draft is for another call", () => {
    expect(
      blockingUncertainFields(
        applied,
        draft(1, { dropoff: field("x", "uncertain") }, "call-2"),
      ),
    ).toEqual([]);
  });
});

describe("order notes and outcome report", () => {
  const state = applyAssistDraft(
    emptyAssistForm("call-1"),
    draft(1, {
      pickup: field("中山路100號"),
      dropoff: field("台北車站"),
      pickupTime: field("現在（即時叫車）"),
      passengerCount: field("2"),
      requiredCapabilities: field("wheelchair,child_seat"),
      notes: field("帶寵物"),
    }),
  ).state;

  it("writes the trip details the AI collected into the driver notes", () => {
    expect(composeOrderNotes("請在大門口等", state, "zh")).toBe(
      "請在大門口等\n帶寵物\n乘車時間：現在（即時叫車）；乘客人數：2；特殊需求：輪椅、兒童座椅",
    );
    expect(composeOrderNotes("", emptyAssistForm("call-1"), "zh")).toBe("");
  });

  it("reports which fields were kept, corrected or filled by the agent", () => {
    const edited = editAssistField(
      editAssistField(state, "dropoff", "松山機場"),
      "passengerName",
      "王先生",
    );
    const report = buildAssistOutcomeReport(edited, {
      pickup: true,
      dropoff: true,
      passengerName: true,
      passengerPhone: false,
    });
    expect(report.find((r) => r.field === "pickup")).toEqual({
      field: "pickup",
      aiApplied: true,
      agentEdited: false,
      finalPresent: true,
    });
    expect(report.find((r) => r.field === "dropoff")?.agentEdited).toBe(true);
    expect(report.find((r) => r.field === "passengerName")).toMatchObject({
      aiApplied: false,
      agentEdited: true,
      finalPresent: true,
    });
    expect(report.find((r) => r.field === "luggage")?.finalPresent).toBe(false);
    expect(report).toHaveLength(9);
  });
});

describe("helpers", () => {
  it("formats accuracy, capabilities and waiting time", () => {
    expect(formatAccuracy(null)).toBe("—");
    expect(formatAccuracy(0.857)).toBe("86%");
    expect(formatCapabilities("wheelchair", "en")).toBe("wheelchair");
    expect(formatCapabilities("wheelchair,child_seat", "zh")).toBe(
      "輪椅、兒童座椅",
    );
    expect(
      handoffWaitMinutes(
        "2026-11-11T00:00:00Z",
        Date.parse("2026-11-11T00:05:30Z"),
      ),
    ).toBe(5);
    expect(handoffWaitMinutes("not a date")).toBe(0);
  });

  it("compares addresses by position and text", () => {
    const a = {
      address: "台北車站",
      lat: 25.04,
      lng: 121.51,
    } as AddressPayload;
    expect(sameAddress(a, { ...a })).toBe(true);
    expect(sameAddress(a, { ...a, lat: 25.05 })).toBe(false);
    expect(sameAddress(null, undefined)).toBe(true);
    expect(sameAddress(a, null)).toBe(false);
  });
});

describe("frequent pickups", () => {
  const places = [
    {
      label: "家",
      address: {
        address: "臺北市中山區中山北路二段45巷3號",
        addressName: "家",
        lat: 25.05,
        lng: 121.52,
        placeId: "p-home",
        geocodeProvider: "mock-geo",
        coordinateSource: "provider_candidate",
      },
      tripCount: 5,
      lastUsedAt: "2026-11-01T00:00:00Z",
    },
  ];

  it("matches what the caller said against stored places, ignoring 臺/台 and spacing", () => {
    expect(matchFrequentPlace("中山北路二段 45巷3號", places)?.label).toBe(
      "家",
    );
    expect(
      matchFrequentPlace("台北市中山區中山北路二段45巷3號", places)?.label,
    ).toBe("家");
    expect(matchFrequentPlace("車站", places)).toBeNull();
    expect(matchFrequentPlace("松山機場第一航廈", places)).toBeNull();
  });

  it("keeps the stored pin and provenance and records who chose it", () => {
    const address = frequentPlaceToAddress(
      places[0]!,
      "AGENT-1",
      "2026-11-11T00:00:00Z",
    );
    expect(address).toMatchObject({
      address: "臺北市中山區中山北路二段45巷3號",
      lat: 25.05,
      lng: 121.52,
      placeId: "p-home",
      coordinateSource: "provider_candidate",
      selectedByActorId: "AGENT-1",
      surface: "callcenter",
    });
    const noSource = frequentPlaceToAddress(
      {
        ...places[0]!,
        address: { ...places[0]!.address, coordinateSource: null },
      },
      "AGENT-1",
    );
    expect(noSource).not.toHaveProperty("coordinateSource");
  });
});
