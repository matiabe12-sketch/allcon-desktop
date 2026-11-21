import type { ColumnCage, ShaftCage } from "../piers/column-shaft";
import { designAbutment, type AbutmentInputs } from "../foundations/abutment";
import { type FootingInputs } from "../foundations/footing";
import { type PileInputs } from "../foundations/piles";
import { type ShaftInputs } from "../foundations/shaft";
import { brakingPerLane, SITE_WIND_DEFAULTS, superstructureWind } from "../girders/substructure-loads";
import { girderSide, sideWind, type GirderSide } from "../stm/cap-loads";
import { selfWeight, steelShape } from "../girders/steel-section";
import type { StmInputs } from "../stm/strut-tie";
import { bearingsFromLink, buildTemplate, HAMMERHEAD_DEFAULTS, MULTICOLUMN_DEFAULTS, type StmTemplate } from "../stm/templates";
import type { ColumnInputs, ColumnLink } from "../piers/column";
import type { ApproachSlabInputs } from "../approach/approach-slab";
import type { FingerJointInputs } from "../joints/finger";
import type { ModularJointInputs } from "../joints/modular";
import type { WingwallInputs } from "../walls/wingwall";
import type { ColumnResult } from "../piers/column";
import type { GirderInputs } from "../girders/prestressed";
import type { DeckInputs } from "../decks/deck";
import { BEARING_DEFAULTS, type BearingInputs, type designBearing } from "../bearings/elastomeric";
import type { HlmrInputs } from "../bearings/pot-disc";

/** The pad the stiffness split takes before a bearing design is linked. */
const BEARING_PAD_DEFAULT = BEARING_DEFAULTS;
import { spacingAt, spanGroups, type BridgeInputs, type BridgeRun, type JointKind, type PierShape, bridgeGirderShape } from "./bridge";

// The load path from a Bridge run down through its linked designs (docs/bridge-model.md): each
// function takes a component's inputs as saved and returns them with what the Bridge decides (its
// layout and loads), the component's own details (bars, strands, soils, sections) kept as they are.
//
// - Girders: the Bridge's layout on each group of spans (girderInputsFor).
// - Abutments: the bridge's data the abutment tool takes (CDOT BDM 11.3): the unit's length, grade,
//   skew, curvature, girders, the reactions per girder (LL without IM: the tool adds IM in the cap
//   and not the foundation), braking (AASHTO 3.6.4, all lanes with the multiple presence factor,
//   shared by the bridge's two abutments), the abutment's length along its skew.
// - Pier caps: their girder link (back and ahead spans) from the girder designs, as the strut-and-tie
//   tool's own link copies it.
// - Foundations: load cases at the column's base (footing, pile cap or shaft), from the column design.

/** AASHTO Table 3.6.1.1.2-1. */
export const multiplePresence = (lanes: number) => (lanes <= 1 ? 1.2 : lanes === 2 ? 1.0 : lanes === 3 ? 0.85 : 0.65);

/** Design lanes on the bridge's clear roadway (3.6.1.1.1): whole 12 ft lanes. */
export const designLanes = (b: BridgeInputs) => Math.max(1, Math.floor((b.leftEdge + b.rightEdge - 2 * b.barrierWidth - (b.sidewalks?.left ?? 0) - (b.sidewalks?.right ?? 0)) / 12));

/** The unit of the bridge an abutment belongs to: from it to the nearest support that isn't continuous or integral (an expansion joint), ft. */
export function unitLength(b: BridgeInputs, support: number) {
  const s = b.supports;
  const step = support === 0 ? 1 : -1;
  let j = support + step;
  while (j > 0 && j < s.length - 1 && s[j].type === "continuous-pier") j += step;
  return Math.abs(s[j].station - s[support].station);
}

/**
 * A support's stiffness along the bridge (kip/in): its substructure (the columns, or an integral abutment's piles) in
 * series with its bearings (rigid where fixed, cast into a diaphragm or on leveling pads; an elastomeric pad's G A / hrt
 * each where they slide by shearing). Infinity: rigid.
 */
export type LongStiffness = { kSub: number; kBear: number };

/** An elastomeric bearing line's shear stiffness, kip/in: every girder's pad, G A / hrt (AASHTO 14.6.3.1). */
export function padLineStiffness(bi: Pick<BearingInputs, "L" | "W" | "G" | "hri" | "n" | "hre" | "covers" | "pad">, nGirders: number) {
  const steel = bi.pad !== "plain";
  const hrt = steel ? bi.n * bi.hri + (bi.covers === 1 ? 1 : 2) * bi.hre : bi.hri;
  return hrt > 0 ? (nGirders * bi.G * bi.L * bi.W) / hrt : Infinity;
}

/** A pier's columns along the bridge, kip/in: each a cantilever from its base to the bearings, cracked (0.4 Ec Ig, as the column design takes it, Eq. 5.6.4.3-2). */
export function pierStiffness(p: PierShape, columnHeight: number, fc: number) {
  const Ec = 120000 * 0.145 ** 2 * fc ** 0.33; // ksi, AASHTO Eq. 5.4.2.4-1, K1 1, wc 0.145
  const D = p.columnSize;
  const Ig = p.columnShape === "round" ? (Math.PI * D ** 4) / 64 : (p.columnSize * p.columnDepth ** 3) / 12; // in⁴, bending along the bridge
  const h = (columnHeight + p.capDepth) * 12;
  return (p.columns * 3 * 0.4 * Ec * Ig) / h ** 3;
}

/**
 * The bridge's longitudinal forces shared once among its supports (no support takes another's part): the bridge in
 * units between its deck joints (a simple pier's joint splits it; a simple pier takes from the units either side), each
 * unit's braking force (AASHTO 3.6.4: every lane count with its multiple presence factor, the most) shared by the
 * supports' stiffness along the bridge (rigid supports alone, equally, where there are any). AASHTO leaves the split to
 * the engineer; the stiffness split is the usual one.
 */
