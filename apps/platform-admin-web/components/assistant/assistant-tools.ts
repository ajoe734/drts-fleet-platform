"use client";

import { useMemo } from "react";
export { createPlatformAdminAssistantTools } from "./assistant-tool-bridge";
import { createPlatformAdminAssistantTools } from "./assistant-tool-bridge";
import { usePlatformAdminAssistantRouteContext } from "./route-context";

export function usePlatformAdminAssistantTools() {
  const { pageBridge, navigateToHref, openCrossAppLink } =
    usePlatformAdminAssistantRouteContext();

  return useMemo(
    () =>
      createPlatformAdminAssistantTools({
        pageBridge,
        navigateToHref,
        openCrossAppLink,
      }),
    [navigateToHref, openCrossAppLink, pageBridge],
  );
}
