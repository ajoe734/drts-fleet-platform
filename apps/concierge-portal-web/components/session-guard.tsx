"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useTranslation } from "@/lib/i18n";
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
  const { t } = useTranslation();

  if (!ready) {
    return (
      <section className="panel-card">
        <span className="section-kicker">{t("guard.loading.eyebrow")}</span>
        <h2>{t("guard.loading.title")}</h2>
        <p>{t("guard.loading.body")}</p>
      </section>
    );
  }

  if (!session) {
    return (
      <section className="panel-card tone-warning">
        <span className="section-kicker">{t("guard.signedOut.eyebrow")}</span>
        <h2>{t("guard.signedOut.title")}</h2>
        <p>{t("guard.signedOut.body")}</p>
        <div className="inline-actions">
          <Link className="primary-link" href="/login">
            {t("guard.signedOut.cta")}
          </Link>
        </div>
      </section>
    );
  }

  if (requireDesk && !desk) {
    return (
      <section className="panel-card tone-warning">
        <span className="section-kicker">{t("guard.noDesk.eyebrow")}</span>
        <h2>{t("guard.noDesk.title")}</h2>
        <p>{t("guard.noDesk.body")}</p>
        <div className="inline-actions">
          <Link className="primary-link" href="/start">
            {t("guard.noDesk.cta")}
          </Link>
        </div>
      </section>
    );
  }

  return <>{children}</>;
}
