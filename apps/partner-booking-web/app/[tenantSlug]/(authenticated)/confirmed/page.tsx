import type { CSSProperties, ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import type { PartnerBrandTemplate } from "@drts/ui-tokens";
import {
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasIcon,
  CanvasKPI,
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
};

const cardStyle: CSSProperties = {
  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.03)",
};

type ConfirmedSummary = {
  heroSubtitle: string;
  driverName: string;
  driverInitial: string;
  driverMeta: string;
  vehicle: string;
  etaMinutes: number;
  distanceKm: string;
  bookingId: string;
  benefitLabel: string;
  vehicleTier: string;
  amountDue: string;
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

function buildHeroTheme(theme: CanvasTheme): CanvasTheme {
  return {
    ...theme,
    bg: "transparent",
    text: "#FFFFFF",
    textMuted: "rgba(255, 255, 255, 0.78)",
    textDim: "rgba(255, 255, 255, 0.66)",
    border: "transparent",
  };
}

function buildConfirmedSummary(brand: PartnerBrandTemplate): ConfirmedSummary {
  return {
    heroSubtitle: "駕駛將於 8 分鐘後抵達",
    driverName: "陳俊宏",
    driverInitial: "陳",
    driverMeta: "1,243 趟 · 4.86 ★",
    vehicle: "Toyota Prius α · ARJ-3120",
    etaMinutes: 8,
    distanceKm: "2.4 km",
    bookingId: "bk_5512",
    benefitLabel: `${brand.programName} · 趟次 #4`,
    vehicleTier: "商務車 (升級)",
    amountDue: "免費",
  };
}

function MapIllustration({
  primary,
  accent,
}: {
  primary: string;
  accent: string;
}) {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 360 180"
      style={{ position: "absolute", inset: 0 }}
      aria-hidden="true"
    >
      <path
        d="M0,120 Q80,100 160,110 T360,90"
        stroke="#A5B4FC"
        strokeWidth="2"
        fill="none"
        strokeDasharray="4 4"
      />
      <path
        d="M40,140 L100,100 L180,90 L260,70 L320,40"
        stroke={primary}
        strokeWidth="3"
        fill="none"
      />
      <circle cx="40" cy="140" r="6" fill={primary} />
      <circle
        cx="320"
        cy="40"
        r="6"
        fill={accent}
        stroke="#FFFFFF"
        strokeWidth="2"
      />
      <circle
        cx="180"
        cy="90"
        r="9"
        fill={primary}
        stroke="#FFFFFF"
        strokeWidth="2"
      />
      <circle cx="180" cy="90" r="14" fill={primary} fillOpacity="0.2" />
    </svg>
  );
}

function etaValue(value: ReactNode, muted: string, fontFamily: string) {
  return (
    <>
      {value}{" "}
      <span
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: muted,
          fontFamily,
        }}
      >
        min
      </span>
    </>
  );
}

type PageProps = {
  params: Promise<{ tenantSlug: string }>;
};

export default async function PartnerConfirmedPage({ params }: PageProps) {
  const { tenantSlug } = await params;
  try {
    const { brand } = await getPartnerRouteContext(tenantSlug);
    const theme = buildPartnerTheme(brand);
    const heroTheme = buildHeroTheme(theme);
    const summary = buildConfirmedSummary(brand);

    return (
      <div style={pageBodyStyle}>
        <div
          style={{
            position: "relative",
            overflow: "hidden",
            borderRadius: 16,
            boxShadow: "0 14px 32px rgba(10, 42, 110, 0.18)",
          }}
        >
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              right: -52,
              top: -28,
              width: 220,
              height: 220,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${brand.accent}33 0%, transparent 62%)`,
            }}
          />
          <CanvasPageHeader
            theme={heroTheme}
            title="已派車"
            subtitle={summary.heroSubtitle}
            sticky={false}
            style={{
              position: "relative",
              padding: "20px 24px 22px",
              borderBottom: "none",
              background: `linear-gradient(135deg, ${brand.primaryDark} 0%, ${brand.primary} 70%)`,
            }}
          />
        </div>

        <CanvasCard theme={theme} padding={16} style={cardStyle}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div
              aria-hidden="true"
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: `linear-gradient(135deg, ${brand.primary}, ${brand.primaryDark})`,
                color: "#FFFFFF",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 18,
                fontWeight: 800,
                flexShrink: 0,
              }}
            >
              {summary.driverInitial}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 800,
                  color: theme.text,
                  lineHeight: 1.25,
                }}
              >
                {summary.driverName}
              </div>
              <div
                style={{
                  marginTop: 2,
                  fontSize: 11,
                  color: theme.textMuted,
                  lineHeight: 1.4,
                }}
              >
                {summary.driverMeta}
              </div>
              <div
                style={{
                  marginTop: 2,
                  fontSize: 11,
                  color: brand.primary,
                  fontWeight: 600,
                  fontFamily: theme.monoFamily,
                  lineHeight: 1.4,
                }}
              >
                {summary.vehicle}
              </div>
            </div>

            <button
              type="button"
              aria-label={`聯絡駕駛 ${summary.driverName}`}
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                border: "none",
                background: brand.primary,
                color: "#FFFFFF",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                flexShrink: 0,
                boxShadow: "0 10px 18px rgba(27, 79, 160, 0.18)",
              }}
            >
              <CanvasIcon name="phone" size={18} stroke={2} />
            </button>
          </div>
        </CanvasCard>

        <CanvasCard
          theme={theme}
          padding={0}
          style={{ ...cardStyle, overflow: "hidden" }}
        >
          <div
            style={{
              height: 180,
              background: "linear-gradient(180deg, #DDE5F0 0%, #C7D7F0 100%)",
              position: "relative",
              borderBottom: `1px solid ${theme.border}`,
              overflow: "hidden",
            }}
          >
            <MapIllustration primary={brand.primary} accent={brand.accent} />
          </div>

          <div
            style={{
              padding: 16,
              display: "grid",
              gap: 12,
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
              <div
                style={{
                  fontSize: 12,
                  color: theme.textMuted,
                  lineHeight: 1.45,
                }}
              >
                車輛已完成指派，正在前往接送地點。
              </div>
              <CanvasPill theme={theme} tone="success">
                已派車
              </CanvasPill>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 12,
              }}
            >
              <CanvasKPI
                theme={theme}
                label="預計抵達"
                value={etaValue(
                  summary.etaMinutes,
                  theme.textMuted,
                  theme.fontFamily,
                )}
                sub="司機已接單"
              />
              <CanvasKPI
                theme={theme}
                label="距離"
                value={summary.distanceKm}
                sub="即時定位估算"
              />
            </div>
          </div>
        </CanvasCard>

        <CanvasCard
          theme={theme}
          title="行程資訊"
          padding={16}
          style={cardStyle}
        >
          <CanvasDL
            theme={theme}
            cols={1}
            items={[
              { label: "預約編號", value: summary.bookingId, mono: true },
              { label: "禮遇", value: summary.benefitLabel },
              { label: "車型", value: summary.vehicleTier },
              { label: "您將支付", value: summary.amountDue },
            ]}
          />
        </CanvasCard>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 8,
          }}
        >
          <CanvasBtn
            theme={theme}
            variant="ghost"
            size="md"
            style={{ width: "100%", justifyContent: "center" }}
          >
            取消行程
          </CanvasBtn>
          <CanvasBtn
            theme={theme}
            variant="ghost"
            size="md"
            style={{ width: "100%", justifyContent: "center" }}
          >
            客服協助
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
