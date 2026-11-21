import { designGirder, GIRDER_DEFAULTS, girderShape, liveLoad, type GirderInputs } from "../girders/prestressed";
import { railDef } from "../decks/rails";
import type { SiteWind } from "../girders/substructure-loads";
import { designSteelGirder, STEEL_DEFAULTS, type SteelGirderInputs, type SteelGirderResult } from "../girders/steel";
import { deepestSteelShape, STEEL_GIRDER_DEFAULT, type SteelSegment } from "../girders/steel-section";
import type { GirderShape } from "../girders/sections";
import { isAdjacent } from "../girders/sections";
import { designSlabBridge, SLAB_BRIDGE_DEFAULTS, type SlabBridgeInputs, type SlabBridgeResult } from "../slabs/slab-bridge";
import { continuousEndShear, continuousLaneReaction } from "../girders/substructure-loads";
import { applyRail } from "../girders/bridge-deck";
import { DesignError } from "../walls/cip";
import { crossSlopeAt, deckElevation, horizontalElements, pointAt, profileAt, profileGeometry, stationOffset, type Alignment, type Profile, type RoadwaySection } from "./alignment";

// A girder bridge described once, the way PGSuper's Bridge Description takes it (docs/bridge-model.md):
// its alignment, profile and roadway section, its supports (abutments and piers at stations, each with
// its orientation, connection, girder end distance and bearing offset), its girders and deck. From it:
// the layout (each girder's span bearing to bearing, the skews, the deck and seat elevations), the
// girder check run with that layout, and each support's reactions for the substructure. Feet and kips.

export type SupportType = "integral-abutment" | "semi-integral-abutment" | "seat-abutment" | "continuous-pier" | "simple-pier";

export type Support = {
  name: string;
  station: number;
  skew: number; // deg, the support line from the alignment's normal, + clockwise (PGSuper "R")
  type: SupportType;
  endDistance: number; // ft, the girder's end to its bearing's centerline, along the girder
  bearingOffset: number; // ft, the support's line to the bearings' centerline, normal to the support
  bearingHeight: number; // in, the bearing (or leveling pad) under the girder
  /** ft, the girder spacing at this support, normal to the alignment (0 or none: the bridge's). Spacings that differ from one support to the next flare the girders, as PGSuper's spacing at each support. */
  spacing?: number;
  /** A pier's physical description, as PGSuper's physical pier model: its cap, columns and the top of its foundation. */
  pier?: PierShape;
  /** Fixed bearings hold the girders along the bridge; expansion bearings let them slide (the Bridge section's support lines). */
  bearing?: "fixed" | "expansion";
  /** The bearings' type: elastomeric pads (default), or pot or disc bearings (the Pot or Disc Bearing design). */
  bearingKind?: "elastomeric" | "pot" | "disc";
  /** At an abutment, its expansion device: recommended from the movement (default), or the one chosen. */
  jointKind?: "auto" | "strip-seal" | "modular" | "finger";
};

export type PierShape = {
  kind: "multicolumn" | "hammerhead";
  capLength: number; // ft, along the support line
  capDepth: number; // ft
  capWidth: number; // in, along the bridge
  columns: number;
  columnSpacing: number; // ft
  columnShape: "round" | "rectangular";
  columnSize: number; // in (round: diameter; rectangular: across the bridge)
  columnDepth: number; // in, a rectangular column along the bridge
  /** in, a flared rectangular column's width across the bridge at its base (columnSize is under the cap); none: prismatic. */
  columnSizeBase?: number;
  foundationTop: number; // ft, the elevation of the footing's or shaft's top (0: 20 ft below the cap's soffit)
  foundation: "spread-footing" | "pile-foundation" | "drilled-shaft";
};

/** A pier's description to start from: a three-column bent under the deck's width. */
export const PIER_DEFAULTS: PierShape = { kind: "multicolumn", capLength: 46, capDepth: 4.5, capWidth: 48, columns: 3, columnSpacing: 18, columnShape: "round", columnSize: 42, columnDepth: 42, foundationTop: 0, foundation: "spread-footing" };

/** The expansion device's design kind at an abutment. */
export type JointKind = "strip-seal-joint" | "modular-joint" | "finger-joint";

