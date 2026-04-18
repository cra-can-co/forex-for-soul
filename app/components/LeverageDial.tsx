'use client';

import { useRef, useEffect } from 'react';

interface Props {
  value: number;       // 1..20
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}

// Circular brass dial: SVG arc that fills with brass as leverage grows.
// Click/drag on the arc to set value.
export function LeverageDial({ value, onChange, min = 1, max = 20 }: Props) {
  const ref = useRef<SVGSVGElement>(null);

  const size = 168;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 66;
  const stroke = 10;

  const startAngle = -210;   // degrees, bottom-left
  const endAngle = 30;      // bottom-right
  const range = endAngle - startAngle; // 240°

  const pct = (value - min) / (max - min);
  const currentAngle = startAngle + pct * range;

  function polar(angle: number, r: number) {
    const a = (angle * Math.PI) / 180;
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
  }

  function arc(fromDeg: number, toDeg: number, r: number) {
    const from = polar(fromDeg, r);
    const to = polar(toDeg, r);
    const large = toDeg - fromDeg > 180 ? 1 : 0;
    return `M ${from.x} ${from.y} A ${r} ${r} 0 ${large} 1 ${to.x} ${to.y}`;
  }

  function handlePointer(e: React.PointerEvent<SVGSVGElement>) {
    const svg = ref.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const x = e.clientX - rect.left - cx;
    const y = e.clientY - rect.top - cy;
    const rawDeg = (Math.atan2(y, x) * 180) / Math.PI; // -180..180

    // Map atan2 output to arc-local position in [0, 360), where 0 is the
    // startAngle (1x, bottom-left) and increases going CW along the visible arc
    // over the top. Valid arc spans [0, range]; the remainder [range, 360) is
    // the forbidden bottom gap.
    //
    // With y-axis pointing down (screen coords), SVG's polar(angle) uses CW
    // positive angles, so atan2(y,x) matches our drawing convention.
    // Our startAngle was defined as -210° ≡ 150° mod 360, so we shift by that.
    const startMod = ((startAngle % 360) + 360) % 360; // 150
    let shifted = ((rawDeg - startMod) % 360 + 360) % 360;

    let clamped: number;
    if (shifted <= range) {
      clamped = shifted;
    } else {
      // Inside the bottom gap — snap to the nearer endpoint.
      const distToEnd = shifted - range;       // small if we're past 20x
      const distToStart = 360 - shifted;       // small if we're before 1x
      clamped = distToEnd < distToStart ? range : 0;
    }

    const localPct = clamped / range;
    const next = Math.round(min + localPct * (max - min));
    if (next !== value) onChange(next);
  }

  // Tick marks every 5x plus hairline per integer
  const ticks: { a: number; major: boolean; label?: string }[] = [];
  for (let v = min; v <= max; v++) {
    const a = startAngle + ((v - min) / (max - min)) * range;
    const major = v === 1 || v === 5 || v === 10 || v === 15 || v === 20;
    ticks.push({ a, major, label: major ? `${v}x` : undefined });
  }

  const knob = polar(currentAngle, radius);

  return (
    <div className="flex flex-col items-center select-none">
      <svg
        ref={ref}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="gauge-ring touch-none cursor-pointer"
        onPointerDown={(e) => { (e.target as SVGElement).setPointerCapture?.(e.pointerId); handlePointer(e); }}
        onPointerMove={(e) => { if (e.buttons === 1) handlePointer(e); }}
      >
        {/* Background track */}
        <path d={arc(startAngle, endAngle, radius)} stroke="#2a2620" strokeWidth={stroke} fill="none" strokeLinecap="round" />
        {/* Filled brass */}
        <path d={arc(startAngle, currentAngle, radius)} stroke="url(#brass)" strokeWidth={stroke} fill="none" strokeLinecap="round" />
        {/* Ticks */}
        {ticks.map((t, i) => {
          const p1 = polar(t.a, radius + (t.major ? 10 : 6));
          const p2 = polar(t.a, radius + (t.major ? 16 : 10));
          return (
            <g key={i}>
              <line
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                stroke={t.major ? '#c9a77c' : '#544e45'}
                strokeWidth={t.major ? 1.4 : 0.8}
              />
              {t.label && (
                <text
                  x={polar(t.a, radius + 26).x}
                  y={polar(t.a, radius + 26).y + 3}
                  textAnchor="middle"
                  fill="#c9a77c"
                  fontSize="9"
                  fontFamily="JetBrains Mono"
                  letterSpacing="0.1em"
                >
                  {t.label}
                </text>
              )}
            </g>
          );
        })}
        {/* Knob */}
        <circle cx={knob.x} cy={knob.y} r={8} fill="#e8c583" stroke="#0a0908" strokeWidth={2} />
        <circle cx={knob.x} cy={knob.y} r={3} fill="#0a0908" />
        {/* Center label */}
        <text x={cx} y={cy - 2} textAnchor="middle" fill="#f6f1e7" fontSize="28" fontFamily="Fraunces" fontWeight="400">
          {value}
          <tspan fill="#c9a77c" fontFamily="Space Grotesk" fontSize="14" dx="2">x</tspan>
        </text>
        <text x={cx} y={cy + 18} textAnchor="middle" fill="#8a857a" fontSize="8" fontFamily="Space Grotesk" letterSpacing="0.28em">
          LEVERAGE
        </text>
        <defs>
          <linearGradient id="brass" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#9b7f5a" />
            <stop offset="50%" stopColor="#e8c583" />
            <stop offset="100%" stopColor="#c9a77c" />
          </linearGradient>
        </defs>
      </svg>
      <div className="flex gap-1 mt-2">
        {[1, 2, 5, 10, 20].map((preset) => (
          <button
            key={preset}
            onClick={() => onChange(preset)}
            className={`text-[10px] font-mono px-2 py-0.5 border transition-colors ${
              value === preset ? 'border-brass text-brass' : 'border-rule text-dim hover:text-ivory hover:border-brass/40'
            }`}
          >
            {preset}x
          </button>
        ))}
      </div>
    </div>
  );
}
