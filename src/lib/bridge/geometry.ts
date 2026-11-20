import type { Alignment, Profile, RoadwaySection } from "../design/bridge/alignment";
import { BRIDGE_GIRDER_BASE, PIER_DEFAULTS, type BridgeInputs, type PierShape, type Support, type SupportType } from "../design/bridge/bridge";
import { railDef, railWeight } from "../design/decks/rails";
import { GIRDER_RAIL_DEFAULT } from "../design/girders/bridge-deck";
import type { BridgeDefinition } from "./definition";

// A bridge's geometry, as a girder bridge's description takes it (the alignment, profile and roadway
// section; each support at its station with its skew, type, girder end distance, bearing offset and
// height, girder spacing and pier; the bridge line, the deck's edges and the slab offset): the Bridge
// design's description (src/lib/design/bridge), carried by the Bridge section's definition.
//
// A definition without it (made before it, or by the wizard alone) has one worked out from its spans,
// skew, overhang and haunch: a straight, level alignment with the supports at the spans' ends. With it,
// the spans and the supports' stations stay in step (the spans lead: a station's change is a change of
// the spans beside it), and the definition's skew, continuity, overhang, haunch and bearing height are
// read from it; changing one of those writes it back (applyEdit).

export type BridgeGeometry = {
  alignment: Alignment;
  profile: Profile;
  roadway: RoadwaySection;
  supports: Support[]; // one per support line, from the first abutment to the last
  bridgeLineOffset: number; // ft, the girders' center from the alignment, + right
  leftEdge: number; // ft, the bridge line to the deck's left edge
  rightEdge: number;
  slabOffset: number; // in, the deck's top to the girder's top at the bearings ("A")
  rail: NonNullable<BridgeInputs["rail"]>;
};

export const SUPPORT_TYPES: { value: SupportType; label: string }[] = [
  { value: "integral-abutment", label: "Integral abutment" },
  { value: "semi-integral-abutment", label: "Semi-integral abutment" },
  { value: "seat-abutment", label: "Seat abutment" },
  { value: "continuous-pier", label: "Pier, girders continuous" },
  { value: "simple-pier", label: "Pier, girders simple (joint)" },
];
const isAbutment = (t: SupportType) => t.endsWith("abutment");

export const lineName = (n: number, k: number) => (k === 0 ? "Abutment 1" : k === n - 1 ? "Abutment 2" : `Pier ${k}`);

/** A pier's description from the definition's piers (the wizard's one pier for all). */
export function pierFrom(d: BridgeDefinition): PierShape {
  const p = d.piers;
  return {
    ...PIER_DEFAULTS,
    kind: p.columns === 1 ? "hammerhead" : "multicolumn",
    capLength: +Math.max((p.columns - 1) * p.columnSpacing + p.columnDiameter + 2, (d.nGirders - 1) * d.spacing + 2).toFixed(3),
    capDepth: p.capDepth,
    capWidth: p.capWidth * 12,
    columns: p.columns,
    columnSpacing: p.columnSpacing,
    columnShape: "round",
    columnSize: p.columnDiameter * 12,
    columnDepth: p.columnDiameter * 12,
    foundationTop: 0,
  };
}

/** A support line for a definition's support k (a new pier, or an abutment). */
function supportFor(d: BridgeDefinition, n: number, k: number, station: number): Support {
  const abutment = k === 0 || k === n - 1;
  return {
    name: lineName(n, k),
    station,
    skew: d.skew,
    type: abutment ? "seat-abutment" : d.continuity === "simple" ? "simple-pier" : "continuous-pier",
    endDistance: 0.75,
    bearingOffset: 0,
    bearingHeight: d.piers.bearingHeight,
    ...(abutment ? {} : { pier: pierFrom(d) }),
  };
}

/** The geometry a definition has, or one worked out from its spans: straight, level, the supports at the spans' ends. */
export function geometryOf(d: BridgeDefinition): BridgeGeometry {
  if (d.geometry) return d.geometry;
  const half = ((d.nGirders - 1) * d.spacing) / 2;
  const n = d.spans.length + 1;
  let s = 0;
  const stations = [0, ...d.spans.map((L) => (s += L))];
  return {
    alignment: { refStation: 0, northing: 0, easting: 0, azimuth: 90, curves: [] },
    profile: { station: 0, elevation: 100, grade: 0, curves: [] },
    roadway: { leftSlope: -0.02, rightSlope: -0.02, crownOffset: 0 },
    supports: stations.map((st, k) => supportFor(d, n, k, st)),
    bridgeLineOffset: 0,
    leftEdge: half + d.overhang,
    rightEdge: half + d.overhang,
    slabOffset: d.deck.thickness + d.deck.haunch,
    rail: { ...GIRDER_RAIL_DEFAULT },
  };
}

