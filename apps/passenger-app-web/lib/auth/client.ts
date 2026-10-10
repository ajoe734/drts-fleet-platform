import { PassengerClient } from "@drts/passenger-client";
import * as AuthTypes from "./types";

export class PassengerAuthClient {
  constructor(public base: PassengerClient) {}

  private async request<T>(path: string, options?: any): Promise<T> {
    return (this.base as any).request(path, options);
  }

  async requestOtp(
    command: AuthTypes.RequestOtpCommand,
  ): Promise<AuthTypes.RequestOtpResponse> {
    const snakeCommand: any = {};
    for (const [key, value] of Object.entries(command)) {
      const snakeKey = key.replace(
        /[A-Z]/g,
        (letter) => `_${letter.toLowerCase()}`,
      );
      snakeCommand[snakeKey] = value;
    }
    return this.request<AuthTypes.RequestOtpResponse>(
      "/api/passenger-app/auth/otp/request",
      {
        method: "POST",
        body: JSON.stringify(snakeCommand),
      },
    );
  }

  async oauthStart(
    command: AuthTypes.OAuthStartCommand,
  ): Promise<AuthTypes.OAuthStartResponse> {
    const { provider, ...restCommand } = command;
    return this.request<AuthTypes.OAuthStartResponse>(
      `/api/passenger-app/auth/oauth/${provider}/start`,
      {
        method: "POST",
        body: JSON.stringify(restCommand),
      },
    );
  }

  async oauthCallback(
    provider: string,
    command: { code: string; state: string; transactionId: string },
  ): Promise<import("@drts/passenger-client").VerifyOtpResponse> {
    const res = await this.request<
      import("@drts/passenger-client").VerifyOtpResponse
    >(`/api/passenger-app/auth/oauth/${provider}/callback`, {
      method: "POST",
      body: JSON.stringify(command),
    });
    if ((res as any).result === "logged_in") {
      try {
        const account = await this.base.getAccount();
        if (account) {
          this.base.sessionStatus.isActive = true;
          this.base.sessionStatus.account = account;
        }
      } catch {
        this.base.sessionStatus.isActive = false;
        delete this.base.sessionStatus.account;
      }
    }
    return res;
  }

  async updateAccount(
    command: AuthTypes.UpdatePassengerMeCommand,
  ): Promise<void> {
    const snakeCommand: any = {};
    for (const [key, value] of Object.entries(command)) {
      const snakeKey = key.replace(
        /[A-Z]/g,
        (letter) => `_${letter.toLowerCase()}`,
      );
      snakeCommand[snakeKey] = value;
    }
    await this.request<void>("/api/passenger-app/me", {
      method: "PATCH",
      body: JSON.stringify(snakeCommand),
    });
  }

  async getIdentities(): Promise<AuthTypes.PassengerIdentitiesResponse> {
    return this.request<AuthTypes.PassengerIdentitiesResponse>(
      "/api/passenger-app/me/identities",
    );
  }

  async unlinkIdentity(
    command: AuthTypes.UnlinkPassengerIdentityCommand,
  ): Promise<AuthTypes.UnlinkPassengerIdentityResponse> {
    return this.request<AuthTypes.UnlinkPassengerIdentityResponse>(
      `/api/passenger-app/me/identities/${command.identityId}`,
      {
        method: "DELETE",
      },
    );
  }

  async deleteAccount(): Promise<AuthTypes.DeletePassengerAccountResponse> {
    return this.request<AuthTypes.DeletePassengerAccountResponse>(
      `/api/passenger-app/me`,
      {
        method: "DELETE",
      },
    );
  }

  async getAccount() {
    return this.base.getAccount();
  }
  async getProviders() {
    return this.base.getProviders();
  }
  async login(request: import("@drts/passenger-client").VerifyOtpCommand) {
    return this.base.login(request);
  }
  async logout() {
    return this.base.logout();
  }
}
