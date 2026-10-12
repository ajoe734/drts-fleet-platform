/** Formal HTTP fields are snake_case; typed SDK fields are camelCase.
 * Identifiers/strings are values, never transformed. Opaque dictionary bags
 * retain their wire keys and nested content rather than becoming DTO fields.
 * The API serializer is unchanged and this decoder is booking-local only.
 */
const opaqueBags = new Set([
  "metadata",
  "meta",
  "additionalFees",
  "properties",
  "attributes",
  "extensions",
  "claims",
  "auditContext",
]);
export function decodeBookingWire(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decodeBookingWire);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([wireKey, content]) => {
      const key = wireKey.replace(/_([a-z])/g, (_match, letter: string) =>
        letter.toUpperCase(),
      );
      return [key, opaqueBags.has(key) ? content : decodeBookingWire(content)];
    }),
  );
}
