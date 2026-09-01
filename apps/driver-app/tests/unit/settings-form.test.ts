import { describe, expect, it } from "vitest";

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
  type ProfileFormValues,
  type SettingsFormValues,
} from "../../lib/settings-form";

function settings(overrides: Partial<SettingsFormValues> = {}) {
  return { ...DEFAULT_SETTINGS_VALUES, ...overrides };
}

function profile(overrides: Partial<ProfileFormValues> = {}) {
  return { ...DEFAULT_PROFILE_VALUES, ...overrides };
}

describe("settingsValuesFromRecord", () => {
  it("maps a fully populated record", () => {
    expect(
      settingsValuesFromRecord({
        language: "en-US",
        notificationsEnabled: false,
        autoAcceptEnabled: true,
        maxAcceptRadius: 15,
      } as never),
    ).toEqual({
      language: "en-US",
      notificationsEnabled: false,
      autoAcceptEnabled: true,
      maxAcceptRadius: "15",
    });
  });

  it("applies defaults for null fields", () => {
    expect(
      settingsValuesFromRecord({
        language: null,
        notificationsEnabled: null,
        autoAcceptEnabled: null,
        maxAcceptRadius: null,
      } as never),
    ).toEqual(DEFAULT_SETTINGS_VALUES);
  });

  it("keeps a zero radius as the string 0 rather than dropping it", () => {
    expect(
      settingsValuesFromRecord({ maxAcceptRadius: 0 } as never).maxAcceptRadius,
    ).toBe("0");
  });

  it("keeps notificationsEnabled false rather than defaulting it to true", () => {
    expect(
      settingsValuesFromRecord({ notificationsEnabled: false } as never)
        .notificationsEnabled,
    ).toBe(false);
  });
});

describe("profileValuesFromRecord", () => {
  it("flattens the nested emergency contact", () => {
    expect(
      profileValuesFromRecord({
        name: "陳司機",
        phone: "0912345678",
        email: "driver@example.com",
        emergencyContact: {
          name: "陳太太",
          phone: "0987654321",
          relationship: "配偶",
        },
      } as never),
    ).toEqual({
      profileName: "陳司機",
      profilePhone: "0912345678",
      profileEmail: "driver@example.com",
      emergencyName: "陳太太",
      emergencyPhone: "0987654321",
      emergencyRelationship: "配偶",
    });
  });

  it("returns empty strings when the record is blank", () => {
    expect(
      profileValuesFromRecord({
        name: null,
        phone: null,
        email: null,
        emergencyContact: null,
      } as never),
    ).toEqual(DEFAULT_PROFILE_VALUES);
  });
});

describe("settingsValuesEqual", () => {
  it("treats surrounding whitespace as equal", () => {
    expect(
      settingsValuesEqual(
        settings({ language: " zh-TW ", maxAcceptRadius: " 10 " }),
        settings({ language: "zh-TW", maxAcceptRadius: "10" }),
      ),
    ).toBe(true);
  });

  it("detects a toggled boolean", () => {
    expect(
      settingsValuesEqual(
        settings({ autoAcceptEnabled: true }),
        settings({ autoAcceptEnabled: false }),
      ),
    ).toBe(false);
  });

  it("detects a changed radius", () => {
    expect(
      settingsValuesEqual(
        settings({ maxAcceptRadius: "10" }),
        settings({ maxAcceptRadius: "20" }),
      ),
    ).toBe(false);
  });
});

describe("profileValuesEqual", () => {
  it("ignores whitespace on every field", () => {
    expect(
      profileValuesEqual(
        profile({ profileName: " 陳司機 ", emergencyPhone: " 0987 " }),
        profile({ profileName: "陳司機", emergencyPhone: "0987" }),
      ),
    ).toBe(true);
  });

  it("detects a changed emergency relationship", () => {
    expect(
      profileValuesEqual(
        profile({ emergencyRelationship: "配偶" }),
        profile({ emergencyRelationship: "父母" }),
      ),
    ).toBe(false);
  });
});

describe("validateSettingsValues", () => {
  it("accepts the default values", () => {
    expect(validateSettingsValues(DEFAULT_SETTINGS_VALUES)).toEqual({});
  });

  it("requires a language", () => {
    expect(validateSettingsValues(settings({ language: "   " }))).toEqual({
      language: "請選擇介面語言。",
    });
  });

  it("rejects a non-integer radius", () => {
    expect(
      validateSettingsValues(settings({ maxAcceptRadius: "12.5" }))
        .maxAcceptRadius,
    ).toBe("接單範圍只能輸入整數公里數。");
  });

  it("rejects a non-numeric radius", () => {
    expect(
      validateSettingsValues(settings({ maxAcceptRadius: "abc" }))
        .maxAcceptRadius,
    ).toBe("接單範圍只能輸入整數公里數。");
  });

  it("rejects a zero radius", () => {
    expect(
      validateSettingsValues(settings({ maxAcceptRadius: "0" }))
        .maxAcceptRadius,
    ).toBe("接單範圍需大於 0 公里。");
  });

  it("rejects a radius above the 200 km ceiling", () => {
    expect(
      validateSettingsValues(settings({ maxAcceptRadius: "201" }))
        .maxAcceptRadius,
    ).toBe("接單範圍不可超過 200 公里。");
  });

  it("accepts the boundary radius of exactly 200 km", () => {
    expect(
      validateSettingsValues(settings({ maxAcceptRadius: "200" })),
    ).toEqual({});
  });

  it("treats an empty radius as unset rather than invalid", () => {
    expect(validateSettingsValues(settings({ maxAcceptRadius: "  " }))).toEqual(
      {},
    );
  });
});

