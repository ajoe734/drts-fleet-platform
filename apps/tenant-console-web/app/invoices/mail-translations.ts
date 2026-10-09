import { t, type Locale } from "../../lib/translations";

export function invoiceMailCopy(locale: Locale) {
  return {
    title: t("invoices.mail.title", locale),
    recipient: t("invoices.mail.recipient", locale),
    loading: t("invoices.mail.loading", locale),
    error: t("invoices.mail.error", locale),
    send: t("invoices.mail.send", locale),
    retry: t("invoices.mail.retry", locale),
    refresh: t("invoices.mail.refresh", locale),
    readOnly: t("invoices.mail.readOnly", locale),
    acceptedAt: t("invoices.mail.acceptedAt", locale),
    nextAttempt: t("invoices.mail.nextAttempt", locale),
    status: {
      not_requested: t("invoices.mail.status.not_requested", locale),
      queued: t("invoices.mail.status.queued", locale),
      sent: t("invoices.mail.status.sent", locale),
      failed: t("invoices.mail.status.failed", locale),
    },
    outcome: {
      started: t("invoices.mail.outcome.started", locale),
      sent: t("invoices.mail.outcome.sent", locale),
      failed: t("invoices.mail.outcome.failed", locale),
      uncertain: t("invoices.mail.outcome.uncertain", locale),
    },
    resend: t("invoices.mail.resend", locale),
    confirm: t("invoices.mail.confirm", locale),
    history: t("invoices.mail.history", locale),
    uncertain: t("invoices.mail.uncertain", locale),
  };
}