export function longitudinalShares(b: BridgeInputs, k: LongStiffness[]) {
  const s = b.supports;
  const lanes = designLanes(b);
  const units: number[][] = [[0]];
  for (let j = 1; j < s.length; j++) {
    units[units.length - 1].push(j);
    if (j < s.length - 1 && s[j].type === "simple-pier") units.push([j]);
  }
  const series = (x: LongStiffness) => (!Number.isFinite(x.kSub) && !Number.isFinite(x.kBear) ? Infinity : 1 / (1 / x.kSub + 1 / x.kBear));
  const out = s.map(() => ({ braking: 0, share: 0, k: 0, units: [] as { from: number; to: number; L: number; BR: number; share: number }[] }));
  for (const u of units) {
    const L = s[u[u.length - 1]].station - s[u[0]].station;
    const per = brakingPerLane(L).perLane;
    const BR = Math.max(...Array.from({ length: lanes }, (_, m) => (m + 1) * multiplePresence(m + 1) * per));
    const ks = u.map((j) => series(k[j]));
    const rigid = ks.filter((x) => !Number.isFinite(x)).length;
    const sum = ks.reduce((t, x) => t + (Number.isFinite(x) ? x : 0), 0);
    u.forEach((j, m) => {
      const share = rigid ? (Number.isFinite(ks[m]) ? 0 : 1 / rigid) : sum > 0 ? ks[m] / sum : 1 / u.length;
      out[j].braking += share * BR;
      out[j].share = Math.max(out[j].share, share);
      out[j].k = ks[m];
      out[j].units.push({ from: u[0], to: u[u.length - 1], L, BR, share });
    });
  }
  return out;
}

/** The stiffness a support has before its designs are linked: abutments rigid on fixed bearings or on piles, pads where they slide; piers' columns from their description. */
export function defaultStiffness(b: BridgeInputs, run: BridgeRun, pad: Pick<BearingInputs, "L" | "W" | "G" | "hri" | "n" | "hre" | "covers" | "pad">, fc = 4): LongStiffness[] {
  return b.supports.map((s, j) => {
    const cast = s.type === "integral-abutment" || s.type === "continuous-pier";
    const kBear = cast || s.bearing === "fixed" ? Infinity : padLineStiffness(pad, b.nGirders);
    const lp = run.layout.piers[j];
    const kSub = s.pier && lp ? pierStiffness(s.pier, lp.columnHeight, fc) : Infinity;
    return { kSub, kBear };
  });
}

/**
 * What the girders' reactions at a support already carry inside a concrete block cast around their ends (an integral
 * abutment's cap and diaphragm, a semi-integral end diaphragm), `width` ft wide on the support's line: each girder's
 * end past its bearing and up to the block's face toward the span, and the deck and haunch from its bearing line to
 * that face (a girder's span runs bearing to bearing). Kip, unfactored, the whole line of girders.
 */
export function girdersInside(b: BridgeInputs, run: BridgeRun, support: number, width: number) {
  const s = b.supports[support];
  if (run.steel) {
    const st = steelAtSupport(run, support);
    const a = Math.max(0, width / 2 - Math.max(0, s.bearingOffset));
    const one = (wDeck: number) => st.wg * (s.endDistance + a) + wDeck * a;
    return 2 * one(st.wDeck.exterior) + (b.nGirders - 2) * one(st.wDeck.interior);
  }
  const j = support === 0 ? 0 : support - 1;
  const g = run.groups.find((x) => x.spans.includes(j));
  if (!g) return 0;
  const sd = g.result.spans[g.spans.indexOf(j)] ?? g.result.spans[0];
  const a = Math.max(0, width / 2 - Math.max(0, s.bearingOffset)); // ft, the bearing line to the face
  const one = (line: typeof sd.interior) => line.loads.wg * (s.endDistance + a) + line.loads.wDeck * a;
  return 2 * one(sd.exterior) + (b.nGirders - 2) * one(sd.interior);
}

export function abutmentFromBridge(b: BridgeInputs, run: BridgeRun, support: number, current: AbutmentInputs, long?: { braking: number; bearingShear?: number; windLong?: AbutmentInputs["windLong"] }): AbutmentInputs {
  const s = b.supports[support];
  const lay = run.layout.supports[support];
  const r = run.reactions[support];
  const type: AbutmentInputs["type"] = s.type === "integral-abutment" ? (current.type === "integral-shafts" || current.type === "integral-micropiles" ? current.type : "integral-piles") : s.type === "semi-integral-abutment" ? "semi-integral" : "seat";
  const lanes = designLanes(b);
  const L = unitLength(b, support);
  // Its share of its unit's braking, shared once among the unit's supports by stiffness (longitudinalShares); without
  // the linked designs' stiffness, from the supports as described (defaultStiffness).
  const braking = long ? long.braking : longitudinalShares(b, defaultStiffness(b, run, BEARING_PAD_DEFAULT))[support].braking;
  const width = b.leftEdge + b.rightEdge;
  return {
    ...current,
    type,
    unitLength: Math.round(L * 1000) / 1000,
    grade: Math.round(Math.abs(lay.grade) * 100 * 1000) / 1000,
    skew: Math.abs(s.skew),
    curvature: Number.isFinite(lay.R) ? Math.round((5729.578 / lay.R) * 1000) / 1000 : 0,
    nGirders: b.nGirders,
    girderSpacing: spacingAt(b, s),
    RDC: Math.round(r.DC * 10) / 10,
    RDC1: Math.round(r.DC1 * 10) / 10,
    RDW: Math.round(r.DW * 10) / 10,
    // The line of girders counted once (two exterior, the rest interior), less what's inside the abutment's own concrete.
    girderTotals: { DC: Math.round(r.totals.DC * 10) / 10, DW: Math.round(r.totals.DW * 10) / 10 },
    girderInside: Math.round(girdersInside(b, run, support, type.startsWith("integral") ? current.capWidth : type === "semi-integral" ? current.backwallT : 0) * 10) / 10,
    RLL: Math.round(r.LL * 10) / 10,
    // The foundation's live load: the lanes on the deck with their multiple presence factors (3.6.1.1.2), one lane's reaction each.
    RLane: Math.round(r.Lane * 10) / 10,
    lanes,
    IM: 0.33,
    braking: Math.round(braking * 10) / 10,
    ...(long?.windLong !== undefined ? { windLong: long.windLong } : {}),
    ...(long?.bearingShear !== undefined && type !== "integral-piles" && type !== "integral-shafts" && type !== "integral-micropiles" ? { bearingShear: Math.round(long.bearingShear * 1000) / 1000 } : {}),
    length: Math.round((width / Math.cos((s.skew * Math.PI) / 180)) * 100) / 100,
  };
}

