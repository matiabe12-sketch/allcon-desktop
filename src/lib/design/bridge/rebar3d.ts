import { barDiameter, type IfcBarSet } from "./ifc-rebar";
import type { IfcElement, V3 } from "./ifc";
import type { GirderInputs } from "../girders/prestressed";
import { girderShape } from "../girders/prestressed";
import { strandLayout, strandY } from "../girders/strand-layout";
import { hingeLegs, type ColumnInputs } from "../piers/column";
import { barPositions } from "../piers/column-section";
import type { Connection } from "../piers/column-shaft";
import { hookLeg } from "../rebar/bars";
import type { ShaftInputs } from "../foundations/shaft";
import { detailCap } from "../stm/detail";
import type { StmInputs } from "../stm/strut-tie";

// The Bridge's reinforcement in 3D, for the workspace's Rebar view: each bar where its design puts it,
// in its host element's frame (the IFC element's placement: x across its profile's width, y up its
// profile, z along its sweep; feet). A set is one bar's centreline and the places it's repeated at.
//
// Placed from the designs (phase 1):
// - girders: the strands on the strand grid (strand-layout.ts) along the girder, harped strands
//   draped to their harp points, the debonded lengths sheathed; the stirrups zone by zone from the
//   bearing (the first 2 in from the end), open at the top and projecting into the deck where the
//   design says so (CDOT B-618-CBT1, B-618-BX);
// - pier caps: the strut-and-tie design's detailing (stm/detail.ts): top and bottom bars in their
//   layers, side-face bars, closed stirrups in sets;
// - pier columns: the column design's bars (its section's bar places) lapped into the shaft or
//   footing and run up into the cap with 90° hooks turned in; ties or a spiral at its spacing;
// - drilled shafts: the cage's bars around the shaft and its spiral.
// The other elements' bars (deck, abutments, approach slabs, wingwalls, footings, piles) keep the
// IFC model's schematic layout (ifc-rebar.ts), marked "schematic".

export type BarRole = "main" | "stirrup" | "spiral" | "strand" | "sheathed";
export type BarSet3D = {
  host: number; // the element's index
  frame: "host" | "world"; // world: the schematic sets, already placed
  mark: string;
  size: number; // bar number; strands carry their diameter in `dia`
  dia: number; // in
  role: BarRole;
  label: string;
  path: V3[]; // ft
  at: V3[]; // ft, each copy's offset
  placed: "design" | "schematic";
};

const ft = (inch: number) => inch / 12;
const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
const p3 = (x: number, y: number, z: number): V3 => [r4(x), r4(y), r4(z)];

/** A helix about z: radius r (ft), from z0 to z1 at a pitch (ft), 16 points a turn. */
function helix(r: number, z0: number, z1: number, pitch: number, cx = 0): V3[] {
  const turns = Math.max(1, (z1 - z0) / pitch);
  const n = Math.ceil(turns * 16);
  return Array.from({ length: n + 1 }, (_, k) => {
    const t = (k / n) * turns * 2 * Math.PI;
    return p3(cx + r * Math.cos(t), r * Math.sin(t), z0 + ((z1 - z0) * k) / n);
  });
}
const circle = (r: number, n = 24): V3[] => Array.from({ length: n + 1 }, (_, k) => p3(r * Math.cos((2 * Math.PI * k) / n), r * Math.sin((2 * Math.PI * k) / n), 0));

// --- girders ------------------------------------------------------------------------------------------------------

/** Each stirrup's place along the girder (ft from its end), zone by zone from the bearing at each end, symmetrical. */
export function stirrupStations(i: Pick<GirderInputs, "stirrups" | "endDist">, Lg: number): { z: number; bar: number; legs: number }[] {
  const half = Lg / 2;
  const out: { z: number; bar: number; legs: number }[] = [];
  let edge = i.endDist;
  i.stirrups.forEach((zn, k) => {
    const last = k === i.stirrups.length - 1 || zn.length <= 0;
    const from = k === 0 ? 2 / 12 : edge;
    const to = last ? half : Math.min(half, edge + zn.length);
    if (to <= from || zn.spacing <= 0) return;
    const s = zn.spacing / 12;
    // Starting a spacing past the previous zone's last stirrup (the first zone at the end).
    for (let z = k === 0 ? from : from + s; z <= to + 1e-6; z += s) out.push({ z, bar: zn.bar, legs: zn.legs });
    edge = to;
  });
  const mirrored = out.filter((s) => Math.abs(s.z - half) > 1e-3).map((s) => ({ ...s, z: Lg - s.z }));
  return [...out, ...mirrored].sort((a, b) => a.z - b.z);
}