export type BridgeInputs = {
  alignment: Alignment;
  profile: Profile;
  roadway: RoadwaySection;
  supports: Support[];
  // Superstructure (PGSuper's General tab)
  shape: string; // the girder library's id, or "steel" (a plate girder, `steel`)
  /** A steel plate girder's plates along the bridge (shape "steel"). */
  steel?: { segments: SteelSegment[]; Fyw: number; Fyf: number };
  /** The site's wind and the barrier's height (the Bridge's environment), for a steel bridge's wind on the substructure. */
  site?: SiteWind;
  nGirders: number;
  spacing: number; // ft, normal to the alignment
  bridgeLineOffset: number; // ft, the bridge line (the girders' center) from the alignment, + right
  leftEdge: number; // ft, the bridge line to the deck's left edge
  rightEdge: number;
  barrierWidth: number; // ft, the deck's edge to the barrier's inside face
  /** Sidewalks inside the barriers (ft wide each side; in above the deck). */
  sidewalks?: { left: number; right: number; depth: number };
  deckT: number; // in
  sacrificial: number; // in
  slabOffset: number; // in, the top of the deck to the top of the girder at the bearings ("A")
  fcDeck: number;
  fws: number; // psf
  /** The bridge rail on both edges: a CDOT standard rail (B-606) or "custom" (the barrier width above, a generic parapet in the model). */
  rail?: GirderInputs["rail"];
  /**
   * The superstructure: precast or steel girders under a deck (the default), or a cast-in-place slab bridge (its depth
   * the deck's, deckT; its bearing lines at the girder spacing; the Slab Bridge design `slabDesignId`).
   */
  superstructure?: "girders" | "slab";
  slabDesignId?: string | null;
  /** The deck slab's design (the deck between the girders, the overhang and the rail), set and created by the Bridge. */
  deckDesignId?: string | null;
  // The linked designs (the Bridge sets their layout and loads)
  girderDesignIds: (string | null)[]; // one per group of spans (continuous across continuous piers)
  components: { support: number; bearingId?: string | null; abutmentId?: string | null; approachSlabId?: string | null; wingwallId?: string | null; jointId?: string | null; capId?: string | null; columnId?: string | null; foundationId?: string | null; foundationKind?: "spread-footing" | "pile-foundation" | "drilled-shaft" | null; jointKind?: JointKind | null }[];
};

/** A two-span continuous BT-72 bridge, 120 ft spans, on a tangent with a sag vertical curve, integral abutments. */
export const BRIDGE_DEFAULTS: BridgeInputs = {
  alignment: { refStation: 1000, northing: 10000, easting: 10000, azimuth: 90, curves: [] },
  profile: { station: 1000, elevation: 5280, grade: -1.5, curves: [{ pvi: 1150, grade: 1.0, length: 200 }] },
  roadway: { leftSlope: -0.02, rightSlope: -0.02, crownOffset: 0 },
  supports: [
    { name: "Abutment 1", station: 1030, skew: 0, type: "integral-abutment", endDistance: 1, bearingOffset: 1, bearingHeight: 1 },
    { name: "Pier 2", station: 1152, skew: 0, type: "continuous-pier", endDistance: 0.75, bearingOffset: 1, bearingHeight: 2, pier: PIER_DEFAULTS },
    { name: "Abutment 3", station: 1274, skew: 0, type: "integral-abutment", endDistance: 1, bearingOffset: 1, bearingHeight: 1 },
  ],
  shape: GIRDER_DEFAULTS.shape,
  nGirders: 6,
  spacing: 8,
  bridgeLineOffset: 0,
  leftEdge: 23.5,
  rightEdge: 23.5,
  barrierWidth: 1.5,
  deckT: 8.5,
  sacrificial: 0.5,
  slabOffset: 10.5,
  fcDeck: 4.5,
  fws: 25,
  girderDesignIds: [],
  components: [],
};

/** The girder check's starting details for a Bridge with no girder design linked: the library's defaults,
 * counting only the positive creep and shrinkage restraint moments at continuous piers (one of the
 * girder check's options; the negative ones would need a stronger girder concrete at the pier). */
export const BRIDGE_GIRDER_BASE: GirderInputs = { ...GIRDER_DEFAULTS, restraintMoments: "positive" };

const rad = (d: number) => (d * Math.PI) / 180;
const isAbutment = (t: SupportType) => t.endsWith("abutment");
const castInAt = (s: Support | undefined) => !!s && (s.type === "integral-abutment" || s.type === "semi-integral-abutment");

/**
 * The Bridge's sidewalks as a girder design takes them: the narrower one's width (the lanes keep to the curbs; the
 * wheel nearer the exterior girder, the conservative side), and their concrete (0.150 kcf) and pedestrians (0.075 ksf on
 * those wider than 2 ft, 3.6.1.6) shared equally by the girders, klf each. Undefined without sidewalks.
 */
