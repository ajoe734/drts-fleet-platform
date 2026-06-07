"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { findPassengerNavItem, passengerNavItems } from "@/lib/navigation";

export function PassengerShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const activeItem = findPassengerNavItem(pathname);

  return (
    <div className="passenger-shell">
      <aside className="passenger-sidebar">
        <div className="passenger-brand">
          <span className="passenger-badge">乘客服務入口</span>
          <h1>乘客入口</h1>
          <p>
            提供乘客查詢行程狀態、行程紀錄與收據後續處理，並與租戶及營運後台權限分離。
          </p>
        </div>

        <nav className="passenger-nav" aria-label="乘客服務導覽">
          {passengerNavItems.map((item) => {
            const isActive = activeItem?.href === item.href;

            return (
              <Link
                className={`passenger-nav-link${isActive ? " is-active" : ""}`}
                href={item.href}
                key={item.href}
              >
                <strong>{item.label}</strong>
                <span>{item.note}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-callout">
          <strong>收據歸屬依來源渠道為準</strong>
          <p>
            此入口可顯示平台收據、外部收據參考或明確的不支援狀態，但不會自行宣稱新的電子郵件或簡訊寄送渠道。
          </p>
        </div>

        <p className="sidebar-footnote">
          預約、進行中行程、取消、完成與例外情境都以獨立頁面呈現，避免乘客只看到空白狀態或含糊提示。
        </p>
      </aside>

      <main className="passenger-main">
        <div className="passenger-frame">
          <header className="passenger-topbar">
            <div className="topbar-copy">
              <span className="eyebrow">乘客服務</span>
              <h2>{activeItem?.label ?? "乘客入口"}</h2>
              <p>
                {activeItem?.note ?? "乘客查看行程狀態與收據資訊的專用入口。"}
              </p>
            </div>
            <div className="topbar-meta">
              <span className="meta-pill">入口：乘客網站</span>
              <span className="meta-pill">範圍：預約、行程與例外情境</span>
            </div>
          </header>
          {children}
        </div>
      </main>
    </div>
  );
}
