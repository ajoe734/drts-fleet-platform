import { describe, expect, it } from "vitest";
import type {
  DriverProfileRecord,
  UpdateDriverProfileCommand,
} from "@drts/contracts";
import {
  DEFAULT_PROFILE_VALUES,
  buildProfileCommand,
  profileValuesEqual,
  profileValuesFromRecord,
  validateProfileValues,
} from "../../../apps/driver-app/lib/settings-form";

const record: DriverProfileRecord = {
  driverId: "fixture-driver",
  name: "Unrelated Display Fixture",
  phone: null,
  email: null,
  photoUrl: null,
  emergencyContact: null,
  bankAccount: null,
  deviceBindings: [],
  updatedAt: "2026-10-13T00:00:00Z",
};
describe("typed profile surname draft and omission contract", () => {
  it("keeps legacy absent without deriving a surname from display name", () => {
    const values = profileValuesFromRecord(record);
    expect(values.profileSurname).toBe("");
    expect(validateProfileValues(values, values)).toEqual({});
    expect(
      profileValuesEqual(values, { ...values, profileSurname: undefined }),
    ).toBe(true);
    const command: UpdateDriverProfileCommand = buildProfileCommand(
      { ...values, profileEmail: "other@example.com" },
      values,
    );
    expect(Object.hasOwn(command, "driverSurname")).toBe(false);
    expect(JSON.stringify(command)).not.toContain("driverSurname");
  });
  it.each(["歐陽", "van der Fixture", "O’Fixture-Sample"])(
    "trims only outer whitespace and preserves %s",
    (surname) => {
      const initial = profileValuesFromRecord(record);
      const values = { ...initial, profileSurname: ` \t${surname}\n ` };
      expect(validateProfileValues(values, initial)).toEqual({});
      expect(profileValuesEqual(initial, values)).toBe(false);
      expect(buildProfileCommand(values, initial).driverSurname).toBe(surname);
      const saved = profileValuesFromRecord({
        ...record,
        driverSurname: surname,
      });
      expect(profileValuesEqual(saved, values)).toBe(true);
      expect(
        buildProfileCommand(
          { ...saved, profileEmail: "changed@example.com" },
          saved,
        ).driverSurname,
      ).toBe(surname);
    },
  );
  it.each(["", " \t\n "])(
    "rejects clearing captured text with %j before command construction",
    (surname) => {
      const saved = profileValuesFromRecord({
        ...record,
        driverSurname: "歐陽",
      });
      const values = { ...saved, profileSurname: surname };
      expect(profileValuesEqual(saved, values)).toBe(false);
      expect(validateProfileValues(values, saved).profileSurname).toContain(
        "已保存的姓氏不能清空",
      );
      expect(() => buildProfileCommand(values, saved)).toThrow(
        "已保存的姓氏不能清空",
      );
      expect(saved.profileSurname).toBe("歐陽");
    },
  );
  it("rejects explicitly supplied blank text instead of silently omitting it", () => {
    const initial = { ...DEFAULT_PROFILE_VALUES, profileName: "Fixture" };
    const values = { ...initial, profileSurname: " \t " };
    expect(validateProfileValues(values, initial).profileSurname).toContain(
      "姓氏不可只含空白",
    );
    expect(() => buildProfileCommand(values, initial)).toThrow(
      "姓氏不可只含空白",
    );
  });
});
