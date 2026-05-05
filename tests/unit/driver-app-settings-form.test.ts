import { describe, expect, it } from "vitest";
import type { DriverProfileRecord, DriverSettings } from "@drts/contracts";

import {
  DEFAULT_PROFILE_VALUES,
  DEFAULT_SETTINGS_VALUES,
  buildProfileCommand,
  buildSettingsCommand,
  deriveSaveState,
  hasEmergencyInput,
  hasErrors,
  profileValuesEqual,
  profileValuesFromRecord,
  settingsValuesEqual,
  settingsValuesFromRecord,
  validateProfileValues,
  validateSettingsValues,
} from "../../apps/driver-app/lib/settings-form";

const baseSettingsRecord: DriverSettings = {
  driverId: "driver-001",
  language: "zh-TW",
  notificationsEnabled: true,
  autoAcceptEnabled: false,
  maxAcceptRadius: 8,
  preferredAreas: [],
  updatedAt: "2026-05-05T00:00:00Z",
};

const baseProfileRecord: DriverProfileRecord = {
  driverId: "driver-001",
  name: "王大明",
  phone: "+886-900-000-000",
  email: "driver@example.com",
  photoUrl: null,
  emergencyContact: {
    name: "王小華",
    phone: "+886-900-000-001",
    relationship: "配偶",
  },
  bankAccount: null,
  deviceBindings: [],
  updatedAt: "2026-05-05T00:00:00Z",
};

