import type { WingwallInputs, WingwallResult } from "@/lib/design/walls/wingwall";

// The wingwall's elevation, to scale, redrawn as its inputs change: the wall off the abutment, the
// part of its retained face the earth pressure acts on (to a line from H at the abutment to h at
// the tip; below it, neglected), and where the thrust acts.

const VW = 520;
const VH = 300;
const LINE = "#334155";
const LOADED = "#fde68a";
const CONCRETE = "#e2e8f0";
const ABUTMENT = "#94a3b8";
const THRUST = "#dc2626";

const ft = (v: number) => `${Number(v.toFixed(2))}'`;

export function WingwallSketch({ inputs, result }: { inputs: WingwallInputs; result: WingwallResult }) {
  const { H, h, L } = inputs;
  const abut = Math.max(1.5, inputs.A);
  const s = Math.min((VW - 110) / (L + abut), (VH - 90) / H);
  const ox = 40 + abut * s; // the abutment face, at x = 0
  const oy = 40; // the top of the wall
  const X = (x: number) => ox + x * s;
  const Y = (z: number) => oy + z * s; // z down from the top
  const { x, y } = result.service;
  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} className="w-full" role="img" aria-label="Wingwall elevation">
      <text x={VW / 2} y={20} textAnchor="middle" fontSize="12" fontWeight="600" fill={LINE}>
        Elevation (retained face)
      </text>
      <rect x={X(-abut)} y={Y(0)} width={abut * s} height={H * s + 20} fill={ABUTMENT} />
      <text x={X(-abut / 2)} y={Y(H) + 34} textAnchor="middle" fontSize="11" fill={LINE}>
        Abutment
      </text>
      <rect x={X(0)} y={Y(0)} width={L * s} height={H * s} fill={CONCRETE} stroke={LINE} strokeWidth="1" />
      <polygon points={`${X(0)},${Y(0)} ${X(L)},${Y(0)} ${X(L)},${Y(h)} ${X(0)},${Y(H)}`} fill={LOADED} stroke={LINE} strokeWidth="0.8" />
      <line x1={X(0)} y1={Y(H)} x2={X(L)} y2={Y(h)} stroke={LINE} strokeWidth="1" strokeDasharray="5 3" />
      <text x={X(L * 0.62)} y={Y(H + (h - H) * 0.62) + 16} textAnchor="middle" fontSize="10" fill={LINE}>
        pressure below this line neglected
      </text>
      <circle cx={X(x)} cy={Y(y)} r={5} fill={THRUST} />
      <text x={X(x) + 9} y={Y(y) + 4} fontSize="11" fill={THRUST}>
        P = {result.service.P.toFixed(1)} kip (service)
      </text>
      <line x1={X(0)} y1={Y(H) + 14} x2={X(L)} y2={Y(H) + 14} stroke={LINE} strokeWidth="0.8" />
      <text x={X(L / 2)} y={Y(H) + 28} textAnchor="middle" fontSize="11" fill={LINE}>
        L = {ft(L)}
      </text>
      <line x1={X(L) + 12} y1={Y(0)} x2={X(L) + 12} y2={Y(h)} stroke={LINE} strokeWidth="0.8" />
      <text x={X(L) + 16} y={Y(h / 2) + 4} fontSize="11" fill={LINE}>
        h = {ft(h)}
      </text>
      <text x={X(0) + 6} y={Y(H / 2)} fontSize="11" fill={LINE}>
        H = {ft(H)}
      </text>
      <text x={X(0) + 6} y={Y(0) + 14} fontSize="10" fill={LINE}>
        Section A
      </text>
    </svg>
  );
}

// The bars where the wingwall meets the abutment, in plan (drawn square to the abutment; the skew lengthens the bars
// through it as the design takes them): the retained face's bars through the abutment, hooked at its far face; the
// front face's straight; the corner bars along the abutment's back face across the wingwall's root, bent into the
// wingwall along its front face; the vertical bars as dots.
const STEEL = "#b91c1c";
const CORNER = "#2563eb";
const barDia = (bar: number) => bar / 8;
const ftIn = (inches: number) => {
  const r = Math.round(inches);
  const f = Math.floor(r / 12);
  return f > 0 ? `${f}'-${r - 12 * f}"` : `${r}"`;
};

