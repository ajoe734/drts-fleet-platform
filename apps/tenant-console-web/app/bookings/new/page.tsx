import Link from "next/link";
import type { CSSProperties } from "react";
import type {
  EmptyReason,
  RefreshTier,
  ResourceActionDescriptor,
  TenantAddressRecord,
  TenantCostCenterRecord,
  TenantPassengerRecord,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasPageHeader,
  CanvasPill,
  type CanvasTone,
  buildCanvasTheme,
} from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";
import { TenantBookingCreateForm } from "./tenant-booking-create-form";

export const dynamic = "force-dynamic";

// Canvas authority: Tenant Console.html `TN_NewBooking` artboard — teal accent,
// dark, compact density (matches the shipped sibling routes /addresses, /rules).
const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

// packet §5.3: Booking create is a form page — refresh tier is N/A. The artboard
// declares `refreshTier="manual"` (no polling); we surface that explicitly from
// the contract enum instead of pretending a list cadence exists.
const BOOKING_CREATE_REFRESH_TIER: RefreshTier = "manual";

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const freshnessRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 10,
  fontSize: 12,
  color: th.textMuted,
};

const linkResetStyle: CSSProperties = {
  textDecoration: "none",
};

// ─────────────────────────────────────────────────────────────────────────────
// Empty / not-ready states (Q-X15 / packet §3.6) — all 6 tenant EmptyReason
// states get distinct copy + tone. The directory pickers (passengers, addresses,
// cost centers) are the page's data dependency; a hard load failure governs the
// body, while a healthy-but-empty directory degrades to manual entry.
// ─────────────────────────────────────────────────────────────────────────────

type DirectoryLoadError = { reason: EmptyReason; message: string };

type BookingCreateData = {
  passengers: TenantPassengerRecord[];
  addresses: TenantAddressRecord[];
  costCenters: TenantCostCenterRecord[];
  // Hard failure of the passenger directory blocks reliable booking-on-behalf;
  // address / cost-center failures degrade silently to manual entry.
  loadError: DirectoryLoadError | null;
};

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知錯誤";
}

// Tenant list endpoints surface failures as `Error("API error <status>: …")`.
// Map the HTTP class onto the EmptyReason taxonomy so the empty state stays
// honest instead of collapsing every failure into "no data".
function classifyLoadFailure(error: unknown): DirectoryLoadError {
  const message = toErrorMessage(error);
  const statusMatch = message.match(/API error (\d{3})/);
  const status = statusMatch ? Number(statusMatch[1]) : null;

  if (status === 401 || status === 403) {
    return { reason: "permission_denied", message };
  }
  if (status === 404 || status === 501) {
    return { reason: "not_provisioned", message };
  }
  if (status !== null && status >= 502 && status <= 504) {
    return { reason: "external_unavailable", message };
  }
  return { reason: "fetch_failed", message };
}

async function loadBookingCreateData(): Promise<BookingCreateData> {
  const client = getTenantClient();
  const [passengersResult, addressesResult, costCentersResult] =
    await Promise.allSettled([
      client.listPassengers() as Promise<TenantPassengerRecord[]>,
      client.listAddresses() as Promise<TenantAddressRecord[]>,
      client.listCostCenters({ activeOnly: true }) as Promise<
        TenantCostCenterRecord[]
      >,
    ]);

  // The passenger directory is the primary dependency for booking-on-behalf; a
  // hard failure there governs the page-level empty state.
  if (passengersResult.status === "rejected") {
    return {
      passengers: [],
      addresses: [],
      costCenters: [],
      loadError: classifyLoadFailure(passengersResult.reason),
    };
  }

  const passengers = passengersResult.value.filter((row) => row.activeFlag);
  const addresses =
    addressesResult.status === "fulfilled"
      ? addressesResult.value.filter((row) => row.activeFlag)
      : [];
  const costCenters =
    costCentersResult.status === "fulfilled"
      ? costCentersResult.value.filter((row) => row.activeFlag)
      : [];

  return { passengers, addresses, costCenters, loadError: null };
}

