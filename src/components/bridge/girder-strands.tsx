"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { girderStrandsFor } from "@/app/actions/bridge";
import { gridHalfWidth, STRAND_PITCH, strandLayout, strandsAt, type StrandLayout } from "@/lib/design/girders/strand-layout";
import { isAdjacent, type GirderShape } from "@/lib/design/girders/sections";

// A girder's strands for the Member forces table: the girder in elevation (vertical scale exaggerated),
// every strand row along it (the straight rows level, dashed where debonded, each harped pair from the
// end up to the harp point), the bearings, harp points and the strands' centroid; and the section at a
// cut, true to scale, each strand at its grid place and height there (debonded strands hollow, harped
// ones blue). Click the elevation or move the slider to move the cut.

type Data = NonNullable<Awaited<ReturnType<typeof girderStrandsFor>>>;

const LINE = "#334155";
const DIM = "#64748b";
const GIRDER = "#e2e8f0";
const STRAIGHT = "#111827";
const HARPED = "#2563eb";
const DEBOND = "#dc2626";
const CUT = "#dc2626";
const CG = "#16a34a";
const f2 = (v: number) => v.toFixed(2);

export function GirderStrands({ bridgeId, span, girder }: { bridgeId: string; span: number; girder: number }) {
  const [state, setState] = useState<{ key: string; data?: Data | null; error?: string } | null>(null);
  const key = `${bridgeId}:${span}`;
  useEffect(() => {
    let live = true;
    girderStrandsFor(bridgeId, span)
      .then((data) => live && setState({ key, data }))
      .catch((e) => live && setState({ key, error: e instanceof Error ? e.message : "Could not read the girder design" }));
    return () => {
      live = false;
    };
  }, [bridgeId, span, key]);

  if (!state || state.key !== key)
    return (
      <p className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> Reading the girder design&apos;s strands
      </p>
    );
  if (state.error) return <p className="py-2 text-xs text-destructive">{state.error}</p>;
  if (!state.data) return <p className="py-2 text-xs text-muted-foreground">No girder design linked to span {span}: link one under Design to see its strands.</p>;
  return <StrandViews data={state.data} girder={girder} span={span} />;
}

function StrandViews({ data, girder, span }: { data: Data; girder: number; span: number }) {
  const Lg = data.L + 2 * data.endDist;
  const layout = useMemo(() => strandLayout(data.shape, data, Lg), [data, Lg]);
  const [cut, setCut] = useState(Lg / 2);
  const at = useMemo(() => strandsAt(layout, cut), [layout, cut]);
  const n = layout.strands.length;
  const nHarped = layout.strands.filter((s) => s.kind === "harped").length;
  const nDeb = layout.strands.filter((s) => s.debondLength > 0).length;
  return (
    <div className="space-y-2">
      <p className="text-xs">
        <span className="font-semibold">Strands</span>{" "}
        <span className="text-muted-foreground">
          · {data.designName}
          {data.spanOfDesign > 1 ? `, its span ${data.spanOfDesign}` : ""} · {data.shape.name}, {n} strands of {data.strandDia} in ({n - nHarped} straight{nDeb ? `, ${nDeb} of them debonded` : ""}
          {nHarped ? `; ${nHarped} harped at ${f2(layout.harpPoint)} Lg` : ""}) · girder {girder} of span {span}, every girder of the span the same
        </span>
      </p>
      <div className="grid gap-x-6 gap-y-2 xl:grid-cols-[3fr_2fr]">
        <div>
          <Elevation layout={layout} shape={data.shape} endDist={data.endDist} cut={cut} onCut={setCut} />
          <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
            Cut
            <input type="range" min={0} max={Lg} step={0.05} value={cut} onChange={(e) => setCut(Number(e.target.value))} className="flex-1 accent-red-600" aria-label="Cut location along the girder" />
            <span className="w-40 text-right tabular-nums text-foreground">
              {f2(cut)} ft from the end ({f2(cut / Lg)} Lg)
            </span>
          </label>
        </div>
        <div>
          <Section shape={data.shape} at={at} dia={data.strandDia} />
          <p className="text-[11px] tabular-nums text-muted-foreground">
            At the cut: {at.nBonded} of {at.n} strands bonded; their c.g. {f2(at.cgBonded)} in from the bottom{at.nBonded !== at.n ? ` (all ${at.n}: ${f2(at.cgAll)} in)` : ""}.
          </p>
        </div>
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">
        The 2 in strand grid of {layout.grid}; straight rows filled {layout.fill === "center-out" ? "from the centerline out" : "from the sides in (the exterior strands against the walls)"}, the harped strands in the pair of places at the web, the debonded strands the innermost of their row (AASHTO 5.9.4.3.3 I).
        Debonded strands shown unbonded to their debonded length (transfer length not drawn).
      </p>
      {layout.notes.map((t) => (
        <p key={t} className="text-[11px] text-amber-700 dark:text-amber-400">
          {t}
        </p>
      ))}
    </div>
  );
}

