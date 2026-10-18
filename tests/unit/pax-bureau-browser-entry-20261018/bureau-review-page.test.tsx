// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BureauReviewPage } from "../../../apps/passenger-app-web/components/bureau-review/BureauReviewPage";
import {
  BUREAU_REVIEW_CASES,
  BUREAU_REVIEW_STAGE_GROUPS,
  BUREAU_REVIEW_TOTAL_STAGES,
} from "../../../apps/passenger-app-web/components/bureau-review/content";

const originalHost = process.env.PAX_BUREAU_ENTRY_HOST;

afterEach(() => {
  cleanup();
  if (originalHost === undefined) {
    delete process.env.PAX_BUREAU_ENTRY_HOST;
  } else {
    process.env.PAX_BUREAU_ENTRY_HOST = originalHost;
  }
});

describe("PAX-BUREAU-BROWSER-ENTRY-20261018: BureauReviewPage", () => {
  it("renders a read-only notice and the full stage-group evidence", () => {
    render(<BureauReviewPage />);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain(
      "新北市交通局審查入口",
    );
    expect(screen.getByRole("status").textContent).toContain("唯讀");

    for (const group of BUREAU_REVIEW_STAGE_GROUPS) {
      expect(screen.getAllByText(group.label).length).toBeGreaterThan(0);
    }
    expect(
      screen.getAllByText(String(BUREAU_REVIEW_TOTAL_STAGES)).length,
    ).toBeGreaterThan(0);
    expect(BUREAU_REVIEW_TOTAL_STAGES).toBe(163);
  });

  it("lists all 16 cases (UC01-UC16) with their own precondition/steps/expected/verified/missing text", () => {
    render(<BureauReviewPage />);

    expect(BUREAU_REVIEW_CASES).toHaveLength(16);
    for (const entry of BUREAU_REVIEW_CASES) {
      expect(screen.getByText(entry.id)).not.toBeNull();
    }

    // UC01's first-time consent gap must not be rendered as already verified.
    const uc01 = BUREAU_REVIEW_CASES.find((c) => c.id === "UC01");
    expect(uc01?.missing).toContain("首次條款");
    expect(uc01?.status).not.toMatch(/^已驗$/);

    // UC16 (welfare/accessibility) must stay listed, not silently dropped.
    const uc16 = BUREAU_REVIEW_CASES.find((c) => c.id === "UC16");
    expect(uc16).toBeDefined();
    expect(uc16?.title).toContain("無障礙");
  });

  it("never renders an interactive booking/login control", () => {
    render(<BureauReviewPage />);

    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(document.querySelector("form")).toBeNull();
    expect(document.querySelector("input")).toBeNull();
  });

  it("never links into the driver-rehearsal/dispatch control surface, even with a configured host", () => {
    process.env.PAX_BUREAU_ENTRY_HOST = "bureau.smarttransport.tw";
    const { container } = render(<BureauReviewPage />);

    const hrefs = [...container.querySelectorAll("a[href]")].map((a) =>
      a.getAttribute("href"),
    );
    expect(hrefs.length).toBeGreaterThan(0);
    expect(
      hrefs.every(
        (href) =>
          !href?.includes("/review-driver") &&
          !href?.includes("review-driver-api"),
      ),
    ).toBe(true);
  });

  it("without a configured public-entry host, states the 403 is not yet resolved instead of implying success", () => {
    delete process.env.PAX_BUREAU_ENTRY_HOST;
    render(<BureauReviewPage />);

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("尚未開放對外的公開網址");
    expect(alert.textContent).toContain("無法經由本服務的公開網址到達");
    expect(document.querySelector('a[href^="https://"]')).toBeNull();
  });

  it("with a configured public-entry host, links to the real /login entry on that host over HTTPS", () => {
    process.env.PAX_BUREAU_ENTRY_HOST = "bureau.smarttransport.tw";
    const { container } = render(<BureauReviewPage />);

    const loginLink = container.querySelector(
      'a[href="https://bureau.smarttransport.tw/login"]',
    );
    expect(loginLink).not.toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
