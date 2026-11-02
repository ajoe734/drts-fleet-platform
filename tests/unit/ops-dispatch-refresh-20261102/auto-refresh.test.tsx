// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { Suspense, use, useState, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { router, navigation } = vi.hoisted(() => {
  const router = {
    pending: [] as Array<() => void>,
    show: (() => {}) as (payload: Promise<void>) => void,
  };
  const navigation = () => ({
    useRouter: () => ({
      // As in the app router, a refresh holds the tree until its payload lands.
      refresh: () => {
        let land!: () => void;
        router.show(
          new Promise<void>((resolve) => {
            land = resolve;
          }),
        );
        router.pending.push(land);
      },
    }),
  });
  return { router, navigation };
});
vi.mock(
  "../../../apps/ops-console-web/node_modules/next/navigation",
  navigation,
);
vi.mock("next/navigation", navigation);

import { DispatchAutoRefresh } from "../../../apps/ops-console-web/components/dispatch-auto-refresh";

function Tree({ children }: { children: ReactNode }) {
  const [payload, setPayload] = useState<Promise<void> | null>(null);
  router.show = setPayload;
  if (payload) use(payload);
  return children;
}

beforeEach(() => {
  router.pending = [];
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("starts the next refresh only after the previous one lands", async () => {
  render(
    <Suspense fallback={null}>
      <Tree>
        <DispatchAutoRefresh intervalMs={5000} />
      </Tree>
    </Suspense>,
  );
  await act(async () => {
    vi.advanceTimersByTime(5000);
  });
  expect(router.pending).toHaveLength(1);
  // Shared dev, 2026-11-02: a render took 7-49 s, and each newer refresh
  // superseded the one in flight, so a created dispatch never showed.
  await act(async () => {
    vi.advanceTimersByTime(15000);
  });
  expect(router.pending).toHaveLength(1);
  await act(async () => {
    router.pending[0]!();
  });
  await act(async () => {
    vi.advanceTimersByTime(5000);
  });
  expect(router.pending).toHaveLength(2);
});
