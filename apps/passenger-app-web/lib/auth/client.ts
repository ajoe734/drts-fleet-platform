import { PassengerAuthClient } from "../../../../packages/passenger-client/src/auth/index";
export {
  PassengerAuthClient,
  PassengerAuthError,
} from "../../../../packages/passenger-client/src/auth/index";

export const client = new PassengerAuthClient({
  baseUrl: "",
  fetchFn: (url, options) => fetch(url, options),
});
