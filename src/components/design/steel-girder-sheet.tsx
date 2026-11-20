import type { SteelGirderInputs, SteelGirderResult } from "@/lib/design/girders/steel";
import { camberRows, connectionPlates, deadLoadContraflexure, fieldSections, flangeZones, fracIn, ftIn, spliceLocations, studZones, supportLocations, transverseStiffeners } from "@/lib/design/girders/steel-sheet";

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
const TENSION = "#c2410c";

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
  const e = Math.max(0, i.endDistance);
  const X = (x: number) => PAD + ((W - PAD - 30) * (x + e)) / (r.total + 2 * e);
  const secs = fieldSections(i, r);
  const zones = flangeZones(i, r);
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
  const zoneTop = 80;
  const zoneBot = bottom + 52;
  const dimY = bottom + 92;
  const H = dimY + 86;
  const zoneBand = (y: number, list: { from: number; to: number; tension: boolean }[], label: string, below = false) => (
    <g>
      <text x={6} y={y + 4} fontSize="8.5" fill={MUTED}>
        {label}
      </text>
      {list.map((z, n) => (
        <g key={n}>
          <rect x={X(z.from)} width={Math.max(0.5, X(z.to) - X(z.from))} y={y - 2.5} height={5} fill={z.tension ? TENSION : "#cbd2da"} />
          {X(z.to) - X(z.from) > 26 && (
            <text x={(X(z.from) + X(z.to)) / 2} y={below ? y + 13 : y - 5} fontSize="8.5" textAnchor="middle" fill={z.tension ? TENSION : MUTED}>
              {z.tension ? (zones.fractureCritical ? "T (FCM)" : "T") : "C"}
            </text>
          )}
        </g>
      ))}
    </g>
  );

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
        const mid = (s.from + s.to) / 2;
        const supportNear = sup.some((x) => Math.abs(x - mid) < 0.12 * (s.to - s.from));
        const cx = X(supportNear ? s.from + 0.28 * (s.to - s.from) : mid);
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
      <DimRow X={X} y={dimY + 26} pts={[-e, ...splices, r.total + e]} label="FIELD SECT." labels={secs.map((s) => `${s.letter} · ${ftIn(s.to - s.from)}`)} />
      <DimRow X={X} y={dimY + 52} pts={sup} label="SPANS" labels={r.spans.map((L, n) => `Span ${n + 1} · ${ftIn(L)}`)} />
      {e > 0 &&
        [
          [-e, 0],
          [r.total, r.total + e],
        ].map(([a, b], n) => (
          <g key={`e${n}`}>
            <line x1={X(a)} x2={X(b)} y1={dimY + 70} y2={dimY + 70} stroke={DIM} strokeWidth="0.8" />
            {[a, b].map((p) => (
              <line key={p} x1={X(p) - 3} x2={X(p) + 3} y1={dimY + 73} y2={dimY + 67} stroke={DIM} strokeWidth="1" />
            ))}
            <text x={n === 0 ? X(a) : X(b)} y={dimY + 82} fontSize="8.5" textAnchor={n === 0 ? "start" : "end"} fill={DIM}>
              {ftIn(e)} end to brg
            </text>
          </g>
        ))}
      {zoneBand(zoneTop, zones.top, "TOP FLG")}
      {zoneBand(zoneBot, zones.bottom, "BOT FLG", true)}
    </svg>
  );
}

