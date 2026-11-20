import { barDiameter } from "./ifc-rebar";
import type { IfcElement, V3 } from "./ifc";
import { hookLeg } from "../rebar/bars";
import type { BarRole, BarSet3D } from "./rebar3d";

// Phase 2 of the Rebar view's placement (rebar3d.ts has phase 1): the deck and its rails, abutments, approach
// slabs, wingwalls, footings and pile caps, each bar where its design's detailing puts it. Feet.

const ft = (inch: number) => inch / 12;
const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
const p3 = (x: number, y: number, z: number): V3 => [r4(x), r4(y), r4(z)];
const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const dist3 = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const down = (p: V3, d: number): V3 => [p[0], p[1], p[2] - d];

/** A polyline trimmed by `a` ft at its start and `b` at its end (the clear cover to the concrete's edges). */
export function trim(pts: V3[], a: number, b: number): V3[] {
  const cut = (q: V3[], d: number) => {
    let left = d;
    for (let k = 0; k < q.length - 1; k++) {
      const s = dist3(q[k], q[k + 1]);
      if (s > left) return [lerp3(q[k], q[k + 1], left / s), ...q.slice(k + 1)];
      left -= s;
    }
    return q.slice(-1);
  };
  const out = a > 0 ? cut(pts, a) : pts;
  return b > 0 ? cut([...out].reverse(), b).reverse() : out;
}
/** Evenly spaced places from `a` to `b`, `s` apart from `a` (the last within `b`). */
export function stations(a: number, b: number, s: number): number[] {
  if (!(b >= a) || !(s > 0)) return [];
  const n = Math.floor((b - a) / s + 1e-9);
  return Array.from({ length: n + 1 }, (_, k) => a + k * s);
}
const world = (host: number, size: number, role: BarRole, label: string, path: V3[]): BarSet3D => ({ host, frame: "world", mark: "", size, dia: barDiameter(size), role, label, path: path.map((q) => p3(q[0], q[1], q[2])), at: [p3(0, 0, 0)], placed: "design" });
const local = (host: number, size: number, role: BarRole, label: string, path: V3[], at: V3[]): BarSet3D => ({ host, frame: "host", mark: "", size, dia: barDiameter(size), role, label, path, at, placed: "design" });

type Bars = { bar: number; spacing: number };
export type DeckBarInputs = { t: number; coverTop: number; coverBot: number; topBars: Bars; botBars: Bars; topLong: Bars; botLong: Bars; overhang: number; overhangBars?: Bars | null; panels?: boolean; nGirders?: number; S?: number; flange?: number };

/**
 * A deck span's bars on its top surface (the IFC deck's grid): the transverse mats parallel to the skew when it's
 * 25° or less, else square to the girders (BDM 9.8.1, AASHTO 9.7.1.3); the longitudinal mats along the span inside
 * them; 2 in clear to the edges and the deck's ends (BDM 4.8; none at a pier, where the bars carry on); the
 * overhangs' hairpins at the edges. Each bar follows the deck's crown and profile at its depth below the top.
 */