type EmptyStatePresentation = {
  tone: CanvasTone;
  title: string;
  body: string;
  cta?: { label: string; href: string; primary?: boolean };
};

const EMPTY_STATE_PRESENTATION: Record<EmptyReason, EmptyStatePresentation> = {
  no_data: {
    tone: "info",
    title: "尚無乘客 / 地址資料",
    body: "此租戶的通訊錄與地址簿目前為空，仍可改用手動輸入建立訂單，或先建立常用資料加速後續流程。",
    cta: { label: "前往乘客通訊錄", href: "/passengers", primary: true },
  },
  not_provisioned: {
    tone: "warn",
    title: "訂單建立尚未開通",
    body: "此租戶的訂單模組尚未完成設定，請聯絡平台管理員完成開通後再建立訂單。",
  },
  fetch_failed: {
    tone: "danger",
    title: "無法載入建立訂單所需資料",
    body: "讀取乘客通訊錄時發生錯誤，請稍後重新整理再試一次。",
    cta: { label: "重新整理", href: "/bookings/new" },
  },
  permission_denied: {
    tone: "warn",
    title: "沒有建立訂單的權限",
    body: "您目前的角色無法在此租戶建立訂單，請洽租戶管理員調整權限 (CTAs 依 availableActions，非硬編 role)。",
    cta: { label: "返回訂單列表", href: "/bookings" },
  },
  external_unavailable: {
    tone: "warn",
    title: "服務暫時無法使用",
    body: "後端乘客 / 地址服務暫時無法回應，這是暫時性狀況，稍後會自動恢復。",
    cta: { label: "重新整理", href: "/bookings/new" },
  },
  driver_not_eligible: {
    // Driver-app-only reason (Q-DRV01); never expected on a tenant console form.
    tone: "neutral",
    title: "不適用",
    body: "此狀態僅用於司機端，不適用於租戶訂單建立。",
  },
  filtered_empty: {
    // No server-side filtering on a create form; included for taxonomy parity.
    tone: "neutral",
    title: "沒有符合條件的資料",
    body: "建立訂單頁不套用列表篩選，此狀態不適用於本頁。",
    cta: { label: "返回訂單列表", href: "/bookings" },
  },
};

