import type { SteelGirderInputs, SteelGirderResult } from "@/lib/design/girders/steel";
import { camberRows, connectionPlates, deadLoadContraflexure, fieldSections, fracIn, ftIn, spliceLocations, studZones, supportLocations, transverseStiffeners } from "@/lib/design/girders/steel-sheet";

// The girder elevation and the camber diagram, drawn as a plan sheet shows them: the girder's plates by
// field section (thicknesses exaggerated), its studs, connection plates, transverse and bearing
// stiffeners, the splices at the plate transitions (not designed here) and the dead load contraflexure
// points, with the cross-frame, field section and span dimensions; and the camber along the girder.
// No hooks, so they also draw into the calc package.

const W = 1000;
const PAD = 70;
const LINE = "#334155";
const DIM = "#1f5fa8";
const STEEL = "#c3ccd6";
const MUTED = "#5c6f8a";
const SPLICE = "#b45309";
const STIFF = "#8a96a3";

function DimRow({ X, y, pts, label, labels }: { X: (x: number) => number; y: number; pts: number[]; label: string; labels?: string[] }) {
  return (
    <g>
      <text x={6} y={y + 3} fontSize="9" fill={MUTED}>
        {label}
      </text>
      <line x1={X(pts[0])} x2={X(pts[pts.length - 1])} y1={y} y2={y} stroke={DIM} strokeWidth="0.8" />
      {pts.map((p, k) => (
        <g key={k}>
          <line x1={X(p) - 3.5} x2={X(p) + 3.5} y1={y + 3.5} y2={y - 3.5} stroke={DIM} strokeWidth="1.1" />
          <line x1={X(p)} x2={X(p)} y1={y - 6} y2={y + 6} stroke={DIM} strokeWidth="0.5" />
        </g>
      ))}
      {pts.slice(1).map((p, k) => {
        const t = labels ? labels[k] : ftIn(p - pts[k]);
        const room = X(p) - X(pts[k]);
        return room >= t.length * 5.2 ? (
          <text key={k} x={(X(p) + X(pts[k])) / 2} y={y - 4} fontSize="9.5" textAnchor="middle" fill={DIM}>
            {t}
          </text>
        ) : null;
      })}
    </g>
  );
}