const r6 = (v: number) => Math.round(v * 1e6) / 1e6;

/**
 * The definition with its geometry and its own values in step: a support line for each end of every span
 * (stations from the first, the spans apart; names kept, the ends abutments), and the skew, continuity,
 * overhang, haunch and bearing height read from the geometry. A definition without geometry is returned as is.
 */
export function reconcile(d: BridgeDefinition): BridgeDefinition {
  if (!d.geometry) return d;
  const g = d.geometry;
  const n = d.spans.length + 1;
  let st = g.supports[0]?.station ?? 0;
  const supports = Array.from({ length: n }, (_, k) => {
    if (k > 0) st += d.spans[k - 1];
    // The last support stays the last abutment; piers added between keep their places, new ones are made.
    const old = k === n - 1 ? g.supports[g.supports.length - 1] : k < g.supports.length - 1 || k === 0 ? g.supports[k] : undefined;
    const base = old ?? supportFor(d, n, k, st);
    let type = base.type;
    if ((k === 0 || k === n - 1) && !isAbutment(type)) type = "seat-abutment";
    if (k > 0 && k < n - 1 && isAbutment(type)) type = d.continuity === "simple" ? "simple-pier" : "continuous-pier";
    const pier = k > 0 && k < n - 1 ? (base.pier ?? pierFrom(d)) : undefined;
    const { pier: _drop, ...rest } = base;
    void _drop;
    return { ...rest, station: r6(st), type, ...(pier ? { pier } : {}) };
  });
  const piers = supports.slice(1, -1);
  const half = ((d.nGirders - 1) * d.spacing) / 2;
  // A CDOT standard rail sets the barrier: its weight from its worksheet (railWeight), its width at the base.
  const rail = g.rail.type !== "custom" ? railDef(g.rail.type) : null;
  const loads = rail ? { ...d.loads, barrierWeight: +railWeight(rail, d.deck.wc).klf.toFixed(4), barrierWidth: rail.width / 12 } : d.loads;
  return {
    ...d,
    loads,
    skew: supports[0].skew,
    continuity: piers.length && piers.every((p) => p.type === "simple-pier") ? "simple" : d.spans.length > 1 ? "continuous" : d.continuity,
    overhang: r6(Math.max(0, (g.leftEdge - half + (g.rightEdge - half)) / 2)), // the wizard's one overhang: the two sides' mean
    deck: { ...d.deck, haunch: r6(Math.max(0, g.slabOffset - d.deck.thickness)) },
    piers: { ...d.piers, bearingHeight: Math.max(...supports.map((s) => s.bearingHeight)) },
    geometry: { ...g, supports },
  };
}

/**
 * An edit of the definition's own values carried into its geometry: the skew to every support, the
 * continuity to the piers' types, the overhang (or a change of girders or spacing, which keeps each
 * side's overhang) to the deck's edges, the haunch (or the deck's thickness, which keeps the haunch)
 * to the slab offset, the bearing height to every support. Then reconciled.
 */
export function applyEdit(prev: BridgeDefinition, next: BridgeDefinition): BridgeDefinition {
  if (!next.geometry) return next;
  let g = next.geometry;
  if (next.skew !== prev.skew) g = { ...g, supports: g.supports.map((s) => ({ ...s, skew: next.skew })) };
  if (next.continuity !== prev.continuity) g = { ...g, supports: g.supports.map((s) => (isAbutment(s.type) ? s : { ...s, type: next.continuity === "simple" ? "simple-pier" : "continuous-pier" })) };
  const halfPrev = ((prev.nGirders - 1) * prev.spacing) / 2;
  const halfNext = ((next.nGirders - 1) * next.spacing) / 2;
  if (next.overhang !== prev.overhang) g = { ...g, leftEdge: r6(halfNext + next.overhang), rightEdge: r6(halfNext + next.overhang) };
  else if (halfNext !== halfPrev) g = { ...g, leftEdge: r6(g.leftEdge - halfPrev + halfNext), rightEdge: r6(g.rightEdge - halfPrev + halfNext) };
  if (next.deck.haunch !== prev.deck.haunch || next.deck.thickness !== prev.deck.thickness) g = { ...g, slabOffset: r6(next.deck.thickness + next.deck.haunch) };
  if (next.piers.bearingHeight !== prev.piers.bearingHeight) g = { ...g, supports: g.supports.map((s) => ({ ...s, bearingHeight: next.piers.bearingHeight })) };
  return reconcile({ ...next, geometry: g });
}

