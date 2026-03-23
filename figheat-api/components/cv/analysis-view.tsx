'use client';

import { useState, useRef, useEffect } from 'react';
import { ImageUpload } from './image-upload';
import { Heatmap } from './overlays/heatmap';
import { BoundingBox } from './overlays/bounding-box';
import { Button } from '@/components/ui/button';
import { RefreshCcw, Eye, EyeOff, Layers } from 'lucide-react';

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

export function AnalysisView() {
    const [file, setFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [data, setData] = useState<AnalysisData | null>(null);

    const [showHeatmap, setShowHeatmap] = useState(true);
    const [showBoxes, setShowBoxes] = useState(true);

    const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
    const imageRef = useRef<HTMLImageElement>(null);

    // Resize observer to keep heatmap responsive
    useEffect(() => {
        if (!imageRef.current) return;

        const updateSize = () => {
            if (imageRef.current) {
                setImageSize({
                    width: imageRef.current.offsetWidth,
                    height: imageRef.current.offsetHeight
                });
            }
        };

        window.addEventListener('resize', updateSize);
        // Initial size
        const img = imageRef.current;
        if (img.complete) {
            updateSize();
        } else {
            img.onload = updateSize;
        }

        return () => window.removeEventListener('resize', updateSize);
    }, [previewUrl]);


    const handleImageSelect = async (selectedFile: File) => {
        setFile(selectedFile);
        const url = URL.createObjectURL(selectedFile);
        setPreviewUrl(url);
        setData(null);
        setIsAnalyzing(true);

        try {
            const formData = new FormData();
            formData.append('file', selectedFile);

            const response = await fetch('/api/cv/analyze', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) throw new Error('Analysis failed');

            const result = await response.json();
            setData(result);
        } catch (error) {
            console.error(error);
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

    if (!file || !previewUrl) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] p-8">
                <h2 className="text-2xl font-bold mb-8 text-center bg-clip-text text-transparent bg-linear-to-r from-blue-500 to-teal-400">
                    Computer Vision Analysis
                </h2>
                <ImageUpload onImageSelect={handleImageSelect} isAnalyzing={isAnalyzing} />
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto p-6 space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Analysis Results</h2>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setShowBoxes(!showBoxes)}>
                        {showBoxes ? <Eye className="mr-2 h-4 w-4" /> : <EyeOff className="mr-2 h-4 w-4" />}
                        Boxes
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setShowHeatmap(!showHeatmap)}>
                        {showHeatmap ? <Layers className="mr-2 h-4 w-4 text-blue-500" /> : <Layers className="mr-2 h-4 w-4 text-zinc-400" />}
                        Heatmap
                    </Button>
                    <Button variant="ghost" size="sm" onClick={handleReset}>
                        <RefreshCcw className="mr-2 h-4 w-4" />
                        New Image
                    </Button>
                </div>
            </div>

            <div className="relative rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-linear-to-br from-zinc-950 via-zinc-900 to-zinc-950 shadow-2xl">
                {/* Main Image */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    ref={imageRef}
                    src={previewUrl}
                    alt="Analysis Target"
                    className="w-full h-auto object-contain max-h-[70vh] mx-auto block relative z-0"
                />

                {/* Overlays Container - Absolute covering the image */}
                {data && (
                    <div className="absolute inset-0 pointer-events-none z-20">
                        {showHeatmap && (
                            <Heatmap
                                points={data.heatmapPoints}
                                width={imageSize.width}
                                height={imageSize.height}
                            />
                        )}
                        {showBoxes && data.boundingBoxes.map((box, i) => (
                            <BoundingBox key={i} box={box} />
                        ))}
                    </div>
                )}

                {isAnalyzing && (
                    <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center backdrop-blur-sm z-50">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mb-4"></div>
                        <p className="text-white font-medium">Analyzing visual features...</p>
                    </div>
                )}
            </div>

            {data && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-zinc-500">
                    <div className="p-4 rounded-lg bg-zinc-50 dark:bg-zinc-900 border">
                        <h4 className="font-medium text-zinc-900 dark:text-zinc-100 mb-2">Detected Objects</h4>
                        <ul className="list-disc list-inside space-y-1">
                            {data.boundingBoxes.map((box, i) => (
                                <li key={i}>{box.label} ({Math.round(box.confidence * 100)}%)</li>
                            ))}
                            {data.boundingBoxes.length === 0 && <li>No objects detected</li>}
                        </ul>
                    </div>
                    <div className="p-4 rounded-lg bg-zinc-50 dark:bg-zinc-900 border">
                        <h4 className="font-medium text-zinc-900 dark:text-zinc-100 mb-2">Analysis Stats</h4>
                        <p>Heatmap Regions: {data.heatmapPoints.length}</p>
                        <p>Processing time: instant</p>
                    </div>
                </div>
            )}
        </div>
    );
}
