import type { SteelGirderResult } from "@/lib/design/girders/steel";

// The girder line: its sections and brace points to scale along it, with the Strength I moment and
// shear envelopes (per girder) drawn above it.

export function SteelGirderSketch({ result: r }: { result: SteelGirderResult }) {
  const W = 760;
  const pad = 46;
  const X = (x: number) => pad + ((W - 2 * pad) * x) / r.total;
  const st = [...r.stations].sort((a, b) => a.X - b.X);
  // Moments: sagging up, hogging down, one scale; the zero line where they meet.
  const posMax = Math.max(0, ...st.map((s) => s.Mpos));
  const negMax = Math.max(0, ...st.map((s) => -s.Mneg));
  const mMax = Math.max(1, posMax, negMax);
  const mH = 130;
  const scale = mH / Math.max(1, posMax + negMax);
  const mY0 = 20 + posMax * scale;
  const mY = (m: number) => mY0 - m * scale;
  const vMax = Math.max(1, ...st.map((s) => s.Vu));
  const vTop = 20 + mH + 26;
  const vH = 50;
  const vY = (v: number) => vTop + vH - (v / vMax) * vH;
  const gTop = vTop + vH + 34;
  const depthMax = Math.max(...r.sections.map((s) => s.steel.depth));
  const H = gTop + 70;
  const path = (f: (s: (typeof st)[number]) => number, y: (v: number) => number) => st.map((s, k) => `${k ? "L" : "M"}${X(s.X).toFixed(1)},${y(f(s)).toFixed(1)}`).join("");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Steel girder line and envelopes">
      <text x={pad} y={12} fontSize="10" className="fill-muted-foreground">
        Strength I moment (kip·ft) and shear (kip) per girder
      </text>
      {/* Moment envelope */}
      <line x1={X(0)} x2={X(r.total)} y1={mY0} y2={mY0} className="stroke-border" />
      <path d={path((s) => s.Mpos, mY)} className="fill-none stroke-blue-600" strokeWidth="1.5" />
      <path d={path((s) => s.Mneg, mY)} className="fill-none stroke-red-600" strokeWidth="1.5" />
      <text x={X(0) - 4} y={mY(mMax)} fontSize="9" textAnchor="end" className="fill-muted-foreground">
        {Math.round(mMax)}
      </text>
      {/* Shear envelope */}
      <line x1={X(0)} x2={X(r.total)} y1={vY(0)} y2={vY(0)} className="stroke-border" />
      <path d={path((s) => s.Vu, vY)} className="fill-none stroke-amber-600" strokeWidth="1.5" />
      <text x={X(0) - 4} y={vY(vMax) + 3} fontSize="9" textAnchor="end" className="fill-muted-foreground">
        {Math.round(vMax)}
      </text>
      {/* Girder */}
      <GirderElevation r={r} X={X} y0={gTop} depthMax={depthMax} />
    </svg>
  );
}

function GirderElevation({ r, X, y0, depthMax }: { r: SteelGirderResult; X: (x: number) => number; y0: number; depthMax: number }) {
  const h = (d: number) => 10 + (26 * d) / depthMax;
  const supports = r.spans.reduce((s, L) => [...s, s[s.length - 1] + L], [0]);
  return (
    <g>
      {r.segmentStarts.map((x0, k) => {
        const s = r.sections[k];
        const x1 = k + 1 < r.segmentStarts.length ? r.segmentStarts[k + 1] : r.total;
        return (
          <g key={k}>
            <rect x={X(x0)} y={y0} width={Math.max(0.5, X(x1) - X(x0))} height={h(s.steel.depth)} className={k % 2 ? "fill-slate-300" : "fill-slate-200"} stroke="currentColor" strokeWidth="0.5" />
            <text x={(X(x0) + X(x1)) / 2} y={y0 + h(s.steel.depth) / 2 + 3} fontSize="9" textAnchor="middle" className="fill-foreground">
              {k + 1}
            </text>
          </g>
        );
      })}
      {r.braces.map((b, k) => (
        <line key={k} x1={X(b)} x2={X(b)} y1={y0 - 3} y2={y0} className="stroke-muted-foreground" />
      ))}
      {supports.map((x, k) => (
        <path key={k} d={`M${X(x)},${y0 + 38} l-5,9 h10 z`} className="fill-foreground" />
      ))}
    </g>
  );
}
