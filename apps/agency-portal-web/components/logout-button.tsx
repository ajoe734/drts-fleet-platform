"use client";

import { useState } from "react";
import { useTranslation } from "@/lib/i18n";
import type { Locale } from "@/lib/translations";

function readCookie(name: string): string | null {
  const match = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

export function LogoutButton({ locale: explicitLocale }: { locale?: Locale }) {
  const [pending, setPending] = useState(false);
  const { t } = useTranslation(explicitLocale);
  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: { "x-csrf-token": readCookie("drts_agency_csrf") ?? "" },
          credentials: "same-origin",
        }).catch(() => null);
        window.location.assign("/login");
      }}
      style={{
        border: "1px solid #cbd5e1",
        background: "#ffffff",
        borderRadius: 8,
        padding: "6px 12px",
        cursor: pending ? "wait" : "pointer",
      }}
    >
      {t("shell.logout")}
    </button>
  );
}
