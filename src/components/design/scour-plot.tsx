import type { ElementResult } from "@/lib/design/scour/scour";

// The scour plot (CDOT Scour Program Manual 3.4.5.5): each element's datum and its minimum scour elevation for every
// flood, from abutment to abutment. Plain SVG with no hooks, so a calc package can draw it too.

const FLOOD_STYLE = [
  { color: "#2563eb", dash: undefined },
  { color: "#dc2626", dash: "6 4" },
  { color: "#7c3aed", dash: "2 3" },
];

/** Abutments at the ends, piers between, by their support where every element has one. */
export function plotOrder(elements: ElementResult[]) {
  if (elements.every((e) => e.support !== undefined)) return [...elements].sort((a, b) => a.support! - b.support!);
  const ab = elements.filter((e) => e.kind === "abutment");
  const piers = elements.filter((e) => e.kind === "pier");
  return [...ab.slice(0, 1), ...piers, ...ab.slice(1)];
}

const niceStep = (range: number) => {
  const raw = range / 5;
  const p = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? 10 * p;
};

export function ScourPlot({ elements }: { elements: ElementResult[] }) {
  const els = plotOrder(elements);
  if (!els.length) return null;
  const W = 560;
  const H = 300;
  const left = 58;
  const right = 16;
  const top = 34;
  const bottom = 40;
  const values = els.flatMap((e) => [e.datum, ...e.floods.map((f) => f.elevation)]);
  const hi0 = Math.max(...values);
  const lo0 = Math.min(...values);
  const step = niceStep(Math.max(hi0 - lo0, 4));
  const hi = Math.ceil((hi0 + step * 0.3) / step) * step;
  const lo = Math.floor((lo0 - step * 0.3) / step) * step;
  const y = (el: number) => top + ((hi - el) / (hi - lo)) * (H - top - bottom);
  const x = (k: number) => (els.length === 1 ? (left + W - right) / 2 : left + 30 + (k * (W - right - left - 60)) / (els.length - 1));
  const ticks: number[] = [];
  for (let t = lo; t <= hi + 1e-9; t += step) ticks.push(t);
  const floods = els[0].floods.map((f) => f.name);
  const line = (pts: [number, number][]) => pts.map(([a, b], k) => `${k ? "L" : "M"}${a.toFixed(1)},${b.toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Scour elevations at each pier and abutment">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={left} x2={W - right} y1={y(t)} y2={y(t)} stroke="currentColor" strokeOpacity={0.12} />
          <text x={left - 6} y={y(t) + 3} fontSize={10} textAnchor="end" className="fill-muted-foreground">
            {Number(t.toFixed(2))}
          </text>
        </g>
      ))}
      <text x={12} y={top + (H - top - bottom) / 2} fontSize={10} textAnchor="middle" transform={`rotate(-90 12 ${top + (H - top - bottom) / 2})`} className="fill-muted-foreground">
        Elevation, ft
      </text>
      {/* The datum (the thalweg or floodplain at each element) */}
      <path d={line(els.map((e, k) => [x(k), y(e.datum)]))} fill="none" stroke="currentColor" strokeWidth={1.5} />
      {els.map((e, k) => {
        const lowest = Math.min(...e.floods.map((f) => f.elevation));
        return (
          <g key={`${e.name}-${k}`}>
            <line x1={x(k)} x2={x(k)} y1={y(e.datum)} y2={y(lowest)} stroke="currentColor" strokeOpacity={0.35} strokeDasharray="2 2" />
            <rect x={x(k) - 3} y={y(e.datum) - 3} width={6} height={6} fill="currentColor" />
            <text x={x(k)} y={top - 18} fontSize={10} textAnchor="middle" fontWeight={600} fill="currentColor">
              {e.name}
            </text>
            <text x={x(k)} y={top - 6} fontSize={9} textAnchor="middle" className="fill-muted-foreground">
              datum {Number(e.datum.toFixed(2))}
            </text>
          </g>
        );
      })}
      {floods.map((name, j) => {
        const s = FLOOD_STYLE[j % FLOOD_STYLE.length];
        return (
          <g key={name}>
            <path d={line(els.map((e, k) => [x(k), y(e.floods[j]?.elevation ?? e.datum)]))} fill="none" stroke={s.color} strokeWidth={1.5} strokeDasharray={s.dash} />
            {els.map((e, k) => {
              const f = e.floods[j];
              if (!f) return null;
              return (
                <g key={k}>
                  <circle cx={x(k)} cy={y(f.elevation)} r={3} fill={s.color} />
                  <text x={x(k) + 6} y={y(f.elevation) + (j % 2 ? 12 : -5)} fontSize={9} fill={s.color}>
                    {f.elevation.toFixed(1)}
                    {f.rockLimited ? " (rock)" : ""}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}
      {[{ name: "Datum (thalweg or floodplain)", color: "currentColor", dash: undefined as string | undefined }, ...floods.map((name, j) => ({ name, ...FLOOD_STYLE[j % FLOOD_STYLE.length] }))].map((l, k) => (
        <g key={l.name} transform={`translate(${left + k * ((W - left - right) / (floods.length + 1))}, ${H - 14})`}>
          <line x1={0} x2={18} y1={0} y2={0} stroke={l.color} strokeWidth={1.5} strokeDasharray={l.dash} />
          <text x={22} y={3} fontSize={9} fill={l.color === "currentColor" ? "currentColor" : l.color}>
            {l.name}
          </text>
        </g>
      ))}
    </svg>
  );
}
