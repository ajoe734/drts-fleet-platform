"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { EnterpriseShell } from "@/components/enterprise-shell";

export interface RootShellProps {
  children: ReactNode;
}

export function RootShell({ children }: RootShellProps) {
  const pathname = usePathname();
  const isEmbeddedPreview = pathname === "/embedded-preview";

  if (isEmbeddedPreview) {
    return <>{children}</>;
  }

  return <EnterpriseShell>{children}</EnterpriseShell>;
}
