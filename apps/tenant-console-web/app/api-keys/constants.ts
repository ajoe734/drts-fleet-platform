import type { TranslationKey } from "@/lib/translations";

export type ApiKeyActionKind = "issue" | "rotate" | "revoke";

export type ApiKeyPageErrorCode =
  | "apiKeysLoadFailed"
  | "governanceLoadFailed"
  | "identityLoadFailed";

export type ApiKeyFlashPayload = {
  tone: "default" | "warning";
  titleKey: TranslationKey;
  descriptionKey: TranslationKey;
  titleParams?: Record<string, string | number>;
  descriptionParams?: Record<string, string | number>;
  action?: ApiKeyActionKind;
  keyName?: string;
  plaintextKey?: string;
};
