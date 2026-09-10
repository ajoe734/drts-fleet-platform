"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { EnterpriseShell } from "@/components/enterprise-shell";

export function EnterpriseAppFrame({
  children,
  env,
}: {
  children: ReactNode;
  env?: string | undefined;
}) {
  const pathname = usePathname() ?? "";

  if (pathname.startsWith("/embed")) {
    return children;
  }

  return <EnterpriseShell env={env}>{children}</EnterpriseShell>;
}
