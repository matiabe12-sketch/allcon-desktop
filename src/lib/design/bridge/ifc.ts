import { bearingParts } from "../bearings/pot-disc-detail";
import { bridgeGirderShape } from "./bridge";
import type { HlmrInputs } from "../bearings/pot-disc";
import type { AbutmentInputs } from "../foundations/abutment";
import { ABUTMENT_DEFAULTS } from "../foundations/abutment";
import type { FootingInputs } from "../foundations/footing";
import { FOOTING_DEFAULTS } from "../foundations/footing";
import { HP_SECTIONS } from "../foundations/hpile";
import type { PileInputs } from "../foundations/piles";
import { PILE_DEFAULTS } from "../foundations/piles";
import type { ShaftInputs } from "../foundations/shaft";
import { SHAFT_DEFAULTS } from "../foundations/shaft";
import { MICROPILE_DEFAULTS } from "../foundations/micropile";
import type { ApproachSlabInputs } from "../approach/approach-slab";
import { APPROACH_SLAB_DEFAULTS } from "../approach/approach-slab";
import { railDef } from "../decks/rails";
import type { WingwallInputs } from "../walls/wingwall";
import { deckElevation, horizontalElements, offsetPoint, pointAt, profileAt, profileGeometry, sectionAt, stationOffset } from "./alignment";
import type { BridgeInputs, BridgeRun, JointKind } from "./bridge";
import { designFinger, type FingerJointInputs } from "../joints/finger";
import { designModular, type ModularJointInputs } from "../joints/modular";
import { designStripSeal, type StripSealInputs } from "../joints/strip-seal";
import { fingerParts, modularParts, stripSealParts, type JointPart } from "../joints/detail";
import type { IfcRebar, RebarBox } from "./ifc-rebar";

// The Bridge as an IFC 4.3 model (phase 2, docs/bridge-model.md): a neutral description the IFC
// worker (api/_bridge.py) writes with IfcOpenShell: the alignment by the PI method (horizontal PIs
// and radii, vertical PVIs and curve lengths, the start station), the spatial structure (IfcBridge,
// its SUPERSTRUCTURE and SUBSTRUCTURE parts, an ABUTMENT or PIER part for each support), and each
// element as a profile swept along a local axis from a placement, with its IFC class and predefined
// type and property sets (its design, the ALLCON design's id and verdict, the CDOT pay item).
//
// Units: feet, the model's length unit. Coordinates: x east and y north from the first abutment's
// alignment point (its northing and easting kept in the site's property set), z the elevation.
// Level of development 300: each element at its designed size and place (decks flat across, along the
// span's grade; girders straight between their bearings, as precast girders are).

export type V3 = [number, number, number];
export type Profile =
  | { kind: "poly"; pts: [number, number][] } // ft, in the placement's x–y
  | { kind: "rect"; x: number; y: number } // centered
  | { kind: "circle"; r: number }
  | { kind: "ishape"; width: number; depth: number; web: number; flange: number }
  | { kind: "mesh"; pts: V3[]; tris: [number, number, number][] }; // a closed solid in the placement's frame (no sweep)
export type IfcElement = {
  cls: string;
  type: string;
  name: string;
  part: string; // the spatial part's key
  origin: V3;
  xdir: V3;
  zdir: V3; // the sweep's direction
  profile: Profile;
  depth: number; // ft, along zdir
  material: string;
  /** The surface colour the viewer draws it in (0–1 RGB): concrete, steel, elastomer told apart. */
  color?: [number, number, number];
  psets: Record<string, Record<string, string | number | boolean>>;
  /** ft, its run's length, for a swept element whose quantities need it (a barrier along the deck's edge). */
  length?: number;
  /** Its reinforcing bars (ifc-rebar.ts attachRebar): written as IfcReinforcingBar sets aggregated into it. */
  rebar?: IfcRebar;
  /** Where its bars are laid out, when its profile doesn't say (a deck span's surface solid). */
  box?: RebarBox;
  /** A deck span's top surface (world, ft): rows from one support line to the other, columns across from the left edge; each column's stations at the two support lines. For placing its bars; not written to the IFC file. */
  grid?: { top: V3[][]; stA: number[]; stB: number[] };
  /** A swept element's frames (a barrier along the deck's edge): each point, and per inch inward (u) and up (v). Not written to the IFC file. */
  sweep?: { p: V3; u: V3; v: V3 }[];
  /** A wingwall: which way its sweep (thickness) runs, toward the roadway's fill (+1) or away (−1). */
  wing?: { inward: 1 | -1 };
};

/** Colours by what an element is, so the deck, girders, barriers and substructure read apart. */
export const COLORS = {
  deck: [0.78, 0.76, 0.72],
  girder: [0.62, 0.64, 0.68],
  barrier: [0.86, 0.85, 0.82],
  sub: [0.55, 0.55, 0.53],
  foundation: [0.47, 0.45, 0.42],
  steel: [0.36, 0.43, 0.52],
  bearing: [0.15, 0.15, 0.15],
  approach: [0.72, 0.7, 0.66],
} as const satisfies Record<string, [number, number, number]>;
/** A horizontal alignment segment as IfcAlignmentHorizontalSegment takes it: its start, direction (rad), radii (+ left, 0 straight) and length. */
export type IfcSegment = { type: "LINE" | "CIRCULARARC" | "CLOTHOID"; start: [number, number]; dir: number; r0: number; r1: number; length: number };
export type IfcPart = { key: string; type: "SUPERSTRUCTURE" | "SUBSTRUCTURE" | "ABUTMENT" | "PIER" | "FOUNDATION"; name: string; parent: string | null };
export type BridgeIfc = {
  name: string;
  origin: { northing: number; easting: number };
  alignment: { name: string; segments: IfcSegment[]; vpoints: [number, number][]; lengths: number[]; startStation: number };
  parts: IfcPart[];
  elements: IfcElement[];
};

export type BridgeComponents = {
  verdicts?: Record<string, string>; // design id → its verdict
  abutments?: Record<number, { id?: string | null; inputs?: AbutmentInputs } | undefined>;
  approachSlabs?: Record<number, { id?: string | null; inputs?: ApproachSlabInputs } | undefined>;
  wingwalls?: Record<number, { id?: string | null; inputs?: WingwallInputs } | undefined>;
  foundations?: Record<number, { id?: string | null; kind: "spread-footing" | "pile-foundation" | "drilled-shaft"; inputs?: FootingInputs | PileInputs | ShaftInputs } | undefined>;
  deckId?: string | null;
  ids?: { girders?: (string | null)[]; caps?: Record<number, string | null>; columns?: Record<number, string | null> };
  /** Each support's pot or disc bearing design, drawn as its parts where the support line takes them. */
  hlmr?: Record<number, HlmrInputs | undefined>;
  /** Each abutment's expansion device design, drawn as its parts at the deck's end (or the approach slab's, at an integral abutment). */
  joints?: Record<number, { id?: string | null; kind: JointKind; inputs: StripSealInputs | ModularJointInputs | FingerJointInputs } | undefined>;
};

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: V3): V3 => mul(a, 1 / Math.hypot(...a));
const UP: V3 = [0, 0, 1];
const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
const v3 = (a: V3): V3 => [r6(a[0]), r6(a[1]), r6(a[2])];

