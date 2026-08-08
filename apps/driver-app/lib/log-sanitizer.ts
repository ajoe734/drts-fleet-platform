/**
 * Log Sanitizer for Driver Mobile App (IAM-DRV-002).
 *
 * Ensures tokens, authorization headers, refresh credentials, and JWT strings
 * are never leaked into console output, device logs, or crash reporting.
 */

export function sanitizeLogMessage(errorOrMessage: unknown): string {
  if (errorOrMessage === null || errorOrMessage === undefined) {
    return "";
  }

  let text: string;
  if (errorOrMessage instanceof Error) {
    text = errorOrMessage.message || errorOrMessage.name || "Error";
  } else if (typeof errorOrMessage === "string") {
    text = errorOrMessage;
  } else {
    try {
      text = JSON.stringify(errorOrMessage);
    } catch {
      text = String(errorOrMessage);
    }
  }

  if (!text) {
    return "";
  }

  let sanitized = text;

  // 1. Authorization headers (e.g. "Authorization: Bearer xyz", "Authorization Header: xyz")
  sanitized = sanitized.replace(
    /(authorization(?:\s+header)?\s*:\s*)([^\r\n,;{}"]+)/gi,
    "$1[REDACTED]",
  );

  // 2. Bearer tokens (e.g. "Bearer eyJ...", "Bearer sample-token-123")
  sanitized = sanitized.replace(
    /Bearer\s+[A-Za-z0-9._~+/-]+=*/gi,
    "Bearer [REDACTED]",
  );

  // 3. JWT tokens (e.g. eyJhbGciOi...)
  sanitized = sanitized.replace(
    /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/gi,
    "[REDACTED_JWT]",
  );

  // 4. Specific key-value credential fields (accessToken, refreshToken, registrationCode, bearerToken, etc.)
  sanitized = sanitized.replace(
    /("?(?:accessToken|access_token|refreshToken|refresh_token|registrationCode|registration_code|bearerToken|bearer_token)"?\s*[:=]\s*)"?[^"&,;\s{}()\\]+"?/gi,
    '$1"[REDACTED]"',
  );

  return sanitized;
}
