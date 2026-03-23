'use client';

import { cn } from '@/lib/utils';

interface BoundingBoxData {
    label: string;
    ymin: number;
    xmin: number;
    ymax: number;
    xmax: number;
    confidence: number;
}

interface BoundingBoxProps {
    box: BoundingBoxData;
    color?: string;
}

export function BoundingBox({ box, color = 'blue' }: BoundingBoxProps) {
    return (
        <div
            className={cn(
                "absolute border-2 transition-all duration-300 rounded",
                color === 'blue' ? 'border-blue-500/80' : 'border-red-500/80'
            )}
            style={{
                top: `${box.ymin}%`,
                left: `${box.xmin}%`,
                width: `${box.xmax - box.xmin}%`,
                height: `${box.ymax - box.ymin}%`,
            }}
        >
            <div
                className={cn(
                    "absolute -top-[20px] left-0 px-2 py-[2px] text-[10px] font-semibold text-white rounded shadow-md flex items-center gap-1 whitespace-nowrap",
                    color === 'blue' ? 'bg-blue-500/92' : 'bg-red-500/92'
                )}
                style={{
                    backdropFilter: 'blur(4px)'
                }}
            >
                <span className="tracking-tight">{box.label}</span>
                <span className="opacity-90 font-medium text-[9px]">
                    {Math.round(box.confidence * 100)}%
                </span>
            </div>
        </div>
    );
}
