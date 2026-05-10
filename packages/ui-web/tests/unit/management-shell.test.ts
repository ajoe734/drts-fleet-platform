import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ManagementSidebar } from "../../src/management-sidebar";
import { managementSurfaceTone } from "../../src/management-theme";

describe("management shell navigation", () => {
  it("renders grouped sidebar sections and marks the active item", () => {
    const markup = renderToStaticMarkup(
      createElement(ManagementSidebar, {
        brand: "DRTS",
        brandSub: "Ops Console",
        currentPath: "/dispatch/orders/123",
        sections: [
          {
            key: "operations",
            title: "Operations",
            items: [
              { href: "/dispatch", label: "Dispatch Board" },
              { href: "/dispatch/orders", label: "Orders" },
            ],
          },
          {
            key: "settings",
            title: "Settings",
            items: [{ href: "/settings/users", label: "Users" }],
          },
        ],
      }),
    );

    expect(markup).toContain("Operations");
    expect(markup).toContain("Settings");
    expect(markup).toContain(">Orders<");
    expect(markup).toContain("font-weight:700");
  });

  it("renders per-item badge tone styling from management theme tokens", () => {
    const markup = renderToStaticMarkup(
      createElement(ManagementSidebar, {
        brand: "DRTS",
        currentPath: "/alerts",
        sections: [
          {
            key: "monitoring",
            items: [
              {
                href: "/alerts",
                label: "Alerts",
                badge: "4",
                badgeTone: "warning",
              },
            ],
          },
        ],
      }),
    );

    expect(markup).toContain('data-badge-tone="warning"');
    expect(markup).toContain(managementSurfaceTone("warning").background);
    expect(markup).toContain(managementSurfaceTone("warning").border);
  });
});
