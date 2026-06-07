"use client";

import type { CSSProperties } from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";

type SettingsRefreshButtonProps = {
  label: string;
  surfaceLabel?: string | undefined;
  title?: string | undefined;
  disabled?: boolean | undefined;
  style?: CSSProperties | undefined;
};

export function SettingsRefreshButton({
  label,
  surfaceLabel,
  title,
  disabled = false,
  style,
}: SettingsRefreshButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      title={title}
      disabled={disabled || isPending}
      onClick={() => {
        startTransition(() => {
          router.refresh();
        });
      }}
      style={style}
    >
      <span>{isPending ? "重新整理中..." : label}</span>
      {surfaceLabel ? (
        <span style={{ fontSize: 10, opacity: 0.8 }}>{surfaceLabel}</span>
      ) : null}
    </button>
  );
}
