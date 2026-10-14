import { passengerFetch } from "../runtime-fetch";
import { PassengerClient } from "@drts/passenger-client";

/** Compatibility facade; all formal commands now live in the shared client. */
export class PassengerAuthClient {
  constructor(public base: PassengerClient) {}
  requestOtp: PassengerClient["requestOtp"] = (command) =>
    this.base.requestOtp(command);
  oauthStart: PassengerClient["oauthStart"] = (command) =>
    this.base.oauthStart(command);
  oauthCallback: PassengerClient["oauthCallback"] = (provider, command) =>
    this.base.oauthCallback(provider, command);
  updateAccount: PassengerClient["updateAccount"] = (command) =>
    this.base.updateAccount(command);
  getIdentities = () => this.base.getIdentities();
  unlinkIdentity: PassengerClient["unlinkIdentity"] = (command) =>
    this.base.unlinkIdentity(command);
  deleteAccount = () => this.base.deleteAccount();
  getAccount = () => this.base.getAccount();
  getProviders = () => this.base.getProviders();
  login: PassengerClient["login"] = (command) => this.base.login(command);
  logout = () => this.base.logout();
}

export function createAuthClient() {
  return new PassengerAuthClient(
    new PassengerClient({
      baseUrl: "",
      fetchFn: passengerFetch,
    }),
  );
}
