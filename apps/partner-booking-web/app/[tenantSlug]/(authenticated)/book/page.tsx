import type { CSSProperties } from "react";
import { notFound, redirect } from "next/navigation";
import type { PartnerBrandTemplate } from "@drts/ui-tokens";
import {
  CanvasBtn,
  CanvasCard,
  CanvasField,
  CanvasPageHeader,
  CanvasPill,
  buildCanvasTheme,
  type CanvasTheme,
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

const routeSegmentStyle: CSSProperties = {
  padding: "14px 16px",
};

type PageProps = {
  params: Promise<{ tenantSlug: string }>;
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

function RouteBadge({
  label,
  markerColor,
  square = false,
}: {
  label: string;
  markerColor: string;
  square?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginBottom: 8,
      }}
    >
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: square ? 1 : 999,
          background: markerColor,
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.08em",
          color: "#56657F",
        }}
      >
        {label}
      </span>
    </div>
  );
}

function buildDepartureOptions(theme: CanvasTheme) {
  return ["即時", "+30 分", "+1 小時"].map((option, index) => (
    <CanvasBtn
      key={option}
      theme={theme}
      variant={index === 1 ? "primary" : "secondary"}
      size="md"
      style={{
        width: "100%",
        justifyContent: "center",
        height: 40,
        borderRadius: 10,
        background: index === 1 ? theme.accentBg : "#FFFFFF",
        color: index === 1 ? theme.accent : theme.text,
        borderColor: index === 1 ? theme.accent : "#D2D8E2",
        borderWidth: index === 1 ? 2 : 1,
        boxShadow: "none",
      }}
    >
      {option}
    </CanvasBtn>
  ));
}

function DetailRow({
  theme,
  label,
  value,
  mono = false,
}: {
  theme: CanvasTheme;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        paddingTop: 10,
        paddingBottom: 10,
        borderTop: "1px solid #F1F3F8",
      }}
    >
      <span
        style={{
          fontSize: 12,
          color: theme.textMuted,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: theme.text,
          fontFamily: mono ? theme.monoFamily : theme.fontFamily,
          textAlign: "right",
        }}
      >
        {value}
      </span>
    </div>
  );
}

export default async function PartnerBookPage({ params }: PageProps) {
  const { tenantSlug } = await params;
  try {
    const { brand } = await getPartnerRouteContext(tenantSlug);
    const theme = buildPartnerTheme(brand);
    const totalBenefits = 12;
    const remainingBenefits = 9;

    return (
      <div>
        <CanvasPageHeader
          theme={theme}
          title="建立行程"
          subtitle="機場接送 · 桃園 T2"
          sticky={false}
          actions={
            <CanvasPill theme={theme} tone="accent">
              {brand.programName}
            </CanvasPill>
          }
          style={{
            padding: "0 0 18px",
            background: "transparent",
            borderBottom: "none",
          }}
        />

        <div style={pageBodyStyle}>
          <CanvasCard theme={theme} padding={0}>
            <div
              style={{
                ...routeSegmentStyle,
                borderBottom: "1px solid #F1F3F8",
              }}
            >
              <CanvasField
                theme={theme}
                label={
                  <RouteBadge label="PICKUP" markerColor={brand.primary} />
                }
              >
                <div
                  style={{ fontSize: 14, fontWeight: 700, color: theme.text }}
                >
                  台北市信義區松仁路 100 號
                </div>
                <div
                  style={{
                    marginTop: 2,
                    fontSize: 11,
                    color: theme.textMuted,
                  }}
                >
                  大和商務集團 · HQ 大廳
                </div>
              </CanvasField>
            </div>

            <div style={routeSegmentStyle}>
              <CanvasField
                theme={theme}
                label={
                  <RouteBadge label="DROP" markerColor={brand.accent} square />
                }
              >
                <div
                  style={{ fontSize: 14, fontWeight: 700, color: theme.text }}
                >
                  桃園機場 第二航廈
                </div>
                <div
                  style={{
                    marginTop: 2,
                    fontSize: 11,
                    color: theme.textMuted,
                  }}
                >
                  出境大廳 7 號門
                </div>
              </CanvasField>
            </div>
          </CanvasCard>

          <CanvasCard theme={theme} title="出發時間">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: 6,
              }}
            >
              {buildDepartureOptions(theme)}
            </div>
            <div
              style={{
                marginTop: 10,
                borderRadius: 10,
                background: "#F1F3F8",
                padding: "10px 12px",
                fontSize: 12,
                color: theme.text,
                fontFamily: theme.monoFamily,
              }}
            >
              預計出發：2026-05-08 17:30
            </div>
          </CanvasCard>

          <CanvasCard theme={theme} title="服務細節">
            <div style={{ marginTop: -10 }}>
              <DetailRow theme={theme} label="人數" value="1 位" />
              <DetailRow theme={theme} label="行李" value="2 件" />
              <DetailRow theme={theme} label="特殊需求" value="—" />
              <DetailRow theme={theme} label="車型" value="商務車 (升級)" />
            </div>
          </CanvasCard>

          <CanvasCard
            theme={theme}
            title="禮遇與費用"
            style={{
              background: "linear-gradient(180deg, #FAF3DF 0%, #FFFDF5 100%)",
              borderColor: "#E5D58A",
            }}
          >
            <div style={{ marginTop: -10 }}>
              <DetailRow
                theme={theme}
                label="基本費用"
                value="NT$ 1,580"
                mono
              />
              <DetailRow
                theme={theme}
                label={`${brand.programName} 禮遇`}
                value="−NT$ 1,580"
                mono
              />
              <DetailRow theme={theme} label="您將支付" value="免費" />
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginTop: 10,
                padding: "10px 12px",
                background: "#FFFFFF",
                borderRadius: 10,
              }}
            >
              <CanvasPill theme={theme} tone="accent">
                {remainingBenefits} / {totalBenefits} 趟
              </CanvasPill>
              <span
                style={{
                  fontSize: 11,
                  color: "#56657F",
                }}
              >
                本年度剩餘禮遇趟次
              </span>
            </div>
          </CanvasCard>

          <CanvasBtn
            theme={theme}
            variant="primary"
            size="md"
            style={{
              width: "100%",
              justifyContent: "center",
              height: 42,
              borderRadius: 10,
            }}
          >
            確認預約
          </CanvasBtn>
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
