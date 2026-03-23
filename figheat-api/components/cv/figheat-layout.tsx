'use client';

import { useState, useEffect, useRef } from 'react';
import {
    Flame,
    Zap,
    Brain,
    Instagram,
    Linkedin,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { FigHeatUpload } from './figheat-upload';
import { Heatmap } from './overlays/heatmap';
import { BoundingBox } from './overlays/bounding-box';

type AIModel = 'flash' | 'pro';

interface AnalysisData {
    boundingBoxes: Array<{
        label: string;
        ymin: number;
        xmin: number;
        ymax: number;
        xmax: number;
        confidence: number;
    }>;
    heatmapPoints: Array<{
        x: number;
        y: number;
        intensity: number;
    }>;
}

export function FigHeatLayout() {
    const [file, setFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [data, setData] = useState<AnalysisData | null>(null);
    const [pageType, setPageType] = useState('landing');
    const [aiModel, setAIModel] = useState<AIModel>('flash');
    const [showHeatmap, setShowHeatmap] = useState(true);
    const [showBoxes, setShowBoxes] = useState(true);
    const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
    const imageRef = useRef<HTMLImageElement>(null);

    useEffect(() => {
        if (!imageRef.current) return;
        const updateSize = () => {
            if (imageRef.current) {
                setImageSize({
                    width: imageRef.current.offsetWidth,
                    height: imageRef.current.offsetHeight,
                });
            }
        };
        window.addEventListener('resize', updateSize);
        const img = imageRef.current;
        if (img.complete) updateSize();
        else img.onload = updateSize;
        return () => window.removeEventListener('resize', updateSize);
    }, [previewUrl]);

    const handleImageSelect = (selectedFile: File) => {
        setFile(selectedFile);
        setPreviewUrl(URL.createObjectURL(selectedFile));
        setData(null);
    };

    const handleAnalyze = async () => {
        if (!file) return;
        setIsAnalyzing(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            const res = await fetch('/api/cv/analyze', { method: 'POST', body: formData });
            if (!res.ok) throw new Error('Analysis failed');
            setData(await res.json());
        } catch (err) {
            console.error(err);
            alert('Failed to analyze image');
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleReset = () => {
        setFile(null);
        setPreviewUrl(null);
        setData(null);
    };

    return (
        <div className="flex min-h-screen flex-col bg-background">
            <div className="flex flex-1 flex-col lg:flex-row">
                {/* Left Panel - Controls */}
                <div className="flex w-full flex-col border-b border-border lg:w-[373px] lg:border-b-0 lg:border-r">
                    {/* Header */}
                    <div className="flex items-center gap-2.5 border-b border-border px-4 py-8">
                        <div className="flex size-10 items-center justify-center">
                            <Flame className="size-10 text-primary" />
                        </div>
                        <span className="text-3xl font-normal tracking-tight text-foreground">
                            FigHeat
                        </span>
                    </div>

                    {/* Controls */}
                    <div className="flex flex-1 flex-col gap-4 px-4 py-8">
                        <div className="space-y-1">
                            <label className="text-sm font-medium text-foreground">
                                Page type
                            </label>
                            <Select value={pageType} onValueChange={setPageType}>
                                <SelectTrigger className="h-11 w-full rounded-lg border border-border bg-background pl-3 pr-2.5">
                                    <SelectValue placeholder="Landing Page" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="landing">Landing Page</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <label className="text-sm font-medium text-foreground">
                            AI Model
                        </label>

                        <div className="flex flex-col gap-3">
                            <RadioCard
                                icon={<Zap className="size-5" />}
                                title="Flash"
                                time="~15-60s"
                                selected={aiModel === 'flash'}
                                onSelect={() => setAIModel('flash')}
                            />
                            <RadioCard
                                icon={<Brain className="size-5" />}
                                title="Pro"
                                time="~60-120s"
                                selected={aiModel === 'pro'}
                                onSelect={() => setAIModel('pro')}
                            />
                        </div>

                        <div className="mt-auto pt-6">
                            <button
                                type="button"
                                disabled={!file || isAnalyzing}
                                onClick={handleAnalyze}
                                className="flex w-full items-center justify-center rounded-[10px] border border-white/10 bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white shadow-[0px_1px_2px_0px_rgba(27,28,29,0.48),0px_0px_0px_1px_#242628] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
                            >
                                Analyze
                            </button>
                        </div>
                    </div>
                </div>

                {/* Right Panel - Upload / Results */}
                <div className="flex flex-1 flex-col">
                    <div className="flex flex-1 flex-col">
                        <div className="flex flex-col items-center justify-center border-b border-border px-4 py-8">
                            <p className="text-center text-base font-medium tracking-tight text-foreground">
                                Select an image on canva or upload
                            </p>
                        </div>

                        <div className="flex flex-1 flex-col p-4">
                            {!file || !previewUrl ? (
                                <FigHeatUpload
                                    onImageSelect={handleImageSelect}
                                    isAnalyzing={isAnalyzing}
                                />
                            ) : (
                                <div className="flex flex-col gap-6">
                                    <div className="flex items-center justify-between">
                                        <h2 className="text-lg font-semibold">Analysis Results</h2>
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setShowBoxes(!showBoxes)}
                                                className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
                                            >
                                                {showBoxes ? 'Hide' : 'Show'} Boxes
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setShowHeatmap(!showHeatmap)}
                                                className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
                                            >
                                                {showHeatmap ? 'Hide' : 'Show'} Heatmap
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleReset}
                                                className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
                                            >
                                                New Image
                                            </button>
                                        </div>
                                    </div>

                                    <div className="relative overflow-hidden rounded-xl border border-border bg-zinc-950">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            ref={imageRef}
                                            src={previewUrl}
                                            alt="Analysis"
                                            className="relative z-0 mx-auto block max-h-[70vh] w-full object-contain"
                                        />
                                        {data && (
                                            <div className="pointer-events-none absolute inset-0 z-20">
                                                {showHeatmap && (
                                                    <Heatmap
                                                        points={data.heatmapPoints}
                                                        width={imageSize.width}
                                                        height={imageSize.height}
                                                    />
                                                )}
                                                {showBoxes &&
                                                    data.boundingBoxes.map((box, i) => (
                                                        <BoundingBox key={i} box={box} />
                                                    ))}
                                            </div>
                                        )}
                                        {isAnalyzing && (
                                            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm">
                                                <div className="mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-white" />
                                                <p className="font-medium text-white">
                                                    Analyzing visual features...
                                                </p>
                                            </div>
                                        )}
                                    </div>

                                    {data && (
                                        <div className="grid gap-4 text-sm text-muted-foreground md:grid-cols-2">
                                            <div className="rounded-lg border border-border bg-muted/30 p-4">
                                                <h4 className="mb-2 font-medium text-foreground">
                                                    Detected Objects
                                                </h4>
                                                <ul className="list-inside list-disc space-y-1">
                                                    {data.boundingBoxes.map((box, i) => (
                                                        <li key={i}>
                                                            {box.label} (
                                                            {Math.round(box.confidence * 100)}%)
                                                        </li>
                                                    ))}
                                                    {data.boundingBoxes.length === 0 && (
                                                        <li>No objects detected</li>
                                                    )}
                                                </ul>
                                            </div>
                                            <div className="rounded-lg border border-border bg-muted/30 p-4">
                                                <h4 className="mb-2 font-medium text-foreground">
                                                    Analysis Stats
                                                </h4>
                                                <p>Heatmap Regions: {data.heatmapPoints.length}</p>
                                                <p>Processing time: instant</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <footer className="flex items-center justify-between border-t border-border px-4 py-8">
                <div className="flex items-center gap-2.5">
                    <span className="text-xs text-foreground">Follow us on</span>
                    <div className="flex items-center gap-2">
                        <a
                            href="https://instagram.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground transition-colors hover:text-foreground"
                            aria-label="Instagram"
                        >
                            <Instagram className="size-5" />
                        </a>
                        <a
                            href="https://linkedin.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground transition-colors hover:text-foreground"
                            aria-label="LinkedIn"
                        >
                            <Linkedin className="size-5" />
                        </a>
                        <a
                            href="https://x.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground transition-colors hover:text-foreground"
                            aria-label="X"
                        >
                            <svg
                                className="size-5"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                            >
                                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                            </svg>
                        </a>
                    </div>
                </div>
                <div className="flex items-center gap-2.5">
                    <span className="text-xs text-foreground">Powered by</span>
                    <span className="text-sm font-medium tracking-tight text-foreground">
                        Mainnet
                    </span>
                </div>
            </footer>
        </div>
    );
}

function RadioCard({
    icon,
    title,
    time,
    selected,
    onSelect,
}: {
    icon: React.ReactNode;
    title: string;
    time: string;
    selected: boolean;
    onSelect: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onSelect}
            className={cn(
                'flex items-start gap-3.5 rounded-lg border p-4 text-left transition-colors',
                'border-border bg-background shadow-sm',
                selected && 'ring-2 ring-primary ring-offset-2'
            )}
        >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
                {icon}
            </div>
            <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{title}</p>
                <p className="text-xs text-muted-foreground">{time}</p>
            </div>
            <div
                className={cn(
                    'size-5 shrink-0 rounded-full border-2',
                    selected ? 'border-primary bg-primary' : 'border-muted-foreground/30'
                )}
            />
        </button>
    );
}
