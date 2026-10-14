import type { PassengerAccount } from "@drts/contracts";
import type { PassengerClientOptions } from "../client.js";
import { PassengerApiError } from "../auth/errors.js";
import { PassengerBookingClient } from "../booking/client.js";

/** Observe actual formal producer results; never replace booking/guards/recovery. */
export class PaymentAwareBookingClient extends PassengerBookingClient {
  constructor(
    options: PassengerClientOptions,
    private readonly observers: {
      account: (account: PassengerAccount) => void;
      unpaid: () => void;
      unauthorized: () => void;
    },
  ) {
    super(options);
  }
  override async getAccount() {
    const response = await super.getAccount();
    this.observers.account(response.account);
    return response;
  }
  override async createRide(
    ...args: Parameters<PassengerBookingClient["createRide"]>
  ) {
    try {
      return await super.createRide(...args);
    } catch (reason) {
      if (reason instanceof PassengerApiError) {
        if (reason.status === 401) this.observers.unauthorized();
        else if (
          reason.status >= 400 &&
          reason.status < 500 &&
          reason.code.toLowerCase() === "pending_payment_block"
        )
          this.observers.unpaid();
      }
      throw reason;
    }
  }
}
