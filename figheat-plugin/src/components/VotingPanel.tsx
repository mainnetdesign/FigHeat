/**
 * FigHeat - Painel de votação A/B (Training Mode)
 * @license MIT
 */

import * as React from "react";
import type { HeatmapPoint, BoundingBox, AnalysisInsights, ColorScheme } from "../types";
import { detectDominantColor, drawHeatOnCanvas, drawBoxes } from "../lib/heatmap";

export type VotingOption = {
  heatmapPoints: HeatmapPoint[];
  boundingBoxes: BoundingBox[];
  insights?: AnalysisInsights;
};

export type VotingResults = {
  voteId: string;
  optionA: VotingOption;
  optionB: VotingOption;
  timestamp: number;
};

type VotingPanelProps = {
  votingResults: VotingResults;
  imageBase64A: string;
  imageBase64B: string | null;
  onVote: (choice: "A" | "B") => void;
  onCancel: () => void;
  canvasARef: React.RefObject<HTMLCanvasElement>;
  canvasBRef: React.RefObject<HTMLCanvasElement>;
  /** Quando null, usa detecção automática por imagem */
  colorSchemeOverride?: ColorScheme | null;
};

export function VotingPanel({
  votingResults,
  imageBase64A,
  imageBase64B,
  onVote,
  onCancel,
  canvasARef,
  canvasBRef,
  colorSchemeOverride = null,
}: VotingPanelProps) {
  const schemeForImg = (img: HTMLImageElement): ColorScheme =>
    colorSchemeOverride ?? detectDominantColor(img);
  return (
    <div className="voting">
      <div className="votingTitle">🗳️ Vote for the best analysis:</div>

      <div className="votingOptions">
        {/* Opção A */}
        <div className="votingOption">
          <div className="votingLabel">
            Option A
            <span className="votingType">(Conservative)</span>
            {votingResults.optionA?.insights && (
              <span
                className={`votingScore ${
                  (votingResults.optionA.insights?.score ?? 0) >= 80
                    ? "scoreHigh"
                    : (votingResults.optionA.insights?.score ?? 0) >= 60
                      ? "scoreMedium"
                      : "scoreLow"
                }`}
              >
                {votingResults.optionA.insights.score}/100
              </span>
            )}
          </div>
          <div className="votingCanvas">
            <img
              src={imageBase64A}
              alt="preview"
              style={{ width: "100%", height: "auto" }}
              onLoad={(e) => {
                const img = e.currentTarget;
                const canvas = canvasARef.current;
                if (!canvas) return;

                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;

                const ctx = canvas.getContext("2d");
                if (!ctx) return;

                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0);

                const schemeA = schemeForImg(img);
                const points = votingResults.optionA?.heatmapPoints ?? [];
                drawHeatOnCanvas(ctx, points, canvas.width, canvas.height, schemeA, img.naturalWidth, img.naturalHeight);
                drawBoxes(ctx, votingResults.optionA?.boundingBoxes ?? [], canvas.width, canvas.height);
              }}
            />
            <canvas
              ref={canvasARef}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "none",
              }}
            />
          </div>
          <div className="votingStats">
            • {(votingResults.optionA?.heatmapPoints ?? []).length} points •{" "}
            {(votingResults.optionA?.boundingBoxes ?? []).length} elements
          </div>
          <button className="btn votingBtn" onClick={() => onVote("A")}>
            ✅ Vote for A
          </button>
        </div>

        {/* Opção B */}
        <div className="votingOption">
          <div className="votingLabel">
            Option B
            <span className="votingType">(Creative)</span>
            {votingResults.optionB?.insights && (
              <span
                className={`votingScore ${
                  (votingResults.optionB.insights?.score ?? 0) >= 80
                    ? "scoreHigh"
                    : (votingResults.optionB.insights?.score ?? 0) >= 60
                      ? "scoreMedium"
                      : "scoreLow"
                }`}
              >
                {votingResults.optionB.insights.score}/100
              </span>
            )}
          </div>
          <div className="votingCanvas">
            <img
              src={imageBase64B || imageBase64A}
              alt="Option B preview"
              style={{ width: "100%", height: "auto" }}
              onLoad={(e) => {
                const img = e.currentTarget;
                const canvas = canvasBRef.current;
                if (!canvas) return;

                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;

                const ctx = canvas.getContext("2d");
                if (!ctx) return;

                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0);

                const schemeB = schemeForImg(img);
                const points = votingResults.optionB?.heatmapPoints ?? [];
                drawHeatOnCanvas(ctx, points, canvas.width, canvas.height, schemeB, img.naturalWidth, img.naturalHeight);
                drawBoxes(ctx, votingResults.optionB?.boundingBoxes ?? [], canvas.width, canvas.height);
              }}
            />
            <canvas
              ref={canvasBRef}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "none",
              }}
            />
          </div>
          <div className="votingStats">
            • {(votingResults.optionB?.heatmapPoints ?? []).length} points •{" "}
            {(votingResults.optionB?.boundingBoxes ?? []).length} elements
          </div>
          <button className="btn votingBtn" onClick={() => onVote("B")}>
            ✅ Vote for B
          </button>
        </div>
      </div>

      <button
        className="btnGhost"
        onClick={onCancel}
      >
        ❌ Cancelar (nenhuma é boa)
      </button>
    </div>
  );
}
