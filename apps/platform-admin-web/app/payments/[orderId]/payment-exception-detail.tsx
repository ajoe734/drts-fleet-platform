"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { usePlatformAdminClient } from "@/lib/admin-client";
import { createIdempotencyKey } from "@drts/api-client";
import { useTranslation } from "@/lib/i18n";
import type { ActionReceipt } from "@drts/contracts";
import {
  CanvasActionButton,
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasPageHeader,
  CanvasPill,
  Timeline,
  buildCanvasTheme,
  type ManagementTone,
} from "@drts/ui-web";
import {
  PAYMENT_STATUSES,
  classifyPaymentExceptionError,
  parsePaymentExceptionView,
  parsePaymentRecoveryReceipt,
  paymentRecoveryCommandPath,
  paymentStatusTone,
  type PaymentActionDescriptor,
  type PaymentExceptionErrorKind,
  type PaymentExceptionView,
  type PaymentStatus,
} from "./payment-exception-model";
import {
  paymentActionLabel,
  paymentExceptionCopy,
  paymentStatusLabel,
} from "./translations";

const theme = buildCanvasTheme({
  surface: "platform",
  density: "compact",
});

const bodyStyle: CSSProperties = {
  padding: 24,
  display: "grid",
  gap: 16,
};

const splitStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 16,
  alignItems: "start",
};

const statusListStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 7,
};

function auditTone(actionName: string): ManagementTone {
  if (/fail|denied|reject/i.test(actionName)) {
    return "danger";
  }
  if (/manual|recover|pending/i.test(actionName)) {
    return "warning";
  }
  if (/capture|complete|success|refund/i.test(actionName)) {
    return "success";
  }
  return "info";
}

function formatAmount(
  locale: "en" | "zh",
  amount: PaymentExceptionView["amount"],
  unavailable: string,
) {
  if (!amount) {
    return unavailable;
  }
  return new Intl.NumberFormat(locale === "zh" ? "zh-TW" : "en-US", {
    style: "currency",
    currency: amount.currency,
    maximumFractionDigits: 0,
  }).format(amount.amountMinor / 100);
}

function formatDateTime(locale: "en" | "zh", value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Asia/Taipei",
  }).format(parsed);
}

function StatePanel({
  tone,
  title,
  body,
  action,
  testId,
}: {
  tone: "danger" | "info" | "warn";
  title: string;
  body: string;
  action?: ReactNode;
  testId: string;
}) {
  return (
    <div style={bodyStyle} data-testid={testId} role="alert">
      <CanvasBanner
        theme={theme}
        tone={tone}
        title={title}
        body={body}
        actions={action}
      />
    </div>
  );
}

function statusTitle(status: PaymentStatus, label: string) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
      <span>{label}</span>
      <CanvasPill theme={theme} tone={paymentStatusTone(status)} dot>
        {status}
      </CanvasPill>
    </span>
  );
}