/**
 * A hammerhead's depth at its ends (ft) for a cap `depth` deep: the cap's own tip kept while its depth is unchanged,
 * otherwise scaled with it; then in 3 in steps and at least 3 ft (CDOT BDM 11.4: caps at least 3 ft deep,
 * increasing in 3 in increments), never deeper than the cap.
 */
export function hammerheadTip(base: Pick<StmTemplate, "depth" | "tipDepth">, depth: number): number {
  const scaled = Math.abs(base.depth - depth) < 1e-9 ? base.tipDepth : base.tipDepth * (depth / base.depth);
  return Math.min(depth, Math.max(3, Math.round(scaled * 4) / 4));
}

/** A standard pier cap's template from the Bridge's pier: its length, depth, width and columns (the cap's own bars and details kept). */
export function capTemplate(p: PierShape, xs: number[], current: StmTemplate | null): StmTemplate {
  const base = current && current.kind === p.kind ? current : p.kind === "hammerhead" ? HAMMERHEAD_DEFAULTS : MULTICOLUMN_DEFAULTS;
  return {
    ...base,
    kind: p.kind,
    length: p.capLength,
    depth: p.capDepth,
    tipDepth: p.kind === "hammerhead" ? hammerheadTip(base, p.capDepth) : p.capDepth,
    capWidth: p.capWidth,
    columns: p.kind === "hammerhead" ? [p.capLength / 2] : xs,
    columnWidth: (p.columnShape === "round" ? p.columnSize : p.columnSize) / 12,
  };
}

/** A pier cap's girder link from the girder designs either side (span ending at the pier, span starting there). */
export function capFromBridge(b: BridgeInputs, run: BridgeRun, support: number, current: StmInputs, girderIds: (string | null)[], names: string[], slabId?: string | null, slabName?: string): StmInputs {
  const shape = b.supports[support].pier;
  const lp = run.layout.piers[support];
  if (shape && lp) current = { ...current, template: capTemplate(shape, lp.columnsX, current.template ?? null) };
  // The bent's columns and base, for the cap's forces as a plane frame (the column's own frame): their height, section
  // and base from the pier (a drilled shaft to its point of fixity, as the cap's frame kept it, else 10 ft).
  if (shape && lp) {
    const was = current.frame ?? null;
    current = {
      ...current,
      frame: {
        columnHeight: Math.round(lp.columnHeight * 100) / 100,
        columnShape: shape.columnShape,
        columnT: shape.columnSize,
        columnW: shape.columnShape === "round" ? shape.columnSize : shape.columnDepth,
        base: shape.foundation === "drilled-shaft" ? "shaft" : "footing",
        fixity: was?.fixity ?? 10,
        shaftD: Math.max(was?.shaftD ?? 0, shape.columnSize),
        fc: was?.fc ?? current.fc,
      },
    };
  }
  // Girders made continuous over the pier by a cast-in-place diaphragm: the cap is built in two stages, the
  // diaphragm from the cap's top (the lowest seat) to the deck's top over the cap.
  // (A slab bridge has none: its slab's weight is in its reactions.)
  if (b.supports[support].type === "continuous-pier" && lp && !run.slab) {
    const deckTop = Math.max(...[...(support > 0 ? run.layout.spans[support - 1].girders.map((g) => g.end.deck) : []), ...(support < run.layout.spans.length ? run.layout.spans[support].girders.map((g) => g.start.deck) : [])]);
    const h = Math.round((deckTop - lp.capTop) * 100) / 100;
    current = { ...current, stages: { enabled: current.stages?.enabled ?? true, diaphragmHeight: h, topBars: current.stages?.topBars ?? null } };
  }
  const groups = spanGroups(b);
  const sideOf = (span: number, end: "start" | "end") => {
    if (run.slab) return span >= 0 && span < run.layout.spans.length ? slabSide(b, run, support, span, end, slabId ?? "slab", slabName ?? "Slab") : null;
    if (run.steel) return span >= 0 && span < run.layout.spans.length && girderIds[0] ? steelSide(b, run, support, span, end, girderIds[0], names[0] ?? "Girders") : null;
    const gi = groups.findIndex((g) => g.includes(span));
    const id = girderIds[gi];
    if (!id) return null;
    const g = run.groups[gi];
    return girderSide(g.inputs as GirderInputs, g.spans.indexOf(span), id, names[gi] ?? "Girders", end);
  };
  const t = current.template;
  const link = current.girders ?? { enabled: true, back: null, ahead: null, x0: t ? t.length / 2 : 0, reverse: false, loadNodes: [], selfWeight: true, soffit: 0, wc: 0.15 };
  // The girders' bearing lines either side of the pier's centerline (their couple along the bridge goes to the column).
  const next = { ...link, enabled: true, back: sideOf(support - 1, "end"), ahead: sideOf(support, "start"), bearingOffset: Math.max(0, b.supports[support].bearingOffset ?? 0) };
  // A cap built from a standard pier cap: its bearings rebuilt where the Bridge's girders sit, and the
  // model with them (the strut-and-tie tool's own "build from the girders").
  if (t && t.kind !== "abutment") {
    const xs = bearingsFromLink(next);
    const tpl = { ...t, bearings: xs.map((x, k) => ({ x, P: t.bearings[k]?.P ?? 0 })) };
    return buildTemplate(tpl, { ...current, girders: next });
  }
  return { ...current, girders: next };
}

