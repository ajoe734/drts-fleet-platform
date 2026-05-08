"use client";

import React from "react";
import { AdapterList } from "./components/AdapterList";
import { useTranslation } from "@/lib/i18n";
import { PageHeader } from "@drts/ui-web";

export default function AdapterRegistryPage() {
  const { locale } = useTranslation();
  const copy =
    locale === "en"
      ? {
          title: "Adapter Registry",
          subtitle:
            "Review adapter readiness, ownership, and rollout posture across the platform.",
        }
      : {
          title: "Adapter Registry",
          subtitle: "檢視各 adapter 的 readiness、責任歸屬與 rollout 狀態。",
        };

  return (
    <div>
      <PageHeader title={copy.title} subtitle={copy.subtitle} />
      <div className="p-4">
        <AdapterList />
      </div>
    </div>
  );
}
