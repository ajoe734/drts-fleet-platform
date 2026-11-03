// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";

type Loader =
  typeof import("../../../apps/passenger-app-web/lib/map/google-maps-loader");
let loader: Loader;
const scripts = () =>
  [...document.head.querySelectorAll("script")].filter((script) =>
    script.src.startsWith("https://maps.googleapis.com/maps/api/js?"),
  );

beforeEach(async () => {
  vi.resetModules();
  loader =
    await import("../../../apps/passenger-app-web/lib/map/google-maps-loader");
});
afterEach(() => {
  for (const script of scripts()) script.remove();
  Reflect.deleteProperty(window, "google");
});

it("injects the official script once with the browser key and resolves on its callback", async () => {
  const first = loader.loadGoogleMaps("browser-key");
  const second = loader.loadGoogleMaps("browser-key");
  expect(second).toBe(first);
  expect(scripts()).toHaveLength(1);
  const url = new URL(scripts()[0]!.src);
  expect(Object.fromEntries(url.searchParams)).toEqual({
    key: "browser-key",
    v: "weekly",
    language: "zh-TW",
    region: "TW",
    callback: "__drtsPassengerMapsReady",
  });
  const maps = { Map: class {} };
  Object.assign(window, { google: { maps } });
  (
    window as unknown as { __drtsPassengerMapsReady: () => void }
  ).__drtsPassengerMapsReady();
  await expect(first).resolves.toBe(maps);
});

it("reports a rejected key to every listener and remembers it", async () => {
  void loader.loadGoogleMaps("browser-key");
  const listener = vi.fn();
  const unsubscribe = loader.onGoogleMapsAuthFailure(listener);
  expect(loader.googleMapsAuthFailed()).toBe(false);
  (window as unknown as { gm_authFailure: () => void }).gm_authFailure();
  expect(listener).toHaveBeenCalledOnce();
  expect(loader.googleMapsAuthFailed()).toBe(true);
  unsubscribe();
});

it("rejects and allows a retry when the script cannot load", async () => {
  const failed = loader.loadGoogleMaps("browser-key");
  scripts()[0]!.onerror?.(new Event("error"));
  await expect(failed).rejects.toThrow("GOOGLE_MAPS_SCRIPT_FAILED");
  expect(loader.loadGoogleMaps("browser-key")).not.toBe(failed);
});