/** The pier column from the Bridge's pier: its section, its height from the cap's soffit to the foundation's top, its loads from the cap. */
export function columnFromBridge(b: BridgeInputs, run: BridgeRun, support: number, current: ColumnInputs, link: ColumnLink): ColumnInputs {
  const p = b.supports[support].pier;
  const lp = run.layout.piers[support];
  if (!p || !lp) return { ...current, loads: "stm", link };
  return {
    ...current,
    shape: p.columnShape,
    // A flared column: T at its base, Ttop under the cap (the pier's columnSize).
    T: p.columnShape === "rectangular" && p.columnSizeBase ? p.columnSizeBase : p.columnSize,
    Ttop: p.columnShape === "rectangular" && p.columnSizeBase && Math.abs(p.columnSizeBase - p.columnSize) > 0.5 ? p.columnSize : 0,
    W: p.columnShape === "round" ? p.columnSize : p.columnDepth,
    height: Math.round(lp.columnHeight * 100) / 100,
    ground: Math.min(current.ground, Math.max(0, lp.columnHeight - 1)),
    capDepth: p.capDepth,
    base: p.foundation === "drilled-shaft" ? "shaft" : "footing",
    shaftD: p.foundation === "drilled-shaft" ? Math.max(current.shaftD, p.columnSize) : current.shaftD,
    loads: "stm",
    link,
  };
}

/**
 * The station the bridge expands from: where its girders slide on bearings at every support but the fixed ones (no
 * integral abutment), the fixed supports (their middle, when more than one); otherwise, or with none fixed, the bridge's
 * middle (an integral bridge moves about its center of stiffness, taken as its middle).
 */
export function fixedPoint(b: BridgeInputs) {
  const st = b.supports;
  const middle = (st[0].station + st[st.length - 1].station) / 2;
  if (st.some((s) => s.type === "integral-abutment")) return middle;
  const fixed = st.filter((s) => s.bearing === "fixed");
  return fixed.length ? fixed.reduce((t, s) => t + s.station, 0) / fixed.length : middle;
}

/**
 * An abutment's expansion device: the length that moves toward it and the skew of the line it runs along.
 * The length runs from the bridge's fixed point (fixedPoint, as the bearings take it). At a seat abutment the
 * device is at the backwall; at an integral or semi-integral abutment the bridge pushes the approach slab, tied to
 * its end diaphragm, so the device is at the slab's far end (the sleeper slab, CDOT BDM 11.3.1, 11.3.2) and the slab's
 * own length is added (the conservative choice).
 */
export function jointFromBridge<T extends { L: number; skew: number }>(b: BridgeInputs, support: number, approachL: number, current: T): T {
  const s = b.supports[support];
  const atSlabEnd = s.type === "integral-abutment" || s.type === "semi-integral-abutment";
  const L = Math.abs(s.station - fixedPoint(b)) + (atSlabEnd ? approachL : 0);
  return { ...current, L: Math.round(L * 100) / 100, skew: Math.abs(s.skew) };
}

/** A modular joint at an abutment: as the strip seal (the length and skew), with the deck's width and whether it sits at the approach slab's end. */
export function modularFromBridge(b: BridgeInputs, support: number, approachL: number, current: ModularJointInputs): ModularJointInputs {
  const s = b.supports[support];
  return { ...jointFromBridge(b, support, approachL, current), width: Math.round((b.leftEdge + b.rightEdge) * 100) / 100, atApproachSlab: s.type === "integral-abutment" || s.type === "semi-integral-abutment" };
}

/** A finger joint at an abutment: the length and skew, and the deck's width. */
export function fingerFromBridge(b: BridgeInputs, support: number, approachL: number, current: FingerJointInputs): FingerJointInputs {
  return { ...jointFromBridge(b, support, approachL, current), width: Math.round((b.leftEdge + b.rightEdge) * 100) / 100 };
}

/**
 * The expansion device an abutment takes, from the strip seal's movement there (CDOT BDM 14.4.4–14.4.6): a strip seal for
 * 4 in or less (over a 25° skew with an oversized gland); otherwise a modular joint (finger joints only replace existing ones). What was
 * chosen in the supports stands. Why, in a line.
 */
export function recommendJoint(choice: "auto" | "strip-seal" | "modular" | "finger" | undefined, strip: { total: number; skew: number }): { kind: JointKind; why: string } {
  if (choice === "strip-seal") return { kind: "strip-seal-joint", why: "chosen in the supports" };
  if (choice === "modular") return { kind: "modular-joint", why: "chosen in the supports" };
  if (choice === "finger") return { kind: "finger-joint", why: "chosen in the supports (CDOT: only to replace an existing finger joint)" };
  const m = Math.round(strip.total * 100) / 100;
  if (strip.total <= 4 && strip.skew <= 25) return { kind: "strip-seal-joint", why: `recommended: ${m} in of movement, skew ${strip.skew}° (strip seal to 4 in and 25°, CDOT BDM 14.4.4)` };
  if (strip.total <= 4) return { kind: "strip-seal-joint", why: `recommended: ${m} in of movement at a ${strip.skew}° skew: a strip seal with an oversized gland, with the Unit Leader's approval (CDOT BDM 14.4.4)` };
  return { kind: "modular-joint", why: `recommended: ${m} in of movement, over a strip seal's 4 in (CDOT BDM 14.4.5)` };
}

/**
 * The approach slab at an abutment: the deck's width and the roadway between the barriers, the abutment's skew; with a
 * bridge rail, the rail carried on along the slab's edges (CDOT BDM 11.3.7), checked for its collision moment and tension
 * at the slab (AASHTO A13.4.1 Case 1), the rail's end-zone values from the deck design (`rail`), the larger.
 */
export function approachSlabFromBridge(b: BridgeInputs, support: number, current: ApproachSlabInputs, rail?: { Mc: number; T: number } | null): ApproachSlabInputs {
  const width = b.leftEdge + b.rightEdge;
  return { ...current, W: width, roadway: width - 2 * b.barrierWidth, skew: Math.abs(b.supports[support].skew), ...(rail && b.rail ? { barrier: true, Mc: Math.round(rail.Mc * 100) / 100, T: Math.round(rail.T * 100) / 100 } : {}) };
}