export function WingwallPlanDetail({ inputs, result }: { inputs: WingwallInputs; result: WingwallResult }) {
  const W = 520;
  const Hh = 340;
  const c = inputs.cover;
  const t = inputs.t;
  const A = inputs.A * 12;
  const cn = result.connection;
  const front = result.temperature.front;
  const vert = result.temperature.vert;
  const dR = barDia(inputs.bars.bar);
  const dF = barDia(front.bar);
  const dC = barDia(cn.abutBars.bar);
  const hookLeg = 12 * dR;
  // The extent drawn: the abutment from the wingwall's end past the corner bars' leg; the wingwall to past their other leg.
  const Yab = Math.max(t + 24, c + cn.legAb + 12);
  const Xw = Math.max(36, cn.legWing + 18, 2 * t);
  const s = Math.min((W - 120) / (A + Xw), (Hh - 80) / Yab);
  const ox = 60 + A * s; // the abutment's back face (x = 0)
  const oy = 46; // the wingwall's front face (y = 0)
  const X = (x: number) => ox + x * s;
  const Y = (y: number) => oy + y * s;
  const yR = t - c - dR / 2;
  const yF = c + dF / 2;
  const xC = -c - dC / 2; // the corner bars along the abutment's back face
  const yC = yF + dF / 2 + dC / 2; // their bent leg, just inside the front face's bars
  const verts = [] as number[];
  for (let x = c + 3; x < Xw - 2; x += vert.spacing) verts.push(x);
  return (
    <svg viewBox={`0 0 ${W} ${Hh}`} className="w-full" role="img" aria-label="Wingwall bars at the abutment, plan">
      <text x={W / 2} y={18} textAnchor="middle" fontSize="12" fontWeight="600" fill={LINE}>
        Plan at the abutment (bars)
      </text>
      <rect x={X(-A)} y={Y(0)} width={A * s} height={Yab * s} fill={ABUTMENT} fillOpacity={0.35} stroke={LINE} strokeWidth="1" />
      <rect x={X(0)} y={Y(0)} width={Xw * s} height={t * s} fill={CONCRETE} stroke={LINE} strokeWidth="1" />
      <line x1={X(Xw)} y1={Y(-4)} x2={X(Xw)} y2={Y(t + 4)} stroke={LINE} strokeWidth="0.8" strokeDasharray="4 3" />
      <text x={X(-A / 2)} y={Y(Yab) - 8} textAnchor="middle" fontSize="11" fill={LINE}>
        Abutment
      </text>
      <text x={X(Xw / 2)} y={Y(t) + 44} textAnchor="middle" fontSize="11" fill={LINE}>
        Backfill (retained side)
      </text>
      <text x={X(Xw) - 4} y={Y(t / 2) + 4} textAnchor="end" fontSize="10" fill={LINE}>
        Wingwall
      </text>
      {/* Retained face: through the abutment, 90° hook at its far face. */}
      <polyline points={`${X(Xw)},${Y(yR)} ${X(-A + c + dR / 2)},${Y(yR)} ${X(-A + c + dR / 2)},${Y(Math.max(yF + dF / 2 + dR, yR - hookLeg))}`} fill="none" stroke={STEEL} strokeWidth="2" />
      {/* Front face: straight through it. */}
      <line x1={X(Xw)} y1={Y(yF)} x2={X(-A + c)} y2={Y(yF)} stroke={STEEL} strokeWidth="1.4" />
      {/* Corner bars. */}
      <polyline points={`${X(xC)},${Y(c + cn.legAb)} ${X(xC)},${Y(yC)} ${X(xC + cn.legWing)},${Y(yC)}`} fill="none" stroke={CORNER} strokeWidth="2" />
      {verts.flatMap((x) => [
        <circle key={`a${x}`} cx={X(x)} cy={Y(t - c - dR - barDia(vert.bar) / 2)} r={2} fill={LINE} />,
        <circle key={`b${x}`} cx={X(x)} cy={Y(c + dF + barDia(vert.bar) / 2)} r={2} fill={LINE} />,
      ])}
      {/* The critical section: the wingwall's inside face. */}
      <line x1={X(-A - 6)} y1={Y(t)} x2={X(0)} y2={Y(t)} stroke={LINE} strokeWidth="0.8" strokeDasharray="2 3" />
      <text x={X(-A) - 4} y={Y(t) + 4} textAnchor="end" fontSize="9" fill={LINE}>
        crit.
      </text>
      <text x={X(xC) + 6} y={Y(c + cn.legAb) - 4} fontSize="10" fill={CORNER}>
        #{cn.abutBars.bar} @ {cn.abutBars.spacing}&quot; corner bars: {ftIn(cn.legAb)} × {ftIn(cn.legWing)}
      </text>
      <text x={X(Xw) - 4} y={Y(t) + 14} textAnchor="end" fontSize="10" fill={STEEL}>
        #{inputs.bars.bar} @ {inputs.bars.spacing}&quot; retained face, hooked
      </text>
      <text x={X(Xw) - 4} y={Y(0) - 5} textAnchor="end" fontSize="10" fill={STEEL}>
        #{front.bar} @ {front.spacing}&quot; front face
      </text>
      <text x={14} y={Hh - 10} fontSize="10" fill={LINE}>
        ● #{vert.bar} @ {vert.spacing}&quot; vertical, each face · drawn square to the abutment{inputs.skew ? ` (skew ${inputs.skew}°)` : ""}
      </text>
    </svg>
  );
}