export function deckBars(host: number, grid: NonNullable<IfcElement["grid"]>, i: DeckBarInputs, skew: number, ends: { start: boolean; end: boolean }): BarSet3D[] {
  const { top } = grid;
  const n = top.length;
  const m = top[0]?.length ?? 0;
  if (n < 2 || m < 2) return [];
  const c = ft(2);
  const out: BarSet3D[] = [];
  const dbT = barDiameter(i.topBars.bar);
  const dbB = barDiameter(i.botBars.bar);
  const dTop = ft(i.coverTop + dbT / 2);
  const dTopL = ft(i.coverTop + dbT + barDiameter(i.topLong.bar) / 2);
  const dBot = ft(i.t - i.coverBot - dbB / 2);
  const dBotL = ft(i.t - i.coverBot - dbB - barDiameter(i.botLong.bar) / 2);
  // A column's point at u (0–1) along it, its rows evenly spaced along it.
  const colAt = (j: number, u: number): V3 => {
    const f = Math.min(Math.max(u, 0), 1) * (n - 1);
    const k = Math.min(n - 2, Math.floor(f));
    return lerp3(top[k][j], top[k + 1][j], f - k);
  };
  const colLength = (j: number) => top.slice(1).reduce((s, row, k) => s + dist3(row[j], top[k][j]), 0);
  const mid = Math.floor(m / 2);
  const Lm = colLength(mid);
  const label = (b: Bars, what: string) => `#${b.bar} @ ${b.spacing} in, ${what}`;
  const along = (b: Bars) => stations(ends.start ? c : ft(b.spacing) / 2, Lm - (ends.end ? c : ft(b.spacing) / 2), ft(b.spacing));

  // Transverse bars, top and bottom mats.
  const parallel = skew <= 25 + 1e-9;
  const transverse = (b: Bars, depth: number, what: string) => {
    for (const s of along(b)) {
      let pts: V3[];
      if (parallel) pts = Array.from({ length: m }, (_, j) => colAt(j, s / Lm));
      else {
        // Square to the girders: a constant station across, each column's place at it.
        const S = grid.stA[mid] + ((grid.stB[mid] - grid.stA[mid]) * s) / Lm;
        pts = [];
        for (let j = 0; j < m; j++) {
          const u = (S - grid.stA[j]) / (grid.stB[j] - grid.stA[j]);
          if (u >= 0 && u <= 1) pts.push(colAt(j, u));
        }
      }
      if (pts.length < 2) continue;
      if (onlyOverhangs) {
        // On precast panels: the bottom bars only from each edge to the exterior girder's centerline.
        const len = pts.slice(1).reduce((sum, q, k) => sum + dist3(q, pts[k]), 0);
        const reach = (i.overhang / Math.max(1e-9, Wd)) * len; // the overhang along this bar
        for (const piece of [trim(pts, c, len - reach), trim(pts, len - reach, c)])
          if (piece.length > 1) out.push(world(host, b.bar, "main", label(b, `${what} (overhangs)`), piece.map((q) => down(q, depth))));
      } else out.push(world(host, b.bar, "main", label(b, what), trim(pts, c, c).map((q) => down(q, depth))));
    }
  };
  // The deck's width across its top (the grid's first row), for the overhangs' share of a bar.
  const Wd = top[0].slice(1).reduce((sum, q, j) => sum + dist3(q, top[0][j]), 0);
  const panels = !!i.panels && (i.nGirders ?? 0) > 1 && (i.S ?? 0) > 0;
  let onlyOverhangs = false;
  transverse(i.topBars, dTop, "transverse, top");
  onlyOverhangs = panels;
  transverse(i.botBars, dBot, "transverse, bottom");
  onlyOverhangs = false;

  // Longitudinal bars: at offsets across the deck, along the rows from one support line to the other.
  const across = [0];
  for (let j = 1; j < m; j++) across.push(across[j - 1] + dist3(top[0][j], top[0][j - 1]));
  const W = across[m - 1];
  const at = (x: number, k: number): V3 => {
    let j = 0;
    while (j < m - 2 && across[j + 1] < x) j++;
    return lerp3(top[k][j], top[k][j + 1], (x - across[j]) / Math.max(1e-9, across[j + 1] - across[j]));
  };
  const longitudinalAt = (b: Bars, depth: number, what: string, xs: number[]) => {
    for (const x of xs) {
      const pts = Array.from({ length: n }, (_, k) => at(x, k));
      out.push(world(host, b.bar, "main", what, trim(pts, ends.start ? c : 0, ends.end ? c : 0).map((q) => down(q, depth))));
    }
  };
  const longitudinal = (b: Bars, depth: number, what: string) => longitudinalAt(b, depth, label(b, what), stations(c, W - c, ft(b.spacing)));
  longitudinal(i.topLong, dTopL, "longitudinal, top");
  if (panels) {
    // On precast panels: the bottom bars in the overhangs (edge to the flange) and 3 over each girder (CDOT's panel details).
    const b = i.botLong;
    const reach = i.overhang - ft(i.flange ?? 0) / 2;
    const xs = stations(c, reach, ft(b.spacing));
    longitudinalAt(b, dBotL, label(b, "longitudinal, bottom (overhangs)"), [...xs, ...xs.map((x) => W - x)]);
    const g: number[] = [];
    for (let k = 0; k < i.nGirders!; k++) for (const dx of [-0.5, 0, 0.5]) g.push(i.overhang + k * i.S! + dx);
    longitudinalAt(b, dBotL, `3 #${b.bar} over each girder`, g);
  } else longitudinal(i.botLong, dBotL, "longitudinal, bottom");

  // The overhangs' hairpins: a top and a bottom leg from the edge to the exterior girder's centerline, closed at the edge.
  if (i.overhangBars && i.overhangBars.spacing > 0) {
    const b = i.overhangBars;
    const reach = i.overhang - c;
    for (const s of along(b))
      for (const side of [0, 1]) {
        const u = s / Lm;
        const edge = side === 0 ? colAt(0, u) : colAt(m - 1, u);
        const inner = side === 0 ? colAt(1, u) : colAt(m - 2, u);
        const dir = (q: number): V3 => lerp3(edge, inner, q / Math.max(1e-9, dist3(edge, inner)));
        const [p0, p1] = [dir(c), dir(c + reach)];
        const zt = dTop + ft(dbT);
        const zb = dBot - ft(dbB);
        out.push(world(host, b.bar, "main", `#${b.bar} @ ${b.spacing} in, overhang hairpins`, [down(p1, zt), down(p0, zt), down(p0, zb), down(p1, zb)]));
      }
  }
  return out;
}

