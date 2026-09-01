/**
 * Driver session lifecycle broadcaster.
 *
 * Screens keep long-lived timers and listeners alive while their tab stays
 * mounted (bottom tabs never unmount once focused). Without a shared signal,
 * those closures keep the identity snapshot captured at login and keep calling
 * the API after logout, which surfaces as an unhandled promise rejection.
 *
 * This module owns a single monotonically increasing "session epoch". Every
 * sign-in / sign-out bumps the epoch, so effects can list it as a dependency
 * and be torn down + rebuilt at the right moment.
 *
 * Intentionally free of React Native, Expo and api-client imports so it stays
 * unit-testable and cannot create an import cycle.
 */

import { useSyncExternalStore } from "react";

export type DriverSessionState = "unknown" | "signed_in" | "signed_out";

export type DriverSessionSnapshot = {
  state: DriverSessionState;
  epoch: number;
};

export type DriverSessionListener = (snapshot: DriverSessionSnapshot) => void;

let snapshot: DriverSessionSnapshot = { state: "unknown", epoch: 0 };
const listeners = new Set<DriverSessionListener>();

function publish(next: DriverSessionSnapshot): void {
  snapshot = next;
  for (const listener of [...listeners]) {
    try {
      listener(snapshot);
    } catch {
      // A misbehaving listener must never break session propagation for the
      // remaining subscribers, and must never surface to the driver.
    }
  }
}

export function getDriverSessionSnapshot(): DriverSessionSnapshot {
  return snapshot;
}

export function getDriverSessionEpoch(): number {
  return snapshot.epoch;
}

export function getDriverSessionState(): DriverSessionState {
  return snapshot.state;
}

/**
 * True only when the session is known to be gone. `unknown` (before identity
 * hydration finishes) deliberately does not block callers.
 */
export function isDriverSessionSignedOut(): boolean {
  return snapshot.state === "signed_out";
}

/** Forces a new epoch without changing the reported state. */
export function bumpDriverSessionEpoch(): number {
  publish({ state: snapshot.state, epoch: snapshot.epoch + 1 });
  return snapshot.epoch;
}

/**
 * Records the next session state. Repeating the current state is a no-op, so a
 * second logout does not re-broadcast or re-bump the epoch.
 */
export function setDriverSessionState(next: DriverSessionState): number {
  if (next === snapshot.state) {
    return snapshot.epoch;
  }

  publish({ state: next, epoch: snapshot.epoch + 1 });
  return snapshot.epoch;
}

export function markDriverSessionSignedIn(): number {
  return setDriverSessionState("signed_in");
}

export function markDriverSessionSignedOut(): number {
  return setDriverSessionState("signed_out");
}

export function subscribeDriverSession(
  listener: DriverSessionListener,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function subscribe(onStoreChange: () => void): () => void {
  return subscribeDriverSession(() => onStoreChange());
}

/** React binding: re-renders whenever the driver signs in or out. */
export function useDriverSession(): DriverSessionSnapshot {
  return useSyncExternalStore(
    subscribe,
    getDriverSessionSnapshot,
    getDriverSessionSnapshot,
  );
}

/** React binding for effect dependency lists. */
export function useDriverSessionEpoch(): number {
  return useSyncExternalStore(
    subscribe,
    getDriverSessionEpoch,
    getDriverSessionEpoch,
  );
}

/** Test-only helper; production code never resets the lifecycle. */
export function resetDriverSessionLifecycleForTests(): void {
  listeners.clear();
  snapshot = { state: "unknown", epoch: 0 };
}