export function PaymentExceptionDetail({ orderId }: { orderId: string }) {
  const client = usePlatformAdminClient();
  const { locale } = useTranslation();
  const [reloadToken, setReloadToken] = useState(0);
  const [view, setView] = useState<PaymentExceptionView | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKind, setErrorKind] = useState<PaymentExceptionErrorKind | null>(
    null,
  );
  const [invalidResponse, setInvalidResponse] = useState(false);
  const [executingAction, setExecutingAction] = useState<string | null>(null);
  const [commandError, setCommandError] = useState(false);
  const [receipt, setReceipt] = useState<ActionReceipt | null>(null);
  const [actionIntentKeys, setActionIntentKeys] = useState<
    Record<string, string>
  >({});
  const copy = (key: Parameters<typeof paymentExceptionCopy>[1]) =>
    paymentExceptionCopy(locale, key);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setView(null);
    setErrorKind(null);
    setInvalidResponse(false);

    client
      .get<unknown>(`/api/platform-admin/payments/exceptions/${encodeURIComponent(orderId)}`)
      .then((payload) => {
        if (!active) {
          return;
        }
        const parsed = parsePaymentExceptionView(payload);
        if (!parsed) {
          setInvalidResponse(true);
          return;
        }
        setView(parsed);
      })
      .catch((error: unknown) => {
        if (active) {
          setErrorKind(classifyPaymentExceptionError(error));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [client, orderId, reloadToken]);

  const retry = () => setReloadToken((current) => current + 1);

  const executeRecovery = async (descriptor: PaymentActionDescriptor) => {
    const path = paymentRecoveryCommandPath(orderId, descriptor.action);
    if (!descriptor.enabled || !path || executingAction) {
      return;
    }

    let reason: string | undefined;
    if (descriptor.requiresReason) {
      const enteredReason = window.prompt(copy("reasonPrompt"));
      if (enteredReason === null) {
        return;
      }
      reason = enteredReason.trim();
      if (!reason) {
        setCommandError(true);
        return;
      }
    } else if (
      !window.confirm(
        `${copy("confirmAction")} ${paymentActionLabel(locale, descriptor.action)}?`,
      )
    ) {
      return;
    }

    const actionKey =
      actionIntentKeys[descriptor.action] ??
      createIdempotencyKey(`payment-recovery-${descriptor.action}`);
    if (!actionIntentKeys[descriptor.action]) {
      setActionIntentKeys((prev) => ({
        ...prev,
        [descriptor.action]: actionKey,
      }));
    }

    setExecutingAction(descriptor.action);
    setCommandError(false);
    setReceipt(null);
    try {
      const payload = await client.post<unknown>(path, {
        headers: {
          "Idempotency-Key": actionKey,
        },
        ...(reason ? { body: { reason } } : {}),
      });
      const parsedReceipt = parsePaymentRecoveryReceipt(payload);
      if (!parsedReceipt) {
        setCommandError(true);
        return;
      }
      setReceipt(parsedReceipt);
      setActionIntentKeys((prev) => {
        const next = { ...prev };
        delete next[descriptor.action];
        return next;
      });
      setReloadToken((current) => current + 1);
    } catch {
      setCommandError(true);
    } finally {
      setExecutingAction(null);
    }
  };

  if (loading) {
    return (
      <StatePanel
        tone="info"
        title={copy("loadingTitle")}
        body={copy("loadingBody")}
        testId="payment-exception-loading"
      />
    );
  }

  if (invalidResponse) {
    return (
      <StatePanel
        tone="danger"
        title={copy("invalidTitle")}
        body={copy("invalidBody")}
        testId="payment-exception-invalid"
        action={
          <CanvasBtn theme={theme} onClick={retry}>
            {copy("retry")}
          </CanvasBtn>
        }
      />
    );
  }

  if (errorKind) {
    const errorCopy =
      errorKind === "forbidden"
        ? {
            title: copy("forbiddenTitle"),
            body: copy("forbiddenBody"),
            testId: "payment-exception-forbidden",
          }
        : errorKind === "not_found"
          ? {
              title: copy("notFoundTitle"),
              body: copy("notFoundBody"),
              testId: "payment-exception-not-found",
            }
          : errorKind === "unavailable"
            ? {
                title: copy("unavailableTitle"),
                body: copy("unavailableBody"),
                testId: "payment-exception-unavailable",
              }
            : {
                title: copy("errorTitle"),
                body: copy("errorBody"),
                testId: "payment-exception-error",
              };

    return (
      <StatePanel
        tone="danger"
        title={errorCopy.title}
        body={errorCopy.body}
        testId={errorCopy.testId}
        action={
          errorKind === "forbidden" ? undefined : (
            <CanvasBtn theme={theme} onClick={retry}>
              {copy("retry")}
            </CanvasBtn>
          )
        }
      />
    );
  }

  if (!view) {
    return null;
  }

  return (
    <section
      data-screen-id="P5-COM-UI-02"
      data-testid="payment-exception-detail"
    >
      <CanvasPageHeader
        theme={theme}
        sticky={false}
        title={statusTitle(view.status, `${copy("title")} · ${view.orderId}`)}
        subtitle={copy("subtitle")}
      />
      <div style={bodyStyle}>
        <CanvasBanner
          theme={theme}
          tone="info"
          title={copy("privacyTitle")}
          body={copy("privacyBody")}
          icon="lock"
        />

        {receipt ? (
          <CanvasBanner
            theme={theme}
            tone={receipt.status === "completed" ? "success" : "info"}
            title={copy("commandAccepted")}
            body={`${receipt.message} ${copy("auditReceipt")}: ${receipt.auditId}`}
            icon="check"
          />
        ) : null}
        {commandError ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            title={copy("commandFailed")}
            body={copy("commandFailedBody")}
            icon="warning"
          />
        ) : null}

        <div style={splitStyle}>
          <CanvasCard theme={theme} title={copy("paymentInfo")}>
            <CanvasDL
              theme={theme}
              cols={2}
              items={[
                { k: copy("order"), v: view.orderId, mono: true },
                {
                  k: copy("trip"),
                  v: view.tripId ?? copy("unavailable"),
                  mono: true,
                },
                {
                  k: copy("amount"),
                  v: formatAmount(locale, view.amount, copy("unavailable")),
                  mono: true,
                },
                {
                  k: copy("status"),
                  v: (
                    <CanvasPill
                      theme={theme}
                      tone={paymentStatusTone(view.status)}
                      dot
                    >
                      {paymentStatusLabel(locale, view.status)} · {view.status}
                    </CanvasPill>
                  ),
                },
                {
                  k: copy("providerReference"),
                  v: view.safeProviderReference ?? copy("unavailable"),
                  mono: true,
                },
                {
                  k: copy("attempts"),
                  v: `${view.attemptCount} ${copy("attemptUnit")}`,
                  mono: true,
                },
                {
                  k: copy("updatedAt"),
                  v: formatDateTime(locale, view.updatedAt),
                  mono: true,
                },
              ]}
            />
          </CanvasCard>

          <CanvasCard
            theme={theme}
            title={copy("recoveryTitle")}
            subtitle={copy("recoveryBody")}
          >
            {view.availableActions.length > 0 ? (
              <div
                style={statusListStyle}
                data-testid="payment-recovery-actions"
              >
                {view.availableActions.map((descriptor) => (
                  <span key={descriptor.action}>
                    {descriptor.enabled ? (
                      <CanvasBtn
                        theme={theme}
                        variant={
                          descriptor.riskLevel === "low"
                            ? "secondary"
                            : "primary"
                        }
                        danger={descriptor.riskLevel === "high"}
                        disabled={executingAction !== null}
                        icon="refresh"
                        onClick={() => void executeRecovery(descriptor)}
                      >
                        {executingAction === descriptor.action
                          ? copy("executing")
                          : paymentActionLabel(locale, descriptor.action)}
                        <span style={{ opacity: 0.72 }}>
                          · {descriptor.action}
                        </span>
                      </CanvasBtn>
                    ) : (
                      <CanvasActionButton
                        theme={theme}
                        descriptor={descriptor}
                        label={paymentActionLabel(locale, descriptor.action)}
                        en={descriptor.action}
                        icon="refresh"
                      />
                    )}
                  </span>
                ))}
              </div>
            ) : (
              <CanvasBanner
                theme={theme}
                tone="warn"
                title={copy("noRecoveryActions")}
                body={copy("pendingCommand")}
                icon="lock"
              />
            )}
          </CanvasCard>
        </div>

        <div style={splitStyle}>
          <CanvasCard theme={theme} title={copy("auditTitle")}>
            <Timeline
              density="compact"
              items={view.auditTimeline.map((event) => ({
                id: event.auditId,
                title: event.actionName,
                timestamp: formatDateTime(locale, event.createdAt),
                tone: auditTone(event.actionName),
                meta: (
                  <>
                    <CanvasPill theme={theme} tone="system">
                      {copy("actor")}: {event.actorId ?? event.actorType}
                    </CanvasPill>
                    {event.requestId ? (
                      <span>
                        {copy("request")}: {event.requestId}
                      </span>
                    ) : null}
                  </>
                ),
              }))}
              emptyState={copy("auditEmpty")}
            />
          </CanvasCard>

          <CanvasCard theme={theme} title={copy("statusTitle")}>
            <div style={statusListStyle}>
              {PAYMENT_STATUSES.map((status) => (
                <CanvasPill
                  key={status}
                  theme={theme}
                  tone={paymentStatusTone(status)}
                  dot
                >
                  {paymentStatusLabel(locale, status)} · {status}
                </CanvasPill>
              ))}
            </div>
          </CanvasCard>
        </div>
      </div>
    </section>
  );
}
