'use client';

import { UploadCloudIcon, Loader2Icon } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface FigHeatUploadProps {
    onImageSelect: (file: File) => void;
    isAnalyzing?: boolean;
}

export function FigHeatUpload({ onImageSelect, isAnalyzing }: FigHeatUploadProps) {
    const [isDragging, setIsDragging] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            setIsDragging(false);
            if (e.dataTransfer.files?.[0]) {
                const file = e.dataTransfer.files[0];
                if (file.type.startsWith('image/')) {
                    onImageSelect(file);
                }
            }
        },
        [onImageSelect]
    );

    const handleChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            if (e.target.files?.[0]) {
                onImageSelect(e.target.files[0]);
            }
        },
        [onImageSelect]
    );

    return (
        <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
                'relative flex flex-1 flex-col items-center justify-center gap-5 rounded-lg border border-dashed p-8 transition-colors',
                'bg-zinc-100 dark:bg-zinc-900/50',
                'border-zinc-200 dark:border-zinc-700',
                isDragging && 'border-primary/50 bg-primary/5',
                isAnalyzing && 'pointer-events-none opacity-50'
            )}
        >
            <input
                ref={inputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp"
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                onChange={handleChange}
                disabled={isAnalyzing}
            />

            {isAnalyzing ? (
                <div className="flex flex-col items-center gap-3">
                    <Loader2Icon className="size-6 animate-spin text-foreground" />
                    <p className="text-sm font-medium text-muted-foreground">Analyzing image...</p>
                </div>
            ) : (
                <>
                    <div className="flex size-6 items-center justify-center text-muted-foreground">
                        <UploadCloudIcon className="size-6" />
                    </div>
                    <div className="flex flex-col gap-1.5 text-center">
                        <p className="text-sm font-medium text-foreground">
                            Choose a file or drag & drop it here.
                        </p>
                        <p className="text-xs text-muted-foreground">
                            PNG, JPG, WEBP, up to 50 MB.
                        </p>
                    </div>
                    <button
                        type="button"
                        className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm font-medium text-muted-foreground shadow-sm transition-colors hover:bg-muted"
                        onClick={(e) => {
                            e.stopPropagation();
                            inputRef.current?.click();
                        }}
                    >
                        Browse File
                    </button>
                </>
            )}
        </div>
    );
}
