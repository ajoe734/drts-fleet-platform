"use client";

import { useRouter } from "next/navigation";
import {
  useId,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
  type FormEvent,
} from "react";
import type {
  DriverStatementRecord,
  EmptyReason,
  ResourceActionDescriptor,
} from "@drts/contracts";
import {
  CanvasCard as Card,
  CanvasIcon,
  CanvasPill as Pill,
  CanvasTable as Table,
  buildCanvasTheme,
  type CanvasTableColumn,
  type CanvasTone,
} from "@drts/ui-web";
import { getOpsClient } from "@/lib/api-client";
import { CanvasEmptyPanel } from "@/lib/canvas-workflow";
import { useTranslation } from "@/lib/i18n";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import { formatMinorCurrency } from "@/lib/ops-analytics";
import { t, type Locale } from "@/lib/translations";
import { driverStatementT } from "./driver-statement-translations";

export type DriverStatementActionPanelProps = {
  driverId: string;
  initialLocale: Locale;
  descriptor: ResourceActionDescriptor;
  initialStatements: DriverStatementRecord[];
  initialError: string | null;
};

type StatementRow = Record<string, unknown> & {
  statement: DriverStatementRecord;
};

type StatementErrorCategory =
  | "validation"
  | "no_eligible"
  | "forbidden"
  | "server"
  | "generic";

type StatementGenerationErrorState =
  | {
      kind: "missing_month";
      driverId: string;
      periodMonth: string;
    }
  | {
      kind: "readback_missing";
      driverId: string;
      periodMonth: string;
    }
  | {
      kind: "api_error";
      driverId: string;
      periodMonth: string;
      statusCode: number | null;
      code: string | null;
      backendMessage: string;
      category: StatementErrorCategory;
    };

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const monoStyle: CSSProperties = {
  fontFamily: theme.monoFamily,
};

function detailT(
  locale: Locale,
  key: string,
  params?: Record<string, string | number>,
) {
  return t(`drivers.detailPage.${key}`, locale, params);
}

function classifyErrorReason(error: string): EmptyReason {
  const lower = error.toLowerCase();
  if (
    lower.includes("permission") ||
    lower.includes("forbidden") ||
    lower.includes("403") ||
    lower.includes("401")
  ) {
    return "permission_denied";
  }
  if (
    lower.includes("external") ||
    lower.includes("unavailable") ||
    lower.includes("timeout") ||
    lower.includes("gateway") ||
    lower.includes("adapter")
  ) {
    return "external_unavailable";
  }
  return "fetch_failed";
}

function emptyTone(reason: EmptyReason): CanvasTone {
  if (reason === "fetch_failed") return "danger";
  if (
    reason === "permission_denied" ||
    reason === "external_unavailable" ||
    reason === "not_provisioned"
  ) {
    return "warn";
  }
  return "neutral";
}

function emptyIcon(
  reason: EmptyReason,
): "check" | "warn" | "x" | "filter" | "arrow" {
  if (reason === "no_data") return "check";
  if (reason === "not_provisioned") return "warn";
  if (reason === "fetch_failed") return "x";
  if (reason === "permission_denied") return "warn";
  if (reason === "external_unavailable") return "warn";
  return "filter";
}

function emptyTitle(locale: Locale, reason: EmptyReason) {
  switch (reason) {
    case "no_data":
      return detailT(locale, "empty.noDataTitle");
    case "not_provisioned":
      return detailT(locale, "empty.notProvisionedTitle");
    case "fetch_failed":
      return detailT(locale, "empty.snapshotUnavailableTitle");
    case "permission_denied":
      return detailT(locale, "empty.permissionRequiredTitle");
    case "external_unavailable":
      return detailT(locale, "empty.externalUnavailableTitle");
    case "filtered_empty":
      return detailT(locale, "empty.filteredEmptyTitle");
    default:
      return detailT(locale, "empty.noDataTitle");
  }
}

function defaultEmptyDescription(locale: Locale, reason: EmptyReason) {
  switch (reason) {
    case "no_data":
      return detailT(locale, "empty.noDataDescription");
    case "not_provisioned":
      return detailT(locale, "empty.notProvisionedDescription");
    case "fetch_failed":
      return detailT(locale, "empty.snapshotUnavailableDescription");
    case "permission_denied":
      return detailT(locale, "empty.permissionRequiredDescription");
    case "external_unavailable":
      return detailT(locale, "empty.externalUnavailableDescription");
    case "filtered_empty":
      return detailT(locale, "empty.filteredEmptyDescription");
    default:
      return detailT(locale, "empty.defaultDescription");
  }
}

