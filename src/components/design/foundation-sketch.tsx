import type { FoundationKind } from "@/lib/design/foundations/kinds";
import type { LateralResult } from "@/lib/design/foundations/lateral";

// Elevations of the foundation tools, redrawn as their inputs change (also the calc packages'
// figures), and the lateral analysis's deflection and moment down the pile or shaft.

const LINE = "#334155";
const CONC = "#cbd5e1";
const EARTH = "#f5efe0";
const ROCK = "#e7e5e4";
const STEEL = "#2563eb";
const VW = 520;
const VH = 240;
type Inputs = Record<string, unknown>;
const n = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);

function Layers({ x0, x1, top, scale, layers, from = 0 }: { x0: number; x1: number; top: number; scale: number; layers: { name?: string; thickness: number; kind?: string }[]; from?: number }) {
  const tops = layers.map((_, k) => layers.slice(0, k).reduce((t, l) => t + l.thickness, 0));
  return (
    <g>
      {layers.map((l, k) => {
        const a = Math.max(tops[k], from);
        const b = tops[k] + l.thickness;
        if (b <= from) return null;
        const y = top + (a - from) * scale;
        const h = (b - a) * scale;
        return (
          <g key={k}>
            <rect x={x0} y={y} width={x1 - x0} height={Math.max(0, Math.min(h, VH - 14 - y))} fill={l.kind === "weak-rock" ? ROCK : EARTH} stroke="#d6d3d1" strokeWidth="0.5" />
            {y < VH - 24 && (
              <text x={x1 - 4} y={y + 11} textAnchor="end" fontSize="9" fill={LINE}>
                {l.name ?? ""} ({l.thickness} ft)
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

export function FoundationSketch({ kind, inputs: i }: { kind: FoundationKind; inputs: Inputs }) {
  const title = { "spread-footing": "Spread footing", "pile-foundation": "Pile foundation", "drilled-shaft": "Drilled shaft", micropile: "Micropile", abutment: "Abutment" }[kind];
  const soil = (i.soil ?? i.layers ?? []) as { name?: string; thickness: number; kind?: string }[];
  const body = (() => {
    if (kind === "spread-footing") {
      const B = n(i.B, 10);
      const t = n(i.t, 36) / 12;
      const Df = n(i.Df, 6);
      const s = Math.min(300 / B, 150 / (Df + 2 * B));
      const cx = VW / 2;
      const g0 = 40;
      const base = g0 + Df * s;
      const col = (n(i.colB, 36) / 12) * s;
      return (
        <g>
          <rect x={20} y={g0} width={VW - 40} height={VH - 54 - g0} fill={EARTH} />
          <line x1={20} y1={g0} x2={VW - 20} y2={g0} stroke={LINE} />
          <rect x={cx - (B * s) / 2} y={base - t * s} width={B * s} height={t * s} fill={CONC} stroke={LINE} />
          <rect x={cx - col / 2} y={g0 - 20} width={col} height={base - t * s - g0 + 20} fill={CONC} stroke={LINE} />
          <text x={cx} y={base + 14} textAnchor="middle" fontSize="10" fill={LINE}>
            B = {B} ft, {n(i.t)} in thick, base {Df} ft down
          </text>
        </g>
      );
    }
    if (kind === "pile-foundation" || kind === "abutment") {
      const isAb = kind === "abutment";
      const integral = isAb && String(i.type).startsWith("integral");
      // Micropiles: a pile foundation's, an integral abutment's rows, or the rows under a seat or semi-integral footing.
      const micro = isAb ? i.type === "integral-micropiles" || (!integral && i.foundation === "micropiles") : i.pileType === "micropile";
      const mp = (i.micropile ?? {}) as { casingOD?: number; holeD?: number; cased?: number; bond?: number };
      const od = n(mp.casingOD, 7);
      const hole = n(mp.holeD, 8);
      const cased = n(mp.cased, 0);
      const bond = n(mp.bond, 25);
      const capW = isAb ? (integral ? n(i.capWidth, 3) : n(i.toe, 4) + n(i.stemT, 3) + n(i.heel, 7)) : (n(i.nB, 3) - 1) * n(i.sB, 4.5) + 2 * n(i.edge, 2);
      const capH = isAb ? (integral ? n(i.capDepth, 4) : n(i.footT, 3)) : n(i.capT, 48) / 12;
      const L = micro ? cased + bond : n(isAb ? (i.type === "integral-shafts" ? i.shaftLength : i.pileLength) : i.length, 35);
      const s = Math.min(380 / Math.max(capW, 8), 170 / (L + capH + (isAb ? n(i.stemH, 0) : 0) + 4));
      const cx = VW / 2;
      const left = cx - (capW * s) / 2;
      const top = 30 + (isAb && !integral ? (n(i.stemH, 10) + n(i.backwallH, 5)) * s : isAb ? (n(i.totalDepth, 10) - capH) * s : 10);
      const capBot = top + capH * s;
      // Each pile in the section: its position across (ft from the cap's left edge, the toe toward the bridge) and its
      // batter (deg; + leans toward the bridge, on the left).
      const rad = (d: number) => (d * Math.PI) / 180;
      const rowsAb = (): { x: number; batter: number }[] => {
        if (i.type === "integral-micropiles") {
          const rows = Math.max(1, Math.round(n(i.mpRows, 2)));
          const sp = n(i.mpRowSpacing, 5);
          return Array.from({ length: rows }, (_, r) => ({ x: capW / 2 - ((rows - 1) * sp) / 2 + r * sp, batter: -(r === 0 ? n(i.mpBatterFront) : n(i.mpBatterBack)) }));
        }
        if (integral) return [{ x: capW / 2, batter: 0 }];
        if (i.foundation === "micropiles") return ((i.mpRowList ?? []) as { x: number; batter: number }[]).map((r) => ({ x: n(r.x), batter: n(r.batter) }));
        if (i.foundation === "piles") return [{ x: n(i.rowFront, 1.5), batter: 0 }, { x: n(i.rowBack, 12), batter: 0 }];
        return [];
      };
      const piles = isAb ? rowsAb() : Array.from({ length: n(i.nB, 3) }, (_, k) => ({ x: n(i.edge, 2) + k * n(i.sB, 4.5), batter: 0 }));
      const count = isAb ? 0 : (() => {
        const a = n(i.nB, 3);
        const b = n(i.nL, 3);
        return i.perimeter && a > 2 && b > 2 ? 2 * a + 2 * b - 4 : a * b;
      })();
      const label = isAb
        ? `${String(i.type).replace("-", " ")}${i.type === "integral-micropiles" ? `, ${n(i.nPiles)} micropiles in each of ${piles.length} rows` : integral ? `, ${n(i.nPiles)} ${i.type === "integral-shafts" ? "shafts" : `${i.section} piles`} in one row` : micro ? `, ${piles.length} rows of ${n(i.mpPerRow, 1)} micropiles` : ""}${micro ? ` (${od} in, ${cased} ft cased + ${bond} ft bonded)` : ""}`
        : micro
          ? `${count} × ${od} in micropiles, ${cased} ft cased + ${bond} ft bonded (${hole} in hole)`
          : `${count} × ${i.section}, ${L} ft`;
      return (
        <g>
          <Layers x0={20} x1={VW - 20} top={capBot} scale={s} layers={soil} from={0} />
          {isAb && integral && <rect x={left} y={30} width={capW * s} height={top - 30} fill={CONC} stroke={LINE} />}
          {isAb && !integral && <rect x={left + n(i.toe, 4) * s} y={30} width={n(i.stemT, 3) * s} height={top - 30} fill={CONC} stroke={LINE} />}
          <rect x={left} y={top} width={capW * s} height={capH * s} fill={CONC} stroke={LINE} />
          {isAb && i.type === "integral-piles" && n(i.prebore) > 0 && piles.map((p, k) => <rect key={k} x={left + p.x * s - (n(i.holeD, 24) / 24) * s} y={capBot} width={(n(i.holeD, 24) / 12) * s} height={n(i.prebore) * s} fill="#fef3c7" stroke="#d97706" strokeDasharray="3 2" />)}
          {piles.map((p, k) => {
            const x = left + p.x * s;
            const t = Math.tan(rad(p.batter));
            if (isAb && i.type === "integral-shafts") return <rect key={k} x={x - (n(i.shaftD, 36) / 24) * s} y={capBot} width={(n(i.shaftD, 36) / 12) * s} height={L * s} fill={CONC} stroke={LINE} />;
            if (!micro) return <line key={k} x1={x} y1={capBot - 0.5 * s} x2={x - L * s * t} y2={capBot + L * s} stroke={STEEL} strokeWidth="2.5" />;
            // A micropile: the casing through its cased length, then the grouted bond zone (the hole's width).
            const yc = capBot + cased * s;
            const xc = x - cased * s * t;
            const w = Math.max(2, (hole / 12) * s);
            const xe = x - L * s * t;
            return (
              <g key={k}>
                {cased > 0 && <line x1={x} y1={capBot - 0.5 * s} x2={xc} y2={yc} stroke={STEEL} strokeWidth="2.5" />}
                <polygon points={`${xc - w / 2},${yc} ${xc + w / 2},${yc} ${xe + w / 2},${capBot + L * s} ${xe - w / 2},${capBot + L * s}`} fill="#e2e8f0" stroke="#64748b" strokeWidth="0.75" />
                <line x1={cased > 0 ? xc : x} y1={cased > 0 ? yc : capBot - 0.5 * s} x2={xe} y2={capBot + L * s} stroke={STEEL} strokeWidth="1.2" />
              </g>
            );
          })}
          <text x={cx} y={20} textAnchor="middle" fontSize="10" fill={LINE}>
            {label}
          </text>
        </g>
      );
    }
    if (kind === "drilled-shaft") {
      const L = n(i.length, 30);
      const top0 = n(i.topDepth, 2);
      const s = 190 / (L + top0 + 2);
      const D = (n(i.D, 42) / 12) * s;
      const g0 = 30;
      return (
        <g>
          <Layers x0={20} x1={VW - 20} top={g0} scale={s} layers={soil} />
          <line x1={20} y1={g0} x2={VW - 20} y2={g0} stroke={LINE} />
          <rect x={VW / 2 - D / 2} y={g0 + top0 * s} width={D} height={L * s} fill={CONC} stroke={LINE} />
          <text x={VW / 2} y={20} textAnchor="middle" fontSize="10" fill={LINE}>
            {n(i.D)} in shaft, {L} ft, {n(i.bars)} #{n(i.bar)}
          </text>
        </g>
      );
    }
    // Micropile
    const cased = n(i.cased, 20);
    const bond = n(i.bond, 25);
    const s = 190 / (cased + bond + 2);
    const g0 = 30;
    const w = Math.max(4, (n(i.holeD, 8) / 12) * s * 3);
    return (
      <g>
        <Layers x0={20} x1={VW - 20} top={g0} scale={s} layers={soil} />
        <rect x={VW / 2 - w / 2} y={g0} width={w} height={cased * s} fill="#94a3b8" stroke={LINE} />
        <rect x={VW / 2 - w / 2} y={g0 + (cased - n(i.plunge)) * s} width={w} height={(bond + n(i.plunge)) * s} fill="#e2e8f0" stroke={LINE} strokeDasharray="3 2" />
        <line x1={VW / 2} y1={g0 - 6} x2={VW / 2} y2={g0 + (cased + bond) * s} stroke={STEEL} strokeWidth="1.5" />
        <text x={VW / 2 + w} y={g0 + (cased * s) / 2} fontSize="9" fill={LINE}>
          cased {cased} ft
        </text>
        <text x={VW / 2 + w} y={g0 + (cased + bond / 2) * s} fontSize="9" fill={LINE}>
          bond {bond} ft
        </text>
      </g>
    );
  })();
  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} className="w-full" role="img" aria-label={title}>
      {body}
    </svg>
  );
}

export function LateralPlot({ title, r }: { title: string; r: LateralResult }) {
  const W = 520;
  const H = 260;
  const top = 34;
  const bot = H - 18;
  const zMax = r.z[r.z.length - 1] || 1;
  const Y = (z: number) => top + ((bot - top) * z) / zMax;
  const panel = (x0: number, w: number, vals: number[], label: string, unit: string, color: string) => {
    const m = Math.max(1e-9, ...vals.map(Math.abs));
    const X = (v: number) => x0 + w / 2 + (v / m) * (w / 2 - 6);
    return (
      <g>
        <line x1={x0 + w / 2} y1={top} x2={x0 + w / 2} y2={bot} stroke="#94a3b8" strokeWidth="0.75" />
        <polyline points={vals.map((v, k) => `${X(v)},${Y(r.z[k])}`).join(" ")} fill="none" stroke={color} strokeWidth="1.5" />
        <text x={x0 + w / 2} y={top - 6} textAnchor="middle" fontSize="10" fill={LINE}>
          {label}, max {m.toFixed(m < 10 ? 3 : 1)} {unit}
        </text>
      </g>
    );
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={title}>
      <text x={W / 2} y={14} textAnchor="middle" fontSize="11" fontWeight="600" fill={LINE}>
        {title}
      </text>
      {panel(30, 230, r.y, "Deflection", "in", STEEL)}
      {panel(280, 230, r.M, "Moment", "kip·ft", "#dc2626")}
      <text x={6} y={top + 4} fontSize="9" fill={LINE}>
        0
      </text>
      <text x={6} y={bot} fontSize="9" fill={LINE}>
        {zMax.toFixed(0)} ft
      </text>
      {r.zZero !== null && <line x1={30} y1={Y(r.zZero)} x2={510} y2={Y(r.zZero)} stroke="#d97706" strokeDasharray="3 2" strokeWidth="0.75" />}
    </svg>
  );
}