/** A girder's strands and stirrups in its element's frame (x across, y up from its bottom, z along from its end). */
export function girderBars(host: number, e: IfcElement, i: GirderInputs, span: { strands: GirderInputs["strands"]; harped: GirderInputs["harped"] | null }, deckT: number): BarSet3D[] {
  const shape = girderShape(i);
  const Lg = e.depth;
  const out: BarSet3D[] = [];
  const layout = strandLayout(shape, { strands: span.strands, harped: span.harped }, Lg);
  const dia = i.strandDia;
  const xh = layout.harpPoint * Lg;
  // Straight strands, a set per row and debonded length: bonded between the debonded ends; sheathed at the ends.
  const rows = new Map<string, { y: number; deb: number; xs: number[] }>();
  for (const s of layout.strands.filter((s) => s.kind === "straight")) {
    const key = `${s.y}:${s.debondLength}`;
    const r = rows.get(key) ?? { y: s.y, deb: s.debondLength, xs: [] };
    r.xs.push(s.x);
    rows.set(key, r);
  }
  for (const r of rows.values()) {
    const at = r.xs.map((x) => p3(ft(x), 0, 0));
    const y = ft(r.y);
    if (r.deb > 0) {
      out.push({ host, frame: "host", mark: "", size: 0, dia, role: "strand", label: `Strands debonded ${r.deb} ft at ${r.y} in`, path: [p3(0, y, r.deb), p3(0, y, Lg - r.deb)], at, placed: "design" });
      for (const [a, b] of [[0, r.deb], [Lg - r.deb, Lg]]) out.push({ host, frame: "host", mark: "", size: 0, dia, role: "sheathed", label: `Sheathed (debonded ${r.deb} ft)`, path: [p3(0, y, a), p3(0, y, b)], at, placed: "design" });
    } else out.push({ host, frame: "host", mark: "", size: 0, dia, role: "strand", label: `Straight strands at ${r.y} in`, path: [p3(0, y, 0), p3(0, y, Lg)], at, placed: "design" });
  }
  // Harped strands: each pair's path from the end up to the harp points.
  const paths = new Map<string, { s: (typeof layout.strands)[number]; xs: number[] }>();
  for (const s of layout.strands.filter((s) => s.kind === "harped")) {
    const key = `${s.yEnd}:${s.y}`;
    const p = paths.get(key) ?? { s, xs: [] };
    p.xs.push(s.x);
    paths.set(key, p);
  }
  for (const { s, xs } of paths.values())
    out.push({ host, frame: "host", mark: "", size: 0, dia, role: "strand", label: `Harped strands, ${s.yEnd} in at the ends to ${s.y} in`, path: [0, xh, Lg - xh, Lg].map((z) => p3(0, ft(strandY(s, layout, z)), z)), at: xs.map((x) => p3(ft(x), 0, 0)), placed: "design" });

  // Stirrups: a U, its legs up the web (or each wall of a box) from the bottom cover, into the deck where they project.
  const H = shape.depth;
  const box = shape.family === "Prestressed box";
  const stations = stirrupStations(i, Lg);
  if (shape.family === "CDOT Colorado Bulb Tee") {
    out.push(...cbtBars(host, i, shape, stations, Lg, layout));
    return out;
  }
  const bySize = new Map<string, { bar: number; legs: number; zs: number[] }>();
  for (const s of stations) {
    const k = `${s.bar}:${s.legs}`;
    const g = bySize.get(k) ?? { bar: s.bar, legs: s.legs, zs: [] };
    g.zs.push(s.z);
    bySize.set(k, g);
  }
  for (const g of bySize.values()) {
    const db = barDiameter(g.bar);
    const cover = 1.5;
    const xLeg = box ? shape.topWidth / 2 - cover - db / 2 : shape.web / 2 - cover - db / 2;
    const yBot = cover + db / 2;
    const yTop = i.stirrupsIntoDeck ? H + (i.haunch ?? 0) + deckT - 2.5 : H - cover;
    const hook = i.stirrupsIntoDeck ? Math.min(6, hookLeg(g.bar).leg) : 0;
    const leg = (side: 1 | -1): V3[] => (hook > 0 ? [p3(ft(side * (xLeg + hook)), ft(yTop), 0), p3(ft(side * xLeg), ft(yTop), 0)] : [p3(ft(side * xLeg), ft(yTop), 0)]);
    const path: V3[] = [...leg(-1), p3(ft(-xLeg), ft(yBot), 0), p3(ft(xLeg), ft(yBot), 0), ...leg(1).reverse()];
    out.push({ host, frame: "host", mark: "", size: g.bar, dia: db, role: "stirrup", label: `#${g.bar} stirrups (${g.legs} legs)`, path, at: g.zs.map((z) => p3(0, 0, z)), placed: "design" });
  }
  return out;
}