function renderStatementsEmptyState(
  locale: Locale,
  reason: EmptyReason,
  messageOverride?: string,
) {
  return (
    <CanvasEmptyPanel
      theme={theme}
      title={
        <span
          style={{ display: "inline-flex", gap: "6px", alignItems: "center" }}
        >
          <span>{emptyTitle(locale, reason)}</span>
          <span
            style={{ ...monoStyle, fontSize: "11px", color: theme.textDim }}
          >
            {reason}
          </span>
        </span>
      }
      description={messageOverride ?? defaultEmptyDescription(locale, reason)}
      tone={emptyTone(reason)}
      density="compact"
      icon={<CanvasIcon name={emptyIcon(reason)} size={22} />}
    />
  );
}

function ctaButtonStyle(
  descriptor: ResourceActionDescriptor,
  disabled: boolean,
): CSSProperties {
  const base: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "5px 10px",
    height: "28px",
    borderRadius: "7px",
    fontSize: "12px",
    fontWeight: 500,
    lineHeight: 1,
    textDecoration: "none",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.55 : 1,
    fontFamily: theme.fontFamily,
  };

  if (descriptor.riskLevel === "high") {
    return {
      ...base,
      border: `1px solid ${theme.danger}`,
      background: theme.danger,
      color: "#fff",
    };
  }

  return {
    ...base,
    border: `1px solid ${theme.border}`,
    background: theme.surface,
    color: theme.text,
  };
}

function ctaButtonTitle(
  locale: Locale,
  descriptor: ResourceActionDescriptor,
  label: string,
): string {
  if (!descriptor.enabled) {
    return descriptor.disabledReasonCode
      ? formatOpsCodeLabel(locale, descriptor.disabledReasonCode)
      : descriptor.action;
  }
  if (descriptor.requiresReason) {
    return detailT(locale, "actionRequiresReason", {
      label,
      riskLevel: descriptor.riskLevel,
    });
  }
  return label;
}

function classifyStatementApiError(
  statusCode: number | null,
  code: string | null,
  backendMessage: string,
): StatementErrorCategory {
  const normalizedCode = (code ?? "").toUpperCase();
  const lowerMessage = backendMessage.toLowerCase();
  if (
    statusCode === 403 ||
    statusCode === 401 ||
    normalizedCode === "FORBIDDEN" ||
    normalizedCode === "UNAUTHORIZED" ||
    lowerMessage.includes("forbidden") ||
    lowerMessage.includes("permission")
  ) {
    return "forbidden";
  }
  if (lowerMessage.includes("no eligible trips")) {
    return "no_eligible";
  }
  if (
    statusCode === 400 ||
    statusCode === 422 ||
    normalizedCode === "VALIDATION_ERROR"
  ) {
    return "validation";
  }
  if (statusCode !== null && statusCode >= 500) {
    return "server";
  }
  return "generic";
}

function formatErrorHeading(
  locale: Locale,
  errorState: StatementGenerationErrorState,
): string {
  if (errorState.kind === "missing_month") {
    return driverStatementT(locale, "error.missingMonthTitle");
  }
  if (errorState.kind === "readback_missing") {
    return driverStatementT(locale, "error.readbackMissingTitle", {
      driverId: errorState.driverId,
      periodMonth: errorState.periodMonth,
    });
  }
  const params = {
    driverId: errorState.driverId,
    periodMonth: errorState.periodMonth,
  };
  switch (errorState.category) {
    case "no_eligible":
      return driverStatementT(locale, "error.noEligibleTitle", params);
    case "validation":
      return driverStatementT(locale, "error.validationTitle", params);
    case "forbidden":
      return driverStatementT(locale, "error.forbiddenTitle", params);
    case "server":
      return driverStatementT(locale, "error.serverTitle", params);
    default:
      return driverStatementT(locale, "error.genericTitle", params);
  }
}