function BookingEmptyState({ reason }: { reason: EmptyReason }) {
  const presentation = EMPTY_STATE_PRESENTATION[reason];
  return (
    <CanvasCard theme={th} padding={0}>
      <div
        style={{
          padding: "44px 24px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 10,
          textAlign: "center",
        }}
      >
        <CanvasPill theme={th} tone={presentation.tone} dot>
          {reason}
        </CanvasPill>
        <div style={{ color: th.text, fontWeight: 600, fontSize: 14 }}>
          {presentation.title}
        </div>
        <div style={{ color: th.textMuted, fontSize: 12.5, maxWidth: 460 }}>
          {presentation.body}
        </div>
        {presentation.cta ? (
          <Link href={presentation.cta.href} style={linkResetStyle}>
            <CanvasBtn
              theme={th}
              size="sm"
              variant={presentation.cta.primary ? "primary" : "secondary"}
            >
              {presentation.cta.label}
            </CanvasBtn>
          </Link>
        ) : null}
      </div>
    </CanvasCard>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Route availableActions (Q-X13): the backend would normally return these per
// resource so the UI renders CTAs without hard-coding role→action. The create
// form owns its own command surface, so the route declares the descriptor set
// and the client resolves each CTA via findAction (mirrors the shipped /rules
// route). The form overlays live runtime state (submitting / policy-blocked /
// missing fields) onto these base descriptors — it never invents new ones.
// ─────────────────────────────────────────────────────────────────────────────

const BOOKING_CREATE_ACTIONS: readonly ResourceActionDescriptor[] = [
  { action: "view_list", enabled: true, riskLevel: "low" },
  { action: "submit_command", enabled: true, riskLevel: "medium" },
  // Drafts are not a published tenant command (Q-TEN04 synchronous command
  // only) — surface the affordance disabled with a reason, never hidden.
  {
    action: "save_draft",
    enabled: false,
    disabledReasonCode: "drafts_not_supported",
    riskLevel: "low",
  },
  { action: "cancel_form", enabled: true, riskLevel: "low" },
] as const;

function findAction(
  actions: readonly ResourceActionDescriptor[],
  action: string,
): ResourceActionDescriptor | null {
  return actions.find((item) => item.action === action) ?? null;
}

const EMPTY_REASONS: readonly EmptyReason[] = [
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "filtered_empty",
] as const;

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  return null;
}

// QA / parity override so all six tenant EmptyReason states can be rendered
// distinctly (mirrors the shipped /rules + /addresses convention).
function parseEmptyReasonOverride(value: string | null): EmptyReason | null {
  return value && EMPTY_REASONS.includes(value as EmptyReason)
    ? (value as EmptyReason)
    : null;
}

export default async function NewBookingPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolved = (await searchParams) ?? {};
  const emptyReasonOverride = parseEmptyReasonOverride(
    firstParam(resolved.emptyReason),
  );

  const { passengers, addresses, costCenters, loadError } =
    await loadBookingCreateData();

  // Pre-fill shortcuts per packet §4.2: /passengers → /bookings/new with
  // passenger pre-filled; /addresses → /bookings/new with address pre-filled.
  const initialPassengerId = firstParam(resolved.passengerId);
  const initialPickupAddressId = firstParam(resolved.pickupAddressId);
  const initialDropoffAddressId = firstParam(resolved.dropoffAddressId);

  const directoriesEmpty =
    passengers.length === 0 &&
    addresses.length === 0 &&
    costCenters.length === 0;

  // CTAs are resolved from the route availableActions, not hard-coded.
  const viewListAction = findAction(BOOKING_CREATE_ACTIONS, "view_list");

  // Override (preview) > hard passenger-directory failure > healthy-but-empty.
  // Only override + a hard failure block the form; an empty directory still
  // supports manual booking, so it degrades to a soft banner above the form.
  const blockingEmptyReason: EmptyReason | null =
    emptyReasonOverride ?? loadError?.reason ?? null;

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="建立叫車"
        subtitle="代訂或本人 · 預約 / 即時 · 同步 command 模式 (Q-TEN04) · POST /api/tenant/bookings/commands/create"
        actions={
          <Link href="/bookings" style={linkResetStyle}>
            <CanvasBtn
              theme={th}
              size="sm"
              variant="secondary"
              icon="ext"
              disabled={!viewListAction?.enabled}
            >
              訂單列表
            </CanvasBtn>
          </Link>
        }
      />

      <div style={pageBodyStyle}>
        <div style={freshnessRowStyle}>
          <CanvasPill theme={th} tone="neutral" dot>
            refresh: {BOOKING_CREATE_REFRESH_TIER}
          </CanvasPill>
          <span>表單頁無自動刷新 (refresh tier N/A · packet §5.3)</span>
        </div>

        {loadError ? (
          <CanvasBanner
            theme={th}
            tone={loadError.reason === "fetch_failed" ? "danger" : "warn"}
            icon="warn"
            title="無法載入建立訂單所需資料"
            body={loadError.message}
          />
        ) : null}

        {blockingEmptyReason ? (
          <BookingEmptyState reason={blockingEmptyReason} />
        ) : (
          <>
            {directoriesEmpty ? (
              <CanvasBanner
                theme={th}
                tone="info"
                icon="bookings"
                title="通訊錄與地址簿目前為空"
                body="仍可改用手動輸入建立訂單；或先到乘客 / 地址頁建立常用資料，加速後續建單。"
              />
            ) : null}
            <TenantBookingCreateForm
              passengers={passengers}
              addresses={addresses}
              costCenters={costCenters}
              availableActions={[...BOOKING_CREATE_ACTIONS]}
              initialPassengerId={initialPassengerId}
              initialPickupAddressId={initialPickupAddressId}
              initialDropoffAddressId={initialDropoffAddressId}
            />
          </>
        )}
      </div>
    </div>
  );
}
