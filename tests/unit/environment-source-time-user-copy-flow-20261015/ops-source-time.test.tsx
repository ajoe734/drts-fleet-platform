// @vitest-environment jsdom
import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpsHealthFooter } from "../../../apps/ops-console-web/components/ops-health-footer";
import { LanguageProvider } from "../../../apps/ops-console-web/lib/i18n";

// Match the Ops app's alias to its real provider/dictionaries in the root runner.
vi.mock(
  "@/lib/i18n",
  async () => import("../../../apps/ops-console-web/lib/i18n"),
);
vi.mock("@/lib/runtime-config", () => ({
  getRuntimeApiBaseUrl: () => "https://health.example.test",
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }) }));

const sourceTime = "2026-08-01T10:20:30.000Z";
const clientCompletionTime = "2030-01-02T03:04:05.000Z";
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
function response(payload: unknown, ok = true) {
  return { ok, json: async () => payload } as Response;
}
function mount(locale: "zh" | "en") {
  return render(
    <LanguageProvider defaultLocale={locale}>
      <OpsHealthFooter />
    </LanguageProvider>,
  );
}
const messages = {
  en: {
    source: "Source time",
    unavailable: "unavailable",
    checking: "API checking",
    healthy: "API healthy",
    unknown: "API unknown",
    down: "API down",
    degraded: "API degraded",
  },
  zh: {
    source: "來源時間",
    unavailable: "未知",
    checking: "API 檢查中",
    healthy: "API 健康",
    unknown: "API 未知",
    down: "API 失聯",
    degraded: "API 降級",
  },
};
beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  vi.setSystemTime(new Date(clientCompletionTime));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe.each(["en", "zh"] as const)(
  "actual Ops footer source time (%s)",
  (locale) => {
    it("renders the returned server timestamp instead of the distinct client completion time", async () => {
      const pending = deferred<Response>();
      const fetch = vi.fn(() => pending.promise);
      vi.stubGlobal("fetch", fetch);
      const { container } = mount(locale);
      expect(screen.getByText(messages[locale].checking)).toBeDefined();
      await act(async () => {
        pending.resolve(response({ status: "ok", timestamp: sourceTime }));
      });
      const format = (value: string) =>
        new Date(value).toLocaleTimeString(locale === "zh" ? "zh-TW" : "en-US");
      expect(container.textContent).toContain(
        `${messages[locale].source} ${format(sourceTime)}`,
      );
      expect(container.textContent).not.toContain(format(clientCompletionTime));
      expect(screen.getByText(messages[locale].healthy)).toBeDefined();
      expect(fetch).toHaveBeenCalledWith(
        "https://health.example.test/health",
        expect.objectContaining({
          cache: "no-store",
          signal: expect.any(AbortSignal),
        }),
      );
    });

    it.each([undefined, null, "", "not-a-timestamp", 42])(
      "shows unknown source time for missing/invalid timestamp %j",
      async (timestamp) => {
        vi.stubGlobal(
          "fetch",
          vi.fn(async () => response({ status: "ok", timestamp })),
        );
        const { container } = mount(locale);
        await act(async () => {});
        expect(screen.getByText(messages[locale].healthy)).toBeDefined();
        expect(container.textContent).toContain(
          `${messages[locale].source} ${messages[locale].unavailable}`,
        );
      },
    );

    it.each([
      [undefined, true, "unknown"],
      ["future-status", true, "unknown"],
      ["degraded", true, "degraded"],
      ["healthy", false, "down"],
    ] as const)(
      "preserves status mapping for %s / HTTP ok=%s",
      async (status, ok, expected) => {
        vi.stubGlobal(
          "fetch",
          vi.fn(async () => response({ status, timestamp: sourceTime }, ok)),
        );
        mount(locale);
        await act(async () => {});
        expect(screen.getByText(messages[locale][expected])).toBeDefined();
      },
    );

    it("clears the old source time on a failed refresh and preserves the locale toggle", async () => {
      const fetch = vi
        .fn()
        .mockResolvedValueOnce(
          response({ status: "healthy", timestamp: sourceTime }),
        )
        .mockRejectedValueOnce(new Error("network unavailable"));
      vi.stubGlobal("fetch", fetch);
      const { container } = mount(locale);
      await act(async () => {});
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_000);
      });
      expect(screen.getByText(messages[locale].down)).toBeDefined();
      expect(container.textContent).toContain(
        `${messages[locale].source} ${messages[locale].unavailable}`,
      );
      fireEvent.click(screen.getByRole("button"));
      const nextLocale = locale === "en" ? "zh" : "en";
      expect(screen.getByText(messages[nextLocale].down)).toBeDefined();
      expect(localStorage.getItem("drts-locale-v2")).toBe(nextLocale);
    });
  },
);

it("stops interval work and ignores a response after unmount", async () => {
  const pending = deferred<Response>();
  const fetch = vi.fn(() => pending.promise);
  vi.stubGlobal("fetch", fetch);
  const { unmount } = mount("en");
  unmount();
  await act(async () => {
    pending.resolve(response({ status: "ok", timestamp: sourceTime }));
    await vi.advanceTimersByTimeAsync(30_000);
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});