function mergeDriverStatements(
  driverId: string,
  initialStatements: DriverStatementRecord[],
  readbackStatements: DriverStatementRecord[],
): DriverStatementRecord[] {
  const normalizedDriver = driverId.trim();
  const byStatementKey = new Map<string, DriverStatementRecord>();

  for (const item of readbackStatements) {
    if (item.driverId.trim() !== normalizedDriver) {
      continue;
    }
    byStatementKey.set(
      `${item.driverId.trim()}::${item.periodMonth.trim()}`,
      item,
    );
  }

  for (const item of initialStatements) {
    if (item.driverId.trim() !== normalizedDriver) {
      continue;
    }
    const periodKey = `${item.driverId.trim()}::${item.periodMonth.trim()}`;
    if (!byStatementKey.has(periodKey)) {
      byStatementKey.set(periodKey, item);
    }
  }

  return Array.from(byStatementKey.values()).sort((left, right) =>
    right.periodMonth.localeCompare(left.periodMonth),
  );
}

export function DriverStatementActionPanel({
  driverId,
  initialLocale,
  descriptor,
  initialStatements,
  initialError,
}: DriverStatementActionPanelProps) {
  const router = useRouter();
  const { locale: contextLocale, setLocale } = useTranslation();
  const activeLocale: Locale =
    setLocale.length > 0 ? contextLocale : initialLocale;
  const periodInputId = useId();
  const [, startTransition] = useTransition();

  const [isOpen, setIsOpen] = useState(false);
  const [periodMonth, setPeriodMonth] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [readbackStatements, setReadbackStatements] = useState<
    DriverStatementRecord[]
  >([]);
  const [acknowledgedStatement, setAcknowledgedStatement] =
    useState<DriverStatementRecord | null>(null);
  const [errorState, setErrorState] =
    useState<StatementGenerationErrorState | null>(null);
  const [activeIdempotencyKey, setActiveIdempotencyKey] = useState<
    string | null
  >(null);

  const inFlightRef = useRef(false);
  const activeIntentRef = useRef<{
    signature: string;
    idempotencyKey: string;
  } | null>(null);
  const intentSeqRef = useRef(0);

  const mergedStatements = mergeDriverStatements(
    driverId,
    initialStatements,
    readbackStatements,
  );
  const latestStatement = mergedStatements[0] ?? null;
  const statementRows: StatementRow[] = mergedStatements
    .slice(0, 6)
    .map((statement) => ({ statement }));

  const statementColumns: CanvasTableColumn<StatementRow>[] = [
    {
      h: detailT(activeLocale, "col.period"),
      w: 110,
      mono: true,
      r: (row) => row.statement.periodMonth,
    },
    {
      h: detailT(activeLocale, "col.payout"),
      w: 110,
      r: (row) => (
        <Pill
          theme={theme}
          tone={row.statement.payoutStatus === "paid" ? "success" : "warn"}
          dot
        >
          {formatOpsCodeLabel(activeLocale, row.statement.payoutStatus)}
        </Pill>
      ),
    },
    {
      h: detailT(activeLocale, "col.net"),
      w: 130,
      mono: true,
      align: "right",
      r: (row) =>
        formatMinorCurrency(
          row.statement.netAmount.amountMinor,
          row.statement.netAmount.currency,
        ),
    },
    {
      h: detailT(activeLocale, "col.receipt"),
      mono: true,
      r: (row) => row.statement.receiptNo,
    },
  ];

  function handleOpenForm() {
    if (!descriptor.enabled || inFlightRef.current) {
      return;
    }
    setIsOpen(true);
  }

  function handleCancelForm() {
    if (inFlightRef.current) {
      return;
    }
    setIsOpen(false);
    setPeriodMonth("");
    setErrorState(null);
    activeIntentRef.current = null;
    setActiveIdempotencyKey(null);
  }

  function handlePeriodMonthChange(nextValue: string) {
    setPeriodMonth(nextValue);
    const nextSignature = `${driverId.trim()}::${nextValue.trim()}`;
    if (
      activeIntentRef.current &&
      activeIntentRef.current.signature !== nextSignature
    ) {
      activeIntentRef.current = null;
      setActiveIdempotencyKey(null);
    }
  }

  async function handleSubmit() {
    if (!descriptor.enabled || inFlightRef.current) {
      return;
    }

    const normalizedDriverId = driverId.trim();
    const normalizedPeriodMonth = periodMonth.trim();
    if (!normalizedPeriodMonth) {
      setErrorState({
        kind: "missing_month",
        driverId: normalizedDriverId,
        periodMonth: "",
      });
      return;
    }

    const signature = `${normalizedDriverId}::${normalizedPeriodMonth}`;
    let idempotencyKey: string;
    if (activeIntentRef.current?.signature === signature) {
      idempotencyKey = activeIntentRef.current.idempotencyKey;
    } else {
      intentSeqRef.current += 1;
      const randomPart =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID().slice(0, 8)
          : `${Date.now().toString(36)}-${intentSeqRef.current}`;
      idempotencyKey = `ops-driver-stmt-${normalizedDriverId}-${normalizedPeriodMonth}-${intentSeqRef.current}-${randomPart}`;
      activeIntentRef.current = { signature, idempotencyKey };
    }
    setActiveIdempotencyKey(idempotencyKey);

    inFlightRef.current = true;
    setIsSubmitting(true);
    setErrorState(null);
    setAcknowledgedStatement(null);

    try {
      const client = getOpsClient();
      const generationAck: unknown = await client.generateDriverStatements(
        {
          driverId: normalizedDriverId,
          periodMonth: normalizedPeriodMonth,
        },
        { idempotencyKey },
      );
      void generationAck;

      const monthStatements: DriverStatementRecord[] =
        await client.listDriverStatements(normalizedPeriodMonth);
      const matched = monthStatements.find(
        (statement) =>
          statement.driverId.trim() === normalizedDriverId &&
          statement.periodMonth.trim() === normalizedPeriodMonth,
      );

      if (!matched) {
        setErrorState({
          kind: "readback_missing",
          driverId: normalizedDriverId,
          periodMonth: normalizedPeriodMonth,
        });
        return;
      }

      activeIntentRef.current = null;
      setAcknowledgedStatement(matched);
      setReadbackStatements((prev) => {
        const filtered = prev.filter(
          (item) =>
            item.statementId !== matched.statementId &&
            !(
              item.driverId.trim() === normalizedDriverId &&
              item.periodMonth.trim() === normalizedPeriodMonth
            ),
        );
        return [matched, ...filtered];
      });
      startTransition(() => {
        try {
          router.refresh();
        } catch {
          // ignore refresh errors in isolated unit harnesses
        }
      });
    } catch (cause) {
      const statusCode =
        typeof (cause as { statusCode?: unknown })?.statusCode === "number"
          ? (cause as { statusCode: number }).statusCode
          : null;
      const code =
        typeof (cause as { code?: unknown })?.code === "string"
          ? (cause as { code: string }).code
          : null;
      const backendMessage =
        cause instanceof Error
          ? cause.message
          : t("common.unknown", activeLocale);
      setErrorState({
        kind: "api_error",
        driverId: normalizedDriverId,
        periodMonth: normalizedPeriodMonth,
        statusCode,
        code,
        backendMessage,
        category: classifyStatementApiError(statusCode, code, backendMessage),
      });
    } finally {
      inFlightRef.current = false;
      setIsSubmitting(false);
    }
  }

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void handleSubmit();
  }

  const ctaLabel = detailT(activeLocale, "action.generateStatement");
  const ctaDisabled = !descriptor.enabled || isSubmitting;
  const ctaTitle = ctaButtonTitle(activeLocale, descriptor, ctaLabel);

  const hasPanelContent =
    isOpen ||
    isSubmitting ||
    errorState !== null ||
    acknowledgedStatement !== null;

  return (
    <Card
      theme={theme}
      title={detailT(activeLocale, "card.earningsTitle", {
        count: mergedStatements.length,
      })}
      subtitle={
        latestStatement
          ? detailT(activeLocale, "card.latestStatement", {
              periodMonth: latestStatement.periodMonth,
              amount: formatMinorCurrency(
                latestStatement.netAmount.amountMinor,
                latestStatement.netAmount.currency,
              ),
            })
          : undefined
      }
      actions={
        <button
          type="button"
          data-testid="driver-statement-open-cta"
          data-action={descriptor.action}
          disabled={ctaDisabled}
          title={ctaTitle}
          style={ctaButtonStyle(descriptor, ctaDisabled)}
          onClick={handleOpenForm}
        >
          <CanvasIcon name="arrow" size={13} />
          <span>{ctaLabel}</span>
          {descriptor.requiresReason && !ctaDisabled ? (
            <span aria-hidden style={{ fontSize: "11px", opacity: 0.85 }}>
              ✎
            </span>
          ) : null}
        </button>
      }
      padding={statementRows.length > 0 && !hasPanelContent ? 0 : 16}
    >
      <div style={{ display: "grid", gap: "12px" }}>
        {isOpen ? (
          <form
            data-testid="driver-statement-form"
            onSubmit={handleFormSubmit}
            style={{
              display: "grid",
              gap: "10px",
              padding: "12px",
              borderRadius: "8px",
              border: `1px solid ${theme.border}`,
              background: theme.surface,
            }}
          >
            <div style={{ display: "grid", gap: "4px" }}>
              <strong style={{ fontSize: "13px", color: theme.text }}>
                {driverStatementT(activeLocale, "panel.title")}
              </strong>
              <span style={{ fontSize: "12px", color: theme.textMuted }}>
                {driverStatementT(activeLocale, "panel.description", {
                  driverId,
                })}
              </span>
            </div>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "12px",
                alignItems: "flex-end",
              }}
            >
              <div style={{ display: "grid", gap: "4px" }}>
                <span style={{ fontSize: "11.5px", color: theme.textMuted }}>
                  {driverStatementT(activeLocale, "field.driverLabel")}
                </span>
                <span
                  data-testid="driver-statement-target-driver"
                  style={{
                    ...monoStyle,
                    fontSize: "12.5px",
                    fontWeight: 600,
                    padding: "6px 10px",
                    borderRadius: "6px",
                    border: `1px solid ${theme.border}`,
                    color: theme.text,
                  }}
                >
                  {driverId}
                </span>
              </div>

              <label
                htmlFor={periodInputId}
                style={{
                  display: "grid",
                  gap: "4px",
                  fontSize: "11.5px",
                  color: theme.textMuted,
                }}
              >
                <span>
                  {driverStatementT(activeLocale, "field.periodMonthLabel")}
                </span>
                <input
                  id={periodInputId}
                  data-testid="driver-statement-period-input"
                  type="text"
                  inputMode="numeric"
                  value={periodMonth}
                  disabled={isSubmitting}
                  placeholder={driverStatementT(
                    activeLocale,
                    "field.periodMonthPlaceholder",
                  )}
                  onChange={(event) =>
                    handlePeriodMonthChange(event.target.value)
                  }
                  style={{
                    ...monoStyle,
                    height: "30px",
                    padding: "4px 10px",
                    borderRadius: "6px",
                    border: `1px solid ${theme.border}`,
                    background: "transparent",
                    color: theme.text,
                    fontSize: "12.5px",
                  }}
                />
              </label>

              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button
                  type="submit"
                  data-testid="driver-statement-submit-btn"
                  disabled={isSubmitting || !descriptor.enabled}
                  style={{
                    padding: "6px 12px",
                    height: "30px",
                    borderRadius: "6px",
                    border: `1px solid ${theme.accent}`,
                    background: theme.accent,
                    color: "#fff",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor:
                      isSubmitting || !descriptor.enabled
                        ? "not-allowed"
                        : "pointer",
                    opacity: isSubmitting || !descriptor.enabled ? 0.6 : 1,
                  }}
                >
                  {isSubmitting
                    ? driverStatementT(activeLocale, "action.submitting")
                    : driverStatementT(activeLocale, "action.submit")}
                </button>
                <button
                  type="button"
                  data-testid="driver-statement-cancel-btn"
                  disabled={isSubmitting}
                  onClick={handleCancelForm}
                  style={{
                    padding: "6px 12px",
                    height: "30px",
                    borderRadius: "6px",
                    border: `1px solid ${theme.border}`,
                    background: "transparent",
                    color: theme.textMuted,
                    fontSize: "12px",
                    fontWeight: 500,
                    cursor: isSubmitting ? "not-allowed" : "pointer",
                  }}
                >
                  {driverStatementT(activeLocale, "action.cancel")}
                </button>
              </div>
            </div>

            <span style={{ fontSize: "11.5px", color: theme.textDim }}>
              {driverStatementT(activeLocale, "field.periodMonthHint")}
            </span>
          </form>
        ) : null}

        {isSubmitting ? (
          <div
            data-testid="driver-statement-busy"
            role="status"
            style={{
              padding: "10px 12px",
              borderRadius: "8px",
              border: `1px solid ${theme.accent}`,
              fontSize: "12px",
              color: theme.text,
            }}
          >
            <div>
              {driverStatementT(activeLocale, "status.busy", {
                driverId,
                periodMonth: periodMonth.trim(),
              })}
            </div>
            {activeIdempotencyKey ? (
              <div
                style={{
                  ...monoStyle,
                  fontSize: "11px",
                  color: theme.textMuted,
                  marginTop: "4px",
                }}
              >
                {driverStatementT(activeLocale, "status.idempotencyKey", {
                  idempotencyKey: activeIdempotencyKey,
                })}
              </div>
            ) : null}
          </div>
        ) : null}

        {errorState ? (
          <div
            data-testid="driver-statement-error"
            role="alert"
            style={{
              display: "grid",
              gap: "6px",
              padding: "10px 12px",
              borderRadius: "8px",
              border: `1px solid ${theme.danger}`,
              fontSize: "12px",
              color: theme.text,
            }}
          >
            <strong style={{ color: theme.danger }}>
              {formatErrorHeading(activeLocale, errorState)}
            </strong>
            <div>
              {errorState.kind === "missing_month"
                ? driverStatementT(activeLocale, "error.missingMonthBody", {
                    driverId: errorState.driverId,
                  })
                : errorState.kind === "readback_missing"
                  ? driverStatementT(
                      activeLocale,
                      "error.readbackMissingBody",
                      {
                        driverId: errorState.driverId,
                        periodMonth: errorState.periodMonth,
                      },
                    )
                  : `${errorState.code ? `[${errorState.code}] ` : ""}${errorState.backendMessage}`}
            </div>
            {errorState.kind !== "missing_month" && activeIdempotencyKey ? (
              <div
                style={{
                  ...monoStyle,
                  fontSize: "11px",
                  color: theme.textMuted,
                }}
              >
                {driverStatementT(activeLocale, "error.retryHint", {
                  idempotencyKey: activeIdempotencyKey,
                })}
              </div>
            ) : null}
            {errorState.kind !== "missing_month" ? (
              <div>
                <button
                  type="button"
                  data-testid="driver-statement-retry-btn"
                  disabled={isSubmitting || !descriptor.enabled}
                  onClick={() => void handleSubmit()}
                  style={{
                    padding: "5px 10px",
                    borderRadius: "6px",
                    border: `1px solid ${theme.border}`,
                    background: theme.surface,
                    color: theme.text,
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor:
                      isSubmitting || !descriptor.enabled
                        ? "not-allowed"
                        : "pointer",
                  }}
                >
                  {driverStatementT(activeLocale, "action.retry")}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {acknowledgedStatement ? (
          <div
            data-testid="driver-statement-receipt"
            role="status"
            style={{
              display: "grid",
              gap: "6px",
              padding: "10px 12px",
              borderRadius: "8px",
              border: `1px solid ${theme.accent}`,
              fontSize: "12px",
              color: theme.text,
            }}
          >
            <strong>{driverStatementT(activeLocale, "receipt.title")}</strong>
            <div style={monoStyle}>
              {driverStatementT(activeLocale, "receipt.summary", {
                statementId: acknowledgedStatement.statementId,
                driverId: acknowledgedStatement.driverId,
                periodMonth: acknowledgedStatement.periodMonth,
                receiptNo: acknowledgedStatement.receiptNo,
                netAmount: formatMinorCurrency(
                  acknowledgedStatement.netAmount.amountMinor,
                  acknowledgedStatement.netAmount.currency,
                ),
              })}
            </div>
            <div style={{ color: theme.textMuted }}>
              {driverStatementT(activeLocale, "receipt.meta", {
                feePlanVersion: acknowledgedStatement.feePlanVersion,
                lineCount: acknowledgedStatement.lines.length,
                payoutStatus: formatOpsCodeLabel(
                  activeLocale,
                  acknowledgedStatement.payoutStatus,
                ),
              })}
            </div>
            <div style={{ fontSize: "11.5px", color: theme.textDim }}>
              {driverStatementT(activeLocale, "receipt.boundaryNotice", {
                periodMonth: acknowledgedStatement.periodMonth,
              })}
            </div>
          </div>
        ) : null}

        {initialError && statementRows.length === 0 ? (
          renderStatementsEmptyState(
            activeLocale,
            classifyErrorReason(initialError),
            initialError,
          )
        ) : statementRows.length > 0 ? (
          <Table
            theme={theme}
            columns={statementColumns}
            rows={statementRows}
          />
        ) : (
          renderStatementsEmptyState(
            activeLocale,
            "no_data",
            detailT(activeLocale, "card.noStatements"),
          )
        )}
      </div>
    </Card>
  );
}