export function SteelGirderElevationSheet({ inputs: i, result: r }: { inputs: SteelGirderInputs; result: SteelGirderResult }) {
  const X = (x: number) => PAD + ((W - PAD - 30) * x) / r.total;
  const secs = fieldSections(i, r);
  const sup = supportLocations(r);
  const cps = connectionPlates(r);
  const tstiff = transverseStiffeners(i);
  const splices = spliceLocations(r);
  const cf = deadLoadContraflexure(r);
  const studs = i.studs.check || i.studs.pitch > 0 ? studZones(i, r) : [];
  const tMax = Math.max(...secs.flatMap((s) => [s.top.t, s.bottom.t]));
  const k = Math.min(9, 14 / tMax); // px per inch of flange thickness
  const webTop = 112;
  const webBot = 176;
  const bottom = webBot + Math.max(...secs.map((s) => s.bottom.t)) * k;
  const studTicks = studs.reduce((n, z) => n + ((z.to - z.from) * 12) / Math.max(1, z.pitch), 0);
  const pairsAt = (x: number) => (!i.bearing.use ? 0 : x === 0 || Math.abs(x - r.total) < 1e-6 ? i.bearing.pairsEnd : i.bearing.pairsPier);
  const supName = (k2: number) => (k2 === 0 ? "Abut 1" : k2 === sup.length - 1 ? "Abut 2" : `Pier ${k2}`);
  const dimY = bottom + 64;
  const H = dimY + 72;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Girder elevation">
      {/* studs */}
      {studs.map((z, n) => {
        const topAt = (x: number) => webTop - (secs.find((s) => x >= s.from - 1e-9 && x <= s.to + 1e-9) ?? secs[0]).top.t * k;
        if (studTicks > 700)
          return <rect key={n} x={X(z.from)} width={X(z.to) - X(z.from)} y={topAt((z.from + z.to) / 2) - 5} height={4} fill={DIM} opacity={0.35} />;
        const ticks: number[] = [];
        for (let x = z.from + z.pitch / 24; x < z.to; x += z.pitch / 12) ticks.push(x);
        return ticks.map((x, m) => <line key={`${n}-${m}`} x1={X(x)} x2={X(x)} y1={topAt(x)} y2={topAt(x) - 4.5} stroke={DIM} strokeWidth="0.7" />);
      })}
      {/* plates */}
      {secs.map((s) => (
        <g key={s.k}>
          <rect x={X(s.from)} y={webTop - s.top.t * k} width={X(s.to) - X(s.from)} height={s.top.t * k} fill={STEEL} stroke={LINE} strokeWidth="1" />
          <rect x={X(s.from)} y={webTop} width={X(s.to) - X(s.from)} height={webBot - webTop} fill="#ffffff" stroke={LINE} strokeWidth="1" />
          <rect x={X(s.from)} y={webBot} width={X(s.to) - X(s.from)} height={s.bottom.t * k} fill={STEEL} stroke={LINE} strokeWidth="1" />
        </g>
      ))}
      {/* transverse stiffeners, connection plates */}
      {tstiff.map((x, n) => (
        <line key={`t${n}`} x1={X(x)} x2={X(x)} y1={webTop} y2={webBot} stroke={STIFF} strokeWidth="0.8" />
      ))}
      {cps.map((x, n) => (
        <line key={`c${n}`} x1={X(x)} x2={X(x)} y1={webTop} y2={webBot} stroke={LINE} strokeWidth="1.1" />
      ))}
      {/* bearings and their stiffeners */}
      {sup.map((x, n) => {
        const pairs = pairsAt(x);
        const end = n === 0 ? 1 : n === sup.length - 1 ? -1 : 0;
        const offs = Array.from({ length: pairs }, (_, m) => (end ? end * (3 + 5 * m) : (m - (pairs - 1) / 2) * 6));
        return (
          <g key={`s${n}`}>
            {offs.map((o, m) => (
              <rect key={m} x={X(x) + o - 1.4} y={webTop} width={2.8} height={webBot - webTop} fill={LINE} />
            ))}
            <path d={`M${X(x)},${bottom} l-8,12 h16 z`} fill="#ffffff" stroke={LINE} strokeWidth="1" />
            <line x1={X(x) - 12} x2={X(x) + 12} y1={bottom + 14} y2={bottom + 14} stroke={LINE} strokeWidth="1" />
            <text x={X(x)} y={bottom + 28} fontSize="10.5" fontWeight="600" textAnchor="middle" fill={LINE}>
              {supName(n)}
            </text>
            {pairs > 0 && (
              <text x={X(x)} y={bottom + 40} fontSize="9" textAnchor="middle" fill={MUTED}>
                {pairs} {pairs === 1 ? "pair" : "pairs"} brg stiff
              </text>
            )}
          </g>
        );
      })}
      {/* splices at the plate transitions */}
      {splices.map((x, n) => (
        <g key={`f${n}`}>
          <line x1={X(x)} x2={X(x)} y1={70} y2={bottom + 6} stroke={SPLICE} strokeWidth="1.2" strokeDasharray="9 3 2 3" />
          <circle cx={X(x)} cy={60} r={10} fill="#ffffff" stroke={SPLICE} strokeWidth="1.2" />
          <text x={X(x)} y={63.5} fontSize="9" fontWeight="600" textAnchor="middle" fill={SPLICE}>
            FS
          </text>
        </g>
      ))}
      {/* dead load contraflexure */}
      {cf.map((x, n) => (
        <g key={`d${n}`}>
          <path d={`M${X(x)},${bottom + 3} l-4,7 h8 z`} fill={DIM} />
          <text x={X(x)} y={bottom + 21} fontSize="8.5" textAnchor="middle" fill={DIM}>
            DL c.f. {ftIn(x)}
          </text>
        </g>
      ))}
      {/* field sections: their letter and plates */}
      {secs.map((s) => {
        const cx = (X(s.from) + X(s.to)) / 2;
        const room = X(s.to) - X(s.from);
        return (
          <g key={`l${s.k}`}>
            <text x={cx} y={(webTop + webBot) / 2 - (room >= 150 ? 2 : -4)} fontSize="13" fontWeight="600" textAnchor="middle" fill={LINE}>
              {s.letter}
            </text>
            {room >= 150 && (
              <text x={cx} y={(webTop + webBot) / 2 + 12} fontSize="9.5" textAnchor="middle" fill={LINE}>
                {s.rolled ? s.name : `Web ${s.D} × ${fracIn(s.tw)}`}
              </text>
            )}
            {room >= 150 && !s.rolled && (
              <text x={cx} y={34} fontSize="9.5" textAnchor="middle" fill={LINE}>
                Top PL {s.top.b} × {fracIn(s.top.t)} · Bot PL {s.bottom.b} × {fracIn(s.bottom.t)}
              </text>
            )}
          </g>
        );
      })}
      <text x={PAD} y={14} fontSize="9.5" fill={DIM}>
        {studs.length ? `Studs: ${i.studs.perRow} – ${fracIn(i.studs.d)}" dia × ${fracIn(i.studs.height)}" ${studs.length === 1 ? `@ ${fracIn(studs[0].pitch)}", full length` : "by zone, see the schedule"}` : ""}
        {cps.length ? `   ·   Connection plates ${fracIn(i.crossFrame.plateWidth)} × ${fracIn(i.crossFrame.plateThickness)} at each cross-frame` : ""}
        {tstiff.length ? `   ·   Transverse stiffeners ${fracIn(i.stiffener.bt)} × ${fracIn(i.stiffener.tp)} (light lines)` : ""}
      </text>
      {/* dimensions */}
      {cps.length > 0 && <DimRow X={X} y={dimY} pts={[...new Set([...sup, ...cps].map((x) => Math.round(x * 1e4) / 1e4))].sort((a, b) => a - b)} label="X-FRAMES" />}
      <DimRow X={X} y={dimY + 26} pts={[0, ...splices, r.total]} label="FIELD SECT." labels={secs.map((s) => `${s.letter} · ${ftIn(s.to - s.from)}`)} />
      <DimRow X={X} y={dimY + 52} pts={sup} label="SPANS" labels={r.spans.map((L, n) => `Span ${n + 1} · ${ftIn(L)}`)} />
    </svg>
  );
}