/** Welded wire's diameters (in): D20, D11, D8 deformed wires and the W5 spiral. */
const WIRE = { D20: 0.505, D11: 0.374, D8: 0.319, W5: 0.252 };

/**
 * A Colorado Bulb Tee's own steel, as CDOT details it (B-618-CBT1; the girder sheets' Girder Elevation, Typical Girder
 * Section and Rebar Detail), in the girder's frame (x across, y up from its bottom, z along from its end; inches here,
 * feet out). At each stirrup place: a #4 hairpin (1½ in radius) projecting 7 in above the girder, its legs D + 5½ in
 * long for the first 20 at each end and 2'-0" elsewhere; a D20 wire up each face of the web (D − 3 in), anchored by D8
 * wire pairs below the primary steel and under the top flange; a D20 across the top flange, at the stirrups or at 1'-0"
 * where they're closer. Along the top flange: 2-D20 at each tip and a continuous D20 each side. In the bottom flange,
 * the #3 (D11) confinement shape with the stirrups for the confinement length (1.5D) from each end. At each end: 2 #6
 * C-bars (D − 4 in, 2'-3" legs) and a W5 spiral (5 in, 4 in pitch) round the harped strands.
 */
function cbtBars(host: number, i: GirderInputs, shape: ReturnType<typeof girderShape>, stations: { z: number; bar: number }[], Lg: number, layout: ReturnType<typeof strandLayout>): BarSet3D[] {
  const out: BarSet3D[] = [];
  const H = shape.depth;
  const p = shape.profile; // [y, half-width] from the bottom
  const cov = 1.5;
  const half = (y: number) => {
    for (let k = 0; k < p.length - 1; k++) if (y >= p[k][0] && y <= p[k + 1][0]) return p[k][1] + ((p[k + 1][1] - p[k][1]) * (y - p[k][0])) / Math.max(1e-9, p[k + 1][0] - p[k][0]);
    return p[p.length - 1][1];
  };
  const set = (size: number, dia: number, role: BarRole, label: string, path: V3[], at: V3[]): BarSet3D => ({ host, frame: "host", mark: "", size, dia, role, label, path, at, placed: "design" });
  const P = (x: number, y: number, z = 0) => p3(ft(x), ft(y), ft(z));
  const zs = stations.map((s) => s.z);
  const web = shape.web / 2;
  const tf = H - p[p.length - 2][0]; // the top flange's edge thickness
  const bfEdge = p[1][0]; // the bottom flange's edge height
  const bfTop = p[2][0]; // where its slope meets the web's fillet
  // #4 hairpins: the first 20 at each end full depth, the rest 2'-0".
  const top = H + 7;
  const hp = 1.5;
  const near = new Set([...zs.slice(0, 20), ...zs.slice(-20)]);
  const bend = (y0: number): V3[] => {
    const arc = Array.from({ length: 7 }, (_, k) => {
      const t = Math.PI - (Math.PI * k) / 6;
      return P(hp * Math.cos(t), top - hp + hp * Math.sin(t));
    });
    return [P(-hp, y0), ...arc, P(hp, y0)];
  };
  const db4 = barDiameter(4);
  const full = zs.filter((z) => near.has(z));
  const short = zs.filter((z) => !near.has(z));
  if (full.length) out.push(set(4, db4, "stirrup", "#4 hairpins, D + 5½ in (the first 20 at each end)", bend(top - (H + 5.5)), full.map((z) => p3(0, 0, z))));
  if (short.length) out.push(set(4, db4, "stirrup", "#4 hairpins, 2'-0\"", bend(top - 24), short.map((z) => p3(0, 0, z))));
  // D20 web wires each face, D − 3 in; D8 anchor wire pairs along the girder at their feet and heads.
  const xw = web - cov - WIRE.D20 / 2;
  for (const s of [-1, 1]) out.push(set(4, WIRE.D20, "stirrup", "D20 wires, each face of the web (D − 3 in)", [P(s * xw, cov), P(s * xw, H - cov)], zs.map((z) => p3(0, 0, z))));
  const xa = xw - WIRE.D20 / 2 - WIRE.D8 / 2;
  for (const y of [cov + WIRE.D8 / 2, H - tf - 1])
    out.push(set(3, WIRE.D8, "main", "D8 anchor wire pairs", [P(0, y, 1), P(0, y, Lg * 12 - 1)], [-1, 1].map((s) => P(s * xa, 0))));
  // Across the top flange: D20 at the stirrups, or at 1'-0" where they're closer.
  const yT = H - cov - WIRE.D20 / 2;
  const across: number[] = [];
  for (const z of zs) if (!across.length || z - across[across.length - 1] >= 1 - 1e-6) across.push(z);
  const xt = shape.topWidth / 2 - cov;
  out.push(set(4, WIRE.D20, "main", "D20 across the top flange", [P(-xt, yT), P(xt, yT)], across.map((z) => p3(0, 0, z))));
  // Along the top flange, under them: 2-D20 at each tip, a continuous D20 each side (the sheet's places).
  const yL = yT - WIRE.D20;
  const tips = [xt - WIRE.D20 / 2, xt - 2.5];
  const cont = [9.1, 15.3].filter((x) => x < tips[1] - 2);
  out.push(set(4, WIRE.D20, "main", "2-D20 (or #6) at each flange tip", [P(0, yL, 1), P(0, yL, Lg * 12 - 1)], tips.flatMap((x) => [P(-x, 0), P(x, 0)])));
  if (cont.length) out.push(set(4, WIRE.D20, "main", "D20 continuous, top flange", [P(0, yL, 1), P(0, yL, Lg * 12 - 1)], cont.flatMap((x) => [P(-x, 0), P(x, 0)])));
  // Confinement in the bottom flange: #3 (or D11) with the stirrups, over its length from each end.
  const cf = i.confinement ?? { bar: 3, spacing: 6, length: 12 };
  const inConf = zs.filter((z) => z <= cf.length + 1e-6 || z >= Lg - cf.length - 1e-6);
  if (inConf.length) {
    const d3 = barDiameter(cf.bar);
    const yb = cov + d3 / 2;
    const hw = half(0) - cov - d3 / 2;
    const ye = bfEdge - cov;
    const yt = bfTop - cov;
    const xi = 3.75; // its top, 7½ in wide
    const shapePts: V3[] = [P(-hw, ye - 2 * d3), P(-hw, yb), P(hw, yb), P(hw, ye), P(xi, yt), P(-xi, yt), P(-hw, ye)];
    out.push(set(cf.bar, d3, "stirrup", `#${cf.bar} (D11) confinement in the bottom flange, ${cf.length} ft from each end`, shapePts, inConf.map((z) => p3(0, 0, z))));
  }
  // At each end: 2 #6 C-bars, D − 4 in, legs 2'-3" into the girder, one each side of the web, 2 in from the end.
  const d6 = barDiameter(6);
  const x6 = web - cov - WIRE.D20 - d6 / 2;
  for (const [z0, dir] of [[2, 1], [Lg * 12 - 2, -1]] as const) {
    const y0 = (H - (H - 4)) / 2;
    const c: V3[] = [P(0, y0, z0 + dir * 27), P(0, y0, z0), P(0, H - y0, z0), P(0, H - y0, z0 + dir * 27)];
    out.push(set(6, d6, "main", "#6 end bars (tot 2 each end), D − 4 in, 2'-3\" legs", c, [-1, 1].map((s) => P(s * x6, 0))));
  }
  // The W5 spiral round the harped strands at each end: 5 in, 4 in pitch, from below the lowest to above the highest.
  const harped = layout.strands.filter((s) => s.kind === "harped");
  if (harped.length) {
    const ys = harped.map((s) => strandY(s, layout, 0));
    const [y0, y1] = [Math.max(cov, Math.min(...ys) - 2), Math.min(H - cov, Math.max(...ys) + 2)];
    const r = (5 - WIRE.W5) / 2;
    for (const zc of [3.5, Lg * 12 - 3.5]) {
      const hx = helix(ft(r), ft(y0), ft(y1), ft(4)).map(([x, y, z]) => p3(x, z, y + ft(zc)));
      out.push(set(2, WIRE.W5, "spiral", "W5 spiral (5 in, 4 in pitch) round the harped strands", hx, [p3(0, 0, 0)]));
    }
  }
  return out;
}

