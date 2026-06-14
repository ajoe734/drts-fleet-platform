import Link from "next/link";
import {
  EnterprisePill,
  EnterpriseSection,
} from "@/components/enterprise-primitives";
import { enterpriseTheme } from "@/lib/enterprise-theme";

const bookingFlowSteps = [
  { key: "home", label: "首頁", href: "/" },
  { key: "new", label: "建立預約", href: "/bookings/new" },
  { key: "review", label: "確認送出", href: "/bookings/review" },
  { key: "submitted", label: "提交結果", href: "/bookings/submitted" },
] as const;

export type BookingFlowStepKey = (typeof bookingFlowSteps)[number]["key"];

function stepLinkStyle(active: boolean) {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    borderRadius: 10,
    border: `1px solid ${
      active ? enterpriseTheme.accentBorder : enterpriseTheme.border
    }`,
    background: active ? enterpriseTheme.accentBg : enterpriseTheme.surface,
    color: active ? enterpriseTheme.accent : enterpriseTheme.text,
    fontSize: 12.5,
    fontWeight: active ? 700 : 500,
    textDecoration: "none",
  } as const;
}

export function EnterpriseBookingFlowStepper({
  current,
}: {
  current: BookingFlowStepKey;
}) {
  return (
    <EnterpriseSection
      style={{
        gap: 10,
        padding: 16,
        borderRadius: 16,
        border: `1px solid ${enterpriseTheme.border}`,
        background: enterpriseTheme.surface,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 700 }}>網站版預約流程</div>
          <div style={{ fontSize: 11.5, color: enterpriseTheme.textMuted }}>
            fixture flow: home → new → review → submitted
          </div>
        </div>
        <EnterprisePill tone="tenant">enterprise_dispatch</EnterprisePill>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {bookingFlowSteps.map((step, index) => {
          const active = step.key === current;

          return (
            <Link key={step.key} href={step.href} style={stepLinkStyle(active)}>
              <span
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 999,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: active
                    ? enterpriseTheme.accent
                    : enterpriseTheme.surfaceLo,
                  color: active
                    ? enterpriseTheme.surface
                    : enterpriseTheme.textMuted,
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                {index + 1}
              </span>
              {step.label}
            </Link>
          );
        })}
      </div>
    </EnterpriseSection>
  );
}
