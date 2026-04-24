"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[ops-console] unhandled page error", error);
  }, [error]);

  return (
    <div
      style={{
        padding: "48px 32px",
        maxWidth: "520px",
      }}
    >
      <div
        style={{
          fontSize: "11px",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "#64748b",
          marginBottom: "8px",
        }}
      >
        Error
      </div>
      <h2
        style={{
          fontSize: "20px",
          fontWeight: 600,
          color: "#0f172a",
          margin: "0 0 12px",
        }}
      >
        Something went wrong
      </h2>
      <p
        style={{
          fontSize: "13.5px",
          color: "#64748b",
          margin: "0 0 24px",
          lineHeight: 1.6,
        }}
      >
        {error.message || "An unexpected error occurred loading this page."}
      </p>
      <button
        onClick={reset}
        style={{
          padding: "8px 16px",
          borderRadius: "8px",
          border: "1px solid #cbd5e1",
          background: "#0f172a",
          color: "white",
          fontSize: "13px",
          cursor: "pointer",
        }}
      >
        Try again
      </button>
    </div>
  );
}
