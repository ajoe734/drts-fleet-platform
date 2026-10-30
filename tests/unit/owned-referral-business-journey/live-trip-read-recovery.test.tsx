// @vitest-environment jsdom
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { act, useState, useEffect, useMemo, type ComponentType } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { t as translate } from "../../../apps/referral-embed-web/lib/translations";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import ts from "typescript";
import { useReferralLiveTrip } from "../../../apps/referral-embed-web/components/use-referral-live-trip";

const epoch = Date.parse("2026-10-29T08:00:00Z");
const initial = {
  orderId: "same-original-order",
  orderNo: "same-order-no",
  status: "enroute_pickup",
  statusCode: "enroute_pickup",
  pickupAddress: "SIM original pickup",
  dropoffAddress: "SIM original destination",
  driverName: "Synthetic Driver",
  driverPhoneMasked: null,
  plateNumber: "SIM-001",
  vehicleType: "standard",
  etaMin: 3,
  cancelWindowMin: 0,
  createdAt: new Date(epoch).toISOString(),
  updatedAt: new Date(epoch).toISOString(),
  rated: false,
  cancellationWindow: {
    canCancel: true,
    cancelableUntil: null,
    asOf: new Date(epoch).toISOString(),
  },
  liveTracking: {
    assignmentId: "same-assignment",
    driverId: "same-driver",
    vehicleId: "same-vehicle",
    observedAt: new Date(epoch).toISOString(),
    locationFreshness: "fresh",
    location: {
      lat: 25,
      lng: 121,
      accuracyM: 5,
      recordedAt: new Date(epoch - 2000).toISOString(),
    },
    pickupEta: {
      minutes: 3,
      calculatedAt: new Date(epoch).toISOString(),
      estimatedArrivalAt: new Date(epoch + 180000).toISOString(),
    },
    dropoffRoute: null,
    pickupPoint: null,
    dropoffPoint: null,
  },
} as Parameters<typeof useReferralLiveTrip>[0];
let root: Root | undefined, host: HTMLDivElement | undefined;
let minutes: (trip: unknown) => number | null,
  arrival: (trip: unknown, pending: string) => string;
let Panel: ComponentType<{
  trip: NonNullable<typeof initial> & {
    localLocationAgeSeconds?: number | null;
  };
  error: boolean;
  refresh: () => void;
  theme: Record<string, string>;
}>;
beforeAll(async () => {
  const path = "apps/referral-embed-web/components/referral-live-tracking.tsx";
  const source = await readFile(
    resolve(dirname(fileURLToPath(import.meta.url)), "../../..", path),
    "utf8",
  );
  const ast = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const names = [
    "referralLiveMinutes",
    "referralLiveArrival",
    "time",
    "ReferralLiveTrackingPanel",
  ];
  const originals: string[] = [];
  for (const node of ast.statements)
    if (ts.isFunctionDeclaration(node) && names.includes(node.name?.text ?? ""))
      originals.push(node.getText(ast).replace(/^export /, ""));
  const api = runInNewContext(
    ts.transpileModule(originals.join("\n"), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText +
      ";({referralLiveMinutes,referralLiveArrival,ReferralLiveTrackingPanel});",
    {
      exports: {},
      Date,
      Intl,
      useState,
      useMemo,
      useEffect,
      useTranslation: () => ({ t: translate }),
      googleMapsAuthFailed: () => false,
      onGoogleMapsAuthFailure: () => () => {},
      require: (name: string) => {
        if (name !== "react/jsx-runtime") throw new Error(name);
        return jsxRuntime;
      },
    },
  );
  minutes = api.referralLiveMinutes;
  arrival = api.referralLiveArrival;
  Panel = api.ReferralLiveTrackingPanel;
});
beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      "Date",
      "setInterval",
      "clearInterval",
      "setTimeout",
      "clearTimeout",
    ],
  });
  vi.setSystemTime(epoch);
  vi.spyOn(performance, "now").mockImplementation(() => Date.now() - epoch);
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
});
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function Probe({ seed = initial }: { seed?: typeof initial }) {
  const live = useReferralLiveTrip(seed, "original-recovery-scope");
  // Keep the original consumer's routine render/cancellation clock present;
  // no product network/clock implementation is replaced.
  const [, render] = useState(0);
  return (
    <>
      <output data-testid="snapshot">
        {JSON.stringify({
          orderId: live.trip?.orderId,
          error: live.error,
          ended: live.ended,
          minutes: live.trip ? minutes(live.trip) : null,
          arrival: live.trip ? arrival(live.trip, "unknown") : "unknown",
          tracking: live.trip?.liveTracking,
          localAgeSeconds: live.trip?.localLocationAgeSeconds,
        })}
      </output>
      <button
        data-testid="manual-refresh"
        onClick={() => {
          live.refresh();
          render((x) => x + 1);
        }}
      >
        Original manual refresh
      </button>
      {live.trip ? (
        <Panel
          trip={live.trip}
          error={live.error}
          refresh={live.refresh}
          theme={{
            surface: "white",
            line: "gray",
            ink: "black",
            muted: "gray",
            primary: "blue",
          }}
        />
      ) : null}
    </>
  );
}
async function mount(seed: typeof initial = initial) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<Probe seed={seed} />));
}
const snapshot = () => JSON.parse(host!.querySelector("output")!.textContent!);
async function click() {
  await act(async () => {
    host!
      .querySelector<HTMLButtonElement>('[data-testid="manual-refresh"]')!
      .click();
    await Promise.resolve();
    await Promise.resolve();
  });
}
it("ages cached ETA to unknown after the existing60-second GPS window during offline retention", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("isolated offline IO double");
    }),
  );
  await mount();
  expect(snapshot().minutes).toBe(3);
  await act(async () => vi.advanceTimersByTimeAsync(65000));
  await click();
  const actual = snapshot();
  expect(actual.orderId).toBe("same-original-order");
  expect(actual.error).toBe(true);
  expect(actual.tracking.location.recordedAt).toBe(
    initial!.liveTracking!.location!.recordedAt,
  );
  expect(actual.minutes).toBeNull();
  expect(actual.arrival).toBe("unknown");
});
it("can recover an unsettled active read through the existing explicit manual refresh", async () => {
  const calls: AbortSignal[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          const signal = init.signal as AbortSignal;
          calls.push(signal);
          signal.addEventListener(
            "abort",
            () => reject(new Error("old read aborted")),
            { once: true },
          );
        }),
    ),
  );
  await mount();
  await click();
  expect(calls).toHaveLength(1);
  await act(async () => vi.advanceTimersByTimeAsync(10000));
  await click();
  expect(calls[0]!.aborted).toBe(true);
  expect(calls).toHaveLength(2);
});

