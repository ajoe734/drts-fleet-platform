"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useConciergePortal, useSelectedDesk } from "@/lib/portal-state";

export function SessionGuard({
  children,
  requireDesk = false,
}: {
  children: ReactNode;
  requireDesk?: boolean;
}) {
  const { ready, session } = useConciergePortal();
  const desk = useSelectedDesk();

  if (!ready) {
    return (
      <section className="panel-card">
        <span className="section-kicker">工作階段</span>
        <h2>正在載入本機客服代訂工作階段。</h2>
        <p>此頁需要先確認目前操作人員與櫃台狀態，請稍候。</p>
      </section>
    );
  }

  if (!session) {
    return (
      <section className="panel-card tone-warning">
        <span className="section-kicker">需要登入</span>
        <h2>尚未建立櫃台工作階段。</h2>
        <p>
          請先透過本機登入建立操作人員身分，再選擇固定站點，才能建立代訂、查詢訂單或處理回覆。
        </p>
        <div className="inline-actions">
          <Link className="primary-link" href="/login">
            開啟登入
          </Link>
        </div>
      </section>
    );
  }

  if (requireDesk && !desk) {
    return (
      <section className="panel-card tone-warning">
        <span className="section-kicker">需要選擇櫃台</span>
        <h2>請先選擇固定站點。</h2>
        <p>每個電話站點或客服櫃台都必須綁定固定站點後，才能開始代訂流程。</p>
        <div className="inline-actions">
          <Link className="primary-link" href="/start">
            選擇站點櫃台
          </Link>
        </div>
      </section>
    );
  }

  return <>{children}</>;
}