export type RailBarDef = { bars: { size: number; spacing: number | null; path: [number, number][]; use: string; endZone?: { spacing: number; length: number } }[]; longitudinal: { size: number; at: [number, number][] } };

/** A barrier's bars along its sweep: each bar of the rail's worksheet at its spacing (closer in the end zones), the longitudinal bars continuous; `intoDeck` (in) how far its legs go below the deck's top. */
export function railBars(host: number, sweep: NonNullable<IfcElement["sweep"]>, def: RailBarDef, intoDeck: number): BarSet3D[] {
  if (sweep.length < 2) return [];
  const out: BarSet3D[] = [];
  const along = [0];
  for (let k = 1; k < sweep.length; k++) along.push(along[k - 1] + dist3(sweep[k].p, sweep[k - 1].p));
  const L = along[along.length - 1];
  const frameAt = (s: number) => {
    let k = 0;
    while (k < sweep.length - 2 && along[k + 1] < s) k++;
    const t = (s - along[k]) / Math.max(1e-9, along[k + 1] - along[k]);
    const [a, b] = [sweep[k], sweep[k + 1]];
    return { p: lerp3(a.p, b.p, t), u: lerp3(a.u, b.u, t), v: lerp3(a.v, b.v, t) };
  };
  const place = (f: ReturnType<typeof frameAt>, x: number, y: number): V3 => [f.p[0] + f.u[0] * x + f.v[0] * y, f.p[1] + f.u[1] * x + f.v[1] * y, f.p[2] + f.u[2] * x + f.v[2] * y];
  const c = ft(2);
  for (const b of def.bars) {
    if (!b.spacing) continue;
    const places = new Set<number>(stations(c, L - c, ft(b.spacing)).map((x) => Math.round(x * 1000) / 1000));
    if (b.endZone) {
      const zone = stations(c, Math.min(L / 2, ft(b.endZone.length)), ft(b.endZone.spacing));
      for (const x of [...zone, ...zone.map((x) => L - x)]) places.add(Math.round(x * 1000) / 1000);
    }
    for (const x of places) {
      const f = frameAt(x);
      out.push(world(host, b.size, "stirrup", `#${b.size} ${b.use.toLowerCase()}`, b.path.map(([px, py]) => place(f, px, py <= 0 ? -intoDeck : py))));
    }
  }
  const runAt = [...stations(0, L, Math.max(L / 40, 1)), L];
  for (const [x, y] of def.longitudinal.at) out.push(world(host, def.longitudinal.size, "main", `#${def.longitudinal.size} rail, longitudinal`, trim(runAt.map((s) => place(frameAt(s), x, y)), c, c)));
  return out;
}