export function SteelCamberDiagram({ result: r }: { result: SteelGirderResult }) {
  const X = (x: number) => PAD + ((W - PAD - 30) * x) / r.total;
  const rows = camberRows(r);
  const max = Math.max(0.01, ...rows.map((c) => c.camber));
  const base = 190;
  const k = 150 / max;
  const y = (v: number) => base - v * k;
  const path = (f: (c: (typeof rows)[number]) => number) => rows.map((c, n) => `${n ? "L" : "M"}${X(c.X).toFixed(1)},${y(f(c)).toFixed(1)}`).join("");
  const spacing = rows.length > 2 ? X(rows[2].X) - X(rows[1].X) : W;
  const sup = supportLocations(r);
  const legend: [string, string, string, number][] = [
    ["Camber", DIM, "", 1.8],
    ["Steel + deck", MUTED, "", 1],
    ["Steel only", MUTED, "4 3", 1],
  ];
  return (
    <svg viewBox={`0 0 ${W} 230`} className="w-full" role="img" aria-label="Camber diagram">
      <path d={`${path((c) => c.camber)}L${X(r.total)},${base}L${X(0)},${base}Z`} fill="#e3eaf3" />
      <line x1={X(0)} x2={X(r.total)} y1={base} y2={base} stroke={LINE} strokeWidth="1" />
      <path d={path((c) => c.steel)} fill="none" stroke={MUTED} strokeWidth="0.9" strokeDasharray="4 3" />
      <path d={path((c) => c.steel + c.deck)} fill="none" stroke={MUTED} strokeWidth="0.9" />
      <path d={path((c) => c.camber)} fill="none" stroke={DIM} strokeWidth="1.8" />
      {rows.map((c, n) => (
        <g key={n}>
          <line x1={X(c.X)} x2={X(c.X)} y1={base} y2={y(c.camber)} stroke="#cfd6de" strokeWidth="0.6" />
          <circle cx={X(c.X)} cy={y(c.camber)} r={2.3} fill={DIM} />
          {c.camber > 0 && (spacing >= 36 || Math.abs(c.at - 0.5) < 1e-6) && (
            <text x={X(c.X)} y={y(c.camber) - 6} fontSize="9" textAnchor="middle" fill={DIM}>
              {c.camber.toFixed(3)}
            </text>
          )}
        </g>
      ))}
      {sup.map((x, n) => (
        <g key={`s${n}`}>
          <path d={`M${X(x)},${base} l-6,10 h12 z`} fill="#ffffff" stroke={LINE} strokeWidth="1" />
          <text x={X(x)} y={base + 24} fontSize="10" fontWeight="600" textAnchor="middle" fill={LINE}>
            {n === 0 ? "Abut 1" : n === sup.length - 1 ? "Abut 2" : `Pier ${n}`}
          </text>
        </g>
      ))}
      {legend.map(([t, c, da, w], n) => (
        <g key={t}>
          <line x1={PAD + n * 120} x2={PAD + n * 120 + 20} y1={12} y2={12} stroke={c} strokeWidth={w} strokeDasharray={da || undefined} />
          <text x={PAD + n * 120 + 25} y={15} fontSize="9.5" fill={LINE}>
            {t}
          </text>
        </g>
      ))}
      <text x={W - 30} y={15} fontSize="9" textAnchor="end" fill={MUTED}>
        in, up from the chord between bearings
      </text>
    </svg>
  );
}

