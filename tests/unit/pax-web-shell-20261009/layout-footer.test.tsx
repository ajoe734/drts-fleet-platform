// @vitest-environment jsdom
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import RootLayout from "../../../apps/passenger-app-web/app/layout";

vi.mock("next/navigation", () => ({ usePathname: () => "/login" }));
// CI resolves the app's own next install; mock both paths, as the other
// passenger app tests do for next/navigation.
const requestHeaders = vi.hoisted(() => () => ({
  headers: async () => new Headers({ host: "ride.smarttransport.tw" }),
}));
vi.mock(
  "../../../apps/passenger-app-web/node_modules/next/headers",
  requestHeaders,
);
vi.mock("next/headers", requestHeaders);

describe("Passenger shared customer footer", () => {
  it("renders the customer phone after page content without exposing the technical contact", async () => {
    const document = new DOMParser().parseFromString(
      renderToStaticMarkup(
        await RootLayout({
          children: <main id="page-content">乘客頁面內容</main>,
        }),
      ),
      "text/html",
    );
    const root = document.querySelector("#passenger-app-root");
    const footer = root?.querySelector("footer");
    const link = footer?.querySelector("a");

    expect(root?.querySelector("#page-content")?.textContent).toBe(
      "乘客頁面內容",
    );
    expect(root?.querySelectorAll("footer")).toHaveLength(1);
    expect(root?.lastElementChild).toBe(footer);
    expect(footer?.getAttribute("aria-label")).toBe("客服 02-2944-0985");
    expect(link?.getAttribute("href")).toBe("tel:02-2944-0985");
    expect(link?.textContent).toBe("客服 02-2944-0985");
    expect(footer?.textContent).not.toMatch(/0988-?220-?716|蔡尚志/);
  });
});
