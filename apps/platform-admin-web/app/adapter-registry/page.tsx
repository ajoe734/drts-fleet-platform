"use client";

import React from "react";
import { AdapterList } from "./components/AdapterList";
import { useTranslation } from "@/lib/i18n";
import { CalloutBanner, PageHeader } from "@drts/ui-web";

export default function AdapterRegistryPage() {
  const { locale } = useTranslation();
  const copy =
    locale === "en"
      ? {
          title: "Adapter Registry",
          subtitle:
            "Review adapter readiness, ownership, and rollout posture across the platform.",
          guardrailTitle:
            "Registry edits stay scoped to one adapter at a time.",
          guardrailDescription:
            "Health, credential, webhook, and finance-authority context stay visible while the edit drawer only mutates supported config and policy fields.",
        }
      : {
          title: "Adapter Registry",
          subtitle: "檢視各 adapter 的 readiness、責任歸屬與 rollout 狀態。",
          guardrailTitle: "介接登錄的編輯一次只作用在單一 adapter。",
          guardrailDescription:
            "保留 health、credential、webhook 與 finance-authority 脈絡，同時把編輯範圍限制在目前支援的 config 與 policy 欄位。",
        };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <PageHeader title={copy.title} subtitle={copy.subtitle} />
      <CalloutBanner
        tone="warning"
        title={copy.guardrailTitle}
        description={copy.guardrailDescription}
      />
      <div className="p-4" style={{ paddingTop: 0 }}>
        <AdapterList />
      </div>
    </div>
  );
}