/** The web camber (cut into the web) or the screed camber (what's still to come once the steel is up: the deck and DC2). */
export function SteelCamberDiagram({ result: r, kind = "web" }: { result: SteelGirderResult; kind?: "web" | "screed" }) {
  const X = (x: number) => PAD + ((W - PAD - 30) * x) / r.total;
  const all = camberRows(r);
  // One scale for both diagrams, so they compare.
  const max = Math.max(0.01, ...all.map((c) => c.camber));
  const rows = all.map((c) => (kind === "screed" ? { ...c, camber: c.screed, steel: 0 } : c));
  const base = 190;
  const k = 150 / max;
  const y = (v: number) => base - v * k;
  const path = (f: (c: (typeof rows)[number]) => number) => rows.map((c, n) => `${n ? "L" : "M"}${X(c.X).toFixed(1)},${y(f(c)).toFixed(1)}`).join("");
  const spacing = rows.length > 2 ? X(rows[2].X) - X(rows[1].X) : W;
  const sup = supportLocations(r);
  const legend: [string, string, string, number][] =
    kind === "screed"
      ? [
          ["Screed camber (deck + DC2)", DIM, "", 1.8],
          ["Deck only", MUTED, "4 3", 1],
        ]
      : [
          ["Web camber", DIM, "", 1.8],
          ["Steel + deck", MUTED, "", 1],
          ["Steel only", MUTED, "4 3", 1],
        ];
  return (
    <svg viewBox={`0 0 ${W} 230`} className="w-full" role="img" aria-label="Camber diagram">
      <path d={`${path((c) => c.camber)}L${X(r.total)},${base}L${X(0)},${base}Z`} fill="#e3eaf3" />
      <line x1={X(0)} x2={X(r.total)} y1={base} y2={base} stroke={LINE} strokeWidth="1" />
      {kind === "screed" ? (
        <path d={path((c) => c.deck)} fill="none" stroke={MUTED} strokeWidth="0.9" strokeDasharray="4 3" />
      ) : (
        <>
          <path d={path((c) => c.steel)} fill="none" stroke={MUTED} strokeWidth="0.9" strokeDasharray="4 3" />
          <path d={path((c) => c.steel + c.deck)} fill="none" stroke={MUTED} strokeWidth="0.9" />
        </>
      )}
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
          <line x1={PAD + n * 170} x2={PAD + n * 170 + 20} y1={12} y2={12} stroke={c} strokeWidth={w} strokeDasharray={da || undefined} />
          <text x={PAD + n * 170 + 25} y={15} fontSize="9.5" fill={LINE}>
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
            {["Point", "From Abut 1", "Steel (DC1)", "Deck (DC1)", "DC2", "Web camber", "Screed camber", "DW, not in camber"].map((h) => (
              <th key={h} className={th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {r.spans.map((_, j) => [
            <tr key={`h${j}`}>
              <td className={`${td} bg-muted/40 text-left font-medium`} colSpan={8}>
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
                  <td className={td}>{c.screed.toFixed(3)}</td>
                  <td className={`${td} text-muted-foreground`}>{c.dw.toFixed(3)}</td>
                </tr>
              )),
          ])}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The cross-frame detail: the frame between two girders to scale (the deck above), its members (single angles, X or
 * K), the connection plates, each member's end connection (its bolts at their spacing and end distance, or its
 * welds), the working points' depth and the girder spacing, and a note of the members, fasteners, plates, the fit
 * and the members' forces against their resistances.
 */
export function SteelCrossFrameDetail({ inputs: i, result: r, end }: { inputs: SteelGirderInputs; result: SteelGirderResult; end?: NonNullable<SteelGirderResult["endFrames"]>["ends"][number] }) {
  // An end cross-frame: the end frame's members on the bearing stiffeners (full depth, both flanges), at the abutment.
  const cf = end && r.endFrames ? { ...i.crossFrame, ...r.endFrames.frame } : i.crossFrame;
  const cn = cf.connection;
  const cfr = end ? { strutForce: end.strutForce, strut: end.strut, diagForce: end.diagForce, diag: end.diag } : r.crossFrames;
  const braceX = end ? Math.min(Math.max(end.X, 1e-3), r.total - 1e-3) : (connectionPlates(r)[0] ?? r.total / 2);
  const k = Math.max(0, r.segmentStarts.filter((x) => x <= braceX + 1e-9).length - 1);
  const seg = fieldSections(i, r)[k];
  const depth = seg.D + seg.top.t + seg.bottom.t;
  const Sin = i.S * 12;
  const VW = 1000;
  const sc = Math.min(560 / (Sin + seg.top.b), 300 / (depth + i.haunch + i.deckT));
  const xA = 90 + (seg.top.b / 2) * sc;
  const xB = xA + Sin * sc;
  const yDeck = 40;
  const yTop = yDeck + (i.deckT + Math.max(0, i.haunch - seg.top.t)) * sc;
  const yBot = yTop + depth * sc;
  const yMid = (yTop + yBot) / 2;
  const hb = cf.hb * sc;
  const wpT = yMid - hb / 2;
  const wpB = yMid + hb / 2;
  const plate = Math.max(2, cn.plateT * sc);
  const halfWeb = Math.max(1.5, (seg.tw * sc) / 2);
  const inA = xA + halfWeb + plate;
  const inB = xB - halfWeb - plate;
  const members: { label: string; a: [number, number]; b: [number, number]; name: string }[] = [
    { label: "top strut", a: [inA, wpT], b: [inB, wpT], name: cf.strut },
    { label: "bottom strut", a: [inA, wpB], b: [inB, wpB], name: cf.strut },
  ];
  const mid: [number, number] = [(xA + xB) / 2, wpB];
  if (cf.type === "X") members.push({ label: "diagonal", a: [inA, wpT], b: [inB, wpB], name: cf.diagonal }, { label: "diagonal", a: [inA, wpB], b: [inB, wpT], name: cf.diagonal });
  else members.push({ label: "diagonal", a: [inA, wpT], b: mid, name: cf.diagonal }, { label: "diagonal", a: [inB, wpT], b: mid, name: cf.diagonal });
  // Bolts along each member from its ends at the connection plates (the K's middle gusset drawn as a plate).
  const bolts = (m: (typeof members)[number]) => {
    if (cn.kind !== "bolted") return [];
    const dx = m.b[0] - m.a[0];
    const dy = m.b[1] - m.a[1];
    const L = Math.hypot(dx, dy);
    const ux = dx / L;
    const uy = dy / L;
    const ends: [[number, number], number][] = [[m.a, 1]];
    if (cf.type === "X" || m.label !== "diagonal") ends.push([m.b, -1]);
    return ends.flatMap(([p, dir]) => Array.from({ length: Math.max(1, Math.round(cn.bolts)) }, (_, q) => [p[0] + dir * ux * (cn.edge + q * cn.spacing) * sc, p[1] + dir * uy * (cn.edge + q * cn.spacing) * sc] as [number, number]));
  };
  const flange = (x: number, y: number, p: { b: number; t: number }) => <rect x={x - (p.b / 2) * sc} y={y} width={p.b * sc} height={Math.max(2.5, p.t * sc)} fill={STEEL} stroke={LINE} strokeWidth="0.8" />;
  const fit = r.curved || Math.abs(i.skew) > 20 ? "the steel dead load fit (curved or skewed framing: the frames fit the girders as the steel's weight deflects them)" : "the no-load fit (straight framing: the frames fit the girders unloaded)";
  const f1 = (v: number) => v.toFixed(1);
  const notes = [
    `Members: diagonals ${cf.diagonal}, struts ${cf.strut}, single angles, Fy ${cf.Fy} ksi.`,
    cn.kind === "bolted"
      ? `Bolts: ${Math.round(cn.bolts)} – ${fracIn(cn.d)} in dia ${cn.grade} (ASTM F3125) at each member end, threads ${cn.threads}, holes ${cn.holes} full size; slip-critical, Class ${cn.surface} faying surfaces.`
      : `Welds: 2 – ${fracIn(cn.weld)} in fillets × ${fracIn(cn.weldLength)} in along the leg at each member end (E70).`,
    cn.kind === "bolted" ? `Bolt spacing ${fracIn(cn.spacing)} in, end distance ${fracIn(cn.edge)} in, gage ${fracIn(cn.gage)} in from the angle's heel.` : "",
    end
      ? `On the bearing stiffeners, ${fracIn(i.bearing.bt)} × ${fracIn(i.bearing.tp)} in each side of the web, full depth; the members connect to ${fracIn(cn.plateT)} in plates. ${r.endFrames?.abutment === "seat" ? "Seat abutment: the frame carries the wind to the bearings in service too." : `${r.endFrames?.abutment === "integral" ? "Integral" : "Semi-integral"} abutment: the frame is cast into the concrete end diaphragm, which then takes the deck's edge and the lateral loads (CDOT BDM 11.3).`}`
      : `Connection plates ${fracIn(cf.plateWidth)} × ${fracIn(cf.plateThickness)} in${cf.fullDepthPlates ? ", full depth, attached to both flanges" : ""}; the members connect to ${fracIn(cn.plateT)} in plates.`,
    `Working points ${fracIn(cf.hb)} in apart, centered on the girder's mid-depth. Detailed for ${fit}.`,
    cfr ? `Forces (kip): strut ${f1(cfr.strutForce)} of ${f1(cfr.strut.Pr)} in compression; diagonal ${f1(cfr.diagForce)} of ${f1(cfr.diag.Pr)}.` : "",
  ].filter(Boolean);
  const H = yBot + 70 + notes.length * 15;
  return (
    <svg viewBox={`0 0 ${VW} ${H}`} className="w-full" role="img" aria-label="Cross-frame detail">
      <rect x={xA - (seg.top.b / 2 + 18) * sc} y={yDeck} width={xB - xA + (seg.top.b + 36) * sc} height={i.deckT * sc} fill="#eef1f4" stroke={MUTED} strokeWidth="0.6" />
      {[xA, xB].map((x, n) => (
        <g key={n}>
          {flange(x, yTop, seg.top)}
          <rect x={x - halfWeb} y={yTop + Math.max(2.5, seg.top.t * sc)} width={2 * halfWeb} height={seg.D * sc} fill={STEEL} stroke={LINE} strokeWidth="0.6" />
          {flange(x, yBot - Math.max(2.5, seg.bottom.t * sc), seg.bottom)}
          <rect x={n === 0 ? x + halfWeb : x - halfWeb - plate} y={cf.fullDepthPlates ? yTop + 3 : wpT - 12} width={plate} height={cf.fullDepthPlates ? yBot - yTop - 6 : hb + 24} fill="#9aa5b1" />
          <text x={x} y={yBot + 16} fontSize="10" fontWeight="600" textAnchor="middle" fill={LINE}>
            {n === 0 ? "Girder" : "Adjacent girder"}
          </text>
        </g>
      ))}
      {members.map((m, n) => (
        <line key={n} x1={m.a[0]} y1={m.a[1]} x2={m.b[0]} y2={m.b[1]} stroke={m.label === "diagonal" ? DIM : "#475569"} strokeWidth={Math.max(3, angleLeg(m.name) * sc * 0.6)} opacity={0.85} />
      ))}
      {cf.type === "K" && <rect x={mid[0] - 14} y={wpB - 10} width={28} height={14} fill="#9aa5b1" />}
      {members.flatMap((m, n) => bolts(m).map(([x, y], q) => <circle key={`${n}-${q}`} cx={x} cy={y} r={Math.max(1.6, (cn.d / 2) * sc)} fill="#ffffff" stroke={LINE} strokeWidth="0.8" />))}
      {[wpT, wpB].map((y, n) => (
        <line key={`wp${n}`} x1={xA - 12} x2={xB + 12} y1={y} y2={y} stroke={MUTED} strokeWidth="0.5" strokeDasharray="6 3 1 3" />
      ))}
      <text x={(xA + xB) / 2} y={wpT - Math.max(3, angleLeg(cf.strut) * sc * 0.3) - 4} fontSize="9.5" textAnchor="middle" fill={LINE}>
        Top strut {cf.strut}
      </text>
      <text x={(xA + xB) / 2} y={wpB + Math.max(3, angleLeg(cf.strut) * sc * 0.3) + 12} fontSize="9.5" textAnchor="middle" fill={LINE}>
        Bottom strut {cf.strut}
      </text>
      <text x={inA + 0.06 * (xB - xA)} y={yMid + 4} fontSize="9.5" textAnchor="start" fill={DIM}>
        Diagonals {cf.diagonal}
      </text>
      <line x1={xA} x2={xB} y1={yBot + 30} y2={yBot + 30} stroke={DIM} strokeWidth="0.8" />
      {[xA, xB].map((x) => (
        <line key={x} x1={x - 3.5} x2={x + 3.5} y1={yBot + 33.5} y2={yBot + 26.5} stroke={DIM} strokeWidth="1.1" />
      ))}
      <text x={(xA + xB) / 2} y={yBot + 26} fontSize="9.5" textAnchor="middle" fill={DIM}>
        {ftIn(i.S)} girder spacing
      </text>
      <line x1={xB + 34} x2={xB + 34} y1={wpT} y2={wpB} stroke={DIM} strokeWidth="0.8" />
      {[wpT, wpB].map((y) => (
        <line key={y} x1={xB + 30.5} x2={xB + 37.5} y1={y + 3.5} y2={y - 3.5} stroke={DIM} strokeWidth="1.1" />
      ))}
      <text x={xB + 42} y={yMid + 3} fontSize="9.5" fill={DIM}>
        {fracIn(cf.hb)} in between working points
      </text>
      <text x={xB + 42} y={yMid + 16} fontSize="9" fill={MUTED}>
        web {seg.D} × {fracIn(seg.tw)}
      </text>
      {notes.map((t, n) => (
        <text key={n} x={40} y={yBot + 58 + n * 15} fontSize="9.5" fill={LINE}>
          {n + 1}. {t}
        </text>
      ))}
    </svg>
  );
}

/** An equal-leg angle's leg (in) from its AISC name: L5X5X1/2 is 5. */
function angleLeg(name: string) {
  const m = /^L(\d+(?:\.\d+)?)X/.exec(name);
  return m ? Number(m[1]) : 4;
}

/**
 * A bolted field splice's detail: the joint in elevation, each girder's flanges at their own thicknesses, the
 * flange splice plates edge-on with their bolts through them, fillers shaded, and the web splice plate with its bolt
 * grid; each flange splice in plan with its bolt rows either side of the joint; the plates, bolts, pitches and
 * distances noted. To scale (the elevation and plans each at their own scale).
 */
export function SteelSpliceDetail({ inputs: i, splice: s }: { inputs: SteelGirderInputs; splice: SteelGirderResult["splices"][number] }) {
  const sp = i.splice;
  const [L, R] = s.sides;
  const D = s.D;
  const tMax = (k: "top" | "bottom") => Math.max(L[k].t, R[k].t);
  const Lmax = Math.max(s.top.plateL, s.bottom.plateL, s.web.plate.b);
  const elW = 440; // the elevation's width, from x = 40
  const sc = Math.min((elW - 80) / Lmax, 330 / (D + tMax("top") + tMax("bottom") + s.top.outer.t + s.bottom.outer.t));
  const x0 = 40 + elW / 2; // the joint
  const yWebTop = 60 + (tMax("top") + s.top.outer.t) * sc;
  const yWebBot = yWebTop + D * sc;
  const gapH = (sp.gap / 2) * sc;
  const FILL = "#f59e0b";
  const PLATE = "#9aa5b1";
  const rowsX = (f: typeof s.top, scale: number, xc: number) => [-1, 1].flatMap((dir) => Array.from({ length: f.rows }, (_, r) => xc + dir * (sp.gap / 2 + sp.endGirder + r * sp.pitch) * scale));
  // Each girder: its flanges (top down from the web's top, bottom down from the web's bottom) and its web.
  const girder = (sec: typeof L, dir: -1 | 1) => {
    const xa = dir < 0 ? 40 : x0 + gapH;
    const w = dir < 0 ? x0 - gapH - 40 : 40 + elW - x0 - gapH;
    const tf = sec.top.t * sc;
    const bf = sec.bottom.t * sc;
    return (
      <g key={dir}>
        <rect x={xa} y={yWebTop - tf} width={w} height={tf} fill={STEEL} stroke={LINE} strokeWidth="0.6" />
        <rect x={xa} y={yWebTop} width={w} height={D * sc} fill="#f4f6f8" stroke={LINE} strokeWidth="0.4" />
        <rect x={xa} y={yWebBot} width={w} height={bf} fill={STEEL} stroke={LINE} strokeWidth="0.6" />
        {/* fillers on the thinner flange, out to the thicker one's face */}
        {sec.top.t < tMax("top") - 1e-6 && <rect x={dir < 0 ? x0 - gapH - (s.top.plateL / 2) * sc : xa} y={yWebTop - tMax("top") * sc} width={(s.top.plateL / 2) * sc - gapH} height={(tMax("top") - sec.top.t) * sc} fill={FILL} opacity={0.8} stroke={LINE} strokeWidth="0.4" />}
        {sec.bottom.t < tMax("bottom") - 1e-6 && <rect x={dir < 0 ? x0 - gapH - (s.bottom.plateL / 2) * sc : xa} y={yWebBot + sec.bottom.t * sc} width={(s.bottom.plateL / 2) * sc - gapH} height={(tMax("bottom") - sec.bottom.t) * sc} fill={FILL} opacity={0.8} stroke={LINE} strokeWidth="0.4" />}
      </g>
    );
  };
  const plate = (Lp: number, y: number, t: number) => <rect x={x0 - (Lp / 2) * sc} y={y} width={Lp * sc} height={Math.max(1.5, t * sc)} fill={PLATE} stroke={LINE} strokeWidth="0.7" />;
  const yTopOuter = yWebTop - tMax("top") * sc - s.top.outer.t * sc;
  const yBotOuter = yWebBot + tMax("bottom") * sc;
  // Flange bolts in elevation: through the outer plate, flange (and filler) and inner plate.
  const flangeBolts = (f: typeof s.top, y0: number, y1: number) =>
    rowsX(f, sc, x0).map((x, k) => <line key={k} x1={x} x2={x} y1={y0 - 2} y2={y1 + 2} stroke={LINE} strokeWidth={Math.max(1.2, sp.d * sc * 0.7)} />);
  // Web bolts: cols lines each side from the joint, perCol down the plate, centered on the web.
  const webY0 = (yWebTop + yWebBot) / 2 - ((s.web.perCol - 1) * s.web.pitch * sc) / 2;
  const webBolts: [number, number][] = [];
  for (const dir of [-1, 1])
    for (let c = 0; c < s.web.cols; c++) for (let q = 0; q < s.web.perCol; q++) webBolts.push([x0 + dir * (sp.gap / 2 + sp.endGirder + c * sp.pitch) * sc, webY0 + q * s.web.pitch * sc]);
  const f1 = (v: number) => fracIn(v);
  // Plans: each flange's outer plate, the web's line, the bolt lines across and the rows along.
  const plan = (f: typeof s.top, y: number, label: string) => {
    const scP = Math.min(420 / f.plateL, 150 / f.b);
    const xc = 520 + 220;
    const lines: number[] = [];
    for (let k = 0; k < f.nAcross / 2; k++) lines.push(-f.b / 2 + sp.edge + k * f.gage, f.b / 2 - sp.edge - k * f.gage);
    const xs = rowsX(f, scP, xc);
    const top = y;
    const bot = y + f.b * scP;
    return (
      <g>
        <text x={xc} y={top - 12} fontSize="10.5" fontWeight="600" textAnchor="middle" fill={LINE}>
          {label}
        </text>
        <rect x={xc - (f.plateL / 2) * scP} y={top} width={f.plateL * scP} height={f.b * scP} fill="#e7ecf1" stroke={LINE} strokeWidth="0.8" />
        <line x1={xc - (f.plateL / 2) * scP - 10} x2={xc + (f.plateL / 2) * scP + 10} y1={(top + bot) / 2} y2={(top + bot) / 2} stroke={MUTED} strokeWidth="0.6" strokeDasharray="8 3 2 3" />
        <line x1={xc} x2={xc} y1={top - 6} y2={bot + 6} stroke={SPLICE} strokeWidth="1" strokeDasharray="4 2" />
        {xs.flatMap((x, a) => lines.map((yy, b) => <circle key={`${a}-${b}`} cx={x} cy={top + (f.b / 2 + yy) * scP} r={Math.max(1.6, (sp.d / 2) * scP)} fill="#ffffff" stroke={LINE} strokeWidth="0.8" />))}
        {/* the pitch and end distances along the bottom edge, the gage and edge across the right end */}
        <text x={xc} y={bot + 15} fontSize="9.5" textAnchor="middle" fill={DIM}>
          {`${f.rows} rows × ${f.nAcross} each side = ${f.n} bolts; pitch ${f1(sp.pitch)}, ${f1(sp.endGirder)} from each girder end, ${f1(sp.edge)} to the plate's ends`}
        </text>
        <text x={xc + (f.plateL / 2) * scP + 8} y={top + sp.edge * scP + 3} fontSize="9" fill={DIM}>
          {`edge ${f1(sp.edge)}`}
        </text>
        {f.nAcross > 2 && (
          <text x={xc + (f.plateL / 2) * scP + 8} y={top + (sp.edge + f.gage / 2) * scP + 6} fontSize="9" fill={DIM}>
            {`gage ${f1(f.gage)}`}
          </text>
        )}
        <text x={xc - (f.plateL / 2) * scP} y={bot + 29} fontSize="9.5" fill={LINE}>
          {`Outer PL ${f1(f.outer.b)} × ${f1(f.outer.t)} × ${ftIn(f.plateL / 12)}; 2 inner PL ${f1(f.inner.b)} × ${f1(f.inner.t)} × ${ftIn(f.plateL / 12)}${f.filler ? `; filler ${f1(f.filler)}` : ""}`}
        </text>
      </g>
    );
  };
  const notes = [
    `Bolts: ${f1(sp.d)} in dia ASTM F3125 ${sp.grade}, pretensioned, slip-critical, Class ${sp.surface} faying surfaces, standard holes (no oversize or slots, 6.13.6.1.3a); threads ${sp.threadsFlange} at the flanges, ${sp.threadsWeb} at the web.`,
    s.top.filler || s.bottom.filler || s.web.filler
      ? `Fillers (shaded) on the thinner plates${[s.top, s.bottom].some((f) => f.R < 1) ? `; flange bolts reduced by R = ${[s.top, s.bottom].filter((f) => f.R < 1).map((f) => f.R.toFixed(3)).join(", ")} for undeveloped fillers (Eq. 6.13.6.1.4-1)` : ""}. Fillers 1/4 in and over: not more than two plates, Fy at least 0.7 of the flange's and 36 ksi (6.13.6.1.4).`
      : "No fillers: the flanges and webs match in thickness.",
    `Web: 2 PL ${f1(s.web.plate.b)} × ${f1(s.web.plate.t)} × ${f1(s.web.plate.h)} in, ${s.web.cols} lines of ${s.web.perCol} bolts each side (${s.web.n} each side) at ${f1(s.web.pitch)} in vertical, ${f1(sp.pitch)} in between lines.`,
    `Splice plates ASTM A709 Grade ${sp.Fy}${sp.Fy === 50 ? "W where the girders are weathering steel" : ""}; ${f1(sp.gap)} in gap between the girders' ends.`,
    `Design: flanges for Pfy = ${s.top.Pfy.toFixed(0)} kip (top) and ${s.bottom.Pfy.toFixed(0)} kip (bottom); web for ${s.web.Ruw.toFixed(0)} kip${s.web.HwStrength > 0 ? ` with Hw ${s.web.HwStrength.toFixed(0)} kip` : " (its shear resistance)"}; no slip at Service II or while the deck is cast (AASHTO 6.13.6.1.3).`,
  ];
  const scTop = Math.min(420 / s.top.plateL, 150 / s.top.b);
  const scBot = Math.min(420 / s.bottom.plateL, 150 / s.bottom.b);
  const yPlanBot = 64 + scTop * s.top.b + 90;
  const yNotes = Math.max(yBotOuter + s.bottom.outer.t * sc + 52, yPlanBot + scBot * s.bottom.b + 52);
  const H = yNotes + notes.length * 15 + 8;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Field splice at ${s.X.toFixed(1)} ft`}>
      <text x={x0} y={22} fontSize="10.5" fontWeight="600" textAnchor="middle" fill={LINE}>
        {`Elevation, field splice at ${ftIn(s.X)} (sections ${s.left + 1} and ${s.right + 1})`}
      </text>
      {girder(L, -1)}
      {girder(R, 1)}
      {plate(s.top.plateL, yTopOuter, s.top.outer.t)}
      {plate(s.top.plateL, yWebTop, s.top.inner.t)}
      {plate(s.bottom.plateL, yBotOuter, s.bottom.outer.t)}
      {plate(s.bottom.plateL, yWebBot - s.bottom.inner.t * sc, s.bottom.inner.t)}
      {flangeBolts(s.top, yTopOuter, yWebTop + s.top.inner.t * sc)}
      {flangeBolts(s.bottom, yWebBot - s.bottom.inner.t * sc, yBotOuter + s.bottom.outer.t * sc)}
      <rect x={x0 - (s.web.plate.b / 2) * sc} y={(yWebTop + yWebBot) / 2 - (s.web.plate.h / 2) * sc} width={s.web.plate.b * sc} height={s.web.plate.h * sc} fill="#dfe5eb" stroke={LINE} strokeWidth="0.8" />
      {webBolts.map(([x, y], k) => (
        <circle key={k} cx={x} cy={y} r={Math.max(1.6, (sp.d / 2) * sc)} fill="#ffffff" stroke={LINE} strokeWidth="0.8" />
      ))}
      <line x1={x0} x2={x0} y1={yTopOuter - 12} y2={yBotOuter + s.bottom.outer.t * sc + 14} stroke={SPLICE} strokeWidth="1" strokeDasharray="5 3" />
      <text x={x0} y={yBotOuter + s.bottom.outer.t * sc + 27} fontSize="9.5" textAnchor="middle" fill={SPLICE}>
        ℄ splice
      </text>
      <text x={44} y={yWebTop + 14} fontSize="9" fill={MUTED}>
        {`Section ${s.left + 1}: top ${f1(L.top.b)} × ${f1(L.top.t)}, web ${f1(D)} × ${f1(L.tw)}, bottom ${f1(L.bottom.b)} × ${f1(L.bottom.t)}`}
      </text>
      <text x={36 + elW} y={yWebBot - 8} fontSize="9" textAnchor="end" fill={MUTED}>
        {`Section ${s.right + 1}: top ${f1(R.top.b)} × ${f1(R.top.t)}, web ${f1(R.D)} × ${f1(R.tw)}, bottom ${f1(R.bottom.b)} × ${f1(R.bottom.t)}`}
      </text>
      <text x={x0 + (s.web.plate.b / 2) * sc + 6} y={(yWebTop + yWebBot) / 2} fontSize="9" fill={DIM}>
        {`2 PL ${f1(s.web.plate.t)} × ${f1(s.web.plate.h)}`}
      </text>
      {plan(s.top, 64, "Top flange splice, plan (outer plate)")}
      {plan(s.bottom, yPlanBot, "Bottom flange splice, plan (outer plate)")}
      {notes.map((t, n) => (
        <text key={n} x={40} y={yNotes + n * 15} fontSize="9.5" fill={LINE}>
          {n + 1}. {t}
        </text>
      ))}
    </svg>
  );
}

/**
 * A bearing's sole plate: in plan (the plate, the flange and the bearing dashed, the anchor bolts, slotted along
 * the girder at an expansion bearing) and in section across the girder (the flange welded to the plate, the bearing,
 * the bolts into the seat), with its size, bevel, welds and bolts noted. To scale.
 */
export function SteelSoleDetail({ inputs: i, sole: s }: { inputs: SteelGirderInputs; sole: NonNullable<SteelGirderResult["soles"]>["supports"][number] }) {
  const so = i.sole;
  const a = so.anchors;
  const sc = Math.min(300 / s.L, 230 / s.W, 14);
  const px = 60;
  const py = 70;
  const cx = px + (s.L * sc) / 2;
  const cy = py + (s.W * sc) / 2;
  const holes = s.n > 0 ? Array.from({ length: s.n }, (_, k) => k) : [];
  const perSide = Math.max(1, Math.ceil(s.n / 2));
  const rodAt = (k: number) => {
    const side = k % 2 === 0 ? -1 : 1;
    const along = perSide > 1 ? ((Math.floor(k / 2) / (perSide - 1)) - 0.5) * (s.L - 4 * s.d) : 0;
    return [cx + along * sc, cy + (side * s.gauge * sc) / 2] as const;
  };
  const slot = !s.fixed;
  // Section across: the seat, the bearing, the plate, the flange and a stub of the web.
  const ex0 = 560;
  const scS = Math.min(380 / Math.max(s.W, so.padW), 14);
  const exC = ex0 + 190;
  const ySeat = 300;
  const padH = 2.5 * scS;
  const yPad = ySeat - padH;
  const tPl = s.tThick * scS;
  const yPl = yPad - tPl;
  const yFl = yPl - s.tf * scS;
  const fr = (v: number) => fracIn(v);
  const notes = [
    `Sole plate ${fr(s.L)} × ${fr(s.W)} in, ASTM A709 Grade ${so.Fy}, ${s.tapered ? `beveled ${fr(s.tThin)} to ${fr(s.tThick)} in to level the girder's ${s.slope.toFixed(4)} rad slope (14.8.2)` : `${fr(s.tThin)} in (the girder's slope ${s.slope.toFixed(4)} rad is within 0.01, 14.8.2)`}; 2 in longer than the bearing (CDOT BDM 14.5.7).`,
    `Welded to the flange: ${fr(so.weld)} in fillets along both edges, ${fr(s.L)} in long.`,
    s.n > 0 ? `Anchor bolts: ${s.n} – ${fr(s.d)} in ${a.grade === "A449" ? "ASTM A449, zinc plated (CDOT 512.02)" : `ASTM F1554 Grade ${a.grade}`}, ${fr(s.gauge)} in apart across, embedded ${fr(a.hef)} in; holes ${slot ? "slotted along the girder (expansion bearing)" : "round (fixed bearing)"}.` : "No anchor bolts: the plate 2 in wider than the bearing and flange (CDOT BDM 14.5.7); transverse restraint by shear blocks.",
    s.hairpin ? `Anchor reinforcement (orange, in the cap): ${s.n * s.hairpin.per} #${s.hairpin.size} hairpins toward each face, epoxy coated, Grade ${so.hairpins.fy}, wrapped tight around the bolts, legs ${s.hairpin.legs} in (ld ${s.hairpin.ld.toFixed(1)} in + 0.5 ca1); φ As fy ${s.hairpin.R.toFixed(0)} kip each way (ACI 318-19 17.5.2.1).` : "",
    `Horizontal force at the strength and extreme event limit states: ${s.H.toFixed(1)} kip (across ${s.across.toFixed(1)}, along ${s.along.toFixed(1)}); ${s.fixed ? "fixed" : "expansion"} bearing.`,
  ].filter(Boolean);
  const yNotes = Math.max(py + s.W * sc + 56, 360);
  const H = yNotes + notes.length * 15 + 10;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Sole plate at the ${s.label}`}>
      <text x={cx} y={40} fontSize="10.5" fontWeight="600" textAnchor="middle" fill={LINE}>
        {`Sole plate, ${s.label} (${s.fixed ? "fixed" : "expansion"}): plan`}
      </text>
      <rect x={px} y={py} width={s.L * sc} height={s.W * sc} fill="#e7ecf1" stroke={LINE} strokeWidth="0.9" />
      <rect x={cx - (so.padL / 2) * sc} y={cy - (so.padW / 2) * sc} width={so.padL * sc} height={so.padW * sc} fill="none" stroke={MUTED} strokeWidth="0.7" strokeDasharray="5 3" />
      <rect x={px - 30} y={cy - (s.bf / 2) * sc} width={s.L * sc + 60} height={s.bf * sc} fill="none" stroke={LINE} strokeWidth="0.6" strokeDasharray="10 3" />
      <line x1={px - 40} x2={px + s.L * sc + 40} y1={cy} y2={cy} stroke={MUTED} strokeWidth="0.5" strokeDasharray="8 3 2 3" />
      {holes.map((k) => {
        const [x, y] = rodAt(k);
        const r = ((s.d + 0.1875) / 2) * sc;
        return slot ? <rect key={k} x={x - r - 0.5 * sc} y={y - r} width={2 * r + 1 * sc} height={2 * r} rx={r} fill="#ffffff" stroke={LINE} strokeWidth="0.8" /> : <circle key={k} cx={x} cy={y} r={r} fill="#ffffff" stroke={LINE} strokeWidth="0.8" />;
      })}
      {/* Hairpins around each bolt toward both cap faces (dashed: in the concrete below), legs drawn short */}
      {s.hairpin &&
        holes.flatMap((k) => {
          const [x, y] = rodAt(k);
          const r = ((s.d + 0.1875) / 2) * sc + 3;
          const leg = Math.min(70, px - 8);
          return [-1, 1].map((dir) => <path key={`h${k}${dir}`} d={`M ${x + dir * leg} ${y - r} L ${x} ${y - r} A ${r} ${r} 0 0 ${dir > 0 ? 0 : 1} ${x} ${y + r} L ${x + dir * leg} ${y + r}`} fill="none" stroke="#b45309" strokeWidth="1.4" strokeDasharray="5 2" />);
        })}
      <text x={px + s.L * sc + 8} y={cy - (s.bf / 2) * sc - 4} fontSize="9" fill={MUTED}>
        flange {fr(s.bf)}
      </text>
      <text x={cx} y={py + s.W * sc + 16} fontSize="9.5" textAnchor="middle" fill={DIM}>
        {`${fr(s.L)} along the girder`}
      </text>
      <text x={px - 8} y={py + 12} fontSize="9.5" textAnchor="end" fill={DIM}>
        {`${fr(s.W)} across`}
      </text>
      <text x={cx} y={py + s.W * sc + 30} fontSize="9" textAnchor="middle" fill={MUTED}>
        {`bearing ${fr(so.padL)} × ${fr(so.padW)} dashed`}
      </text>
      <text x={exC} y={40} fontSize="10.5" fontWeight="600" textAnchor="middle" fill={LINE}>
        Section across the girder
      </text>
      <rect x={ex0} y={ySeat} width={380} height={30} fill="#eef1f4" stroke={MUTED} strokeWidth="0.6" />
      <rect x={exC - (so.padW / 2) * scS} y={yPad} width={so.padW * scS} height={padH} fill="#3b3b3b" opacity={0.75} />
      <rect x={exC - (s.W / 2) * scS} y={yPl} width={s.W * scS} height={tPl} fill={STEEL} stroke={LINE} strokeWidth="0.8" />
      <rect x={exC - (s.bf / 2) * scS} y={yFl} width={s.bf * scS} height={s.tf * scS} fill={STEEL} stroke={LINE} strokeWidth="0.8" />
      <rect x={exC - 2} y={yFl - 90} width={4} height={90} fill={STEEL} stroke={LINE} strokeWidth="0.5" />
      {[-1, 1].map((dir) => (
        <path key={dir} d={`M ${exC + dir * (s.bf / 2) * scS} ${yPl} l ${dir * 6} 0 l ${-dir * 6} -6 z`} fill={LINE} />
      ))}
      {s.n > 0 &&
        [-1, 1].map((dir) => (
          <g key={`b${dir}`}>
            <line x1={exC + (dir * s.gauge * scS) / 2} x2={exC + (dir * s.gauge * scS) / 2} y1={yPl - 10} y2={ySeat + 30} stroke={LINE} strokeWidth={Math.max(1.5, s.d * scS * 0.5)} />
            <rect x={exC + (dir * s.gauge * scS) / 2 - 6} y={yPl - 12} width={12} height={5} fill={LINE} />
          </g>
        ))}
      <text x={ex0 + 382} y={ySeat + 18} fontSize="9" textAnchor="end" fill={MUTED}>
        seat
      </text>
      <text x={exC} y={yPad + padH / 2 + 3} fontSize="9" textAnchor="middle" fill="#ffffff">
        bearing
      </text>
      {notes.map((t, n) => (
        <text key={n} x={40} y={yNotes + n * 15} fontSize="9.5" fill={LINE}>
          {n + 1}. {t}
        </text>
      ))}
    </svg>
  );
}
