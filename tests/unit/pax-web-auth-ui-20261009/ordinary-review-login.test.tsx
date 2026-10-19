// @vitest-environment jsdom
import { createRequire } from "node:module";
import { resolve } from "node:path";
import type { ReactElement } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import LoginPage from "../../../apps/passenger-app-web/app/login/page";
import { ConsentGate } from "../../../apps/passenger-app-web/components/auth/consent-gate";
import { ReviewDemoProvider } from "../../../apps/passenger-app-web/components/review-demo/review-context";
import { createFixture } from "./fixture";

const requireApp = createRequire(
  resolve("apps/passenger-app-web/package.json"),
);
const { AppRouterContext } = requireApp(
  "next/dist/shared/lib/app-router-context.shared-runtime",
);
const { PathnameContext } = requireApp(
  "next/dist/shared/lib/hooks-client-context.shared-runtime",
);

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function mount(ui: ReactElement, push = vi.fn()) {
  return render(
    <AppRouterContext.Provider value={{ push, prefetch: vi.fn() }}>
      <PathnameContext.Provider value="/login">
        <ReviewDemoProvider>{ui}</ReviewDemoProvider>
      </PathnameContext.Provider>
    </AppRouterContext.Provider>,
  );
}

function noFormalLegalConfig() {
  for (const name of [
    "NEXT_PUBLIC_TERMS_URL",
    "NEXT_PUBLIC_PRIVACY_URL",
    "NEXT_PUBLIC_TERMS_VERSION",
    "NEXT_PUBLIC_PRIVACY_VERSION",
  ])
    vi.stubEnv(name, "");
}

it("ordinary login reads simulated SMS, verifies a genuine challenge and persists explicit rehearsal consent", async () => {
  const f = createFixture({ review: true });
  noFormalLegalConfig();
  const push = vi.fn();
  mount(<LoginPage />, push);
  await screen.findByRole("complementary", { name: "同單審查演練" });
  fireEvent.click(await screen.findByRole("button", { name: "手機號碼登入" }));
  fireEvent.change(screen.getByLabelText("請輸入您的手機號碼"), {
    target: { value: "0900000016" },
  });
  fireEvent.click(screen.getByRole("button", { name: "取得驗證碼" }));
  const inbox = await screen.findByLabelText("模擬簡訊驗證碼");
  expect(inbox.textContent).toBe(f.codes[0]);
  expect(f.accountStore.sessions.size).toBe(0);
  expect(
    f.calls.filter((c) => c.path === "review-demo/otp").map((c) => c.body),
  ).toEqual([{ target: "0900000016" }]);
  fireEvent.change(screen.getByRole("textbox", { name: "6 位數驗證碼 1" }), {
    target: { value: inbox.textContent },
  });
  fireEvent.click(screen.getByRole("button", { name: "驗證", exact: true }));
  await screen.findByText("歡迎加入，請同意服務條款");
  await waitFor(() =>
    expect((screen.getByRole("checkbox") as HTMLInputElement).disabled).toBe(
      false,
    ),
  );
  expect(
    screen.getByRole("link", { name: "服務條款" }).getAttribute("href"),
  ).toBe("/review/terms");
  expect(
    screen.getByRole("link", { name: "隱私權政策" }).getAttribute("href"),
  ).toBe("/review/terms");
  expect(push).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "繼續" }));
  await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
  const account = await f.client.getAccount();
  expect(account).toMatchObject({
    verifiedPhone: "+886900000016",
    termsVersion: "review-terms-v1",
    privacyVersion: "review-privacy-v1",
  });
  expect(f.calls.find((c) => c.path === "auth/otp/verify")?.body).toMatchObject(
    {
      target: "0900000016",
      provider: "phone",
      code: f.codes[0],
    },
  );
  expect(f.accountStore.sessions.size).toBe(1);
  expect(localStorage.getItem("drts.passenger.functional-demo.v1")).toBeNull();
});

it("ordinary consent can show existing rehearsal terms without formal legal configuration", async () => {
  const f = createFixture({ review: true });
  noFormalLegalConfig();
  await f.signIn();
  mount(
    <ConsentGate client={f.client} onAccepted={vi.fn()} onRefused={vi.fn()} />,
  );
  await screen.findByRole("complementary", { name: "同單審查演練" });
  await waitFor(() =>
    expect((screen.getByRole("checkbox") as HTMLInputElement).disabled).toBe(
      false,
    ),
  );
  expect(
    screen.queryByText("服務條款與隱私權政策目前無法使用，請稍後重試。"),
  ).toBeNull();
  expect(
    screen.getByRole("link", { name: "服務條款" }).getAttribute("href"),
  ).toBe("/review/terms");
});