export function sidewalkLoads(b: Pick<BridgeInputs, "sidewalks" | "nGirders">) {
  const sw = b.sidewalks;
  if (!sw || sw.left + sw.right <= 0) return undefined;
  const r = (v: number) => Math.round(v * 10000) / 10000;
  const ped = (w: number) => (w > 2 ? w : 0);
  return { width: Math.min(sw.left, sw.right), dc: r(((sw.left + sw.right) * (sw.depth / 12) * 0.15) / b.nGirders), pl: r(((ped(sw.left) + ped(sw.right)) * 0.075) / b.nGirders) };
}

/** The Bridge's girder as a shape: the library's, or a steel plate girder's deepest segment. */
export function bridgeGirderShape(b: Pick<BridgeInputs, "shape" | "steel">): GirderShape {
  return b.shape === "steel" ? (deepestSteelShape((b.steel ?? STEEL_GIRDER_DEFAULT).segments) as GirderShape) : girderShape({ ...GIRDER_DEFAULTS, shape: b.shape });
}

/** Where every girder sits and how long it spans: the Bridge's layout. */
export function bridgeLayout(b: BridgeInputs) {
  if (b.supports.length < 2) throw new DesignError("The bridge needs at least two supports.");
  if (!isAbutment(b.supports[0].type) || !isAbutment(b.supports[b.supports.length - 1].type)) throw new DesignError("The first and last supports are abutments.");
  for (let k = 1; k < b.supports.length; k++) if (!(b.supports[k].station > b.supports[k - 1].station)) throw new DesignError("The supports' stations must increase from the first abutment to the last.");
  if (!(b.nGirders >= 2 && b.spacing > 0)) throw new DesignError("The bridge needs at least two girders and a spacing.");
  const cache = horizontalElements(b.alignment);
  const vcs = profileGeometry(b.profile);
  const shape = bridgeGirderShape(b);
  // A slab bridge: no girders; the slab (deckT deep) sits on its bearing lines (docs/slab-and-box-bridges.md).
  const slab = b.superstructure === "slab";
  const depth = slab ? 0 : shape.depth; // in
  // Boxes and slab beams side by side: the spacing at least their width (CDOT sheets B-618-BX, -SL: no keyways, a joint between).
  if (!slab && isAdjacent(shape) && b.supports.some((s) => spacingAt(b, s) * 12 < shape.topWidth - 1e-6)) throw new DesignError(`The ${shape.name}s are ${shape.topWidth} in wide: the spacing must be at least that (side by side, a joint between).`);
  const offsetsAt = (sp: number) => Array.from({ length: b.nGirders }, (_, k) => b.bridgeLineOffset + (k - (b.nGirders - 1) / 2) * sp);
  const offsets = offsetsAt(b.spacing);

  // Each support: where its line crosses each girder line.
  const supports = b.supports.map((s) => {
    const p = pointAt(b.alignment, s.station, cache);
    const lineAz = p.az + 90 + s.skew; // the support's line, toward the right
    const ends = offsetsAt(spacingAt(b, s)).map((o) => {
      // The support line from the alignment point: x = p + t·u; the girder line at offset o: its normal offset is o.
      // For a skew θ the line reaches normal offset o after t = o / cos θ.
      const t = o / Math.cos(rad(s.skew));
      const x = p.x + t * Math.sin(rad(lineAz));
      const y = p.y + t * Math.cos(rad(lineAz));
      const so = stationOffset(b.alignment, x, y, s.station + o * Math.tan(rad(s.skew)), cache);
      return { x, y, station: so.station, offset: so.offset };
    });
    const grade = profileAt(b.profile, s.station, vcs).grade;
    return { ...s, x: p.x, y: p.y, az: p.az, lineAz, ends, grade, R: p.R };
  });

  // Each span, each girder: the chord between the support lines, less the end distances to the bearings.
  const spans = supports.slice(0, -1).map((s0, j) => {
    const s1 = supports[j + 1];
    const girders = offsets.map((_, k) => {
      const a = s0.ends[k];
      const c = s1.ends[k];
      const o = (a.offset + c.offset) / 2; // a flared girder's offset at midspan
      const chord = Math.hypot(c.x - a.x, c.y - a.y);
      const gAz = (Math.atan2(c.x - a.x, c.y - a.y) * 180) / Math.PI;
      // The bearing offset is normal to the support; along the girder it's longer by 1/cos of the angle between them.
      const along = (s: (typeof supports)[number]) => s.bearingOffset / Math.max(0.2, Math.abs(Math.cos(rad(gAz - (s.lineAz - 90)))));
      const L = chord - along(s0) - along(s1); // CL bearing to CL bearing
      const len = L + s0.endDistance + s1.endDistance; // the girder's length
      // Top of deck over each bearing and at midspan, along the girder's line.
      const at = (f: number) => {
        const xb = a.x + (c.x - a.x) * f;
        const yb = a.y + (c.y - a.y) * f;
        const so = stationOffset(b.alignment, xb, yb, a.station + (c.station - a.station) * f, cache);
        return { x: xb, y: yb, station: so.station, offset: so.offset, deck: deckElevation(b.profile, b.roadway, so.station, so.offset, vcs) };
      };
      const fb = along(s0) / chord;
      const fe = 1 - along(s1) / chord;
      const start = at(fb);
      const end = at(fe);
      const mid = at((fb + fe) / 2);
      // The profile above the bearing-to-bearing chord at midspan (+ crest), in: what the haunch must absorb.
      const ordinate = (mid.deck - (start.deck + end.deck) / 2) * 12;
      const seat = (d: number, s: (typeof supports)[number]) => d - (slab ? b.deckT : b.slabOffset) / 12 - depth / 12 - s.bearingHeight / 12;
      return { k, offset: o, chord, L, length: len, azimuth: gAz, start: { ...start, seat: seat(start.deck, s0) }, end: { ...end, seat: seat(end.deck, s1) }, ordinate, crossSlope: crossSlopeAt(b.roadway, mid.offset, mid.station), flare: c.offset - a.offset };
    });
    const L = Math.max(...girders.map((g) => g.L));
    return { index: j, from: s0.name, to: s1.name, girders, L, skew: Math.max(Math.abs(s0.skew), Math.abs(s1.skew)) };
  });
  const width = b.leftEdge + b.rightEdge;
  const piers = supports.map((sp, k) => {
    if (!sp.pier) return null;
    const seats = [...(k > 0 ? spans[k - 1].girders.map((g) => g.end.seat) : []), ...(k < spans.length ? spans[k].girders.map((g) => g.start.seat) : [])];
    const capTop = Math.min(...seats);
    const soffit = capTop - sp.pier.capDepth;
    const foundationTop = sp.pier.foundationTop > 0 ? sp.pier.foundationTop : soffit - 20;
    if (foundationTop >= soffit) throw new DesignError(`${sp.name}: the foundation's top is above the cap's soffit.`);
    const xs = Array.from({ length: sp.pier.columns }, (_, c) => sp.pier!.capLength / 2 + (c - (sp.pier!.columns - 1) / 2) * sp.pier!.columnSpacing);
    if (xs.some((x) => x <= 0 || x >= sp.pier!.capLength)) throw new DesignError(`${sp.name}: the columns don't fit under the cap.`);
    return { capTop, soffit, foundationTop, columnHeight: soffit - foundationTop, columnsX: xs };
  });
  const overhang = Math.min(b.leftEdge, b.rightEdge) - ((b.nGirders - 1) / 2) * Math.max(...b.supports.map((s) => spacingAt(b, s)));
  if (overhang <= 0) throw new DesignError("The deck's edges are inside the exterior girders: widen the deck or narrow the spacing.");
  const length = supports[supports.length - 1].station - supports[0].station;
  return { supports, spans, piers, offsets, depth, width, overhang, length, shapeName: shape.name };
}

