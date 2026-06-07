import { NextRequest, NextResponse } from "next/server";
import type {
  AddressPayload,
  BookingRecord,
  CreateTenantBookingCommand,
  PassengerProfile,
} from "@drts/contracts";
import { formatTenantUiError, toTenantErrorMessage } from "@/lib/error-copy";
import { buildPartnerClient, getPartnerSession } from "@/lib/partner-session";

type BookingPayload = {
  pickup?: Partial<AddressPayload> & Record<string, unknown>;
  dropoff?: Partial<AddressPayload> & Record<string, unknown>;
  reservationWindowStart?: unknown;
  reservationWindowEnd?: unknown;
  passenger?: Partial<PassengerProfile> & Record<string, unknown>;
  benefitReference?: unknown;
  flightNo?: unknown;
  terminal?: unknown;
  notes?: unknown;
  costCenter?: unknown;
  vehiclePreference?: unknown;
  eligibilityVerificationId?: unknown;
  direction?: unknown;
};

function ensureString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`缺少必填欄位：${label}`);
  }
  return value.trim();
}

function ensureAddress(raw: unknown, label: string): AddressPayload {
  if (!raw || typeof raw !== "object") {
    throw new Error(`缺少${label === "pickup" ? "上車" : "下車"}地址資料。`);
  }
  const record = raw as Record<string, unknown>;
  const address = ensureString(record.address, `${label}.address`);
  const lat =
    typeof record.lat === "number"
      ? record.lat
      : Number.parseFloat(String(record.lat ?? ""));
  const lng =
    typeof record.lng === "number"
      ? record.lng
      : Number.parseFloat(String(record.lng ?? ""));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error(
      `${label === "pickup" ? "上車" : "下車"}地址的經緯度必須為數字。`,
    );
  }
  return { address, lat, lng };
}

function ensurePassenger(raw: unknown): PassengerProfile {
  if (!raw || typeof raw !== "object") {
    throw new Error("缺少乘客資料。");
  }
  const record = raw as Record<string, unknown>;
  return {
    name: ensureString(record.name, "passenger.name"),
    phone: ensureString(record.phone, "passenger.phone"),
  };
}

export async function POST(request: NextRequest) {
  const session = await getPartnerSession();
  if (!session) {
    return NextResponse.json(
      { error: "合作夥伴工作階段已過期，請重新登入。" },
      { status: 401 },
    );
  }

  if (session.partnerEntry.status !== "active") {
    return NextResponse.json(
      {
        error: `合作夥伴入口目前狀態為「${session.partnerEntry.status}」，需由平台管理端重新啟用後才能建立訂單。`,
      },
      { status: 403 },
    );
  }

  let body: BookingPayload;
  try {
    body = (await request.json()) as BookingPayload;
  } catch {
    return NextResponse.json(
      { error: "請求內容格式錯誤，無法解析訂單資料。" },
      { status: 400 },
    );
  }

  let command: CreateTenantBookingCommand;
  try {
    const reservationWindowStart = ensureString(
      body.reservationWindowStart,
      "reservationWindowStart",
    );
    const reservationWindowEnd = ensureString(
      body.reservationWindowEnd,
      "reservationWindowEnd",
    );
    const direction =
      body.direction === "pickup" || body.direction === "dropoff"
        ? body.direction
        : undefined;

    command = {
      businessDispatchSubtype: session.partnerEntry.businessDispatchSubtype,
      partnerEntrySlug: session.partnerEntry.entrySlug,
      pickup: ensureAddress(body.pickup, "pickup"),
      dropoff: ensureAddress(body.dropoff, "dropoff"),
      reservationWindowStart,
      reservationWindowEnd,
      passenger: ensurePassenger(body.passenger),
    };

    if (typeof body.eligibilityVerificationId === "string") {
      const trimmed = body.eligibilityVerificationId.trim();
      if (trimmed) {
        command.eligibilityVerificationId = trimmed;
      }
    }
    if (
      typeof body.benefitReference === "string" &&
      body.benefitReference.trim()
    ) {
      command.benefitReference = body.benefitReference.trim();
    }
    if (typeof body.flightNo === "string" && body.flightNo.trim()) {
      command.flightNo = body.flightNo.trim();
    }
    if (typeof body.terminal === "string" && body.terminal.trim()) {
      command.terminal = body.terminal.trim();
    }
    if (typeof body.notes === "string" && body.notes.trim()) {
      command.notes = body.notes.trim();
    }
    if (typeof body.costCenter === "string" && body.costCenter.trim()) {
      command.costCenter = body.costCenter.trim();
    }
    if (
      typeof body.vehiclePreference === "string" &&
      body.vehiclePreference.trim()
    ) {
      command.vehiclePreference = body.vehiclePreference.trim();
    }
    if (direction) {
      command.direction = direction;
    }
  } catch (error) {
    return NextResponse.json(
      {
        error: formatTenantUiError(
          toTenantErrorMessage(error, "建立訂單資料驗證失敗。"),
          "建立訂單資料驗證失敗",
        ),
      },
      { status: 400 },
    );
  }

  if (
    session.partnerEntry.eligibilityMode !== "none" &&
    !command.eligibilityVerificationId
  ) {
    return NextResponse.json(
      {
        error: "這個合作夥伴入口必須先完成資格驗證，才能建立訂單。",
      },
      { status: 422 },
    );
  }

  try {
    const client = buildPartnerClient(session);
    const response = (await client.createTenantBooking(command)) as
      | BookingRecord
      | { booking?: BookingRecord };

    const booking =
      response && typeof response === "object" && "bookingId" in response
        ? (response as BookingRecord)
        : (response as { booking?: BookingRecord }).booking;

    if (!booking) {
      return NextResponse.json(
        { error: "後端沒有回傳訂單資料，請稍後再試。" },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true, booking });
  } catch (error) {
    return NextResponse.json(
      {
        error: formatTenantUiError(
          toTenantErrorMessage(error, "建立訂單失敗。"),
          "建立訂單失敗",
        ),
      },
      { status: 502 },
    );
  }
}
