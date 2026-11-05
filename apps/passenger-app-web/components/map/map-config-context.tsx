"use client";

import { createContext, useContext, type ReactNode } from "react";
import {
  DISABLED_PASSENGER_MAP_CONFIG,
  type PassengerMapConfig,
} from "../../lib/map/map-config";

// Without a provider (tests, isolated renders) the pages keep the built-in
// schematic map and address grid.
const PassengerMapConfigContext = createContext<PassengerMapConfig>(
  DISABLED_PASSENGER_MAP_CONFIG,
);

/** Hands the server-gated Google map config to the ride and booking maps. */
export function PassengerMapConfigProvider({
  config,
  children,
}: {
  config: PassengerMapConfig;
  children: ReactNode;
}) {
  return (
    <PassengerMapConfigContext.Provider value={config}>
      {children}
    </PassengerMapConfigContext.Provider>
  );
}

export function usePassengerMapConfig(): PassengerMapConfig {
  return useContext(PassengerMapConfigContext);
}