/** A wingwall off an abutment: its height at the abutment face (the abutment's depth), the abutment's width square to it, the skew and the backfill. */
export function wingwallFromBridge(b: BridgeInputs, support: number, abutment: AbutmentInputs, current: WingwallInputs): WingwallInputs {
  const integral = abutment.type.startsWith("integral");
  return {
    ...current,
    H: integral ? abutment.totalDepth : abutment.stemH + abutment.backwallH,
    A: integral ? abutment.capWidth : abutment.stemT,
    skew: Math.abs(b.supports[support].skew),
    phi: abutment.backfillPhi,
    gammaS: abutment.backfillGamma / 1000,
  };
}

/** Load cases at a column's base for its foundation: each factored case's largest column (P, the moments and shears both ways). */
export function baseCases(col: ColumnResult) {
  // With the column's collision check on, its Extreme Event II cases go to the foundation too (AASHTO 3.6.5.1), unless
  // the column is deemed adequate without it (at least 3.0 ft thick with more than 30 ft² of section).
  const ct = col.collision && !col.collision.exempt ? col.collision.rows : [];
  const base = [...col.rows, ...ct].filter((r) => r.where === "base");
  const byCase = new Map<string, (typeof base)[number]>();
  for (const r of base) {
    const prev = byCase.get(r.case);
    if (!prev || r.P > prev.P) byCase.set(r.case, r);
  }
  return [...byCase.values()].map((r) => ({ name: r.case, limit: (/service/i.test(r.limit) ? "service" : /extreme/i.test(r.limit) ? "extreme" : "strength") as "strength" | "service" | "extreme", P: r.P, MT: r.MT, ML: r.ML, VT: r.VT, VL: r.VL }));
}

const round = (v: number) => Math.round(v * 10) / 10;

/** The column's footprint at its base for the footing or pile cap under it: B across the bridge (the column's T), L along it (W); an oblong column taken as its rectangle. */
export function columnFootprint(column?: { shape: string; T: number; W: number } | null) {
  if (!column) return {};
  const round = column.shape === "round";
  return { colShape: (round ? "round" : "rectangular") as "round" | "rectangular", colB: column.T, colL: round ? column.T : column.W };
}

export function footingFromColumn(col: ColumnResult, current: FootingInputs, column?: { shape: string; T: number; W: number } | null): FootingInputs {
  // B across the bridge (the column's T), L along it.
  return { ...current, ...columnFootprint(column), cases: baseCases(col).map((c) => ({ name: c.name, limit: c.limit, P: round(c.P), MB: round(Math.abs(c.MT)), ML: round(Math.abs(c.ML)), HB: round(Math.abs(c.VT)), HL: round(Math.abs(c.VL)) })) };
}

export function pilesFromColumn(col: ColumnResult, current: PileInputs, column?: { shape: string; T: number; W: number } | null): PileInputs {
  return { ...current, ...columnFootprint(column), cases: baseCases(col).map((c) => ({ name: c.name, limit: c.limit, P: round(c.P), MB: round(Math.abs(c.MT)), ML: round(Math.abs(c.ML)), HB: round(Math.abs(c.VT)), HL: round(Math.abs(c.VL)) })) };
}

export function shaftFromColumn(col: ColumnResult, current: ShaftInputs, column?: ColumnCage | null): ShaftInputs {
  // The column on it, for the column-to-shaft connection (CDOT BDM Figure 11-13).
  const cage = column ? { shape: column.shape, T: column.T, W: column.W, cover: column.cover, bar: column.bar, bars: column.bars, barsT: column.barsT, barsL: column.barsL, barsEnd: column.barsEnd, tieBar: column.tieBar, tieSpacing: column.tieSpacing, transverse: column.transverse, fc: column.fc, fy: column.fy } : (current.column ?? null);
  return { ...current, column: cage, cases: baseCases(col).map((c) => ({ name: c.name, limit: c.limit, P: round(c.P), M: round(Math.hypot(c.MT, c.ML)), H: round(Math.hypot(c.VT, c.VL)), uplift: 0 })) };
}

/** A shaft design's cage, for its column's connection (column-shaft.ts). */
export const shaftCageOf = (s: ShaftInputs): ShaftCage => ({ D: s.D, cover: s.cover, bar: s.bar, bars: s.bars, tieBar: s.tieBar, pitch: s.pitch, fc: s.fc, fy: s.fy });

/** What changed between a component's inputs and the Bridge's: the top-level keys whose values differ. */
export function changedKeys(before: object, after: object) {
  const a = before as Record<string, unknown>;
  const b = after as Record<string, unknown>;
  return Object.keys(b).filter((k) => canonical(a[k]) !== canonical(b[k]));
}

/** A value as JSON with every object's keys sorted: the database (jsonb) keeps a design's inputs in its own key order. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v as Record<string, unknown>)
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  return JSON.stringify(v) ?? "null";
}

/**
 * The deck slab from the Bridge: the girders and their widest spacing, the overhang to the deck's edge,
 * the deck's thickness and concrete, the top flange's width, the rail, and the future wearing surface.
 * Tied to the girder design, which carries the deck's concrete and the rail in its quantities.
 */
export function deckFromBridge(b: BridgeInputs, run: BridgeRun, current: DeckInputs, girder: { id: string; name: string } | null): DeckInputs {
  const shape = bridgeGirderShape(b);
  const S = Math.max(...b.supports.map((s) => spacingAt(b, s)));
  const t = b.deckT;
  return {
    ...current,
    nGirders: b.nGirders,
    S,
    overhang: Math.round(run.layout.overhang * 1000) / 1000,
    t,
    tEdge: Math.max(current.tEdge, t),
    // CDOT BDM 9.7.1: the overhang's soffit 1 in below the top of the girder's flange, so at the flange's edge
    // the deck, the haunch and 1 in; the haunch taken as none there (the least it can be), which is conservative.
    tFlange: Math.max(current.tFlange, t + 1),
    flange: shape.topWidth,
    fc: b.fcDeck,
    barrierWidth: b.barrierWidth * 12,
    wearing: Math.round(((b.fws / 1000 / current.gammaWS) * 12) * 1000) / 1000,
    ...(b.rail ? { rail: b.rail } : {}),
    panels: !!run.groups[0]?.inputs.deckPanels,
    fromGirder: girder,
  };
}

