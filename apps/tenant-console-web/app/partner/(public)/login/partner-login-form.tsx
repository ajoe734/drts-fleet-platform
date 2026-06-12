"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { useTranslation } from "@/lib/i18n";

export function PartnerLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useTranslation();
  const [entrySlug, setEntrySlug] = useState(
    searchParams.get("entry_slug") ?? "",
  );
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch("/api/partner/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entrySlug: entrySlug.trim(),
          apiKey: apiKey.trim(),
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(
          payload?.error ??
            t("partner.login.errorFailed", { status: response.status }),
        );
        return;
      }

      startTransition(() => {
        router.push("/partner/start");
        router.refresh();
      });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : t("partner.login.errorUnknown"),
      );
    } finally {
      setSubmitting(false);
    }
  }

  const disabled = pending || submitting;

  return (
    <form
      aria-label={t("partner.login.formAria")}
      className="partner-login-form"
      onSubmit={handleSubmit}
    >
      {error ? (
        <div className="form-error" role="alert">
          {error}
        </div>
      ) : null}
      <label className="field-stack">
        <span>{t("partner.login.entrySlug")}</span>
        <input
          autoComplete="username"
          name="entrySlug"
          onChange={(event) => setEntrySlug(event.target.value)}
          placeholder={t("partner.login.entrySlugPlaceholder")}
          required
          type="text"
          value={entrySlug}
        />
      </label>
      <label className="field-stack">
        <span>{t("partner.login.apiKey")}</span>
        <input
          autoComplete="current-password"
          name="apiKey"
          onChange={(event) => setApiKey(event.target.value)}
          placeholder={t("partner.login.apiKeyPlaceholder")}
          required
          type="password"
          value={apiKey}
        />
      </label>
      <button
        className="action-button action-button-primary"
        disabled={disabled}
        type="submit"
      >
        {disabled ? t("partner.login.submitting") : t("partner.login.submit")}
      </button>
    </form>
  );
}
