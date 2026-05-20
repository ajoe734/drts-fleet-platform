import type { CSSProperties } from "react";
import { notFound, redirect } from "next/navigation";
import type { PartnerBrandTemplate } from "@drts/ui-tokens";
import {
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
  gap: 16,
  paddingTop: 16,
};

const buttonGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 8,
};

const gridButtonStyle: CSSProperties = {
  width: "100%",
  justifyContent: "center",
  height: 36,
};

type DetailRow = {
  label: string;
  value: string;
  mono?: boolean;
  emphasis?: boolean;
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

function buildReceiptDetails(brand: PartnerBrandTemplate) {
  return {
    bookingId: "bk_5512",
    statusLabel: "已完成",
    timeline: [
      { label: "出發", value: "14:30:11", mono: true },
      { label: "抵達", value: "15:42:27", mono: true },
      { label: "行車", value: "1 小時 12 分" },
      { label: "距離", value: "38.4 km", mono: true },
    ] satisfies readonly DetailRow[],
    fareRows: [
      { label: "車資 (基本)", value: "NT$ 1,420", mono: true },
      { label: "機場附加", value: "NT$ 100", mono: true },
      { label: "高速公路費", value: "NT$ 60", mono: true },
      { label: "小計", value: "NT$ 1,580", mono: true, emphasis: true },
    ] satisfies readonly DetailRow[],
    settlementRows: [
      {
        label: `${brand.programName} 禮遇`,
        value: "-NT$ 1,580",
        mono: true,
      },
      { label: "您支付", value: "NT$ 0", mono: true, emphasis: true },
    ] satisfies readonly DetailRow[],
    paymentRows: [
      {
        label: "付款方式",
        value: `${brand.programName} ••${brand.cardArt.lastFour}`,
        mono: true,
      },
      { label: "入帳期別", value: "2026-06 帳單" },
      { label: "禮遇序號", value: `${brand.code}-2026-0004`, mono: true },
      { label: "收據編號", value: "rcp_8821a912", mono: true },
    ] satisfies readonly DetailRow[],
  };
}

function ReceiptRow({
  theme,
  row,
  borderless = false,
}: {
  theme: CanvasTheme;
  row: DetailRow;
  borderless?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        gap: 12,
        padding: "9px 0",
        borderBottom: borderless ? "none" : "1px dashed #E5E7EB",
      }}
    >
      <span
        style={{
          fontSize: 12.5,
          color: theme.textMuted,
          lineHeight: 1.45,
        }}
      >
        {row.label}
      </span>
      <span
        style={{
          fontSize: row.emphasis ? 13.5 : 12.5,
          fontWeight: row.emphasis ? 700 : 600,
          color: theme.text,
          fontFamily: row.mono ? theme.monoFamily : theme.fontFamily,
          whiteSpace: "nowrap",
          lineHeight: 1.45,
        }}
      >
        {row.value}
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
    const receipt = buildReceiptDetails(brand);

    return (
      <div>
        <CanvasPageHeader
          theme={theme}
          title="行程明細"
          subtitle={
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <span>{receipt.bookingId}</span>
              <CanvasPill theme={theme} tone="success">
                {receipt.statusLabel}
              </CanvasPill>
            </span>
          }
          sticky={false}
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
                padding: "14px 16px 12px",
                borderBottom: "1px dashed #E5E7EB",
              }}
            >
              {receipt.timeline.map((row, index) => (
                <ReceiptRow
                  key={`${row.label}-${row.value}`}
                  theme={theme}
                  row={row}
                  borderless={index === receipt.timeline.length - 1}
                />
              ))}
            </div>

            <div style={{ padding: "12px 16px 14px" }}>
              {receipt.fareRows.map((row, index) => (
                <ReceiptRow
                  key={`${row.label}-${row.value}`}
                  theme={theme}
                  row={row}
                  borderless={index === receipt.fareRows.length - 1}
                />
              ))}

              <div style={{ marginTop: 10 }}>
                {receipt.settlementRows.map((row, index) => (
                  <ReceiptRow
                    key={`${row.label}-${row.value}`}
                    theme={theme}
                    row={row}
                    borderless={index === receipt.settlementRows.length - 1}
                  />
                ))}
              </div>
            </div>
          </CanvasCard>

          <CanvasCard
            theme={theme}
            title="款項"
            padding={0}
            style={{
              background: "linear-gradient(180deg, #FAF3DF, #FFFDF5)",
              borderColor: "#E5D58A",
            }}
          >
            <div style={{ padding: "12px 16px 14px" }}>
              {receipt.paymentRows.map((row, index) => (
                <ReceiptRow
                  key={`${row.label}-${row.value}`}
                  theme={theme}
                  row={row}
                  borderless={index === receipt.paymentRows.length - 1}
                />
              ))}
            </div>
          </CanvasCard>

          <div style={buttonGridStyle}>
            <CanvasBtn
              theme={theme}
              variant="secondary"
              style={gridButtonStyle}
            >
              下載收據 PDF
            </CanvasBtn>
            <CanvasBtn
              theme={theme}
              variant="secondary"
              style={gridButtonStyle}
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
