"use client";
import { createIdempotencyKey } from "@drts/api-client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  VoiceCallbackOperation,
  VoiceCallbackCreateRequest,
  VoiceContactRolesView,
  VoiceCallbackTaskDetail,
  VoiceCallbackTaskView,
} from "@drts/contracts";
import { getOpsClient } from "@/lib/api-client";
import { useTranslation } from "@/lib/i18n";
import {
  CALLBACK_INTENT_STORAGE_KEY,
  newVoiceCallbackIntent,
  readVoiceCallbackIntent,
  type VoiceCallbackIntent,
} from "./intent";
import { voiceCallbackCopy } from "./translations";

export default function VoiceCallbacksPage() {
  const { locale } = useTranslation();
  const copy = voiceCallbackCopy[locale];
  const [scopes, setScopes] = useState<
    { resourceScopeId: string; brandId: string }[]
  >([]);
  const [scope, setScope] = useState("");
  const [status, setStatus] = useState<VoiceCallbackTaskView["status"] | "">(
    "",
  );
  const [tasks, setTasks] = useState<VoiceCallbackTaskView[]>([]);
  const [detail, setDetail] = useState<VoiceCallbackTaskDetail | null>(null);
  const [pending, setPending] = useState<VoiceCallbackIntent | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [recipient, setRecipient] = useState("");
  const [outcome, setOutcome] = useState<
    "answered" | "no_answer" | "busy" | "failed" | "succeeded"
  >("no_answer");
  const [ended, setEnded] = useState(false);
  const [newContactName, setNewContactName] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  const [newConsentRef, setNewConsentRef] = useState("");
  const [newContactReason, setNewContactReason] = useState("");
  const [currentContacts, setCurrentContacts] =
    useState<VoiceContactRolesView | null>(null);
  const actionInFlight = useRef(false);
  const queueRead = useRef(0);
  const detailRead = useRef(0);

  const readQueue = useCallback(
    async (resourceScopeId: string, filter: typeof status) => {
      const sequence = ++queueRead.current;
      const rows = resourceScopeId
        ? await getOpsClient().listVoiceCallbackTasks({
            resourceScopeId,
            ...(filter ? { status: filter } : {}),
          })
        : [];
      if (sequence === queueRead.current) setTasks(rows);
    },
    [],
  );

  const readDetail = useCallback(async (taskId: string) => {
    const sequence = ++detailRead.current;
    const value = await getOpsClient().getVoiceCallbackTask(taskId);
    if (sequence === detailRead.current) setDetail(value);
    return value;
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const rows = await getOpsClient().listVoiceCallbackScopes();
        if (!active) return;
        setScopes(rows);
        let stored: VoiceCallbackIntent | null = null;
        try {
          stored = readVoiceCallbackIntent(
            sessionStorage.getItem(CALLBACK_INTENT_STORAGE_KEY),
          );
        } catch {
          /* This page also works when session storage is unavailable. */
        }
        if (stored) {
          setPending(stored);
          const value = await readDetail(stored.taskId);
          if (active) setScope(value.task.resourceScopeId);
        } else setScope(rows[0]?.resourceScopeId ?? "");
      } catch {
        if (active) setNotice(copy.readFailed);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [readDetail, copy.readFailed]);

  useEffect(() => {
    void readQueue(scope, status).catch(() => setNotice(copy.readFailed));
  }, [scope, status, readQueue, copy.readFailed]);

  async function refresh() {
    try {
      const rows = await getOpsClient().listVoiceCallbackScopes();
      setScopes(rows);
      const nextScope = scope || rows[0]?.resourceScopeId || "";
      if (nextScope !== scope) setScope(nextScope);
      await readQueue(nextScope, status);
      if (detail) await readDetail(detail.task.taskId);
    } catch {
      setNotice(copy.readFailed);
    }
  }

  async function execute(intent: VoiceCallbackIntent) {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    setBusy(true);
    setPending(intent);
    try {
      sessionStorage.setItem(
        CALLBACK_INTENT_STORAGE_KEY,
        JSON.stringify(intent),
      );
    } catch {
      /* Keep the same intent in component state. */
    }
    try {
      const result = await getOpsClient().executeVoiceCallbackCommand(
        intent.taskId,
        intent.action,
        intent.body,
        intent.idempotencyKey,
      );
      setPending(null);
      try {
        sessionStorage.removeItem(CALLBACK_INTENT_STORAGE_KEY);
      } catch {
        /* The confirmed result remains available from action history. */
      }
      setNotice(result.replayed ? copy.replayed : copy.saved);
      setNotes("");
      setReason("");
      setRecipient("");
      setEnded(false);
      await Promise.all([
        readDetail(intent.taskId),
        readQueue(scope, status),
      ]).catch(() => setNotice(copy.readFailed));
    } catch {
      setNotice(copy.failed);
    } finally {
      actionInFlight.current = false;
      setBusy(false);
    }
  }

  function start(action: VoiceCallbackOperation) {
    if (!detail || pending || actionInFlight.current) return;
    if (
      (action === "cancel" || action === "transfer") &&
      (!reason.trim() || (action === "transfer" && !recipient.trim()))
    ) {
      setNotice(copy.required);
      return;
    }
    const body = {
      expectedVersion: detail.task.version,
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      ...(action === "attempt"
        ? {
            outcome,
            hangupConfirmed: ended,
            ...(ended ? { dialStatus: "hung_up" as const } : {}),
          }
        : {}),
      ...(action === "cancel" || action === "transfer"
        ? { reason: reason.trim() }
        : {}),
      ...(action === "transfer" ? { toOperatorId: recipient.trim() } : {}),
    };
    void execute(newVoiceCallbackIntent(detail.task.taskId, action, body));
  }

  async function saveRecipient() {
    if (!detail || pending || actionInFlight.current) return;
    if (
      !newContactName.trim() ||
      !newContactPhone.trim() ||
      !newConsentRef.trim() ||
      !newContactReason.trim()
    ) {
      setNotice(copy.contactRequired);
      return;
    }
    setBusy(true);
    try {
      const result = await getOpsClient().correctVoiceContact(
        detail.task.voiceSessionId,
        {
          role: "callbackRecipient",
          name: newContactName.trim(),
          phone: newContactPhone.trim(),
          consentRef: newConsentRef.trim(),
          reason: newContactReason.trim(),
        },
      );
      setCurrentContacts(result.contacts);
      setNotice(copy.recipientSaved);
      await readDetail(detail.task.taskId);
    } catch {
      setNotice(copy.failed);
    } finally {
      setBusy(false);
    }
  }
  async function createReplacement() {
    if (
      !detail ||
      detail.task.status !== "cancelled" ||
      pending ||
      actionInFlight.current
    )
      return;
    const original = detail.task;
    const storageKey = `drts-voice-callback-replacement:${original.taskId}`;
    setBusy(true);
    actionInFlight.current = true;
    try {
      let intent: { key: string; body: VoiceCallbackCreateRequest } | null =
        null;
      const raw = sessionStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          key: string;
          body: VoiceCallbackCreateRequest;
        };
        if (
          typeof parsed.key === "string" &&
          parsed.body?.replacesTaskId === original.taskId
        )
          intent = parsed;
      }
      if (!intent) {
        const live = (
          await getOpsClient().getVoiceContactRoles(original.voiceSessionId)
        ).contacts;
        if (
          !live?.callbackRecipientRevisionNumber ||
          !live.callbackRecipientConsentRef
        ) {
          setNotice(copy.contactRequired);
          return;
        }
        intent = {
          key: createIdempotencyKey("voice-callback-replacement"),
          body: {
            contactRevisionNumber: live.callbackRecipientRevisionNumber,
            consentRef: live.callbackRecipientConsentRef,
            replacesTaskId: original.taskId,
            reason: newContactReason.trim() || original.reason,
          },
        };
        sessionStorage.setItem(storageKey, JSON.stringify(intent));
      }
      const actionKey = `${original.voiceSessionId}:create_callback:${intent.key}`;
      const recovered =
        await getOpsClient().getVoiceCallbackCreateReceipt(actionKey);
      const result = recovered.task
        ? recovered
        : await getOpsClient().createVoiceCallback(
            original.voiceSessionId,
            intent.body,
            intent.key,
          );
      if (!result.task) throw new Error("callback replacement result unknown");
      sessionStorage.removeItem(storageKey);
      setCurrentContacts(null);
      await readQueue();
      await readDetail(result.task.taskId);
      setNotice(copy.saved);
    } catch {
      setNotice(copy.replacementPending);
    } finally {
      setBusy(false);
      actionInFlight.current = false;
    }
  }

  const task = detail?.task;
  const terminal =
    !!task && ["completed", "cancelled", "unreachable"].includes(task.status);
  const disabled = busy || !!pending || terminal;
  const time = (value: string | null) =>
    value
      ? new Date(value).toLocaleString(locale === "zh" ? "zh-TW" : "en")
      : "—";
  // The existing callback API represents an unset deadline with the epoch.
  // Show its absence instead of presenting a fictitious 1970 deadline.
  const dueTime = (value: string) =>
    value === "1970-01-01T00:00:00.000Z" ? "—" : time(value);
  const panel = {
    border: "1px solid #556577",
    borderRadius: 10,
    padding: 18,
    marginTop: 16,
  };

  return (
    <main aria-label={copy.title} style={{ padding: 24, maxWidth: 1400 }}>
      <Link href="/callcenter">{copy.back}</Link>
      <h1>{copy.title}</h1>
      <p>{copy.subtitle}</p>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <label>
          {copy.scope}
          <select
            aria-label={copy.scope}
            value={scope}
            disabled={busy || !!pending}
            onChange={(e) => {
              setScope(e.target.value);
              setDetail(null);
              detailRead.current++;
            }}
          >
            {scopes.map((s) => (
              <option key={s.resourceScopeId} value={s.resourceScopeId}>
                {s.brandId} · {s.resourceScopeId}
              </option>
            ))}
          </select>
        </label>
        <select
          aria-label={copy.all}
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
        >
          <option value="">{copy.all}</option>
          {Object.entries(copy.statuses).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => void refresh()} disabled={busy}>
          {copy.refresh}
        </button>
      </div>
      {notice && <p role="status">{notice}</p>}
      {pending && (
        <section style={panel}>
          <p>{copy.pending}</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void execute(pending)}
          >
            {copy.retry}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setPending(null);
              try {
                sessionStorage.removeItem(CALLBACK_INTENT_STORAGE_KEY);
              } catch {
                /* Optional browser storage. */
              }
              void refresh();
            }}
          >
            {copy.discard}
          </button>
        </section>
      )}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: 20,
        }}
      >
        <section style={panel} aria-label={copy.title}>
          {loading ? (
            <p>{copy.loading}</p>
          ) : tasks.length === 0 ? (
            <p>{copy.empty}</p>
          ) : (
            <ul style={{ paddingLeft: 18 }}>
              {tasks.map((row) => (
                <li key={row.taskId} style={{ marginBottom: 16 }}>
                  <button
                    type="button"
                    disabled={busy || !!pending}
                    aria-pressed={row.taskId === task?.taskId}
                    onClick={() => {
                      setNotice("");
                      setNotes("");
                      setReason("");
                      setRecipient("");
                      setEnded(false);
                      void readDetail(row.taskId).catch(() =>
                        setNotice(copy.readFailed),
                      );
                    }}
                  >
                    {row.reason || row.taskId} · {copy.statuses[row.status]}
                  </button>
                  <div>
                    {copy.priority[row.priority]} · {dueTime(row.dueAt)}
                  </div>
                  <small>{row.taskId}</small>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section style={panel}>
          {!task || !detail ? (
            <p>{copy.choose}</p>
          ) : (
            <>
              <h2>{copy.statuses[task.status]}</h2>
              <dl>
                <dt>{copy.call}</dt>
                <dd>{task.callId}</dd>
                <dt>{copy.order}</dt>
                <dd>{task.linkedOrderId || "—"}</dd>
                <dt>{copy.contact}</dt>
                <dd>{task.contactName || copy.contactUnknown}</dd>
                <dt>{copy.consent}</dt>
                <dd>{task.consentRef || copy.contactUnknown}</dd>
                <dt>{copy.phone}</dt>
                <dd>{task.contactPhone || copy.contactUnknown}</dd>
                <dt>{copy.role}</dt>
                <dd>
                  {task.contactRole
                    ? copy.roles[task.contactRole]
                    : copy.contactUnknown}
                </dd>
                <dt>{copy.revision}</dt>
                <dd>{task.contactRevisionNumber ?? copy.contactUnknown}</dd>
                <dt>{copy.boundAt}</dt>
                <dd>
                  {task.contactRevisionBoundAt
                    ? time(task.contactRevisionBoundAt)
                    : copy.contactUnknown}
                </dd>
                <dt>{copy.replaces}</dt>
                <dd>{task.replacesTaskId || "—"}</dd>
                <dt>{copy.replacement}</dt>
                <dd>{task.replacementTaskId || "—"}</dd>
                <dt>{copy.owner}</dt>
                <dd>{task.assignedOperatorId || copy.none}</dd>
                <dt>{copy.due}</dt>
                <dd>{dueTime(task.dueAt)}</dd>
                <dt>{copy.scheduled}</dt>
                <dd>{time(task.scheduledAt)}</dd>
                <dt>{copy.version}</dt>
                <dd>{task.version}</dd>
              </dl>
              <h3>{copy.contactHistory}</h3>
              <ul>
                {task.contactHistory?.map((item) => (
                  <li key={item.taskId}>
                    {item.taskId} · {item.name} · {copy.revision}{" "}
                    {item.revisionNumber} ·{" "}
                    {item.consentRef || copy.contactUnknown} ·{" "}
                    {time(item.boundAt)} · {item.reason}
                  </li>
                ))}
              </ul>
              <fieldset disabled={busy || !!pending}>
                <legend>{copy.correctRecipient}</legend>
                <p>{copy.replacementNotice}</p>
                <label>
                  {copy.newName}
                  <input
                    value={newContactName}
                    onChange={(event) => setNewContactName(event.target.value)}
                  />
                </label>
                <label>
                  {copy.newPhone}
                  <input
                    value={newContactPhone}
                    onChange={(event) => setNewContactPhone(event.target.value)}
                  />
                </label>
                <label>
                  {copy.newConsent}
                  <input
                    value={newConsentRef}
                    onChange={(event) => setNewConsentRef(event.target.value)}
                  />
                </label>
                <label>
                  {copy.contactReason}
                  <input
                    value={newContactReason}
                    onChange={(event) =>
                      setNewContactReason(event.target.value)
                    }
                  />
                </label>
                <button type="button" onClick={() => void saveRecipient()}>
                  {copy.saveRecipient}
                </button>
                {currentContacts && (
                  <p>
                    {copy.revision}{" "}
                    {currentContacts.callbackRecipientRevisionNumber} ·{" "}
                    {currentContacts.callbackRecipient.name} ·{" "}
                    {currentContacts.callbackRecipientConsentRef}
                  </p>
                )}
                <button
                  type="button"
                  disabled={task.status !== "cancelled"}
                  onClick={() => void createReplacement()}
                >
                  {copy.createReplacement}
                </button>
              </fieldset>
              <p>{copy.phoneNotice}</p>
              {task.dialReconcileRequired && (
                <p role="alert">{copy.reconcile}</p>
              )}
              <fieldset disabled={disabled}>
                <label>
                  {copy.notes}
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </label>
                <label>
                  {copy.outcome}
                  <select
                    aria-label={copy.outcome}
                    value={outcome}
                    onChange={(e) =>
                      setOutcome(e.target.value as typeof outcome)
                    }
                  >
                    {Object.entries(copy.outcomes).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={ended}
                    onChange={(e) => setEnded(e.target.checked)}
                  />
                  {copy.ended}
                </label>
                <label>
                  {copy.reason}
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
                <label>
                  {copy.recipient}
                  <input
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                  />
                </label>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 10,
                    marginTop: 16,
                  }}
                >
                  {(
                    [
                      "claim",
                      "attempt",
                      "complete",
                      "cancel",
                      "transfer",
                    ] as const
                  ).map((action) => (
                    <button
                      key={action}
                      type="button"
                      onClick={() => start(action)}
                    >
                      {copy[action]}
                    </button>
                  ))}
                </div>
              </fieldset>
              <h3>{copy.attempts}</h3>
              {detail.attempts.length ? (
                <ol>
                  {detail.attempts.map((a) => (
                    <li key={a.attemptId}>
                      {time(a.startedAt)} · {a.operatorId} ·{" "}
                      {copy.outcomes[a.outcome]}
                      <p>{a.notes}</p>
                      {!a.hangupConfirmed && <p>{copy.reconcile}</p>}
                    </li>
                  ))}
                </ol>
              ) : (
                <p>{copy.noAttempts}</p>
              )}
              <h3>{copy.history}</h3>
              {detail.commands.length ? (
                <ol>
                  {detail.commands.map((c) => (
                    <li key={c.receipt.commandId}>
                      {time(c.receipt.createdAt)} · {c.receipt.operatorId} ·{" "}
                      {copy.actions[c.receipt.action]}
                      {c.transfer && (
                        <p>
                          {c.transfer.fromOperatorId || copy.none} →{" "}
                          {c.transfer.toOperatorId} · {c.transfer.reason}
                        </p>
                      )}
                      {c.operatorNotes && <p>{c.operatorNotes}</p>}
                      <small>{c.receipt.commandId}</small>
                    </li>
                  ))}
                </ol>
              ) : (
                <p>{copy.noHistory}</p>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
