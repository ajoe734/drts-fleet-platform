// Server data loaders for the Host (individual vehicle owner) restricted
// read-only surface (`/host/*`).
//
// Mirrors the seam pattern already established by
// `lib/fleet-portal-data.server.ts`: each loader resolves a scoped client via
// `getServerHostClient()`, calls one authoritative `/api/host/*` typed
// method, and returns a discriminated result — never a fixture. Unlike the
// fleet-admin loaders (which fall back to design fixtures with
// `source: "fallback"` for endpoints that simply have no portal route yet),
// Host has no fixture fallback: reason is `SR-HOST-BE-001` (the backend
// `apps/api/src/modules/host-view/` module) is still `in_progress` and not
// merged to `dev` at this task's base SHA (candidate
// `81e45bb82d9fdfbfdbef0106ae7e7c81604f8674` on branch
// `gemini/sr-host-be-001`, CI failing, not reachable from this branch's
// history). Calling the typed client against `/api/host/*` on this base
// therefore fails with a network error, which classifies as the
// `fetch_failed` access state below — legitimate "not yet available"
// signalling, never a fabricated empty/zero vehicle list.
//
// listHostVehicles has no `getHostVehicle(id)` counterpart on the typed
// client (packages/api-client/src/system-remediation.ts only exposes
// page/pageSize list + the four vehicleId-scoped sub-resource lists), so the
// per-vehicle summary shown on the detail page is resolved by finding the
// vehicleId within the caller's own owned-vehicle list. This is intentional,
// not a workaround: absence from the list is exactly the
// `HOST_VEHICLE_NOT_FOUND` anti-enumeration condition the API contract
// documents (host-screen-contract.md §2) — a vehicle either appears in the
// caller's own restricted projection or it does not exist from their point
// of view.
//
// C012-F2-LONG-LIST-DETAIL-FALSE404 fix: this used to request a single
// page1/pageSize200 lookup while `HostViewService.paginate` caps pageSize at
// 100 server-side, so an owner's vehicle beyond index 100 was never found
// (and the real server cap doesn't line up with any client-guessed size
// increase anyway). `loadHostVehicleDetail` now walks every authoritative
// page the server actually reports via `pageInfo.totalPages`, scanning at
// the server's real per-page cap, until the vehicleId is found or the
// caller's complete owned-vehicle list is exhausted.

import "server-only";

import type {
  ApiListData,
  HostVehicleCaseItem,
  HostVehicleEarningsSummary,
  HostVehicleMaintenanceItem,
  HostVehicleSummary,
  HostVehicleTripItem,
} from "@drts/contracts";

import { getServerHostClient } from "./host-auth.server";
import {
  classifyHostAccessError,
  classifyHostEarningsVariant,
  type HostAccessState,
  type HostEarningsVariant,
} from "./host-format";

// Matches `HostViewService.paginate`'s enforced server-side per-page cap
// (`Math.min(100, pageSize)`); requesting more than this per page would
// silently be truncated to 100 by the server regardless, which is exactly
// how C012-F2 under-counted owners with >100 vehicles. The list page itself
// still paginates independently with the caller-supplied page/pageSize.
const DETAIL_LOOKUP_PAGE_SIZE = 100;
// Hard ceiling on authoritative pages walked per detail lookup — purely a
// runaway-loop guard against a malformed `pageInfo.totalPages`, never
// expected to bind in practice (100 * 1000 = 100k owned vehicles).
const DETAIL_LOOKUP_MAX_PAGES = 1000;

// Duck-typed against ApiClientError's shape (packages/api-client/src/index.ts)
// rather than an `instanceof` check, so this module has no runtime coupling
// to the exact class identity — the same reasoning classifyHostAccessError
// (host-format.ts) already applies to code/statusCode.
function isStatusCode(err: unknown, statusCode: number): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "statusCode" in err &&
    (err as { statusCode: unknown }).statusCode === statusCode
  );
}

function errorMessage(err: unknown): string {
  if (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    typeof (err as { code: unknown }).code === "string"
  ) {
    const code = (err as { code: string }).code;
    const apiMessage = (err as { apiMessage?: unknown }).apiMessage;
    const message = (err as { message?: unknown }).message;
    const detail =
      typeof apiMessage === "string" && apiMessage
        ? apiMessage
        : typeof message === "string"
          ? message
          : code;
    return `${code}: ${detail}`;
  }
  return err instanceof Error ? err.message : "HOST_READ_FAILED";
}

export interface HostAccessFailure {
  ok: false;
  accessState: HostAccessState;
  error: string;
}

