/**
 * Platform Admin LLM assistant transcript/log/audit redaction.
 *
 * Authority: docs/05-ui/platform-admin-llm-assistant-design-development-plan-20260602.md
 *   - §5.7 Secret Handling (partner plaintext-once flows must never be echoed/persisted)
 *   - §8.3 Configuration Locations (provider keys must never reach transcript records)
 *   - §9.4 Prompt Injection and Data Safety (secrets redacted before LLM context and persistence)
 *
 * This module is the single chokepoint that strips provider keys, plaintext
 * partner credentials, API keys, webhook secrets, and secret-like tokens out of
 * any free text or structured payload before it is written to an assistant
 * transcript, application log, or audit event.
 */

/** Marker written in place of a removed secret. Never contains secret material. */
export const REDACTION_MARKER = "[REDACTED]";

function categoryMarker(category: string): string {
  return `[REDACTED:${category}]`;
}

interface SecretTextRule {
  readonly category: string;
  readonly pattern: RegExp;
  /**
   * When set, only the captured group `keep` is preserved and the rest of the
   * match is replaced with the marker (used for `key=value` style secrets so the
   * key name survives but the value is removed).
   */
  readonly keepKey?: boolean;
}

/**
 * Ordered redaction rules. Order matters: keyed `key=value`/`key: value`
 * secrets are redacted first so the value is removed even when it does not look
 * token-shaped on its own, then provider/token shaped values are caught
 * wherever they appear in free text.
 */
const SECRET_TEXT_RULES: readonly SecretTextRule[] = [
  // Authorization scheme tokens (Bearer/Basic/Token <value>). Runs before the
  // keyed rule so the credential after the scheme word is removed while the
  // scheme word itself is preserved for readability.
  {
    category: "bearer_token",
    keepKey: true,
    pattern: /\b(Bearer|Basic|Token)(\s+)([A-Za-z0-9._~+/=-]{8,})/gi,
  },
  // key=value / key: value secrets (env dumps, pasted config, JSON-ish text).
  {
    category: "keyed_secret",
    keepKey: true,
    pattern:
      /\b((?:[A-Za-z0-9_]*(?:api[_-]?key|secret|passwd|password|token|webhook[_-]?secret|plaintext[_-]?key|private[_-]?key|provider[_-]?key|signing[_-]?secret|client[_-]?secret))[A-Za-z0-9_]*)(["']?\s*[:=]\s*["']?)([^\s"',;]+)/gi,
  },
  // Anthropic keys (sk-ant-...). Listed before the generic sk- rule for clarity.
  { category: "provider_key", pattern: /\bsk-ant-[A-Za-z0-9_-]{12,}\b/g },
  // OpenAI / OpenAI-project keys (sk-..., sk-proj-...).
  { category: "provider_key", pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}\b/g },
  // Google AI / GCP API keys (AIza...).
  { category: "provider_key", pattern: /\bAIza[0-9A-Za-z_-]{20,}\b/g },
  // Stripe-style webhook signing secrets (whsec_...).
  { category: "webhook_secret", pattern: /\bwhsec_[A-Za-z0-9]{12,}\b/g },
  // Partner plaintext-once credentials: tk_/pk_ prefixes and *_live_/*_test_ keys.
  {
    category: "partner_credential",
    pattern: /\b(?:tk|pk|sk|rk)_[A-Za-z0-9]{12,}\b/g,
  },
  {
    category: "partner_credential",
    pattern: /\b[A-Za-z0-9]+_(?:live|test|prod|staging)_[A-Za-z0-9]{8,}\b/g,
  },
  // JSON Web Tokens (header.payload.signature).
  {
    category: "jwt",
    pattern: /\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b/g,
  },
  // Generic secret-like tokens: long hex strings (>= 32 hex chars).
  { category: "secret_token", pattern: /\b[0-9a-fA-F]{32,}\b/g },
  // Generic secret-like tokens: long high-entropy base64/url-safe strings.
  { category: "secret_token", pattern: /\b[A-Za-z0-9_-]{40,}={0,2}\b/g },
];

export interface RedactedText {
  readonly text: string;
  readonly redacted: boolean;
}

/**
 * Redact all known secret shapes out of a free-text string. Returns the cleaned
 * text plus a flag indicating whether anything was removed.
 */
