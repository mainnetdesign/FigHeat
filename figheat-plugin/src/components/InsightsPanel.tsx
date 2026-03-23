/**
 * FigHeat - Painel Smart Analysis (insights após votação)
 * @license MIT
 */

import * as React from "react";
import type { AnalysisInsights } from "../types";

type InsightsPanelProps = {
  insights: AnalysisInsights | null | undefined;
  onClose: () => void;
};

export function InsightsPanel({ insights, onClose }: InsightsPanelProps) {
  const score = insights?.score ?? 0;
  const list = insights?.insights ?? [];
  return (
    <div className="insights">
      <div className="insightsHeader">
        <div className="insightsTitle">🧠 Smart Analysis</div>
        <div className="insightsScore">
          <div className="scoreLabel">Attention Score</div>
          <div
            className={`scoreValue ${
              score >= 80 ? "scoreHigh" : score >= 60 ? "scoreMedium" : "scoreLow"
            }`}
          >
            {score}/100
          </div>
        </div>
      </div>

      <div className="insightsList">
        {list.map((insight, idx) => (
          <div
            key={idx}
            className={`insightCard insight${insight.type.charAt(0).toUpperCase() + insight.type.slice(1)}`}
          >
            <div className="insightIcon">
              {insight.type === "success" && "✅"}
              {insight.type === "warning" && "⚠️"}
              {insight.type === "info" && "ℹ️"}
              {insight.type === "suggestion" && "💡"}
            </div>
            <div className="insightContent">
              <div className="insightTitle">{insight.title}</div>
              <div className="insightMessage">{insight.message}</div>
            </div>
          </div>
        ))}
      </div>

      <button className="btnGhost" onClick={onClose}>
        Close Insights
      </button>
    </div>
  );
}
