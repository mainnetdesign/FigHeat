'use client';

import { useEffect, useRef } from 'react';

interface HeatmapPoint {
    x: number;
    y: number;
    intensity: number;
}

interface HeatmapProps {
    points: HeatmapPoint[];
    width: number;
    height: number;
}

function clamp01(n: number) {
    return Math.max(0, Math.min(1, n));
}

/** Pseudo-random 0..1 determinístico por seed (evita re-render diferente a cada frame). */
function seeded(seed: number): number {
    const x = Math.sin(seed * 12.9898) * 43758.5453;
    return x - Math.floor(x);
}

export function Heatmap({ points, width, height }: HeatmapProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !width || !height) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, width, height);

        // 🔥 HEATMAP ORGÂNICO - Formas IRREGULARES Naturais (SEM CÍRCULOS!)
        const globalIntensity = 1.0;

        ctx.globalCompositeOperation = 'overlay';
        ctx.filter = 'blur(40px)';

        points.forEach((p, pointIdx) => {
            const x = (p.x / 100) * width;
            const y = (p.y / 100) * height;
            const intensity = clamp01(Number(p.intensity ?? 0.75));

            const flowAngle = Math.atan2(y - height * 0.3, x - width * 0.5);
            const baseRadius = Math.max(1, Math.min(width, height) * 0.13 * intensity);

            const numBlobs = 5;

            for (let i = 0; i < numBlobs; i++) {
                const progress = i / (numBlobs - 1);
                const tailLength = baseRadius * (3.8 + intensity * 1.8);
                const spreadAngle = flowAngle + (seeded(pointIdx * 7 + i * 3 + 1) - 0.5) * 0.45;

                const offsetX = Math.cos(spreadAngle) * tailLength * progress;
                const offsetY = Math.sin(spreadAngle) * tailLength * progress;
                const blobX = x + offsetX;
                const blobY = y + offsetY;

                const tailFactor = 1 - progress * 0.72;
                const radius = Math.max(1, baseRadius * tailFactor * (0.88 + seeded(pointIdx * 11 + i * 5 + 2) * 0.24));
                const blobIntensity = intensity * (0.94 - progress * 0.58);

                ctx.save();
                ctx.translate(blobX, blobY);
                ctx.rotate(spreadAngle);

                const numPoints = 8 + Math.floor(seeded(pointIdx * 13 + i * 7 + 3) * 4);
                const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);

                gradient.addColorStop(0, `rgba(200, 20, 0, ${0.72 * blobIntensity * globalIntensity})`);
                gradient.addColorStop(0.22, `rgba(220, 50, 0, ${0.64 * blobIntensity * globalIntensity})`);
                gradient.addColorStop(0.44, `rgba(240, 100, 0, ${0.52 * blobIntensity * globalIntensity})`);
                gradient.addColorStop(0.66, `rgba(250, 160, 20, ${0.38 * blobIntensity * globalIntensity})`);
                gradient.addColorStop(0.82, `rgba(255, 220, 80, ${0.20 * blobIntensity * globalIntensity})`);
                gradient.addColorStop(0.94, `rgba(180, 240, 150, ${0.08 * blobIntensity * globalIntensity})`);
                gradient.addColorStop(1, 'rgba(150, 220, 170, 0)');

                ctx.fillStyle = gradient;

                ctx.beginPath();
                for (let j = 0; j < numPoints; j++) {
                    const angle = (j / numPoints) * Math.PI * 2;
                    const randomness = 0.6 + seeded(pointIdx * 17 + i * 11 + j * 2 + 4) * 0.8;
                    const scaleX = 0.25 + seeded(pointIdx * 19 + i * 13 + j * 2 + 5) * 0.3;
                    const scaleY = 1.4 + seeded(pointIdx * 23 + i * 17 + j * 2 + 6) * 0.9;

                    const r = radius * randomness;
                    const px = Math.cos(angle) * r * scaleX;
                    const py = Math.sin(angle) * r * scaleY;

                    if (j === 0) ctx.moveTo(px, py);
                    else {
                        const prevAngle = ((j - 1) / numPoints) * Math.PI * 2;
                        const cpRandomness = 0.7 + seeded(pointIdx * 29 + i * 19 + j * 2 + 7) * 0.6;
                        const cpR = radius * cpRandomness * 0.8;
                        const cpx = Math.cos((angle + prevAngle) / 2) * cpR * scaleX;
                        const cpy = Math.sin((angle + prevAngle) / 2) * cpR * scaleY;
                        ctx.quadraticCurveTo(cpx, cpy, px, py);
                    }
                }
                ctx.closePath();
                ctx.fill();
                ctx.restore();
            }
        });

        ctx.filter = 'blur(18px)';
        ctx.globalCompositeOperation = 'multiply';

        points.forEach((p, pointIdx) => {
            const x = (p.x / 100) * width;
            const y = (p.y / 100) * height;
            const intensity = clamp01(Number(p.intensity ?? 0.75));

            const coreRadius = Math.max(1, Math.min(width, height) * 0.042 * intensity);

            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(seeded(pointIdx * 31 + 8) * Math.PI * 2);

            const numCorePoints = 6 + Math.floor(seeded(pointIdx * 37 + 9) * 3);
            const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, coreRadius);

            gradient.addColorStop(0, `rgba(150, 10, 0, ${0.78 * intensity * globalIntensity})`);
            gradient.addColorStop(0.38, `rgba(180, 40, 0, ${0.62 * intensity * globalIntensity})`);
            gradient.addColorStop(0.72, `rgba(210, 90, 0, ${0.42 * intensity * globalIntensity})`);
            gradient.addColorStop(1, 'rgba(240, 160, 30, 0)');

            ctx.fillStyle = gradient;

            ctx.beginPath();
            for (let j = 0; j < numCorePoints; j++) {
                const angle = (j / numCorePoints) * Math.PI * 2;
                const randomness = 0.65 + seeded(pointIdx * 41 + j + 10) * 0.7;
                const scaleX = 0.35 + seeded(pointIdx * 43 + j + 11) * 0.25;
                const scaleY = 1.25 + seeded(pointIdx * 47 + j + 12) * 0.7;

                const r = coreRadius * randomness;
                const px = Math.cos(angle) * r * scaleX;
                const py = Math.sin(angle) * r * scaleY;

                if (j === 0) ctx.moveTo(px, py);
                else {
                    const prevAngle = ((j - 1) / numCorePoints) * Math.PI * 2;
                    const cpRandomness = 0.8 + seeded(pointIdx * 53 + j + 13) * 0.4;
                    const cpR = coreRadius * cpRandomness * 0.75;
                    const cpx = Math.cos((angle + prevAngle) / 2) * cpR * scaleX;
                    const cpy = Math.sin((angle + prevAngle) / 2) * cpR * scaleY;
                    ctx.quadraticCurveTo(cpx, cpy, px, py);
                }
            }
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        });

        // Remove filtro
        ctx.filter = 'none';
    }, [points, width, height]);

    return (
        <canvas
            ref={canvasRef}
            width={width}
            height={height}
            className="absolute top-0 left-0 w-full h-full pointer-events-none"
            style={{ mixBlendMode: 'normal' }}
        />
    );
}
