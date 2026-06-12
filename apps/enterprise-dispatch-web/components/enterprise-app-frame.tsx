"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { EnterpriseShell } from "@/components/enterprise-shell";

export function EnterpriseAppFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";

  if (pathname.startsWith("/embed")) {
    return children;
  }

  return <EnterpriseShell>{children}</EnterpriseShell>;
}