// --- pier caps ----------------------------------------------------------------------------------------------------

/** A cap's bars from its strut-and-tie detailing, in its element's frame (x along the cap from its middle, y across, z up from the soffit). */
export function capBars(host: number, e: IfcElement, i: StmInputs): BarSet3D[] {
  if (!i.template) return [];
  const d = detailCap(i);
  const L = d.length;
  const b = i.template.capWidth;
  const X = (x: number) => ft(x - L / 2);
  const Y = (y: number) => ft(y - b / 2);
  const out: BarSet3D[] = [];
  const g = (mark: string) => d.schedule.groups.find((q) => q.mark === mark);
  const soffitAt = (x: number) => {
    const s = d.soffit;
    for (let k = 0; k < s.length - 1; k++) if (x >= s[k][0] && x <= s[k + 1][0]) return s[k][1] + ((s[k + 1][1] - s[k][1]) * (x - s[k][0])) / Math.max(1e-9, s[k + 1][0] - s[k][0]);
    return 0;
  };
  const sec = d.sections[0];
  const yAt = (pts: [number, number][], x: number) => {
    for (let k = 0; k < pts.length - 1; k++) {
      const [a, c] = [pts[k], pts[k + 1]];
      if (x >= Math.min(a[0], c[0]) && x <= Math.max(a[0], c[0]) && Math.abs(c[0] - a[0]) > 1e-9) return a[1] + ((c[1] - a[1]) * (x - a[0])) / (c[0] - a[0]);
    }
    return pts[Math.min(1, pts.length - 1)][1];
  };
  // Longitudinal bars: each layer's or row's path in the elevation, at the places the section puts its bars across.
  for (const bar of d.bars.filter((q) => q.kind !== "column")) {
    const grp = g(bar.mark);
    if (!grp) continue;
    const yHere = yAt(bar.pts as [number, number][], sec.x) - soffitAt(sec.x);
    const across = sec.dots.filter((q) => q.mark === bar.mark && Math.abs(q.y - yHere) < 0.75).map((q) => q.x);
    if (!across.length) continue;
    out.push({
      host,
      frame: "host",
      mark: bar.mark,
      size: grp.size,
      dia: barDiameter(grp.size),
      role: "main",
      label: `${bar.mark} ${grp.use.toLowerCase()} (#${grp.size})`,
      path: bar.pts.map(([x, y]) => p3(X(x), 0, ft(y))),
      at: across.map((x) => p3(0, Y(x), 0)),
      placed: "design",
    });
  }
  // Stirrups: each set's closed hoops at its place, a set per hoop and height.
  const sets = new Map<string, { x0: number; x1: number; y0: number; y1: number; mark: string; xs: number[] }>();
  for (const st of d.stirrups)
    for (const h of sec.hoops) {
      const key = `${h.x0}:${h.x1}:${st.y0}:${st.y1}`;
      const s = sets.get(key) ?? { x0: h.x0, x1: h.x1, y0: st.y0, y1: st.y1, mark: h.mark, xs: [] };
      s.xs.push(st.x);
      sets.set(key, s);
    }
  for (const s of sets.values()) {
    const grp = g(s.mark);
    const size = grp?.size ?? i.template.stirrups.size;
    const path: V3[] = [p3(0, Y(s.x0), ft(s.y0)), p3(0, Y(s.x1), ft(s.y0)), p3(0, Y(s.x1), ft(s.y1)), p3(0, Y(s.x0), ft(s.y1)), p3(0, Y(s.x0), ft(s.y0 + 2))];
    out.push({ host, frame: "host", mark: s.mark, size, dia: barDiameter(size), role: "stirrup", label: `${s.mark} stirrups (#${size})`, path, at: s.xs.map((x) => p3(X(x), 0, 0)), placed: "design" });
  }
  return out;
}