const spread = (a: number, b: number, n: number) => (n <= 1 ? [(a + b) / 2] : Array.from({ length: n }, (_, k) => a + ((b - a) * k) / (n - 1)));

export type AbutmentBarInputs = {
  footT: number;
  capTop: { bar: number; count: number };
  capBot: { bar: number; count: number };
  stirrup: Bars;
  diaphragmBars: Bars;
  stemBars: Bars;
  backwallBars: Bars;
  toeBars: Bars;
  heelBars: Bars;
  // A seat abutment's other bars (foundations/detail.ts takes #5 @ 12 in where they aren't given).
  stemFrontBars?: Bars;
  stemHorizBars?: Bars;
  seatTop?: { bar: number; count: number };
  seatU?: Bars;
  footLongTop?: Bars;
  footLongBot?: Bars;
};

/**
 * An abutment element's bars from the abutment design's detailing (foundations/detail.ts), in its frame (x along
 * the abutment, y across it, z up): an integral abutment's cap (top and bottom bars, closed stirrups) and end
 * diaphragm (horizontal bars each face); a seat abutment's stem (the back face's vertical bars, hooked into the
 * footing toward the toe), backwall (vertical bars each face, 2 ft into the stem) and footing (bottom and top bars
 * across it). `back` is the side (±1 in y) toward the approach.
 */
