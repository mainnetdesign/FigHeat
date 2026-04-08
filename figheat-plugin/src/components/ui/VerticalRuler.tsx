import * as React from "react";

const HATCH =
  "repeating-linear-gradient(-45deg, rgba(224,231,255,0.55) 0 2px, transparent 2px 6px)";

const MARKS = [0, 50, 100, 150, 200, 250, 300, 350, 400, 450];

export type VerticalRulerProps = {
  /** Altura da faixa superior (alinhada ao header) — px */
  topBandPx: number;
  /** Altura da faixa inferior (alinhada ao footer) — px */
  bottomBandPx: number;
};

/** Padding vertical (px) dentro da faixa da régua — evita recorte de 0/450 com texto rotacionado */
const TRACK_INSET_PX = 12;

/**
 * Régua vertical decorativa à esquerda (ticks + escala em px simulados).
 * Faixas hachuradas usam as mesmas alturas do header/footer para alinhar às linhas horizontais.
 */
export function VerticalRuler({ topBandPx, bottomBandPx }: VerticalRulerProps) {
  const top = Math.max(0, topBandPx);
  const bottom = Math.max(0, bottomBandPx);
  const lastIdx = MARKS.length - 1;

  return (
    <div
      className="figheat-vertical-ruler w-10 shrink-0 flex flex-col border-r border-[var(--stroke)] bg-white min-h-0 select-none"
      aria-hidden
    >
      <div
        className="shrink-0 border-b border-[var(--stroke)] box-border"
        style={{
          height: top || undefined,
          minHeight: top || 1,
          backgroundImage: HATCH,
          backgroundColor: "#fafafa",
        }}
      />
      <div className="relative flex-1 min-h-0 overflow-hidden">
        <div
          className="absolute left-0 right-0"
          style={{
            top: TRACK_INSET_PX,
            bottom: TRACK_INSET_PX,
          }}
        >
          {/* Linha guia vertical */}
          <div className="absolute top-0 bottom-0 right-0 w-px bg-[var(--stroke)] z-[1]" />

          {MARKS.map((n, i) => {
            const topPct = (i / lastIdx) * 100;
            const isFirst = i === 0;
            const isLast = i === lastIdx;
            let topStyle: string | number = `${topPct}%`;
            let yTransform = "translateY(-50%)";
            if (isFirst) {
              topStyle = 0;
              yTransform = "translateY(0)";
            } else if (isLast) {
              topStyle = "100%";
              yTransform = "translateY(-100%)";
            }

            return (
              <div
                key={`mark-${i}`}
                className="absolute right-0 flex items-center pointer-events-none z-[5]"
                style={{ top: topStyle, transform: yTransform }}
              >
                {/* Sem width/height fixos: "450" precisa de espaço; rotação -90° cortava com caixa 22×10 */}
                <span
                  className="text-[9px] leading-none text-neutral-400 tabular-nums whitespace-nowrap bg-white px-1 py-0.5 rounded-sm inline-flex items-center justify-center"
                  style={{
                    transform: "rotate(-90deg)",
                    transformOrigin: "center center",
                    marginRight: 2,
                  }}
                >
                  {n}
                </span>
                <div className="h-px w-2.5 bg-neutral-300 shrink-0 self-center" />
              </div>
            );
          })}
        </div>
      </div>
      <div
        className="shrink-0 border-t border-[var(--stroke)] box-border"
        style={{
          height: bottom || undefined,
          minHeight: bottom || 1,
          backgroundImage: HATCH,
          backgroundColor: "#fafafa",
        }}
      />
    </div>
  );
}
