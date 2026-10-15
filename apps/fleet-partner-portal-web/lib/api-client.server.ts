// App-local transport: preserve the shared SDK's endpoint methods and wire
// normalization without its legacy Fleet factory's generated x-realm header.
import "server-only";

import {
  ApiClient,
  createRequestToken,
  type RequestOptions,
} from "@drts/api-client";
import type { ApiSuccessEnvelope } from "@drts/contracts";
import { headers as nextHeaders } from "next/headers";
import {
  fleetApiUrl,
  readFleetResponse,
  resolveFleetPrincipal,
} from "./fleet-principal.server";

type ListEnvelope<T> = { items: T[] };

/** Only HTTP dispatch is local. Inherited SDK endpoint methods, list handling,
 * command bodies and errors keep the accepted API contract. */
class FleetPortalApiClient extends ApiClient {
  private async dispatch<T>(
    method: string,
    path: string,
    options?: RequestOptions,
  ): Promise<ApiSuccessEnvelope<T>> {
    const headers = new Headers(this.defaultHeaders);
    new Headers(options?.headers).forEach((value, key) =>
      headers.set(key, value),
    );
    // Identity/scope cannot be replaced by endpoint-specific options.
    for (const key of [
      "authorization",
      "x-serverless-authorization",
      "x-fleet-partner-id",
    ]) {
      const value = this.defaultHeaders[key];
      if (value) headers.set(key, value);
      else headers.delete(key);
    }
    for (const key of [
      "x-actor-id",
      "x-actor-type",
      "x-realm",
      "x-scopes",
      "x-roles",
      "x-role-families",
      "x-auth-mode",
      "x-partner-id",
      "x-partner-program-id",
      "x-partner-entry-slug",
      "x-tenant-id",
      "x-session-id",
      "x-auth-time",
      "x-amr",
      "x-drts-authorization",
      "x-goog-iap-jwt-assertion",
    ])
      headers.delete(key);
    if (!headers.has("x-request-id"))
      headers.set("x-request-id", createRequestToken());
    if (options?.idempotencyKey && !headers.has("idempotency-key"))
      headers.set("idempotency-key", options.idempotencyKey);
    const target = new URL(path, this.baseUrl);
    if (target.origin !== new URL(this.baseUrl).origin)
      throw new Error(
        "Fleet API requests must target the configured API origin.",
      );
    const timeout = AbortSignal.timeout(this.timeout);
    const response = await fetch(target, {
      method,
      headers,
      cache: "no-store",
      redirect: "manual",
      signal: options?.signal
        ? AbortSignal.any([timeout, options.signal])
        : timeout,
      ...(options?.body !== undefined
        ? { body: JSON.stringify(options.body) }
        : {}),
    });
    return readFleetResponse<ApiSuccessEnvelope<T>>(response);
  }
  override async get<T>(path: string, options?: RequestOptions): Promise<T> {
    return (await this.dispatch<T>("GET", path, options)).data;
  }
  override async getEnvelope<T>(
    path: string,
    options?: RequestOptions,
  ): Promise<ApiSuccessEnvelope<T>> {
    return this.dispatch<T>("GET", path, options);
  }
  override async getListEnvelope<T>(
    path: string,
    options?: RequestOptions,
  ): Promise<ApiSuccessEnvelope<ListEnvelope<T>>> {
    return this.dispatch<ListEnvelope<T>>("GET", path, options);
  }
  override async post<T>(path: string, options?: RequestOptions): Promise<T> {
    return (await this.dispatch<T>("POST", path, options)).data;
  }
  override async put<T>(path: string, options?: RequestOptions): Promise<T> {
    return (await this.dispatch<T>("PUT", path, options)).data;
  }
  override async patch<T>(path: string, options?: RequestOptions): Promise<T> {
    return (await this.dispatch<T>("PATCH", path, options)).data;
  }
  override async delete<T>(path: string, options?: RequestOptions): Promise<T> {
    return (await this.dispatch<T>("DELETE", path, options)).data;
  }
}

export interface ServerFleetPartnerClient {
  client: ApiClient;
  fleetPartnerId: string;
}

export async function getServerFleetPartnerClient(): Promise<ServerFleetPartnerClient> {
  const apiUrl = fleetApiUrl();
  const principal = await resolveFleetPrincipal(await nextHeaders(), apiUrl);
  return {
    client: new FleetPortalApiClient({
      baseUrl: apiUrl,
      defaultHeaders: Object.fromEntries(principal.headers),
    }),
    fleetPartnerId: principal.fleetPartnerId,
  };
}
