import type { CSSProperties } from "react";
import { notFound, redirect } from "next/navigation";
import type { PartnerBrandTemplate } from "@drts/ui-tokens";
import {
  CanvasBtn,
  CanvasCard,
  CanvasPageHeader,
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
  paddingTop: 16,
};

const receiptCardStyle: CSSProperties = {
  overflow: "hidden",
};

const cardSectionStyle: CSSProperties = {
  padding: 16,
};

const cardDividerStyle: CSSProperties = {
  ...cardSectionStyle,
  borderBottom: "1px dashed #E5E7EB",
};

const actionGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 8,
};

type ReceiptRowData = {
  label: string;
  value: string;
  mono?: boolean;
  emphasis?: boolean;
};

const tripTimelineRows: readonly ReceiptRowData[] = [
  { label: "出發", value: "14:30:11", mono: true },
  { label: "抵達", value: "15:42:27", mono: true },
  { label: "行車", value: "1 小時 12 分" },
  { label: "距離", value: "38.4 km", mono: true },
] as const;

const baseFareRows: readonly ReceiptRowData[] = [
  { label: "車資 (基本)", value: "NT$ 1,420", mono: true },
  { label: "機場附加", value: "NT$ 100", mono: true },
  { label: "高速公路費", value: "NT$ 60", mono: true },
  { label: "小計", value: "NT$ 1,580", mono: true, emphasis: true },
] as const;

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

function ReceiptRow({
  theme,
  label,
  value,
  mono = false,
  emphasis = false,
}: {
  theme: CanvasTheme;
  label: string;
  value: string;
  mono?: boolean;
  emphasis?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 12,
        padding: "8px 0",
        borderBottom: "1px dashed #F1F3F8",
        fontSize: 13,
      }}
    >
      <span style={{ color: theme.textMuted }}>{label}</span>
      <span
        style={{
          color: theme.text,
          fontFamily: mono ? theme.monoFamily : theme.fontFamily,
          fontSize: mono ? 12.5 : 13,
          fontWeight: emphasis || mono ? 600 : 500,
          textAlign: "right",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </span>
    </div>
  );
}

type PageProps = {
  params: Promise<{ tenantSlug: string }>;
};

export default async function PartnerReceiptPage({ params }: PageProps) {
  const { tenantSlug } = await params;
  try {
    const { brand } = await getPartnerRouteContext(tenantSlug);
    const theme = buildPartnerTheme(brand);
    const benefitRow: ReceiptRowData = {
      label: `${brand.programName} 禮遇`,
      value: "-NT$ 1,580",
      mono: true,
    };
    const paymentRows: readonly ReceiptRowData[] = [
      {
        label: "付款方式",
        value: `${brand.programName} ••${brand.cardArt.lastFour}`,
        mono: true,
      },
      { label: "入帳期別", value: "2026-06 帳單" },
      { label: "禮遇序號", value: "WE-2026-0004", mono: true },
      { label: "收據編號", value: "rcp_8821a912", mono: true },
    ] as const;

    return (
      <div>
        <CanvasPageHeader
          theme={theme}
          title="行程明細"
          subtitle="bk_5512 · 已完成"
          sticky={false}
          style={{
            padding: "0 0 18px",
            background: "transparent",
            borderBottom: "none",
          }}
        />

        <div style={pageBodyStyle}>
          <CanvasCard theme={theme} padding={0} style={receiptCardStyle}>
            <div style={cardDividerStyle}>
              {tripTimelineRows.map((row) => (
                <ReceiptRow key={row.label} theme={theme} {...row} />
              ))}
            </div>

            <div style={cardSectionStyle}>
              {baseFareRows.map((row) => (
                <ReceiptRow key={row.label} theme={theme} {...row} />
              ))}

              <div style={{ marginTop: 8 }}>
                <ReceiptRow theme={theme} {...benefitRow} />
                <ReceiptRow
                  theme={theme}
                  label="您支付"
                  value="NT$ 0"
                  mono
                  emphasis
                />
              </div>
            </div>
          </CanvasCard>

          <CanvasCard
            theme={theme}
            title="款項"
            style={{
              background: "linear-gradient(180deg, #FAF3DF, #FFFDF5)",
              borderColor: "#E5D58A",
            }}
          >
            {paymentRows.map((row) => (
              <ReceiptRow key={row.label} theme={theme} {...row} />
            ))}
          </CanvasCard>

          <div style={actionGridStyle}>
            <CanvasBtn
              theme={theme}
              variant="secondary"
              size="md"
              style={{
                width: "100%",
                height: 46,
                justifyContent: "center",
                borderRadius: 12,
                fontWeight: 700,
                background: "#FFFFFF",
                borderColor: "#D2D8E2",
              }}
            >
              下載收據 PDF
            </CanvasBtn>
            <CanvasBtn
              theme={theme}
              variant="secondary"
              size="md"
              style={{
                width: "100%",
                height: 46,
                justifyContent: "center",
                borderRadius: 12,
                fontWeight: 700,
                background: "#FFFFFF",
                borderColor: "#D2D8E2",
              }}
            >
              聯絡客服
            </CanvasBtn>
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