export type BridgeLayout = ReturnType<typeof bridgeLayout>;

/** The girder spacing at a support (ft, normal to the alignment): its own, else the bridge's. */
export const spacingAt = (b: BridgeInputs, s: Support) => (s.spacing && s.spacing > 0 ? s.spacing : b.spacing);

/** The bridge's spans grouped into girder designs: continuous across continuous piers, separate at the others. */
export function spanGroups(b: BridgeInputs) {
  const groups: number[][] = [[0]];
  for (let j = 1; j < b.supports.length - 1; j++) {
    if (b.supports[j].type === "continuous-pier") groups[groups.length - 1].push(j);
    else groups.push([j]);
  }
  return groups;
}

/** The girder check's inputs for a group of spans: the linked girder design's details with the Bridge's layout. */
export function girderInputsFor(b: BridgeInputs, lay: BridgeLayout, group: number[], base: GirderInputs = BRIDGE_GIRDER_BASE): GirderInputs {
  const spans = group.map((j) => lay.spans[j]);
  const first = spans[0];
  const crossSlope = Math.max(...spans.flatMap((s) => s.girders.map((g) => Math.abs(g.crossSlope))));
  const ordinates = spans.map((s) => s.girders.reduce((a, g) => (Math.abs(g.ordinate) > Math.abs(a) ? g.ordinate : a), 0));
  const pier = group.length > 1 ? b.supports[group[0] + 1] : null;
  const inner = b.supports[group[0]];
  // Harped strands that end above the section (a starting pattern for a deeper girder) brought down to
  // 11 in below its top, so a new girder design of any section can run.
  const depth = bridgeGirderShape(b).depth;
  const fit = <H extends { count: number; yEnd: number } | null | undefined>(h: H): H => (h && h.count > 0 && h.yEnd > depth - 6 ? { ...h, yEnd: Math.round(depth - 11) } : h);
  const out: GirderInputs = {
    ...base,
    harped: fit(base.harped),
    shape: b.shape,
    L: first.L,
    endDist: inner.endDistance,
    nGirders: b.nGirders,
    S: Math.max(...b.supports.slice(group[0], group[group.length - 1] + 2).map((s) => spacingAt(b, s))), // flared: the widest spacing in the group
    overhang: lay.overhang,
    barrierWidth: b.barrierWidth,
    skew: Math.max(...spans.map((s) => s.skew)),
    deckT: b.deckT,
    sacrificial: b.sacrificial,
    // The slab offset sets the haunch at the bearings; the girder works out its dead load haunch (BDM 5.5.2.1 G).
    haunch: Math.max(0, b.slabOffset - b.deckT),
    haunchMode: "supports",
    haunchSupport: Math.max(0, b.slabOffset - b.deckT),
    crossSlope,
    crown: { kind: "crown", offset: b.roadway.crownOffset - b.bridgeLineOffset },
    profileOrdinate: ordinates[0],
    fcDeck: b.fcDeck,
    fws: b.fws,
    ...(b.rail ? { rail: b.rail } : {}),
    extraSpans: spans.slice(1).map((s, k) => ({ L: s.L, strands: base.extraSpans[k]?.strands ?? null, harped: fit(base.extraSpans[k]?.harped ?? null) })),
    pierBearingOffset: pier ? pier.bearingOffset : base.pierBearingOffset,
    // Live load deflection (AASHTO 2.5.2.6.2, optional there): checked on the Bridge's girders, the conservative choice (L/800 unless the design sets its own limit).
    llDeflection: true,
    sidewalk: sidewalkLoads(b),
    // The girders' ends cast into an integral or semi-integral abutment's diaphragm (their connection steel counts at the bearing, 5.7.3.5).
    endsCastIn: { left: castInAt(b.supports[group[0]]), right: castInAt(b.supports[group[group.length - 1] + 1]) },
  };
  // A CDOT standard rail sets the barrier's width and its worksheet weight, as a saved girder design's do.
  return b.rail ? applyRail(out) : out;
}

