"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  REASSIGN_REASON_CODES,
  type AssignDispatchCommand,
  type DispatchCandidate,
  type ReassignDispatchCommand,
} from "@drts/contracts";
import { ApiClientError } from "@drts/api-client";
import { CanvasBtn as Btn, buildCanvasTheme } from "@drts/ui-web";
import { getOpsClient } from "../lib/api-client";
import { formatOpsCodeLabel } from "../lib/localized-labels";
import { t, type Locale } from "../lib/translations";

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

export function OpsDispatchAssignmentButton({
  dispatchJobId,
  candidate,
  candidates = [candidate],
  driverNames = {},
  reassign = false,
  locale,
}: {
  dispatchJobId: string;
  candidate: DispatchCandidate;
  candidates?: DispatchCandidate[];
  driverNames?: Record<string, string>;
  reassign?: boolean;
  locale: Locale;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState("");
  const [reasonCode, setReasonCode] = useState("operator_reassign");
  const [reasonNote, setReasonNote] = useState("");
  const scope = `${dispatchJobId}:${reassign ? "reassign" : "assign"}`;
  const pending = useRef<{
    scope: string;
    key: string;
    body: AssignDispatchCommand | ReassignDispatchCommand;
  } | null>(null);
  const keyFor = (entry: DispatchCandidate) =>
    `${entry.driverId}:${entry.vehicleId}`;
  const selected =
    candidates.find((entry) => keyFor(entry) === selection) ?? candidate;
  const awaitingAcknowledgement = pending.current?.scope === scope;

  function assignCandidate() {
    startTransition(async () => {
      try {
        setError(null);
        if (!pending.current || pending.current.scope !== scope)
          pending.current = {
            scope,
            key: crypto.randomUUID(),
            body: {
              dispatchJobId,
              vehicleId: selected.vehicleId,
              driverId: selected.driverId,
              ...(reassign
                ? {
                    reasonCode,
                    ...(reasonNote.trim()
                      ? { reasonNote: reasonNote.trim() }
                      : {}),
                  }
                : {}),
            },
          };
        const options = {
          headers: {
            "Idempotency-Key": pending.current.key,
            "X-Idempotency-Key": pending.current.key,
          },
        };
        const client = getOpsClient();
        if (reassign)
          await client.reassignDispatch(
            pending.current.body as ReassignDispatchCommand,
            options,
          );
        else await client.assignDispatch(pending.current.body, options);
        pending.current = null;
        router.refresh();
      } catch (cause) {
        // Match the existing Ops command contract: retry an unknown response
        // with the original body/key; permit correction after a domain refusal.
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
      <label>
        {t("dispatch.workflow.selectCandidate", locale)}
        <select
          data-drt-dispatch-candidate
          aria-label={t("dispatch.workflow.selectCandidate", locale)}
          value={keyFor(selected)}
          disabled={isPending || awaitingAcknowledgement}
          onChange={(event) => setSelection(event.target.value)}
        >
          {candidates.map((entry) => (
            <option key={keyFor(entry)} value={keyFor(entry)}>
              {driverNames[entry.driverId] ?? entry.driverId} ·{" "}
              {entry.vehicleId}
            </option>
          ))}
        </select>
      </label>
      {reassign ? (
        <>
          <label>
            {t("dispatch.detail.reassign.reason", locale)}
            <select
              data-drt-dispatch-reason
              aria-label={t("dispatch.detail.reassign.reason", locale)}
              value={reasonCode}
              disabled={isPending || awaitingAcknowledgement}
              onChange={(event) => setReasonCode(event.target.value)}
            >
              {REASSIGN_REASON_CODES.map((reason) => (
                <option key={reason} value={reason}>
                  {formatOpsCodeLabel(locale, reason)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("dispatch.detail.reassign.note", locale)}
            <input
              data-drt-dispatch-note
              aria-label={t("dispatch.detail.reassign.note", locale)}
              value={reasonNote}
              disabled={isPending || awaitingAcknowledgement}
              onChange={(event) => setReasonNote(event.target.value)}
            />
          </label>
        </>
      ) : null}
      <Btn
        theme={theme}
        variant="primary"
        icon="check"
        disabled={isPending}
        data-drt-operation={
          reassign ? "ops-dispatch-reassign" : "ops-dispatch-assign"
        }
        onClick={assignCandidate}
      >
        {isPending
          ? t("avFallback.actions.pending", locale)
          : t(
              reassign
                ? "dispatch.workflow.reassign"
                : "dispatch.detail.headerAction.assignSelectedCandidate",
              locale,
            )}
      </Btn>
      {error ? (
        <span role="alert" style={{ color: theme.danger, fontSize: 11 }}>
          {error}
        </span>
      ) : null}
    </span>
  );
}
