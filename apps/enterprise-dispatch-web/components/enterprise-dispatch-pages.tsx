import Link from "next/link";
import type { CSSProperties } from "react";
import { CanvasIcon } from "@drts/ui-web";
import {
  EnterpriseBanner,
  EnterpriseBtn,
  EnterpriseCard,
  EnterpriseDl,
  EnterprisePageHeader,
  EnterprisePill,
  EnterpriseSection,
} from "@/components/enterprise-primitives";
import {
  activeTrip,
  bookingStateMeta,
  detailBooking,
  enterpriseBookings,
  enterpriseQuota,
  enterpriseTenant,
  helpFaqs,
  policyNotes,
  receiptBooking,
  type EnterpriseAction,
  type EnterpriseBooking,
} from "@/lib/enterprise-fixtures";
import { enterprisePageStyle, enterpriseTheme } from "@/lib/enterprise-theme";

function actionVariant(
  action: EnterpriseAction,
): "primary" | "secondary" | "ghost" {
  if (action.riskLevel === "high") {
    return "ghost";
  }
  if (action.riskLevel === "medium") {
    return "secondary";
  }
  return "primary";
}

function actionTone(action: EnterpriseAction) {
  if (action.riskLevel === "high") {
    return {
      background: enterpriseTheme.dangerBg,
      border: enterpriseTheme.dangerBorder,
      color: enterpriseTheme.danger,
    };
  }
  return null;
}

function EnterpriseActionLink({
  action,
  width,
}: {
  action: EnterpriseAction;
  width?: string | number;
}) {
  const variant = actionVariant(action);
  const riskTone = actionTone(action);
  const href = action.href;
  const disabled = !action.enabled || !href;
  const content = (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        width: width ?? "auto",
      }}
    >
      <span>{action.label}</span>
      {!action.enabled && action.disabledReasonCode ? (
        <span
          style={{
            fontSize: 10,
            fontFamily: enterpriseTheme.monoFamily,
            opacity: 0.72,
          }}
        >
          {action.disabledReasonCode}
        </span>
      ) : null}
    </span>
  );

  if (disabled) {
    return (
      <EnterpriseBtn
        variant={variant}
        disabled
        style={{
          ...(width ? { width } : {}),
          ...(riskTone
            ? {
                background: riskTone.background,
                borderColor: riskTone.border,
                color: riskTone.color,
              }
            : {}),
        }}
      >
        {content}
      </EnterpriseBtn>
    );
  }

  return (
    <Link
      href={href}
      style={{ textDecoration: "none", ...(width ? { width } : {}) }}
    >
      <EnterpriseBtn
        variant={variant}
        style={{
          width: "100%",
          ...(riskTone
            ? {
                background: riskTone.background,
                borderColor: riskTone.border,
                color: riskTone.color,
              }
            : {}),
        }}
      >
        {content}
      </EnterpriseBtn>
    </Link>
  );
}

function actionGroupStyle(columns = "repeat(auto-fit, minmax(120px, 1fr))") {
  return {
    display: "grid",
    gap: 8,
    gridTemplateColumns: columns,
  } satisfies CSSProperties;
}

function BookingSummaryCard({ booking }: { booking: EnterpriseBooking }) {
  return (
    <EnterpriseCard
      title={`${booking.passenger} · ${booking.id}`}
      actions={
        <EnterprisePill tone={bookingStateMeta[booking.state].tone}>
          {bookingStateMeta[booking.state].label}
        </EnterprisePill>
      }
    >
      <EnterpriseDl
        cols={2}
        items={[
          {
            k: "乘客 / 下單人",
            v: booking.self
              ? `${booking.passenger} / 本人`
              : `${booking.passenger} / ${booking.bookedBy} 代訂`,
          },
          { k: "成本中心", v: booking.costCenter, mono: true },
          { k: "上車", v: booking.from },
          { k: "下車", v: booking.to },
          { k: "預約時間", v: booking.window, mono: true },
          { k: "費用歸屬", v: booking.totalLabel },
        ]}
      />
      <div style={{ marginTop: 12, ...actionGroupStyle() }}>
        {booking.availableActions.map((action) => (
          <EnterpriseActionLink key={action.action} action={action} />
        ))}
      </div>
    </EnterpriseCard>
  );
}

