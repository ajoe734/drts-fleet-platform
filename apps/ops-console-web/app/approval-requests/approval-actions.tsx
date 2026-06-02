"use client";

import { useTransition } from "react";
import { CanvasBtn as Btn, buildCanvasTheme } from "@drts/ui-web";
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
          copy(locale, "Action failed: ", "操作失敗：") + result.message,
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
          "確認此請求的 SLA 違規？",
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
