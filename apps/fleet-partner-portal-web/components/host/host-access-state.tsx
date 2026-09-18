// Shared read/access-state rendering for the Host restricted surface.
// Mirrors docs/05-ui/drts-design-canvas/fleet-host.jsx's
// FLP_HostAccessStates §7 error-code coverage, rendered contextually inline
// (not as a separate static gallery route) wherever a real loader in
// app/host/lib/host-data.server.ts classifies a failure.
//
// Family 3 error codes (SYSTEM_REMEDIATION_ERROR_CODES):
// HOST_UNAUTHORIZED (401), HOST_FORBIDDEN (403), HOST_VEHICLE_NOT_FOUND (404,
// anti-enumeration — never HOST_FORBIDDEN for another owner's vehicle id).
// HOST_MUTATION_NOT_SUPPORTED (405) is not reachable here: this UI has no
// mutation affordance anywhere, so it can never trigger a POST/PUT/DELETE.

import { CanvasCard, CanvasEmptyState, type CanvasTheme } from "@drts/ui-web";
import type { HostAccessState } from "@/app/host/lib/host-format";

const COPY: Record<
  HostAccessState,
  { cardTitle: string; title: string; body: string }
> = {
  unauthorized: {
    cardTitle: "未登入 · HOST_UNAUTHORIZED (401)",
    title: "登入已失效",
    body: "登入憑證失效或未帶有效 Token，請重新登入車主入口。",
  },
  forbidden: {
    cardTitle: "無車主授權 · HOST_FORBIDDEN (403)",
    title: "無車主授權",
    body: "您目前的帳號無有效車主（individual_owner）授權，請聯繫平台確認合作狀態。",
  },
  vehicle_not_found: {
    cardTitle: "車輛不存在 · HOST_VEHICLE_NOT_FOUND (404)",
    title: "找不到此車輛",
    body: "找不到此車輛，或該車輛不屬於您名下。為防止車輛 ID 探測，非本人車輛一律回傳 404，絕不回傳 403。",
  },
  fetch_failed: {
    cardTitle: "讀取失敗",
    title: "暫時無法讀取",
    body: "目前無法連線至車主資料服務，請稍後重試。若持續發生，請聯繫平台支援。",
  },
};

export function HostAccessStateCard({
  theme,
  state,
  detail,
}: {
  theme: CanvasTheme;
  state: HostAccessState;
  detail?: string;
}) {
  const copy = COPY[state];
  return (
    <CanvasCard theme={theme} title={copy.cardTitle}>
      <CanvasEmptyState
        theme={theme}
        tone={state === "fetch_failed" ? "warn" : "neutral"}
        title={copy.title}
        body={
          detail ? (
            <>
              {copy.body}
              <div
                style={{ marginTop: 6, color: theme.textDim, fontSize: 11 }}
              >
                {detail}
              </div>
            </>
          ) : (
            copy.body
          )
        }
      />
    </CanvasCard>
  );
}
