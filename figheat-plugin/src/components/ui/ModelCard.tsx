import * as React from "react";

type ModelCardProps = {
  icon: React.ReactNode;
  title: string;
  description: string;
  selected: boolean;
  onClick: () => void;
};

export function ModelCard({ icon, title, description, selected, onClick }: ModelCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        w-full flex items-center gap-3 px-4 py-3 text-left
        border border-[var(--stroke)] rounded-none transition-colors
        ${selected ? "bg-neutral-100" : "bg-white hover:bg-neutral-50"}
      `}
    >
      <div className="w-10 h-10 rounded-none overflow-hidden border border-[var(--stroke)] bg-neutral-50 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-neutral-900">{title}</div>
        <div className="text-xs text-neutral-500">{description}</div>
      </div>
      <div
        aria-hidden
        className={`
          h-4 w-4 shrink-0 rounded-full bg-white box-border
          ${selected ? "border-[3px] border-neutral-900" : "border border-[var(--stroke)]"}
        `}
      />
    </button>
  );
}
