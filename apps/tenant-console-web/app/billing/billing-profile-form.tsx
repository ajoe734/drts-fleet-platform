"use client";

import { useEffect, useRef, useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import type {
  ResourceActionDescriptor,
  TenantBillingProfile,
} from "@drts/contracts";
import { CanvasBtn, buildCanvasTheme } from "@drts/ui-web";
import { formatDateTime } from "../../lib/formatters";
import { t, type Locale } from "../../lib/translations";
import { saveBillingProfile, type BillingProfileResult } from "./actions";

const theme = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});
const fieldStyle: CSSProperties = {
  width: "100%",
  minHeight: 36,
  padding: "7px 10px",
  boxSizing: "border-box",
  borderRadius: 7,
  border: `1px solid ${theme.border}`,
  background: theme.bgRaised,
  color: theme.text,
  font: "inherit",
};
const fields = [
  ["invoiceTitle", "billing.profile.invoiceTitle", "text", true],
  ["taxId", "billing.profile.taxId", "text", false],
  ["contactName", "billing.profile.contact", "text", false],
  ["email", "billing.form.email", "email", true],
  ["address", "billing.profile.address", "text", false],
] as const;

function profileValues(profile: TenantBillingProfile | null) {
  return {
    invoiceTitle: profile?.invoiceTitle ?? "",
    taxId: profile?.taxId ?? "",
    contactName: profile?.contactName ?? "",
    email: profile?.email ?? "",
    address: profile?.address ?? "",
  };
}

type BillingProfileFormProps = {
  profile: TenantBillingProfile | null;
  descriptor: ResourceActionDescriptor | null;
  locale: Locale;
};

export function BillingProfileForm(props: BillingProfileFormProps) {
  const { profile, descriptor } = props;
  // RSC refresh serializes a new object even when the resource is unchanged.
  // Keep that editor mounted across locale-only refreshes; a real resource or
  // capability change creates a fresh editor, including its in-flight boundary.
  const resourceKey = JSON.stringify([
    profile?.tenantId,
    profile?.updatedAt,
    profile?.invoiceTitle,
    profile?.taxId,
    profile?.contactName,
    profile?.email,
    profile?.address,
    descriptor?.action,
    descriptor?.enabled,
    descriptor?.disabledReasonCode,
    descriptor?.requiresReason,
    descriptor?.riskLevel,
  ]);
  return <BillingProfileEditor key={resourceKey} {...props} />;
}

function BillingProfileEditor({ profile, descriptor, locale }: BillingProfileFormProps) {
  const router = useRouter();
  const [values, setValues] = useState(() => profileValues(profile));
  const [savedProfile, setSavedProfile] = useState(profile);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<BillingProfileResult | null>(null);
  const enabled = descriptor?.enabled !== false;
  const active = useRef(true);

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  return (
    <form
      id="billing-profile-editor"
      aria-label={t("billing.action.editProfile", locale)}
      onSubmit={(event) => {
        event.preventDefault();
        if (pending || !enabled) return;
        const formData = new FormData(event.currentTarget);
        setResult(null);
        startTransition(async () => {
          try {
            const saved = await saveBillingProfile(formData);
            if (!active.current) return;
            setResult(saved);
            if (saved.ok) {
              setSavedProfile(saved.profile);
              setValues(profileValues(saved.profile));
              router.refresh();
            }
          } catch {
            if (!active.current) return;
            setResult({ ok: false, message: t("billing.form.failed", locale) });
          }
        });
      }}
    >
      <fieldset
        disabled={pending || !enabled}
        style={{ margin: 0, padding: 0, border: 0, display: "grid", gap: 12 }}
      >
        {fields.map(([name, label, type, required]) => (
          <label
            key={name}
            style={{
              display: "grid",
              gap: 6,
              color: theme.textMuted,
              fontSize: 12.5,
            }}
          >
            {t(label, locale)}
            {required ? " *" : ""}
            <input
              name={name}
              type={type}
              required={required}
              value={values[name]}
              onChange={(event) => {
                setValues((current) => ({
                  ...current,
                  [name]: event.target.value,
                }));
                setResult(null);
              }}
              style={fieldStyle}
            />
          </label>
        ))}
      </fieldset>
      {!enabled ? (
        <p style={{ color: theme.textMuted, fontSize: 12 }}>
          {t("billing.form.unavailable", locale)}
          {descriptor?.disabledReasonCode
            ? ` (${descriptor.disabledReasonCode})`
            : ""}
        </p>
      ) : null}
      {result ? (
        <p role={result.ok ? "status" : "alert"}>{result.message}</p>
      ) : null}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
        <CanvasBtn
          theme={theme}
          type="submit"
          variant="primary"
          icon="check"
          disabled={pending || !enabled}
        >
          {t(pending ? "billing.form.saving" : "billing.form.save", locale)}
        </CanvasBtn>
        <CanvasBtn
          theme={theme}
          type="button"
          disabled={pending || !enabled}
          onClick={() => {
            setValues(profileValues(savedProfile));
            setResult(null);
          }}
        >
          {t("billing.form.reset", locale)}
        </CanvasBtn>
      </div>
      <dl
        style={{
          color: theme.textMuted,
          fontSize: 12,
          lineHeight: 1.6,
          marginBottom: 0,
        }}
      >
        <dt>{t("billing.profile.settlementMethod", locale)}</dt>
        <dd style={{ margin: "0 0 8px" }}>
          {t("billing.profile.settlementMethodValue", locale)}
        </dd>
        <dt>{t("billing.profile.updatedAt", locale)}</dt>
        <dd style={{ margin: 0 }}>
          {formatDateTime(savedProfile?.updatedAt, locale)}
        </dd>
      </dl>
    </form>
  );
}
