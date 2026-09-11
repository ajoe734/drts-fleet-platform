import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { buildOpsShellNav } from "../../../../apps/ops-console-web/lib/ops-shell-nav";
import {
  buildFleetPortalNav,
  buildHostPortalNav,
} from "../../../../apps/fleet-partner-portal-web/lib/fleet-portal-nav";

describe("SR-WIRE-001: navigation wiring", () => {
  describe("ops-console-web: driver-leave review queue", () => {
    it("adds a /leave nav entry (SR-LEAVE-BE-001's ops review page had no nav entry point)", () => {
      const nav = buildOpsShellNav("zh", []);
      const leaveItem = nav.find(
        (item) => !("divider" in item) && item.key === "leave",
      );
      expect(leaveItem).toBeDefined();
      if (leaveItem && !("divider" in leaveItem)) {
        expect(leaveItem.href).toBe("/leave");
      }
    });
  });

  describe("fleet-partner-portal-web: Host restricted nav", () => {
    it("buildFleetPortalNav (fleet-admin nav) still has no Host entry mixed in", () => {
      // host-screen-contract.md §1: Host "must not see fleet-admin nav
      // items" -- and the converse holds too, the admin nav must not carry
      // a Host shortcut into it either. Host gets its own single-entry nav
      // below instead.
      const adminNav = buildFleetPortalNav("zh");
      const hasHostKey = adminNav.some(
        (item) => !("divider" in item) && item.key.startsWith("host"),
      );
      expect(hasHostKey).toBe(false);
    });

    it("buildHostPortalNav exposes exactly the one HOST_NAV entry the canvas specifies (自有車輛)", () => {
      const hostNav = buildHostPortalNav("zh");
      expect(hostNav).toHaveLength(1);
      expect(hostNav[0]).toMatchObject({
        key: "host-vehicles",
        href: "/host/vehicles",
      });
    });
  });

  describe("driver-app: tab registration for orphaned SR-LEAVE-FE-001 / SR-ACADEMY-FE-001 screens", () => {
    const source = readFileSync(
      new URL("../../../../apps/driver-app/app/_layout.tsx", import.meta.url),
      "utf8",
    );

    it("registers app/leave.tsx as a Tabs.Screen", () => {
      expect(source).toMatch(/<Tabs\.Screen\s+name="leave"/);
    });

    it("registers app/academy.tsx as a Tabs.Screen", () => {
      expect(source).toMatch(/<Tabs\.Screen\s+name="academy"/);
    });

    it("does not remove any of the pre-existing DRV-NAV tab routes", () => {
      for (const routeName of [
        "index",
        "jobs",
        "trip",
        "platform-presence",
        "settings",
        "onboarding",
        "earnings",
        "shift",
        "sos",
        "incident",
        "safety-operator",
      ]) {
        expect(source).toContain(`name="${routeName}"`);
      }
    });
  });
});