/** Per girder at a support, from the girder check's girder lines: DC, DW, and LL per girder with and without IM (kip). */
function endReaction(line: ReturnType<typeof designGirder>["interior"], L: number) {
  const ld = line.loads;
  const nDia = ld.diaphragmAt.length;
  const DC1 = (ld.wg * ld.Lg) / 2 + (ld.wDeck * L) / 2 + (ld.Pdia * nDia) / 2; // the girder, deck and diaphragms: what a pad carries before the deck is made composite
  const DC = DC1 + (ld.wDC2 * L) / 2;
  const DW = (ld.wDW * L) / 2;
  const lane = liveLoad(L, 0, 0).V;
  const laneIM = liveLoad(L, 0, 0.33).V;
  // Pedestrians on the sidewalks (3.6.1.6), with the vehicles: on the girder's span, without IM or distribution.
  const PL = ((ld.wPL ?? 0) * L) / 2;
  return { DC, DC1, DW, LL: lane * line.df.shear + PL, LLIM: laneIM * line.df.shear + PL, Lane: lane, PL };
}

/** The Bridge run: its layout, the girder check on each group of spans, and each support's reactions per girder. */
export function runBridge(b: BridgeInputs, bases: (GirderInputs | null | undefined)[] = [], slabBase?: SlabBridgeInputs | null, steelBase?: SteelGirderInputs | null) {
  const lay = bridgeLayout(b);
  if (b.superstructure === "slab") return runSlabBridge(b, lay, slabBase ?? null);
  if (b.shape === "steel") return runSteelBridge(b, lay, steelBase ?? null);
  const groups = spanGroups(b).map((g, gi) => {
    const inputs = girderInputsFor(b, lay, g, bases[gi] ?? BRIDGE_GIRDER_BASE);
    const result = designGirder(inputs);
    return { spans: g, inputs, result };
  });
  // Reactions at each support: the ends of the spans either side (simple-span ends; over a continuous
  // pier the two ends add, which the continuous beam would raise by about a quarter: see the note).
  const reactions = b.supports.map((s, i) => {
    const sides: { span: number; interior: ReturnType<typeof endReaction>; exterior: ReturnType<typeof endReaction> }[] = [];
    for (const j of [i - 1, i]) {
      if (j < 0 || j >= lay.spans.length) continue;
      const g = groups.find((x) => x.spans.includes(j))!;
      const sd = g.result.spans[g.spans.indexOf(j)] ?? g.result.spans[0];
      sides.push({ span: j, interior: endReaction(sd.interior, lay.spans[j].L), exterior: endReaction(sd.exterior, lay.spans[j].L) });
    }
    const sum = (side: "interior" | "exterior", key: "DC" | "DC1" | "DW" | "LL" | "LLIM" | "Lane") => sides.reduce((t, x) => t + x[side][key], 0);
    const per = (key: "DC" | "DC1" | "DW" | "LL" | "LLIM" | "Lane") => Math.max(sum("interior", key), sum("exterior", key));
    const continuous = s.type === "continuous-pier";
    if (continuous) {
      // Over a continuous pier (5.12.3.3): the girders and deck are simple (their ends add); the barrier,
      // other DC2 and DW act on the continuous beam; the live load is the lane's reaction from the beam's
      // influence lines (substructure-loads.ts, as the pier cap's loads use), times the shear distribution factor.
      const g = groups.find((x) => x.spans.includes(i - 1) && x.spans.includes(i))!;
      const pier = g.spans.indexOf(i);
      const lines = [g.result.spans[pier - 1], g.result.spans[pier]];
      const side = (k: "interior" | "exterior") => {
        const ldB = lines[0][k].loads;
        const ldA = lines[1][k].loads;
        const simple = (ld: typeof ldB, L: number) => (ld.wg * ld.Lg) / 2 + (ld.wDeck * L) / 2 + (ld.Pdia * ld.diaphragmAt.length) / 2;
        const DC1 = simple(ldB, lay.spans[i - 1].L) + simple(ldA, lay.spans[i].L);
        const cB = continuousEndShear(g.inputs, pier - 1, "end");
        const cA = continuousEndShear(g.inputs, pier, "start");
        const DC2 = ldB.wDC2 * cB + ldA.wDC2 * cA;
        const DW = ldB.wDW * cB + ldA.wDW * cA;
        const lane = (IM: number) => {
          const r = continuousLaneReaction(g.inputs, pier, IM);
          return r.truck.back + r.truck.ahead + r.lane.back + r.lane.ahead;
        };
        const df = Math.max(lines[0][k].df.shear, lines[1][k].df.shear);
        const PL = (ldB.wPL ?? 0) * cB + (ldA.wPL ?? 0) * cA; // pedestrians on the continuous beam (3.6.1.6)
        return { DC: DC1 + DC2, DC1, DW, LL: lane(0) * df + PL, LLIM: lane(0.33) * df + PL, Lane: lane(0) };
      };
      const int = side("interior");
      const ext = side("exterior");
      const pick = (key: "DC" | "DC1" | "DW" | "LL" | "LLIM" | "Lane") => Math.max(int[key], ext[key]);
      const totC = (key: "DC" | "DW") => 2 * ext[key] + (b.nGirders - 2) * int[key];
      return { support: i, name: s.name, sides, DC: pick("DC"), DC1: pick("DC1"), DW: pick("DW"), LL: pick("LL"), LLIM: pick("LLIM"), Lane: pick("Lane"), continuous, totals: { DC: totC("DC"), DW: totC("DW") } };
    }
    // The whole line of girders: two exterior and the rest interior (the per-girder values above are the larger of the two).
    const tot = (key: "DC" | "DW") => sides.reduce((t, x) => t + 2 * x.exterior[key] + (b.nGirders - 2) * x.interior[key], 0);
    return { support: i, name: s.name, sides, DC: per("DC"), DC1: per("DC1"), DW: per("DW"), LL: per("LL"), LLIM: per("LLIM"), Lane: per("Lane"), continuous, totals: { DC: tot("DC"), DW: tot("DW") } };
  });
  const ok = groups.every((g) => g.result.ok);
  return { layout: lay, groups, reactions, ok, slab: null as SlabRun | null, steel: null as SteelRun | null };
}

