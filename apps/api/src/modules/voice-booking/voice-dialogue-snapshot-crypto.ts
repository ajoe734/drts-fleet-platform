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
 */

const ALGORITHM = "aes-256-gcm";
const NONCE_LENGTH_BYTES = 12;
const KEY_LENGTH_BYTES = 32;

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
  let key: Buffer;
  try {
    key = Buffer.from(keyBase64, "base64");
  } catch {
    return null;
  }
  if (key.length !== KEY_LENGTH_BYTES) {
    return null;
  }
  return { version, key };
}

export function encryptDialogueSnapshotContent(
  content: unknown,
  encryptionKey: DialogueSnapshotEncryptionKey,
): EncryptedDialogueSnapshotContent {
  const nonce = randomBytes(NONCE_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, encryptionKey.key, nonce);
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
 */
export function decryptDialogueSnapshotContent(
  encrypted: EncryptedDialogueSnapshotContent,
  resolveKey: (version: string) => Buffer | null,
): unknown {
  const key = resolveKey(encrypted.keyVersion);
  if (!key) {
    throw new Error(
      `voice_dialogue_snapshot_key_unavailable: no decryption key is configured for version '${encrypted.keyVersion}'.`,
    );
  }
  const decipher = createDecipheriv(ALGORITHM, key, encrypted.nonce);
  decipher.setAuthTag(encrypted.authTag);
  const plaintext = Buffer.concat([
    decipher.update(encrypted.ciphertext),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString("utf8"));
}
