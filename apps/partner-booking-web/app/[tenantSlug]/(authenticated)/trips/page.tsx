import type { CSSProperties } from "react";
import { notFound, redirect } from "next/navigation";
import type { PartnerBrandTemplate } from "@drts/ui-tokens";
import {
  CanvasCard,
  CanvasPageHeader,
  CanvasPill,
  buildCanvasTheme,
  type CanvasTheme,
  type CanvasTone,
} from "@drts/ui-web";
import {
  PartnerAuthorityError,
  getPartnerRouteContext,
} from "@/lib/api-client";

const baseTheme = buildCanvasTheme({
  surface: "partner",
  density: "compact",
});

const pageBodyStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
  paddingTop: 16,
};

const progressCardStyle: CSSProperties = {
  overflow: "hidden",
};

type TripRow = {
  when: string;
  route: string;
  status: string;
  tone: Extract<CanvasTone, "neutral" | "success">;
  cost: string;
  benefit: string;
};

function buildPartnerTheme(brand: PartnerBrandTemplate): CanvasTheme {
  return {
    ...baseTheme,
    bg: "transparent",
    bgRaised: brand.theme.panel,
    surface: brand.theme.panel,
    surfaceHi: "#FFFFFF",
    surfaceLo: "#F4F6FB",
    border: brand.theme.panelBorder,
    borderStrong: brand.surface.border,
    rowHover: "#F8FAFC",
    rowSelect: brand.surface.bg,
    text: brand.ink,
    textMuted: brand.theme.pageMuted,
    textDim: brand.theme.pageMuted,
    accent: brand.accent,
    accentHi: brand.primary,
    accentBg: "#FAF3DF",
    accentBorder: "#E5D58A",
    shadow: "0 1px 2px rgba(15, 23, 42, 0.03)",
    shadowSm: "0 1px 2px rgba(15, 23, 42, 0.03)",
  };
}

function buildTrips(): readonly TripRow[] {
  return [
    {
      when: "今天 14:30",
      route: "台北信義 → 桃園 T2",
      status: "已派車",
      tone: "success",
      cost: "免費",
      benefit: "禮遇 #4",
    },
    {
      when: "昨天 09:12",
      route: "台北車站 → 內湖科技園區",
      status: "已完成",
      tone: "neutral",
      cost: "NT$ 0",
      benefit: "禮遇 #3",
    },
    {
      when: "5/2 18:45",
      route: "101 大樓 → 松山機場",
      status: "已完成",
      tone: "neutral",
      cost: "NT$ 0",
      benefit: "禮遇 #2",
    },
    {
      when: "4/28 07:30",
      route: "陽明山 → 桃園 T1",
      status: "已完成",
      tone: "neutral",
      cost: "NT$ 240",
      benefit: "額度後 8 折",
    },
    {
      when: "4/14 22:10",
      route: "南港展覽館 → 內湖",
      status: "已完成",
      tone: "neutral",
      cost: "NT$ 0",
      benefit: "禮遇 #1",
    },
  ] as const;
}

type PageProps = {
  params: Promise<{ tenantSlug: string }>;
};

export default async function PartnerTripsPage({ params }: PageProps) {
  const { tenantSlug } = await params;
  try {
    const { brand } = await getPartnerRouteContext(tenantSlug);
    const theme = buildPartnerTheme(brand);
    const trips = buildTrips();
    const remainingBenefits = 9;
    const totalBenefits = 12;
    const benefitYear = new Date().getUTCFullYear();
    const complimentaryTrips = trips.filter((trip) =>
      trip.benefit.startsWith("禮遇"),
    ).length;

    return (
      <div>
        <CanvasPageHeader
          theme={theme}
          title="我的行程"
          subtitle={`本年度 · 共 ${complimentaryTrips} 趟`}
          sticky={false}
          style={{
            padding: "0 0 18px",
            background: "transparent",
          }}
        />

        <div style={pageBodyStyle}>
          <CanvasCard theme={theme} padding={0} style={progressCardStyle}>
            <div
              style={{
                padding: "14px 16px",
                background: "linear-gradient(180deg, #FAF3DF, #FFFDF5)",
                borderBottom: "1px solid #E5D58A",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: 12,
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    color: theme.textMuted,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                  }}
                >
                  {benefitYear} 年度
                </span>
                <span
                  style={{
                    fontSize: 13,
                    color: theme.text,
                    fontFamily: theme.monoFamily,
                    whiteSpace: "nowrap",
                  }}
                >
                  <b style={{ fontSize: 22 }}>{remainingBenefits}</b> /{" "}
                  {totalBenefits} 剩餘
                </span>
              </div>

              <div
                style={{
                  height: 5,
                  marginTop: 8,
                  background: "#FFFFFF",
                  borderRadius: 999,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${(remainingBenefits / totalBenefits) * 100}%`,
                    height: "100%",
                    background: brand.accent,
                  }}
                />
              </div>
            </div>

            {trips.map((trip, index) => (
              <div
                key={`${trip.when}-${trip.route}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "12px 16px",
                  borderBottom:
                    index < trips.length - 1 ? "1px solid #F1F3F8" : "none",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: theme.text,
                      lineHeight: 1.35,
                    }}
                  >
                    {trip.route}
                  </div>
                  <div
                    style={{
                      marginTop: 2,
                      fontSize: 11,
                      color: theme.textMuted,
                      lineHeight: 1.4,
                    }}
                  >
                    {trip.when} · {trip.benefit}
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-end",
                    gap: 4,
                    flexShrink: 0,
                  }}
                >
                  <CanvasPill theme={theme} tone={trip.tone}>
                    {trip.status}
                  </CanvasPill>
                  <div
                    style={{
                      fontSize: 12,
                      color: theme.text,
                      fontFamily: theme.monoFamily,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {trip.cost}
                  </div>
                </div>
              </div>
            ))}
          </CanvasCard>
        </div>
      </div>
    );
  } catch (error) {
    if (error instanceof PartnerAuthorityError) {
      if (error.code === "PARTNER_ENTRY_NOT_FOUND") {
        notFound();
      }
      if (error.code === "PARTNER_ENTRY_INACTIVE") {
        redirect(`/${tenantSlug}/inactive`);
      }
    }
    throw error;
  }
}
