import * as React from "react";

type UploadAreaProps = {
  onFileSelect: (file: File | null) => void;
  accept?: string;
  disabled?: boolean;
};

const CloudUploadIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="32"
    height="32"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="text-neutral-400"
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

export function UploadArea({ onFileSelect, accept = "image/png,image/jpeg,image/webp", disabled }: UploadAreaProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFileSelect(e.target.files?.[0] ?? null);
  };

  const handleClick = () => {
    if (!disabled) inputRef.current?.click();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) onFileSelect(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (disabled) return;
  };

  return (
    <div
      className="
        relative flex-1 min-h-[160px] flex flex-col items-center justify-center gap-4
        p-6 border border-dashed border-neutral-200 rounded-sm bg-neutral-50
      "
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleChange}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed z-10"
      />
      <CloudUploadIcon />
      <div className="text-sm font-medium text-neutral-900 text-center">
        Choose a file or drag & drop it here.
      </div>
      <div className="text-xs text-neutral-500 text-center">
        PNG, JPG, WEBP, up to 50 MB.
      </div>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        className="px-6 py-2.5 text-base font-medium text-neutral-600 bg-white border border-neutral-200 rounded-2xl hover:bg-neutral-100 hover:border-neutral-300 disabled:opacity-50"
      >
        Browse File
      </button>
    </div>
  );
}
