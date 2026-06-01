export function normalizeNonNegativeInteger(value: number, field: string) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer.`);
  }
  return value;
}

export function normalizeRequiredReason(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error("reason is required.");
  }
  return normalized;
}
