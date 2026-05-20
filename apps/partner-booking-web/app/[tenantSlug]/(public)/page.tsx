import type { CSSProperties, ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import type { PartnerBrandTemplate } from "@drts/ui-tokens";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
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
  gap: 12,
  padding: 16,
};

const pageRootStyle: CSSProperties = {
  display: "flex",
  justifyContent: "center",
};

const phoneFrameStyle: CSSProperties = {
  width: "100%",
  maxWidth: 390,
  background: "#F4F6FB",
  borderRadius: 24,
  overflow: "hidden",
  boxShadow: "0 24px 60px rgba(15, 23, 42, 0.12)",
};

const headerBrandRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 11,
  letterSpacing: "0.16em",
  opacity: 0.85,
  fontWeight: 600,
  textTransform: "uppercase",
};

const headerBadgeStyle: CSSProperties = {
  width: 22,
  height: 22,
  borderRadius: 4,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 800,
  fontSize: 12,
};

const headerTitleStyle: CSSProperties = {
  marginTop: 14,
  fontSize: 22,
  fontWeight: 700,
  letterSpacing: "-0.01em",
  lineHeight: 1.1,
};

const actionStackStyle: CSSProperties = {
  display: "grid",
  gap: 8,
};

const memberCardStyle: CSSProperties = {
  display: "grid",
  gap: 12,
  padding: 16,
};

const serviceRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "10px 0",
};

const serviceIconStyle: CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 8,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const serviceList: ReadonlyArray<{
  title: string;
  detail: string;
  tag: string;
}> = [
  { title: "機場接送", detail: "桃園 / 松山 · 商務車", tag: "AIRPORT" },
  { title: "優先派車", detail: "都會區 · 8 分鐘內到車", tag: "PRIORITY" },
  {
    title: "商務時段",
    detail: "平日 07:00–22:00 · 含車型升級",
    tag: "BUSINESS",
  },
];

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
    successBg: "#EEF7F1",
    successBorder: "#B7DEC4",
    shadow: "0 1px 2px rgba(15, 23, 42, 0.03)",
    shadowSm: "0 1px 2px rgba(15, 23, 42, 0.03)",
  };
}

function buildMaskedName(programName: string): string {
  if (programName === "World Elite") {
    return "陳〇明";
  }
  if (programName === "尊榮旅遊") {
    return "林〇涵";
  }
  return "Guest Member";
}

function PartnerPrimaryLink({
  action,
  children,
  style,
}: {
  action: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <form action={action} method="get">
      <CanvasBtn
        variant="primary"
        size="md"
        style={{
          width: "100%",
          justifyContent: "center",
          height: 44,
          borderRadius: 10,
          ...style,
        }}
      >
        {children}
      </CanvasBtn>
    </form>
  );
}

function PartnerSecondaryLink({
  action,
  children,
}: {
  action: string;
  children: ReactNode;
}) {
  return (
    <form action={action} method="get">
      <CanvasBtn
        variant="ghost"
        size="md"
        style={{
          width: "100%",
          justifyContent: "center",
          height: 42,
          borderRadius: 10,
          color: "#1B4FA0",
          background: "transparent",
          border: "none",
        }}
      >
        {children}
      </CanvasBtn>
    </form>
  );
}

type PageProps = {
  params: Promise<{ tenantSlug: string }>;
};

