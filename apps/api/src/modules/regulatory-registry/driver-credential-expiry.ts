const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** First invalid instant: date-only credentials include their whole UTC day.
 * Keep the stored value and event identity unchanged; timestamps stay exact. */
export function driverCredentialExpiryMs(
  value: string | null | undefined,
): number {
  const parsed = Date.parse(value ?? "");
  return value && DATE_ONLY.test(value) ? parsed + 86400000 : parsed;
}

/** Same cutoff for repository scans, independent of the PG session timezone.
 * valueSql must be a trusted source expression, never user input. */
export function driverCredentialExpirySql(valueSql: string): string {
  return `(CASE WHEN ${valueSql} ~ '${DATE_ONLY.source}'
    THEN ((${valueSql})::date + 1)::timestamp AT TIME ZONE 'UTC'
    ELSE (${valueSql})::timestamptz END)`;
}
