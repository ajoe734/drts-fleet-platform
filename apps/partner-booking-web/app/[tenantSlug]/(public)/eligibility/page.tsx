import type { CSSProperties, ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import type { PartnerBrandTemplate } from "@drts/ui-tokens";
import {
  CanvasCard,
  CanvasDL,
  CanvasPageHeader,
  buildCanvasTheme,
  type CanvasTheme,
} from "@drts/ui-web";
import {
  PartnerAuthorityError,
  getPartnerRouteContext,
} from "@/lib/api-client";
import { EligibilityActions } from "./page-actions";

const baseTheme = buildCanvasTheme({
  surface: "partner",
  density: "compact",
});

const pageBodyStyle: CSSProperties = {
  display: "grid",
  gap: 12,
  maxWidth: 420,
  margin: "0 auto",
  padding: "0 16px 24px",
};

const rightsCardStyle: CSSProperties = {
  overflow: "hidden",
};

type ConsentItem = {
  title: string;
  detail: ReactNode;
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
    accent: brand.primary,
    accentHi: brand.primary,
    accentBg: "#EBF1FB",
    accentBorder: brand.surface.border,
    shadow: "0 1px 2px rgba(15, 23, 42, 0.03)",
    shadowSm: "0 1px 2px rgba(15, 23, 42, 0.03)",
  };
}

function buildConsentItems(
  brand: PartnerBrandTemplate,
): readonly ConsentItem[] {
  return [
    {
      title: "使用本卡身份識別建立 DRTS 帳號",
      detail: "不會傳送您的卡號或安全碼",
    },
    {
      title: "與 DRTS 共享行程必要資訊",
      detail: "上下車地點 · 時間 · 費用 (供帳單合併使用)",
    },
    {
      title: `同意《${brand.bankName} × DRTS 禮賓接送服務條款 v3》`,
      detail: (
        <>
          隱私政策連結另開。
          <span style={{ marginLeft: 6, color: brand.primary }}>了解更多</span>
        </>
      ),
    },
  ] as const;
}

function ConsentChecklist({
  brand,
  theme,
  items,
}: {
  brand: PartnerBrandTemplate;
  theme: CanvasTheme;
  items: readonly ConsentItem[];
}) {
  return (
    <div>
      {items.map((item, index) => (
        <div
          key={item.title}
          style={{
            display: "flex",
            gap: 12,
            padding: "10px 0",
            borderBottom:
              index < items.length - 1 ? "1px dashed #F1F3F8" : "none",
          }}
        >
          <div
            aria-hidden
            style={{
              width: 18,
              height: 18,
              borderRadius: 4,
              border: `2px solid ${brand.primary}`,
              background: brand.primary,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              marginTop: 2,
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#fff"
              strokeWidth="3"
            >
              <path d="M5 12l5 5L20 7" />
            </svg>
          </div>

          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 12.5,
                fontWeight: 700,
                color: theme.text,
                lineHeight: 1.35,
                letterSpacing: -0.1,
              }}
            >
              {item.title}
            </div>
            <div
              style={{
                marginTop: 2,
                fontSize: 11,
                lineHeight: 1.45,
                color: theme.textMuted,
              }}
            >
              {item.detail}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

type PageProps = {
  params: Promise<{ tenantSlug: string }>;
};

export default async function PartnerEligibilityPage({ params }: PageProps) {
  const { tenantSlug } = await params;
  try {
    const { brand } = await getPartnerRouteContext(tenantSlug);
    const theme = buildPartnerTheme(brand);
    const consentItems = buildConsentItems(brand);

    return (
      <div
        style={{
          minHeight: "100%",
          background: "#F4F6FB",
          paddingBottom: 24,
        }}
      >
        <CanvasPageHeader
          theme={theme}
          title="連結卡片"
          subtitle="第一次使用 · 一次性確認"
          sticky={false}
          style={{
            padding: "0 16px 18px",
            background: "#F4F6FB",
            borderBottom: "none",
          }}
        />

        <div style={pageBodyStyle}>
          <CanvasCard theme={theme} title="您的權益" style={rightsCardStyle}>
            <CanvasDL
              theme={theme}
              cols={1}
              items={[
                { label: "持卡身份", value: brand.programName },
                {
                  label: "卡號末四碼",
                  value: brand.cardArt.lastFour,
                  mono: true,
                },
                { label: "本年度免費趟次", value: "12 趟", mono: true },
                { label: "優惠折扣", value: "額度後 8 折" },
                { label: "服務範圍", value: "台北 · 桃園 · 新竹" },
              ]}
            />
          </CanvasCard>

          <CanvasCard theme={theme} title="授權同意">
            <ConsentChecklist
              brand={brand}
              theme={theme}
              items={consentItems}
            />
          </CanvasCard>

          <EligibilityActions theme={theme} tenantSlug={tenantSlug} />
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