/**
 * A closed solid from a grid of top points (rows along the span, columns across), the bottom a thickness
 * below: its points and triangles (0-based, outward).
 */
export function gridSolid(top: V3[][], t: number) {
  const n = top.length;
  const m = top[0].length;
  const pts: V3[] = [...top.flat(), ...top.flat().map((p) => [p[0], p[1], p[2] - t] as V3)].map(v3);
  const T = (i: number, j: number) => i * m + j;
  const B = (i: number, j: number) => n * m + i * m + j;
  const tris: [number, number, number][] = [];
  const quad = (a: number, b: number, c: number, d: number) => tris.push([a, b, c], [a, c, d]);
  for (let i = 0; i < n - 1; i++)
    for (let j = 0; j < m - 1; j++) {
      quad(T(i, j), T(i, j + 1), T(i + 1, j + 1), T(i + 1, j)); // rows run ahead, columns to the right: this way round faces up
      quad(B(i, j), B(i + 1, j), B(i + 1, j + 1), B(i, j + 1));
    }
  for (let i = 0; i < n - 1; i++) {
    quad(T(i, 0), T(i + 1, 0), B(i + 1, 0), B(i, 0)); // the left edge
    quad(T(i, m - 1), B(i, m - 1), B(i + 1, m - 1), T(i + 1, m - 1));
  }
  for (let j = 0; j < m - 1; j++) {
    quad(T(0, j), B(0, j), B(0, j + 1), T(0, j + 1)); // the back end
    quad(T(n - 1, j), T(n - 1, j + 1), B(n - 1, j + 1), B(n - 1, j));
  }
  return outward({ pts, tris });
}

/** A mesh's volume by the divergence theorem (+ when its faces point outward). */
export function meshVolume(pts: V3[], tris: [number, number, number][]) {
  return tris.reduce((v, [a, b, c]) => {
    const [p, q, r] = [pts[a], pts[b], pts[c]];
    return v + (p[0] * (q[1] * r[2] - q[2] * r[1]) - p[1] * (q[0] * r[2] - q[2] * r[0]) + p[2] * (q[0] * r[1] - q[1] * r[0])) / 6;
  }, 0);
}

/** The same mesh with its faces turned outward (a viewer draws only a face's front). */
export function outward(m: { pts: V3[]; tris: [number, number, number][] }) {
  return meshVolume(m.pts, m.tris) < 0 ? { pts: m.pts, tris: m.tris.map(([a, b, c]) => [a, c, b] as [number, number, number]) } : m;
}

/** A simple polygon's triangles by ear clipping (indices into it), either winding. */
export function earcut(poly: [number, number][]): [number, number, number][] {
  const area = poly.reduce((s, p, k) => s + (poly[(k + poly.length - 1) % poly.length][0] - p[0]) * (poly[(k + poly.length - 1) % poly.length][1] + p[1]), 0);
  const idx = poly.map((_, k) => k);
  if (area < 0) idx.reverse(); // counterclockwise (the sum above is + for a counterclockwise outline)
  const cross = (a: number, b: number, c: number) => (poly[b][0] - poly[a][0]) * (poly[c][1] - poly[a][1]) - (poly[b][1] - poly[a][1]) * (poly[c][0] - poly[a][0]);
  const inside = (p: number, a: number, b: number, c: number) => cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
  const out: [number, number, number][] = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < 10000) {
    let cut = false;
    for (let k = 0; k < idx.length; k++) {
      const a = idx[(k + idx.length - 1) % idx.length];
      const b = idx[k];
      const c = idx[(k + 1) % idx.length];
      if (cross(a, b, c) <= 1e-12) continue; // reflex
      if (idx.some((p) => p !== a && p !== b && p !== c && inside(p, a, b, c))) continue;
      out.push([a, b, c]);
      idx.splice(k, 1);
      cut = true;
      break;
    }
    if (!cut) break; // degenerate: give up on the rest
  }
  if (idx.length === 3) out.push([idx[0], idx[1], idx[2]]);
  return out;
}

/**
 * A closed solid swept through frames: the outline's (x, y) placed at each frame's point p + x·u + y·v, the
 * sides between frames, the ends capped. Outward-facing.
 */
export function sweepSolid(frames: { p: V3; u: V3; v: V3 }[], shape: [number, number][]) {
  // Counterclockwise, so the sides and the caps turn the same way (outward() then faces them all out).
  const signed = shape.reduce((t, p, k) => t + p[0] * shape[(k + 1) % shape.length][1] - shape[(k + 1) % shape.length][0] * p[1], 0);
  const outline = signed < 0 ? [...shape].reverse() : shape;
  const m = outline.length;
  const pts: V3[] = frames.flatMap((f) => outline.map(([x, y]) => v3([f.p[0] + x * f.u[0] + y * f.v[0], f.p[1] + x * f.u[1] + y * f.v[1], f.p[2] + x * f.u[2] + y * f.v[2]])));
  const tris: [number, number, number][] = [];
  for (let i = 0; i < frames.length - 1; i++)
    for (let j = 0; j < m; j++) {
      const a = i * m + j;
      const b = i * m + ((j + 1) % m);
      tris.push([a, b, b + m], [a, b + m, a + m]);
    }
  const cap = earcut(outline);
  const last = (frames.length - 1) * m;
  for (const [a, b, c] of cap) tris.push([a, c, b], [last + a, last + b, last + c]);
  return outward({ pts, tris });
}

/** The barrier's concrete outline (in, x from the deck's edge inward, y up from the deck's top) and steel, by rail. */
export function barrierShape(b: Pick<BridgeInputs, "rail" | "barrierWidth">) {
  const def = b.rail ? railDef(b.rail.type) : null;
  if (def) return { def, outline: def.outline.map(([x, y]) => [x, y] as [number, number]), name: def.name, payItem: def.payItem };
  // A generic 42 in parapet, the barrier width at its base, 9 in at its top.
  const w = Math.max(9, b.barrierWidth * 12);
  return { def: null, outline: [[0, 0], [w, 0], [w - 3, 10], [9, 42], [0, 42]] as [number, number][], name: "Concrete barrier", payItem: "606 (bridge rail)" };
}

/** A sweep's length through its frames' points (ft). */
const runLength = (frames: { p: V3 }[]) => r6(frames.slice(1).reduce((t, f, k) => t + Math.hypot(...sub(f.p, frames[k].p)), 0));

/** A horizontal frame: x along a plan direction, z up. */
const flat = (dirX: number, dirY: number) => ({ xdir: unit([dirX, dirY, 0]), zdir: UP });

