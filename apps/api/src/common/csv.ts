/**
 * The one CSV writer.
 *
 * It was written inside `tenant-partner.controller.ts` for partner statements
 * and lifted here when the regulatory reports needed to export. A second
 * escaper would have been a second place to get the escaping wrong, and one of
 * the two rules below is a security control rather than a formatting nicety.
 */

/**
 * A cell beginning `=`, `+`, `-` or `@` is executed as a formula by Excel,
 * Numbers and LibreOffice when the file is opened. These files are handed to
 * partners and to 公路主管機關, so the leading character is neutralised with a
 * quote prefix rather than trusted.
 */
function escapeCell(value: unknown): string {
  const text =
    value === null || value === undefined
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

/** CRLF, which is what RFC 4180 specifies and what Excel expects. */
export function toCsv(rows: readonly (readonly unknown[])[]): string {
  return rows.map((row) => row.map(escapeCell).join(",")).join("\r\n");
}

/**
 * Renders records as CSV with a header row.
 *
 * Columns come from the union of every record's keys, in first-seen order, so a
 * report whose rows are not uniformly shaped still exports every field it has
 * rather than silently dropping the ones the first row happened to omit.
 */
export function recordsToCsv(
  records: readonly Record<string, unknown>[],
): string {
  const columns: string[] = [];
  for (const record of records) {
    for (const key of Object.keys(record)) {
      if (!columns.includes(key)) {
        columns.push(key);
      }
    }
  }
  return toCsv([columns, ...records.map((r) => columns.map((c) => r[c]))]);
}
