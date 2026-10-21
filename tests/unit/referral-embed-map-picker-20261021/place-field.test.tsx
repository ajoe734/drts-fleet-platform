// @vitest-environment jsdom
import React, { useState } from "react";
import { flushSync } from "react-dom";
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "../referral-cancellation-window-canonical-20261020/mounted-dom";
import { ReferralPlaceField } from "../../../apps/referral-embed-web/components/referral-place-field";
import { buildEmbedTheme } from "../../../apps/referral-embed-web/lib/embed-presentation";

/** React's onChange listens for native input events on the element. */
function typeInto(input: HTMLElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!;
  flushSync(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function Field(props: {
  allowCurrentLocation?: boolean;
  mapEnabled?: boolean;
  onValue?: (value: string) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <ReferralPlaceField
      theme={buildEmbedTheme("#123456")}
      label="上車地點"
      name="pickupAddress"
      icon={null}
      value={value}
      onChange={(next) => {
        setValue(next);
        props.onValue?.(next);
      }}
      allowCurrentLocation={props.allowCurrentLocation}
      mapConfig={{
        enabled: props.mapEnabled ?? false,
        browserKey: props.mapEnabled ? "key" : null,
      }}
    />
  );
}

it("suggests addresses while typing and fills the chosen one", async () => {
  const fetchMock = vi.fn(async () =>
    Response.json({
      ok: true,
      data: {
        candidates: [
          {
            candidateId: "c1",
            displayName: "臺北市政府",
            address: "臺北市信義區市府路1號",
            location: { lat: 25.0375, lng: 121.5637 },
          },
        ],
      },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const onValue = vi.fn();
  render(<Field onValue={onValue} />);
  typeInto(screen.getByLabelText("上車地點"), "市府");
  const option = await screen.findByText("臺北市政府");
  expect(String(fetchMock.mock.calls[0]![0])).toContain(
    "/api/referral/geo/search?q=%E5%B8%82%E5%BA%9C",
  );
  fireEvent.click(option);
  expect(onValue).toHaveBeenLastCalledWith("臺北市信義區市府路1號");
  expect((screen.getByLabelText("上車地點") as HTMLInputElement).value).toBe(
    "臺北市信義區市府路1號",
  );
  expect(screen.queryByText("臺北市政府")).toBeNull();
});

it("fills the address at the device location", async () => {
  const fetchMock = vi.fn(async () =>
    Response.json({
      ok: true,
      data: { address: { address: "新北市板橋區縣民大道二段7號" } },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("navigator", {
    ...navigator,
    geolocation: {
      getCurrentPosition: (success: (position: unknown) => void) =>
        success({ coords: { latitude: 25.0142, longitude: 121.4636 } }),
    },
  });
  const onValue = vi.fn();
  render(<Field allowCurrentLocation onValue={onValue} />);
  fireEvent.click(screen.getByText("使用目前位置"));
  await waitFor(() =>
    expect(onValue).toHaveBeenLastCalledWith("新北市板橋區縣民大道二段7號"),
  );
  const [url, init] = fetchMock.mock.calls[0] as unknown as [
    string,
    RequestInit,
  ];
  expect(url).toBe("/api/referral/geo/reverse");
  expect(JSON.parse(String(init.body))).toEqual({
    lat: 25.0142,
    lng: 121.4636,
  });
});

it("offers the map only when it is available for this page", () => {
  vi.stubGlobal("fetch", vi.fn());
  render(<Field />);
  expect(screen.queryByText("在地圖上選擇")).toBeNull();
  expect(screen.queryByText("使用目前位置")).toBeNull();
  cleanup();
  render(<Field mapEnabled />);
  expect(screen.getByText("在地圖上選擇")).toBeTruthy();
});
