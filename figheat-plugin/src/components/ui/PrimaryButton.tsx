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
        py-3 px-4 font-medium text-sm text-white
        bg-gradient-to-b from-neutral-900 to-neutral-800
        rounded-lg shadow-md
        border-0
        cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed
        ${fullWidth ? "w-full" : ""}
      `}
    >
      {children}
    </button>
  );
}