export interface HostListSuccess<T> {
  ok: true;
  items: T[];
  pageInfo: ApiListData<T>["pageInfo"];
}

export type HostListResult<T> = HostListSuccess<T> | HostAccessFailure;

export async function loadHostVehicles(query: {
  page?: number;
  pageSize?: number;
}): Promise<HostListResult<HostVehicleSummary>> {
  try {
    const { client } = await getServerHostClient();
    const result = await client.listHostVehicles(query);
    return { ok: true, items: result.items, pageInfo: result.pageInfo };
  } catch (err) {
    return {
      ok: false,
      accessState: classifyHostAccessError(err),
      error: errorMessage(err),
    };
  }
}

export interface HostVehicleDetailSuccess {
  ok: true;
  vehicle: HostVehicleSummary;
}

export type HostVehicleDetailResult =
  | HostVehicleDetailSuccess
  | HostAccessFailure;

export async function loadHostVehicleDetail(
  vehicleId: string,
): Promise<HostVehicleDetailResult> {
  try {
    const { client } = await getServerHostClient();
    let page = 1;
    for (let pagesWalked = 0; pagesWalked < DETAIL_LOOKUP_MAX_PAGES; pagesWalked += 1) {
      const result = await client.listHostVehicles({
        page,
        pageSize: DETAIL_LOOKUP_PAGE_SIZE,
      });
      const vehicle = result.items.find((v) => v.vehicleId === vehicleId);
      if (vehicle) {
        return { ok: true, vehicle };
      }
      if (page >= result.pageInfo.totalPages || result.items.length === 0) {
        break;
      }
      page += 1;
    }
    return {
      ok: false,
      accessState: "vehicle_not_found",
      error: `Vehicle ${vehicleId} is not in the caller's owned-vehicle scope`,
    };
  } catch (err) {
    return {
      ok: false,
      accessState: classifyHostAccessError(err),
      error: errorMessage(err),
    };
  }
}

export interface HostEarningsSuccess {
  ok: true;
  variant: HostEarningsVariant | "no_record";
  earnings: HostVehicleEarningsSummary | null;
}

export type HostEarningsResult = HostEarningsSuccess | HostAccessFailure;

export async function loadHostVehicleEarnings(
  vehicleId: string,
  month?: string,
): Promise<HostEarningsResult> {
  try {
    const { client } = await getServerHostClient();
    const earnings = await client.getHostVehicleEarnings(
      vehicleId,
      month ? { month } : undefined,
    );
    return {
      ok: true,
      variant: classifyHostEarningsVariant(earnings),
      earnings,
    };
  } catch (err) {
    // A 404 for an already-ownership-validated vehicleId is read as "no
    // earnings document for the requested period" (host-screen-contract.md
    // §3's no_record state), not vehicle-not-found — the caller already
    // proved ownership via loadHostVehicleDetail before this call is made.
    if (isStatusCode(err, 404)) {
      return { ok: true, variant: "no_record", earnings: null };
    }
    return {
      ok: false,
      accessState: classifyHostAccessError(err),
      error: errorMessage(err),
    };
  }
}

export async function loadHostVehicleMaintenance(
  vehicleId: string,
  query: { page?: number; pageSize?: number },
): Promise<HostListResult<HostVehicleMaintenanceItem>> {
  try {
    const { client } = await getServerHostClient();
    const result = await client.listHostVehicleMaintenance(vehicleId, query);
    return { ok: true, items: result.items, pageInfo: result.pageInfo };
  } catch (err) {
    return {
      ok: false,
      accessState: classifyHostAccessError(err),
      error: errorMessage(err),
    };
  }
}

export async function loadHostVehicleTrips(
  vehicleId: string,
  query: { page?: number; pageSize?: number },
): Promise<HostListResult<HostVehicleTripItem>> {
  try {
    const { client } = await getServerHostClient();
    const result = await client.listHostVehicleTrips(vehicleId, query);
    return { ok: true, items: result.items, pageInfo: result.pageInfo };
  } catch (err) {
    return {
      ok: false,
      accessState: classifyHostAccessError(err),
      error: errorMessage(err),
    };
  }
}

export async function loadHostVehicleCases(
  vehicleId: string,
  query: { page?: number; pageSize?: number },
): Promise<HostListResult<HostVehicleCaseItem>> {
  try {
    const { client } = await getServerHostClient();
    const result = await client.listHostVehicleCases(vehicleId, query);
    return { ok: true, items: result.items, pageInfo: result.pageInfo };
  } catch (err) {
    return {
      ok: false,
      accessState: classifyHostAccessError(err),
      error: errorMessage(err),
    };
  }
}
