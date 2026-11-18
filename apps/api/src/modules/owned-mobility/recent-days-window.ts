import { HttpStatus } from "@nestjs/common";

import { ApiRequestError } from "../../common/api-envelope";
import type { OpenOrRecentWindow } from "./owned-mobility.repository";

const MAX_RECENT_DAYS = 366;

/** `recentDays` query → read window. Absent means "no window" (every row);
 * anything that is not a whole number of days from 1 to 366 is rejected
 * rather than silently widened to the full list. */
export function parseRecentDaysWindow(
  raw: string | undefined,
  now: number = Date.now(),
): OpenOrRecentWindow | undefined {
  if (raw === undefined || raw === "") return undefined;
  if (!/^[0-9]{1,3}$/.test(raw)) {
    throw new ApiRequestError(
      HttpStatus.BAD_REQUEST,
      "RECENT_DAYS_INVALID",
      "recentDays must be a whole number of days from 1 to 366.",
    );
  }
  const days = Number(raw);
  if (days < 1 || days > MAX_RECENT_DAYS) {
    throw new ApiRequestError(
      HttpStatus.BAD_REQUEST,
      "RECENT_DAYS_INVALID",
      "recentDays must be a whole number of days from 1 to 366.",
    );
  }
  return { createdSince: new Date(now - days * 24 * 60 * 60 * 1000) };
}