// --- pier columns -------------------------------------------------------------------------------------------------

/** A column's bars in its element's frame (x along the pier line, y across it, z up from its base); `capDepth` ft, `lapIn` in below its base. */
export function columnBars(host: number, e: IfcElement, i: ColumnInputs, capDepth: number, conn?: Connection | null): BarSet3D[] {
  const W = i.shape === "round" ? i.T : i.W;
  const out: BarSet3D[] = [];
  const H = e.depth;
  const prof = e.profile;
  // The design's T runs across the bridge, along the pier line: the element's x, unless its sizes say otherwise.
  const swap = prof.kind === "rect" && Math.abs(prof.x - ft(W)) < Math.abs(prof.x - ft(i.T)) - 1e-6;
  const pos = barPositions({ shape: i.shape, T: i.T, W, cover: i.cover, bar: i.bar, bars: i.bars, barsT: i.barsT, barsL: i.barsL, barsEnd: i.barsEnd, tieBar: i.tieBar, transverse: i.transverse, fc: i.fc, fy: i.fy });
  const db = barDiameter(i.bar);
  const dt = barDiameter(i.tieBar);
  // Below its base: into an oversized shaft its bars lap the shaft's (CDOT BDM Figure 11-13); on an undersized one
  // the shaft's bars come up instead and its own start at the base; on a footing, the dowels' lap (shown as 40 db).
  const lap = conn ? (conn.projecting === "column" ? conn.lap : 0) : 40 * db;
  const top = H + Math.max(0, capDepth - 0.5);
  const leg = ft(hookLeg(i.bar).leg);
  const hl = hingeLegs(i);
  const xy = (p: [number, number]) => (swap ? [ft(p[1]), ft(p[0])] : [ft(p[0]), ft(p[1])]) as [number, number];
  // A flared column: each bar runs up its face's flare (its offset across the bridge scaled from the base's to the
  // top's), straight into the cap; the ties widen with the column, each at its height.
  if (i.shape === "rectangular" && (i.Ttop ?? 0) > 0 && Math.abs((i.Ttop ?? 0) - i.T) > 0.5) {
    const co = i.cover + dt + db / 2;
    const k = (i.Ttop! / 2 - co) / Math.max(1e-9, i.T / 2 - co);
    for (const [x, y] of pos.map((p) => [ft(p[0]), ft(p[1])] as [number, number])) {
      const side = x < 0 ? -1 : 1;
      out.push({ host, frame: "host", mark: "", size: i.bar, dia: db, role: "main", label: `#${i.bar} column bars (along the flare)`, path: [p3(x, y, -ft(lap)), p3(x, y, 0), p3(x * k, y, H), p3(x * k, y, top), p3(x * k - side * leg, y, top)], at: [p3(0, 0, 0)], placed: "design" });
    }
    const ay = ft((W - 2 * i.cover - dt) / 2);
    for (const { z, hinge } of levels()) {
      const nT = Math.max(0, Math.round(hinge ? hl.T : i.legsT) - 2);
      const nL = Math.max(0, Math.round(hinge ? hl.L : i.legsL) - 2);
      const T = i.T + ((i.Ttop! - i.T) * z) / H;
      const ax = ft((T - 2 * i.cover - dt) / 2);
      out.push({ host, frame: "host", mark: "", size: i.tieBar, dia: dt, role: "stirrup", label: `#${i.tieBar} ties (widening)`, path: [p3(-ax, -ay, z), p3(ax, -ay, z), p3(ax, ay, z), p3(-ax, ay, z), p3(-ax, -ay + ft(4), z)], at: [p3(0, 0, 0)], placed: "design" });
      for (let j = 1; j <= nT; j++) out.push({ host, frame: "host", mark: "", size: i.tieBar, dia: dt, role: "stirrup", label: `#${i.tieBar} cross-ties`, path: [p3(-ax, (-1 + (2 * j) / (nT + 1)) * ay, z), p3(ax, (-1 + (2 * j) / (nT + 1)) * ay, z)], at: [p3(0, 0, 0)], placed: "design" });
      for (let j = 1; j <= nL; j++) out.push({ host, frame: "host", mark: "", size: i.tieBar, dia: dt, role: "stirrup", label: `#${i.tieBar} cross-ties`, path: [p3((-1 + (2 * j) / (nL + 1)) * ax, -ay, z), p3((-1 + (2 * j) / (nL + 1)) * ax, ay, z)], at: [p3(0, 0, 0)], placed: "design" });
    }
    return out;
  }
  // The ties' levels: in Seismic Zone 1 with SD1 ≥ 0.10 the hinge regions at their own spacing and legs, from the base
  // (over the lap) and under the cap the larger of the largest dimension, a sixth of the height and 18 in (5.11.4.1.3).
  function levels() {
    const list: { z: number; hinge: boolean }[] = [];
    if (!i.seismic.hinge) {
      for (let z = ft(i.tieSpacing) / 2; z <= H; z += ft(i.tieSpacing)) list.push({ z, hinge: false });
      return list;
    }
    const Lh = Math.max(ft(Math.max(i.T, W)), H / 6, 1.5);
    const bottom = Math.min(H, Math.max(Lh, conn ? 0 : ft(lap)));
    const top = Math.max(bottom, H - Lh);
    const sh = ft(i.seismic.spacing);
    let z = sh / 2;
    for (; z <= bottom; z += sh) list.push({ z, hinge: true });
    for (; z < top; z += ft(i.tieSpacing)) list.push({ z, hinge: false });
    for (; z <= H; z += sh) list.push({ z, hinge: true });
    return list;
  }
  // Hooks turned in toward the column's middle, along the pier line.
  for (const side of [-1, 1]) {
    const these = pos.map(xy).filter(([x]) => (side < 0 ? x < 0 : x >= 0));
    if (!these.length) continue;
    out.push({ host, frame: "host", mark: "", size: i.bar, dia: db, role: "main", label: `#${i.bar} column bars`, path: [p3(0, 0, -ft(lap)), p3(0, 0, top), p3(-side * leg, 0, top)], at: these.map(([x, y]) => p3(x, y, 0)), placed: "design" });
  }
  // Transverse: a spiral (two interlocking in an oblong column), hoops, or closed ties with cross-ties.
  const spacing = ft(i.tieSpacing);
  const lv = levels();
  const zs = lv.map((l) => l.z);
  if (i.transverse === "spiral") {
    const r = ft((W - 2 * i.cover - dt) / 2);
    const centers = i.shape === "round" ? [0] : [-ft((i.T - W) / 2), ft((i.T - W) / 2)];
    for (const c of centers) out.push({ host, frame: "host", mark: "", size: i.tieBar, dia: dt, role: "spiral", label: `#${i.tieBar} spiral`, path: helix(r, 0, H, spacing, swap ? 0 : c).map((p) => (swap ? p3(p[1], p[0] + c, p[2]) : p)), at: [p3(0, 0, 0)], placed: "design" });
  } else if (i.shape === "round") {
    out.push({ host, frame: "host", mark: "", size: i.tieBar, dia: dt, role: "stirrup", label: `#${i.tieBar} hoops`, path: circle(ft((i.T - 2 * i.cover - dt) / 2)), at: zs.map((z) => p3(0, 0, z)), placed: "design" });
  } else {
    const [a, c] = [ft((i.T - 2 * i.cover - dt) / 2), ft((W - 2 * i.cover - dt) / 2)];
    const [ax, ay] = swap ? [c, a] : [a, c];
    out.push({ host, frame: "host", mark: "", size: i.tieBar, dia: dt, role: "stirrup", label: `#${i.tieBar} ties`, path: [p3(-ax, -ay, 0), p3(ax, -ay, 0), p3(ax, ay, 0), p3(-ax, ay, 0), p3(-ax, -ay + ft(4), 0)], at: zs.map((z) => p3(0, 0, z)), placed: "design" });
    // Cross-ties: the legs beyond the tie's two, evenly between, each way.
    const cross = (n: number, alongX: boolean, at: number[]) => {
      for (let k = 1; k <= n && at.length; k++) {
        const t = -1 + (2 * k) / (n + 1);
        const path = alongX ? [p3(-ax, t * ay, 0), p3(ax, t * ay, 0)] : [p3(t * ax, -ay, 0), p3(t * ax, ay, 0)];
        out.push({ host, frame: "host", mark: "", size: i.tieBar, dia: dt, role: "stirrup", label: `#${i.tieBar} cross-ties`, path, at: at.map((z) => p3(0, 0, z)), placed: "design" });
      }
    };
    // Each level its own legs: the hinge regions' and the column's between them. Legs across the bridge run along T (the pier line).
    for (const hinge of [false, true]) {
      const at = lv.filter((l) => l.hinge === hinge).map((l) => l.z);
      const [nT, nL] = [Math.max(0, Math.round(hinge ? hl.T : i.legsT) - 2), Math.max(0, Math.round(hinge ? hl.L : i.legsL) - 2)];
      cross(swap ? nL : nT, !swap, at);
      cross(swap ? nT : nL, swap, at);
    }
  }
  return out;
}

