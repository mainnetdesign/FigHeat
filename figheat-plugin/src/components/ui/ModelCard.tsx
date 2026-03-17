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
        border rounded-sm transition-colors
        ${selected
          ? "border-neutral-900 bg-white"
          : "border-neutral-200 bg-white hover:border-neutral-400"
        }
      `}
    >
      <div className="w-10 h-10 rounded-full overflow-hidden border border-neutral-200 bg-neutral-50 flex items-center justify-center flex-shrink-0 shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-neutral-900">{title}</div>
        <div className="text-xs text-neutral-500">{description}</div>
      </div>
      <div
        className={`
          w-3 h-3 rounded-full border-2 flex-shrink-0
          ${selected ? "border-neutral-900 bg-neutral-900" : "border-neutral-200"}
        `}
      />
    </button>
  );
}
