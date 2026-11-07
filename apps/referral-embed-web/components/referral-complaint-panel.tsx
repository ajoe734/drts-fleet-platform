"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type {
  SubmitReferralPassengerComplaintCommand,
  ReferralPassengerComplaintRecord,
  ReferralPassengerComplaintCategory,
} from "@drts/contracts";
import { buildEmbedTheme } from "../lib/embed-presentation";
import { useTranslation } from "../lib/i18n";
const labels = {
  service: "manualComplaint.category.service",
  fare: "manualComplaint.category.fare",
  lost_item: "manualComplaint.category.lost_item",
} as const;
const statuses: Record<string, string> = {
  new: "manualComplaint.status.new",
  assigned: "manualComplaint.status.assigned",
  under_investigation: "manualComplaint.status.in_progress",
  in_progress: "manualComplaint.status.in_progress",
  resolved: "manualComplaint.status.resolved",
  closed: "manualComplaint.status.closed",
  reopened: "manualComplaint.status.reopened",
};
type ComplaintNotice = { key: string } | { text: string };
class ComplaintCopyError extends Error {
  constructor(readonly key: string) {
    super(key);
  }
}
function complaintFailure(
  cause: unknown,
  fallbackKey: string,
): ComplaintNotice {
  return cause instanceof ComplaintCopyError
    ? { key: cause.key }
    : cause instanceof Error
      ? { text: cause.message }
      : { key: fallbackKey };
}
/** Taipei-local stamp for a missing/invalid timestamp; never shows raw ISO or "Invalid Date". Caller applies the localized "Taipei time" wording via translations.ts. */
function formatTaipeiTimestamp(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}`;
}
function savedCommand(
  value: unknown,
  orderId: string,
): SubmitReferralPassengerComplaintCommand | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Partial<SubmitReferralPassengerComplaintCommand>;
  if (
    v.orderId !== orderId ||
    !["service", "fare", "lost_item"].includes(v.category ?? "") ||
    typeof v.content !== "string" ||
    !v.content.trim() ||
    typeof v.contactRequested !== "boolean" ||
    typeof v.idempotencyKey !== "string" ||
    !v.idempotencyKey ||
    (v.category === "lost_item"
      ? typeof v.lostItemDescription !== "string" ||
        !v.lostItemDescription.trim()
      : v.lostItemDescription !== undefined)
  )
    return null;
  return v as SubmitReferralPassengerComplaintCommand;
}
export function ReferralComplaintPanel({
  orderId,
  recoveryScope,
  accent,
}: {
  orderId: string;
  recoveryScope: string;
  accent: string;
}) {
  const { t } = useTranslation();
  const statusLabel = (status: string) => {
    const key = statuses[status];
    return key ? t(key) : status;
  };
  const taipeiTime = useCallback(
    (value: string | null | undefined) => {
      const stamp = formatTaipeiTimestamp(value);
      return stamp
        ? t("manualComplaint.taipeiStamp", { stamp })
        : t("manualComplaint.timeUnknown");
    },
    [t],
  );
  const theme = buildEmbedTheme(accent),
    [open, setOpen] = useState(false);
  const [category, setCategory] =
    useState<ReferralPassengerComplaintCategory>("service");
  const [content, setContent] = useState(""),
    [lost, setLost] = useState(""),
    [contact, setContact] = useState(false);
  const [pending, setPending] =
    useState<SubmitReferralPassengerComplaintCommand | null>(null);
  const [items, setItems] = useState<ReferralPassengerComplaintRecord[] | null>(
      null,
    ),
    [detail, setDetail] = useState<ReferralPassengerComplaintRecord | null>(
      null,
    );
  const [error, setError] = useState<ComplaintNotice | null>(null),
    [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false);
  const key = `referral.complaint.recovery.v1:${recoveryScope}:${orderId}`;
  const activeKey = useRef(key);
  activeKey.current = key;
  const detailGeneration = useRef(0);
  const generation = useRef(0),
    controllers = useRef(new Set<AbortController>());
  const read = useCallback(async (path: string, init?: RequestInit) => {
    const controller = new AbortController();
    controllers.current.add(controller);
    try {
      const response = await fetch(path, {
        ...init,
        signal: controller.signal,
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok || !body?.ok)
        throw body?.error?.message
          ? new Error(body.error.message)
          : new ComplaintCopyError("manualComplaint.error.readOrSubmit");
      return body.data;
    } finally {
      controllers.current.delete(controller);
    }
  }, []);
  const endpoint = `/api/referral/complaints/${encodeURIComponent(orderId)}`;
  const refresh = useCallback(async () => {
    const ticket = ++generation.current,
      currentKey = key;
    setLoading(true);
    setError(null);
    try {
      const result = await read(endpoint);
      if (activeKey.current !== currentKey || ticket !== generation.current)
        return;
      if (
        result.orderId !== orderId ||
        !Array.isArray(result.items) ||
        result.items.some(
          (item: ReferralPassengerComplaintRecord) => item.orderId !== orderId,
        )
      )
        throw new ComplaintCopyError("manualComplaint.error.orderMismatch");
      setItems(result.items);
    } catch (cause) {
      if (activeKey.current === currentKey && ticket === generation.current)
        setError(complaintFailure(cause, "manualComplaint.error.readFailed"));
    } finally {
      if (activeKey.current === currentKey && ticket === generation.current)
        setLoading(false);
    }
  }, [endpoint, key, orderId, read]);
  useEffect(() => {
    setOpen(false);
    setPending(null);
    setItems(null);
    setDetail(null);
    setError(null);
    setMessage(null);
    setBusy(false);
    setCategory("service");
    setContent("");
    setLost("");
    setContact(false);
    try {
      const original = savedCommand(
        JSON.parse(sessionStorage.getItem(key) ?? "null"),
        orderId,
      );
      if (original) {
        setPending(original);
        setCategory(original.category);
        setContent(original.content);
        setLost(original.lostItemDescription ?? "");
        setContact(original.contactRequested);
      }
    } catch {
      /* Preserve a malformed original entry; do not send a replacement command. */
    }
    return () => {
      generation.current++;
      detailGeneration.current++;
      for (const controller of controllers.current) controller.abort();
      controllers.current.clear();
    };
  }, [key, orderId]);
  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const currentKey = key;
    const command = pending ?? {
      orderId,
      category,
      content: content.trim(),
      contactRequested: contact,
      ...(category === "lost_item" ? { lostItemDescription: lost.trim() } : {}),
      idempotencyKey: crypto.randomUUID(),
    };
    setError(null);
    setMessage(null);
    setPending(command);
    try {
      sessionStorage.setItem(key, JSON.stringify(command));
    } catch {
      setError({ key: "manualComplaint.error.saveOriginal" });
      return;
    }
    setBusy(true);
    try {
      const result = await read(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
      });
      if (activeKey.current !== currentKey) return;
      if (
        result.orderId !== orderId ||
        !result.caseNo ||
        result.idempotencyKey !== command.idempotencyKey
      )
        throw new ComplaintCopyError("manualComplaint.error.ackMismatch");
      detailGeneration.current++;
      setDetail(result);
      setMessage(result.caseNo);
      setPending(null);
      try {
        sessionStorage.removeItem(key);
      } catch {
        /* The canonical ACK is accepted; a retained original key still replays the same case. */
      }
      setContent("");
      setLost("");
      setContact(false);
      await refresh();
    } catch (cause) {
      if (activeKey.current === currentKey)
        setError(
          complaintFailure(cause, "manualComplaint.error.resultUnknown"),
        );
    } finally {
      if (activeKey.current === currentKey) setBusy(false);
    }
  }
  async function showCase(item: ReferralPassengerComplaintRecord) {
    const currentKey = key,
      ticket = ++detailGeneration.current;
    setError(null);
    try {
      const result = await read(
        `${endpoint}/${encodeURIComponent(item.caseNo)}`,
      );
      if (
        activeKey.current !== currentKey ||
        ticket !== detailGeneration.current
      )
        return;
      if (result.orderId !== orderId || result.caseNo !== item.caseNo)
        throw new ComplaintCopyError("manualComplaint.error.caseMismatch");
      setDetail(result);
    } catch (cause) {
      if (
        activeKey.current === currentKey &&
        ticket === detailGeneration.current
      )
        setError(complaintFailure(cause, "manualComplaint.error.readFailed"));
    }
  }
  const fieldStyle = {
    width: "100%",
    padding: 9,
    border: `1px solid ${theme.line}`,
    borderRadius: 8,
    background: theme.surface,
    color: theme.ink,
  };
  const controlButtonStyle = {
    display: "inline-flex",
    alignItems: "center",
    minHeight: 44,
    padding: "10px 14px",
    border: `1px solid ${theme.line}`,
    borderRadius: theme.radiusSm,
    background: theme.surface,
    color: theme.ink,
    fontFamily: theme.sans,
    fontSize: 13.5,
    fontWeight: 700,
    cursor: "pointer",
  };
  const caseButtonStyle = {
    ...controlButtonStyle,
    display: "block",
    width: "100%",
    textAlign: "left" as const,
    fontWeight: 600,
    overflowWrap: "anywhere" as const,
    wordBreak: "break-word" as const,
  };
  const detailCardStyle = {
    display: "grid",
    gap: 6,
    marginTop: 10,
    padding: 12,
    border: `1px solid ${theme.line}`,
    borderRadius: theme.radiusSm,
    background: theme.surface,
    color: theme.ink,
    overflowWrap: "anywhere" as const,
  };
  return (
    <section
      aria-label={t("manualComplaint.section")}
      style={{
        padding: 14,
        border: `1px solid ${theme.line}`,
        borderRadius: 12,
        background: theme.surface,
        color: theme.ink,
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={controlButtonStyle}
      >
        {t("manualComplaint.toggle")}
      </button>
      {open ? (
        <div>
          <p>{t("manualComplaint.order", { orderId })}</p>
          <p>{t("manualComplaint.instructions")}</p>
          <form
            onSubmit={submit}
            aria-label={t("manualComplaint.form")}
            style={{ display: "grid", gap: 10 }}
          >
            <label>
              {t("manualComplaint.category")}
              <select
                value={category}
                disabled={busy || Boolean(pending)}
                onChange={(e) =>
                  setCategory(
                    e.currentTarget.value as ReferralPassengerComplaintCategory,
                  )
                }
                style={fieldStyle}
              >
                {Object.entries(labels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {t(label)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("manualComplaint.content")}
              <textarea
                required
                maxLength={2000}
                value={content}
                disabled={busy || Boolean(pending)}
                onChange={(e) => setContent(e.currentTarget.value)}
                style={fieldStyle}
              />
            </label>
            {category === "lost_item" ? (
              <label>
                {t("manualComplaint.lostDescription")}
                <textarea
                  required
                  maxLength={1000}
                  value={lost}
                  disabled={busy || Boolean(pending)}
                  onChange={(e) => setLost(e.currentTarget.value)}
                  style={fieldStyle}
                />
              </label>
            ) : null}
            <label>
              <input
                type="checkbox"
                checked={contact}
                disabled={busy || Boolean(pending)}
                onChange={(e) => setContact(e.currentTarget.checked)}
              />
              {t("manualComplaint.contact")}
            </label>
            <button
              type="submit"
              disabled={
                busy ||
                !content.trim() ||
                (category === "lost_item" && !lost.trim())
              }
              style={{
                padding: 10,
                background: accent,
                color: "white",
                borderRadius: 8,
              }}
            >
              {busy
                ? t("manualComplaint.sending")
                : pending
                  ? t("manualComplaint.resend")
                  : t("manualComplaint.submit")}
            </button>
          </form>
          {message ? (
            <p role="status">
              {t("manualComplaint.created", { caseNo: message })}
            </p>
          ) : null}
          {error ? (
            <p role="alert">
              {"key" in error ? t(error.key) : error.text}{" "}
              {t("manualComplaint.retryNote")}
            </p>
          ) : null}
          <h3>{t("manualComplaint.listHeading")}</h3>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            style={{ ...controlButtonStyle, opacity: loading ? 0.7 : 1 }}
          >
            {t("manualComplaint.reload")}
          </button>
          {loading ? (
            <p role="status">{t("manualComplaint.loading")}</p>
          ) : items === null ? null : items.length === 0 ? (
            <p>{t("manualComplaint.empty")}</p>
          ) : (
            <ul
              style={{
                listStyle: "none",
                margin: "10px 0 0",
                padding: 0,
                display: "grid",
                gap: 8,
              }}
            >
              {items.map((item) => (
                <li key={item.caseNo}>
                  <button
                    type="button"
                    onClick={() => void showCase(item)}
                    aria-label={t("manualComplaint.viewCase", {
                      caseNo: item.caseNo,
                    })}
                    style={caseButtonStyle}
                  >
                    {item.caseNo} · {t(labels[item.category])} ·{" "}
                    {statusLabel(item.status)}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {detail ? (
            <article
              aria-label={t("manualComplaint.detail")}
              style={detailCardStyle}
            >
              <h4>{detail.caseNo}</h4>
              <p>{t("manualComplaint.order", { orderId: detail.orderId })}</p>
              <p>
                {t("manualComplaint.categoryValue", {
                  category: t(labels[detail.category]),
                })}
              </p>
              <p>
                {t("manualComplaint.statusValue", {
                  status: statusLabel(detail.status),
                })}
              </p>
              <p>{detail.content}</p>
              {detail.lostItemDescription ? (
                <p>
                  {t("manualComplaint.lostValue", {
                    description: detail.lostItemDescription,
                  })}
                </p>
              ) : null}
              <p>
                {detail.contactRequested
                  ? t("manualComplaint.contactYes")
                  : t("manualComplaint.contactNo")}
              </p>
              <p>
                {t("manualComplaint.submitted", {
                  time: taipeiTime(detail.submittedAt),
                })}
              </p>
              <p>
                {t("manualComplaint.updated", {
                  time: taipeiTime(detail.updatedAt),
                })}
              </p>
            </article>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