export type BridgeRun = ReturnType<typeof runBridge>;

/**
 * The Slab Bridge design's inputs from the Bridge: its spans (bearing to bearing), continuous where every pier is, its
 * width, barriers (a CDOT rail's weight), skew, depth (the deck's, deckT) and overlay; its bars and details kept.
 */
export function slabFromBridge(b: BridgeInputs, lay: BridgeLayout, base: SlabBridgeInputs = SLAB_BRIDGE_DEFAULTS): SlabBridgeInputs {
  const inner = b.supports.slice(1, -1);
  const rail = b.rail ? applyRail({ ...GIRDER_DEFAULTS, rail: b.rail, barrierWidth: b.barrierWidth }) : null;
  return {
    ...base,
    spans: lay.spans.map((s) => Math.round(s.L * 1000) / 1000),
    continuous: inner.length > 0 && inner.every((s) => s.type === "continuous-pier"),
    W: b.leftEdge + b.rightEdge,
    barrierWidth: rail ? rail.barrierWidth : b.barrierWidth,
    barrierWeight: rail ? rail.barrierWeight : base.barrierWeight,
    skew: Math.min(45, Math.max(...b.supports.map((s) => Math.abs(s.skew)))),
    t: b.deckT,
    wearing: Math.round(((b.fws / 1000 / base.gammaWS) * 12) * 1000) / 1000,
  };
}

