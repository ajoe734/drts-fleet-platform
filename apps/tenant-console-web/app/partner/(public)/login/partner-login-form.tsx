"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { formatTenantUiError } from "@/lib/error-copy";

export function PartnerLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
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
          formatTenantUiError(
            payload?.error ?? `合作夥伴登入失敗（狀態碼 ${response.status}）。`,
            "合作夥伴登入失敗",
          ),
        );
        return;
      }

      startTransition(() => {
        router.push("/partner/start");
        router.refresh();
      });
    } catch (caught) {
      setError(
        formatTenantUiError(
          caught instanceof Error ? caught.message : "未知的合作夥伴登入失敗。",
          "合作夥伴登入失敗",
        ),
      );
    } finally {
      setSubmitting(false);
    }
  }

  const disabled = pending || submitting;

  return (
    <form
      aria-label="合作夥伴登入"
      className="partner-login-form"
      onSubmit={handleSubmit}
    >
      {error ? (
        <div className="form-error" role="alert">
          {error}
        </div>
      ) : null}
      <label className="field-stack">
        <span>入口別名</span>
        <input
          autoComplete="username"
          name="entrySlug"
          onChange={(event) => setEntrySlug(event.target.value)}
          placeholder="請輸入平台提供的入口別名"
          required
          type="text"
          value={entrySlug}
        />
      </label>
      <label className="field-stack">
        <span>合作夥伴 API 金鑰</span>
        <input
          autoComplete="current-password"
          name="apiKey"
          onChange={(event) => setApiKey(event.target.value)}
          placeholder="由平台管理端提供"
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
        {disabled ? "正在啟動合作夥伴工作階段..." : "啟動合作夥伴工作階段"}
      </button>
    </form>
  );
}
