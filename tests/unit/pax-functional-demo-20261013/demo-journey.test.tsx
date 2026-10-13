// @vitest-environment jsdom
import type { ReactElement } from "react";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import DemoPage from "../../../apps/passenger-app-web/app/demo/page";
import LoginPage from "../../../apps/passenger-app-web/app/login/page";
import PaymentMethodsPage from "../../../apps/passenger-app-web/app/account/payment-methods/page";
import Home from "../../../apps/passenger-app-web/app/page";
import {
  DEMO_STORAGE_KEY,
  getDemoState,
  isDemoMode,
  resetDemo,
  stopDemo,
} from "../../../apps/passenger-app-web/lib/demo/store";
import type { DemoState } from "../../../apps/passenger-app-web/lib/demo/types";

// Use real package source with the app's Next context; no client or demo transport is replaced.
vi.mock(
  "@drts/passenger-client",
  async () => import("../../../packages/passenger-client/src/index"),
);
vi.mock(
  "@drts/ui-web",
  async () => import("../../../packages/ui-web/src/index"),
);

const appRequire = createRequire(
  resolve("apps/passenger-app-web/package.json"),
);
const { AppRouterContext } = appRequire(
  "next/dist/shared/lib/app-router-context.shared-runtime",
) as typeof import("next/dist/shared/lib/app-router-context.shared-runtime");
const push = vi.fn();
const router: AppRouterInstance = {
  bfcacheId: "functional-demo-journey",
  push,
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
};
const network = vi
  .fn()
  .mockRejectedValue(new Error("unexpected_external_network"));
function mount(page: ReactElement) {
  return render(
    <AppRouterContext.Provider value={router}>
      {page}
    </AppRouterContext.Provider>,
  );
}
const click = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name }));

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  resetDemo();
  stopDemo();
  push.mockClear();
  network.mockClear();
  vi.stubGlobal("fetch", network);
  for (const variable of [
    "NEXT_PUBLIC_TERMS_URL",
    "NEXT_PUBLIC_PRIVACY_URL",
    "NEXT_PUBLIC_TERMS_VERSION",
    "NEXT_PUBLIC_PRIVACY_VERSION",
    "NEXT_PUBLIC_PAYMENT_FIELDS_PROVIDER",
    "NEXT_PUBLIC_PAYMENT_3DS_ORIGINS",
  ])
    vi.stubEnv(variable, "");
});
afterEach(() => {
  cleanup();
  stopDemo();
  localStorage.clear();
  sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("explicit demo journey through actual page clients and browser transport", () => {
  it("logs in, accepts demo consent, binds a card and books a persisted ride without external setup", async () => {
    expect(isDemoMode()).toBe(false);
    let page = mount(<DemoPage />);
    expect(screen.getByText(/使用虛構帳號、示範地點與示意卡/)).toBeTruthy();
    click("開始／繼續示範");
    expect(isDemoMode()).toBe(true);
    expect(push).toHaveBeenLastCalledWith("/login");

    page.unmount();
    page = mount(<LoginPage />);
    await screen.findByRole("button", { name: "手機號碼登入" });
    click("手機號碼登入");
    fireEvent.change(screen.getByLabelText("請輸入您的手機號碼"), {
      target: { value: "0900000000" },
    });
    click("取得驗證碼");
    await screen.findByRole("group", { name: "6 位數驗證碼" });
    fireEvent.change(screen.getByRole("textbox", { name: "6 位數驗證碼 1" }), {
      target: { value: "123456" },
    });
    click("驗證");
    await screen.findByText("歡迎加入，請同意服務條款");
    expect(screen.getByText(/這是示範同意步驟/)).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "服務條款" }).getAttribute("href"),
    ).toBe("/demo/terms");
    expect(
      screen.getByRole("link", { name: "隱私權政策" }).getAttribute("href"),
    ).toBe("/demo/privacy");
    await waitFor(() =>
      expect((screen.getByRole("checkbox") as HTMLInputElement).disabled).toBe(
        false,
      ),
    );
    fireEvent.click(screen.getByRole("checkbox"));
    click("繼續");
    await waitFor(() => expect(push).toHaveBeenLastCalledWith("/"));
    expect(getDemoState()).toMatchObject({
      loggedIn: true,
      account: {
        termsVersion: "demo-terms-v1",
        privacyVersion: "demo-privacy-v1",
        contactPhone: "0900000000",
        contactPhoneVerified: true,
      },
    });

    page.unmount();
    page = mount(<PaymentMethodsPage />);
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "新增信用卡",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    click("新增信用卡");
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "綁定卡片" }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    click("綁定卡片");
    await waitFor(() => expect(getDemoState()?.paymentMethods).toHaveLength(1));
    const method = getDemoState()!.paymentMethods[0]!;
    const cardLabel = `${method.cardType} •••• ${method.last4}`;
    await screen.findByText(cardLabel);
    expect(method.isDefault).toBe(true);
    page.unmount();
    page = mount(<PaymentMethodsPage />);
    await screen.findByText(cardLabel);
    expect(getDemoState()?.paymentMethods).toHaveLength(1);

    page.unmount();
    page = mount(<Home />);
    await screen.findByRole("button", { name: "我已閱讀並同意" });
    click("我已閱讀並同意");
    await screen.findByRole("combobox", { name: "示範上車地點" });
    fireEvent.change(screen.getByRole("combobox", { name: "示範上車地點" }), {
      target: { value: "demo-central" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "示範下車地點" }), {
      target: { value: "demo-exhibition" },
    });
    fireEvent.change(screen.getByLabelText("預約時間"), {
      target: { value: "2099-10-13T12:00" },
    });
    click("試算車資");
    await screen.findByRole("dialog", { name: "確認叫車" });
    expect(screen.getByText("示意起點：台北中央廣場")).toBeTruthy();
    expect(screen.getByText("示意目的地：信義展示中心")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("我已確認費用與優惠說明"));
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "確認叫車" }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    click("確認叫車");
    await waitFor(() => expect(getDemoState()?.rides).toHaveLength(1));
    const ride = getDemoState()!.rides[0]!;
    await waitFor(() =>
      expect(push).toHaveBeenLastCalledWith(
        `/ride?rideId=${encodeURIComponent(ride.id)}`,
      ),
    );
    expect(ride).toMatchObject({
      status: "reserved",
      paymentMethodId: method.paymentMethodId,
      paymentStatus: "pending",
      origin: { address: "示意起點：台北中央廣場" },
      destination: { address: "示意目的地：信義展示中心" },
    });
    const saved = JSON.parse(
      localStorage.getItem(DEMO_STORAGE_KEY)!,
    ) as DemoState;
    expect(saved.rides).toEqual([ride]);
    expect(saved.paymentMethods).toEqual([method]);

    page.unmount();
    page = mount(<Home />);
    await screen.findByRole("combobox", { name: "示範上車地點" });
    expect(screen.queryByRole("button", { name: "我已閱讀並同意" })).toBeNull();
    expect(getDemoState()?.rides).toEqual([ride]);
    expect(network).not.toHaveBeenCalled();
    page.unmount();
  });
});
