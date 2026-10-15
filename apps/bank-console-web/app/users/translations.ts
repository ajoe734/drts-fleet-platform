import type { Locale } from "../../lib/translations";

const messages = {
  en: {
    serviceUnavailable: "User service unavailable",
    managedSignIn: "Sign in with tenant account",
    signOutFailure: "Sign out failed. Please retry.",
  },
  zh: {
    serviceUnavailable: "人員服務暫時無法使用",
    managedSignIn: "使用租戶帳戶登入",
    signOutFailure: "登出失敗，請重試。",
  },
} satisfies Record<Locale, Record<string, string>>;

export function userManagementText(
  key: keyof (typeof messages)["en"],
  locale: Locale,
): string {
  return messages[locale][key];
}
