import type { CSSProperties, ReactNode } from "react";
import type { PartnerBrandTemplate } from "@drts/ui-tokens";

export const partnerBookingScreens = [
  "landing",
  "eligibility",
  "book",
  "confirmed",
  "trips",
  "receipt",
  "help",
] as const;

export type PartnerBookingScreenId = (typeof partnerBookingScreens)[number];

export const partnerBookingStateScreens = [
  "eligible",
  "ineligible",
  "manual_review",
  "inactive",
  "eligibility_required",
] as const;

export type PartnerBookingStateScreenId =
  (typeof partnerBookingStateScreens)[number];

type ScreenMeta = {
  id: PartnerBookingScreenId;
  label: string;
  eyebrow: string;
  summary: string;
};

type StateScreenMeta = {
  id: PartnerBookingStateScreenId;
  routeSegment: string;
  label: string;
  eyebrow: string;
  title: string;
  summary: string;
  tone: TripItem["tone"];
  guidance: string;
  primaryAction: {
    label: string;
    href: string;
  };
  secondaryAction: {
    label: string;
    href: string;
  };
  bullets: readonly string[];
};

type TripItem = {
  when: string;
  route: string;
  state: string;
  tone: "neutral" | "primary" | "accent" | "success";
  amount: string;
  benefit: string;
};

const screenMeta: ReadonlyArray<ScreenMeta> = [
  {
    id: "landing",
    label: "入口",
    eyebrow: "入口頁",
    summary: "合作夥伴入口，顯示權益餘額與可用服務。",
  },
  {
    id: "eligibility",
    label: "資格確認",
    eyebrow: "資格頁",
    summary: "完成合作夥伴權益方案的一次性連結與同意。",
  },
  {
    id: "book",
    label: "建立行程",
    eyebrow: "預約頁",
    summary: "確認上車地點、出發時間、服務細節與權益折抵費用。",
  },
  {
    id: "confirmed",
    label: "已派車",
    eyebrow: "派車頁",
    summary: "顯示已指派司機、預估抵達、地圖資訊與客服操作。",
  },
  {
    id: "trips",
    label: "我的行程",
    eyebrow: "行程頁",
    summary: "列出行程紀錄與年度剩餘權益趟次。",
  },
  {
    id: "receipt",
    label: "行程明細",
    eyebrow: "明細頁",
    summary: "顯示已完成行程收據與權益折抵明細。",
  },
  {
    id: "help",
    label: "協助",
    eyebrow: "協助頁",
    summary: "提供客服專線、常見問題與爭議申請入口。",
  },
] as const;

const serviceItems = [
  ["機場接送", "桃園 / 松山 · 商務車", "機場"],
  ["優先派車", "都會區 · 8 分鐘內到車", "優先"],
  ["商務時段", "平日 07:00-22:00 · 含車型升級", "商務"],
] as const;

const screenMetaById = Object.fromEntries(
  screenMeta.map((item) => [item.id, item]),
) as Record<PartnerBookingScreenId, ScreenMeta>;

const stateScreenMeta: ReadonlyArray<StateScreenMeta> = [
  {
    id: "eligible",
    routeSegment: "eligible",
    label: "資格通過",
    eyebrow: "狀態閘門",
    title: "資格已通過",
    summary: "合作夥伴權益檢查已通過，可以繼續建立預約。",
    tone: "success",
    guidance:
      "此頁明確告知乘客資格已通過，不會在未說明的情況下直接跳進建立預約。",
    primaryAction: {
      label: "繼續預約",
      href: "/book",
    },
    secondaryAction: {
      label: "回看資格確認",
      href: "/eligibility",
    },
    bullets: [
      "建立預約時會帶入資格驗證紀錄與合作夥伴來源。",
      "免費趟次或折扣規則仍由後端權益服務判定。",
      "合作夥伴登入或回呼流程可安全導向此頁。",
    ],
  },
  {
    id: "ineligible",
    routeSegment: "ineligible",
    label: "資格不符",
    eyebrow: "狀態閘門",
    title: "權益資格未通過",
    summary: "發卡方或合作夥伴規則未允許此乘客使用權益。",
    tone: "accent",
    guidance:
      "建立預約會維持鎖定。乘客需修正合作夥伴資料，或改由非權益流程處理。",
    primaryAction: {
      label: "重新確認資格",
      href: "/eligibility",
    },
    secondaryAction: {
      label: "聯絡客服",
      href: "/help",
    },
    bullets: [
      "資格不符時不會繼續進入建立預約。",
      "頁面會顯示發卡方或合作夥伴拒絕使用權益的脈絡。",
      "若政策允許，客服可引導乘客改走非權益流程。",
    ],
  },
  {
    id: "manual_review",
    routeSegment: "manual_review",
    label: "人工審查",
    eyebrow: "狀態閘門",
    title: "需要人工審查",
    summary: "資格驗證無法自動通過，已進入人工審查佇列。",
    tone: "primary",
    guidance:
      "營運或合作夥伴審查完成前，合作夥伴預約會暫停。這是明確阻擋，不是一般提示。",
    primaryAction: {
      label: "開啟客服選項",
      href: "/help",
    },
    secondaryAction: {
      label: "回到入口",
      href: "/",
    },
    bullets: [
      "驗證逾時或需離線確認時，會視為待審查而非成功。",
      "審查未完成前，不會顯示建立預約操作。",
      "頁面會明確告知乘客後續處理仍在等待。",
    ],
  },
  {
    id: "inactive",
    routeSegment: "inactive",
    label: "入口停用",
    eyebrow: "狀態閘門",
    title: "合作夥伴入口已停用",
    summary: "此合作夥伴入口目前未啟用，暫時無法使用權益預約。",
    tone: "neutral",
    guidance:
      "頁面會保留白牌品牌框架並明確顯示停用狀態，不會顯示可建立預約的操作。",
    primaryAction: {
      label: "回到入口",
      href: "/",
    },
    secondaryAction: {
      label: "撥打合作夥伴專線",
      href: "/help",
    },
    bullets: [
      "入口停用代表需要平台管理員處理後才能恢復服務。",
      "切換或回復期間可能會直接導向此停用頁。",
      "白牌框架會保持可見，方便客服確認乘客原本要使用的合作夥伴。",
    ],
  },
  {
    id: "eligibility_required",
    routeSegment: "eligibility-required",
    label: "需要驗證",
    eyebrow: "狀態閘門",
    title: "需要先完成資格驗證",
    summary: "此合作方案必須先確認資格，才能開放建立預約。",
    tone: "primary",
    guidance: "若乘客在缺少資格驗證脈絡時進入預約頁，會先導向此頁。",
    primaryAction: {
      label: "驗證資格",
      href: "/eligibility",
    },
    secondaryAction: {
      label: "回到入口",
      href: "/",
    },
    bullets: [
      "系統不會自動開始建立預約，而是先明確要求驗證。",
      "只有資格通過才會解鎖建立預約。",
      "這能讓合作夥伴入口權限與既有租戶後台規則保持一致。",
    ],
  },
] as const;

