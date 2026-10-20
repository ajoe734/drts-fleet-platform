import { PassengerClient } from "@drts/passenger-client";
import { passengerFetch } from "./runtime-fetch";

export const passengerClient = new PassengerClient({
  baseUrl: "",
  fetchFn: passengerFetch,
});
