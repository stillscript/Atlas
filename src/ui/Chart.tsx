import { useEffect, useRef, useState } from 'preact/hooks';
import { formatMonthDay } from '../lib/format';
import './chart.css';

/**
 * Charts drawn as plain SVG (no library, works offline). A line over time with one point per
 * session or entry; tap or use the arrow keys to read any point. Lighter sessions are drawn
 * hollow so a planned dip doesn't look like lost strength.
 */

export interface ChartPoint {
  at: number;
  date: string;
  value: number;
  light?: boolean;
}

interface LineChartProps {
  points: ChartPoint[];
  /** A smoother companion line (e.g. the 7-day average of body weight). */
  average?: { at: number; value: number }[];
  label: string;
  unit?: string;
  height?: number;
  format?: (value: number) => string;
  /** Extra text under the value readout (e.g. "135 × 9"). */
  detail?: (point: ChartPoint) => string;
}

const W = 340;
const PAD = { left: 38, right: 12, top: 14, bottom: 24 };

/** 1, 2, 2.5 or 5 × a power of ten: steps that read naturally on an axis. */
function niceStep(range: number, ticks: number): number {
  const raw = range / Math.max(1, ticks);
  const power = 10 ** Math.floor(Math.log10(raw || 1));
  // Whole-number steps once the scale allows it (140, 145, 150 rather than 142.5).
  const multiples = power >= 1 ? [1, 2, 5, 10] : [1, 2, 2.5, 5, 10];
  return multiples.map((m) => m * power).find((s) => s >= raw) ?? 10 * power;
}

export function LineChart({ points, average, label, unit = '', height = 190, format = (v) => String(v), detail }: LineChartProps) {
  const [selected, setSelected] = useState(points.length - 1);
  const svg = useRef<SVGSVGElement>(null);
  useEffect(() => setSelected(points.length - 1), [points.length, points[points.length - 1]?.at]);

  if (!points.length) return null;
  const H = height;
  const values = [...points.map((p) => p.value), ...(average ?? []).map((p) => p.value)];
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (hi === lo) {
    lo -= Math.max(1, Math.abs(lo) * 0.05);
    hi += Math.max(1, Math.abs(hi) * 0.05);
  }
  const step = niceStep(hi - lo, 3);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);

  const t0 = points[0]!.at;
  const t1 = points[points.length - 1]!.at;
  const x = (at: number) => (t1 === t0 ? (PAD.left + W - PAD.right) / 2 : PAD.left + ((at - t0) / (t1 - t0)) * (W - PAD.left - PAD.right));
  const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom);
  const path = (list: { at: number; value: number }[]) => list.map((p, i) => `${i ? 'L' : 'M'}${x(p.at).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `${path(points)} L${x(t1).toFixed(1)},${H - PAD.bottom} L${x(t0).toFixed(1)},${H - PAD.bottom} Z`;
  const current = points[Math.min(selected, points.length - 1)]!;

  const pick = (clientX: number) => {
    const rect = svg.current?.getBoundingClientRect();
    if (!rect) return;
    const vx = ((clientX - rect.left) / rect.width) * W;
    let best = 0;
    points.forEach((p, i) => {
      if (Math.abs(x(p.at) - vx) < Math.abs(x(points[best]!.at) - vx)) best = i;
    });
    setSelected(best);
  };

  const first = points[0]!;
  const summary = `${label}: ${points.length} ${points.length === 1 ? 'entry' : 'entries'}, from ${format(first.value)} ${unit} on ${formatMonthDay(first.date)} to ${format(current.value)} ${unit} on ${formatMonthDay(current.date)}.`;

  return (
    <figure class="chart">
      <figcaption class="chart-readout" aria-live="polite">
        <span class="chart-value num">
          {format(current.value)}
          {unit && <span class="chart-unit"> {unit}</span>}
        </span>
        <span class="chart-date">
          {formatMonthDay(current.date)}
          {detail ? ` · ${detail(current)}` : ''}
          {current.light ? ' · lighter session' : ''}
        </span>
      </figcaption>
      <svg
        ref={svg}
        class="chart-svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={summary}
        tabIndex={0}
        onPointerDown={(e) => pick(e.clientX)}
        onPointerMove={(e) => e.buttons && pick(e.clientX)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') setSelected((s) => Math.max(0, s - 1));
          if (e.key === 'ArrowRight') setSelected((s) => Math.min(points.length - 1, s + 1));
        }}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line class="chart-grid" x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
            <text class="chart-axis" x={PAD.left - 6} y={y(t) + 4} text-anchor="end">
              {format(t)}
            </text>
          </g>
        ))}
        <text class="chart-axis" x={x(t0)} y={H - 6} text-anchor="start">
          {formatMonthDay(first.date)}
        </text>
        {t1 !== t0 && (
          <text class="chart-axis" x={x(t1)} y={H - 6} text-anchor="end">
            {formatMonthDay(points[points.length - 1]!.date)}
          </text>
        )}
        {points.length > 1 && <path class="chart-area" d={area} />}
        {average && average.length > 1 && <path class="chart-average" d={path(average)} />}
        {points.length > 1 && <path class={average ? 'chart-line is-raw' : 'chart-line'} d={path(points)} />}
        <line class="chart-guide" x1={x(current.at)} x2={x(current.at)} y1={PAD.top} y2={H - PAD.bottom} />
        {points.map((p, i) => (
          <circle
            key={p.at}
            class={`chart-dot${p.light ? ' is-light' : ''}${i === selected ? ' is-selected' : ''}`}
            cx={x(p.at)}
            cy={y(p.value)}
            r={i === selected ? 5.5 : points.length > 30 ? 2 : 3.5}
          />
        ))}
      </svg>
    </figure>
  );
}

/** A tiny trend line for lists. */
export function Sparkline({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return <span class="spark spark-empty" aria-hidden="true" />;
  const w = 64;
  const h = 24;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const pts = values.map((v, i) => [2 + (i / (values.length - 1)) * (w - 4), 3 + (1 - (v - lo) / span) * (h - 6)] as const);
  const last = pts[pts.length - 1]!;
  return (
    <svg class="spark" viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={label}>
      <polyline points={pts.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(' ')} />
      <circle cx={last[0]} cy={last[1]} r="2.5" />
    </svg>
  );
}