/** The girder in elevation, end to end, the depth exaggerated. */
function Elevation({ layout, shape, endDist, cut, onCut }: { layout: StrandLayout; shape: GirderShape; endDist: number; cut: number; onCut: (x: number) => void }) {
  const W = 640;
  const x0 = 16;
  const x1 = W - 16;
  const H = shape.depth;
  const top = 26;
  const k = 130 / H; // px per in, vertical
  const Lg = layout.Lg;
  const X = (x: number) => x0 + (x / Lg) * (x1 - x0);
  const Y = (y: number) => top + (H - y) * k;
  const VH = Y(0) + 34;
  const xh = layout.harpPoint * Lg;
  // One line per straight row and debonded length; one per harped strand's path.
  const rows = new Map<string, { y: number; deb: number; n: number }>();
  for (const s of layout.strands.filter((s) => s.kind === "straight")) {
    const key = `${s.y}:${s.debondLength}`;
    const r = rows.get(key) ?? { y: s.y, deb: s.debondLength, n: 0 };
    r.n++;
    rows.set(key, r);
  }
  const paths = new Map<string, { yEnd: number; y: number; n: number }>();
  for (const s of layout.strands.filter((s) => s.kind === "harped")) {
    const key = `${s.yEnd}:${s.y}`;
    const p = paths.get(key) ?? { yEnd: s.yEnd!, y: s.y, n: 0 };
    p.n++;
    paths.set(key, p);
  }
  const cg = Array.from({ length: 81 }, (_, j) => (j / 80) * Lg).map((x) => `${X(x)},${Y(strandsAt(layout, x).cgBonded)}`);
  const pick = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    onCut(Math.max(0, Math.min(Lg, ((px - x0) / (x1 - x0)) * Lg)));
  };
  return (
    <svg viewBox={`0 0 ${W} ${VH}`} className="w-full cursor-crosshair select-none" onClick={pick} role="img" aria-label="The girder's strands in elevation">
      <text x={x0} y={12} fontSize="10" fill={DIM}>
        Elevation, the depth exaggerated ({f2(Lg)} ft girder, {H} in deep)
      </text>
      <rect x={X(0)} y={Y(H)} width={X(Lg) - X(0)} height={H * k} fill={GIRDER} stroke={LINE} strokeWidth="1" />
      {/* harp points */}
      {paths.size > 0 &&
        [xh, Lg - xh].map((x) => (
          <g key={x}>
            <line x1={X(x)} x2={X(x)} y1={Y(H) - 4} y2={Y(0) + 4} stroke={DIM} strokeWidth="0.6" strokeDasharray="4 3" />
            <text x={X(x)} y={Y(H) - 7} textAnchor="middle" fontSize="9" fill={DIM}>
              harp point
            </text>
          </g>
        ))}
      {/* straight rows: solid where bonded, dashed where debonded, a dot where bonding starts */}
      {[...rows.values()].map((r) => (
        <g key={`${r.y}:${r.deb}`}>
          <line x1={X(r.deb)} x2={X(Lg - r.deb)} y1={Y(r.y)} y2={Y(r.y)} stroke={r.deb > 0 ? DEBOND : STRAIGHT} strokeWidth="0.9" />
          {r.deb > 0 && (
            <>
              <line x1={X(0)} x2={X(r.deb)} y1={Y(r.y)} y2={Y(r.y)} stroke={DEBOND} strokeWidth="0.9" strokeDasharray="3 2" />
              <line x1={X(Lg - r.deb)} x2={X(Lg)} y1={Y(r.y)} y2={Y(r.y)} stroke={DEBOND} strokeWidth="0.9" strokeDasharray="3 2" />
              <circle cx={X(r.deb)} cy={Y(r.y)} r={2.2} fill={DEBOND} />
              <circle cx={X(Lg - r.deb)} cy={Y(r.y)} r={2.2} fill={DEBOND} />
            </>
          )}
        </g>
      ))}
      {[...paths.values()].map((p) => (
        <polyline key={`${p.yEnd}:${p.y}`} points={[0, xh, Lg - xh, Lg].map((x) => `${X(x)},${Y(x === 0 || x === Lg ? p.yEnd : p.y)}`).join(" ")} fill="none" stroke={HARPED} strokeWidth="0.9" />
      ))}
      {/* the bonded strands' centroid */}
      <polyline points={cg.join(" ")} fill="none" stroke={CG} strokeWidth="1" strokeDasharray="6 3" />
      {/* bearings */}
      {[endDist, Lg - endDist].map((x) => (
        <polygon key={x} points={`${X(x)},${Y(0) + 1} ${X(x) - 5},${Y(0) + 9} ${X(x) + 5},${Y(0) + 9}`} fill={LINE} />
      ))}
      <text x={X(Lg / 2)} y={Y(0) + 24} textAnchor="middle" fontSize="9" fill={DIM}>
        bearings {f2(endDist)} ft from each end · <tspan fill={CG}>c.g. of the bonded strands</tspan> · <tspan fill={HARPED}>harped</tspan> · <tspan fill={DEBOND}>debonded</tspan>
      </text>
      {/* the cut */}
      <line x1={X(cut)} x2={X(cut)} y1={Y(H) - 14} y2={Y(0) + 12} stroke={CUT} strokeWidth="1.2" />
      <text x={X(cut) + (cut > Lg * 0.85 ? -4 : 4)} y={Y(H) - 16} textAnchor={cut > Lg * 0.85 ? "end" : "start"} fontSize="9" fill={CUT}>
        cut
      </text>
    </svg>
  );
}

