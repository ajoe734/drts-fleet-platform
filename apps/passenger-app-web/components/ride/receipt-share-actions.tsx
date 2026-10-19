"use client";

import { useEffect, useRef, useState } from "react";
import { passengerChrome } from "../../lib/passenger-presentation";
import { t } from "./translations";

type SharePdfState =
  | { kind: "idle" }
  | { kind: "preparing" }
  | { kind: "ready"; file: File }
  | { kind: "sharing"; file: File }
  | { kind: "fulfilled" }
  | { kind: "cancelled" }
  | { kind: "unsupported" }
  | { kind: "failed"; errorCode: string };

interface ReceiptShareActionsProps {
  pdfUrl?: string | null | undefined;
  receiptNo?: string | null | undefined;
  token: string;
  authMode?: "id" | "token" | undefined;
}

/**
 * The only two legitimate producer shapes (multi-taxi.service.ts
 * getTrustedPassengerReceiptDownloads / getPassengerReceiptDownloads).
 * A descriptor that doesn't match the current addressed context exactly
 * is rejected before any request, rather than trusted as-is.
 */
function resolveExpectedArtifactPath(
  authMode: "id" | "token" | undefined,
  token: string,
  format: "pdf" | "html",
): string {
  return authMode === "token"
    ? `/api/passenger-rides/${encodeURIComponent(token.trim())}/receipt/artifacts/${format}`
    : `/api/passenger-app/rides/${encodeURIComponent(token)}/receipt/artifacts/${format}`;
}

function isPdfSignature(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 5 &&
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46 && // F
    bytes[4] === 0x2d // -
  );
}

function extractFileName(response: Response, requestUrl: string): string {
  const disposition = response.headers.get("content-disposition") || "";
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  const raw = match?.[1] || requestUrl.split("/").pop() || "receipt.pdf";
  const base = raw.split("?")[0]!.split("#")[0]!;
  const safe = base.replace(/[^A-Za-z0-9._-]/g, "_");
  return safe || "receipt.pdf";
}

function canUseFileShare(nav: Navigator, file: File): boolean {
  return (
    typeof nav.share === "function" &&
    typeof nav.canShare === "function" &&
    nav.canShare({ files: [file] })
  );
}

/** Rejects an off-origin or unparsable descriptor before any request is sent. */
function resolveSameOriginUrl(url: string): URL | null {
  if (typeof window === "undefined") return null;
  try {
    const resolved = new URL(url, window.location.origin);
    return resolved.origin === window.location.origin ? resolved : null;
  } catch {
    return null;
  }
}