export function abutmentBars(host: number, e: IfcElement, which: "cap" | "diaphragm" | "stem" | "backwall" | "footing", i: AbutmentBarInputs, back: 1 | -1): BarSet3D[] {
  if (e.profile.kind !== "rect") return [];
  const X = e.profile.x;
  const Y = e.profile.y;
  const Z = e.depth;
  const c = ft(2);
  const db = (b: number) => ft(barDiameter(b));
  const alongX = (cover: number, s: number) => stations(-X / 2 + cover, X / 2 - cover, s);
  if (which === "cap") {
    const ds = db(i.stirrup.bar);
    const inY = (b: number, cover: number) => Y / 2 - ft(cover) - ds - db(b) / 2;
    const run = (b: { bar: number; count: number }, cover: number, z: number, what: string) =>
      local(host, b.bar, "main", `${b.count} #${b.bar} cap, ${what}`, [p3(-X / 2 + c, 0, 0), p3(X / 2 - c, 0, 0)], spread(-inY(b.bar, cover), inY(b.bar, cover), b.count).map((y) => p3(0, y, z)));
    const [y0, z0, z1] = [Y / 2 - ft(3), ft(3), Z - ft(3)];
    return [
      run(i.capTop, 2, Z - ft(2) - ds - db(i.capTop.bar) / 2, "top"),
      run(i.capBot, 3, ft(3) + ds + db(i.capBot.bar) / 2, "bottom"),
      local(host, i.stirrup.bar, "stirrup", `#${i.stirrup.bar} cap stirrups @ ${i.stirrup.spacing} in`, [p3(0, -y0, z0), p3(0, y0, z0), p3(0, y0, z1), p3(0, -y0, z1), p3(0, -y0, z0 + ft(4))], alongX(c, ft(i.stirrup.spacing)).map((x) => p3(x, 0, 0))),
    ];
  }
  if (which === "diaphragm") {
    const b = i.diaphragmBars;
    const zs = stations(c, Z - c, ft(b.spacing));
    return [-1, 1].map((side) => local(host, b.bar, "main", `#${b.bar} @ ${b.spacing} in diaphragm, each face`, [p3(-X / 2 + c, 0, 0), p3(X / 2 - c, 0, 0)], zs.map((z) => p3(0, side * (Y / 2 - c - db(b.bar) / 2), z))));
  }
  if (which === "stem") {
    const b = i.stemBars;
    const f = i.stemFrontBars ?? { bar: 5, spacing: 12 };
    const h = i.stemHorizBars ?? { bar: 5, spacing: 12 };
    const zBot = -i.footT + ft(3);
    // The vertical bars on each face, hooked in the footing toward the toe.
    const vertical = (v: Bars, face: number, what: string) => {
      const leg = ft(hookLeg(v.bar).leg);
      return local(host, v.bar, "main", `#${v.bar} @ ${v.spacing} in stem, ${what}`, [p3(0, -back * leg, zBot), p3(0, 0, zBot), p3(0, 0, Z - c)], alongX(c, ft(v.spacing)).map((x) => p3(x, face * (Y / 2 - c - db(v.bar) / 2), 0)));
    };
    const out = [vertical(b, back, "back face"), vertical(f, -back, "front face")];
    // The horizontal bars inside the verticals, each face.
    const zs = stations(c, Z - c, ft(h.spacing));
    for (const [v, face] of [[b, back], [f, -back]] as const)
      out.push(local(host, h.bar, "main", `#${h.bar} @ ${h.spacing} in stem, horizontal each face`, [p3(-X / 2 + c, 0, 0), p3(X / 2 - c, 0, 0)], zs.map((z) => p3(0, face * (Y / 2 - c - db(v.bar) - db(h.bar) / 2), z))));
    // The seat: U bars over the top with 2 ft legs down each face; the continuous bars inside them.
    const zTop = Z - c;
    if (i.seatU && i.seatU.spacing > 0) {
      const u = i.seatU;
      const y0 = Y / 2 - c - db(u.bar) / 2;
      out.push(local(host, u.bar, "stirrup", `#${u.bar} @ ${u.spacing} in seat U bars`, [p3(0, -y0, zTop - 2), p3(0, -y0, zTop), p3(0, y0, zTop), p3(0, y0, zTop - 2)], alongX(c, ft(u.spacing)).map((x) => p3(x, 0, 0))));
    }
    if (i.seatTop && i.seatTop.count > 0) {
      const t = i.seatTop;
      const inside = i.seatU ? db(i.seatU.bar) : 0;
      const yy = Y / 2 - c - inside - db(t.bar) / 2;
      out.push(local(host, t.bar, "main", `${t.count} #${t.bar} seat, continuous`, [p3(-X / 2 + c, 0, 0), p3(X / 2 - c, 0, 0)], spread(-yy, yy, t.count).map((y) => p3(0, y, zTop - inside - db(t.bar) / 2))));
    }
    return out;
  }
  if (which === "backwall") {
    const b = i.backwallBars;
    return [-1, 1].map((side) => local(host, b.bar, "main", `#${b.bar} @ ${b.spacing} in backwall, each face`, [p3(0, 0, -ft(24)), p3(0, 0, Z - c)], alongX(c, ft(b.spacing)).map((x) => p3(x, side * (Y / 2 - c - db(b.bar) / 2), 0))));
  }
  const across = ([[i.toeBars, ft(3) + db(i.toeBars.bar) / 2, "bottom"], [i.heelBars, Z - c - db(i.heelBars.bar) / 2, "top"]] as const).map(([b, z, what]) =>
    local(host, b.bar, "main", `#${b.bar} @ ${b.spacing} in footing, ${what}`, [p3(0, -Y / 2 + ft(3), z), p3(0, Y / 2 - ft(3), z)], alongX(ft(3), ft(b.spacing)).map((x) => p3(x, 0, 0))),
  );
  // Along the abutment, inside the bars across it, top and bottom.
  const lt = i.footLongTop ?? { bar: 5, spacing: 12 };
  const lb = i.footLongBot ?? { bar: 5, spacing: 12 };
  const along = ([[lb, ft(3) + db(i.toeBars.bar) + db(lb.bar) / 2, "bottom"], [lt, Z - c - db(i.heelBars.bar) - db(lt.bar) / 2, "top"]] as const).map(([b, z, what]) =>
    local(host, b.bar, "main", `#${b.bar} @ ${b.spacing} in footing, ${what}, along the abutment`, [p3(-X / 2 + ft(3), 0, z), p3(X / 2 - ft(3), 0, z)], stations(-Y / 2 + ft(3), Y / 2 - ft(3), ft(b.spacing)).map((y) => p3(0, y, 0))),
  );
  return [...across, ...along];
}