const stateScreenMetaById = Object.fromEntries(
  stateScreenMeta.map((item) => [item.id, item]),
) as Record<PartnerBookingStateScreenId, StateScreenMeta>;

const phoneScreenStyle: CSSProperties = {
  width: "100%",
  maxWidth: "390px",
  minHeight: "844px",
  overflow: "hidden",
  borderRadius: "30px",
  border: "1px solid rgba(15, 23, 42, 0.14)",
  background: "#f4f6fb",
  boxShadow: "0 28px 60px rgba(15, 23, 42, 0.16)",
};

const pageStackStyle: CSSProperties = {
  display: "grid",
  gap: "20px",
};

const sectionCardStyle: CSSProperties = {
  borderRadius: "20px",
  border: "1px solid rgba(15, 23, 42, 0.08)",
  background: "rgba(255, 255, 255, 0.94)",
  boxShadow: "0 20px 40px rgba(15, 23, 42, 0.06)",
};

function buildScreenHref(
  basePath: string,
  screen: PartnerBookingScreenId,
): string {
  return screen === "landing" ? basePath : `${basePath}/${screen}`;
}

function screenToneStyle(
  brand: PartnerBrandTemplate,
  tone: TripItem["tone"],
): CSSProperties {
  if (tone === "success") {
    return {
      color: "#166534",
      background: "#f0fdf4",
      border: "1px solid #bbf7d0",
    };
  }

  if (tone === "accent") {
    return {
      color: brand.primaryDark,
      background: "#faf3df",
      border: "1px solid #e5d58a",
    };
  }

  if (tone === "primary") {
    return {
      color: brand.primary,
      background: brand.surface.bg,
      border: `1px solid ${brand.surface.border}`,
    };
  }

  return {
    color: "#56657f",
    background: "#f1f3f8",
    border: "1px solid #dde3ec",
  };
}

function metaForBrand(brand: PartnerBrandTemplate) {
  const remainingBenefits = 9;
  const totalBenefits = 12;
  const usedBenefits = totalBenefits - remainingBenefits;
  const trips: TripItem[] = [
    {
      when: "今天 14:30",
      route: "台北信義 → 桃園 T2",
      state: "已派車",
      tone: "success",
      amount: "免費",
      benefit: `${brand.programName} #4`,
    },
    {
      when: "昨天 09:12",
      route: "台北車站 -> 內湖科技園區",
      state: "已完成",
      tone: "neutral",
      amount: "NT$ 0",
      benefit: `${brand.programName} #3`,
    },
    {
      when: "5/2 18:45",
      route: "台北 101 -> 松山機場",
      state: "已完成",
      tone: "neutral",
      amount: "NT$ 0",
      benefit: `${brand.programName} #2`,
    },
    {
      when: "4/28 07:30",
      route: "陽明山 → 桃園 T1",
      state: "已完成",
      tone: "accent",
      amount: "NT$ 240",
      benefit: "額度後 8 折",
    },
  ];

  return {
    remainingBenefits,
    totalBenefits,
    usedBenefits,
    personName: "陳俊宏",
    riderName: "陳〇明",
    pickup: "台北市信義區松仁路 100 號",
    pickupDetail: "大和商務集團 · 總部大廳",
    dropoff: "桃園機場 第二航廈",
    dropoffDetail: "出境大廳 7 號門",
    departureTime: "2026-05-08 17:30",
    benefitId: `${brand.code}-2026-0004`,
    receiptId: "rcp_8821a912",
    bookingId: "bk_5512",
    trips,
  };
}

function PhoneHeader({
  brand,
  title,
  subtitle,
  trailing,
}: {
  brand: PartnerBrandTemplate;
  title: string;
  subtitle: string;
  trailing?: string;
}) {
  return (
    <div
      style={{
        background: `linear-gradient(135deg, ${brand.primaryDark} 0%, ${brand.primary} 72%)`,
        color: "#ffffff",
        padding: "20px 24px 24px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          right: "-48px",
          top: "-36px",
          width: "220px",
          height: "220px",
          borderRadius: "999px",
          background: `radial-gradient(circle, ${brand.accent}55 0%, transparent 62%)`,
        }}
      />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          fontSize: "11px",
          letterSpacing: "0.16em",
          opacity: 0.84,
          fontWeight: 700,
          textTransform: "uppercase",
        }}
      >
        <span
          style={{
            width: "22px",
            height: "22px",
            borderRadius: "6px",
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
        {brand.bankName} x DRTS
      </div>
      <div style={{ marginTop: "16px", fontSize: "24px", fontWeight: 800 }}>
        {title}
      </div>
      <div style={{ marginTop: "6px", fontSize: "13px", opacity: 0.82 }}>
        {subtitle}
      </div>
      {trailing ? (
        <div
          style={{
            position: "absolute",
            right: "24px",
            top: "24px",
            padding: "4px 10px",
            borderRadius: "999px",
            border: "1px solid rgba(255, 255, 255, 0.24)",
            background: "rgba(255, 255, 255, 0.12)",
            fontSize: "11px",
            fontWeight: 700,
            letterSpacing: "0.08em",
          }}
        >
          {trailing}
        </div>
      ) : null}
    </div>
  );
}

