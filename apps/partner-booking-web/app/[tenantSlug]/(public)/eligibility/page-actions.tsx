"use client";

import { useRouter } from "next/navigation";
import { CanvasBtn, type CanvasTheme } from "@drts/ui-web";

type EligibilityActionsProps = {
  theme: CanvasTheme;
  tenantSlug: string;
};

export function EligibilityActions({
  theme,
  tenantSlug,
}: EligibilityActionsProps) {
  const router = useRouter();

  return (
    <div
      style={{
        display: "grid",
        gap: 8,
      }}
    >
      <CanvasBtn
        theme={theme}
        variant="primary"
        size="md"
        onClick={() => router.push(`/${tenantSlug}/book`)}
        style={{ width: "100%", justifyContent: "center", height: 44 }}
      >
        確認連結並繼續
      </CanvasBtn>
      <CanvasBtn
        theme={theme}
        variant="ghost"
        size="md"
        onClick={() => router.push(`/${tenantSlug}`)}
        style={{ width: "100%", justifyContent: "center", height: 40 }}
      >
        稍後
      </CanvasBtn>
    </div>
  );
}