/** The definition with an edit of its geometry: the supports' stations become the spans; then reconciled. */
export function withGeometry(d: BridgeDefinition, g: BridgeGeometry): BridgeDefinition {
  const st = g.supports.map((s) => s.station);
  const spans = st.slice(1).map((v, k) => r6(Math.max(10, v - st[k])));
  return reconcile({ ...d, spans: spans.length ? spans : d.spans, geometry: { ...g, supports: g.supports.map((s, k) => ({ ...s, station: k ? r6(st[0] + spans.slice(0, k).reduce((a, b) => a + b, 0)) : s.station })) } });
}

// --- reading a saved geometry --------------------------------------------------------------------------------------------

const num = (v: unknown, d: number, lo = -Infinity, hi = Infinity) => (typeof v === "number" && Number.isFinite(v) ? Math.min(Math.max(v, lo), hi) : d);
const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const list = (v: unknown, max: number) => (Array.isArray(v) ? v.slice(0, max).map(obj) : []);
const TYPES = new Set(SUPPORT_TYPES.map((t) => t.value));

function parsePier(v: unknown): PierShape | undefined {
  if (!v || typeof v !== "object") return undefined;
  const p = obj(v);
  const d = PIER_DEFAULTS;
  return {
    kind: p.kind === "hammerhead" ? "hammerhead" : "multicolumn",
    capLength: num(p.capLength, d.capLength, 2, 300),
    capDepth: num(p.capDepth, d.capDepth, 1, 20),
    capWidth: num(p.capWidth, d.capWidth, 12, 240),
    columns: Math.round(num(p.columns, d.columns, 1, 10)),
    columnSpacing: num(p.columnSpacing, d.columnSpacing, 2, 100),
    columnShape: p.columnShape === "rectangular" ? "rectangular" : "round",
    columnSize: num(p.columnSize, d.columnSize, 12, 240),
    columnDepth: num(p.columnDepth, d.columnDepth, 12, 240),
    ...(typeof p.columnSizeBase === "number" && p.columnSizeBase >= 12 && p.columnSizeBase <= 240 ? { columnSizeBase: p.columnSizeBase } : {}),
    foundationTop: num(p.foundationTop, 0, -1e5, 1e5),
    foundation: p.foundation === "pile-foundation" || p.foundation === "drilled-shaft" ? p.foundation : "spread-footing",
  };
}

