// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  ReviewDemoProvider,
  useReviewDemo,
} from "../../../apps/passenger-app-web/components/review-demo/review-context";
import {
  startDemo,
  stopDemo,
} from "../../../apps/passenger-app-web/lib/demo/store";

const navigation = vi.hoisted(() => ({ pathname: "/demo" }));
vi.mock("../../../apps/passenger-app-web/node_modules/next/navigation", () => ({
  usePathname: () => navigation.pathname,
}));

function Consumer() {
  return <output data-testid="mode">{String(useReviewDemo())}</output>;
}
function renderProvider() {
  return render(
    <ReviewDemoProvider>
      <Consumer />
    </ReviewDemoProvider>,
  );
}
let fetchConfig: ReturnType<typeof vi.fn>;
beforeEach(() => {
  window.localStorage.clear();
  navigation.pathname = "/demo";
  fetchConfig = vi.fn(async () =>
    Response.json({ data: { enabled: true, ops_url: "https://ops.example" } }),
  );
  vi.stubGlobal("fetch", fetchConfig);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

it("keeps the original local demo entry and its terms free of API calls", async () => {
  const view = renderProvider();
  await act(async () => {});
  expect(fetchConfig).not.toHaveBeenCalled();
  expect(screen.getByTestId("mode").textContent).toBe("false");
  navigation.pathname = "/demo/terms";
  view.rerender(
    <ReviewDemoProvider>
      <Consumer />
    </ReviewDemoProvider>,
  );
  await act(async () => {});
  expect(fetchConfig).not.toHaveBeenCalled();
});

it("keeps an active local journey offline on reload and loads shared configuration after exit", async () => {
  startDemo();
  navigation.pathname = "/rides";
  renderProvider();
  await act(async () => {});
  expect(fetchConfig).not.toHaveBeenCalled();
  expect(screen.getByTestId("mode").textContent).toBe("false");
  act(() => stopDemo());
  await waitFor(() =>
    expect(screen.getByTestId("mode").textContent).toBe("true"),
  );
  expect(fetchConfig).toHaveBeenCalledWith(
    "/api/passenger-app/review-demo/config",
    { cache: "no-store" },
  );
});

it("still enables the shared review entry from its real runtime configuration", async () => {
  navigation.pathname = "/review";
  renderProvider();
  await waitFor(() =>
    expect(screen.getByTestId("mode").textContent).toBe("true"),
  );
  expect(fetchConfig).toHaveBeenCalledOnce();
});
