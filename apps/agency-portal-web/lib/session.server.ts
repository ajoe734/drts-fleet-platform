import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  AGENCY_PROFILE_COOKIE_NAME,
  AGENCY_SESSION_COOKIE_NAME,
} from "@drts/agency-auth/constants";
import {
  agencyApiGet,
  type AgencyApiResult,
} from "@drts/agency-auth/agency-api";
import { decodeAgencyProfile } from "@drts/agency-auth";

export async function requireAgencyToken(returnPath: string): Promise<string> {
  const token = (await cookies()).get(AGENCY_SESSION_COOKIE_NAME)?.value;
  if (!token) {
    redirect(`/login?redirect_uri=${encodeURIComponent(returnPath)}`);
  }
  return token;
}

export async function readAgencyProfile() {
  return decodeAgencyProfile(
    (await cookies()).get(AGENCY_PROFILE_COOKIE_NAME)?.value,
  );
}

/**
 * Loads one agency API read for a server page. An expired/revoked session
 * (401) goes back to login; every other failure is shown, never masked by
 * placeholder data.
 */
export async function loadAgencyData<T>(
  returnPath: string,
  segments: readonly string[],
  query: Record<string, string | undefined> = {},
): Promise<AgencyApiResult<T>> {
  const token = await requireAgencyToken(returnPath);
  const result = await agencyApiGet<T>(token, segments, query);
  if (result.status === 401) {
    redirect(`/login?redirect_uri=${encodeURIComponent(returnPath)}`);
  }
  return result;
}

export function firstParam(
  value: string | string[] | undefined,
): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "string" && first.trim() ? first.trim() : undefined;
}
