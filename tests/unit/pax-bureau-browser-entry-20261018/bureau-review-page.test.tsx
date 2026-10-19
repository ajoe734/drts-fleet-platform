// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BureauReviewPage } from "../../../apps/passenger-app-web/components/bureau-review/BureauReviewPage";
import {
  BUREAU_REVIEW_CASES,
  BUREAU_REVIEW_STAGE_GROUPS,
  BUREAU_REVIEW_TOTAL_STAGES,
} from "../../../apps/passenger-app-web/components/bureau-review/content";

const originalHost = process.env.PAX_BUREAU_ENTRY_HOST;
const originalMode = process.env.PAX_PUBLIC_PASSENGER_ONLY;

afterEach(() => {
  cleanup();
  if (originalMode === undefined) delete process.env.PAX_PUBLIC_PASSENGER_ONLY;
  else process.env.PAX_PUBLIC_PASSENGER_ONLY = originalMode;
  if (originalHost === undefined) {
    delete process.env.PAX_BUREAU_ENTRY_HOST;
  } else {
    process.env.PAX_BUREAU_ENTRY_HOST = originalHost;
  }
});

describe("PAX-BUREAU-BROWSER-ENTRY-20261018: BureauReviewPage", () => {
  it("uses this Passenger origin in public mode even when the old custom host is not provisioned", () => {
    process.env.PAX_PUBLIC_PASSENGER_ONLY = "true";
    process.env.PAX_BUREAU_ENTRY_HOST = "not-provisioned.example";
    const { container } = render(<BureauReviewPage />);
    expect(container.querySelector('a[href="/login"]')).not.toBeNull();
    expect(container.querySelector('a[href="/review"]')).not.toBeNull();
    expect(
      container.querySelector('a[href*="not-provisioned.example"]'),
    ).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(BUREAU_REVIEW_CASES).toHaveLength(16);
  });

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
      const details = screen.getByText(entry.id).closest("details");
      expect(details).not.toBeNull();
      for (const text of [
        entry.preconditions,
        entry.expected,
        entry.verified,
        entry.missing,
      ]) {
        expect(details?.textContent).toContain(text);
      }
      expect(
        within(details!)
          .getAllByRole("listitem")
          .map((item) => item.textContent),
      ).toEqual(entry.steps);
    }

    // Preserve UC01's historical first-time gap, even when later positive
    // consent evidence is displayed separately. It is not a current-run verdict.
    const uc01 = BUREAU_REVIEW_CASES.find((c) => c.id === "UC01");
    expect(uc01?.missing).toContain("首次條款");
    expect(uc01?.status).not.toMatch(/^已驗$/);

    // UC16 (welfare/accessibility) must stay listed, not silently dropped.
    const uc16 = BUREAU_REVIEW_CASES.find((c) => c.id === "UC16");
    expect(uc16).toBeDefined();
    expect(uc16?.title).toContain("無障礙");
  });

  it("separates the checked 61fa run from the unchanged 48d94 historical cases", () => {
    const { container } = render(<BureauReviewPage />);
    const current = screen.getByRole("region", {
      name: "最近已核對的共享實測",
    });
    expect(current.textContent).toContain(
      "61fa7cf44fb25d8be36634357fa3549286b96b84",
    );
    expect(current.textContent).toContain("8 張演練新訂單");
    expect(current.textContent).toContain("48 + 60 = 108 個階段");
    expect(current.textContent).toContain("不是全部 16 案通過");
    expect(current.textContent).not.toContain("163");

    const historical = screen
      .getByRole("heading", { name: "歷史已驗證案例摘要（48d94）" })
      .closest("section");
    expect(historical?.textContent).toContain("publish/v2026.10.18.4");
    expect(historical?.textContent).toContain("163");
    expect(historical?.textContent).not.toContain("108");
    expect(container.querySelectorAll("details")).toHaveLength(16);
  });

  it("shows current positive evidence together with the unverified branches and policy limits", () => {
    render(<BureauReviewPage />);
    const current = screen.getByRole("region", {
      name: "最近已核對的共享實測",
    });
    for (const required of [
      "首次條款視窗確實出現",
      "沒有條款視窗原圖",
      "未勾選、拒絕、錯碼、過期、重寄",
      "允許取消時不收取消費",
      "實際已扣款",
      "90 秒是尚未指派的媒合工作",
      "60 秒是已指派任務的接單期限",
      "上車後／待補憑證時的取消拒絕",
      "福利／無障礙",
      "追蹤卡不在原圖範圍",
    ]) {
      expect(current.textContent).toContain(required);
    }
    expect(current.textContent).not.toContain(".local/");
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
