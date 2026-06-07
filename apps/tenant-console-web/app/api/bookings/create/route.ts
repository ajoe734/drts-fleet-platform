import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type {
  ActionReceipt,
  AuditLogRecord,
  CreateTenantBookingCommand,
  CrossAppResourceLink,
} from "@drts/contracts";
import { createTenantClient } from "@drts/api-client";
import { API_URL, DEMO_ACTOR_ID, DEMO_TENANT_ID } from "@/lib/api-client";
import { formatTenantUiError, toTenantErrorMessage } from "@/lib/error-copy";

type TenantBookingCommandResponse = {
  bookingId: string;
  orderId: string;
  status: string;
  businessDispatchSubtype: string;
  dispatchSemantics: string;
  serviceBucket: string;
};

function buildCrossAppLinks(
  bookingId: string,
  requestId: string,
): CrossAppResourceLink[] {
  return [
    {
      targetApp: "ops-console",
      route: `/bookings?bookingId=${encodeURIComponent(bookingId)}`,
      resourceType: "booking",
      resourceId: bookingId,
      openMode: "new_tab",
      label: "開啟營運訂單看板",
    },
    {
      targetApp: "platform-admin",
      route: `/audit?requestId=${encodeURIComponent(requestId)}`,
      resourceType: "audit_log",
      resourceId: requestId,
      openMode: "new_tab",
      label: "開啟平台稽核檢視",
    },
  ];
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateTenantBookingCommand;
    const client = createTenantClient(API_URL, DEMO_TENANT_ID, DEMO_ACTOR_ID);
    const requestId = randomUUID();
    const booking = await client.post<TenantBookingCommandResponse>(
      "/api/tenant/bookings",
      {
        body,
        headers: {
          "X-Request-Id": requestId,
          "Idempotency-Key": randomUUID(),
        },
      },
    );

    if (!booking?.bookingId) {
      return NextResponse.json(
        { error: "後端沒有回傳訂單編號，請稍後再試。" },
        { status: 502 },
      );
    }

    let auditEntry: AuditLogRecord | null = null;
    try {
      const auditResponse = await client.get<{ items: AuditLogRecord[] }>(
        "/api/tenant/audit",
        {
          headers: {
            "X-Request-Id": requestId,
          },
        },
      );
      auditEntry =
        auditResponse.items.find(
          (entry) =>
            entry.requestId === requestId &&
            entry.resourceType === "booking" &&
            entry.resourceId === booking.bookingId,
        ) ?? null;
    } catch {
      auditEntry = null;
    }

    const receiptStatus: ActionReceipt["status"] =
      booking.status === "accepted" ? "accepted" : "completed";
    const receipt: ActionReceipt = {
      actionId: requestId,
      auditId: auditEntry?.auditId ?? requestId,
      resourceType: "booking",
      resourceId: booking.bookingId,
      status: receiptStatus,
      message:
        receiptStatus === "accepted"
          ? "租戶指令已受理，正在等待外部派遣系統確認。"
          : "叫車已建立，請在明細頁查看審批與派遣狀態。",
    };

    return NextResponse.json({
      ok: true,
      booking: {
        bookingId: booking.bookingId,
        status: booking.status,
      },
      receipt,
      auditHref: auditEntry
        ? `/audit?auditId=${encodeURIComponent(auditEntry.auditId)}`
        : null,
      crossAppLinks: buildCrossAppLinks(booking.bookingId, requestId),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: formatTenantUiError(
          toTenantErrorMessage(error, "建立叫車失敗。"),
          "建立叫車失敗",
        ),
      },
      { status: 502 },
    );
  }
}
