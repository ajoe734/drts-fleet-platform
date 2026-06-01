"use client";

import type { CSSProperties } from "react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CanvasBanner, CanvasField, type CanvasTheme } from "@drts/ui-web";
import {
  rotateWebhookSecretAction,
  type WebhookSecretFlashPayload,
} from "./actions";

type WebhookSecretRotateFormProps = {
  defaultReason: string;
  disabledReason?: string | null;
  enabled: boolean;
  theme: CanvasTheme;
  webhookId: string;
};

const inlineStackStyle: CSSProperties = {
  display: "grid",
  gap: 10,
};

const fieldGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

function nativeInputStyle(theme: CanvasTheme): CSSProperties {
  return {
    width: "100%",
    background: theme.bgRaised,
    border: `1px solid ${theme.border}`,
    borderRadius: 7,
    padding: "8px 10px",
    fontSize: 12.5,
    color: theme.text,
    outline: "none",
    fontFamily: theme.fontFamily,
    boxSizing: "border-box",
  };
}

function primaryButtonStyle(theme: CanvasTheme): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 28,
    padding: "5px 10px",
    borderRadius: 7,
    border: `1px solid ${theme.accent}`,
    background: theme.accent,
    color: "#fff",
    fontSize: 12,
    fontWeight: 500,
    lineHeight: 1,
    cursor: "pointer",
    fontFamily: theme.fontFamily,
  };
}

function secondaryButtonStyle(theme: CanvasTheme): CSSProperties {
  return {
    ...primaryButtonStyle(theme),
    background: theme.surface,
    borderColor: theme.border,
    color: theme.text,
  };
}

function disabledActionStyle(theme: CanvasTheme): CSSProperties {
  return {
    ...secondaryButtonStyle(theme),
    opacity: 0.55,
    cursor: "not-allowed",
  };
}

function helperTextStyle(theme: CanvasTheme): CSSProperties {
  return {
    fontSize: 11,
    lineHeight: 1.45,
    color: theme.textMuted,
  };
}

function plaintextStyle(theme: CanvasTheme): CSSProperties {
  return {
    display: "block",
    background: "rgba(6, 11, 19, 0.72)",
    border: `1px solid ${theme.border}`,
    borderRadius: 7,
    padding: "10px 12px",
    color: theme.text,
    fontSize: 12,
    fontFamily: theme.monoFamily,
    overflowX: "auto",
  };
}

function downloadSecret(webhookId: string, secret: string) {
  const blob = new Blob([`${secret}\n`], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${webhookId}-webhook-secret.txt`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function WebhookSecretRotateForm({
  defaultReason,
  disabledReason,
  enabled,
  theme,
  webhookId,
}: WebhookSecretRotateFormProps) {
  const router = useRouter();
  const [flash, setFlash] = useState<WebhookSecretFlashPayload | null>(null);
  const [pending, startTransition] = useTransition();
  const [secret, setSecret] = useState("");
  const [rotationReason, setRotationReason] = useState(defaultReason);

  function submit() {
    if (!enabled || pending) return;

    const formData = new FormData();
    formData.set("webhookId", webhookId);
    formData.set("secret", secret);
    formData.set("rotationReason", rotationReason);

    startTransition(async () => {
      const result = await rotateWebhookSecretAction(formData);
      setFlash(result);

      if (result.tone === "default") {
        setSecret("");
        router.refresh();
      }
    });
  }

  return (
    <div style={inlineStackStyle}>
      {flash?.plaintextSecret ? (
        <CanvasBanner
          theme={theme}
          tone="info"
          icon="warn"
          title="新的完整 secret 只顯示一次"
          body={
            <div style={inlineStackStyle}>
              <span>{flash.description}</span>
              <code style={plaintextStyle(theme)}>{flash.plaintextSecret}</code>
              <div style={actionRowStyle}>
                <button
                  type="button"
                  style={secondaryButtonStyle(theme)}
                  onClick={() =>
                    navigator.clipboard.writeText(flash.plaintextSecret ?? "")
                  }
                >
                  Copy secret
                </button>
                <button
                  type="button"
                  style={secondaryButtonStyle(theme)}
                  onClick={() =>
                    downloadSecret(webhookId, flash.plaintextSecret ?? "")
                  }
                >
                  Download .txt
                </button>
              </div>
            </div>
          }
        />
      ) : flash ? (
        <CanvasBanner
          theme={theme}
          tone={flash.tone === "warning" ? "warn" : "success"}
          icon="warn"
          title={flash.title}
          body={flash.description}
        />
      ) : (
        <CanvasBanner
          theme={theme}
          tone="info"
          icon="warn"
          title="Rotate secret 後僅在這裡顯示一次"
          body="提交成功後可立即 copy 或下載 `.txt`；重新整理後只保留 masked preview / version。"
        />
      )}

      <div style={fieldGridStyle}>
        <CanvasField theme={theme} label="New secret">
          <input
            style={nativeInputStyle(theme)}
            disabled={!enabled || pending}
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
          />
        </CanvasField>
        <CanvasField theme={theme} label="Rotation reason">
          <input
            style={nativeInputStyle(theme)}
            disabled={!enabled || pending}
            value={rotationReason}
            onChange={(event) => setRotationReason(event.target.value)}
          />
        </CanvasField>
      </div>
      <div style={helperTextStyle(theme)}>
        plaintext-once receipt 只在本次成功訊息中保留；離開後請改看更新後的
        secret preview / version。
      </div>
      <div style={actionRowStyle}>
        {enabled ? (
          <button
            type="button"
            style={{
              ...primaryButtonStyle(theme),
              cursor: pending ? "not-allowed" : "pointer",
              opacity: pending ? 0.7 : 1,
            }}
            disabled={pending}
            onClick={submit}
          >
            Rotate secret
          </button>
        ) : (
          <span
            style={disabledActionStyle(theme)}
            title={disabledReason ?? "disabled"}
          >
            Rotate secret
          </span>
        )}
      </div>
    </div>
  );
}
