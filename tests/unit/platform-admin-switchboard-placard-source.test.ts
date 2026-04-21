import { describe, expect, it } from "vitest";

import {
  formatPlacardSourceOptionLabel,
  getPreferredPlacardSourceVersion,
  getPlacardSourceSelectionHint,
  isPlacardSourceSelectionBlocked,
  PLACARD_RETIRED_SOURCE_AUDIT_NOTE,
} from "../../apps/platform-admin-web/app/switchboard/placard-source";

function makeVersion(
  overrides: Partial<{
    versionId: string;
    title: string;
    status: "draft" | "published" | "retired";
  }>,
) {
  return {
    versionId: "version-001",
    title: "Public Info",
    status: "draft" as const,
    ...overrides,
  };
}

describe("platform admin switchboard placard source rules", () => {
  it("marks retired sources unavailable in the option label", () => {
    expect(
      formatPlacardSourceOptionLabel({
        title: "2026 Q3 Public Info",
        status: "retired",
      }),
    ).toBe("2026 Q3 Public Info (retired source unavailable)");
  });

  it("blocks placard generation for retired sources and explains why", () => {
    const retiredSource = {
      title: "2026 Q2 Public Info",
      status: "retired",
    } as const;

    expect(isPlacardSourceSelectionBlocked(retiredSource)).toBe(true);
    expect(getPlacardSourceSelectionHint(retiredSource)).toBe(
      "Retired source selected: generate is blocked because placards must be linked to an active draft or published disclosure version.",
    );
    expect(PLACARD_RETIRED_SOURCE_AUDIT_NOTE).toContain(
      "cannot be used to generate new placards",
    );
  });

  it("keeps published and draft sources selectable with the correct hint", () => {
    expect(
      isPlacardSourceSelectionBlocked({
        title: "2026 Q4 Public Info",
        status: "published",
      }),
    ).toBe(false);
    expect(
      getPlacardSourceSelectionHint({
        title: "2026 Q4 Public Info",
        status: "published",
      }),
    ).toBe(
      "Published source selected: generated placard will inherit the live disclosure timestamp.",
    );
    expect(
      getPlacardSourceSelectionHint({
        title: "2026 Draft Public Info",
        status: "draft",
      }),
    ).toBe(
      "Draft source selected: generated placard stays draft until the linked public info is published.",
    );
  });

  it("prefers published, then draft, and never auto-selects retired-only sources", () => {
    expect(
      getPreferredPlacardSourceVersion([
        makeVersion({
          versionId: "retired-001",
          title: "2026 Q1 Public Info",
          status: "retired",
        }),
      ]),
    ).toBeNull();

    expect(
      getPreferredPlacardSourceVersion([
        makeVersion({
          versionId: "retired-001",
          title: "2026 Q1 Public Info",
          status: "retired",
        }),
        makeVersion({
          versionId: "draft-001",
          title: "2026 Q2 Public Info",
          status: "draft",
        }),
      ]),
    ).toMatchObject({ versionId: "draft-001" });

    expect(
      getPreferredPlacardSourceVersion([
        makeVersion({
          versionId: "draft-001",
          title: "2026 Q2 Public Info",
          status: "draft",
        }),
        makeVersion({
          versionId: "published-001",
          title: "2026 Q3 Public Info",
          status: "published",
        }),
      ]),
    ).toMatchObject({ versionId: "published-001" });
  });
});