export type ApproachBarInputs = { t: number; coverTop: number; coverBot: number; mainBars: Bars; distBars: Bars; topLong: Bars; topTrans: Bars; dowels: Bars; dowelSlab: number; dowelAbut: number; dowelHook: number };

/**
 * An approach slab's bars (approach-slab-detail.ts) on its top (the IFC slab's grid: rows from the abutment out,
 * columns across, on the roadway's crown and profile), each at its depth below the top, 2 in clear to the edges:
 * the main bars along the roadway at the bottom, the distribution bars across them, the top bars along the roadway
 * turned down both ends, the top transverse bars, and the anchorage bars from the slab into the abutment, turned down.
 */
export function approachBars(host: number, grid: NonNullable<IfcElement["grid"]>, i: ApproachBarInputs): BarSet3D[] {
  const { top } = grid;
  const n = top.length;
  const m = top[0]?.length ?? 0;
  if (n < 2 || m < 2) return [];
  const c = ft(2);
  const db = (b: number) => ft(barDiameter(b));
  const plan = (p: V3, q: V3) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  const L = plan(top[0][0], top[n - 1][0]); // out from the abutment, square to it
  // Across each row: the columns' distances from its left end (along the abutment).
  const across = top.map((row) => row.reduce<number[]>((acc, q, j) => (j === 0 ? [0] : [...acc, acc[j - 1] + plan(q, row[j - 1])]), []));
  const W = across[0][m - 1];
  // A point on the top at u along the abutment (from the left) and v out from the abutment (negative: into it).
  const onRow = (k: number, u: number): V3 => {
    const a = across[k];
    let j = 0;
    while (j < m - 2 && a[j + 1] < u) j++;
    return lerp3(top[k][j], top[k][j + 1], (u - a[j]) / Math.max(1e-9, a[j + 1] - a[j]));
  };
  const surf = (u: number, v: number): V3 => {
    const f = (v / L) * (n - 1);
    const k = Math.min(n - 2, Math.max(0, Math.floor(f)));
    return lerp3(onRow(k, u), onRow(k + 1, u), f - k); // straight on past the ends (into the abutment)
  };
  const rowV = (k: number) => (L * k) / (n - 1);
  // Along the roadway at u, from v0 to v1, through each row between (it follows the grade).
  const alongPath = (u: number, v0: number, v1: number, depth: number) => [v0, ...Array.from({ length: n }, (_, k) => rowV(k)).filter((v) => v > v0 + 1e-6 && v < v1 - 1e-6), v1].map((v) => down(surf(u, v), depth));
  // Across at v, edge to edge, through each column (it follows the crown).
  const acrossPath = (v: number, depth: number) => {
    const us = [c, ...across[0].filter((u) => u > c + 1e-6 && u < W - c - 1e-6), W - c];
    return us.map((u) => down(surf(u, v), depth));
  };
  const T = ft(i.t);
  const dMain = T - ft(i.coverBot) - db(i.mainBars.bar) / 2;
  const dDist = T - ft(i.coverBot) - db(i.mainBars.bar) - db(i.distBars.bar) / 2;
  const dTopT = ft(i.coverTop) + db(i.topTrans.bar) / 2;
  const dTopL = ft(i.coverTop) + db(i.topTrans.bar) + db(i.topLong.bar) / 2;
  const us = (b: Bars) => stations(c, W - c, ft(b.spacing));
  const vs = (b: Bars) => stations(c, L - c, ft(b.spacing));
  const out: BarSet3D[] = [];
  const label = (b: Bars, what: string) => `#${b.bar} @ ${b.spacing} in ${what}`;
  for (const u of us(i.mainBars)) out.push(world(host, i.mainBars.bar, "main", label(i.mainBars, "main bars, bottom"), alongPath(u, c, L - c, dMain)));
  // The top bars along the roadway: down both ends and 1 ft back along the bottom (a ⊏).
  for (const u of us(i.topLong)) {
    const mid = alongPath(u, c, L - c, dTopL);
    out.push(world(host, i.topLong.bar, "main", label(i.topLong, "top, down both ends"), [down(surf(u, c + 1), dDist), down(surf(u, c), dDist), ...mid, down(surf(u, L - c), dDist), down(surf(u, L - c - 1), dDist)]));
  }
  for (const v of vs(i.distBars)) out.push(world(host, i.distBars.bar, "main", label(i.distBars, "transverse, bottom"), acrossPath(v, dDist)));
  for (const v of vs(i.topTrans)) out.push(world(host, i.topTrans.bar, "main", label(i.topTrans, "transverse, top"), acrossPath(v, dTopT)));
  // The anchorage bars: from the slab, through the joint at mid-depth, into the abutment and turned down.
  const zm = T / 2;
  for (const u of us(i.dowels)) {
    const inA = down(surf(u, -ft(i.dowelAbut)), zm);
    out.push(world(host, i.dowels.bar, "main", label(i.dowels, "anchorage bars"), [down(surf(u, ft(i.dowelSlab)), zm), inA, down(inA, ft(i.dowelHook))]));
  }
  return out;
}

