import type { NativeP5ScreenProps } from "./native-p5-screen";

/** Browser builds retain the existing position diagram and do not import native maps. */
export function createNativePassengerRideMap(): NativeP5ScreenProps["renderMap"] {
  return undefined;
}
