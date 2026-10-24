"use client";
import { useEffect, useRef, useState } from "react";
import type { buildEmbedTheme } from "../lib/embed-presentation";
import { useTranslation } from "../lib/i18n";
type ShareState = {
  kind:
    | "idle"
    | "preparing"
    | "ready"
    | "sharing"
    | "shared"
    | "cancelled"
    | "unsupported"
    | "failed";
  file?: File;
};
export function ReferralReceiptDocumentActions({
  orderId,
  theme,
}: {
  orderId: string;
  theme: ReturnType<typeof buildEmbedTheme>;
}) {
  const { t } = useTranslation();
  const url = `/api/referral/receipt/${encodeURIComponent(orderId)}/pdf`;
  const [state, setState] = useState<ShareState>({ kind: "idle" });
  const generation = useRef(0),
    controller = useRef<AbortController | null>(null);
  useEffect(() => {
    generation.current++;
    setState({ kind: "idle" });
    return () => {
      generation.current++;
      controller.current?.abort();
    };
  }, [orderId]);
  const prepare = () => {
    if (state.kind === "preparing" || state.kind === "sharing") return;
    const id = ++generation.current;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setState({ kind: "preparing" });
    void fetch(url, {
      cache: "no-store",
      credentials: "same-origin",
      redirect: "error",
      signal: abort.signal,
    })
      .then(async (response) => {
        if (
          !response.ok ||
          (response.headers.get("content-type") ?? "").split(";")[0] !==
            "application/pdf"
        )
          throw new Error("Receipt document unavailable");
        const bytes = await response.arrayBuffer();
        if (generation.current !== id) return;
        const signature = new Uint8Array(
          bytes,
          0,
          Math.min(bytes.byteLength, 5),
        );
        if (String.fromCharCode(...signature) !== "%PDF-")
          throw new Error("Receipt document unavailable");
        const file = new File([bytes], `receipt-${orderId}.pdf`, {
          type: "application/pdf",
        });
        if (
          typeof navigator.share !== "function" ||
          typeof navigator.canShare !== "function" ||
          !navigator.canShare({ files: [file] })
        ) {
          setState({ kind: "unsupported" });
          return;
        }
        setState({ kind: "ready", file });
      })
      .catch(() => {
        if (generation.current === id) setState({ kind: "failed" });
      });
  };
  const share = () => {
    if (state.kind !== "ready" || !state.file) return;
    const file = state.file,
      id = generation.current;
    setState({ kind: "sharing", file });
    // The file is already prepared: invoke the native share operation directly
    // from this second user click, retaining the browser's user activation.
    void navigator
      .share({ files: [file], title: t("receiptDocument.shareTitle") })
      .then(() => {
        if (generation.current === id) setState({ kind: "shared" });
      })
      .catch((error: unknown) => {
        if (generation.current === id)
          setState({
            kind:
              (error as { name?: string })?.name === "AbortError"
                ? "cancelled"
                : "failed",
          });
      });
  };
  const message =
    state.kind === "preparing"
      ? t("receiptDocument.preparing")
      : state.kind === "ready"
        ? t("receiptDocument.ready")
        : state.kind === "sharing"
          ? t("receiptDocument.sharing")
          : state.kind === "shared"
            ? t("receiptDocument.shared")
            : state.kind === "cancelled"
              ? t("receiptDocument.cancelled")
              : state.kind === "unsupported"
                ? t("receiptDocument.unsupported")
                : state.kind === "failed"
                  ? t("receiptDocument.failed")
                  : null;
  const button = (disabled: boolean) =>
    ({
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: "100%",
      minHeight: 42,
      borderRadius: 12,
      padding: "10px 14px",
      border: `1px solid ${theme.line}`,
      background: theme.surface,
      color: theme.primary,
      fontFamily: theme.sans,
      fontSize: 13.5,
      fontWeight: 700,
      textDecoration: "none",
      opacity: disabled ? 0.6 : 1,
      cursor: disabled ? "default" : "pointer",
    }) as const;
  return (
    <section
      aria-label={t("receiptDocument.section")}
      style={{
        display: "grid",
        gap: 10,
        padding: 15,
        borderRadius: 16,
        background: theme.surface,
        border: `1px solid ${theme.line}`,
      }}
    >
      <a href={url} download={`receipt-${orderId}.pdf`} style={button(false)}>
        {t("receiptDocument.download")}
      </a>
      {message ? (
        <div role="status" style={{ fontSize: 12, color: theme.muted }}>
          {message}
        </div>
      ) : null}
      {state.kind === "ready" || state.kind === "sharing" ? (
        <button
          type="button"
          disabled={state.kind === "sharing"}
          onClick={share}
          style={button(state.kind === "sharing")}
        >
          {t("receiptDocument.share")}
        </button>
      ) : (
        <button
          type="button"
          disabled={state.kind === "preparing"}
          onClick={prepare}
          style={button(state.kind === "preparing")}
        >
          {state.kind === "failed" || state.kind === "cancelled"
            ? t("receiptDocument.prepareAgain")
            : t("receiptDocument.prepare")}
        </button>
      )}
    </section>
  );
}
