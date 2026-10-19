"use client";

import { useEffect, useRef, useState } from "react";
import { EBtnContent, entBtnStyle } from "../../components/ent-kit";
import {
  getEnterpriseDispatchTenantClient,
  type TenantBookingDriverContactOption,
} from "../../lib/api-client";
import { enterpriseTheme } from "../../lib/enterprise-theme";
import { t, type Locale, type TranslationKey } from "../../lib/translations";

export function DriverContactAction({
  bookingId,
  status,
  locale,
}: {
  bookingId: string;
  status: string;
  locale: Locale;
}) {
  const [loading, setLoading] = useState(false);
  const [option, setOption] = useState<TenantBookingDriverContactOption | null>(
    null,
  );
  const [message, setMessage] = useState<TranslationKey | null>(null);
  const version = useRef(0);
  const terminal = status === "completed" || status === "cancelled";
  useEffect(() => {
    const reset = () => {
      version.current++;
      setLoading(false);
      setOption(null);
      setMessage(null);
    };
    reset();
    window.addEventListener("focus", reset);
    document.addEventListener("visibilitychange", reset);
    return () => {
      version.current++;
      window.removeEventListener("focus", reset);
      document.removeEventListener("visibilitychange", reset);
    };
  }, [bookingId, status]);
  useEffect(() => {
    if (!option?.expiresAt) return;
    const expire = () => {
      setOption(null);
      setMessage("trip.contactExpired");
    };
    const remaining = Date.parse(option.expiresAt) - Date.now();
    if (!(remaining > 0)) {
      expire();
      return;
    }
    const timer = window.setTimeout(expire, Math.min(remaining, 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [option]);

  async function contact() {
    const request = ++version.current;
    setLoading(true);
    setOption(null);
    setMessage(null);
    try {
      // Browser carries only the signed-session cookie. The BFF verifies it;
      // no tenant selector, access token or driver profile enters this component.
      const current =
        await getEnterpriseDispatchTenantClient("").getDriverContact(bookingId);
      if (request !== version.current) return;
      if (current.bookingId !== bookingId) {
        setMessage("trip.contactError");
        return;
      }
      if (current.mode === "masked_call") {
        if (
          !current.contactUri ||
          !current.expiresAt ||
          !(Date.parse(current.expiresAt) > Date.now())
        ) {
          setMessage("trip.contactExpired");
          return;
        }
        setOption(current);
        setMessage("trip.contactReady");
        // The URI is not retained as an actionable stale anchor. Every contact
        // click obtains the current assignment again before dialing its proxy.
        const link = document.createElement("a");
        link.href = current.contactUri;
        link.click();
      } else {
        setOption(current);
        setMessage(
          current.unavailableReason === "masked_call_provider_error"
            ? "trip.contactProviderError"
            : "trip.contactProviderUnavailable",
        );
      }
    } catch (error) {
      if (request !== version.current) return;
      const code =
        error && typeof error === "object" && "statusCode" in error
          ? error.statusCode
          : null;
      setMessage(
        code === 401 || code === 403
          ? "trip.contactDenied"
          : code === 404
            ? "trip.contactMissing"
            : code === 409
              ? "trip.contactNoDriver"
              : "trip.contactError",
      );
    } finally {
      if (request === version.current) setLoading(false);
    }
  }
  return (
    <div style={{ flex: 1 }}>
      <button
        type="button"
        data-testid="enterprise-trip-contact-driver"
        disabled={loading || terminal}
        aria-disabled={loading || terminal}
        onClick={() => void contact()}
        style={entBtnStyle(enterpriseTheme, {
          variant: "default",
          block: true,
          disabled: loading || terminal,
        })}
      >
        <EBtnContent icon="phone">
          {t(
            loading ? "trip.contactLoading" : "trip.contactDriver",
            undefined,
            locale,
          )}
        </EBtnContent>
      </button>
      {(terminal || message) && (
        <p role="status" data-testid="enterprise-driver-contact-state">
          {t(terminal ? "trip.contactTerminal" : message!, undefined, locale)}
        </p>
      )}
      {option?.mode === "support_fallback" && option.contactUri && (
        <a
          data-testid="enterprise-driver-contact-support-fallback"
          href={option.contactUri}
        >
          {t("trip.contactSupport", undefined, locale)}
        </a>
      )}
    </div>
  );
}
