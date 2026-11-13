import type { ApproachSlabInputs, ApproachSlabResult } from "@/lib/design/approach/approach-slab";

// The approach slab along the roadway, redrawn as its inputs change: the abutment's backwall and
// notch, the slab (thickness exaggerated), the void it is designed to span (the design span, at the
// abutment), the sleeper slab, and the governing axle at midspan. No hooks: drawn as a calc figure too.

const VW = 520;
const VH = 220;
const LINE = "#334155";
const SLAB = "#e2e8f0";
const EARTH = "#f5efe0";
const VOID = "#fee2e2";
const BAR = "#dc2626";

export function ApproachSlabSketch({ inputs: i, result: r }: { inputs: ApproachSlabInputs; result: ApproachSlabResult }) {
  const x0 = 70;
  const s = (VW - x0 - 40) / i.L; // px per ft
  const X = (ft: number) => x0 + ft * s;
  const top = 90;
  const ts = Math.max(10, Math.min(28, i.t * 1.6)); // px, exaggerated
  const bot = top + ts;
  const sleeperW = i.sleeper ? i.sleeperB * s : 0;
  const sleeperT = Math.max(8, i.sleeperT * 1.2);
  const span = r.span.S;
  const ground = 190;
  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} className="w-full" role="img" aria-label="Approach slab along the roadway">
      <text x={VW / 2} y={18} textAnchor="middle" fontSize="12" fontWeight="600" fill={LINE}>
        Along the roadway: {i.L} ft slab, designed to span {span.toFixed(1)} ft ({Math.round(i.supportLoss * 100)}%)
      </text>
      {/* earth under the slab */}
      <rect x={X(0)} y={bot} width={X(i.L) - X(0)} height={ground - bot} fill={EARTH} />
      {/* the void the slab spans */}
      <rect x={X(0)} y={bot} width={span * s} height={14} fill={VOID} stroke={BAR} strokeWidth="0.75" strokeDasharray="3 2" />
      <text x={X(span / 2)} y={bot + 26} textAnchor="middle" fontSize="10" fill={BAR}>
        support lost: S = {span.toFixed(1)} ft
      </text>
      {/* backwall and notch */}
      <polygon points={`${x0 - 34},${top - 16} ${x0},${top - 16} ${x0},${bot} ${x0 + 10},${bot} ${x0 + 10},${ground} ${x0 - 34},${ground}`} fill="#cbd5e1" stroke={LINE} strokeWidth="1" />
      <text x={x0 - 17} y={ground + 14} textAnchor="middle" fontSize="10" fill={LINE}>
        Abutment
      </text>
      {/* slab */}
      <rect x={X(0)} y={top} width={i.L * s} height={ts} fill={SLAB} stroke={LINE} strokeWidth="1" />
      <line x1={X(0) + 3} y1={bot - 4} x2={X(i.L) - 3} y2={bot - 4} stroke={BAR} strokeWidth="1.5" />
      <line x1={X(0) + 3} y1={top + 4} x2={X(i.L) - 3} y2={top + 4} stroke={LINE} strokeWidth="0.75" />
      {/* dowel */}
      <polyline points={`${x0 - 20},${ground - 30} ${x0 - 20},${ground - 20} ${x0 + 5},${ground - 20} ${x0 + 5},${top + ts / 2} ${x0 + 40},${top + ts / 2}`} fill="none" stroke="#2563eb" strokeWidth="1.2" />
      {/* sleeper */}
      {i.sleeper && <rect x={X(i.L) - sleeperW} y={bot} width={sleeperW} height={sleeperT} fill="#cbd5e1" stroke={LINE} strokeWidth="1" />}
      {i.sleeper && (
        <text x={X(i.L) - sleeperW / 2} y={bot + sleeperT + 12} textAnchor="middle" fontSize="10" fill={LINE}>
          Sleeper {i.sleeperB} ft
        </text>
      )}
      {/* axle at midspan of the design span */}
      <line x1={X(span / 2)} y1={top - 40} x2={X(span / 2)} y2={top - 3} stroke={LINE} strokeWidth="1.5" markerEnd="url(#as-arrow)" />
      <text x={X(span / 2)} y={top - 44} textAnchor="middle" fontSize="10" fill={LINE}>
        {r.span.axlesOnly ? "Axle or tandem" : "HL-93"}
      </text>
      <defs>
        <marker id="as-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill={LINE} />
        </marker>
      </defs>
      <text x={X(i.L / 2)} y={top + ts / 2 + 4} textAnchor="middle" fontSize="10" fill={LINE}>
        {i.t} in, #{i.mainBars.bar} @ {i.mainBars.spacing} in bottom
      </text>
      <text x={VW - 8} y={VH - 6} textAnchor="end" fontSize="10" fill={LINE}>
        Strip E = {(r.span.E / 12).toFixed(2)} ft · Mu = {r.loads.Mu.toFixed(2)} kip·ft/ft
      </text>
    </svg>
  );
}
