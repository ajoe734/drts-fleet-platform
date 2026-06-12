import Link from "next/link";
import {
  EnterpriseBanner,
  EnterpriseCard,
  EnterpriseDl,
  EnterprisePageHeader,
  EnterprisePill,
  EnterpriseSection,
} from "@/components/enterprise-primitives";
import { EnterpriseBookingFlowStepper } from "@/components/enterprise-booking-flow";
import {
  enterpriseBookingDraft,
  enterpriseSubmittedStates,
  type SubmittedBookingState,
} from "@/lib/enterprise-fixtures";
import { enterprisePageStyle, enterpriseTheme } from "@/lib/enterprise-theme";

const switchLinkStyle = (active: boolean) =>
  ({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 34,
    padding: "7px 12px",
    borderRadius: 10,
    border: `1px solid ${
      active ? enterpriseTheme.accentBorder : enterpriseTheme.border
    }`,
    background: active ? enterpriseTheme.accentBg : enterpriseTheme.surface,
    color: active ? enterpriseTheme.accent : enterpriseTheme.text,
    fontSize: 12.5,
    fontWeight: active ? 700 : 500,
    textDecoration: "none",
  }) as const;

function resolveSubmittedState(
  rawState: string | string[] | undefined,
): SubmittedBookingState {
  return rawState === "pending" ? "pending" : "accepted";
}

export default async function SubmittedBookingPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string | string[] }>;
}) {
  const { state: rawState } = await searchParams;
  const state = resolveSubmittedState(rawState);
  const submission = enterpriseSubmittedStates[state];

  return (
    <div style={enterprisePageStyle}>
      <EnterprisePageHeader
        title="送出結果"
        subtitle="submitted 畫面同時支援 accepted 與 pending，對應企業版 booking intake 的兩種常見回覆。"
        actions={
          <EnterprisePill tone={submission.tone}>
            {submission.title}
          </EnterprisePill>
        }
      />

      <EnterpriseBookingFlowStepper current="submitted" />

      <EnterpriseBanner
        tone={submission.tone}
        title={`${submission.bookingId} · ${submission.title}`}
        body={submission.summary}
      />

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Link
          href="/bookings/submitted?state=accepted"
          style={switchLinkStyle(state === "accepted")}
        >
          accepted
        </Link>
        <Link
          href="/bookings/submitted?state=pending"
          style={switchLinkStyle(state === "pending")}
        >
          pending
        </Link>
      </div>

      <EnterpriseSection
        style={{
          gridTemplateColumns: "minmax(0, 1.2fr) minmax(280px, 0.85fr)",
        }}
      >
        <EnterpriseCard title="系統回覆">
          <EnterpriseDl
            cols={1}
            items={[
              { k: "訂單編號", v: submission.bookingId, mono: true },
              { k: "結果摘要", v: submission.body },
              { k: "下一步", v: submission.nextStep },
              {
                k: "成本中心",
                v: enterpriseBookingDraft.costCenter,
                mono: true,
              },
            ]}
          />
        </EnterpriseCard>

        <EnterpriseSection>
          <EnterpriseCard
            title="本次送出內容"
            actions={
              <EnterprisePill tone="info">submitted_fixture</EnterprisePill>
            }
          >
            <EnterpriseDl
              cols={1}
              items={[
                { k: "乘客", v: enterpriseBookingDraft.passenger },
                {
                  k: "路線",
                  v: `${enterpriseBookingDraft.from} → ${enterpriseBookingDraft.to}`,
                },
                {
                  k: "搭乘時間",
                  v: `${enterpriseBookingDraft.date} ${enterpriseBookingDraft.pickupTime}`,
                  mono: true,
                },
                {
                  k: "預估費用",
                  v: enterpriseBookingDraft.estimatedFare,
                  mono: true,
                },
              ]}
            />
          </EnterpriseCard>

          <EnterpriseCard
            title="建議操作"
            actions={
              <EnterprisePill tone={submission.tone}>
                next_action
              </EnterprisePill>
            }
          >
            <div style={{ display: "grid", gap: 10 }}>
              <Link
                href={state === "accepted" ? "/" : "/bookings"}
                style={switchLinkStyle(true)}
              >
                {submission.actionLabel}
              </Link>
              <Link href="/bookings/review" style={switchLinkStyle(false)}>
                回到 review
              </Link>
            </div>
          </EnterpriseCard>
        </EnterpriseSection>
      </EnterpriseSection>
    </div>
  );
}
