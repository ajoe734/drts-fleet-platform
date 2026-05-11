export type ApiKeyFlashPayload = {
  tone: "default" | "warning";
  title: string;
  description: string;
  plaintextKey?: string;
};
