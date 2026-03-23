'use client';

import { UploadCloudIcon, Loader2Icon } from 'lucide-react';
import { useCallback, useState } from 'react';
import { cn } from '@/lib/utils';

interface ImageUploadProps {
    onImageSelect: (file: File) => void;
    isAnalyzing?: boolean;
}

export function ImageUpload({ onImageSelect, isAnalyzing }: ImageUploadProps) {
    const [isDragging, setIsDragging] = useState(false);

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
                'relative flex flex-col items-center justify-center w-full max-w-xl h-64 border-2 border-dashed rounded-xl transition-colors cursor-pointer',
                isDragging
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700',
                isAnalyzing && 'pointer-events-none opacity-50'
            )}
        >
            <input
                type="file"
                accept="image/*"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                onChange={handleChange}
                disabled={isAnalyzing}
            />

            {isAnalyzing ? (
                <div className="flex flex-col items-center gap-3 animate-pulse">
                    <Loader2Icon className="w-10 h-10 animate-spin text-blue-500" />
                    <p className="text-sm font-medium text-zinc-500">Analyzing image...</p>
                </div>
            ) : (
                <div className="flex flex-col items-center gap-2 text-center">
                    <div className="p-4 rounded-full bg-zinc-100 dark:bg-zinc-800">
                        <UploadCloudIcon className="w-8 h-8 text-zinc-500" />
                    </div>
                    <div className="space-y-1">
                        <p className="text-sm font-medium">Click or drag image to upload</p>
                        <p className="text-xs text-zinc-400">Supports JPG, PNG, WEBP</p>
                    </div>
                </div>
            )}
        </div>
    );
}
