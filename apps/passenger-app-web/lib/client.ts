import { PassengerClient } from "@drts/passenger-client";
export const passengerClient = new PassengerClient({
  baseUrl: "",
  fetchFn: (...args: Parameters<typeof fetch>) => fetch(...args),
});
