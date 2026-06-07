"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { conciergeNavItems, findConciergeNavItem } from "@/lib/navigation";
import { formatScopeSummary } from "@/lib/api-client";
import { formatDeskMode } from "@/lib/desk-catalog";
import { useConciergePortal, useSelectedDesk } from "@/lib/portal-state";

export function ConciergeShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const activeItem = findConciergeNavItem(pathname);
  const { ready, session, signOut } = useConciergePortal();
  const desk = useSelectedDesk();

  return (
    <div className="portal-shell">
      <aside className="portal-sidebar">
        <div className="brand-stack">
          <span className="brand-badge">客服代訂入口</span>
          <h1>客服代訂</h1>
          <p>
            提供固定站點的客服櫃台與電話站點人員使用，與完整營運後台權限分離。
          </p>
        </div>

        <nav className="sidebar-nav" aria-label="客服代訂導覽">
          {conciergeNavItems.map((item) => {
            const isActive = item.href === pathname;

            return (
              <Link
                className={`sidebar-link${isActive ? " is-active" : ""}`}
                href={item.href}
                key={item.href}
              >
                <strong>{item.label}</strong>
                <span>{item.note}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-card">
          <strong>受限操作範圍</strong>
          <p>目前此入口只允許必要的客服代訂能力：{formatScopeSummary()}。</p>
        </div>

        <p className="sidebar-footnote">
          此入口只處理櫃台代訂、查詢與回覆，不會開放完整營運後台的派遣與申訴管理功能。
        </p>
      </aside>

      <main className="portal-main">
        <div className="portal-frame">
          <header className="portal-topbar">
            <div className="topbar-copy">
              <span className="topbar-eyebrow">客服代訂</span>
              <h2>{activeItem?.label ?? "客服代訂入口"}</h2>
              <p>
                {activeItem?.note ??
                  "固定站點櫃台可在此建立代訂、查詢訂單與追蹤回覆。"}
              </p>
            </div>

            <div className="topbar-stack">
              <div className="badge-row">
                <span className="meta-pill">
                  {session
                    ? `${formatDeskMode(session.mode)} · ${session.operatorName}`
                    : "需要登入"}
                </span>
                <span className="meta-pill">
                  {desk
                    ? `${desk.siteName} · ${desk.deskName}`
                    : "尚未選擇櫃台"}
                </span>
                <span className="meta-pill">
                  {ready ? "本機工作階段" : "載入工作階段"}
                </span>
              </div>

              {session ? (
                <button
                  className="secondary-button"
                  onClick={() => {
                    signOut();
                    router.push("/login");
                  }}
                  type="button"
                >
                  清除本機工作階段
                </button>
              ) : null}
            </div>
          </header>

          {children}
        </div>
      </main>
    </div>
  );
}