const envelope = (trip: typeof initial) =>
  new Response(
    JSON.stringify({ ok: true, data: { active: Boolean(trip), trip } }),
    { status: 200 },
  );
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};
it("actual tracking panel counts real local elapsed seconds, preserves server timestamps and does not invent a new GPS observation", async () => {
  const before = JSON.stringify(initial);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("offline");
    }),
  );
  await mount();
  await act(async () => vi.advanceTimersByTimeAsync(55000));
  expect(snapshot().localAgeSeconds).toBe(57);
  expect(host!.textContent).toContain("（57 秒前）");
  expect(snapshot().tracking.observedAt).toBe(
    initial!.liveTracking!.observedAt,
  );
  expect(JSON.stringify(initial)).toBe(before);
});
it("ignores an aborted older active=false reply after the replacement read restores the same order", async () => {
  const resolve: Array<(reply: Response) => void> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise<Response>((yes) => resolve.push(yes))),
  );
  await mount();
  await click();
  await click();
  expect(resolve).toHaveLength(2);
  const fresh = structuredClone(initial)!;
  fresh.liveTracking!.pickupEta!.minutes = 7;
  await act(async () => {
    resolve[1]!(envelope(fresh));
    await flush();
  });
  expect(snapshot().minutes).toBe(7);
  await act(async () => {
    resolve[0]!(envelope(null));
    await flush();
  });
  expect(snapshot().orderId).toBe("same-original-order");
  expect(snapshot().minutes).toBe(7);
  expect(snapshot().ended).toBe(false);
});
it("ignores a late old error and old finally while a replacement read is still pending", async () => {
  const rejects: Array<(error: Error) => void> = [],
    resolve: Array<(reply: Response) => void> = [];
  const fetch = vi.fn(
    () =>
      new Promise<Response>((yes, no) => {
        resolve.push(yes);
        rejects.push(no);
      }),
  );
  vi.stubGlobal("fetch", fetch);
  await mount();
  await click();
  await click();
  await act(async () => {
    rejects[0]!(new Error("old read failed late"));
    await flush();
  });
  await act(async () => vi.advanceTimersByTimeAsync(5000));
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(snapshot().error).toBe(false);
  await act(async () => {
    resolve[1]!(envelope(initial));
    await flush();
  });
  expect(snapshot().error).toBe(false);
  expect(snapshot().minutes).toBe(3);
});
it("an explicit abort can recover through the same read without an automatic new deadline or overlapping poll", async () => {
  let first: AbortSignal | undefined;
  const fetch = vi.fn((_input, init) => {
    if (!first)
      return new Promise<Response>((_yes, no) => {
        first = init.signal;
        first!.addEventListener("abort", () => no(new Error("aborted")), {
          once: true,
        });
      });
    return Promise.resolve(envelope(initial));
  });
  vi.stubGlobal("fetch", fetch);
  await mount();
  await click();
  await act(async () => vi.advanceTimersByTimeAsync(10000));
  expect(fetch).toHaveBeenCalledTimes(1);
  await click();
  expect(first!.aborted).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(snapshot().orderId).toBe("same-original-order");
  expect(snapshot().error).toBe(false);
});
it("unmount aborts the current read, removes its visibility handler and stops the original poll clock", async () => {
  let signal: AbortSignal | undefined;
  const add = vi.spyOn(document, "addEventListener"),
    remove = vi.spyOn(document, "removeEventListener");
  const fetch = vi.fn(
    (_input, init) =>
      new Promise((_yes, no) => {
        signal = init.signal;
        signal!.addEventListener("abort", () => no(new Error("aborted")), {
          once: true,
        });
      }),
  );
  vi.stubGlobal("fetch", fetch);
  await mount();
  await click();
  const handler = add.mock.calls.find(
    (row) => row[0] === "visibilitychange",
  )![1];
  await act(async () => root!.unmount());
  root = undefined;
  expect(signal!.aborted).toBe(true);
  expect(
    remove.mock.calls.some(
      (row) => row[0] === "visibilitychange" && row[1] === handler,
    ),
  ).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
  await act(async () => vi.advanceTimersByTimeAsync(20000));
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("a genuinely ended current read keeps the existing history transition and stops polling", async () => {
  const fetch = vi.fn(async () => envelope(null));
  vi.stubGlobal("fetch", fetch);
  await mount();
  await click();
  expect(snapshot().ended).toBe(true);
  expect(snapshot().orderId).toBeUndefined();
  await act(async () => vi.advanceTimersByTimeAsync(15000));
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("same-order server props replace an old read without reviving its older ETA", async () => {
  const resolves: Array<(reply: Response) => void> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise<Response>((yes) => resolves.push(yes))),
  );
  await mount();
  await click();
  const next = structuredClone(initial)!;
  next.liveTracking!.pickupEta!.minutes = 6;
  await act(async () => root!.render(<Probe seed={next} />));
  expect(snapshot().minutes).toBe(6);
  await act(async () => {
    resolves[0]!(envelope(initial));
    await flush();
  });
  expect(snapshot().minutes).toBe(6);
  expect(snapshot().orderId).toBe(initial!.orderId);
});
it("a new requested order is not cleared by the previous order's late response", async () => {
  const resolves: Array<(reply: Response) => void> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise<Response>((yes) => resolves.push(yes))),
  );
  await mount();
  await click();
  const next = structuredClone(initial)!;
  next.orderId = "next-original-order";
  await act(async () => root!.render(<Probe seed={next} />));
  await act(async () => {
    resolves[0]!(envelope(null));
    await flush();
  });
  expect(snapshot().orderId).toBe("next-original-order");
  expect(snapshot().ended).toBe(false);
});
it("ages an existing provider query independently from a newer retained GPS point using the same60-second source window", async () => {
  const next = structuredClone(initial)!;
  next.status = "on_trip";
  next.liveTracking!.pickupEta = null;
  next.liveTracking!.dropoffRoute = {
    remainingDistanceMeters: 4200,
    remainingDurationSeconds: 720,
    generatedAt: new Date(epoch - 55000).toISOString(),
    estimatedArrivalAt: new Date(epoch + 665000).toISOString(),
    provider: "SIM-original-provider-port",
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("offline");
    }),
  );
  await mount(next);
  expect(snapshot().minutes).toBe(12);
  expect(host!.textContent).toContain("4.2 公里");
  await act(async () => vi.advanceTimersByTimeAsync(5000));
  expect(snapshot().tracking.locationFreshness).toBe("fresh");
  expect(snapshot().minutes).toBeNull();
  expect(snapshot().arrival).toBe("unknown");
  expect(snapshot().tracking.location.recordedAt).toBe(
    next.liveTracking!.location!.recordedAt,
  );
  expect(host!.textContent).not.toContain("4.2 公里");
});
