export const invoiceMailCopy = {
  en: {
    title: "Invoice email",
    recipient:
      "Send to the billing contact saved for this tenant. Retries keep the original recipient.",
    loading: "Loading delivery status…",
    error:
      "Unable to complete the request. Check your billing contact, permissions or mail availability, then refresh.",
    send: "Send invoice email",
    retry: "Retry pending delivery",
    refresh: "Refresh status",
    readOnly: "Billing write permission is required to send.",
    acceptedAt: "Provider accepted at",
    nextAttempt: "Next eligible attempt",
    status: {
      not_requested: "Not requested",
      queued: "Queued / in progress",
      sent: "Accepted by mail provider; mailbox receipt is not confirmed",
      failed: "Delivery attempt failed",
    },
    outcome: {
      started: "In progress",
      sent: "Provider accepted",
      failed: "Failed",
      uncertain: "Outcome unknown",
    },
  },
  zh: {
    title: "帳單寄信",
    recipient: "寄送至此租戶已儲存的帳務聯絡信箱。重試沿用首次收件人。",
    loading: "正在讀取寄送狀態…",
    error: "無法完成請求，請確認帳務信箱、權限或郵件服務狀態後重新整理。",
    send: "寄送帳單信件",
    retry: "重試待寄信件",
    refresh: "更新寄送狀態",
    readOnly: "需帳務寫入權限才能寄送。",
    acceptedAt: "供應商接受時間",
    nextAttempt: "下次可重試時間",
    status: {
      not_requested: "尚未要求寄送",
      queued: "排程中／寄送中",
      sent: "郵件供應商已接受，尚未確認收件匣收件",
      failed: "寄送嘗試失敗",
    },
    outcome: {
      started: "寄送中",
      sent: "供應商已接受",
      failed: "失敗",
      uncertain: "結果未確認",
    },
  },
};
