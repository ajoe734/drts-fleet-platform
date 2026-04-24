"use client";

import type { ButtonHTMLAttributes, MouseEvent } from "react";

type ConfirmSubmitButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  confirmMessage: string;
};

export function ConfirmSubmitButton({
  confirmMessage,
  onClick,
  ...props
}: ConfirmSubmitButtonProps) {
  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    onClick?.(event);
    if (event.defaultPrevented) {
      return;
    }

    if (!window.confirm(confirmMessage)) {
      event.preventDefault();
    }
  }

  return <button {...props} onClick={handleClick} />;
}