/**
 * A support's bearing pads: each girder's service loads there and the movement it takes.
 * - Where the girders are cast into a diaphragm (an integral abutment, a continuous pier) the pads are leveling
 *   pads: they carry the girder, deck and diaphragms until the diaphragm is cast (DC1), then the diaphragm
 *   carries the bridge; no live load, and no movement (the girder moves with the abutment or pier).
 * - Elsewhere the pad carries DC + DW and the live load without IM (14.4.1), and moves with the distance to the
 *   bridge's fixed point (fixedPoint); a deck joint at a seat abutment or a simple pier.
 */
/**
 * A support's bearings from the bridge. At a semi-integral abutment the end diaphragm sits on the girders' ends and
 * rides on the bearings (CDOT BDM 11.3.2): its weight, from the abutment design's diaphragm (backwallH × backwallT along
 * its length), shared by the girders, is added to their dead load, less the girders' ends and deck inside it (girdersInside).
 */
export function bearingFromBridge(b: BridgeInputs, run: BridgeRun, support: number, current: BearingInputs, abutment?: Pick<AbutmentInputs, "type" | "backwallH" | "backwallT" | "length" | "gammaC"> | null): BearingInputs {
  const r = run.reactions[support];
  const s = b.supports[support];
  const leveling = s.type === "integral-abutment" || s.type === "continuous-pier";
  // Each line of bearings carries its own span's end: at a pier with a line each side, the heavier side.
  const own = (key: "DC1" | "DC" | "DW" | "LL") => (r.sides.length > 1 && s.bearingOffset > 0 ? Math.max(...r.sides.map((x) => Math.max(x.interior[key], x.exterior[key]))) : r[key]);
  // The diaphragm's weight shared by the girders, less what their own reactions already carry inside it (girdersInside).
  const diaphragm = s.type === "semi-integral-abutment" && abutment ? Math.max(0, abutment.gammaC * abutment.backwallH * abutment.backwallT * abutment.length - girdersInside(b, run, support, abutment.backwallT)) / b.nGirders : 0;
  return {
    ...current,
    DL: Math.round((leveling ? own("DC1") : own("DC") + own("DW") + diaphragm) * 10) / 10,
    LL: leveling ? 0 : Math.round(own("LL") * 10) / 10,
    expansionLength: leveling ? 0 : Math.round(Math.abs(s.station - fixedPoint(b)) * 100) / 100,
    // Held at a fixed support the bridge expands from: no shear deformation, as under a leveling pad.
    ...(leveling || (s.bearing === "fixed" && Math.abs(s.station - fixedPoint(b)) < 1e-6) ? { otherStatic: 0, cyclic: 0 } : {}),
    jointed: s.type === "seat-abutment" || s.type === "simple-pier",
  };
}

/**
 * The deck's length for its quantities, as CDOT measures it: back face to back face of the abutments along
 * the alignment (the deck runs over an integral abutment's diaphragm, or to a seat abutment's backwall).
 * From the bearing line: half an integral abutment's cap width behind it, else the stem behind it; along
 * the alignment, divided by the cosine of the skew.
 */
export function deckLengthFor(b: BridgeInputs, abutments: [AbutmentInputs | null, AbutmentInputs | null]) {
  const first = b.supports[0];
  const last = b.supports[b.supports.length - 1];
  const behind = (s: typeof first, a: AbutmentInputs | null) => {
    if (!a) return s.endDistance; // without the abutment: the girder's end
    const d = a.type.startsWith("integral") ? a.capWidth / 2 : Math.max(0, a.stemT - s.bearingOffset);
    return d / Math.cos((s.skew * Math.PI) / 180);
  };
  return Math.round((last.station - first.station + behind(first, abutments[0]) + behind(last, abutments[1])) * 100) / 100;
}

/**
 * An integral abutment's stiffness along the bridge, kip/in: its piles (or shafts, micropiles) pushed through the
 * movement, their head shears over it (the p–y analysis's secant stiffness, pinned heads, CDOT BDM 11.3.1). The
 * backfill's own help isn't counted (it would take more from the piers' share otherwise left with them). Rigid when it
 * can't be worked out (the abutment then takes its unit's force).
 */
export function integralStiffness(a: AbutmentInputs) {
  try {
    const g = designAbutment(a).integral;
    const f = g?.foundation;
    if (!g || !f || !(g.delta > 0)) return Infinity;
    const n = f.kind === "micropiles" ? f.nPiles : g.n;
    const H0 = Math.abs(f.lat0.H0); // the movement alone
    return H0 > 0 ? (n * H0) / g.delta : Infinity;
  } catch {
    return Infinity;
  }
}

/**
 * The force a support's bearing line passes along the bridge as it expands and contracts, unfactored, kip: every
 * girder's pad sheared through the movement, Gmax A Δ / hrt (AASHTO Eq. 14.6.3.1-2, the pad's share of the thermal
 * range), no more than a sliding surface's friction; none at a leveling pad (no movement).
 */
export function bearingLineForce(bi: BearingInputs, r: ReturnType<typeof designBearing>, nGirders: number) {
  if (!(bi.expansionLength > 0)) return 0;
  const d = Math.min(r.movement.thermal * bi.thermalFactor + bi.otherStatic, r.ptfe.slip);
  return (nGirders * r.pad.G.Gmax * r.pad.A * d) / r.pad.hrt;
}

/**
 * A pier column's loads along the bridge from the Bridge: its bearings fixed where the girders are cast into its
 * diaphragm or the bearings are fixed, else expansion (their pads' shear, padTU, and their part of the braking and wind
 * by stiffness); its share of the bridge's braking (longitudinalShares, as a part of the force the column's link works
 * out); its distance from the bridge's point of no movement (fixedPoint) for the temperature force; on fixed bearings, the
 * other supports' pads' reaction (thermalReactions) as well.
 */