describe("settings-form helpers", () => {
  describe("settingsValuesFromRecord", () => {
    it("maps record values to form strings", () => {
      const values = settingsValuesFromRecord(baseSettingsRecord);
      expect(values.language).toBe("zh-TW");
      expect(values.notificationsEnabled).toBe(true);
      expect(values.autoAcceptEnabled).toBe(false);
      expect(values.maxAcceptRadius).toBe("8");
    });

    it("treats null radius as empty string", () => {
      const values = settingsValuesFromRecord({
        ...baseSettingsRecord,
        maxAcceptRadius: null,
      });
      expect(values.maxAcceptRadius).toBe("");
    });
  });

  describe("settingsValuesEqual", () => {
    it("ignores incidental whitespace", () => {
      expect(
        settingsValuesEqual(DEFAULT_SETTINGS_VALUES, {
          ...DEFAULT_SETTINGS_VALUES,
          language: "  zh-TW ",
          maxAcceptRadius: " ",
        }),
      ).toBe(true);
    });

    it("detects radius edits", () => {
      expect(
        settingsValuesEqual(DEFAULT_SETTINGS_VALUES, {
          ...DEFAULT_SETTINGS_VALUES,
          maxAcceptRadius: "10",
        }),
      ).toBe(false);
    });
  });

  describe("validateSettingsValues", () => {
    it("requires language", () => {
      const errors = validateSettingsValues({
        ...DEFAULT_SETTINGS_VALUES,
        language: "  ",
      });
      expect(errors.language).toBeDefined();
    });

    it("rejects non-integer radius", () => {
      const errors = validateSettingsValues({
        ...DEFAULT_SETTINGS_VALUES,
        maxAcceptRadius: "8.5",
      });
      expect(errors.maxAcceptRadius).toBeDefined();
    });

    it("rejects out-of-range radius", () => {
      const errors = validateSettingsValues({
        ...DEFAULT_SETTINGS_VALUES,
        maxAcceptRadius: "0",
      });
      expect(errors.maxAcceptRadius).toBeDefined();

      const tooBig = validateSettingsValues({
        ...DEFAULT_SETTINGS_VALUES,
        maxAcceptRadius: "999",
      });
      expect(tooBig.maxAcceptRadius).toBeDefined();
    });

    it("accepts blank radius", () => {
      const errors = validateSettingsValues({
        ...DEFAULT_SETTINGS_VALUES,
        maxAcceptRadius: "",
      });
      expect(hasErrors(errors)).toBe(false);
    });
  });

  describe("profileValuesFromRecord", () => {
    it("flattens emergency contact and nullable fields", () => {
      const values = profileValuesFromRecord(baseProfileRecord);
      expect(values.profileName).toBe("王大明");
      expect(values.profilePhone).toBe("+886-900-000-000");
      expect(values.emergencyName).toBe("王小華");
      expect(values.emergencyRelationship).toBe("配偶");
    });

    it("handles missing emergency contact", () => {
      const values = profileValuesFromRecord({
        ...baseProfileRecord,
        emergencyContact: null,
        phone: null,
        email: null,
      });
      expect(values.emergencyName).toBe("");
      expect(values.profilePhone).toBe("");
      expect(values.profileEmail).toBe("");
    });
  });

  describe("validateProfileValues", () => {
    it("requires the driver name", () => {
      const errors = validateProfileValues({
        ...DEFAULT_PROFILE_VALUES,
        profileName: "  ",
      });
      expect(errors.profileName).toBeDefined();
    });

    it("rejects malformed email", () => {
      const errors = validateProfileValues({
        ...DEFAULT_PROFILE_VALUES,
        profileName: "司機",
        profileEmail: "not-an-email",
      });
      expect(errors.profileEmail).toBeDefined();
    });

    it("requires emergency name and phone when contact partially filled", () => {
      const errors = validateProfileValues({
        ...DEFAULT_PROFILE_VALUES,
        profileName: "司機",
        emergencyRelationship: "兄弟",
      });
      expect(errors.emergencyName).toBeDefined();
      expect(errors.emergencyPhone).toBeDefined();
    });

    it("accepts a fully filled profile", () => {
      const values = profileValuesFromRecord(baseProfileRecord);
      const errors = validateProfileValues(values);
      expect(hasErrors(errors)).toBe(false);
    });

    it("returns no emergency errors when contact left blank", () => {
      const errors = validateProfileValues({
        ...DEFAULT_PROFILE_VALUES,
        profileName: "司機",
      });
      expect(hasEmergencyInput(DEFAULT_PROFILE_VALUES)).toBe(false);
      expect(errors.emergencyName).toBeUndefined();
      expect(errors.emergencyPhone).toBeUndefined();
    });
  });

  describe("buildSettingsCommand", () => {
    it("converts radius string to number or null", () => {
      const cmd = buildSettingsCommand({
        ...DEFAULT_SETTINGS_VALUES,
        maxAcceptRadius: "12",
      });
      expect(cmd.maxAcceptRadius).toBe(12);

      const empty = buildSettingsCommand(DEFAULT_SETTINGS_VALUES);
      expect(empty.maxAcceptRadius).toBeNull();
    });
  });

  describe("buildProfileCommand", () => {
    it("nulls out blank optional fields", () => {
      const cmd = buildProfileCommand({
        ...DEFAULT_PROFILE_VALUES,
        profileName: "司機",
      });
      expect(cmd.phone).toBeNull();
      expect(cmd.email).toBeNull();
      expect(cmd.emergencyContact).toBeNull();
    });

    it("sends emergency contact when fully entered", () => {
      const values = profileValuesFromRecord(baseProfileRecord);
      const cmd = buildProfileCommand(values);
      expect(cmd.emergencyContact).toEqual({
        name: "王小華",
        phone: "+886-900-000-001",
        relationship: "配偶",
      });
    });

    it("treats blank relationship as null", () => {
      const cmd = buildProfileCommand({
        ...DEFAULT_PROFILE_VALUES,
        profileName: "司機",
        emergencyName: "聯絡人",
        emergencyPhone: "+886-900-000-002",
        emergencyRelationship: "  ",
      });
      expect(cmd.emergencyContact).toEqual({
        name: "聯絡人",
        phone: "+886-900-000-002",
        relationship: null,
      });
    });
  });

  describe("deriveSaveState", () => {
    it("returns saving when in flight", () => {
      expect(
        deriveSaveState({
          saving: true,
          dirty: true,
          hasValidation: false,
          lastResult: null,
        }),
      ).toBe("saving");
    });

    it("returns error when last attempt failed", () => {
      expect(
        deriveSaveState({
          saving: false,
          dirty: false,
          hasValidation: false,
          lastResult: "error",
        }),
      ).toBe("error");
    });

    it("returns dirty when there are unsaved changes", () => {
      expect(
        deriveSaveState({
          saving: false,
          dirty: true,
          hasValidation: false,
          lastResult: null,
        }),
      ).toBe("dirty");
    });

    it("returns saved after successful save with no further edits", () => {
      expect(
        deriveSaveState({
          saving: false,
          dirty: false,
          hasValidation: false,
          lastResult: "success",
        }),
      ).toBe("saved");
    });

    it("returns idle when fresh", () => {
      expect(
        deriveSaveState({
          saving: false,
          dirty: false,
          hasValidation: false,
          lastResult: null,
        }),
      ).toBe("idle");
    });
  });

  describe("profileValuesEqual", () => {
    it("compares all fields trim-insensitively", () => {
      const a = profileValuesFromRecord(baseProfileRecord);
      const b: typeof a = { ...a, profileName: "  王大明  " };
      expect(profileValuesEqual(a, b)).toBe(true);
    });

    it("detects edits", () => {
      const a = profileValuesFromRecord(baseProfileRecord);
      const b: typeof a = { ...a, profileEmail: "other@example.com" };
      expect(profileValuesEqual(a, b)).toBe(false);
    });
  });
});