function PhoneCard({
  title,
  children,
  style,
}: {
  title?: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <section
      style={{
        borderRadius: "16px",
        border: "1px solid #e5e7eb",
        background: "#ffffff",
        overflow: "hidden",
        ...style,
      }}
    >
      {title ? (
        <header
          style={{
            padding: "12px 16px 10px",
            borderBottom: "1px solid #f1f3f8",
            fontSize: "13px",
            fontWeight: 700,
            color: "#0e1424",
          }}
        >
          {title}
        </header>
      ) : null}
      <div style={{ padding: "16px" }}>{children}</div>
    </section>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: "12px",
        padding: "8px 0",
        borderBottom: "1px dashed #f1f3f8",
        fontSize: "13px",
      }}
    >
      <span style={{ color: "#56657f" }}>{label}</span>
      <span
        style={{
          color: "#0e1424",
          fontFamily: mono
            ? '"JetBrains Mono", ui-monospace, monospace'
            : "inherit",
          fontWeight: mono ? 600 : 500,
          textAlign: "right",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function ActionButton({
  brand,
  label,
  primary,
}: {
  brand: PartnerBrandTemplate;
  label: string;
  primary?: boolean;
}) {
  return (
    <div
      style={{
        width: "100%",
        minHeight: "46px",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "12px",
        border: primary ? `1px solid ${brand.primary}` : "1px solid #d2d8e2",
        background: primary ? brand.primary : "#ffffff",
        color: primary ? "#ffffff" : "#0e1424",
        fontSize: "14px",
        fontWeight: 700,
      }}
    >
      {label}
    </div>
  );
}

function Chip({
  brand,
  tone,
  label,
}: {
  brand: PartnerBrandTemplate;
  tone: TripItem["tone"];
  label: string;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "4px 9px",
        borderRadius: "999px",
        fontSize: "11px",
        fontWeight: 700,
        ...screenToneStyle(brand, tone),
      }}
    >
      {label}
    </span>
  );
}

export function isPartnerBookingScreenId(
  value: string,
): value is PartnerBookingScreenId {
  return partnerBookingScreens.includes(value as PartnerBookingScreenId);
}

export function getPartnerBookingScreenMeta(
  screen: PartnerBookingScreenId,
): ScreenMeta {
  return screenMetaById[screen];
}

export function getPartnerBookingArtboardAnchor(
  screen: PartnerBookingScreenId,
): string {
  return screen;
}

export function getPartnerBookingStateScreenMeta(
  screen: PartnerBookingStateScreenId,
): StateScreenMeta {
  return stateScreenMetaById[screen];
}

export function getPartnerBookingStateHref(
  basePath: string,
  screen: PartnerBookingStateScreenId,
): string {
  return `${basePath}/${getPartnerBookingStateScreenMeta(screen).routeSegment}`;
}