// --- drilled shafts -----------------------------------------------------------------------------------------------

/** A shaft's cage in its element's frame (x along the pier line, z down from its top). */
export function shaftBars(host: number, e: IfcElement, i: ShaftInputs, conn?: Connection | null): BarSet3D[] {
  // Smaller than its column: its bars run up into the column by the noncontact lap (CDOT BDM Figure 11-13).
  const up = conn?.projecting === "shaft" ? -ft(conn.lap) : ft(3);
  const L = e.depth;
  const db = barDiameter(i.bar);
  const dt = barDiameter(i.tieBar);
  const R = ft(i.D / 2 - i.cover - dt - db / 2);
  const n = Math.max(1, Math.round(i.bars));
  const at = Array.from({ length: n }, (_, k) => p3(R * Math.cos((2 * Math.PI * k) / n), R * Math.sin((2 * Math.PI * k) / n), 0));
  return [
    { host, frame: "host", mark: "", size: i.bar, dia: db, role: "main", label: `${n} #${i.bar} shaft bars`, path: [p3(0, 0, up), p3(0, 0, L - ft(3))], at, placed: "design" },
    { host, frame: "host", mark: "", size: i.tieBar, dia: dt, role: "spiral", label: `#${i.tieBar} spiral @ ${i.pitch} in`, path: helix(ft(i.D / 2 - i.cover - dt / 2), ft(3), L - ft(3), ft(i.pitch)), at: [p3(0, 0, 0)], placed: "design" },
  ];
}

