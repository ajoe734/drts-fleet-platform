import { describe, expect, it } from "vitest";

import {
  findPlacardVersionCodeConflict,
  getPlacardVersionCodePrecheckMessage,
  normalizePlacardVersionCode,
} from "../../apps/platform-admin-web/app/switchboard/placard-version-code";

const EXISTING_PLACARDS = [
  {
    placardVersionId: "placard-001",
    versionCode: "placard-2026-q3",
  },
  {
    placardVersionId: "placard-002",
    versionCode: "Placard-2026-Q4",
  },
] as const;

describe("platform admin switchboard placard versionCode precheck", () => {
  it("normalizes version codes before local duplicate comparison", () => {
    expect(normalizePlacardVersionCode("  Placard-2026-Q4  ")).toBe(
      "placard-2026-q4",
    );
  });

  it("flags duplicate version codes case-insensitively", () => {
    expect(
      findPlacardVersionCodeConflict("  placard-2026-q4 ", EXISTING_PLACARDS),
    ).toEqual(EXISTING_PLACARDS[1]);
    expect(
      getPlacardVersionCodePrecheckMessage(
        "PLACARD-2026-Q3",
        EXISTING_PLACARDS,
      ),
    ).toBe(
      "Version code already exists in placard placard-001. Choose a unique code before generating.",
    );
  });

  it("allows blank and unique version codes without a warning", () => {
    expect(findPlacardVersionCodeConflict("   ", EXISTING_PLACARDS)).toBeNull();
    expect(
      getPlacardVersionCodePrecheckMessage(
        "placard-2026-q5",
        EXISTING_PLACARDS,
      ),
    ).toBeNull();
  });
});
