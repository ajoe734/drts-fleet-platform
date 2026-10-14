import { describe, expect, it } from "vitest";
import {
  demoChange,
  demoCreate,
  demoFareList,
  demoSchedule,
  emptyFareEditor,
  evaluateDemo,
  fareEditor,
  fareEditorCommand,
  taiwanDateInput,
  taiwanDateISO,
} from "../../../apps/platform-admin-web/app/platform-admin/p5/fares/fare-management-model";

const at = "2026-10-13T00:00:00.000Z";
function draft(id = "proposed") {
  const editor = fareEditor(demoFareList(at).items[0]!, true);
  editor.fareVersionId = id;
  editor.displayName = "Proposed tariff";
  editor.publicSummary = "Explicit proposal";
  editor.sourceReference = "supplied-source";
  editor.effectiveLocal = "2026-11-01T08:00";
  return editor;
}

describe("P5 fare editor and isolated simulation", () => {
  it("never fills empty official data with demo fare values", () => {
    expect(
      Object.values(emptyFareEditor().parameters).every(
        (value) => value === "",
      ),
    ).toBe(true);
  });

  it("clones every rule and arbitrary fee name without changing TWD units or the source", () => {
    const original = demoFareList(at).items[0]!;
    original.tariff.additionalFees = JSON.parse(
      '{"airport_fee":35,"night-FEE":20,"__proto__":4," space ":2}',
    );
    const before = structuredClone(original);
    const editor = fareEditor(original, true);
    expect(editor.fareVersionId).toBe("");
    expect(editor.displayName).toBe("");
    Object.assign(editor, {
      fareVersionId: "new-id",
      displayName: "New",
      publicSummary: "Proposal",
    });
    const command = fareEditorCommand(editor);
    expect(command.tariff).toEqual(original.tariff);
    expect(command.tariff.baseFare).toBe(85);
    expect(command.tariff.nightSurchargeAmount).toBe(20);
    expect(Object.keys(command.tariff.additionalFees)).toEqual(
      Object.keys(original.tariff.additionalFees),
    );
    expect(command).not.toHaveProperty("authorityFilingRef");
    expect(original).toEqual(before);
  });

  it("converts Taiwan input exactly once and rejects invalid calendar/time values", () => {
    expect(taiwanDateISO("2026-11-01T08:15")).toBe("2026-11-01T00:15:00.000Z");
    expect(taiwanDateInput("2026-11-01T00:15:00.000Z")).toBe(
      "2026-11-01T08:15",
    );
    for (const value of [
      "2026-02-30T08:00",
      "2026-11-01T25:00",
      "2026-11-01",
      "invalid",
    ]) {
      expect(() => taiwanDateISO(value)).toThrow("fare_input_invalid");
    }
  });

  it.each(["", "-1", "1.5", "2147483648"])(
    "rejects invalid amount %s before any submit",
    (value) => {
      const editor = draft();
      editor.parameters.baseFare = value;
      expect(() => fareEditorCommand(editor)).toThrow("fare_input_invalid");
    },
  );

  it("requires explicit identity/source/rules and positive units and rejects duplicate fees", () => {
    for (const key of [
      "fareVersionId",
      "displayName",
      "publicSummary",
      "sourceReference",
    ] as const) {
      const editor = draft();
      editor[key] = " ";
      expect(() => fareEditorCommand(editor)).toThrow();
    }
    const editor = draft();
    editor.parameters.delayIncrementSeconds = "0";
    expect(() => fareEditorCommand(editor)).toThrow();
    editor.parameters.delayIncrementSeconds = "60";
    editor.parameters.nightApplication = "invented";
    expect(() => fareEditorCommand(editor)).toThrow();
    editor.parameters.nightApplication = "pickup";
    editor.fees = [
      { name: "same", amount: "5" },
      { name: "same", amount: "6" },
    ];
    expect(() => fareEditorCommand(editor)).toThrow();
  });

  it("keeps simulated filing, future publication and retirement on an independent clock", () => {
    const original = demoFareList(at);
    const before = structuredClone(original);
    let next = demoCreate(original, fareEditorCommand(draft()));
    expect(next.items[0]?.status).toBe("draft");
    next = demoChange(next, "proposed", {
      status: "filed",
      availableActions: {
        edit: false,
        file: false,
        schedule: true,
        retire: true,
      },
    });
    next = demoSchedule(next, "proposed", "2026-11-01T00:00:00.000Z");
    expect(next.activeFareVersionId).toBe("demo-current");
    expect(next.items[0]).toMatchObject({
      status: "filed",
      publicationScheduled: true,
      authorityFilingRef: null,
    });
    next = evaluateDemo(next, "2026-11-01T00:00:00.000Z");
    expect(next.activeFareVersionId).toBe("proposed");
    expect(
      next.items.find((item) => item.fareVersionId === "demo-current"),
    ).toMatchObject({ status: "retired", availableActions: { retire: true } });
    next = demoChange(next, "demo-current", {
      availableActions: {
        edit: false,
        file: false,
        schedule: false,
        retire: false,
      },
    });
    next = evaluateDemo(next, "2026-12-01T00:00:00.000Z");
    expect(
      next.items.find((item) => item.fareVersionId === "demo-current")
        ?.availableActions.retire,
    ).toBe(false);
    expect(original).toEqual(before);
  });

  it("rejects simulated duplicate IDs, unfiled publication and past schedules", () => {
    const list = demoFareList(at);
    expect(() =>
      demoCreate(list, fareEditorCommand(draft("demo-current"))),
    ).toThrow("fare_version_exists");
    expect(() => demoSchedule(list, "demo-current", null)).toThrow(
      "fare_lifecycle_conflict",
    );
    expect(() =>
      demoSchedule(list, "demo-current", "2026-10-12T00:00:00.000Z"),
    ).toThrow("fare_effective_time_conflict");
  });
});