const th = "border border-border bg-muted/60 px-2 py-1 text-center font-medium";
const td = "border border-border px-2 py-0.5 text-center tabular-nums";

/** The plate schedule: each field section's plates, length and weight (one girder). */
export function SteelPlateSchedule({ inputs: i, result: r }: { inputs: SteelGirderInputs; result: SteelGirderResult }) {
  const secs = fieldSections(i, r);
  const total = secs.reduce((s, x) => s + x.weight, 0);
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr>
            {["Field section", "From – to", "Length", "Top flange", "Web", "Bottom flange", "Weight"].map((h) => (
              <th key={h} className={th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {secs.map((s) => (
            <tr key={s.k}>
              <td className={`${td} font-medium`}>{s.letter}</td>
              <td className={td}>
                {ftIn(s.from)} – {ftIn(s.to)}
              </td>
              <td className={td}>{ftIn(s.to - s.from)}</td>
              {s.rolled ? (
                <td className={td} colSpan={3}>
                  {s.name}
                </td>
              ) : (
                <>
                  <td className={td}>
                    {s.top.b} × {fracIn(s.top.t)}
                  </td>
                  <td className={td}>
                    {s.D} × {fracIn(s.tw)}
                  </td>
                  <td className={td}>
                    {s.bottom.b} × {fracIn(s.bottom.t)}
                  </td>
                </>
              )}
              <td className={td}>{s.weight.toFixed(2)} kip</td>
            </tr>
          ))}
          <tr>
            <td className={`${td} text-left font-medium`} colSpan={6}>
              One girder, girder plates only (stiffeners and connection plates not included)
            </td>
            <td className={`${td} font-medium`}>{total.toFixed(2)} kip</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** The camber table: the dead load deflections and the camber at every tenth point (in). */
export function SteelCamberTable({ result: r }: { result: SteelGirderResult }) {
  const rows = camberRows(r);
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr>
            {["Point", "From Abut 1", "Steel (DC1)", "Deck (DC1)", "DC2", "Camber", "DW, not in camber"].map((h) => (
              <th key={h} className={th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {r.spans.map((_, j) => [
            <tr key={`h${j}`}>
              <td className={`${td} bg-muted/40 text-left font-medium`} colSpan={7}>
                Span {j + 1}
              </td>
            </tr>,
            ...rows
              .filter((c) => c.span === j)
              .map((c, n) => (
                <tr key={`${j}-${n}`}>
                  <td className={td}>{c.at.toFixed(1)}L</td>
                  <td className={td}>{ftIn(c.X)}</td>
                  <td className={td}>{c.steel.toFixed(3)}</td>
                  <td className={td}>{c.deck.toFixed(3)}</td>
                  <td className={td}>{c.dc2.toFixed(3)}</td>
                  <td className={`${td} bg-blue-50 font-medium dark:bg-blue-950/40`}>{c.camber.toFixed(3)}</td>
                  <td className={`${td} text-muted-foreground`}>{c.dw.toFixed(3)}</td>
                </tr>
              )),
          ])}
        </tbody>
      </table>
    </div>
  );
}
