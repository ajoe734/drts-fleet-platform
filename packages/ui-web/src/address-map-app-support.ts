import type {
  AddressMapPickerLabels,
  AddressPayload,
  ServiceAreaEvaluationResult,
} from "./address-map-picker-core";
import { createMockAddressProvider } from "./address-map-picker-core";

export type AddressPickerLocale = "en" | "zh";
export type AddressProviderMode = "healthy" | "degraded" | "unavailable";
export type AddressSubmitGateCode =
  | "ready"
  | "coordinates_required"
  | "dispatch_manual_review_required"
  | "outside_service_area";

export type AddressSubmitGateState = {
  blocking: boolean;
  code: AddressSubmitGateCode;
};

const zhLabels: AddressMapPickerLabels = {
  searchLabel: "搜尋地址",
  searchPlaceholder: "輸入街道、地標或場所名稱",
  searchButton: "搜尋",
  searching: "搜尋中…",
  candidatesTitle: "相符地址",
  noMatchTitle: "找不到相符地址",
  noMatchBody: "找不到這個地址。請調整關鍵字，或改用手動座標。",
  manualToggle: "手動輸入座標",
  manualTitle: "手動位置",
  manualLatLabel: "緯度",
  manualLngLabel: "經度",
  manualReasonLabel: "手動定位原因",
  manualReasonPlaceholder: "例如：新社區尚未收錄",
  manualApply: "使用此位置",
  manualInvalid: "請輸入有效的緯度（-90 到 90）與經度（-180 到 180）。",
  providerOutageTitle: "地址查詢暫時無法使用",
  providerOutageBody: "目前無法連線地址服務。請改用手動座標後再繼續。",
  degradedNote: "目前地址結果可能不完整。",
  confidenceLabel: "比對信心",
  provenanceLabel: "位置來源",
  coordinatesLabel: "座標",
  mapEmpty: "選擇地址或手動放置座標後，會在這裡預覽。",
  mapHint: "可拖曳圖釘，或用方向鍵微調位置。",
  pinAdjustHint: "已手動調整圖釘位置。",
  clearSelection: "清除",
  serviceableTitle: "位於服務範圍內",
  manualReviewTitle: "派遣前需人工確認",
  notServiceableTitle: "不在服務範圍內",
  serviceabilityPending: "檢查服務範圍中…",
};

export function buildAddressPickerLabels(
  locale: AddressPickerLocale,
): Partial<AddressMapPickerLabels> | undefined {
  return locale === "zh" ? zhLabels : undefined;
}

export function createConfiguredMockAddressProvider(
  mode: AddressProviderMode = "healthy",
) {
  return createMockAddressProvider({
    degraded: mode === "degraded",
    unavailable: mode === "unavailable",
  });
}

function isDispatchReadyAddress(address: AddressPayload | null | undefined) {
  return (
    Boolean(address) &&
    typeof address?.lat === "number" &&
    Number.isFinite(address.lat) &&
    typeof address?.lng === "number" &&
    Number.isFinite(address.lng)
  );
}

export function evaluateAddressSubmitGate(params: {
  pickup: AddressPayload | null;
  dropoff: AddressPayload | null;
  serviceability: ServiceAreaEvaluationResult | null;
}): AddressSubmitGateState {
  const { pickup, dropoff, serviceability } = params;

  if (!isDispatchReadyAddress(pickup) || !isDispatchReadyAddress(dropoff)) {
    return {
      blocking: true,
      code: "coordinates_required",
    };
  }

  if (serviceability?.decision === "not_serviceable") {
    return {
      blocking: true,
      code: "outside_service_area",
    };
  }

  if (serviceability?.decision === "manual_review") {
    return {
      blocking: false,
      code: "dispatch_manual_review_required",
    };
  }

  return {
    blocking: false,
    code: "ready",
  };
}