export function ReceiptShareActions({
  pdfUrl,
  receiptNo,
  token,
  authMode,
}: ReceiptShareActionsProps) {
  const [state, setState] = useState<SharePdfState>({ kind: "idle" });
  const requestIdRef = useRef(0);

  useEffect(() => {
    requestIdRef.current += 1;
    setState({ kind: "idle" });
    return () => {
      requestIdRef.current += 1;
    };
  }, [pdfUrl, receiptNo, token, authMode]);

  if (!pdfUrl) return null;

  const prepare = () => {
    if (state.kind === "preparing") return;
    const expectedPath = resolveExpectedArtifactPath(authMode, token, "pdf");
    if (pdfUrl !== expectedPath) {
      setState({
        kind: "failed",
        errorCode: "RECEIPT_DESCRIPTOR_CONTEXT_MISMATCH",
      });
      return;
    }
    const resolvedUrl = resolveSameOriginUrl(pdfUrl);
    if (!resolvedUrl) {
      setState({ kind: "failed", errorCode: "INVALID_RECEIPT_DESCRIPTOR" });
      return;
    }
    const requestId = ++requestIdRef.current;
    setState({ kind: "preparing" });
    void fetch(resolvedUrl, {
      cache: "no-store",
      credentials: "same-origin",
      redirect: "error",
    })
      .then(async (response) => {
        if (requestIdRef.current !== requestId) return;
        if (!response.ok) {
          setState({ kind: "failed", errorCode: `HTTP_${response.status}` });
          return;
        }
        const contentType = (response.headers.get("content-type") || "")
          .split(";")[0]!
          .trim();
        if (contentType !== "application/pdf") {
          setState({ kind: "failed", errorCode: "UNEXPECTED_CONTENT_TYPE" });
          return;
        }
        const buffer = await response.arrayBuffer();
        if (requestIdRef.current !== requestId) return;
        if (!isPdfSignature(new Uint8Array(buffer))) {
          setState({ kind: "failed", errorCode: "INVALID_PDF_SIGNATURE" });
          return;
        }
        const fileName = extractFileName(response, resolvedUrl.toString());
        const file = new File([buffer], fileName, { type: "application/pdf" });
        const nav = typeof navigator === "undefined" ? undefined : navigator;
        if (!nav || !canUseFileShare(nav, file)) {
          setState({ kind: "unsupported" });
          return;
        }
        setState({ kind: "ready", file });
      })
      .catch(() => {
        if (requestIdRef.current !== requestId) return;
        setState({ kind: "failed", errorCode: "RECEIPT_FETCH_FAILED" });
      });
  };

  const share = () => {
    if (state.kind !== "ready") return;
    const { file } = state;
    const requestId = requestIdRef.current;
    setState({ kind: "sharing", file });
    navigator
      .share({ files: [file], title: t.EReceipt })
      .then(() => {
        if (requestIdRef.current !== requestId) return;
        setState({ kind: "fulfilled" });
      })
      .catch((error: unknown) => {
        if (requestIdRef.current !== requestId) return;
        if (error instanceof DOMException && error.name === "AbortError") {
          setState({ kind: "cancelled" });
          return;
        }
        setState({ kind: "failed", errorCode: "SHARE_FAILED" });
      });
  };

  const statusText =
    state.kind === "preparing"
      ? t.SharePdfPreparing
      : state.kind === "ready"
        ? t.SharePdfReady
        : state.kind === "sharing"
          ? t.ShareInProgress
          : state.kind === "fulfilled"
            ? t.ShareFinished
            : state.kind === "cancelled"
              ? t.ShareCancelled
              : state.kind === "unsupported"
                ? t.ShareUnsupported
                : state.kind === "failed"
                  ? t.ShareFailed
                  : null;

  const prepareLabel =
    state.kind === "failed" || state.kind === "cancelled"
      ? t.ShareRetry
      : t.SharePdf;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {statusText ? (
        <div style={{ fontSize: 11.5, color: passengerChrome.muted }}>
          {statusText}
        </div>
      ) : null}
      {state.kind !== "ready" && state.kind !== "sharing" ? (
        <button
          type="button"
          onClick={prepare}
          disabled={state.kind === "preparing"}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 7,
            width: "100%",
            minHeight: 46,
            borderRadius: 12,
            fontSize: 14,
            fontWeight: 700,
            cursor: state.kind === "preparing" ? "default" : "pointer",
            border: `1px solid ${passengerChrome.border}`,
            fontFamily: "inherit",
            background: passengerChrome.card,
            color: passengerChrome.text,
            opacity: state.kind === "preparing" ? 0.6 : 1,
          }}
        >
          {prepareLabel}
        </button>
      ) : (
        <button
          type="button"
          onClick={share}
          disabled={state.kind === "sharing"}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 7,
            width: "100%",
            minHeight: 46,
            borderRadius: 12,
            fontSize: 14,
            fontWeight: 700,
            cursor: state.kind === "sharing" ? "default" : "pointer",
            border: "1px solid transparent",
            fontFamily: "inherit",
            background: passengerChrome.card,
            color: passengerChrome.text,
            borderColor: passengerChrome.border,
            opacity: state.kind === "sharing" ? 0.6 : 1,
          }}
        >
          {t.SharePdf}
        </button>
      )}
    </div>
  );
}