// --- the schematic sets -------------------------------------------------------------------------------------------

/** The IFC model's schematic sets (world coordinates) as 3D sets. */
export function schematicBars(host: number, sets: IfcBarSet[]): BarSet3D[] {
  return sets.map((s) => {
    const { origin, u, v, step, drawn } = s.at;
    const path = s.path.map(([a, b]) => p3(origin[0] + u[0] * a + v[0] * b, origin[1] + u[1] * a + v[1] * b, origin[2] + u[2] * a + v[2] * b));
    const at = Array.from({ length: drawn }, (_, k) => p3(step[0] * k, step[1] * k, step[2] * k));
    const role: BarRole = s.role === "RING" ? "spiral" : s.role === "SHEAR" || s.role === "LIGATURE" ? "stirrup" : "main";
    return { host, frame: "world", mark: s.mark, size: s.size, dia: s.diameter, role, label: `${s.mark} ${s.use.toLowerCase()} (#${s.size})`, path, at, placed: "schematic" };
  });
}

/** An element's placement frame: origin, x (across its profile), y (up its profile), z (its sweep). */
export function elementFrame(e: Pick<IfcElement, "origin" | "xdir" | "zdir">): { o: V3; x: V3; y: V3; z: V3 } {
  const n = (a: V3): V3 => {
    const l = Math.hypot(...a) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  };
  const z = n(e.zdir);
  const d = e.xdir[0] * z[0] + e.xdir[1] * z[1] + e.xdir[2] * z[2];
  const x = n([e.xdir[0] - z[0] * d, e.xdir[1] - z[1] * d, e.xdir[2] - z[2] * d]);
  const y: V3 = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  return { o: e.origin, x, y, z };
}