export function PartnerBookingPhoneScreen({
  brand,
  screen,
}: {
  brand: PartnerBrandTemplate;
  screen: PartnerBookingScreenId;
}) {
  const demo = metaForBrand(brand);
  const benefitWidth = `${
    (demo.remainingBenefits / demo.totalBenefits) * 100
  }%`;

  let content: ReactNode;

  if (screen === "landing") {
    content = (
      <>
        <PhoneHeader
          brand={brand}
          title="禮賓接送"
          subtitle={`${brand.programName} 卡友專屬 · 全年免費 ${demo.totalBenefits} 趟`}
          trailing="專屬"
        />
        <div style={{ padding: "16px", display: "grid", gap: "12px" }}>
          <PhoneCard>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div
                style={{
                  width: "50px",
                  height: "32px",
                  borderRadius: "8px",
                  background: `linear-gradient(135deg, ${brand.primaryDark}, ${brand.primary})`,
                  position: "relative",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    right: "5px",
                    bottom: "5px",
                    width: "10px",
                    height: "10px",
                    borderRadius: "3px",
                    background: brand.accent,
                  }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "13px", fontWeight: 700 }}>
                  •••• •••• •••• {brand.cardArt.lastFour}
                </div>
                <div style={{ fontSize: "11px", color: "#56657f" }}>
                  {demo.riderName} · {brand.programName}
                </div>
              </div>
              <Chip brand={brand} tone="success" label="資格通過" />
            </div>
            <div
              style={{
                marginTop: "12px",
                borderRadius: "12px",
                background: "#f1f3f8",
                padding: "12px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                }}
              >
                <span style={{ fontSize: "11px", color: "#56657f" }}>
                  本年度剩餘趟次
                </span>
                <span
                  style={{
                    fontSize: "13px",
                    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                  }}
                >
                  <b style={{ fontSize: "18px" }}>{demo.remainingBenefits}</b> /{" "}
                  {demo.totalBenefits}
                </span>
              </div>
              <div
                style={{
                  height: "5px",
                  marginTop: "8px",
                  borderRadius: "999px",
                  background: "#dde3ec",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: benefitWidth,
                    height: "100%",
                    background: brand.accent,
                  }}
                />
              </div>
            </div>
          </PhoneCard>

          <PhoneCard title="可使用的服務">
            {serviceItems.map(([title, detail, tag], index) => (
              <div
                key={title}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "10px 0",
                  borderBottom:
                    index < 2 ? "1px dashed #f1f3f8" : "1px solid transparent",
                }}
              >
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "10px",
                    background: `${brand.primary}12`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <div
                    style={{
                      width: "14px",
                      height: "14px",
                      borderRadius: "4px",
                      background: brand.primary,
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "13px", fontWeight: 700 }}>
                    {title}
                  </div>
                  <div style={{ fontSize: "11px", color: "#56657f" }}>
                    {detail}
                  </div>
                </div>
                <Chip brand={brand} tone="primary" label={tag} />
              </div>
            ))}
          </PhoneCard>

          <PhoneCard
            style={{
              background: "linear-gradient(135deg, #faf3df 0%, #fffdf5 100%)",
              borderColor: "#e5d58a",
            }}
          >
            <div style={{ display: "flex", gap: "10px", alignItems: "start" }}>
              <div
                style={{
                  width: "4px",
                  alignSelf: "stretch",
                  borderRadius: "999px",
                  background: brand.accent,
                }}
              />
              <div>
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: 800,
                    color: brand.primaryDark,
                  }}
                >
                  禮遇條款
                </div>
                <div
                  style={{
                    marginTop: "4px",
                    fontSize: "11px",
                    lineHeight: 1.65,
                    color: "#56657f",
                  }}
                >
                  當免費額度用完後，每趟仍享 8 折優惠。費用將與本卡帳單合併，
                  不需現場付款。
                </div>
              </div>
            </div>
          </PhoneCard>

          <ActionButton brand={brand} label="立即叫車" primary />
          <ActionButton brand={brand} label="查看歷史趟次" />
        </div>
      </>
    );
  } else if (screen === "eligibility") {
    content = (
      <>
        <PhoneHeader
          brand={brand}
          title="連結卡片"
          subtitle="第一次使用 · 一次性確認"
        />
        <div style={{ padding: "16px", display: "grid", gap: "12px" }}>
          <PhoneCard title="您的權益">
            <DetailRow label="持卡身份" value={brand.programName} />
            <DetailRow label="卡號末四碼" value={brand.cardArt.lastFour} mono />
            <DetailRow
              label="本年度免費趟次"
              value={`${demo.totalBenefits} 趟`}
              mono
            />
            <DetailRow label="優惠折扣" value="額度後 8 折" />
            <DetailRow label="服務範圍" value="台北 · 桃園 · 新竹" />
          </PhoneCard>
          <PhoneCard title="授權同意">
            {[
              "使用本卡身份識別建立 DRTS 帳號",
              "與 DRTS 共享行程必要資訊",
              `同意《${brand.bankName} x DRTS 禮賓接送服務條款 v3》`,
            ].map((item, index) => (
              <div
                key={item}
                style={{
                  display: "flex",
                  gap: "12px",
                  padding: "10px 0",
                  borderBottom:
                    index < 2 ? "1px dashed #f1f3f8" : "1px solid transparent",
                }}
              >
                <div
                  style={{
                    width: "18px",
                    height: "18px",
                    marginTop: "2px",
                    borderRadius: "5px",
                    background: brand.primary,
                    border: `2px solid ${brand.primary}`,
                    flexShrink: 0,
                  }}
                />
                <div>
                  <div style={{ fontSize: "12px", fontWeight: 700 }}>
                    {item}
                  </div>
                  <div
                    style={{
                      fontSize: "11px",
                      color: "#56657f",
                      marginTop: "2px",
                    }}
                  >
                    不會傳送完整卡號或安全碼，只保留合作資格驗證所需欄位。
                  </div>
                </div>
              </div>
            ))}
          </PhoneCard>
          <div style={{ display: "grid", gap: "8px" }}>
            <ActionButton brand={brand} label="確認連結並繼續" primary />
            <ActionButton brand={brand} label="稍後" />
          </div>
        </div>
      </>
    );
  } else if (screen === "book") {
    content = (
      <>
        <PhoneHeader
          brand={brand}
          title="建立行程"
          subtitle="機場接送 · 桃園 T2"
        />
        <div style={{ padding: "16px", display: "grid", gap: "12px" }}>
          <PhoneCard>
            <div
              style={{
                paddingBottom: "14px",
                borderBottom: "1px solid #f1f3f8",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  marginBottom: "8px",
                }}
              >
                <div
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "999px",
                    background: brand.primary,
                  }}
                />
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    color: "#56657f",
                  }}
                >
                  上車
                </span>
              </div>
              <div style={{ fontSize: "14px", fontWeight: 700 }}>
                {demo.pickup}
              </div>
              <div
                style={{ marginTop: "2px", fontSize: "11px", color: "#56657f" }}
              >
                {demo.pickupDetail}
              </div>
            </div>
            <div style={{ paddingTop: "14px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  marginBottom: "8px",
                }}
              >
                <div
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "2px",
                    background: brand.accent,
                  }}
                />
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    color: "#56657f",
                  }}
                >
                  下車
                </span>
              </div>
              <div style={{ fontSize: "14px", fontWeight: 700 }}>
                {demo.dropoff}
              </div>
              <div
                style={{ marginTop: "2px", fontSize: "11px", color: "#56657f" }}
              >
                {demo.dropoffDetail}
              </div>
            </div>
          </PhoneCard>
          <PhoneCard title="出發時間">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: "6px",
              }}
            >
              {["即時", "+30 分", "+1 小時"].map((option, index) => (
                <div
                  key={option}
                  style={{
                    borderRadius: "10px",
                    padding: "10px 8px",
                    textAlign: "center",
                    fontSize: "12px",
                    fontWeight: 700,
                    color: index === 1 ? brand.primary : "#0e1424",
                    border:
                      index === 1
                        ? `2px solid ${brand.primary}`
                        : "1px solid #d2d8e2",
                    background: index === 1 ? `${brand.primary}12` : "#ffffff",
                  }}
                >
                  {option}
                </div>
              ))}
            </div>
            <div
              style={{
                marginTop: "10px",
                borderRadius: "10px",
                background: "#f1f3f8",
                padding: "10px",
                fontSize: "12px",
                fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              }}
            >
              預計出發：{demo.departureTime}
            </div>
          </PhoneCard>
          <PhoneCard title="服務細節">
            <DetailRow label="人數" value="1 位" />
            <DetailRow label="行李" value="2 件" />
            <DetailRow label="特殊需求" value="-" />
            <DetailRow label="車型" value="商務車 (升級)" />
          </PhoneCard>
          <PhoneCard
            title="禮遇與費用"
            style={{
              background: "linear-gradient(180deg, #faf3df 0%, #fffdf5 100%)",
              borderColor: "#e5d58a",
            }}
          >
            <DetailRow label="基本費用" value="NT$ 1,580" mono />
            <DetailRow
              label={`${brand.programName} 禮遇`}
              value="-NT$ 1,580"
              mono
            />
            <DetailRow label="您將支付" value="免費" />
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginTop: "10px",
                borderRadius: "10px",
                background: "#ffffff",
                padding: "10px",
              }}
            >
              <Chip
                brand={brand}
                tone="accent"
                label={`${demo.remainingBenefits} / ${demo.totalBenefits} 趟`}
              />
              <span style={{ fontSize: "11px", color: "#56657f" }}>
                本年度剩餘禮遇趟次
              </span>
            </div>
          </PhoneCard>
          <ActionButton brand={brand} label="確認預約" primary />
        </div>
      </>
    );
  } else if (screen === "confirmed") {
    content = (
      <>
        <PhoneHeader
          brand={brand}
          title="已派車"
          subtitle="駕駛將於 8 分鐘後抵達"
        />
        <div style={{ padding: "16px", display: "grid", gap: "12px" }}>
          <PhoneCard>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div
                style={{
                  width: "56px",
                  height: "56px",
                  borderRadius: "999px",
                  background: `linear-gradient(135deg, ${brand.primary}, ${brand.primaryDark})`,
                  color: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "18px",
                  fontWeight: 800,
                }}
              >
                陳
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "14px", fontWeight: 800 }}>
                  {demo.personName}
                </div>
                <div style={{ fontSize: "11px", color: "#56657f" }}>
                  1,243 趟 · 4.86 ★
                </div>
                <div
                  style={{
                    marginTop: "2px",
                    fontSize: "11px",
                    color: brand.primary,
                    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                  }}
                >
                  Toyota Prius a · ARJ-3120
                </div>
              </div>
              <div
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "999px",
                  background: brand.primary,
                }}
              />
            </div>
          </PhoneCard>
          <PhoneCard style={{ padding: 0 }}>
            <div
              style={{
                height: "180px",
                background: "linear-gradient(180deg, #dde5f0 0%, #c7d7f0 100%)",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <svg
                width="100%"
                height="100%"
                viewBox="0 0 360 180"
                style={{ position: "absolute", inset: 0 }}
              >
                <path
                  d="M0,120 Q80,100 160,110 T360,90"
                  stroke="#a5b4fc"
                  strokeWidth="2"
                  fill="none"
                  strokeDasharray="4 4"
                />
                <path
                  d="M40,140 L100,100 L180,90 L260,70 L320,40"
                  stroke={brand.primary}
                  strokeWidth="3"
                  fill="none"
                />
                <circle cx="40" cy="140" r="6" fill={brand.primary} />
                <circle
                  cx="320"
                  cy="40"
                  r="6"
                  fill={brand.accent}
                  stroke="#ffffff"
                  strokeWidth="2"
                />
                <circle
                  cx="180"
                  cy="90"
                  r="9"
                  fill={brand.primary}
                  stroke="#ffffff"
                  strokeWidth="2"
                />
              </svg>
            </div>
            <div
              style={{
                padding: "16px",
                display: "flex",
                alignItems: "baseline",
                gap: "16px",
              }}
            >
              <div>
                <div style={{ fontSize: "11px", color: "#56657f" }}>
                  預計抵達
                </div>
                <div
                  style={{
                    fontSize: "24px",
                    fontWeight: 800,
                    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                  }}
                >
                  8{" "}
                  <span style={{ fontSize: "12px", color: "#56657f" }}>
                    分鐘
                  </span>
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "11px", color: "#56657f" }}>距離</div>
                <div
                  style={{
                    fontSize: "14px",
                    fontWeight: 700,
                    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                  }}
                >
                  2.4 km
                </div>
              </div>
              <Chip brand={brand} tone="success" label="已派車" />
            </div>
          </PhoneCard>
          <PhoneCard title="行程資訊">
            <DetailRow label="預約編號" value={demo.bookingId} mono />
            <DetailRow label="禮遇" value={`${brand.programName} · 趟次 #4`} />
            <DetailRow label="車型" value="商務車 (升級)" />
            <DetailRow label="您將支付" value="免費" />
          </PhoneCard>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "8px",
            }}
          >
            <ActionButton brand={brand} label="取消行程" />
            <ActionButton brand={brand} label="客服協助" />
          </div>
        </div>
      </>
    );
  } else if (screen === "trips") {
    content = (
      <>
        <PhoneHeader
          brand={brand}
          title="我的行程"
          subtitle={`本年度 · 已使用 ${demo.usedBenefits} 趟`}
        />
        <div style={{ padding: "16px" }}>
          <PhoneCard>
            <div
              style={{
                margin: "-16px -16px 16px",
                padding: "14px 16px",
                background: "linear-gradient(180deg, #faf3df, #fffdf5)",
                borderBottom: "1px solid #e5d58a",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                }}
              >
                <span
                  style={{
                    fontSize: "11px",
                    color: "#56657f",
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                  }}
                >
                  2026 年度
                </span>
                <span
                  style={{
                    fontSize: "13px",
                    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                  }}
                >
                  <b style={{ fontSize: "22px" }}>{demo.remainingBenefits}</b> /{" "}
                  {demo.totalBenefits} 剩餘
                </span>
              </div>
              <div
                style={{
                  height: "5px",
                  marginTop: "8px",
                  borderRadius: "999px",
                  background: "#ffffff",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: benefitWidth,
                    height: "100%",
                    background: brand.accent,
                  }}
                />
              </div>
            </div>
            {demo.trips.map((trip, index) => (
              <div
                key={`${trip.when}-${trip.route}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "12px 0",
                  borderBottom:
                    index < demo.trips.length - 1
                      ? "1px solid #f1f3f8"
                      : "1px solid transparent",
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "13px", fontWeight: 700 }}>
                    {trip.route}
                  </div>
                  <div
                    style={{
                      marginTop: "2px",
                      fontSize: "11px",
                      color: "#56657f",
                    }}
                  >
                    {trip.when} · {trip.benefit}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <Chip brand={brand} tone={trip.tone} label={trip.state} />
                  <div
                    style={{
                      marginTop: "4px",
                      fontSize: "12px",
                      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                    }}
                  >
                    {trip.amount}
                  </div>
                </div>
              </div>
            ))}
          </PhoneCard>
        </div>
      </>
    );
  } else if (screen === "receipt") {
    content = (
      <>
        <PhoneHeader
          brand={brand}
          title="行程明細"
          subtitle={`${demo.bookingId} · 已完成`}
        />
        <div style={{ padding: "16px", display: "grid", gap: "12px" }}>
          <PhoneCard>
            <div
              style={{
                paddingBottom: "12px",
                borderBottom: "1px dashed #e5e7eb",
              }}
            >
              <DetailRow label="出發" value="14:30:11" mono />
              <DetailRow label="抵達" value="15:42:27" mono />
              <DetailRow label="行車" value="1 小時 12 分" />
              <DetailRow label="距離" value="38.4 km" mono />
            </div>
            <div style={{ paddingTop: "12px" }}>
              <DetailRow label="車資 (基本)" value="NT$ 1,420" mono />
              <DetailRow label="機場附加" value="NT$ 100" mono />
              <DetailRow label="高速公路費" value="NT$ 60" mono />
              <DetailRow label="小計" value="NT$ 1,580" mono />
              <div style={{ marginTop: "8px" }}>
                <DetailRow
                  label={`${brand.programName} 禮遇`}
                  value="-NT$ 1,580"
                  mono
                />
                <DetailRow label="您支付" value="NT$ 0" mono />
              </div>
            </div>
          </PhoneCard>
          <PhoneCard
            title="款項"
            style={{
              background: "linear-gradient(180deg, #faf3df, #fffdf5)",
              borderColor: "#e5d58a",
            }}
          >
            <DetailRow
              label="付款方式"
              value={`${brand.programName} ••${brand.cardArt.lastFour}`}
              mono
            />
            <DetailRow label="入帳期別" value="2026-06 帳單" />
            <DetailRow label="禮遇序號" value={demo.benefitId} mono />
            <DetailRow label="收據編號" value={demo.receiptId} mono />
          </PhoneCard>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "8px",
            }}
          >
            <ActionButton brand={brand} label="下載收據 PDF" />
            <ActionButton brand={brand} label="聯絡客服" />
          </div>
        </div>
      </>
    );
  } else {
    content = (
      <>
        <PhoneHeader
          brand={brand}
          title="協助"
          subtitle={`${brand.programName} 卡友專線`}
        />
        <div style={{ padding: "16px", display: "grid", gap: "12px" }}>
          <PhoneCard
            style={{
              background: `linear-gradient(135deg, ${brand.primaryDark}, ${brand.primary})`,
              color: "#ffffff",
              borderColor: "transparent",
            }}
          >
            <div
              style={{
                fontSize: "11px",
                opacity: 0.72,
                letterSpacing: "0.1em",
              }}
            >
              24 小時專線
            </div>
            <div
              style={{
                marginTop: "8px",
                fontSize: "28px",
                fontWeight: 800,
                fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              }}
            >
              {brand.hotline.phone}
            </div>
            <div style={{ marginTop: "6px", fontSize: "11px", opacity: 0.82 }}>
              {brand.hotline.note}
            </div>
          </PhoneCard>
          <PhoneCard title="常見問題">
            {[
              ["禮遇趟次如何計算？", "每年元旦重置 12 趟，未使用不累計。"],
              ["可以代為叫車嗎？", "可，但乘客手機需填入訂單。"],
              ["取消政策", "出發 5 分鐘前可免費取消，逾時將扣除一次禮遇。"],
              ["額度後仍可叫車嗎？", "可，享 8 折優惠並合併至本卡帳單。"],
            ].map(([question, answer], index) => (
              <div
                key={question}
                style={{
                  padding: "10px 0",
                  borderBottom:
                    index < 3 ? "1px dashed #f1f3f8" : "1px solid transparent",
                }}
              >
                <div style={{ fontSize: "13px", fontWeight: 700 }}>
                  {question}
                </div>
                <div
                  style={{
                    marginTop: "4px",
                    fontSize: "12px",
                    lineHeight: 1.6,
                    color: "#56657f",
                  }}
                >
                  {answer}
                </div>
              </div>
            ))}
          </PhoneCard>
          <PhoneCard title="爭議或客訴">
            <div
              style={{
                marginBottom: "10px",
                fontSize: "12px",
                lineHeight: 1.6,
                color: "#56657f",
              }}
            >
              行程結束後 30 天內可提出爭議，將同時通知 partner 禮賓中心與 DRTS
              平台客服。
            </div>
            <ActionButton brand={brand} label="提出爭議" />
          </PhoneCard>
        </div>
      </>
    );
  }

  return (
    <div style={phoneScreenStyle}>
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
            background: "rgba(255,255,255,0.28)",
          }}
        />
      </div>
      {content}
    </div>
  );
}

export function PartnerBookingReferenceFunnel({
  brand,
  activeScreen,
  basePath,
}: {
  brand: PartnerBrandTemplate;
  activeScreen: PartnerBookingScreenId;
  basePath: string;
}) {
  const demo = metaForBrand(brand);
  const activeMeta = getPartnerBookingScreenMeta(activeScreen);

  return (
    <div style={pageStackStyle}>
      <section
        style={{
          ...sectionCardStyle,
          padding: "24px",
          background: `linear-gradient(135deg, ${brand.surface.bg} 0%, #ffffff 58%)`,
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            gap: "16px",
            alignItems: "start",
          }}
        >
          <div style={{ display: "grid", gap: "8px", maxWidth: "640px" }}>
            <div
              style={{
                fontSize: "12px",
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: brand.primary,
                fontWeight: 800,
              }}
            >
              {brand.displayName}
            </div>
            <h1
              style={{
                margin: 0,
                fontSize: "30px",
                lineHeight: 1.15,
                color: "#0e1424",
              }}
            >
              合作夥伴預約流程 · 7 個頁面
            </h1>
            <p
              style={{
                margin: 0,
                fontSize: "14px",
                lineHeight: 1.7,
                color: "#56657f",
              }}
            >
              白牌合作夥伴預約流程示範。下方內容使用品牌樣式與展示資料，
              呈現乘客從資格確認到收據查詢的完整路徑。
            </p>
          </div>

          <div
            style={{
              minWidth: "240px",
              borderRadius: "18px",
              border: `1px solid ${brand.surface.border}`,
              background: "rgba(255,255,255,0.82)",
              padding: "16px",
              display: "grid",
              gap: "10px",
            }}
          >
            <div
              style={{
                fontSize: "12px",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#56657f",
                fontWeight: 700,
              }}
            >
              方案摘要
            </div>
            <div
              style={{ fontSize: "18px", fontWeight: 800, color: "#0e1424" }}
            >
              {brand.programName}
            </div>
            <div style={{ fontSize: "13px", color: "#56657f" }}>
              剩餘禮遇 {demo.remainingBenefits}/{demo.totalBenefits} · 客服專線{" "}
              {brand.hotline.phone}
            </div>
          </div>
        </div>
      </section>

      <section
        style={{
          ...sectionCardStyle,
          padding: "16px",
          display: "flex",
          flexWrap: "wrap",
          gap: "10px",
        }}
      >
        {partnerBookingScreens.map((screen) => {
          const meta = getPartnerBookingScreenMeta(screen);
          const isActive = screen === activeScreen;
          return (
            <a
              key={screen}
              href={buildScreenHref(basePath, screen)}
              style={{
                textDecoration: "none",
                display: "grid",
                gap: "4px",
                minWidth: "126px",
                padding: "12px 14px",
                borderRadius: "14px",
                border: isActive
                  ? `1px solid ${brand.primary}`
                  : "1px solid rgba(15, 23, 42, 0.10)",
                background: isActive ? `${brand.primary}10` : "#ffffff",
                color: "#0e1424",
              }}
            >
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  color: isActive ? brand.primary : "#64748b",
                }}
              >
                {meta.eyebrow}
              </span>
              <span style={{ fontSize: "14px", fontWeight: 800 }}>
                {meta.label}
              </span>
            </a>
          );
        })}
      </section>

      <section
        style={{
          display: "grid",
          gap: "20px",
          gridTemplateColumns: "minmax(0, 1.2fr) minmax(390px, 420px)",
          alignItems: "start",
        }}
      >
        <div style={{ display: "grid", gap: "20px" }}>
          <section style={{ ...sectionCardStyle, padding: "22px" }}>
            <div
              style={{
                display: "grid",
                gap: "8px",
                marginBottom: "18px",
              }}
            >
              <div
                style={{
                  fontSize: "12px",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "#64748b",
                  fontWeight: 700,
                }}
              >
                目前頁面
              </div>
              <div
                style={{ fontSize: "28px", fontWeight: 800, color: "#0e1424" }}
              >
                {activeMeta.label}
              </div>
              <div
                style={{ fontSize: "14px", lineHeight: 1.7, color: "#56657f" }}
              >
                {activeMeta.summary}
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gap: "12px",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              }}
            >
              {[
                ["入口網域", brand.host],
                ["租戶代碼", brand.tenantCode],
                ["方案", brand.cardArt.programLabel],
                ["卡號末四碼", brand.cardArt.lastFour],
              ].map(([label, value]) => (
                <div
                  key={label}
                  style={{
                    borderRadius: "16px",
                    border: "1px solid rgba(15, 23, 42, 0.08)",
                    background: "#f8fafc",
                    padding: "14px 16px",
                    display: "grid",
                    gap: "4px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "11px",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "#64748b",
                      fontWeight: 700,
                    }}
                  >
                    {label}
                  </span>
                  <span
                    style={{
                      fontSize: "14px",
                      fontWeight: 700,
                      color: "#0e1424",
                    }}
                  >
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section style={{ ...sectionCardStyle, padding: "22px" }}>
            <div
              style={{
                display: "grid",
                gap: "10px",
              }}
            >
              <div
                style={{
                  fontSize: "12px",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "#64748b",
                  fontWeight: 700,
                }}
              >
                頁面覆蓋
              </div>
              {screenMeta.map((item, index) => (
                <div
                  key={item.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "28px minmax(0, 1fr)",
                    gap: "12px",
                    alignItems: "start",
                    paddingTop: index === 0 ? 0 : "6px",
                  }}
                >
                  <div
                    style={{
                      width: "28px",
                      height: "28px",
                      borderRadius: "999px",
                      background:
                        item.id === activeScreen
                          ? brand.primary
                          : "rgba(15, 23, 42, 0.08)",
                      color: item.id === activeScreen ? "#ffffff" : "#334155",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "12px",
                      fontWeight: 800,
                    }}
                  >
                    {index + 1}
                  </div>
                  <div style={{ display: "grid", gap: "4px" }}>
                    <div
                      style={{
                        fontSize: "14px",
                        fontWeight: 800,
                        color: "#0e1424",
                      }}
                    >
                      {item.label}
                    </div>
                    <div
                      style={{
                        fontSize: "13px",
                        lineHeight: 1.6,
                        color: "#56657f",
                      }}
                    >
                      {item.summary}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div style={{ justifySelf: "center" }}>
          <PartnerBookingPhoneScreen brand={brand} screen={activeScreen} />
        </div>
      </section>
    </div>
  );
}

export function PartnerBookingStateGate({
  brand,
  state,
  basePath,
}: {
  brand: PartnerBrandTemplate;
  state: PartnerBookingStateScreenId;
  basePath: string;
}) {
  const meta = getPartnerBookingStateScreenMeta(state);

  return (
    <div style={pageStackStyle}>
      <section
        style={{
          ...sectionCardStyle,
          padding: "24px",
          background: `linear-gradient(135deg, ${brand.surface.bg} 0%, #ffffff 58%)`,
        }}
      >
        <div style={{ display: "grid", gap: "10px" }}>
          <div
            style={{
              fontSize: "12px",
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: brand.primary,
              fontWeight: 800,
            }}
          >
            {brand.displayName}
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: "30px",
              lineHeight: 1.15,
              color: "#0e1424",
            }}
          >
            {meta.title}
          </h1>
          <p
            style={{
              margin: 0,
              maxWidth: "760px",
              fontSize: "14px",
              lineHeight: 1.7,
              color: "#56657f",
            }}
          >
            {meta.guidance}
          </p>
        </div>
      </section>

      <section
        style={{
          display: "grid",
          gap: "20px",
          gridTemplateColumns: "minmax(0, 1.2fr) minmax(390px, 420px)",
          alignItems: "start",
        }}
      >
        <div style={{ display: "grid", gap: "20px" }}>
          <section style={{ ...sectionCardStyle, padding: "22px" }}>
            <div
              style={{
                display: "grid",
                gap: "8px",
                marginBottom: "18px",
              }}
            >
              <div
                style={{
                  fontSize: "12px",
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: "#64748b",
                  fontWeight: 700,
                }}
              >
                {meta.eyebrow}
              </div>
              <h2
                style={{
                  margin: 0,
                  fontSize: "22px",
                  lineHeight: 1.25,
                  color: "#0e1424",
                }}
              >
                {meta.label}
              </h2>
              <p
                style={{
                  margin: 0,
                  fontSize: "14px",
                  lineHeight: 1.7,
                  color: "#56657f",
                }}
              >
                {meta.summary}
              </p>
            </div>

            <div style={{ display: "grid", gap: "12px" }}>
              <PhoneCard>
                <div
                  style={{ display: "flex", alignItems: "center", gap: "12px" }}
                >
                  <Chip brand={brand} tone={meta.tone} label={meta.label} />
                  <div style={{ fontSize: "13px", color: "#56657f" }}>
                    此狀態有獨立頁面，避免乘客被靜默導向其他流程。
                  </div>
                </div>
              </PhoneCard>

              <PhoneCard title="權限安全處理">
                {meta.bullets.map((bullet, index) => (
                  <div
                    key={bullet}
                    style={{
                      display: "flex",
                      gap: "12px",
                      padding: "10px 0",
                      borderBottom:
                        index < meta.bullets.length - 1
                          ? "1px dashed #f1f3f8"
                          : "1px solid transparent",
                    }}
                  >
                    <div
                      style={{
                        width: "8px",
                        height: "8px",
                        marginTop: "6px",
                        borderRadius: "999px",
                        background: brand.primary,
                        flexShrink: 0,
                      }}
                    />
                    <div
                      style={{
                        fontSize: "13px",
                        lineHeight: 1.65,
                        color: "#0e1424",
                      }}
                    >
                      {bullet}
                    </div>
                  </div>
                ))}
              </PhoneCard>

              <div
                style={{
                  display: "grid",
                  gap: "10px",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                }}
              >
                <a
                  href={`${basePath}${meta.primaryAction.href}`}
                  style={{ textDecoration: "none" }}
                >
                  <ActionButton
                    brand={brand}
                    label={meta.primaryAction.label}
                    primary
                  />
                </a>
                <a
                  href={`${basePath}${meta.secondaryAction.href}`}
                  style={{ textDecoration: "none" }}
                >
                  <ActionButton
                    brand={brand}
                    label={meta.secondaryAction.label}
                  />
                </a>
              </div>
            </div>
          </section>
        </div>

        <div style={{ position: "sticky", top: "16px" }}>
          <PartnerBookingPhoneScreen
            brand={brand}
            screen={state === "eligible" ? "eligibility" : "landing"}
          />
        </div>
      </section>
    </div>
  );
}