/**
 * A slab bridge's run: the slab designed, and each support's reactions on its bearing lines (the Bridge's girder
 * lines, at its spacing): the slab's reaction per foot times each line's width (an interior line its spacing, an
 * exterior one half of it and the overhang), so the substructure takes them as it takes girders, once.
 */
function runSlabBridge(b: BridgeInputs, lay: BridgeLayout, base: SlabBridgeInputs | null) {
  const inputs = slabFromBridge(b, lay, base ?? SLAB_BRIDGE_DEFAULTS);
  const result = designSlabBridge(inputs);
  const W = b.leftEdge + b.rightEdge;
  const reactions = b.supports.map((s, i) => {
    const S = spacingAt(b, s);
    const tribInt = S;
    const tribExt = S / 2 + lay.overhang;
    const per = result.reactions[i];
    const line = (trib: number) => ({ DC: per.DC * trib, DC1: per.DC * trib, DW: per.DW * trib, LL: per.LL * trib, LLIM: per.LLIM * trib, Lane: per.lane });
    const int = line(tribInt);
    const ext = line(tribExt);
    const pick = (key: "DC" | "DC1" | "DW" | "LL" | "LLIM" | "Lane") => Math.max(int[key], ext[key]);
    return { support: i, name: s.name, sides: [] as { span: number; interior: ReturnType<typeof line>; exterior: ReturnType<typeof line> }[], DC: pick("DC"), DC1: pick("DC1"), DW: pick("DW"), LL: pick("LL"), LLIM: pick("LLIM"), Lane: pick("Lane"), continuous: s.type === "continuous-pier", totals: { DC: per.DC * W, DW: per.DW * W }, slab: { perFoot: per, tribInt, tribExt } };
  });
  return { layout: lay, groups: [] as { spans: number[]; inputs: GirderInputs; result: ReturnType<typeof designGirder> }[], reactions, ok: result.ok, slab: { inputs, result } as SlabRun | null, steel: null as SteelRun | null };
}

export type SteelRun = { inputs: SteelGirderInputs; result: SteelGirderResult; /** The girders as a precast design's inputs (steelStandIn). */ standIn: GirderInputs };

/**
 * The Steel Girder Design Check's inputs from the Bridge: its spans (bearing to bearing), girders, deck (the haunch from
 * the slab offset, A less the deck), barriers (a CDOT rail's weight), skew and overlay; the plates along the bridge
 * (scaled to its length); the design's own details (bracing, studs, fatigue…) kept, the cross-frames where they fit.
 */
