"use client";

import type { ShoringInputs, ShoringResult } from "@/lib/design/shoring/wall";
const fmt = (v: number, digits = 2) => (Number.isFinite(v) ? v.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 }) : "–");

// The soldier pile and sheet pile wall's diagrams: net pressure, shear and moment down a cantilever, or the apparent
// pressure envelope with the anchor loads and the reaction at the subgrade.

/** Pressure, shear and moment down the wall (a cantilever), or the pressure envelope with the anchors (anchored). */
export function Diagrams({ i, r }: { i: ShoringInputs; r: ShoringResult }) {
  const W = 620;
  const Hpx = 300;
  const L = r.cant ? r.cant.z[r.cant.z.length - 1] : i.H + i.D;
  const y = (z: number) => 18 + (z / L) * (Hpx - 30);
  const panel = (x0: number, w: number, values: number[], zs: number[], title: string, unit: string, color: string) => {
    const max = Math.max(1e-6, ...values.map(Math.abs));
    const cx = x0 + w / 2;
    const pts = values.map((v, k) => `${cx + (v / max) * (w / 2 - 6)},${y(zs[k])}`).join(" ");
    const kMax = values.reduce((b, v, k) => (Math.abs(v) > Math.abs(values[b]) ? k : b), 0);
    return (
      <g key={title}>
        <text x={cx} y={11} textAnchor="middle" className="fill-foreground text-[10px] font-semibold">{title}</text>
        <line x1={cx} x2={cx} y1={y(0)} y2={y(L)} className="stroke-muted-foreground" strokeWidth={0.8} />
        <polygon points={`${cx},${y(zs[0])} ${pts} ${cx},${y(zs[zs.length - 1])}`} fill={color} fillOpacity={0.25} stroke={color} strokeWidth={1.2} />
        <text x={cx + (values[kMax] / max) * (w / 2 - 6)} y={y(zs[kMax]) - 3} textAnchor="middle" className="fill-foreground text-[9px]">{fmt(Math.abs(values[kMax]), 1)} {unit}</text>
      </g>
    );
  };
  const exc = (
    <g>
      <line x1={0} x2={W} y1={y(i.H)} y2={y(i.H)} className="stroke-muted-foreground" strokeDasharray="4 3" strokeWidth={0.8} />
      <text x={2} y={y(i.H) - 2} className="fill-muted-foreground text-[9px]">excavation</text>
    </g>
  );
  if (r.cant) {
    const zs = r.cant.z;
    const p = zs.map((z) => r.pressures.back(z) - r.pressures.front(z));
    return (
      <svg viewBox={`0 0 ${W} ${Hpx}`} className="w-full">
        {exc}
        {panel(0, W / 3, p, zs, "Net pressure (factored)", "ksf", "#2563eb")}
        {panel(W / 3, W / 3, r.cant.V, zs, i.wall === "soldier" ? "Shear, one pile" : "Shear per ft", "kip", "#d97706")}
        {panel((2 * W) / 3, W / 3, r.cant.M, zs, i.wall === "soldier" ? "Moment, one pile" : "Moment per ft", "kip·ft", "#dc2626")}
      </svg>
    );
  }
  // Anchored: the factored envelope (with the surcharges) down to the excavation, the anchors and R.
  const a = r.anch!;
  const anchors = [...i.anchors].sort((p, q) => p.depth - q.depth);
  const H1 = anchors[0].depth;
  const Hn1 = i.H - anchors[anchors.length - 1].depth;
  const env = (z: number) => (z <= (2 / 3) * H1 ? (a.pa * z) / ((2 / 3) * H1) : z >= i.H - (2 / 3) * Hn1 ? (a.pa * (i.H - z)) / ((2 / 3) * Hn1) : a.pa) * i.gAEP + a.surch;
  const zs = Array.from({ length: 101 }, (_, k) => (i.H * k) / 100);
  const max = Math.max(...zs.map(env));
  const x0 = 120;
  const w = 220;
  const pts = zs.map((z) => `${x0 + (env(z) / max) * w},${y(z)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${Hpx}`} className="w-full">
      {exc}
      <text x={x0 + w / 2} y={11} textAnchor="middle" className="fill-foreground text-[10px] font-semibold">Apparent earth pressure (factored, with surcharges)</text>
      <line x1={x0} x2={x0} y1={y(0)} y2={y(L)} className="stroke-foreground" strokeWidth={1.5} />
      <polygon points={`${x0},${y(0)} ${pts} ${x0},${y(i.H)}`} fill="#2563eb" fillOpacity={0.2} stroke="#2563eb" strokeWidth={1.2} />
      <text x={x0 + w + 4} y={y(i.H / 2)} className="fill-foreground text-[9px]">{fmt(max, 3)} ksf</text>
      {anchors.map((an, k) => (
        <g key={k}>
          <line x1={x0 - 70} x2={x0} y1={y(an.depth)} y2={y(an.depth)} stroke="#dc2626" strokeWidth={1.5} markerEnd="url(#arr)" />
          <text x={x0 - 72} y={y(an.depth) - 3} textAnchor="end" className="fill-foreground text-[9px]">{`Th${k + 1} = ${fmt(a.Th[k], 2)} k/ft`}</text>
        </g>
      ))}
      <line x1={x0 - 70} x2={x0} y1={y(i.H)} y2={y(i.H)} stroke="#d97706" strokeWidth={1.5} />
      <text x={x0 - 72} y={y(i.H) + 11} textAnchor="end" className="fill-foreground text-[9px]">{`R = ${fmt(a.R, 2)} k/ft`}</text>
      <defs>
        <marker id="arr" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 z" fill="#dc2626" />
        </marker>
      </defs>
      {a.moments.map((m, k) => (
        <text key={k} x={x0 + w + 40} y={40 + k * 14} className="fill-foreground text-[9px]">{`${m.at}: ${fmt(m.M, 2)} kip·ft/ft`}</text>
      ))}
    </svg>
  );
}