export function bridgeIfc(b: BridgeInputs, run: BridgeRun, c: BridgeComponents = {}, name = "Bridge"): BridgeIfc {
  const lay = run.layout;
  const cache = horizontalElements(b.alignment);
  const vcs = profileGeometry(b.profile);
  const s0 = lay.supports[0];
  const O = { x: s0.x, y: s0.y };
  const P = (x: number, y: number, z: number): V3 => [x - O.x, y - O.y, z];
  const verdict = (id?: string | null) => (id && c.verdicts?.[id]) || "";
  const designPset = (kind: string, id?: string | null, extra: Record<string, string | number | boolean> = {}) => ({ ALLCON_Design: { DesignKind: kind, DesignId: id ?? "", Verdict: verdict(id), ...extra } });

  // --- the alignment: from 100 ft before the first abutment to 100 ft past the last, widened to take in
  // whole spirals and vertical curves; the horizontal layout element by element (lines, arcs, clothoids), the
  // vertical by its PVIs.
  let sA = lay.supports[0].station - 100;
  let sB = lay.supports[lay.supports.length - 1].station + 100;
  for (const e of cache.els) {
    if (e.kind === "spiral" && e.s0 < sA && e.s1 > sA) sA = e.s0;
    if (e.kind === "spiral" && e.s0 < sB && e.s1 > sB) sB = e.s1;
  }
  for (const v of vcs) {
    if (v.L > 0 && v.bvc < sA && v.evc > sA) sA = v.bvc - 10;
    if (v.L > 0 && v.bvc < sB && v.evc > sB) sB = v.evc + 10;
  }
  const segments: IfcSegment[] = [];
  for (const e of cache.els) {
    const s0 = Math.max(e.s0, sA);
    const s1 = Math.min(e.s1, sB);
    if (!(s1 - s0 > 1e-3)) continue;
    const p = pointAt(b.alignment, s0, cache);
    const dir = r6(((90 - p.az) * Math.PI) / 180); // IFC: radians counterclockwise from +x
    // IFC's radii: + turning left (counterclockwise), 0 straight.
    const signed = e.kind === "tangent" ? 0 : -e.turn * e.R;
    const seg = (type: IfcSegment["type"], r0: number, r1: number): IfcSegment => ({ type, start: [r6(p.x - O.x), r6(p.y - O.y)], dir, r0: r6(r0), r1: r6(r1), length: r6(s1 - s0) });
    if (e.kind === "tangent") segments.push(seg("LINE", 0, 0));
    else if (e.kind === "arc") segments.push(seg("CIRCULARARC", signed, signed));
    else segments.push(e.out ? seg("CLOTHOID", signed, 0) : seg("CLOTHOID", 0, signed));
  }
  const vsel = vcs.filter((v) => v.pvi > sA && v.pvi < sB);
  const vpoints: [number, number][] = [[0, profileAt(b.profile, sA, vcs).elevation], ...vsel.map((v) => [v.pvi - sA, v.elev] as [number, number]), [sB - sA, profileAt(b.profile, sB, vcs).elevation]];

  // --- spatial parts --------------------------------------------------------------------------------------------------
  const parts: IfcPart[] = [
    { key: "super", type: "SUPERSTRUCTURE", name: "Superstructure", parent: null },
    { key: "sub", type: "SUBSTRUCTURE", name: "Substructure", parent: null },
    ...lay.supports.map((s, i): IfcPart => ({ key: `support-${i}`, type: s.type.endsWith("abutment") ? "ABUTMENT" : "PIER", name: s.name, parent: "sub" })),
  ];
  const els: IfcElement[] = [];
  const shape = bridgeGirderShape(b);
  const outline: [number, number][] = [...shape.profile.map(([y, hw]) => [hw / 12, y / 12] as [number, number]), ...[...shape.profile].reverse().map(([y, hw]) => [-hw / 12, y / 12] as [number, number])];

  // --- girders, bearings and the deck, span by span ------------------------------------------------------------------
  for (const span of lay.spans) {
    const sa = lay.supports[span.index];
    const sb = lay.supports[span.index + 1];
    const gid = (() => {
      const g = run.groups.findIndex((x) => x.spans.includes(span.index));
      return c.ids?.girders?.[g] ?? null;
    })();
    for (const g of span.girders) {
      const zA = g.start.seat + sa.bearingHeight / 12; // the girder's bottom over each bearing
      const zB = g.end.seat + sb.bearingHeight / 12;
      const A = P(g.start.x, g.start.y, zA);
      const B = P(g.end.x, g.end.y, zB);
      const along = unit(sub(B, A));
      const start = sub(A, mul(along, sa.endDistance / Math.cos(Math.atan2(zB - zA, Math.hypot(B[0] - A[0], B[1] - A[1])))));
      const xdir = unit(cross(UP, along));
      // A slab bridge has no girders: the slab is the deck below, on its bearing lines.
      if (b.superstructure !== "slab") els.push({
        cls: "IfcBeam",
        type: "GIRDER_SEGMENT",
        name: `Girder ${g.k + 1}, span ${span.index + 1}`,
        part: "super",
        origin: v3(start),
        xdir: v3(xdir),
        zdir: v3(along),
        profile: { kind: "poly", pts: outline },
        depth: r6(g.length),
        material: b.shape === "steel" ? "Structural steel (plate girder)" : `Prestressed concrete (${shape.name})`,
        psets: b.shape === "steel" ? designPset("steel-girder-check", c.ids?.girders?.[0] ?? null, { Section: "Steel plate girder", SpanBearingToBearing: r6(g.L), PayItem: "509 (structural steel)" }) : designPset("lrfd-girder-check", gid, { Section: shape.name, SpanBearingToBearing: r6(g.L), PayItem: "618 (prestressed girder)" }),
      });
      for (const [pt, z, s, end] of [[A, zA, sa, "start"], [B, zB, sb, "end"]] as const) {
        const k = s === sa ? span.index : span.index + 1;
        const hl = c.hlmr?.[k];
        if (hl && (b.supports[k]?.bearingKind === "pot" || b.supports[k]?.bearingKind === "disc")) {
          // A pot or disc bearing drawn as its parts (bearings/pot-disc-detail.ts), x along the girder, y across it.
          const ax = unit([along[0], along[1], 0]);
          const ay: V3 = [-ax[1], ax[0], 0];
          const base: V3 = [pt[0], pt[1], z - s.bearingHeight / 12];
          for (const p of bearingParts(hl)) {
            const o: V3 = [base[0] + (ax[0] * p.x + ay[0] * p.y) / 12, base[1] + (ax[1] * p.x + ay[1] * p.y) / 12, base[2] + p.z0 / 12];
            const profile: Profile = p.shape.kind === "box" ? { kind: "rect", x: p.shape.B / 12, y: p.shape.L / 12 } : p.shape.kind === "cyl" ? { kind: "circle", r: p.shape.D / 24 } : { kind: "mesh", ...ringMesh(p.shape.D / 12, p.shape.d / 12, p.h / 12) };
            els.push({
              cls: "IfcBearing",
              type: hl.kind === "pot" ? "POT" : "DISK",
              name: `${p.name}, ${hl.kind} bearing, girder ${g.k + 1}, span ${span.index + 1} ${end}`,
              part: "super",
              origin: v3(o),
              xdir: v3(ax),
              zdir: UP,
              profile,
              depth: r6(p.h / 12),
              material: p.material,
              color: [...(/Elastomer|urethane|PTFE|Brass/.test(p.material) ? COLORS.bearing : COLORS.steel)],
              psets: designPset("pot-disc-bearing", null, { Part: p.name, PayItem: "512-00118 Bearing Device (Special)" }),
            });
          }
          continue;
        }
        els.push({
          cls: "IfcBearing",
          type: "ELASTOMERIC",
          name: `Bearing, girder ${g.k + 1}, span ${span.index + 1} ${end}`,
          part: "super",
          origin: v3([pt[0], pt[1], z - s.bearingHeight / 12]),
          ...flat(Math.sin((s.lineAz * Math.PI) / 180), Math.cos((s.lineAz * Math.PI) / 180)),
          profile: { kind: "rect", x: 2, y: 1 },
          depth: r6(Math.max(0.05, s.bearingHeight / 12)),
          material: "Elastomer",
          psets: designPset("elastomeric-bearing", null, { PayItem: "512 (bearing device)" }),
        });
      }
    }
    // The deck: its top on the profile and the crown, between the support lines and the deck's edges, a
    // surface along the alignment (its curves, vertical curves and cross slopes), the soffit deckT below it.
    // At an abutment the deck runs past the support line to where the approach slab starts: over an integral
    // abutment's end diaphragm to the cap's back face, over a semi-integral one's to the stem's back face (the
    // deck cast with the diaphragm); at a seat abutment to the girders' ends (the joint at the backwall).
    const deckBack = (k: number) => {
      const s = lay.supports[k];
      if (!s || !b.supports[k]?.type.endsWith("abutment")) return 0;
      const a = c.abutments?.[k]?.inputs ?? ABUTMENT_DEFAULTS;
      if (a.type.startsWith("integral")) return Math.max(0, a.capWidth - s.bearingOffset);
      if (b.supports[k].type === "semi-integral-abutment" || a.type === "semi-integral") return Math.max(0, a.stemT);
      return s.endDistance;
    };
    const backA = span.index === 0 ? deckBack(span.index) : 0;
    const backB = span.index + 1 === lay.supports.length - 1 ? deckBack(span.index + 1) : 0;
    const corner = (s: (typeof lay.supports)[number], o: number) => {
      const t = o / Math.cos((s.skew * Math.PI) / 180);
      const [lx, ly] = [Math.sin((s.lineAz * Math.PI) / 180), Math.cos((s.lineAz * Math.PI) / 180)];
      // Square to the support line, back from it (toward the approach) at the bridge's ends.
      const back = s === sa ? -backA : s === sb ? backB : 0;
      return stationOffset(b.alignment, s.x + t * lx - back * ly, s.y + t * ly + back * lx, s.station, cache).station;
    };
    const oL = b.bridgeLineOffset - b.leftEdge;
    const oR = b.bridgeLineOffset + b.rightEdge;
    const crowns = [b.roadway.crownOffset, ...(b.roadway.sections ?? []).map((t) => t.crownOffset), sectionAt(b.roadway, sa.station).crownOffset, sectionAt(b.roadway, sb.station).crownOffset];
    const nAcross = Math.max(1, Math.ceil((oR - oL) / 6));
    const offs = [...new Set([...Array.from({ length: nAcross + 1 }, (_, k) => oL + ((oR - oL) * k) / nAcross), ...crowns.filter((c) => c > oL && c < oR)].map((o) => r6(o)))].sort((p, q) => p - q);
    const n = Math.max(2, Math.ceil((sb.station - sa.station) / 10) + 1);
    const top: V3[][] = Array.from({ length: n }, (_, k) =>
      offs.map((o) => {
        const st = corner(sa, o) + ((corner(sb, o) - corner(sa, o)) * k) / (n - 1);
        const p = offsetPoint(b.alignment, st, o, cache);
        return P(p.x, p.y, deckElevation(b.profile, b.roadway, st, o, vcs));
      }),
    );
    els.push({
      cls: "IfcSlab",
      type: "FLOOR",
      name: `Deck, span ${span.index + 1}`,
      part: "super",
      origin: [0, 0, 0],
      xdir: [1, 0, 0],
      zdir: UP,
      profile: { kind: "mesh", ...gridSolid(top, b.deckT / 12) },
      depth: r6(b.deckT / 12),
      material: `Concrete Class DF, f'c ${b.fcDeck} ksi`,
      color: [...COLORS.deck],
      psets: { ALLCON_Design: { DesignKind: "deck-slab", DesignId: c.deckId ?? "", Verdict: verdict(c.deckId), Thickness_in: b.deckT, PayItem: "601-03056 Concrete Class DF" } },
      box: deckBox(),
      grid: { top, stA: offs.map((o) => r6(corner(sa, o))), stB: offs.map((o) => r6(corner(sb, o))) },
    });
    // The span's deck as a box for its bars: along the chord at mid-width, across the deck, its thickness.
    function deckBox(): RebarBox {
      const om = (oL + oR) / 2;
      const end = (s: typeof sa): V3 => {
        const st = corner(s, om);
        const p = offsetPoint(b.alignment, st, om, cache);
        return P(p.x, p.y, deckElevation(b.profile, b.roadway, st, om, vcs) - b.deckT / 24);
      };
      const [A, B] = [end(sa), end(sb)];
      const x = unit(sub(B, A));
      const y = unit(cross(UP, x));
      return { c: v3(mul([A[0] + B[0], A[1] + B[1], A[2] + B[2]], 0.5)), ax: [v3(x), v3(y), v3(cross(x, y))], half: [r6(Math.hypot(...sub(B, A)) / 2), r6((oR - oL) / 2), r6(b.deckT / 24)] };
    }
    // The bridge rail on both edges, swept along them on the deck's top (its traffic face inward).
    const railShape = barrierShape(b);
    for (const [side, o, inward] of [["left", oL, 1], ["right", oR, -1]] as const) {
      const frames = Array.from({ length: n }, (_, k) => {
        const st = corner(sa, o) + ((corner(sb, o) - corner(sa, o)) * k) / (n - 1);
        const p = offsetPoint(b.alignment, st, o, cache);
        const nAz = ((p.az + 90) * Math.PI) / 180; // to the right
        const u: V3 = [(inward * Math.sin(nAz)) / 12, (inward * Math.cos(nAz)) / 12, 0];
        return { p: P(p.x, p.y, deckElevation(b.profile, b.roadway, st, o, vcs)), u, v: [0, 0, 1 / 12] as V3 };
      });
      // The outline mirrored on the right edge keeps the sweep's faces consistent; outward() fixes any turn.
      els.push({
        cls: "IfcRailing",
        type: "GUARDRAIL",
        name: `${railShape.name}, ${side}, span ${span.index + 1}`,
        part: "super",
        origin: [0, 0, 0],
        xdir: [1, 0, 0],
        zdir: UP,
        profile: { kind: "mesh", ...sweepSolid(frames, railShape.outline) },
        depth: 1,
        length: runLength(frames),
        material: "Concrete Class D (Bridge)",
        color: [...COLORS.barrier],
        psets: { ALLCON_Design: { DesignKind: "bridge-rail", Rail: railShape.name, PayItem: railShape.payItem } },
        sweep: frames,
      });
      // Steel tubes on a curb-and-post rail.
      for (const [t, tube] of (railShape.def?.posts?.tubes ?? []).entries()) {
        const box: [number, number][] = [[tube.x0, tube.y0], [tube.x1, tube.y0], [tube.x1, tube.y1], [tube.x0, tube.y1]];
        els.push({ cls: "IfcRailing", type: "GUARDRAIL", name: `${railShape.name} tube ${t + 1}, ${side}, span ${span.index + 1}`, part: "super", origin: [0, 0, 0], xdir: [1, 0, 0], zdir: UP, profile: { kind: "mesh", ...sweepSolid(frames, box) }, depth: 1, length: runLength(frames), material: "Structural steel (galvanized)", color: [...COLORS.steel], psets: { ALLCON_Design: { DesignKind: "bridge-rail", Rail: railShape.name, PayItem: railShape.payItem } } });
      }
    }
  }

  // --- each support's substructure -----------------------------------------------------------------------------------
  lay.supports.forEach((s, i) => {
    const part = `support-${i}`;
    const lineX = Math.sin((s.lineAz * Math.PI) / 180);
    const lineY = Math.cos((s.lineAz * Math.PI) / 180);
    // Along the bridge, horizontal: square to the support line, pointing ahead.
    const fw = { x: -lineY, y: lineX };
    const seats = [...(i > 0 ? lay.spans[i - 1].girders.map((g) => g.end.seat) : []), ...(i < lay.spans.length ? lay.spans[i].girders.map((g) => g.start.seat) : [])];
    const capTop = Math.min(...seats);
    const center = (along: number) => ({ x: s.x + along * lineX, y: s.y + along * lineY });
    const mid = b.bridgeLineOffset / Math.cos((s.skew * Math.PI) / 180);
    if (s.type.endsWith("abutment")) {
      const a = c.abutments?.[i]?.inputs ?? ABUTMENT_DEFAULTS;
      const aid = c.abutments?.[i]?.id ?? null;
      const length = (b.leftEdge + b.rightEdge) / Math.cos((s.skew * Math.PI) / 180);
      const integral = a.type.startsWith("integral");
      const cc = center(mid);
      const sign = i === 0 ? -1 : 1; // the abutment sits behind its bearings, toward the approach
      if (integral) {
        const bottom = capTop - a.capDepth;
        const cap = { x: cc.x + sign * fw.x * (a.capWidth / 2 - s.bearingOffset), y: cc.y + sign * fw.y * (a.capWidth / 2 - s.bearingOffset) };
        els.push({ cls: "IfcFooting", type: "PILE_CAP", name: `${s.name} pile cap`, part, origin: v3(P(cap.x, cap.y, bottom)), ...flat(lineX, lineY), profile: { kind: "rect", x: length, y: a.capWidth }, depth: a.capDepth, material: "Concrete Class D (Bridge)", psets: designPset("abutment", aid, { AbutmentType: a.type, PayItem: "601-03040 Concrete Class D (Bridge)" }) });
        const deckTop = profileAt(b.profile, s.station, vcs).elevation;
        els.push({ cls: "IfcBeam", type: "DIAPHRAGM", name: `${s.name} end diaphragm`, part, origin: v3(P(cap.x, cap.y, capTop)), ...flat(lineX, lineY), profile: { kind: "rect", x: length, y: a.capWidth }, depth: r6(Math.max(0.5, deckTop - b.deckT / 12 - capTop)), material: "Concrete Class D (Bridge)", psets: designPset("abutment", aid) });
        const n = a.nPiles;
        if (a.type === "integral-micropiles") {
          // Micropiles in rows across the cap (the first toward the bridge), the others battered away from it.
          const mp = { ...MICROPILE_DEFAULTS, ...a.micropile };
          const rows = Math.max(1, Math.round(a.mpRows));
          for (let r = 0; r < rows; r++) {
            const across = -sign * ((rows - 1) * a.mpRowSpacing) / 2 + sign * r * a.mpRowSpacing;
            const b = ((r === 0 ? a.mpBatterFront : a.mpBatterBack) * Math.PI) / 180;
            const zdir: V3 = [sign * fw.x * Math.sin(b), sign * fw.y * Math.sin(b), -Math.cos(b)];
            for (let k = 0; k < n; k++) {
              const t = -length / 2 + 1.5 + (k * (length - 3)) / Math.max(1, n - 1);
              const p = { x: cap.x + t * lineX + across * fw.x, y: cap.y + t * lineY + across * fw.y };
              els.push({ cls: "IfcPile", type: "BORED", name: `${s.name} micropile ${r + 1}-${k + 1}`, part, origin: v3(P(p.x, p.y, bottom + mp.embed / 12)), xdir: v3([lineX, lineY, 0]), zdir: v3(zdir), profile: { kind: "circle", r: r6(mp.casingOD / 24) }, depth: r6(mp.cased + mp.bond + mp.embed / 12), material: "Steel casing, grouted (micropile)", psets: designPset("abutment", aid, { Diameter_in: mp.holeD, PayItem: "503 Micropile" }) });
            }
          }
        }
        for (let k = 0; k < (a.type === "integral-micropiles" ? 0 : n); k++) {
          const t = -length / 2 + 1 + (k * (length - 2)) / Math.max(1, n - 1);
          const p = { x: cap.x + t * lineX, y: cap.y + t * lineY };
          if (a.type === "integral-piles") {
            const hp = HP_SECTIONS[a.section] ?? HP_SECTIONS["HP12x53"];
            els.push({ cls: "IfcPile", type: "DRIVEN", name: `${s.name} pile ${k + 1}`, part, origin: v3(P(p.x, p.y, bottom + a.embed / 12)), xdir: v3([lineX, lineY, 0]), zdir: [0, 0, -1], profile: { kind: "ishape", width: r6(hp.bf / 12), depth: r6(hp.d / 12), web: r6(hp.tw / 12), flange: r6(hp.tf / 12) }, depth: r6(a.pileLength + a.embed / 12), material: `Steel ${a.section} Grade 50`, psets: designPset("abutment", aid, { Section: a.section, PayItem: "502 Steel Piling" }) });
          } else {
            els.push({ cls: "IfcPile", type: "BORED", name: `${s.name} shaft ${k + 1}`, part, origin: v3(P(p.x, p.y, bottom)), xdir: v3([lineX, lineY, 0]), zdir: [0, 0, -1], profile: { kind: "circle", r: r6(a.shaftD / 24) }, depth: a.shaftLength, material: "Concrete (drilled shaft)", psets: designPset("abutment", aid, { Diameter_in: a.shaftD, PayItem: `503-000${a.shaftD}` }) });
          }
        }
      } else {
        const B = a.toe + a.stemT + a.heel;
        const footBottom = capTop - a.stemH - a.footT;
        const stem = { x: cc.x + sign * fw.x * (a.stemT / 2), y: cc.y + sign * fw.y * (a.stemT / 2) };
        els.push({ cls: "IfcWall", type: "RETAININGWALL", name: `${s.name} stem`, part, origin: v3(P(stem.x, stem.y, footBottom + a.footT)), ...flat(lineX, lineY), profile: { kind: "rect", x: length, y: a.stemT }, depth: a.stemH, material: "Concrete Class D (Bridge)", psets: designPset("abutment", aid, { AbutmentType: a.type }) });
        const bw = { x: stem.x + sign * fw.x * (a.stemT / 2 - a.backwallT / 2), y: stem.y + sign * fw.y * (a.stemT / 2 - a.backwallT / 2) };
        els.push({ cls: "IfcWall", type: "PARAPET", name: `${s.name} backwall`, part, origin: v3(P(bw.x, bw.y, capTop)), ...flat(lineX, lineY), profile: { kind: "rect", x: length, y: a.backwallT }, depth: a.backwallH, material: "Concrete Class D (Bridge)", psets: designPset("abutment", aid) });
        const fc = { x: stem.x + sign * fw.x * (a.heel - a.toe) / 2, y: stem.y + sign * fw.y * (a.heel - a.toe) / 2 };
        els.push({ cls: "IfcFooting", type: "STRIP_FOOTING", name: `${s.name} footing`, part, origin: v3(P(fc.x, fc.y, footBottom)), ...flat(lineX, lineY), profile: { kind: "rect", x: length, y: B }, depth: a.footT, material: "Concrete Class D (Bridge)", psets: designPset("abutment", aid) });
        if (a.foundation === "micropiles") {
          // Rows of micropiles under the footing, each row at its distance from the toe (the toe toward the bridge), a
          // battered row leaning toward the bridge (its tip under the toe's side: it takes the earth pressure's thrust,
          // as F-15-E's sheet BX13 shows).
          const mp = { ...MICROPILE_DEFAULTS, ...a.micropile };
          const per = Math.max(1, Math.round(a.mpPerRow ?? 1));
          const toe = { x: stem.x - sign * fw.x * (a.stemT / 2 + a.toe), y: stem.y - sign * fw.y * (a.stemT / 2 + a.toe) };
          (a.mpRowList ?? []).forEach((row, r) => {
            const bt = (row.batter * Math.PI) / 180;
            const zdir: V3 = [-sign * fw.x * Math.sin(bt), -sign * fw.y * Math.sin(bt), -Math.cos(bt)];
            for (let k = 0; k < per; k++) {
              const t = -length / 2 + 1.5 + (k * (length - 3)) / Math.max(1, per - 1);
              const p = { x: toe.x + t * lineX + sign * row.x * fw.x, y: toe.y + t * lineY + sign * row.x * fw.y };
              els.push({ cls: "IfcPile", type: "BORED", name: `${s.name} micropile ${r + 1}-${k + 1}`, part, origin: v3(P(p.x, p.y, footBottom + mp.embed / 12)), xdir: v3([lineX, lineY, 0]), zdir: v3(zdir), profile: { kind: "circle", r: r6(mp.casingOD / 24) }, depth: r6(mp.cased + mp.bond + mp.embed / 12), material: "Steel casing, grouted (micropile)", psets: designPset("abutment", aid, { Diameter_in: mp.holeD, PayItem: "503 Micropile" }) });
            }
          });
        }
      }
      // Its wingwalls (when a wingwall design is linked): one at each end of the abutment, from its back face
      // along the approach, square to the support line, their outer faces flush with the abutment's ends; the
      // wingwall design's elevation (its top level with the roadway, its bottom H below it at the abutment and h
      // below it at the tip: the design's pressure depths) and thickness.
      const wing = c.wingwalls?.[i];
      if (wing?.inputs) {
        const w = wing.inputs;
        const backFace = integral ? a.capWidth - s.bearingOffset : a.stemT;
        const top = profileAt(b.profile, s.station, vcs).elevation;
        const x: V3 = [sign * fw.x, sign * fw.y, 0]; // away from the bridge
        const z = cross(x, UP); // the sweep's direction (the profile's y is then up)
        for (const end of [-1, 1] as const) {
          const outer = { x: cc.x + end * (length / 2) * lineX + x[0] * backFace, y: cc.y + end * (length / 2) * lineY + x[1] * backFace };
          const inwardDir: V3 = [-end * lineX, -end * lineY, 0];
          const inward = (z[0] * inwardDir[0] + z[1] * inwardDir[1] > 0 ? 1 : -1) as 1 | -1;
          // The sweep starts at the outer face when it runs inward, at the inner face otherwise.
          const o = inward === 1 ? outer : { x: outer.x + inwardDir[0] * (w.t / 12), y: outer.y + inwardDir[1] * (w.t / 12) };
          els.push({
            cls: "IfcWall",
            type: "RETAININGWALL",
            name: `${s.name} wingwall, ${end < 0 ? "left" : "right"}`,
            part,
            origin: v3(P(o.x, o.y, top - w.H)),
            xdir: v3(x),
            zdir: v3(z),
            profile: { kind: "poly", pts: [[0, 0], [w.L, w.H - w.h], [w.L, w.H], [0, w.H]] },
            depth: r6(w.t / 12),
            material: "Concrete Class D (Bridge)",
            psets: designPset("cantilever-wingwall", wing.id ?? null, { PayItem: "601-03040 Concrete Class D (Bridge)" }),
            wing: { inward },
          });
        }
      }
      // The approach slab behind it.
      const ap = c.approachSlabs?.[i]?.inputs ?? APPROACH_SLAB_DEFAULTS;
      const apid = c.approachSlabs?.[i]?.id ?? null;
      // Its top on the roadway, as the deck's: the profile and the crown, from the abutment's back face (where the deck
      // ends) out its length, square to the support line, across the deck's width; rows from the abutment outward.
      const face = integral ? a.capWidth - s.bearingOffset : a.stemT; // from the support line
      const oL = b.bridgeLineOffset - b.leftEdge;
      const oR = b.bridgeLineOffset + b.rightEdge;
      const crownAt = sectionAt(b.roadway, s.station).crownOffset;
      const nAcross = Math.max(1, Math.ceil((oR - oL) / 6));
      const offs = [...new Set([...Array.from({ length: nAcross + 1 }, (_, k) => oL + ((oR - oL) * k) / nAcross), ...(crownAt > oL && crownAt < oR ? [crownAt] : [])].map((o) => r6(o)))].sort((p, q) => p - q);
      const nAlong = Math.max(2, Math.ceil(ap.L / 5) + 1);
      const cosSk = Math.cos((s.skew * Math.PI) / 180);
      const at = (o: number, d: number) => {
        const t = o / cosSk;
        const x = s.x + t * lineX + sign * d * fw.x;
        const y = s.y + t * lineY + sign * d * fw.y;
        const so = stationOffset(b.alignment, x, y, s.station, cache);
        return { p: P(x, y, deckElevation(b.profile, b.roadway, so.station, so.offset, vcs)), st: so.station };
      };
      const rowsAt = Array.from({ length: nAlong }, (_, k) => face + (ap.L * k) / (nAlong - 1));
      const slabTop: V3[][] = rowsAt.map((d) => offs.map((o) => at(o, d).p));
      // The grid's rows must run ahead (increasing station) for the solid's faces to point out.
      const ahead = sign > 0 ? slabTop : [...slabTop].reverse();
      const slabMid = { x: cc.x + sign * fw.x * (face + ap.L / 2), y: cc.y + sign * fw.y * (face + ap.L / 2) };
      const zMid = at(b.bridgeLineOffset, face + ap.L / 2).p[2];
      const bx: V3 = [lineX, lineY, 0];
      const by = cross(UP, bx);
      els.push({
        cls: "IfcSlab",
        type: "APPROACH_SLAB",
        name: `${s.name} approach slab`,
        part,
        origin: [0, 0, 0],
        xdir: [1, 0, 0],
        zdir: UP,
        profile: { kind: "mesh", ...gridSolid(ahead, ap.t / 12) },
        depth: r6(ap.t / 12),
        material: "Concrete Class DF",
        psets: designPset("approach-slab", apid, { PayItem: "601-03056 Concrete Class DF" }),
        // Its bars' box (the slab as cast, at mid-depth) and its top, rows from the abutment out.
        box: { c: v3(P(slabMid.x, slabMid.y, zMid - ap.t / 24)), ax: [v3(bx), v3(by), UP], half: [r6(length / 2), r6(ap.L / 2), r6(ap.t / 24)] },
        grid: { top: slabTop, stA: offs.map((o) => r6(at(o, face).st)), stB: offs.map((o) => r6(at(o, face + ap.L).st)) },
      });
      // The expansion device, as its parts at its installation opening: at the deck's end over a seat abutment, at the
      // approach slab's far end behind an integral or semi-integral one; its parts swept along the joint between the
      // deck's grid points across, each on the roadway's surface there.
      const jt = c.joints?.[i];
      if (jt) {
        const atSlabEnd = b.supports[i].type === "integral-abutment" || b.supports[i].type === "semi-integral-abutment";
        const dj = atSlabEnd ? face + ap.L : s.endDistance; // ft from the support line, toward the approach
        const lineIn = ((oR - oL) / cosSk) * 12;
        let parts: JointPart[];
        let A: number; // in, the opening
        let pay: string;
        if (jt.kind === "modular-joint") {
          const r = designModular(jt.inputs as ModularJointInputs);
          A = r.design.A;
          parts = modularParts(jt.inputs as ModularJointInputs, lineIn, A);
          pay = `518-010${String(Math.min(12, r.size)).padStart(2, "0")} Bridge Expansion Device (0-${r.size} Inch)`;
        } else if (jt.kind === "finger-joint") {
          A = designFinger(jt.inputs as FingerJointInputs).design.D;
          parts = fingerParts(jt.inputs as FingerJointInputs, lineIn, A);
          pay = "518-01201 Bridge Expansion Device (Type 1)";
        } else {
          A = designStripSeal(jt.inputs as StripSealInputs).design.A;
          parts = stripSealParts(jt.inputs as StripSealInputs, A);
          pay = "518-01004 Bridge Expansion Device (0-4 Inch)";
        }
        const mid = sign * (dj + A / 24); // ft along the bridge (ahead) from the support line to the joint's middle
        const jointPt = (o: number, xIn: number, zIn: number): V3 => {
          const t = o / cosSk;
          const x = s.x + t * lineX + (mid + xIn / 12) * fw.x;
          const y = s.y + t * lineY + (mid + xIn / 12) * fw.y;
          const so = stationOffset(b.alignment, x, y, s.station, cache);
          return P(x, y, deckElevation(b.profile, b.roadway, so.station, so.offset, vcs) + zIn / 12);
        };
        const label = jt.kind === "modular-joint" ? "modular joint" : jt.kind === "finger-joint" ? "finger joint" : "strip seal";
        for (const p of parts) {
          const runs: [number, number][] = p.s0 === undefined ? offs.slice(1).map((o, k) => [offs[k], o]) : [[oL + (p.s0 / 12) * cosSk, oL + ((p.s1 ?? p.s0) / 12) * cosSk]];
          for (const [oa, ob] of runs) {
            const pa = jointPt(oa, p.x, p.z);
            const run = sub(jointPt(ob, p.x, p.z), pa);
            const len = Math.hypot(...run);
            if (len < 1e-4) continue;
            els.push({
              cls: "IfcPlate",
              type: "EXPANSION_JOINT",
              name: `${p.name}, ${s.name} ${label}`,
              part,
              origin: v3(pa),
              xdir: v3([fw.x, fw.y, 0]),
              zdir: v3(unit(run)),
              profile: { kind: "rect", x: r6(p.w / 12), y: r6(p.h / 12) },
              depth: r6(len),
              material: p.material,
              color: [...(p.seal ? COLORS.bearing : COLORS.steel)],
              psets: designPset(jt.kind, jt.id ?? null, { Part: p.name, PayItem: pay }),
            });
          }
        }
      }
      return;
    }
    // A pier: its cap, columns and foundations.
    const p = s.pier;
    const lp = lay.piers[i];
    if (!p || !lp) return;
    const capC = center(mid);
    const capId = c.ids?.caps?.[i] ?? null;
    const colId = c.ids?.columns?.[i] ?? null;
    els.push({ cls: "IfcBeam", type: "PIERCAP", name: `${s.name} cap`, part, origin: v3(P(capC.x, capC.y, lp.soffit)), ...flat(lineX, lineY), profile: { kind: "rect", x: p.capLength, y: p.capWidth / 12 }, depth: p.capDepth, material: "Concrete Class D (Bridge)", psets: designPset("stm-d-region", capId, { CapType: p.kind, PayItem: "601-03040 Concrete Class D (Bridge)" }) });
    const xs = p.kind === "hammerhead" ? [p.capLength / 2] : lp.columnsX;
    const f = c.foundations?.[i];
    xs.forEach((x, k) => {
      const t = x - p.capLength / 2;
      const q = { x: capC.x + t * lineX, y: capC.y + t * lineY };
      els.push({ cls: "IfcColumn", type: "PIERSTEM", name: `${s.name} column ${k + 1}`, part, origin: v3(P(q.x, q.y, lp.foundationTop)), ...flat(lineX, lineY), profile: p.columnShape === "round" ? { kind: "circle", r: r6(p.columnSize / 24) } : p.columnSizeBase && Math.abs(p.columnSizeBase - p.columnSize) > 0.5 ? flaredColumn(p.columnSizeBase / 12, p.columnSize / 12, p.columnDepth / 12, lp.columnHeight) : { kind: "rect", x: p.columnSize / 12, y: p.columnDepth / 12 }, depth: r6(lp.columnHeight), material: "Concrete Class D (Bridge)", psets: designPset("pier-column", colId, { PayItem: "601-03040 Concrete Class D (Bridge)" }) });
      if (p.foundation === "drilled-shaft") {
        const sh = (f?.kind === "drilled-shaft" ? (f.inputs as ShaftInputs) : null) ?? SHAFT_DEFAULTS;
        els.push({ cls: "IfcPile", type: "BORED", name: `${s.name} shaft ${k + 1}`, part, origin: v3(P(q.x, q.y, lp.foundationTop)), xdir: v3([lineX, lineY, 0]), zdir: [0, 0, -1], profile: { kind: "circle", r: r6(sh.D / 24) }, depth: sh.length, material: "Concrete (drilled shaft)", psets: designPset("drilled-shaft", f?.id, { Diameter_in: sh.D, PayItem: `503-000${sh.D}` }) });
      } else if (p.foundation === "pile-foundation") {
        const pf = (f?.kind === "pile-foundation" ? (f.inputs as PileInputs) : null) ?? PILE_DEFAULTS;
        const capB = (pf.nB - 1) * pf.sB + 2 * pf.edge;
        const capL = (pf.nL - 1) * pf.sL + 2 * pf.edge;
        const bot = lp.foundationTop - pf.capT / 12;
        els.push({ cls: "IfcFooting", type: "PILE_CAP", name: `${s.name} pile cap ${k + 1}`, part, origin: v3(P(q.x, q.y, bot)), ...flat(lineX, lineY), profile: { kind: "rect", x: capB, y: capL }, depth: r6(pf.capT / 12), material: "Concrete Class D (Bridge)", psets: designPset("pile-foundation", f?.id, { PayItem: "601-03040 Concrete Class D (Bridge)" }) });
        const hp = HP_SECTIONS[pf.section] ?? HP_SECTIONS["HP12x53"];
        const micro = pf.pileType === "micropile";
        const mp = { ...MICROPILE_DEFAULTS, ...(pf.micropile ?? {}) };
        for (let a = 0; a < pf.nB; a++)
          for (let bb = 0; bb < pf.nL; bb++) {
            if (pf.perimeter && a > 0 && a < pf.nB - 1 && bb > 0 && bb < pf.nL - 1) continue;
            const u = -((pf.nB - 1) * pf.sB) / 2 + a * pf.sB;
            const w = -((pf.nL - 1) * pf.sL) / 2 + bb * pf.sL;
            const pp = { x: q.x + u * lineX + w * fw.x, y: q.y + u * lineY + w * fw.y };
            if (micro) {
              els.push({ cls: "IfcPile", type: "BORED", name: `${s.name} micropile ${k + 1}-${a * pf.nL + bb + 1}`, part, origin: v3(P(pp.x, pp.y, bot + mp.embed / 12)), xdir: v3([lineX, lineY, 0]), zdir: [0, 0, -1], profile: { kind: "circle", r: r6(mp.casingOD / 24) }, depth: r6(mp.cased + mp.bond + mp.embed / 12), material: "Steel casing, grouted (micropile)", psets: designPset("pile-foundation", f?.id, { Diameter_in: mp.holeD, PayItem: "503 Micropile" }) });
              continue;
            }
            els.push({ cls: "IfcPile", type: "DRIVEN", name: `${s.name} pile ${k + 1}-${a * pf.nL + bb + 1}`, part, origin: v3(P(pp.x, pp.y, bot + pf.embed / 12)), xdir: v3([lineX, lineY, 0]), zdir: [0, 0, -1], profile: { kind: "ishape", width: r6(hp.bf / 12), depth: r6(hp.d / 12), web: r6(hp.tw / 12), flange: r6(hp.tf / 12) }, depth: r6(pf.length + pf.embed / 12), material: `Steel ${pf.section} Grade 50`, psets: designPset("pile-foundation", f?.id, { Section: pf.section, PayItem: "502 Steel Piling" }) });
          }
      } else {
        const ft = (f?.kind === "spread-footing" ? (f.inputs as FootingInputs) : null) ?? FOOTING_DEFAULTS;
        els.push({ cls: "IfcFooting", type: "PAD_FOOTING", name: `${s.name} footing ${k + 1}`, part, origin: v3(P(q.x, q.y, lp.foundationTop - ft.t / 12)), ...flat(lineX, lineY), profile: { kind: "rect", x: ft.B, y: ft.L }, depth: r6(ft.t / 12), material: "Concrete Class D (Bridge)", psets: designPset("spread-footing", f?.id, { PayItem: "601-03040 Concrete Class D (Bridge)" }) });
      }
    });
  });

  // Every element a colour by what it is.
  for (const e of els) {
    if (e.color) continue;
    const col =
      e.cls === "IfcBearing" ? COLORS.bearing
      : e.cls === "IfcBeam" && e.type === "GIRDER_SEGMENT" ? COLORS.girder
      : e.cls === "IfcPile" && e.type === "DRIVEN" ? COLORS.steel
      : e.cls === "IfcPile" || e.cls === "IfcFooting" ? COLORS.foundation
      : e.cls === "IfcSlab" ? COLORS.approach
      : COLORS.sub;
    e.color = [...col];
  }

  return {
    name,
    origin: { northing: s0.y, easting: s0.x },
    alignment: { name: "Alignment", segments, vpoints: vpoints.map(([d, z]) => [r6(d), r6(z)]), lengths: vsel.map((v) => v.L), startStation: sA },
    parts,
    elements: els,
  };
}