export default async function PartnerLandingPage({ params }: PageProps) {
  const { tenantSlug } = await params;
  try {
    const { brand } = await getPartnerRouteContext(tenantSlug);
    const theme = buildPartnerTheme(brand);
    const headerTheme: CanvasTheme = {
      ...theme,
      bg: "transparent",
      text: "#FFFFFF",
      textMuted: "rgba(255, 255, 255, 0.78)",
      border: "transparent",
    };
    const totalBenefits = 12;
    const remainingBenefits = 9;
    const benefitUsageWidth = `${(remainingBenefits / totalBenefits) * 100}%`;
    const riderName = buildMaskedName(brand.programName);
    const termsBody = `當趟次免費額度用完後，每趟仍享 8 折優惠。費用由本卡帳單合併扣款，無須現場付款。完整條款請參閱 ${brand.bankName} ${brand.programName} 權益文件。`;

    return (
      <div style={pageRootStyle}>
        <div style={phoneFrameStyle}>
          <div
            style={{
              position: "relative",
              overflow: "hidden",
              background: `linear-gradient(135deg, ${brand.primaryDark} 0%, ${brand.primary} 70%)`,
            }}
          >
            <div
              style={{
                position: "absolute",
                right: -40,
                top: -20,
                width: 200,
                height: 200,
                background: `radial-gradient(circle, ${brand.accent}33 0%, transparent 60%)`,
              }}
            />
            <CanvasPageHeader
              theme={headerTheme}
              title={
                <div>
                  <div style={headerBrandRowStyle}>
                    <span
                      style={{
                        ...headerBadgeStyle,
                        background: brand.accent,
                        color: brand.primaryDark,
                      }}
                    >
                      {brand.cardArt.badgeText}
                    </span>
                    {brand.cardArt.issuerLabel} × DRTS
                  </div>
                  <div style={headerTitleStyle}>禮賓接送 Concierge</div>
                </div>
              }
              subtitle={`${brand.programName} 卡友專屬 · 全年免費 ${totalBenefits} 趟`}
              sticky={false}
              actions={
                <CanvasPill
                  theme={theme}
                  tone="accent"
                  style={{
                    padding: "3px 8px",
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 600,
                    fontFamily:
                      '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
                    color: brand.accent,
                    background: "#FAF3DF",
                    border: "1px solid #E5D58A",
                  }}
                >
                  EXCLUSIVE
                </CanvasPill>
              }
              style={{
                position: "relative",
                zIndex: 1,
                padding: "20px 24px 22px",
                background: "transparent",
                borderBottom: "none",
              }}
            />
          </div>

          <div style={pageBodyStyle}>
            <CanvasCard theme={theme} padding={0}>
              <div style={memberCardStyle}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    marginBottom: 10,
                  }}
                >
                  <div
                    style={{
                      width: 44,
                      height: 28,
                      borderRadius: 4,
                      background: `linear-gradient(135deg, ${brand.primaryDark}, ${brand.primary})`,
                      position: "relative",
                      flexShrink: 0,
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        right: 4,
                        bottom: 4,
                        width: 8,
                        height: 8,
                        borderRadius: 1,
                        background: brand.accent,
                      }}
                    />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: theme.text,
                      }}
                    >
                      •••• •••• •••• {brand.cardArt.lastFour}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: theme.textMuted,
                      }}
                    >
                      {riderName} · {brand.programName}
                    </div>
                  </div>

                  <CanvasPill
                    theme={theme}
                    tone="success"
                    style={{
                      borderRadius: 999,
                      fontFamily:
                        '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
                    }}
                  >
                    eligible
                  </CanvasPill>
                </div>

                <div
                  style={{
                    borderRadius: 8,
                    background: "#F1F3F8",
                    padding: 10,
                    marginTop: 4,
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
                      }}
                    >
                      本年度剩餘趟次
                    </span>
                    <span
                      style={{
                        fontSize: 13,
                        color: theme.text,
                        fontFamily:
                          '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
                      }}
                    >
                      <b style={{ fontSize: 18 }}>{remainingBenefits}</b> /{" "}
                      {totalBenefits}
                    </span>
                  </div>
                  <div
                    style={{
                      height: 4,
                      marginTop: 6,
                      borderRadius: 999,
                      background: "#DDE3EC",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: benefitUsageWidth,
                        height: "100%",
                        background: brand.accent,
                      }}
                    />
                  </div>
                </div>
              </div>
            </CanvasCard>

            <CanvasCard theme={theme} title="可使用的服務" padding={16}>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {serviceList.map((item, index) => (
                  <div
                    key={item.title}
                    style={{
                      ...serviceRowStyle,
                      borderBottom:
                        index < serviceList.length - 1
                          ? "1px dashed #F1F3F8"
                          : "none",
                    }}
                  >
                    <div
                      style={{
                        ...serviceIconStyle,
                        background: `${brand.primary}11`,
                      }}
                    >
                      <div
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: 3,
                          background: brand.primary,
                        }}
                      />
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: theme.text,
                        }}
                      >
                        {item.title}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: theme.textMuted,
                        }}
                      >
                        {item.detail}
                      </div>
                    </div>

                    <CanvasPill
                      theme={theme}
                      tone="info"
                      style={{
                        borderRadius: 999,
                        fontFamily:
                          '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
                      }}
                    >
                      {item.tag}
                    </CanvasPill>
                  </div>
                ))}
              </div>
            </CanvasCard>

            <CanvasCard
              theme={theme}
              padding={14}
              style={{
                background: "linear-gradient(135deg, #FAF3DF 0%, #FFFDF5 100%)",
                borderColor: "#E5D58A",
              }}
            >
              <CanvasBanner
                theme={{
                  ...theme,
                  accentBg: "transparent",
                  accentBorder: "transparent",
                }}
                tone="accent"
                title="禮遇條款"
                body={termsBody}
                icon={
                  <div
                    style={{
                      width: 4,
                      alignSelf: "stretch",
                      borderRadius: 2,
                      background: brand.accent,
                    }}
                  />
                }
              />
            </CanvasCard>

            <div style={actionStackStyle}>
              <PartnerPrimaryLink action={`/${tenantSlug}/eligibility`}>
                立即叫車
              </PartnerPrimaryLink>
              <PartnerSecondaryLink action={`/${tenantSlug}/trips`}>
                查看歷史趟次
              </PartnerSecondaryLink>
            </div>
          </div>
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
