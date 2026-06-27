"use client";

import { createContext, useContext, type ReactNode } from "react";
import {
  DEFAULT_PLATFORM_ADMIN_AUTHORITY,
  type PlatformAdminAuthority,
} from "./platform-admin-identity";

const PlatformAdminAuthorityContext = createContext<PlatformAdminAuthority>(
  DEFAULT_PLATFORM_ADMIN_AUTHORITY,
);

export function PlatformAdminAuthorityProvider({
  authority,
  children,
}: {
  authority: PlatformAdminAuthority;
  children: ReactNode;
}) {
  return (
    <PlatformAdminAuthorityContext.Provider value={authority}>
      {children}
    </PlatformAdminAuthorityContext.Provider>
  );
}

export function usePlatformAdminAuthority() {
  return useContext(PlatformAdminAuthorityContext);
}