export function redactText(input: string): RedactedText {
  if (typeof input !== "string" || input.length === 0) {
    return { text: input, redacted: false };
  }

  let text = input;
  for (const rule of SECRET_TEXT_RULES) {
    const marker = categoryMarker(rule.category);
    if (rule.keepKey) {
      text = text.replace(rule.pattern, (_match, key: string, sep: string) => {
        const separator = sep.replace(/["']/g, "").trim();
        const joiner = separator ? `${separator} ` : " ";
        return `${key}${joiner}${marker}`;
      });
    } else {
      text = text.replace(rule.pattern, marker);
    }
  }

  return { text, redacted: text !== input };
}

/**
 * Object keys whose values are always secret material and must be removed wholesale,
 * regardless of the value shape. Matched case-insensitively as a substring.
 */
const SECRET_KEY_PATTERN =
  /(secret|password|passwd|token|api[_-]?key|apikey|plaintext|private[_-]?key|webhook|credential|authorization|bearer|signing[_-]?secret|client[_-]?secret|provider[_-]?key|passphrase)/i;

/**
 * Key suffixes that mark a derived/safe value (hashes, ids, previews, masks,
 * counts, timestamps) which must NOT be redacted even though the key name
 * mentions a secret-ish word (e.g. `credentialId`, `apiKeyHash`, `keyPrefix`,
 * `credentialIssued`, `secretName`).
 */
const SAFE_KEY_SUFFIX_PATTERN =
  /(id|hash|prefix|suffix|type|issued|applied|count|version|name|preview|masked|redacted|status|mode|flag|enabled|days|createdat|updatedat)$/i;

export function isSecretObjectKey(key: string): boolean {
  if (!SECRET_KEY_PATTERN.test(key)) {
    return false;
  }
  if (SAFE_KEY_SUFFIX_PATTERN.test(key)) {
    return false;
  }
  return true;
}

export interface RedactedValue<T = unknown> {
  readonly value: T;
  readonly redacted: boolean;
}

/**
 * Recursively redact a structured value: strings are run through {@link redactText},
 * and any object property whose key is secret-bearing (see {@link isSecretObjectKey})
 * has its value replaced with the redaction marker.
 *
 * The input is never mutated.
 */
export function redactValue<T>(input: T): RedactedValue<T> {
  let redacted = false;

  const visit = (value: unknown, keyHint?: string): unknown => {
    if (typeof keyHint === "string" && isSecretObjectKey(keyHint)) {
      if (value !== undefined && value !== null && value !== "") {
        redacted = true;
        return REDACTION_MARKER;
      }
      return value;
    }

    if (typeof value === "string") {
      const result = redactText(value);
      if (result.redacted) {
        redacted = true;
      }
      return result.text;
    }

    if (Array.isArray(value)) {
      return value.map((item) => visit(item));
    }

    if (value && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(
        value as Record<string, unknown>,
      )) {
        out[key] = visit(child, key);
      }
      return out;
    }

    return value;
  };

  return { value: visit(input) as T, redacted };
}

/**
 * Shape of a partner ingress credential issuance result (mirrors
 * `PartnerIngressCredentialIssued` from `@drts/contracts`) reduced to the fields
 * the assistant is allowed to reason about. The `plaintextKey` is intentionally
 * accepted so this function can guarantee it is dropped.
 */
export interface CredentialIssuanceLike {
  readonly credential: {
    readonly credentialId?: string;
    readonly id?: string;
    readonly keyPrefix?: string;
    readonly maskedSuffix?: string;
    readonly createdAt?: string;
    readonly auditId?: string;
    readonly [key: string]: unknown;
  };
  readonly plaintextKey?: string;
  readonly [key: string]: unknown;
}

/**
 * Transcript-safe summary of a partner plaintext-once credential issuance.
 *
 * Per §5.7 the assistant transcript may record that a credential was issued plus
 * its id, audit id, and timestamp, but never the secret material. The plaintext
 * key is the page/action component's plaintext-once modal responsibility and is
 * never echoed or persisted by the assistant.
 */
export interface SafeCredentialIssuanceSummary {
  readonly credential_issued: true;
  readonly credentialId: string | null;
  readonly keyPrefix: string | null;
  readonly maskedSuffix: string | null;
  readonly auditId: string | null;
  readonly createdAt: string | null;
}

export function summarizeCredentialIssuance(
  issued: CredentialIssuanceLike,
): SafeCredentialIssuanceSummary {
  const credential = issued.credential ?? {};
  return {
    credential_issued: true,
    credentialId: credential.credentialId ?? credential.id ?? null,
    keyPrefix: credential.keyPrefix ?? null,
    maskedSuffix: credential.maskedSuffix ?? null,
    auditId:
      credential.auditId ??
      (typeof issued.auditId === "string" ? issued.auditId : null),
    createdAt: credential.createdAt ?? null,
  };
}

/**
 * Defensive guard for the persistence boundary: walks a value and returns the
 * paths of any property that still carries plaintext secret material after
 * redaction is expected to have run. Used to fail loudly in tests and to assert
 * the assistant never persists plaintext-once credentials.
 */
export function findResidualSecrets(input: unknown, basePath = ""): string[] {
  const offenders: string[] = [];

  const visit = (value: unknown, path: string, keyHint?: string): void => {
    if (typeof keyHint === "string" && SAFE_KEY_SUFFIX_PATTERN.test(keyHint)) {
      return;
    }

    if (typeof keyHint === "string" && isSecretObjectKey(keyHint)) {
      if (
        value !== undefined &&
        value !== null &&
        value !== "" &&
        value !== REDACTION_MARKER
      ) {
        offenders.push(path);
      }
      return;
    }

    if (typeof value === "string") {
      if (redactText(value).redacted) {
        offenders.push(path);
      }
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }

    if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(
        value as Record<string, unknown>,
      )) {
        visit(child, path ? `${path}.${key}` : key, key);
      }
    }
  };

  visit(input, basePath);
  return offenders;
}