export type WingwallBarInputs = { H: number; h: number; L: number; t: number; A: number; cover: number; bars: Bars; frontBars?: Bars; vertBars?: Bars; otherBars?: Bars };

/**
 * A wingwall's bars (takeoff/tools.ts wingwallTakeoff) in its element's frame (x from the abutment along the wall,
 * y up from its bottom at the abutment, z through it; its top level at H, its bottom rising to H − h at the tip): the design's horizontal bars on the retained face, run into the abutment
 * and hooked; the front face's horizontal bars and the vertical bars each face (shrinkage and temperature, 5.10.6),
 * as the design enters them (#4 at 12 in typically). `inward` says which way z runs: toward the fill (+1) or away (−1).
 */
export function wingwallBars(host: number, i: WingwallBarInputs, inward: 1 | -1): BarSet3D[] {
  const out: BarSet3D[] = [];
  const [H, h, L, T] = [i.H, i.h, i.L, ft(i.t)];
  const c = ft(i.cover);
  const dm = ft(barDiameter(i.bars.bar));
  const o = i.frontBars ?? i.otherBars ?? { bar: 4, spacing: 12 };
  const v = i.vertBars ?? i.otherBars ?? { bar: 4, spacing: 12 };
  const d4 = ft(barDiameter(o.bar));
  const zIn = inward === 1 ? T - c - dm / 2 : c + dm / 2; // the retained face
  const zOut = inward === 1 ? c + d4 / 2 : T - c - d4 / 2;
  const embed = Math.max(0, i.A - c);
  const bottom = (x: number) => ((H - h) * x) / L;
  // How far along the wall a bar at height y runs before the rising bottom (less the cover) meets it.
  const reach = (y: number) => Math.min(L - c, H - h > 1e-9 ? ((y - c) * L) / (H - h) : L - c);
  const leg = Math.min(ft(hookLeg(i.bars.bar).leg), Math.abs(zOut - zIn));
  const toward = zOut > zIn ? 1 : -1;
  for (const y of stations(c, H - c, ft(i.bars.spacing)))
    out.push(local(host, i.bars.bar, "main", `#${i.bars.bar} @ ${i.bars.spacing} in, retained face`, [p3(-embed, y, zIn + toward * leg), p3(-embed, y, zIn), p3(Math.max(0, reach(y)), y, zIn)], [p3(0, 0, 0)]));
  for (const y of stations(c, H - c, ft(o.spacing))) out.push(local(host, o.bar, "main", `#${o.bar} @ ${o.spacing} in, front face`, [p3(-embed, y, zOut), p3(Math.max(0, reach(y)), y, zOut)], [p3(0, 0, 0)]));
  for (const x of stations(c, L - c, ft(v.spacing)))
    for (const z of [zIn, zOut]) out.push(local(host, v.bar, "stirrup", `#${v.bar} @ ${v.spacing} in vertical, each face`, [p3(x, bottom(x) + c, z), p3(x, H - c, z)], [p3(0, 0, 0)]));
  return out;
}

