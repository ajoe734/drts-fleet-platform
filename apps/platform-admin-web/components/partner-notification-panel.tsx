import React, { useState, useCallback, useEffect } from "react";
import { Banner, useTheme } from "@drts/ui-web";
import { usePlatformAdminClient } from "../lib/admin-client";
import { PartnerEntryNotificationBinding } from "@drts/contracts";

export function usePartnerNotificationData(entrySlug: string) {
  const client = usePlatformAdminClient();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ kind: "error" | "409" | "404" | "403"; message: string } | null>(null);
  const [binding, setBinding] = useState<PartnerEntryNotificationBinding | null>(null);

  const fetchState = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const b = await client.getPartnerEntryNotificationBinding(entrySlug);
      setBinding(b);
    } catch (e: any) {
      const statusCode = e.statusCode;
      if (statusCode === 404) {
        setBinding(null);
      } else if (statusCode === 403) {
        setError({ kind: "403", message: "Forbidden: You do not have access to this entry." });
      } else if (statusCode === 409) {
        setError({ kind: "409", message: "Version conflict or state conflict." });
      } else {
        setError({ kind: "error", message: e.message || "Unknown error fetching binding." });
      }
    } finally {
      setLoading(false);
    }
  }, [client, entrySlug]);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  return { loading, error, binding, fetchState };
}

export function PartnerNotificationPanel({ entrySlug }: { entrySlug: string }) {
  const theme = useTheme();
  const { error } = usePartnerNotificationData(entrySlug);

  return (
    <div data-testid="partner-notification-placeholder" style={{ padding: 16 }}>
      {error && (
        <div style={{ marginBottom: 16 }} data-testid={`error-banner-${error.kind}`}>
          <Banner
            theme={theme}
            tone="danger"
            title={`Error (${error.kind})`}
            body={error.message}
          />
        </div>
      )}
      <Banner 
        theme={theme} 
        tone="info" 
        title="Pending Design Handoff" 
        body={`The canonical notification canvas for partner ${entrySlug} is currently missing. Screen requirements have been documented.`} 
      />
    </div>
  );
}
