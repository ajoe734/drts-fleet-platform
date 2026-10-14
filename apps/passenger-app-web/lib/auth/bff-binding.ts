import { createHash } from "node:crypto";

export interface OAuthBinding {
  provider: "google" | "facebook" | "line";
  transactionId: string;
  state: string;
  purpose: "login" | "link";
  session: string;
  expiresAt: number;
}

// An opaque fingerprint of the current HttpOnly credential, never a client-supplied subject.
export function sessionFingerprint(access?: string, refresh?: string) {
  return access || refresh
    ? createHash("sha256")
        .update(refresh || access || "")
        .digest("hex")
    : "anonymous";
}

export function readOAuthBinding(value?: string): OAuthBinding | null {
  try {
    const binding = JSON.parse(value ?? "null");
    if (
      !binding ||
      !["google", "facebook", "line"].includes(binding.provider) ||
      !["login", "link"].includes(binding.purpose) ||
      typeof binding.session !== "string" ||
      typeof binding.state !== "string" ||
      !binding.state ||
      typeof binding.transactionId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        binding.transactionId,
      ) ||
      !Number.isFinite(binding.expiresAt)
    )
      return null;
    return binding as OAuthBinding;
  } catch {
    return null;
  }
}
