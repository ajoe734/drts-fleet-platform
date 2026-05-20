import { notFound, redirect } from "next/navigation";
import {
  CanvasBtn,
  CanvasCard,
  CanvasPageHeader,
  CanvasPill,
  buildCanvasTheme,
} from "@drts/ui-web";
import {
  PartnerAuthorityError,
  getPartnerRouteContext,
} from "@/lib/api-client";

type PageProps = {
  params: Promise<{ tenantSlug: string }>;
};

const canvasTheme = buildCanvasTheme({
  surface: "partner",
  density: "compact",
});

const FAQ_ITEMS = [
  {
    question: "禮遇趟次如何計算？",
    answer: "每年元旦重置 12 趟，未使用不累計。",
  },
  {
    question: "可以代為叫車嗎？",
    answer: "可，但乘客手機需在訂單中。",
  },
  {
    question: "取消政策",
    answer: "出發 5 分鐘前免費取消；逾時將扣除一次禮遇。",
  },
  {
    question: "額度後仍可叫車嗎？",
    answer: "可，享 8 折優惠並合併至本卡帳單。",
  },
] as const;

export default async function PartnerHelpPage({ params }: PageProps) {
  const { tenantSlug } = await params;
  try {
    const { brand } = await getPartnerRouteContext(tenantSlug);

    return (
      <div
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <CanvasCard
          theme={canvasTheme}
          padding={0}
          style={{
            width: "100%",
            maxWidth: "390px",
            overflow: "hidden",
            borderRadius: "28px",
            background: "#f4f6fb",
            borderColor: "#d9e1ec",
            boxShadow: "0 28px 60px rgba(15, 23, 42, 0.14)",
          }}
        >
          <div
            style={{
              height: "26px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#0f172a",
            }}
          >
            <div
              style={{
                width: "110px",
                height: "6px",
                borderRadius: "999px",
                background: "rgba(255, 255, 255, 0.28)",
              }}
            />
          </div>

          <div style={{ position: "relative", overflow: "hidden" }}>
            <div
              style={{
                position: "absolute",
                right: "-40px",
                top: "-20px",
                width: "200px",
                height: "200px",
                background: `radial-gradient(circle, ${brand.accent}33 0%, transparent 60%)`,
              }}
            />
            <CanvasPageHeader
              theme={canvasTheme}
              sticky={false}
              title={
                <>
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      fontSize: "11px",
                      letterSpacing: "0.16em",
                      opacity: 0.85,
                      fontWeight: 600,
                      color: "#ffffff",
                    }}
                  >
                    <span
                      style={{
                        width: "22px",
                        height: "22px",
                        borderRadius: "4px",
                        background: brand.accent,
                        color: brand.primaryDark,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 800,
                        fontSize: "12px",
                      }}
                    >
                      {brand.cardArt.badgeText}
                    </span>
                    {brand.cardArt.issuerLabel} × DRTS
                  </span>
                  <span
                    style={{
                      display: "block",
                      marginTop: "14px",
                      fontSize: "22px",
                      fontWeight: 700,
                      letterSpacing: "-0.01em",
                      color: "#ffffff",
                    }}
                  >
                    協助
                  </span>
                </>
              }
              subtitle={
                <span style={{ color: "rgba(255, 255, 255, 0.78)" }}>
                  {brand.programName} 卡友專線
                </span>
              }
              style={{
                padding: "20px 24px 22px",
                background: `linear-gradient(135deg, ${brand.primaryDark} 0%, ${brand.primary} 70%)`,
                borderBottom: "none",
                position: "relative",
              }}
            />
          </div>

          <div
            style={{
              padding: "16px",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            <CanvasCard
              theme={canvasTheme}
              padding={16}
              style={{
                background: `linear-gradient(135deg, ${brand.primaryDark}, ${brand.primary})`,
                color: "#ffffff",
                borderColor: "transparent",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "12px",
                }}
              >
                <div
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    opacity: 0.72,
                    letterSpacing: "0.1em",
                  }}
                >
                  24 小時專線
                </div>
                <CanvasPill
                  theme={canvasTheme}
                  tone="accent"
                  style={{
                    color: "#ffffff",
                    background: "rgba(255, 255, 255, 0.12)",
                    border: "1px solid rgba(255, 255, 255, 0.18)",
                  }}
                >
                  24/7
                </CanvasPill>
              </div>
              <div
                style={{
                  marginTop: "8px",
                  fontSize: "28px",
                  fontWeight: 800,
                  lineHeight: 1.05,
                  fontFamily: canvasTheme.monoFamily,
                }}
              >
                {brand.hotline.phone}
              </div>
              <div
                style={{
                  marginTop: "6px",
                  fontSize: "11px",
                  lineHeight: 1.5,
                  opacity: 0.82,
                }}
              >
                {brand.hotline.note}
              </div>
            </CanvasCard>

            <CanvasCard theme={canvasTheme} title="常見問題">
              {FAQ_ITEMS.map((item, index) => (
                <div
                  key={item.question}
                  style={{
                    padding: "10px 0",
                    borderBottom:
                      index < FAQ_ITEMS.length - 1
                        ? "1px dashed #f1f3f8"
                        : "none",
                  }}
                >
                  <div
                    style={{
                      fontSize: "13px",
                      fontWeight: 700,
                      color: brand.ink,
                    }}
                  >
                    {item.question}
                  </div>
                  <div
                    style={{
                      marginTop: "4px",
                      fontSize: "12px",
                      lineHeight: 1.6,
                      color: "#56657f",
                    }}
                  >
                    {item.answer}
                  </div>
                </div>
              ))}
            </CanvasCard>

            <CanvasCard theme={canvasTheme} title="爭議或客訴">
              <div
                style={{
                  marginBottom: "10px",
                  fontSize: "12px",
                  lineHeight: 1.6,
                  color: "#56657f",
                }}
              >
                行程結束後 30 天內可提出爭議。將同時通知 {brand.bankName}{" "}
                禮賓中心與 DRTS 平台客服。
              </div>
              <div>
                <CanvasBtn
                  theme={canvasTheme}
                  variant="primary"
                  size="md"
                  style={{
                    width: "100%",
                    justifyContent: "center",
                    background: brand.primary,
                    borderColor: brand.primary,
                  }}
                >
                  提出爭議
                </CanvasBtn>
              </div>
            </CanvasCard>
          </div>
        </CanvasCard>
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