/** A footing's or pile cap's bottom mat (foundations/detail.ts): bars along B (its x) under bars along L (its y), at the cover. */
export function footingBars(host: number, e: IfcElement, i: { cover: number; barsB: Bars; barsL: Bars; topB?: Bars; topL?: Bars; sideBars?: Bars }): BarSet3D[] {
  if (e.profile.kind !== "rect") return [];
  const X = e.profile.x;
  const Y = e.profile.y;
  const Z = e.depth;
  const c = ft(i.cover);
  const dB = ft(barDiameter(i.barsB.bar));
  const zL = c + dB + ft(barDiameter(i.barsL.bar)) / 2;
  // A pile cap's top mat (2 in cover) and its side bars round the faces between the mats (piles.ts).
  const extra: BarSet3D[] = [];
  const ct = ft(2);
  if (i.topB && i.topL) {
    const dt = ft(barDiameter(i.topB.bar));
    const zt = Z - ct - dt - ft(barDiameter(i.topL.bar)) / 2;
    extra.push(
      local(host, i.topB.bar, "main", `#${i.topB.bar} @ ${i.topB.spacing} in top, along B`, [p3(-X / 2 + ct, 0, Z - ct - dt / 2), p3(X / 2 - ct, 0, Z - ct - dt / 2)], stations(-Y / 2 + ct, Y / 2 - ct, ft(i.topB.spacing)).map((y) => p3(0, y, 0))),
      local(host, i.topL.bar, "main", `#${i.topL.bar} @ ${i.topL.spacing} in top, along L`, [p3(0, -Y / 2 + ct, zt), p3(0, Y / 2 - ct, zt)], stations(-X / 2 + ct, X / 2 - ct, ft(i.topL.spacing)).map((x) => p3(x, 0, 0))),
    );
  }
  if (i.sideBars && i.sideBars.spacing > 0) {
    const sb = i.sideBars;
    const ds = ft(barDiameter(sb.bar));
    const [x0, y0] = [X / 2 - ct - ds / 2, Y / 2 - ct - ds / 2];
    // Each level a loop round the faces, left open by 2 bar diameters (so it sweeps).
    const loop: V3[] = [p3(-x0, -y0, 0), p3(x0, -y0, 0), p3(x0, y0, 0), p3(-x0, y0, 0), p3(-x0, -y0 + 2 * ds, 0)];
    extra.push(local(host, sb.bar, "main", `#${sb.bar} @ ${sb.spacing} in side bars, each face`, loop, stations(c + 2 * dB + ft(sb.spacing), Z - ct - 2 * dB, ft(sb.spacing)).map((z) => p3(0, 0, z))));
  }
  return [
    ...extra,
    local(host, i.barsB.bar, "main", `#${i.barsB.bar} @ ${i.barsB.spacing} in bottom, along B`, [p3(-X / 2 + c, 0, c + dB / 2), p3(X / 2 - c, 0, c + dB / 2)], stations(-Y / 2 + c, Y / 2 - c, ft(i.barsB.spacing)).map((y) => p3(0, y, 0))),
    local(host, i.barsL.bar, "main", `#${i.barsL.bar} @ ${i.barsL.spacing} in bottom, along L`, [p3(0, -Y / 2 + c, zL), p3(0, Y / 2 - c, zL)], stations(-X / 2 + c, X / 2 - c, ft(i.barsL.spacing)).map((x) => p3(x, 0, 0))),
  ];
}
