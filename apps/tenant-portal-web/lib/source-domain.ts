import type {
  BookingRecord,
  InvoiceLineRecord,
  ReportJobRecord,
  TenantInvoiceRecord,
} from "@drts/contracts";

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

export function getInvoiceLineSourceVisibility(
  line: Pick<
    InvoiceLineRecord,
    "channelKey" | "partnerEntrySlug" | "partnerId" | "issuerAuthorizationRef"
  >,
): SourceVisibility {
  if (line.channelKey === "forwarded_shadow") {
    return {
      domain: "forwarded_authority",
      tone: "external",
      badge: "外部財務權限",
      summary: "外部平台結算權責",
      detail:
        "結算、收據歸屬與司機撥款仍由外部平台負責。DRTS 只會在本地鏡射可供稽核的財務脈絡。",
      statusBoundary:
        "發票仍可在租戶端安全顯示，但外部平台的對帳狀態會保留在營運與財務作業畫面。",
      escalationHint:
        "若鏡射進來的結算資料看起來過舊、缺漏或有爭議，請改走營運或財務對帳流程。",
      financeAuthority: "這筆明細的結算、撥款與收據開立仍以外部平台為準。",
    };
  }

  if (line.partnerEntrySlug || line.partnerId || line.issuerAuthorizationRef) {
    return {
      domain: "partner_external",
      tone: "external",
      badge: "外部履約",
      summary: "夥伴贊助履約路徑",
      detail:
        "這筆明細帶有夥伴方案來源。租戶仍可在此查看計費，但夥伴側的贊助與履約脈絡會與 DRTS 自營行程分開呈現。",
      statusBoundary:
        "租戶計費會保留這筆業務憑證，但夥伴端的履約與贊助狀態不會直接出現在這個路由。",
      escalationHint: "若贊助或履約側需要介入，請改由夥伴支援或營運升級處理。",
      financeAuthority:
        "租戶仍可閱讀這筆計費，但下游的贊助或夥伴責任仍可能落在 DRTS 自營流程之外。",
    };
  }

  return {
    domain: "owned",
    tone: "owned",
    badge: "DRTS 財務權限",
    summary: "平台自營計費",
    detail: "DRTS 仍是這筆明細的本地計費與結算權責方。",
    statusBoundary:
      "自營計費憑證會保留在同一套租戶可見生命週期內，不依賴外部平台對帳。",
    escalationHint:
      "只有在 DRTS 自營的計費或結算流程本身需要人工介入時，才需要進一步升級處理。",
    financeAuthority: "DRTS 仍是這筆明細的計費、結算與撥款權責方。",
  };
}

export function summarizeInvoiceSourceDomains(
  invoice: Pick<TenantInvoiceRecord, "lines">,
) {
  const counts = invoice.lines.reduce(
    (summary, line) => {
      const visibility = getInvoiceLineSourceVisibility(line);
      if (visibility.tone === "external") {
        summary.external += 1;
      } else {
        summary.owned += 1;
      }
      if (line.channelKey === "forwarded_shadow") {
        summary.externalFinanceAuthority += 1;
      }
      return summary;
    },
    { owned: 0, external: 0, externalFinanceAuthority: 0 },
  );

  if (counts.externalFinanceAuthority > 0) {
    return {
      badge: "存在外部財務權限",
      detail: `${counts.externalFinanceAuthority} 筆明細仍由外部平台負責結算。`,
    };
  }

  if (counts.external > 0) {
    return {
      badge: "混合來源領域",
      detail: `${counts.owned} 筆 DRTS 自營明細，${counts.external} 筆外部履約明細。`,
    };
  }

  return {
    badge: "僅 DRTS 自營",
    detail: `${counts.owned} 筆 DRTS 自營明細。`,
  };
}

export function getReportJobSourceSummary(
  job: Pick<ReportJobRecord, "jobType">,
): SourceVisibility {
  if (job.jobType === "revenue_summary") {
    return {
      domain: "forwarded_authority",
      tone: "external",
      badge: "自營 + 外部財務",
      summary: "跨領域營收報表",
      detail:
        "營收摘要報表會在租戶可見的財務脈絡內，同時彙整 DRTS 自營與外部履約／外部結算的資料列。",
      statusBoundary:
        "報表可以呈現跨領域合計，但不會把平台原生的對帳狀態直接暴露給租戶使用者。",
      escalationHint:
        "若外部財務資料列有爭議，仍需在報表路由之外改走營運或財務對帳流程。",
      financeAuthority:
        "營收報表可以納入外部財務脈絡，但對於轉送資料列，真正的結算權責仍在外部。",
    };
  }

  return {
    domain: "owned",
    tone: "owned",
    badge: "DRTS 自營",
    summary: "自營派遣報表",
    detail:
      "這份報表追蹤的是 DRTS 自營的派遣與服務紀錄，而不是低階外部介接行為。",
    statusBoundary:
      "自營派遣報表會維持在租戶可讀的 DRTS 業務報表範圍內，不需要外部平台生命週期投影。",
    escalationHint:
      "只有在自營報表管線本身看起來過舊或不完整時，才需要進一步升級處理。",
    financeAuthority: "DRTS 仍是自營報表資料列的報表與結算權責方。",
  };
}

export function getSourceToneClassName(tone: SourceTone) {
  return tone === "external"
    ? "source-pill source-pill-external"
    : "source-pill";
}
