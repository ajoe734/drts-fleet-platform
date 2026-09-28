import { expect, test } from "vitest";
import { t } from "../../../../apps/platform-admin-web/lib/translations";

test("t returns localized string for accepted_unknown", () => {
  expect(t("partnerNotification.accepted_unknown", "en")).toBe("Accepted (Unknown Device State)");
  expect(t("partnerNotification.accepted_unknown", "zh")).toBe("夥伴已接受（狀態未知）");
});