export function columnLongitudinal(b: BridgeInputs, support: number, col: ColumnInputs, braking: number, k: LongStiffness, padTU: number): ColumnInputs["longitudinal"] {
  const s = b.supports[support];
  const fixed = !Number.isFinite(k.kBear);
  const BRlink = col.link?.bridge?.braking ?? 0;
  const part = BRlink > 0 ? Math.max(0, Math.min(1, braking / BRlink)) : 0;
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  return {
    ...col.longitudinal,
    bearings: fixed ? "fixed" : "expansion",
    share: fixed ? r3(part) : col.longitudinal.share,
    padShare: fixed ? 0 : r3(part),
    bearingForce: Math.round(padTU * 10) / 10,
    distance: Math.round(Math.abs(s.station - fixedPoint(b)) * 100) / 100,
  };
}

/**
 * The temperature force each support takes along the bridge, unfactored, kip: where its bearings shear or slide, their
 * own force (padForce); a rigid support (cast in, or on fixed bearings) the reaction of its unit's other bearings,
 * signed by their side of the point of no movement (the superstructure in equilibrium: those either side of it
 * balance), shared equally among the unit's rigid supports. Where a unit has no rigid support its pads balance about
 * their stiffness, each taking its own.
 */
export function thermalReactions(b: BridgeInputs, k: LongStiffness[], padForce: number[]) {
  const s = b.supports;
  const xf = fixedPoint(b);
  const out = padForce.map((f, j) => (Number.isFinite(k[j].kBear) ? f : 0));
  const units: number[][] = [[0]];
  for (let j = 1; j < s.length; j++) {
    units[units.length - 1].push(j);
    if (j < s.length - 1 && s[j].type === "simple-pier") units.push([j]);
  }
  for (const u of units) {
    const rigid = u.filter((j) => !Number.isFinite(k[j].kBear));
    if (!rigid.length) continue;
    const R = Math.abs(u.filter((j) => Number.isFinite(k[j].kBear)).reduce((t, j) => t + Math.sign(s[j].station - xf) * padForce[j], 0));
    for (const j of rigid) out[j] += R / rigid.length;
  }
  return out;
}

/**
 * The approach slab's loads on its abutment, the whole slab per foot of the abutment (the abutment takes half, the
 * sleeper the rest): its weight (DC), its wearing surface (DW), and the design lane load on it, every lane with its
 * multiple presence factor (AASHTO 3.6.1.2.4, 3.6.1.1.2). No truck: a lane carries one, and the girders' reaction already
 * has it over the abutment.
 */
export function approachOnAbutment(b: BridgeInputs, ap: Pick<ApproachSlabInputs, "L" | "W" | "t" | "gammaC" | "wearing" | "gammaWS" | "barrier">, abutmentLength: number, barrierWeight = 0) {
  const lanes = designLanes(b);
  const len = Math.max(1e-6, abutmentLength);
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  return {
    // With the rail carried on along its edges, the two rails' weight (klf each, as the girders take it) too.
    approachDC: r3((ap.gammaC * (ap.t / 12) * ap.L * ap.W + (ap.barrier ? 2 * barrierWeight * ap.L : 0)) / len),
    approachDW: r3((ap.gammaWS * (ap.wearing / 12) * ap.L * ap.W) / len),
    approachLL: r3((Math.max(...Array.from({ length: lanes }, (_, m) => (m + 1) * multiplePresence(m + 1))) * 0.64 * ap.L) / len),
  };
}

/**
 * A support's share of the wind along the bridge, unfactored, kip (shared as its braking is: its part of each unit):
 * on the superstructure, the transverse line load times the longitudinal coefficient (AASHTO 3.8.1.2.3a: 0.25 for the
 * usual girder bridge, spans to 150 ft and 33 ft high; else Table 3.8.1.2.3a-1's 0.38 for girders, with the full
 * transverse), Strength III, V and Service I; on the live load, 0.04 klf (3.8.1.3), Strength V.
 */
export function windAlong(run: BridgeRun, share: ReturnType<typeof longitudinalShares>[number]) {
  const g = run.groups[0]?.inputs ?? run.steel?.standIn;
  if (!g) return null;
  const site = g.site ?? SITE_WIND_DEFAULTS;
  const w = superstructureWind(g, site);
  const maxSpan = Math.max(...run.layout.spans.map((s) => s.L));
  const c = maxSpan <= 150 && site.Z <= 33 ? 0.25 : 0.38;
  const along = (line: number | null) => share.units.reduce((t, u) => t + u.share * c * (line ?? 0) * u.L, 0);
  const r1 = (v: number) => Math.round(v * 10) / 10;
  return { WS3: r1(along(w.strengthIII?.line ?? null)), WS5: r1(along(w.strengthV.line)), WL: r1(share.units.reduce((t, u) => t + u.share * 0.04 * u.L, 0)), WSs: r1(along(w.serviceI.line)) };
}

/**
 * A steel girder bridge's side of a pier cap, as a precast design's would be (stm/cap-loads.ts GirderSide): each girder's
 * dead load reactions from the Steel Girder Design Check's continuous girder (half to each side where spans bear from
 * both), DC1 apart for the cap's construction stage; the live load placed by lanes on the cap from simple spans.
 */
export function steelSide(b: BridgeInputs, run: BridgeRun, support: number, span: number, end: "start" | "end", designId: string, name: string): GirderSide {
  const s = b.supports[support];
  const r = run.reactions[support] as BridgeRun["reactions"][number] & { steel?: { perGirder: { DC: number; DC1: number; DW: number } } };
  const sides = [support - 1, support].filter((j) => j >= 0 && j < run.layout.spans.length).length;
  const share = 1 / Math.max(1, sides);
  const per = r.steel?.perGirder ?? { DC: r.DC, DC1: r.DC1, DW: r.DW };
  const both = (v: number) => ({ interior: v * share, exterior: v * share });
  return {
    designId,
    name,
    span,
    end,
    n: b.nGirders,
    S: spacingAt(b, s),
    overhang: run.layout.overhang,
    barrierWidth: b.barrierWidth,
    skew: Math.abs(s.skew),
    L: run.layout.spans[span].L,
    continuous: false,
    dc: both(per.DC),
    dc1: both(per.DC1),
    dw: both(per.DW),
    liveContinuous: null,
    liveUnbalance: null,
    liveUnbalanceStatic: null,
    wind: run.steel ? sideWind(run.steel.standIn) : null,
    brakingPerLane: brakingPerLane(run.layout.length).perLane,
    ...(run.steel ? { inDiaphragm: { wg: steelAtSupport(run, support).wg, endDist: s.endDistance, wDeck: steelAtSupport(run, support).wDeck } } : {}),
  };
}

