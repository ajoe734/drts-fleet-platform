import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AUDIT-VOICE-APPLICATION-WIRING-20261003 R4: AES-256-GCM encryption for
 * `voice.dialogue_snapshot.content_ciphertext` (see
 * `infra/migrations/V0106__voice_dialogue_snapshot.sql`). The key never
 * leaves apps/api -- `voice-media-worker` submits plaintext content over the
 * already-authenticated SD §4.2 capability channel (the same trust boundary
 * `resolveInput`/`recordControlEvent` already rely on); this module is
 * what makes the *durable, at-rest* copy encrypted, not a transport-layer
 * concern.
 *
 * Deliberately NOT the `oidc-pkce.service.ts` `createSignedStateToken`
 * pattern: that helper falls back to a hardcoded default secret
 * ("drts_oidc_state_secret_key_32bytes_min") when no env var is configured.
 * A dialogue snapshot is call evidence (SD §9.2), not a short-lived opaque
 * state token -- silently encrypting it under a public, hardcoded key would
 * be worse than storing it in the clear (false confidentiality). Resolution
 * here is fail-closed by construction: an absent or malformed key returns
 * `null`, and callers (`VoiceSessionService.persistDialogueSnapshot`) must
 * reject the write rather than ever falling back to an unencrypted or
 * default-keyed one.
 *
 * `associatedData` (GCM AAD, reviewer WIP feedback 2026-10-03T14:20Z):
 * binds the ciphertext to the immutable session/scope/route/lease/input/
 * media/turn context the row was written under (see
 * `VoiceSessionService#dialogueSnapshotAssociatedData`). Without this, a
 * row's `content_ciphertext`/`content_nonce`/`content_auth_tag` triple
 * decrypts successfully even if read back against (or substituted into) a
 * DIFFERENT row's context fields -- the auth tag only proves the ciphertext
 * itself is unmodified, not that it belongs to the context it is being
 * decrypted under. Binding AAD makes a context/row substitution fail the
 * same authenticated-tag check a ciphertext tamper already does.
 */

const ALGORITHM = "aes-256-gcm";
const NONCE_LENGTH_BYTES = 12;
const KEY_LENGTH_BYTES = 32;
// RFC 4648 §4 standard base64, no whitespace: `Buffer.from(str, "base64")`
// silently skips characters outside this alphabet rather than rejecting
// them, so a config value with stray/invalid characters could still decode
// to something 32 bytes long by accident. Reject anything that is not
// canonical standard-alphabet base64 (optionally padded) before decoding.
const STRICT_BASE64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export interface DialogueSnapshotEncryptionKey {
  readonly version: string;
  readonly key: Buffer;
}

export interface EncryptedDialogueSnapshotContent {
  readonly keyVersion: string;
  readonly nonce: Buffer;
  readonly ciphertext: Buffer;
  readonly authTag: Buffer;
}

/**
 * `VOICE_DIALOGUE_SNAPSHOT_ENCRYPTION_KEY`: base64-encoded 32-byte (256-bit)
 * AES key. `VOICE_DIALOGUE_SNAPSHOT_KEY_VERSION`: an opaque label stored
 * alongside every row it encrypts (`content_key_version`) so a future key
 * rotation can still decrypt old, append-only rows under their own
 * original key instead of needing to rewrite them.
 */
export function resolveDialogueSnapshotEncryptionKey(
  env: NodeJS.ProcessEnv = process.env,
): DialogueSnapshotEncryptionKey | null {
  const version = env.VOICE_DIALOGUE_SNAPSHOT_KEY_VERSION?.trim();
  const keyBase64 = env.VOICE_DIALOGUE_SNAPSHOT_ENCRYPTION_KEY?.trim();
  if (!version || !keyBase64) {
    return null;
  }
  if (!STRICT_BASE64_RE.test(keyBase64)) {
    return null;
  }
  const key = Buffer.from(keyBase64, "base64");
  // Canonical round-trip check: a non-canonical-but-alphabet-valid string
  // (wrong padding length, etc.) can still pass the regex above but decode
  // to a value that does not re-encode to the same string -- reject those
  // too rather than silently accepting an ambiguous encoding.
  if (key.toString("base64") !== keyBase64 || key.length !== KEY_LENGTH_BYTES) {
    return null;
  }
  return { version, key };
}

export function encryptDialogueSnapshotContent(
  content: unknown,
  encryptionKey: DialogueSnapshotEncryptionKey,
  associatedData: string,
): EncryptedDialogueSnapshotContent {
  const nonce = randomBytes(NONCE_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, encryptionKey.key, nonce);
  cipher.setAAD(Buffer.from(associatedData, "utf8"));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(content), "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return { keyVersion: encryptionKey.version, nonce, ciphertext, authTag };
}

/**
 * `resolveKey` returns `null` for an unrecognized/rotated-away version
 * instead of this function silently decrypting under the wrong key --
 * `createDecipheriv` would otherwise just produce garbage (GCM's auth tag
 * check fails loudly, but only after committing to the wrong key).
 * `associatedData` must be the SAME canonical context string the row was
 * encrypted under (see `encryptDialogueSnapshotContent`'s own doc) -- a
 * mismatch fails `decipher.final()`'s auth-tag check exactly like a
 * ciphertext tamper would.
 */
export function decryptDialogueSnapshotContent(
  encrypted: EncryptedDialogueSnapshotContent,
  resolveKey: (version: string) => Buffer | null,
  associatedData: string,
): unknown {
  const key = resolveKey(encrypted.keyVersion);
  if (!key) {
    throw new Error(
      `voice_dialogue_snapshot_key_unavailable: no decryption key is configured for version '${encrypted.keyVersion}'.`,
    );
  }
  const decipher = createDecipheriv(ALGORITHM, key, encrypted.nonce);
  decipher.setAAD(Buffer.from(associatedData, "utf8"));
  decipher.setAuthTag(encrypted.authTag);
  const plaintext = Buffer.concat([
    decipher.update(encrypted.ciphertext),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString("utf8"));
}
