import type { BookingRecord } from "@drts/contracts";

type SourceTone = "owned" | "external";
type SourceDomain = "owned" | "partner_external" | "forwarded_authority";

export type SourceVisibility = {
  domain: SourceDomain;
  tone: SourceTone;
  badge: string;
  summary: string;
  detail: string;
  statusBoundary: string;
  escalationHint: string;
  financeAuthority: string;
};

function isExternallyFulfilledBooking(
  booking: Pick<
    BookingRecord,
    "partnerEntrySlug" | "partnerId" | "issuerAuthorizationRef"
  >,
) {
  return Boolean(
    booking.partnerEntrySlug ||
    booking.partnerId ||
    booking.issuerAuthorizationRef,
  );
}

export function getBookingSourceVisibility(
  booking: Pick<
    BookingRecord,
    "partnerEntrySlug" | "partnerId" | "issuerAuthorizationRef"
  >,
): SourceVisibility {
  if (booking.issuerAuthorizationRef) {
    return {
      domain: "forwarded_authority",
      tone: "external",
      badge: "轉送授權",
      summary: "外部平台派遣權限",
      detail:
        "這筆訂單是由外部平台授權路徑鏡射而來。租戶仍可在此閱讀狀態，但不會暴露司機指派或介接層內部細節。",
      statusBoundary:
        "租戶頁面只會顯示標準訂單與叫車單紀錄。外部平台的接受、確認、競態失敗、平台取消與同步失敗等內部狀態，仍保留在營運與司機權限路徑。",
      escalationHint:
        "若執行狀態看起來過舊或互相矛盾，請改由營運控制台處理對帳、重新授權或平台側介入。",
      financeAuthority:
        "此處仍可能看得到報價，但結算、撥款與外部平台生命週期仍不屬於租戶權限範圍。",
    };
  }

  if (isExternallyFulfilledBooking(booking)) {
    return {
      domain: "partner_external",
      tone: "external",
      badge: "外部履約",
      summary: "夥伴或外部履約路徑",
      detail:
        "這筆訂單使用夥伴或外部履約路徑。租戶可在此查看狀態，但不會暴露介接層內部細節。",
      statusBoundary:
        "租戶頁面會保留標準訂單紀錄；夥伴側的路由、贊助與派遣協調則留在此畫面之外。",
      escalationHint:
        "若履約脈絡需要超出租戶安全指令的介入，請聯繫夥伴支援或升級至營運處理。",
      financeAuthority:
        "即使下游執行的一部分由夥伴履約或贊助承擔，租戶仍可能看得到相關計費資訊。",
    };
  }

  return {
    domain: "owned",
    tone: "owned",
    badge: "DRTS 自營",
    summary: "DRTS 派遣與履約",
    detail: "這筆訂單全程走 DRTS 自營的派遣路徑，涵蓋路由、執行與客戶更新。",
    statusBoundary:
      "租戶頁面與 DRTS 營運共用同一套自營訂單生命週期，因此在政策允許下，可直接透過租戶安全指令處理已發布的狀態變更。",
    escalationHint:
      "只有在自營派遣流程本身需要人工介入或政策覆寫時，才需要進一步升級處理。",
    financeAuthority:
      "除非後續財務憑證另有說明，否則 DRTS 仍是這筆訂單的定價、派遣與結算權責方。",
  };
}

export function getSourceToneClassName(tone: SourceTone) {
  return tone === "external"
    ? "source-pill source-pill-external"
    : "source-pill";
}
