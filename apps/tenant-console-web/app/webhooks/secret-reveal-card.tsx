"use client";

import { useState } from "react";
import { CanvasBanner, CanvasBtn, buildCanvasTheme } from "@drts/ui-web";

type SecretRevealTheme = ReturnType<typeof buildCanvasTheme>;

type SecretRevealCardProps = {
  theme: SecretRevealTheme;
  title: string;
  subtitle: string;
  body: string;
  endpointUrl: string;
  secret: string;
  secretPreview: string;
  secretVersion: number;
  rotatedAt: string;
  webhookId: string;
  clearReceiptAction: (formData: FormData) => void | Promise<void>;
};

const cardStyle = {
  display: "grid",
  gap: 14,
};

const secretBoxStyle = (theme: SecretRevealTheme) => ({
  display: "grid",
  gap: 10,
  padding: "12px 14px",
  borderRadius: 10,
  border: `1px solid ${theme.warn}`,
  background: `${theme.warn}14`,
});

const secretLineStyle = (theme: SecretRevealTheme) => ({
  margin: 0,
  padding: "10px 12px",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: theme.bg,
  color: theme.text,
  fontFamily: theme.monoFamily,
  fontSize: 12.5,
  overflowX: "auto" as const,
  whiteSpace: "nowrap" as const,
});

const metaGridStyle = {
  display: "grid",
  gap: 10,
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
};

const metaCardStyle = (theme: SecretRevealTheme) => ({
  padding: "10px 12px",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: theme.surface,
  display: "grid",
  gap: 4,
});

const metaLabelStyle = (theme: SecretRevealTheme) => ({
  color: theme.textMuted,
  fontSize: 11,
  letterSpacing: "0.08em",
  textTransform: "uppercase" as const,
});

const metaValueStyle = (theme: SecretRevealTheme) => ({
  color: theme.text,
  fontSize: 12.5,
  fontFamily: theme.monoFamily,
});

const actionRowStyle = {
  display: "flex",
  flexWrap: "wrap" as const,
  gap: 8,
  alignItems: "center",
};

export function SecretRevealCard({
  theme,
  title,
  subtitle,
  body,
  endpointUrl,
  secret,
  secretPreview,
  secretVersion,
  rotatedAt,
  webhookId,
  clearReceiptAction,
}: SecretRevealCardProps) {
  const [copied, setCopied] = useState(false);
  const [stored, setStored] = useState(false);

  const downloadHref = `data:text/plain;charset=utf-8,${encodeURIComponent(
    [
      "DRTS tenant webhook secret receipt",
      `Endpoint: ${endpointUrl}`,
      `Secret version: v${secretVersion}`,
      `Rotated at: ${rotatedAt}`,
      "",
      secret,
    ].join("\n"),
  )}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div style={cardStyle}>
      <CanvasBanner
        theme={theme}
        tone="warn"
        icon="warn"
        title={title}
        body={body}
      />
      <div style={secretBoxStyle(theme)}>
        <div>
          <div style={{ color: theme.text, fontWeight: 600, marginBottom: 6 }}>
            {subtitle}
          </div>
          <p style={secretLineStyle(theme)}>{secret}</p>
        </div>
        <div style={metaGridStyle}>
          <div style={metaCardStyle(theme)}>
            <span style={metaLabelStyle(theme)}>Endpoint</span>
            <span style={metaValueStyle(theme)}>{endpointUrl}</span>
          </div>
          <div style={metaCardStyle(theme)}>
            <span style={metaLabelStyle(theme)}>Masked preview</span>
            <span style={metaValueStyle(theme)}>{secretPreview}</span>
          </div>
          <div style={metaCardStyle(theme)}>
            <span style={metaLabelStyle(theme)}>Secret version</span>
            <span style={metaValueStyle(theme)}>v{secretVersion}</span>
          </div>
          <div style={metaCardStyle(theme)}>
            <span style={metaLabelStyle(theme)}>Rotated at</span>
            <span style={metaValueStyle(theme)}>{rotatedAt}</span>
          </div>
        </div>
        <div style={actionRowStyle}>
          <button
            type="button"
            onClick={handleCopy}
            style={{
              cursor: "pointer",
              border: 0,
              background: "transparent",
              padding: 0,
            }}
          >
            <CanvasBtn theme={theme} size="sm" variant="primary">
              {copied ? "Copied" : "Copy secret"}
            </CanvasBtn>
          </button>
          <a
            href={downloadHref}
            download={`webhook-secret-v${secretVersion}.txt`}
          >
            <CanvasBtn theme={theme} size="sm" variant="secondary">
              Download .txt
            </CanvasBtn>
          </a>
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              color: theme.text,
              fontSize: 12.5,
            }}
          >
            <input
              type="checkbox"
              checked={stored}
              onChange={(event) => setStored(event.target.checked)}
            />
            I stored this secret in a secure location
          </label>
          <form action={clearReceiptAction}>
            <input type="hidden" name="webhookId" value={webhookId} />
            <button
              type="submit"
              disabled={!stored}
              style={{
                cursor: stored ? "pointer" : "not-allowed",
                border: 0,
                background: "transparent",
                padding: 0,
              }}
            >
              <CanvasBtn
                theme={theme}
                size="sm"
                variant="secondary"
                disabled={!stored}
                {...(stored
                  ? {
                      style: {
                        background: theme.success,
                        borderColor: theme.success,
                      },
                    }
                  : {})}
              >
                Done
              </CanvasBtn>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
