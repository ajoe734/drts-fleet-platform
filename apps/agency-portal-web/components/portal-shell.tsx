import type { ReactNode } from "react";
import { Badge } from "@drts/ui-web";

import { AGENCY_NAV } from "@/lib/navigation";
import { LogoutButton } from "./logout-button";
import { PrgMask } from "./prg-mask";

/** Every page states 唯讀, 個資已遮罩 and that the query is access-logged. */
export function PortalShell({
  children,
  agencyName,
}: {
  children: ReactNode;
  agencyName?: string | null;
}) {
  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          padding: "12px 24px",
          background: "#ffffff",
          borderBottom: "1px solid #e2e8f0",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <strong>DRTS 主管機關唯讀查詢</strong>
          {agencyName ? <span>· {agencyName}</span> : null}
          <Badge variant="blue">唯讀</Badge>
          <PrgMask label="個資已遮罩" />
        </div>
        <LogoutButton />
      </header>
      <nav
        aria-label="主要導覽"
        style={{
          display: "flex",
          gap: 12,
          padding: "8px 24px",
          background: "#ffffff",
          borderBottom: "1px solid #e2e8f0",
          flexWrap: "wrap",
          fontSize: 14,
        }}
      >
        {AGENCY_NAV.map((item) => (
          <a key={item.href} href={item.href}>
            {item.label}
          </a>
        ))}
      </nav>
      <p
        role="note"
        style={{
          margin: 0,
          padding: "8px 24px",
          fontSize: 12.5,
          color: "#92400e",
          background: "#fffbeb",
          borderBottom: "1px solid #fde68a",
        }}
      >
        本系統僅供唯讀查詢；每一次查詢與匯出皆留存不可竄改的存取紀錄（查詢條件、筆數、時間、帳號），由平台管理者檢閱。
      </p>
      <main style={{ padding: 24, maxWidth: 1280, margin: "0 auto" }}>
        {children}
      </main>
    </div>
  );
}
