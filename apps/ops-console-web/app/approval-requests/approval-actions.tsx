"use client";

import { useTransition } from "react";
import { CanvasBtn as Btn, buildCanvasTheme } from "@drts/ui-web";
import { formatOpsUiError } from "@/lib/error-copy";
import {
  acknowledgeBreachAction,
  approveApprovalRequestAction,
  nudgeApprovalRequestAction,
  type ApprovalActionResult,
} from "./actions";

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

type Locale = "en" | "zh";

function copy(locale: Locale, en: string, zh: string): string {
  return locale === "en" ? en : zh;
}

function formatActionMessage(locale: Locale, message: string) {
  switch (message) {
    case "MISSING_REQUEST_OR_REASON":
      return copy(
        locale,
        "Request ID and approval reason are required.",
        "請求編號與核准原因皆為必填。",
      );
    case "MISSING_REQUEST":
      return copy(locale, "Request ID is required.", "請求編號為必填。");
    case "UNKNOWN_ERROR":
      return copy(locale, "Unknown error.", "未知錯誤。");
    default:
      return formatOpsUiError(
        locale,
        message,
        copy(locale, "Approval action failed", "審批操作失敗"),
      );
  }
}

export function ApprovalActions({
  requestId,
  canApprove,
  canNudge,
  canAcknowledge,
  locale,
}: {
  requestId: string;
  canApprove: boolean;
  canNudge: boolean;
  canAcknowledge: boolean;
  locale: Locale;
}) {
  const [pending, startTransition] = useTransition();

  function handle(run: () => Promise<ApprovalActionResult>) {
    startTransition(async () => {
      const result = await run();
      if (!result.ok) {
        window.alert(
          copy(locale, "Action failed: ", "操作失敗：") +
            formatActionMessage(locale, result.message),
        );
      }
    });
  }

  function onApprove() {
    const reason = window.prompt(
      copy(
        locale,
        "Approval reason (required for this high-risk action):",
        "核准理由（高風險操作必填）：",
      ),
    );
    if (reason === null || !reason.trim()) {
      return;
    }
    handle(() => approveApprovalRequestAction(requestId, reason));
  }

  function onNudge() {
    if (
      !window.confirm(
        copy(
          locale,
          "Send a reminder for this approval request?",
          "對此審批請求發送提醒？",
        ),
      )
    ) {
      return;
    }
    handle(() => nudgeApprovalRequestAction(requestId));
  }

  function onAcknowledge() {
    if (
      !window.confirm(
        copy(
          locale,
          "Acknowledge the SLA breach for this request?",
          "確認此請求的服務時限違規？",
        ),
      )
    ) {
      return;
    }
    handle(() => acknowledgeBreachAction(requestId));
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {canApprove ? (
        <Btn
          theme={theme}
          size="xs"
          variant="primary"
          disabled={pending}
          onClick={onApprove}
        >
          {copy(locale, "Approve", "核准")}
        </Btn>
      ) : null}
      {canNudge ? (
        <Btn
          theme={theme}
          size="xs"
          variant="secondary"
          disabled={pending}
          onClick={onNudge}
        >
          {copy(locale, "Nudge", "提醒")}
        </Btn>
      ) : null}
      {canAcknowledge ? (
        <Btn
          theme={theme}
          size="xs"
          variant="secondary"
          disabled={pending}
          onClick={onAcknowledge}
        >
          {copy(locale, "Ack breach", "確認違規")}
        </Btn>
      ) : null}
    </div>
  );
}
