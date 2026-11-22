import { beforeEach, describe, expect, it, vi } from "vitest";

import { redirectSystemPath } from "../../app/+native-intent";
import {
  subscribeToDriverActivation,
  takeDriverActivationToken,
} from "../../lib/driver-activation-link";

const origin = "https://api.smarttransport.tw";
const path = "/driver-activate";
const token = "Wnz37BU1-I3JaaQrSBWB0MChBq0Q-PPJgElR8L6b618";

describe("native driver approval deep link", () => {
  beforeEach(() => {
    takeDriverActivationToken();
  });

  it("strips the credential from cold-launch router state and transfers it once", () => {
    const route = redirectSystemPath({
      path: origin + path + "#token=" + token,
      initial: true,
    });

    expect(route).toBe(path);
    expect(takeDriverActivationToken()).toBe(token);
    expect(takeDriverActivationToken()).toBeNull();
  });

  it("notifies a focused activation route about a warm link", () => {
    const listener = vi.fn(takeDriverActivationToken);
    const unsubscribe = subscribeToDriverActivation(listener);
    try {
      redirectSystemPath({
        path: origin + path + "#token=" + token,
        initial: false,
      });
      expect(listener).toHaveReturnedWith(token);
      expect(takeDriverActivationToken()).toBeNull();
    } finally {
      unsubscribe();
    }
  });

  it.each([
    origin + path + "?token=" + token,
    origin + path + "#token=012345",
    origin + path + "#token=" + token + "&token=" + token,
    "https://api.smarttransport.tw.example.org" + path + "#token=" + token,
    "https://api.smarttransport.tw@" + "example.org" + path + "#token=" + token,
    "http://api.smarttransport.tw" + path + "#token=" + token,
    "drts-driver://" + path + "#token=" + token,
  ])("never stages unverified, query, short, or ambiguous proofs", (url) => {
    redirectSystemPath({ path: url, initial: true });
    expect(takeDriverActivationToken()).toBeNull();
  });

  it("keeps unrelated links and routes intact", () => {
    const link = "drts-driver://trip?taskId=task-1";
    expect(redirectSystemPath({ path: link, initial: false })).toBe(link);
  });
});