describe("hasEmergencyInput", () => {
  it("is false when every emergency field is blank", () => {
    expect(hasEmergencyInput(profile())).toBe(false);
    expect(
      hasEmergencyInput(profile({ emergencyName: "   ", emergencyPhone: " " })),
    ).toBe(false);
  });

  it("is true when any single emergency field is filled", () => {
    expect(hasEmergencyInput(profile({ emergencyName: "陳太太" }))).toBe(true);
    expect(hasEmergencyInput(profile({ emergencyPhone: "0987" }))).toBe(true);
    expect(hasEmergencyInput(profile({ emergencyRelationship: "配偶" }))).toBe(
      true,
    );
  });
});

describe("validateProfileValues", () => {
  it("requires a driver name", () => {
    expect(validateProfileValues(profile()).profileName).toBe(
      "司機個人資料需要填寫姓名。",
    );
  });

  it("accepts a name-only profile", () => {
    expect(validateProfileValues(profile({ profileName: "陳司機" }))).toEqual(
      {},
    );
  });

  it("rejects a malformed email", () => {
    expect(
      validateProfileValues(
        profile({ profileName: "陳司機", profileEmail: "not-an-email" }),
      ).profileEmail,
    ).toBe("電子郵件格式無效。");
  });

  it("accepts a well-formed email", () => {
    expect(
      validateProfileValues(
        profile({ profileName: "陳司機", profileEmail: "a@b.co" }),
      ),
    ).toEqual({});
  });

  it("demands name and phone once any emergency field is touched", () => {
    expect(
      validateProfileValues(
        profile({ profileName: "陳司機", emergencyRelationship: "配偶" }),
      ),
    ).toEqual({
      emergencyName: "新增緊急聯絡人時，請填寫聯絡人姓名。",
      emergencyPhone: "新增緊急聯絡人時，請填寫聯絡人電話。",
    });
  });

  it("accepts a complete emergency contact", () => {
    expect(
      validateProfileValues(
        profile({
          profileName: "陳司機",
          emergencyName: "陳太太",
          emergencyPhone: "0987654321",
        }),
      ),
    ).toEqual({});
  });
});

describe("hasErrors", () => {
  it("is false for an empty error bag", () => {
    expect(hasErrors({})).toBe(false);
  });

  it("is false when every entry is undefined", () => {
    expect(hasErrors({ language: undefined })).toBe(false);
  });

  it("is true when any entry carries a message", () => {
    expect(hasErrors({ language: "請選擇介面語言。" })).toBe(true);
  });
});

describe("buildSettingsCommand", () => {
  it("converts a filled radius to a number", () => {
    expect(
      buildSettingsCommand(
        settings({ language: " en-US ", maxAcceptRadius: " 25 " }),
      ),
    ).toEqual({
      language: "en-US",
      notificationsEnabled: true,
      autoAcceptEnabled: false,
      maxAcceptRadius: 25,
    });
  });

  it("sends null when the radius is cleared", () => {
    expect(
      buildSettingsCommand(settings({ maxAcceptRadius: "" })).maxAcceptRadius,
    ).toBeNull();
  });
});

describe("buildProfileCommand", () => {
  it("trims fields and nulls empty optional ones", () => {
    expect(buildProfileCommand(profile({ profileName: " 陳司機 " }))).toEqual({
      name: "陳司機",
      phone: null,
      email: null,
      emergencyContact: null,
    });
  });

  it("includes the emergency contact when supplied", () => {
    expect(
      buildProfileCommand(
        profile({
          profileName: "陳司機",
          profilePhone: "0912345678",
          profileEmail: "driver@example.com",
          emergencyName: "陳太太",
          emergencyPhone: "0987654321",
          emergencyRelationship: "配偶",
        }),
      ),
    ).toEqual({
      name: "陳司機",
      phone: "0912345678",
      email: "driver@example.com",
      emergencyContact: {
        name: "陳太太",
        phone: "0987654321",
        relationship: "配偶",
      },
    });
  });

  it("nulls an omitted relationship inside a present emergency contact", () => {
    expect(
      buildProfileCommand(
        profile({
          profileName: "陳司機",
          emergencyName: "陳太太",
          emergencyPhone: "0987654321",
        }),
      ).emergencyContact,
    ).toEqual({
      name: "陳太太",
      phone: "0987654321",
      relationship: null,
    });
  });
});

describe("deriveSaveState", () => {
  const base = {
    saving: false,
    dirty: false,
    hasValidation: false,
    lastResult: null as "success" | "error" | null,
  };

  it("reports saving above every other signal", () => {
    expect(
      deriveSaveState({
        saving: true,
        dirty: true,
        hasValidation: true,
        lastResult: "error",
      }),
    ).toBe("saving");
  });

  it("reports error ahead of dirty", () => {
    expect(deriveSaveState({ ...base, dirty: true, lastResult: "error" })).toBe(
      "error",
    );
  });

  it("reports dirty for unsaved edits", () => {
    expect(deriveSaveState({ ...base, dirty: true })).toBe("dirty");
  });

  it("reports dirty for unsaved edits that also fail validation", () => {
    expect(deriveSaveState({ ...base, dirty: true, hasValidation: true })).toBe(
      "dirty",
    );
  });

  it("reports saved after a clean successful save", () => {
    expect(deriveSaveState({ ...base, lastResult: "success" })).toBe("saved");
  });

  it("reports idle before anything has happened", () => {
    expect(deriveSaveState(base)).toBe("idle");
  });
});