/**
 * A steel girder bridge's girders at a support, as a precast design's are read for what is cast around their ends
 * (girdersInside, the cap's diaphragm): the steel of the segment there (klf, Table 3.5.1-1's 0.490 kcf), and the deck
 * and haunch on an interior and an exterior girder (klf).
 */
export function steelAtSupport(run: BridgeRun, support: number) {
  const i = run.steel!.inputs;
  const X = i.spans.slice(0, support).reduce((t, L) => t + L, 0);
  let k = 0;
  for (let x = 0; k < i.segments.length - 1 && x + i.segments[k].length <= X; k++) x += i.segments[k].length;
  const seg = i.segments[k];
  const topWidth = steelShape(seg).topWidth;
  const deck = (trib: number) => ((i.deckT / 12) * trib + (i.haunch / 12) * (topWidth / 12)) * i.wcDeck;
  return { wg: selfWeight(seg), wDeck: { interior: deck(i.S), exterior: deck(i.S / 2 + i.overhang) } };
}

/**
 * A slab bridge's side of a pier cap, as a girder design's would be (stm/cap-loads.ts GirderSide): its bearing lines at
 * the Bridge's spacing, each carrying the slab's reaction per foot times its width (the slab design's, so the slab's
 * continuity is in it), half to each side where a span bears from both; the live load placed by lanes on the cap as for
 * girders (the lanes' reactions on simple spans, the lever rule across the lines).
 */
export function slabSide(b: BridgeInputs, run: BridgeRun, support: number, span: number, end: "start" | "end", designId: string, name: string): GirderSide {
  const s = b.supports[support];
  const r = run.reactions[support] as BridgeRun["reactions"][number] & { slab?: { perFoot: { DC: number; DW: number }; tribInt: number; tribExt: number } };
  const sides = [support - 1, support].filter((j) => j >= 0 && j < run.layout.spans.length).length;
  const share = 1 / Math.max(1, sides);
  const per = r.slab?.perFoot ?? { DC: 0, DW: 0 };
  const int = r.slab?.tribInt ?? spacingAt(b, s);
  const ext = r.slab?.tribExt ?? spacingAt(b, s) / 2 + run.layout.overhang;
  const dc = { interior: per.DC * int * share, exterior: per.DC * ext * share };
  const dw = { interior: per.DW * int * share, exterior: per.DW * ext * share };
  const total = run.layout.length;
  return {
    designId,
    name,
    span,
    end,
    n: b.nGirders,
    S: spacingAt(b, s),
    overhang: run.layout.overhang,
    barrierWidth: b.barrierWidth,
    skew: Math.abs(s.skew),
    L: run.layout.spans[span].L,
    continuous: false,
    dc,
    dc1: dc,
    dw,
    liveContinuous: null,
    liveUnbalance: null,
    liveUnbalanceStatic: null,
    wind: null,
    brakingPerLane: brakingPerLane(total).perLane,
  };
}

/**
 * A support's pot or disc bearings from the Bridge, each girder line's: the service loads as the plans give them
 * (DC + DW and LL with IM; WisDOT 27.2.2.3), the least (DC alone, no uplift), the horizontal forces its share of the
 * longitudinal ones over its lines (factored: the governing of 1.75 BR and the wind's Strength V or III, with 0.50 TU; at
 * service BR + TU), fixed where the support is, else guided along the bridge; the movement each way from the bridge's
 * point of no movement (α 6.0e-6 /°F over a 120 °F range, half each way, ½ in more); a semi-integral end diaphragm's
 * weight on it (as on pads). The bearing's own sizes and rotation kept as designed.
 */
export function hlmrFromBridge(b: BridgeInputs, run: BridgeRun, support: number, current: HlmrInputs, long: { braking: number; tu: number; wind: ReturnType<typeof windAlong> | null }, abutment?: Pick<AbutmentInputs, "type" | "backwallH" | "backwallT" | "length" | "gammaC"> | null): HlmrInputs {
  const s = b.supports[support];
  const pads = bearingFromBridge(b, run, support, BEARING_DEFAULTS, abutment);
  const r = run.reactions[support];
  const own = (key: "DC" | "LLIM") => (r.sides.length > 1 && s.bearingOffset > 0 ? Math.max(...r.sides.map((x) => Math.max(x.interior[key], x.exterior[key]))) : r[key]);
  const n = Math.max(1, b.nGirders);
  const w = long.wind;
  const Hu = (Math.max(1.75 * long.braking, w ? 1.35 * long.braking + w.WS5 + w.WL : 0, w ? w.WS3 : 0) + 0.5 * long.tu) / n;
  const Hs = (long.braking + long.tu) / n;
  const dist = Math.abs(s.station - fixedPoint(b));
  const r1 = (v: number) => Math.round(v * 10) / 10;
  return {
    ...current,
    kind: s.bearingKind === "disc" ? "disc" : "pot",
    fixity: s.bearing === "fixed" ? "fixed" : current.fixity === "free" ? "free" : "guided",
    DL: r1(pads.DL),
    LL: r1(own("LLIM")),
    minLoad: r1(own("DC") * 0.9),
    Hu: r1(Hu),
    Hs: r1(Hs),
    ptfe: { ...current.ptfe, movement: Math.round((6e-6 * 120 * dist * 12 * 0.5 + 0.5) * 8) / 8 },
  };
}
