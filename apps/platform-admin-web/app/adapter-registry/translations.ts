export const REGISTRY_NOTICE_COPY = {
  en: {
    title: (platformCode: string) => `${platformCode} requires attention`,
    body: (name: string, credential: string, health: string) =>
      `${name}: credential status ${credential}; health ${health}.`,
    unknownExpiry:
      "Credential expiry time is unknown; upcoming expiry cannot be determined.",
  },
  zh: {
    title: (platformCode: string) => `${platformCode} 需要檢查`,
    body: (name: string, credential: string, health: string) =>
      `${name}：憑證狀態為 ${credential}，健康狀態為 ${health}。`,
    unknownExpiry: "憑證到期時間未知，無法判斷是否即將到期。",
  },
};
