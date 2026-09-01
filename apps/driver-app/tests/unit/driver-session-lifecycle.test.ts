import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  bumpDriverSessionEpoch,
  getDriverSessionEpoch,
  getDriverSessionSnapshot,
  getDriverSessionState,
  isDriverSessionSignedOut,
  markDriverSessionSignedIn,
  markDriverSessionSignedOut,
  resetDriverSessionLifecycleForTests,
  setDriverSessionState,
  subscribeDriverSession,
} from "../../lib/driver-session-lifecycle";

describe("driver session lifecycle", () => {
  beforeEach(() => {
    resetDriverSessionLifecycleForTests();
  });

  describe("initial state", () => {
    it("starts unknown at epoch 0 so a cold start blocks nothing", () => {
      expect(getDriverSessionSnapshot()).toEqual({
        state: "unknown",
        epoch: 0,
      });
      expect(getDriverSessionState()).toBe("unknown");
      expect(isDriverSessionSignedOut()).toBe(false);
    });
  });

  describe("epoch", () => {
    it("increments on sign-in and again on sign-out", () => {
      markDriverSessionSignedIn();
      expect(getDriverSessionEpoch()).toBe(1);
      expect(getDriverSessionState()).toBe("signed_in");

      markDriverSessionSignedOut();
      expect(getDriverSessionEpoch()).toBe(2);
      expect(getDriverSessionState()).toBe("signed_out");
      expect(isDriverSessionSignedOut()).toBe(true);
    });

    it("increments on an explicit bump without changing the state", () => {
      markDriverSessionSignedIn();
      const epoch = bumpDriverSessionEpoch();

      expect(epoch).toBe(2);
      expect(getDriverSessionState()).toBe("signed_in");
    });

    it("keeps growing across a logout / re-login cycle", () => {
      markDriverSessionSignedIn();
      markDriverSessionSignedOut();
      markDriverSessionSignedIn();

      expect(getDriverSessionEpoch()).toBe(3);
      expect(getDriverSessionState()).toBe("signed_in");
    });
  });

  describe("listeners", () => {
    it("delivers the new snapshot on sign-out and on sign-in", () => {
      const listener = vi.fn();
      subscribeDriverSession(listener);

      markDriverSessionSignedIn();
      markDriverSessionSignedOut();

      expect(listener).toHaveBeenCalledTimes(2);
      expect(listener.mock.calls[0][0]).toEqual({
        state: "signed_in",
        epoch: 1,
      });
      expect(listener.mock.calls[1][0]).toEqual({
        state: "signed_out",
        epoch: 2,
      });
    });

    it("does not re-broadcast a repeated logout", () => {
      const listener = vi.fn();
      subscribeDriverSession(listener);

      markDriverSessionSignedIn();
      markDriverSessionSignedOut();
      markDriverSessionSignedOut();
      markDriverSessionSignedOut();

      expect(listener).toHaveBeenCalledTimes(2);
      expect(getDriverSessionEpoch()).toBe(2);
    });

    it("does not re-broadcast a repeated sign-in", () => {
      const listener = vi.fn();
      subscribeDriverSession(listener);

      markDriverSessionSignedIn();
      markDriverSessionSignedIn();

      expect(listener).toHaveBeenCalledTimes(1);
      expect(getDriverSessionEpoch()).toBe(1);
    });

    it("stops delivering after unsubscribe", () => {
      const listener = vi.fn();
      const unsubscribe = subscribeDriverSession(listener);

      markDriverSessionSignedIn();
      unsubscribe();
      markDriverSessionSignedOut();

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("keeps notifying the remaining listeners when one throws", () => {
      const healthy = vi.fn();
      subscribeDriverSession(() => {
        throw new Error("listener blew up");
      });
      subscribeDriverSession(healthy);

      expect(() => markDriverSessionSignedOut()).not.toThrow();
      expect(healthy).toHaveBeenCalledTimes(1);
    });

    it("survives a listener unsubscribing itself mid-broadcast", () => {
      const later = vi.fn();
      const unsubscribeSelf = subscribeDriverSession(() => {
        unsubscribeSelf();
      });
      subscribeDriverSession(later);

      expect(() => markDriverSessionSignedOut()).not.toThrow();
      expect(later).toHaveBeenCalledTimes(1);
    });
  });

  describe("setDriverSessionState", () => {
    it("can move back to unknown and reports the resulting epoch", () => {
      markDriverSessionSignedIn();
      expect(setDriverSessionState("unknown")).toBe(2);
      expect(getDriverSessionState()).toBe("unknown");
      expect(isDriverSessionSignedOut()).toBe(false);
    });

    it("returns the current epoch untouched for a no-op transition", () => {
      markDriverSessionSignedOut();
      expect(setDriverSessionState("signed_out")).toBe(1);
    });
  });
});