/** A flared column as a closed solid in its placement's frame (x across the bridge, y along it, z up): wB wide at its base, wT under the cap, d deep, h tall (ft). */
export function flaredColumn(wB: number, wT: number, d: number, h: number): Profile {
  const pts: V3[] = [
    [-wB / 2, -d / 2, 0], [wB / 2, -d / 2, 0], [wB / 2, d / 2, 0], [-wB / 2, d / 2, 0],
    [-wT / 2, -d / 2, h], [wT / 2, -d / 2, h], [wT / 2, d / 2, h], [-wT / 2, d / 2, h],
  ].map((p) => v3(p as V3));
  const tris: [number, number, number][] = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  return { kind: "mesh", ...outward({ pts, tris }) };
}

/** A ring (a pot's wall, a disc with its pin's hole) as a closed mesh in its own frame: D outside, d inside, h high (ft). */
export function ringMesh(D: number, d: number, h: number, n = 32) {
  const pts: V3[] = [];
  for (const [r, z] of [[D / 2, 0], [D / 2, h], [d / 2, 0], [d / 2, h]] as const) for (let k = 0; k < n; k++) pts.push([r * Math.cos((2 * Math.PI * k) / n), r * Math.sin((2 * Math.PI * k) / n), z]);
  const ob = 0, ot = n, ib = 2 * n, it = 3 * n;
  const tris: [number, number, number][] = [];
  for (let k = 0; k < n; k++) {
    const k1 = (k + 1) % n;
    tris.push([ob + k, ob + k1, ot + k1], [ob + k, ot + k1, ot + k]); // outside
    tris.push([ib + k, it + k1, ib + k1], [ib + k, it + k, it + k1]); // inside
    tris.push([ot + k, ot + k1, it + k1], [ot + k, it + k1, it + k]); // top
    tris.push([ob + k, ib + k1, ob + k1], [ob + k, ib + k, ib + k1]); // bottom
  }
  return { pts, tris };
}