export function steelFromBridge(b: BridgeInputs, lay: BridgeLayout, base: SteelGirderInputs = STEEL_DEFAULTS): SteelGirderInputs {
  const spans = lay.spans.map((s) => Math.round(s.L * 1000) / 1000);
  const total = spans.reduce((a, x) => a + x, 0);
  const st = b.steel ?? STEEL_GIRDER_DEFAULT;
  const sum = st.segments.reduce((a, s) => a + s.length, 0);
  const rail = b.rail ? applyRail({ ...GIRDER_DEFAULTS, rail: b.rail, barrierWidth: b.barrierWidth }) : null;
  return {
    ...base,
    spans,
    nGirders: b.nGirders,
    S: b.spacing,
    overhang: lay.overhang,
    barrierWidth: rail ? rail.barrierWidth : b.barrierWidth,
    skew: Math.min(60, Math.max(...b.supports.map((s) => Math.abs(s.skew)))),
    deckT: b.deckT,
    sacrificial: b.sacrificial,
    haunch: Math.max(0, b.slabOffset - b.deckT),
    fcDeck: b.fcDeck,
    Fyw: st.Fyw,
    Fyf: st.Fyf,
    segments: st.segments.map((s) => ({ ...s, length: Math.round(((s.length * total) / sum) * 1000) / 1000 })),
    braces: base.braces.filter((x) => x < total),
    loads: { ...base.loads, mode: "computed", barrierWeight: rail ? rail.barrierWeight : base.loads.barrierWeight, fws: b.fws, sidewalk: sidewalkLoads(b) },
  };
}

/**
 * A steel girder bridge's girders as a precast design's inputs, for what reads a girder design's section and site (the
 * superstructure's wind on the piers and caps, the columns' spans and width): the deepest segment's outline as a custom
 * section, the run's spans, girders, deck and haunch; the site's wind from the steel design's (else the Bridge's).
 */
export function steelStandIn(b: BridgeInputs, i: SteelGirderInputs): GirderInputs {
  const sh = deepestSteelShape(i.segments);
  const rail = b.rail ? railDef(b.rail.type) : null;
  const own = i.wind.V > 0;
  const site: SiteWind = {
    V: own ? i.wind.V : (b.site?.V ?? 0),
    exposure: own ? i.wind.exposure : (b.site?.exposure ?? "C"),
    Z: own ? i.wind.Z : (b.site?.Z ?? 33),
    barrierHeight: rail ? rail.height / 12 : (b.site?.barrierHeight ?? 0),
  };
  return {
    ...BRIDGE_GIRDER_BASE,
    shape: "custom",
    custom: { profile: sh.profile, web: sh.web, topWidth: sh.topWidth },
    L: i.spans[0],
    extraSpans: i.spans.slice(1).map((L) => ({ L, strands: null, harped: null })),
    nGirders: i.nGirders,
    S: i.S,
    overhang: i.overhang,
    barrierWidth: i.barrierWidth,
    barrierWeight: i.loads.barrierWeight,
    deckT: i.deckT,
    haunch: i.haunch,
    haunchSupport: undefined,
    site,
  };
}

/**
 * A steel girder bridge's run: the girder line designed by the Steel Girder Design Check, and each support's reactions
 * per girder (its dead loads from the continuous girder's shears, DC1 apart; the live load from the support's reaction
 * influence line with IM, by the shear distribution factor), so the substructure takes them as it takes precast girders.
 */
function runSteelBridge(b: BridgeInputs, lay: BridgeLayout, base: SteelGirderInputs | null) {
  const inputs = steelFromBridge(b, lay, base ?? STEEL_DEFAULTS);
  const result = designSteelGirder(inputs);
  const reactions = b.supports.map((s, i) => {
    const r = result.reactions[i];
    const LL = r.truck / (1 + inputs.IM) + r.lane + r.pl;
    const line = { DC: r.dc, DC1: r.dc1, DW: r.dw, LL, LLIM: r.truck + r.lane + r.pl, Lane: r.df > 0 ? (r.truck / (1 + inputs.IM) + r.lane) / r.df : 0, PL: r.pl };
    return { support: i, name: s.name, sides: [] as { span: number; interior: typeof line; exterior: typeof line }[], ...line, continuous: s.type === "continuous-pier", totals: { DC: r.dc * b.nGirders, DW: r.dw * b.nGirders }, steel: { perGirder: line } };
  });
  const ok = result.checks.every((c) => c.ok || c.advisory);
  return { layout: lay, groups: [] as { spans: number[]; inputs: GirderInputs; result: ReturnType<typeof designGirder> }[], reactions, ok, slab: null as SlabRun | null, steel: { inputs, result, standIn: steelStandIn(b, inputs) } as SteelRun | null };
}

export type SlabRun = { inputs: SlabBridgeInputs; result: SlabBridgeResult };