/** The section at the cut, to scale, every strand at its place. */
function Section({ shape, at, dia }: { shape: GirderShape; at: ReturnType<typeof strandsAt>; dia: number }) {
  const H = shape.depth;
  const half = Math.max(...shape.profile.map(([, w]) => w), shape.topWidth / 2);
  const box = isAdjacent(shape);
  const W = 360;
  // Scale to fit; an I-shape's bottom flange and web stay readable.
  const s = Math.min((W - 90) / (2 * half), 300 / H);
  const cx = W / 2 - 20;
  const top = 18;
  const Y = (y: number) => top + (H - y) * s;
  const X = (x: number) => cx + x * s;
  const VH = Y(0) + 26;
  let outline: string[];
  let voidRect: { x: number; y: number; w: number; h: number } | null = null;
  if (box) {
    const tb = shape.profile[1][0];
    const tt = H - shape.profile[3][0];
    const tw = shape.web / 2;
    const b = shape.topWidth / 2;
    outline = [`${X(-b)},${Y(0)}`, `${X(b)},${Y(0)}`, `${X(b)},${Y(H)}`, `${X(-b)},${Y(H)}`];
    voidRect = { x: X(-b + tw), y: Y(H - tt), w: (2 * (b - tw)) * s, h: (H - tt - tb) * s };
  } else outline = [...shape.profile.map(([y, w]) => `${X(w)},${Y(y)}`), ...[...shape.profile].reverse().map(([y, w]) => `${X(-w)},${Y(y)}`)];
  const r = Math.max(1.6, (dia / 2) * s);
  // Each row's height and count at the cut, labelled on the right.
  const rowsAt = new Map<number, number>();
  for (const st of at.strands) rowsAt.set(Math.round(st.yAt * 100) / 100, (rowsAt.get(Math.round(st.yAt * 100) / 100) ?? 0) + 1);
  const labelled = [...rowsAt.entries()].sort((a, b) => a[0] - b[0]);
  const labelX = X(half) + 10;
  return (
    <svg viewBox={`0 0 ${W} ${VH}`} className="w-full" role="img" aria-label="The girder's section at the cut, with its strands">
      <text x={4} y={11} fontSize="10" fill={DIM}>
        Section at the cut, to scale
      </text>
      <polygon points={outline.join(" ")} fill={GIRDER} stroke={LINE} strokeWidth="1" />
      {voidRect && <rect x={voidRect.x} y={voidRect.y} width={voidRect.w} height={voidRect.h} fill="white" stroke={LINE} strokeWidth="0.8" />}
      {/* the grid's empty places in the rows used, faint */}
      {labelled.map(([y]) => {
        const m = gridHalfWidth(shape, y);
        const marks: number[] = [];
        for (let x = 1; x <= m; x += STRAND_PITCH) marks.push(x, -x);
        return marks.map((x) => <circle key={`${y}:${x}`} cx={X(x)} cy={Y(y)} r={r} fill="none" stroke={DIM} strokeOpacity="0.35" strokeWidth="0.5" />);
      })}
      {at.strands.map((st, k) => (
        <circle
          key={k}
          cx={X(st.x)}
          cy={Y(st.yAt)}
          r={r}
          fill={!st.bonded ? "white" : st.offGrid ? DEBOND : st.kind === "harped" ? HARPED : STRAIGHT}
          stroke={!st.bonded ? DEBOND : st.kind === "harped" ? HARPED : st.offGrid ? DEBOND : STRAIGHT}
          strokeWidth={!st.bonded ? 1.1 : 0.6}
        >
          <title>{`${st.kind === "harped" ? "Harped" : st.debondLength > 0 ? `Debonded ${st.debondLength} ft` : "Straight"} strand at x = ${st.x} in, y = ${f2(st.yAt)} in${st.bonded ? "" : " (not bonded here)"}`}</title>
        </circle>
      ))}
      {/* the bonded strands' centroid */}
      {at.nBonded > 0 && (
        <g>
          <line x1={X(-half) - 6} x2={X(half) + 4} y1={Y(at.cgBonded)} y2={Y(at.cgBonded)} stroke={CG} strokeWidth="0.8" strokeDasharray="5 3" />
          <text x={X(-half) - 8} y={Y(at.cgBonded) + 3} textAnchor="end" fontSize="8" fill={CG}>
            c.g.
          </text>
        </g>
      )}
      {/* rows: height and count (thinned when close together) */}
      {labelled
        .filter(([y], k) => k === 0 || y - labelled[k - 1][0] >= 1.5 || labelled.length < 8)
        .map(([y, count]) => (
          <text key={y} x={labelX} y={Y(y) + 3} fontSize="8" fill={DIM} className="tabular-nums">
            {f2(y)} in · {count}
          </text>
        ))}
      <text x={cx} y={Y(0) + 16} textAnchor="middle" fontSize="9" fill={DIM}>
        {shape.name}: {H} in deep · rows: height from the bottom · strands
      </text>
    </svg>
  );
}

