"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CanvasBtn as Btn, buildCanvasTheme } from "@drts/ui-web";
import { ApiClientError } from "@drts/api-client";
import { getOpsClient } from "../lib/api-client";
import { t, type Locale } from "../lib/translations";

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

export function OpsDispatchCreateButton({
  orderId,
  locale,
}: {
  orderId: string;
  locale: Locale;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<{ orderId: string; key: string } | null>(null);

  function createDispatch() {
    startTransition(async () => {
      setError(null);
      if (!pending.current || pending.current.orderId !== orderId)
        pending.current = { orderId, key: crypto.randomUUID() };
      try {
        await getOpsClient().dispatchOrder(
          orderId,
          { mode: "auto" },
          {
            headers: {
              "Idempotency-Key": pending.current.key,
              "X-Idempotency-Key": pending.current.key,
            },
          },
        );
        pending.current = null;
        router.refresh();
      } catch (cause) {
        // Follow the existing Ops command acknowledgement contract. A lost
        // response retries the same command; a domain refusal can be corrected.
        if (
          cause instanceof ApiClientError &&
          cause.statusCode >= 400 &&
          cause.statusCode < 500 &&
          cause.traceId &&
          !cause.retryable
        )
          pending.current = null;
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    });
  }

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 5 }}>
      <Btn
        theme={theme}
        variant="primary"
        icon="check"
        disabled={isPending}
        data-drt-operation="ops-dispatch-create"
        onClick={createDispatch}
      >
        {isPending
          ? t("avFallback.actions.pending", locale)
          : t("dispatch.detail.headerAction.createDispatch", locale)}
      </Btn>
      {error ? (
        <span role="alert" style={{ color: theme.danger, fontSize: 11 }}>
          {error}
        </span>
      ) : null}
    </span>
  );
}