function ProgressRail() {
  return (
    <EnterpriseCard title="目前進度">
      <div style={{ display: "grid", gap: 12 }}>
        {activeTrip.progress?.map((step, index) => {
          const current = step.status === "current";
          const done = step.status === "done";

          return (
            <div
              key={step.key}
              style={{
                display: "grid",
                gridTemplateColumns: "22px 1fr",
                gap: 12,
                alignItems: "start",
              }}
            >
              <div
                style={{
                  display: "grid",
                  justifyItems: "center",
                  gap: 4,
                }}
              >
                <span
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 999,
                    background: done
                      ? enterpriseTheme.accent
                      : current
                        ? enterpriseTheme.info
                        : enterpriseTheme.surface,
                    border: `2px solid ${
                      done
                        ? enterpriseTheme.accent
                        : current
                          ? enterpriseTheme.info
                          : enterpriseTheme.border
                    }`,
                    marginTop: 3,
                  }}
                />
                {index < (activeTrip.progress?.length ?? 0) - 1 ? (
                  <span
                    style={{
                      width: 2,
                      minHeight: 34,
                      background: done
                        ? enterpriseTheme.accentBorder
                        : enterpriseTheme.border,
                    }}
                  />
                ) : null}
              </div>
              <div style={{ paddingBottom: 6 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <strong style={{ fontSize: 13 }}>{step.label}</strong>
                  <EnterprisePill
                    tone={current ? "info" : done ? "success" : "neutral"}
                  >
                    {step.status}
                  </EnterprisePill>
                </div>
                {step.at ? (
                  <div
                    style={{
                      marginTop: 4,
                      fontSize: 11.5,
                      color: enterpriseTheme.textMuted,
                      fontFamily: enterpriseTheme.monoFamily,
                    }}
                  >
                    {step.at}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </EnterpriseCard>
  );
}

export function HistoryPageContent() {
  return (
    <div style={enterprisePageStyle}>
      <EnterprisePageHeader
        title="我的預約"
        subtitle="歷史、進行中與待審批預約共用同一個自助前台。"
      />

      <EnterpriseBanner
        tone="info"
        title="availableActions 為唯一可操作來源"
        body="列表與詳情只渲染 backend 提供的 availableActions；禁用原因也需原樣保留。"
      />

      <EnterpriseSection>
        <EnterpriseCard title="年度額度">
          <div
            style={{
              padding: 16,
              borderRadius: 12,
              background: `linear-gradient(180deg, ${enterpriseTheme.accentBg}, ${enterpriseTheme.surface})`,
              border: `1px solid ${enterpriseTheme.accentBorder}`,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: enterpriseTheme.textMuted,
                  letterSpacing: "0.08em",
                }}
              >
                {enterpriseQuota.year} 年度
              </span>
              <span
                style={{
                  fontSize: 13,
                  color: enterpriseTheme.text,
                  fontFamily: enterpriseTheme.monoFamily,
                }}
              >
                <b style={{ fontSize: 24 }}>{enterpriseQuota.remaining}</b> /{" "}
                {enterpriseQuota.total} 剩餘
              </span>
            </div>
            <div
              style={{
                height: 5,
                marginTop: 8,
                borderRadius: 999,
                background: enterpriseTheme.surface,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${(enterpriseQuota.remaining / enterpriseQuota.total) * 100}%`,
                  height: "100%",
                  background: enterpriseTheme.accent,
                }}
              />
            </div>
            <p
              style={{
                margin: "8px 0 0",
                fontSize: 12,
                color: enterpriseTheme.textMuted,
              }}
            >
              {enterpriseQuota.annualSummary}
            </p>
          </div>
        </EnterpriseCard>

        {enterpriseBookings.map((booking) => (
          <EnterpriseCard key={booking.id}>
            <div
              style={{
                display: "grid",
                gap: 12,
                gridTemplateColumns: "minmax(0, 1fr) auto",
                alignItems: "start",
              }}
            >
              <div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <strong style={{ fontSize: 14 }}>{booking.passenger}</strong>
                  <EnterprisePill tone={bookingStateMeta[booking.state].tone}>
                    {bookingStateMeta[booking.state].label}
                  </EnterprisePill>
                </div>
                <div
                  style={{
                    marginTop: 4,
                    fontSize: 12,
                    color: enterpriseTheme.textMuted,
                  }}
                >
                  {booking.dateLabel} · {booking.benefitLabel}
                </div>
                <div style={{ marginTop: 8, fontSize: 13 }}>
                  {booking.from} → {booking.to}
                </div>
                <div
                  style={{
                    marginTop: 4,
                    fontSize: 12,
                    color: enterpriseTheme.textMuted,
                  }}
                >
                  {booking.summary}
                </div>
              </div>

              <div style={{ minWidth: 92, textAlign: "right" }}>
                <div
                  style={{
                    fontSize: 12,
                    fontFamily: enterpriseTheme.monoFamily,
                    color: enterpriseTheme.text,
                  }}
                >
                  {booking.totalLabel}
                </div>
                <div
                  style={{
                    marginTop: 4,
                    fontSize: 11.5,
                    color: enterpriseTheme.textMuted,
                  }}
                >
                  {booking.id}
                </div>
              </div>
            </div>

            <div style={{ marginTop: 12, ...actionGroupStyle() }}>
              {booking.availableActions.map((action) => (
                <EnterpriseActionLink key={action.action} action={action} />
              ))}
            </div>
          </EnterpriseCard>
        ))}
      </EnterpriseSection>
    </div>
  );
}

export function DetailPageContent() {
  return (
    <div style={enterprisePageStyle}>
      <EnterprisePageHeader
        title="預約詳情"
        subtitle={`${detailBooking.id} · 以 availableActions 決定可修改、撤回或僅可讀。`}
      />
      <EnterpriseSection>
        <BookingSummaryCard booking={detailBooking} />

        <EnterpriseCard title="審批與費用">
          <EnterpriseDl
            cols={2}
            items={[
              { k: "目前狀態", v: "待主管審批" },
              { k: "成本中心", v: detailBooking.costCenter, mono: true },
              { k: "預估費用", v: "NT$ 1,820", mono: true },
              { k: "付款方式", v: "部門月結" },
              { k: "審批原因", v: "超過單趟 NT$ 1,500 門檻" },
              { k: "下單說明", v: "晨間機場接送，需保留 20 分鐘緩衝。" },
            ]}
          />
        </EnterpriseCard>

        <EnterpriseCard title="處理提醒">
          <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 8 }}>
            {policyNotes.map((note) => (
              <li
                key={note}
                style={{ fontSize: 12.5, color: enterpriseTheme.text }}
              >
                {note}
              </li>
            ))}
          </ul>
        </EnterpriseCard>
      </EnterpriseSection>
    </div>
  );
}

export function TripPageContent() {
  return (
    <div style={{ ...enterprisePageStyle, maxWidth: 980 }}>
      <EnterprisePageHeader
        title="目前行程"
        subtitle={`${activeTrip.id} · 司機 ${activeTrip.etaMinutes} 分鐘後抵達。`}
      />

      <EnterpriseSection
        style={{
          gridTemplateColumns: "minmax(0, 1.4fr) minmax(280px, 0.9fr)",
          alignItems: "start",
        }}
      >
        <EnterpriseSection>
          <EnterpriseCard title="司機與車輛">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "56px minmax(0, 1fr) 44px",
                gap: 12,
                alignItems: "center",
              }}
            >
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 999,
                  background: `linear-gradient(150deg, ${enterpriseTheme.accent}, ${enterpriseTheme.info})`,
                  color: enterpriseTheme.surface,
                  display: "grid",
                  placeItems: "center",
                  fontSize: 18,
                  fontWeight: 800,
                }}
              >
                {activeTrip.driver?.initials}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>
                  {activeTrip.driver?.name}
                </div>
                <div
                  style={{
                    fontSize: 11.5,
                    color: enterpriseTheme.textMuted,
                  }}
                >
                  {activeTrip.driver?.rating}
                </div>
                <div
                  style={{
                    marginTop: 2,
                    fontSize: 11.5,
                    fontFamily: enterpriseTheme.monoFamily,
                    color: enterpriseTheme.accent,
                  }}
                >
                  {activeTrip.driver?.vehicle}
                </div>
              </div>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 999,
                  background: enterpriseTheme.accent,
                  color: enterpriseTheme.surface,
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <CanvasIcon name="phone" size={18} />
              </div>
            </div>
          </EnterpriseCard>

          <EnterpriseCard title="行程追蹤">
            <div
              style={{
                height: 180,
                borderRadius: 14,
                overflow: "hidden",
                background: `linear-gradient(180deg, ${enterpriseTheme.infoBg} 0%, ${enterpriseTheme.surfaceLo} 100%)`,
                position: "relative",
                border: `1px solid ${enterpriseTheme.border}`,
              }}
            >
              <svg
                width="100%"
                height="100%"
                viewBox="0 0 360 180"
                style={{ position: "absolute", inset: 0 }}
              >
                <path
                  d="M28,138 L96,104 L180,92 L270,68 L322,38"
                  stroke={enterpriseTheme.accent}
                  strokeWidth="3"
                  fill="none"
                />
                <circle cx="28" cy="138" r="6" fill={enterpriseTheme.accent} />
                <circle
                  cx="322"
                  cy="38"
                  r="7"
                  fill={enterpriseTheme.info}
                  stroke={enterpriseTheme.surface}
                  strokeWidth="2"
                />
                <circle cx="180" cy="92" r="8" fill={enterpriseTheme.accent} />
                <circle
                  cx="180"
                  cy="92"
                  r="14"
                  fill={enterpriseTheme.accent}
                  fillOpacity="0.18"
                />
              </svg>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 20,
                marginTop: 14,
                flexWrap: "wrap",
              }}
            >
              <div>
                <div style={{ fontSize: 11, color: enterpriseTheme.textMuted }}>
                  預計抵達
                </div>
                <div
                  style={{
                    fontSize: 24,
                    fontWeight: 700,
                    fontFamily: enterpriseTheme.monoFamily,
                  }}
                >
                  {activeTrip.etaMinutes} min
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: enterpriseTheme.textMuted }}>
                  剩餘距離
                </div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    fontFamily: enterpriseTheme.monoFamily,
                  }}
                >
                  2.4 km
                </div>
              </div>
              <EnterprisePill tone="success">已派車</EnterprisePill>
            </div>

            <div style={{ marginTop: 12, ...actionGroupStyle() }}>
              {activeTrip.availableActions.map((action) => (
                <EnterpriseActionLink key={action.action} action={action} />
              ))}
            </div>
          </EnterpriseCard>
        </EnterpriseSection>

        <ProgressRail />
      </EnterpriseSection>
    </div>
  );
}

export function ReceiptPageContent() {
  return (
    <div style={{ ...enterprisePageStyle, maxWidth: 920 }}>
      <EnterprisePageHeader
        title="收據"
        subtitle={`${receiptBooking.id} · 已完成並可供帳務對帳。`}
      />
      <EnterpriseSection>
        <EnterpriseCard title="行程明細">
          <EnterpriseDl
            cols={2}
            items={[
              {
                k: "出發",
                v: receiptBooking.receipt?.departedAt ?? "",
                mono: true,
              },
              {
                k: "抵達",
                v: receiptBooking.receipt?.arrivedAt ?? "",
                mono: true,
              },
              { k: "行車時間", v: receiptBooking.receipt?.duration ?? "" },
              {
                k: "距離",
                v: receiptBooking.receipt?.distance ?? "",
                mono: true,
              },
            ]}
          />
        </EnterpriseCard>

        <EnterpriseCard title="費用">
          <EnterpriseDl
            cols={1}
            items={
              receiptBooking.receipt?.lineItems.map((item) => ({
                k: item.label,
                v: item.value,
                mono: true,
              })) ?? []
            }
          />
        </EnterpriseCard>

        <EnterpriseCard title="款項與憑證">
          <EnterpriseDl
            cols={1}
            items={
              receiptBooking.receipt?.paymentItems.map((item) => ({
                k: item.label,
                v: item.value,
                mono: item.label !== "付款方式",
              })) ?? []
            }
          />
          <div
            style={{
              marginTop: 12,
              ...actionGroupStyle("repeat(2, minmax(0, 1fr))"),
            }}
          >
            {receiptBooking.availableActions.map((action) => (
              <EnterpriseActionLink key={action.action} action={action} />
            ))}
          </div>
        </EnterpriseCard>
      </EnterpriseSection>
    </div>
  );
}

export function HelpPageContent() {
  return (
    <div style={enterprisePageStyle}>
      <EnterprisePageHeader
        title="說明與支援"
        subtitle="政策、客服與爭議處理都收斂在同一個企業入口。"
      />

      <EnterpriseSection>
        <EnterpriseCard
          title="企業客服"
          style={{
            background: `linear-gradient(135deg, ${enterpriseTheme.accent}, ${enterpriseTheme.info})`,
            color: enterpriseTheme.surface,
            borderColor: "transparent",
          }}
        >
          <div style={{ fontSize: 11, opacity: 0.82, letterSpacing: "0.08em" }}>
            24 小時專線
          </div>
          <div
            style={{
              marginTop: 8,
              fontSize: 28,
              fontWeight: 800,
              fontFamily: enterpriseTheme.monoFamily,
            }}
          >
            {enterpriseTenant.supportPhone}
          </div>
          <div style={{ marginTop: 6, fontSize: 12.5, opacity: 0.88 }}>
            對帳、審批、司機接送異常都由企業客服統一受理。
          </div>
        </EnterpriseCard>

        <EnterpriseCard title="常見問題">
          <div style={{ display: "grid", gap: 12 }}>
            {helpFaqs.map((faq, index) => (
              <div
                key={faq.q}
                style={{
                  paddingBottom: 12,
                  borderBottom:
                    index === helpFaqs.length - 1
                      ? "none"
                      : `1px dashed ${enterpriseTheme.border}`,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700 }}>{faq.q}</div>
                <div
                  style={{
                    marginTop: 4,
                    fontSize: 12.5,
                    lineHeight: 1.6,
                    color: enterpriseTheme.textMuted,
                  }}
                >
                  {faq.a}
                </div>
              </div>
            ))}
          </div>
        </EnterpriseCard>

        <EnterpriseCard title="操作提醒">
          <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 8 }}>
            {policyNotes.map((note) => (
              <li
                key={note}
                style={{ fontSize: 12.5, color: enterpriseTheme.text }}
              >
                {note}
              </li>
            ))}
          </ul>
        </EnterpriseCard>
      </EnterpriseSection>
    </div>
  );
}
