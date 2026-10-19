// @vitest-environment jsdom
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import RootLayout from "../../../apps/passenger-app-web/app/layout";

vi.mock("next/navigation", () => ({ usePathname: () => "/login" }));

describe("Passenger shared customer footer", () => {
  it("renders the customer phone after page content without exposing the technical contact", () => {
    const document = new DOMParser().parseFromString(
      renderToStaticMarkup(
        <RootLayout>
          <main id="page-content">乘客頁面內容</main>
        </RootLayout>,
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