/** A saved geometry, kept within what the layout takes; null when there's none (or not enough of one). */
export function parseGeometry(v: unknown): BridgeGeometry | null {
  if (!v || typeof v !== "object") return null;
  const g = obj(v);
  const al = obj(g.alignment);
  const pr = obj(g.profile);
  const rw = obj(g.roadway);
  const supports = list(g.supports, 9).map(
    (s, k): Support => ({
      name: typeof s.name === "string" && s.name.trim() ? s.name.slice(0, 40) : `Support ${k + 1}`,
      station: num(s.station, 0, -1e7, 1e7),
      skew: num(s.skew, 0, -60, 60),
      type: TYPES.has(s.type as SupportType) ? (s.type as SupportType) : "continuous-pier",
      endDistance: num(s.endDistance, 0.75, 0, 5),
      bearingOffset: num(s.bearingOffset, 0, -5, 5),
      bearingHeight: num(s.bearingHeight, 2, 0, 36),
      ...(num(s.spacing, 0, 0, 20) > 0 ? { spacing: num(s.spacing, 0, 2, 20) } : {}),
      ...(parsePier(s.pier) ? { pier: parsePier(s.pier) } : {}),
    }),
  );
  if (supports.length < 2) return null;
  const rail = obj(g.rail);
  return {
    alignment: {
      refStation: num(al.refStation, 0, -1e7, 1e7),
      northing: num(al.northing, 0, -1e8, 1e8),
      easting: num(al.easting, 0, -1e8, 1e8),
      azimuth: num(al.azimuth, 90, -360, 720),
      curves: list(al.curves, 20).map((c) => ({ pi: num(c.pi, 0, -1e7, 1e7), radius: num(c.radius, 1000, 50, 1e6), azimuth: num(c.azimuth, 90, -360, 720), spiralIn: num(c.spiralIn, 0, 0, 2000), spiralOut: num(c.spiralOut, 0, 0, 2000) })),
    },
    profile: {
      station: num(pr.station, 0, -1e7, 1e7),
      elevation: num(pr.elevation, 100, -1000, 30000),
      grade: num(pr.grade, 0, -15, 15),
      curves: list(pr.curves, 20).map((c) => ({ pvi: num(c.pvi, 0, -1e7, 1e7), grade: num(c.grade, 0, -15, 15), length: num(c.length, 0, 0, 5000) })),
    },
    roadway: {
      leftSlope: num(rw.leftSlope, -0.02, -0.15, 0.15),
      rightSlope: num(rw.rightSlope, -0.02, -0.15, 0.15),
      crownOffset: num(rw.crownOffset, 0, -200, 200),
      ...(Array.isArray(rw.sections) ? { sections: list(rw.sections, 20).map((t) => ({ station: num(t.station, 0, -1e7, 1e7), leftSlope: num(t.leftSlope, -0.02, -0.15, 0.15), rightSlope: num(t.rightSlope, -0.02, -0.15, 0.15), crownOffset: num(t.crownOffset, 0, -200, 200) })) } : {}),
    },
    supports,
    bridgeLineOffset: num(g.bridgeLineOffset, 0, -200, 200),
    leftEdge: num(g.leftEdge, 20, 1, 200),
    rightEdge: num(g.rightEdge, 20, 1, 200),
    slabOffset: num(g.slabOffset, 10.5, 0, 48),
    rail: { ...GIRDER_RAIL_DEFAULT, ...(typeof rail.type === "string" ? { type: rail.type as typeof GIRDER_RAIL_DEFAULT.type } : {}), ...(typeof rail.testLevel === "string" ? { testLevel: rail.testLevel as typeof GIRDER_RAIL_DEFAULT.testLevel } : {}), ...(typeof rail.steel === "string" ? { steel: rail.steel as typeof GIRDER_RAIL_DEFAULT.steel } : {}) },
  };
}

// --- the Bridge design's description -------------------------------------------------------------------------------------

/** The definition as the Bridge design's description (src/lib/design/bridge/bridge.ts BridgeInputs), for its layout, load path, IFC model and calc. */
export function toBridgeInputs(d: BridgeDefinition): BridgeInputs {
  const g = reconcile({ ...d, geometry: geometryOf(d) }).geometry!;
  return {
    alignment: g.alignment,
    profile: g.profile,
    roadway: g.roadway,
    supports: g.supports.map((s, k) => ({ ...s, ...(d.supports[k]?.bearing ? { bearing: d.supports[k].bearing } : {}), ...(d.supports[k]?.bearingKind && d.supports[k].bearingKind !== "elastomeric" ? { bearingKind: d.supports[k].bearingKind } : {}), ...(d.supports[k]?.jointKind && d.supports[k].jointKind !== "auto" ? { jointKind: d.supports[k].jointKind } : {}) })),
    shape: d.girder.shape === "custom" ? BRIDGE_GIRDER_BASE.shape : d.girder.shape,
    superstructure: d.superstructure === "slab" ? "slab" : "girders",
    nGirders: d.nGirders,
    spacing: d.spacing,
    bridgeLineOffset: g.bridgeLineOffset,
    leftEdge: g.leftEdge,
    rightEdge: g.rightEdge,
    barrierWidth: d.loads.barrierWidth,
    deckT: d.deck.thickness,
    sacrificial: d.deck.sacrificial,
    slabOffset: g.slabOffset,
    fcDeck: d.deck.fc,
    fws: d.loads.wearingSurface,
    rail: g.rail,
    girderDesignIds: [],
    components: [],
  };
}
