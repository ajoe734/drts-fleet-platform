/**
 * PII Redactor for UAT Harness and System Remediation
 *
 * Masks personal identifiable information (PII), secrets, and credentials
 * from console logs, HTTP traffic, artifacts, and evidence logs before persistence.
 */

// Taiwan phone numbers: 09xx-xxx-xxx or 09xxxxxxxx or (02)xxxx-xxxx / 02-xxxx-xxxx
const TAIWAN_MOBILE_REGEX = /\b(09\d{2})[- ]?(\d{3})[- ]?(\d{3})\b/g;
const TAIWAN_LANDLINE_REGEX = /\b(0[2-8])[- ]?(\d{3,4})[- ]?(\d{4})\b/g;

// Email addresses
const EMAIL_REGEX = /\b([a-zA-Z0-9_.+-])[a-zA-Z0-9_.+-]*@([a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)\b/g;

// Taiwan National ID (ROC ID): 1 uppercase letter + 1/2/8/9 + 8 digits (10 chars total)
const ROC_ID_REGEX = /\b([A-Z][1289]\d)\d{4}(\d{3})\b/g;

// Bearer / OAuth Tokens
const BEARER_TOKEN_REGEX = /\bBearer\s+([A-Za-z0-9\-._~+/]+=*)/gi;

// Query parameter token/secret patterns: ?token=xxx or &apiKey=xxx
const QUERY_SECRET_REGEX = /([?&](?:token|access_token|secret|apiKey|api_key|password)=)([^&\s]+)/gi;

// Sensitive Key-Value pairs in JSON or headers: password: xxx, "secret": "xxx"
const SENSITIVE_KEY_VALUE_REGEX =
  /(["']?(?:password|secret|apiKey|api_key|access_token|auth_token|client_secret)["']?\s*[:=]\s*["']?)([^"'\s&,}{]+)(["']?)/gi;

// Credit card / bank account numbers (12-16 digits separated by dashes or spaces)
const BANK_CARD_REGEX = /\b(?:\d{4}[- ]?){3}\d{4}\b/g;

/**
 * Redacts PII and sensitive tokens in a string.
 */
export function redactPii(input: string): string {
  if (typeof input !== "string" || !input) {
    return input;
  }

  let result = input;

  // 1. Bearer tokens
  result = result.replace(BEARER_TOKEN_REGEX, "Bearer [REDACTED_TOKEN]");

  // 2. Query parameter secrets
  result = result.replace(QUERY_SECRET_REGEX, "$1[REDACTED]");

  // 3. Sensitive Key-Value pairs (passwords, secrets, tokens)
  result = result.replace(
    SENSITIVE_KEY_VALUE_REGEX,
    (_match, prefix, _secret, suffix) => `${prefix}[REDACTED]${suffix}`,
  );

  // 3. Email addresses: e.g. j***@acme.example
  result = result.replace(EMAIL_REGEX, (_match, firstLetter, domain) => `${firstLetter}***@${domain}`);

  // 4. Taiwan Mobile: e.g. 0912-***-789
  result = result.replace(
    TAIWAN_MOBILE_REGEX,
    (_match, prefix, _mid, suffix) => `${prefix}-***-${suffix}`,
  );

  // 5. Taiwan Landline
  result = result.replace(
    TAIWAN_LANDLINE_REGEX,
    (_match, area, _mid, suffix) => `${area}-***-${suffix}`,
  );

  // 6. ROC National ID: e.g. A12***789
  result = result.replace(ROC_ID_REGEX, (_match, prefix, suffix) => `${prefix}***${suffix}`);

  // 7. Bank cards / Credit cards
  result = result.replace(BANK_CARD_REGEX, "****-****-****-****");

  return result;
}

/**
 * Recursively redacts PII in an object, array, or primitive.
 * Produces a deep-cloned safe structure.
 */
export function redactObject<T>(value: T): T {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    return redactPii(value) as unknown as T;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactObject(item)) as unknown as T;
  }

  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes("password") ||
        lowerKey.includes("secret") ||
        lowerKey.includes("authorization") ||
        lowerKey === "token" ||
        lowerKey === "access_token" ||
        lowerKey === "api_key" ||
        lowerKey === "apikey"
      ) {
        output[key] = "[REDACTED]";
      } else {
        output[key] = redactObject(val);
      }
    }
    return output as T;
  }

  return value;
}
