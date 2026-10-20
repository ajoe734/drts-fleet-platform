"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { P5 } from "../auth/ui";
import { BOOK_T as T } from "../../lib/booking/translations";

/** E-19b canonical bottom sheet, not a full-page substitute. */
export function BookingConfirmationSheet({
  children,
  canDismiss,
  onDismiss,
}: {
  children: ReactNode;
  canDismiss: boolean;
  onDismiss: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.focus();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      <div
        aria-hidden="true"
        data-booking-backdrop
        style={{
          position: "absolute",
          inset: 0,
          background: P5.ink,
          opacity: 0.45,
        }}
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={T.confirm}
        tabIndex={-1}
        data-booking-confirmation-sheet
        onKeyDown={(event) => {
          if (event.key === "Escape" && canDismiss) {
            event.preventDefault();
            onDismiss();
          }
          if (event.key !== "Tab") return;
          const targets = Array.from(
            ref.current?.querySelectorAll<HTMLElement>(
              'a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
            ) ?? [],
          );
          const first = targets[0];
          const last = targets.at(-1);
          if (!first || !last) {
            event.preventDefault();
            return;
          }
          if (
            event.shiftKey &&
            (document.activeElement === first ||
              document.activeElement === ref.current)
          ) {
            event.preventDefault();
            last.focus();
          } else if (
            !event.shiftKey &&
            (document.activeElement === last ||
              document.activeElement === ref.current)
          ) {
            event.preventDefault();
            first.focus();
          }
        }}
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 390,
          maxHeight: "90dvh",
          overflowY: "auto",
          background: P5.surface,
          color: P5.ink,
          borderRadius: "20px 20px 0 0",
          padding: "10px 14px 14px",
          boxShadow: `0 -8px 30px color-mix(in srgb, ${P5.ink} 18%, transparent)`,
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 40,
            height: 4,
            borderRadius: 2,
            background: P5.line,
            margin: "0 auto 10px",
          }}
        />
        <h2 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 8px" }}>
          {T.confirm}
        </h2>
        {children}
      </div>
    </div>
  );
}
