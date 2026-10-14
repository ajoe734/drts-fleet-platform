import type { NativePassengerAppStatePort } from "../../../../packages/passenger-client/src/native/ride-stream.js";

/** The App passes its pinned React Native AppState; this adapter creates no runtime. */
export function createNativePassengerAppStatePort(appState: {
  currentState: string | null;
  addEventListener(
    event: "change",
    listener: (state: string) => void,
  ): { remove(): void };
}): NativePassengerAppStatePort {
  return {
    currentState: () => appState.currentState ?? "unknown",
    subscribe(listener) {
      const subscription = appState.addEventListener("change", listener);
      return () => subscription.remove();
    },
  };
}
