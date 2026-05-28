export type ApiKeyActionKind = "issue" | "rotate" | "revoke";

export type ApiKeyFlashPayload = {
  tone: "default" | "warning";
  title: string;
  description: string;
  action?: ApiKeyActionKind;
  keyName?: string;
  plaintextKey?: string;
};
