import * as React from "react";

type PrimaryButtonProps = {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  fullWidth?: boolean;
};

export function PrimaryButton({ children, onClick, disabled, fullWidth = true }: PrimaryButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`
        py-3 px-4 font-medium text-sm text-white rounded-none shadow-md border-0
        ${disabled
          ? "bg-neutral-600 cursor-not-allowed"
          : "cursor-pointer bg-gradient-to-b from-neutral-900 to-neutral-800"}
        ${fullWidth ? "w-full" : ""}
      `}
    >
      {children}
    </button>
  );
}
