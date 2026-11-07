// @vitest-environment jsdom
import React, { useState } from "react";
import { flushSync } from "react-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "../referral-cancellation-window-canonical-20261020/mounted-dom";
import { ReferralPlaceField } from "../../../apps/referral-embed-web/components/referral-place-field";
import { buildEmbedTheme } from "../../../apps/referral-embed-web/lib/embed-presentation";

const mapIO = vi.hoisted(() => ({
  click: null as
    | ((event: { latLng: { lat(): number; lng(): number } }) => void)
    | null,
}));

// Only the unavailable external map and device IO are controlled. The field,
// its React effects, input events, and asynchronous address choices are real.
vi.mock("../../../apps/referral-embed-web/lib/google-maps-loader", () => ({
  googleMapsAuthFailed: () => false,
  onGoogleMapsAuthFailure: () => () => {},
  loadGoogleMaps: async () => ({
    Map: class {
      addListener(event: string, callback: typeof mapIO.click) {
        if (event === "click") mapIO.click = callback;
      }
      panTo() {}
    },
    Marker: class {
      setPosition() {}
      addListener() {}
    },
  }),
}));

type PositionSuccess = (position: {
  coords: { latitude: number; longitude: number };
}) => void;
type GeoFetch = (url: string, init?: RequestInit) => Promise<Response>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function addressResponse(address: string) {
  return Response.json({ ok: true, data: { address: { address } } });
}

function Field({ disabled = false }: { disabled?: boolean }) {
  const [value, setValue] = useState("");
  return (
    <ReferralPlaceField
      theme={buildEmbedTheme("#123456")}
      label="上車地點"
      name="pickupAddress"
      icon={null}
      value={value}
      onChange={setValue}
      disabled={disabled}
      allowCurrentLocation
      mapConfig={{ enabled: true, browserKey: "controlled-map-key" }}
    />
  );
}

function input() {
  return screen.getByLabelText("上車地點") as HTMLInputElement;
}

function typeAddress(value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!;
  flushSync(() => {
    setter.call(input(), value);
    input().dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function openMap() {
  fireEvent.click(screen.getByText("在地圖上選擇"));
  await waitFor(() => expect(mapIO.click).not.toBeNull());
}

function pick(lat: number, lng: number) {
  flushSync(() => {
    mapIO.click!({ latLng: { lat: () => lat, lng: () => lng } });
  });
}

beforeEach(() => {
  mapIO.click = null;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("keeps a newer typed pickup when the older device location arrives", async () => {
  let success!: PositionSuccess;
  vi.stubGlobal("navigator", {
    geolocation: {
      getCurrentPosition(callback: PositionSuccess) {
        success = callback;
      },
    },
  });
  const fetchMock = vi.fn<GeoFetch>(async () =>
    addressResponse("較早的裝置定位地址"),
  );
  vi.stubGlobal("fetch", fetchMock);
  render(<Field />);
  fireEvent.click(screen.getByText("使用目前位置"));
  typeAddress("新北市板橋區新的上車地址");
  await act(async () => {
    success({ coords: { latitude: 25.0142, longitude: 121.4636 } });
  });
  expect(input().value).toBe("新北市板橋區新的上車地址");
  expect(fetchMock).not.toHaveBeenCalled();
});

it("keeps a newer typed pickup when an older reverse lookup finishes", async () => {
  const oldLookup = deferred<Response>();
  vi.stubGlobal("navigator", {
    geolocation: {
      getCurrentPosition(success: PositionSuccess) {
        success({ coords: { latitude: 25.0142, longitude: 121.4636 } });
      },
    },
  });
  const fetchMock = vi.fn<GeoFetch>(() => oldLookup.promise);
  vi.stubGlobal("fetch", fetchMock);
  render(<Field />);
  fireEvent.click(screen.getByText("使用目前位置"));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  typeAddress("乘客重新輸入的上車地點");
  await act(async () => oldLookup.resolve(addressResponse("過時的定位地址")));
  expect(input().value).toBe("乘客重新輸入的上車地點");
});

it("keeps the latest map point when two reverse lookups finish out of order", async () => {
  const first = deferred<Response>();
  const second = deferred<Response>();
  const fetchMock = vi
    .fn<GeoFetch>()
    .mockImplementationOnce(() => first.promise)
    .mockImplementationOnce(() => second.promise);
  vi.stubGlobal("fetch", fetchMock);
  render(<Field />);
  await openMap();
  pick(25.01, 121.46);
  pick(25.02, 121.47);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(JSON.parse(String(fetchMock.mock.calls[1]![1]?.body))).toEqual({
    lat: 25.02,
    lng: 121.47,
  });
  await act(async () => second.resolve(addressResponse("最後選取的地點")));
  expect(input().value).toBe("最後選取的地點");
  await act(async () => first.resolve(addressResponse("先前選取的地點")));
  expect(input().value).toBe("最後選取的地點");
});

it("keeps the latest lookup busy without surfacing an older lookup failure", async () => {
  const first = deferred<Response>();
  const second = deferred<Response>();
  vi.stubGlobal(
    "fetch",
    vi
      .fn<GeoFetch>()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise),
  );
  render(<Field />);
  await openMap();
  pick(25.01, 121.46);
  pick(25.02, 121.47);
  await act(async () => first.reject(new Error("controlled old geo failure")));
  expect((screen.getByText("使用目前位置") as HTMLButtonElement).disabled).toBe(
    true,
  );
  expect(screen.queryByRole("status")).toBeNull();
  await act(async () => second.resolve(addressResponse("最新有效地點")));
  expect(input().value).toBe("最新有效地點");
  expect((screen.getByText("使用目前位置") as HTMLButtonElement).disabled).toBe(
    false,
  );
});

it("does not change a disabled booking field through an already open map", async () => {
  const fetchMock = vi.fn<GeoFetch>(async () =>
    addressResponse("不應套用的地點"),
  );
  vi.stubGlobal("fetch", fetchMock);
  const view = render(<Field />);
  await openMap();
  view.rerender(<Field disabled />);
  await act(async () => pick(25.01, 121.46));
  expect(input().disabled).toBe(true);
  expect(input().value).toBe("");
  expect(fetchMock).not.toHaveBeenCalled();
});

it("keeps the submitted value frozen when a lookup finishes after disabling", async () => {
  const lookup = deferred<Response>();
  vi.stubGlobal(
    "fetch",
    vi.fn<GeoFetch>(() => lookup.promise),
  );
  const view = render(<Field />);
  await openMap();
  pick(25.01, 121.46);
  view.rerender(<Field disabled />);
  await act(async () => lookup.resolve(addressResponse("延遲的定位結果")));
  expect(input().disabled).toBe(true);
  expect(input().value).toBe("");
});
