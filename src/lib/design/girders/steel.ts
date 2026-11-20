import { DesignError, type Check } from "../walls/cip";
import { modulus, distributionFactors, type DistFactors, type GirderInputs } from "./prestressed";
import { appendixA6, effectivePlasticMoment, negativeYieldMoments, redistributionMoment, refinedRedistribution, rotationalStiffness, thetaRL } from "./steel-appendix";
import { CF_CONNECTION_DEFAULTS, BOLT_DIAMETERS, cfConnection, type CfConnection } from "./steel-connection";
import { designSplice, SPLICE_DEFAULTS, type SpliceInputs, type SpliceResult } from "./steel-splice";
import { connectionFactor, designSole, F1554_FU, SOLE_DEFAULTS, type SoleInputs } from "./steel-sole";
import { nonprismaticBeam } from "./steel-beam";
import { angle, L_SHAPE_NAMES, singleAngle, stabilityBracing, type CrossFrame } from "./steel-crossframe";
import { deadEffects, gridGeometry, gridModel, leverStrip, leverWeights, liveExtremes, type GridInput, type Sparse } from "./steel-grid";
import { windPressure } from "./substructure-loads";
import { ES, plasticMoment, plates, sectionProps, selfWeight, type DeckSection, type Plate, type SectionProps, type SteelSegment, type Stage } from "./steel-section";
import { W_SHAPES } from "./w-shapes";
import {
  bearingStiffener,
  cyclesPerTruck,
  FATIGUE_CATEGORIES,
  FATIGUE_I,
  FATIGUE_IM,
  fatigueResistance,
  studPitchForFatigue,
  studPitchLimits,
  studResistance,
  studsAcross,
  transverseStiffener,
  webAtBearing,
  type BearingStiffeners,
  type FatigueCategory,
  type StiffenerPlate,
  type Studs,
} from "./steel-details";

// Steel Girder Design Check: a straight, continuous (or simple-span) composite steel I-girder line, welded
// plate girders or rolled W shapes, to AASHTO LRFD 10th Edition Article 6.10, checked as a line girder:
// the girder's own stiffness along it (steel alone for DC1, long-term 3n for DC2 and DW, short-term n for
// live load, 6.10.1.5), HL-93 placed by influence lines (with 90% of two trucks for negative moment,
// 3.6.1.3.1), distribution factors by 4.6.2.2 (with the rigid cross-section check for the exterior girder);
// cross-section proportions (6.10.2), constructibility (6.10.3), service (6.10.4), the strength limit state
// in positive flexure (6.10.7), negative flexure (6.10.8) and shear (6.10.9), ductility (6.10.7.3), the
// minimum negative-flexure deck reinforcement (6.10.1.7) and the optional live-load deflection
// (2.5.2.6.2); and the details: load-induced fatigue of the flanges' welded attachments (6.6.1.2) and the web
// (6.10.5.3), the shear connectors (6.10.10), the intermediate and bearing stiffeners (6.10.11), and the
// dead load deflections for camber (6.7.2). Cross-frames are not designed here.
// Feet and kips for the girder line, inches and ksi for sections and stresses.

export type StiffenerZone = { from: number; to: number; spacing: number }; // ft from the girder's start; in

export type SteelGirderInputs = {
  spans: number[]; // ft, bearing to bearing (a pier's bearings at its centerline)
  nGirders: number;
  S: number; // ft
  overhang: number; // ft, exterior girder to the deck's edge
  barrierWidth: number; // ft, the deck's edge to the barrier's face
  skew: number; // degrees
  // Deck
  deckT: number; // in, as cast
  sacrificial: number; // in, integral wearing surface (not in the composite section)
  haunch: number; // in, the deck's bottom to the top of the web or of the top flange (haunchTo)
  haunchTo: "web" | "flange";
  fcDeck: number; // ksi
  wcDeck: number; // kcf
  n: number; // modular ratio; 0 to compute it from the deck's modulus (5.4.2.4)
  bars: { pct: number; top: number; topCover: number; bottomCover: number; fy: number }; // % of the deck's area in the effective width; the top layer's share; centroids from the deck's top and bottom (in)
  // Steel
  Fyw: number; // ksi
  Fyf: number; // ksi
  segments: SteelSegment[]; // along the girder from its start; lengths add up to the bridge's length
  crossFrames: number; // ft, the most spacing between cross-frames (brace points) within a span
  pours: { from: number; to: number; order: number }[]; // the deck placed in this order (ft along the girder); empty: one pour
  braces: number[]; // ft along the girder: the cross-frames where given (the supports are braced too); empty: equally spaced by crossFrames
  appendixA6: boolean; // negative flexure by Appendix A6 where it applies (compact and noncompact webs)
  analysis: "line" | "grid"; // the loads' effects: a line girder with distribution factors (4.6.2.2), or a grid of the whole bridge (4.6.3.3)
  redistribution: boolean; // moment redistribution from the interior piers (Appendix B6)
  redistributionMethod: "simplified" | "refined"; // B6.3–B6.5 (effective plastic moment) or B6.6 (rotational continuity)
  endDistance: number; // ft, the girder's ends beyond the abutments' bearings (the plan sheets)
  radius: number; // ft, the girder's horizontal radius; 0: straight (curved: within 4.6.1.2.4b, flange lateral bending by Eq. C4.6.1.2.4b-1)
  stiffeners: StiffenerZone[]; // transverse stiffeners; none: unstiffened web
  studsThroughout: boolean; // shear connectors along the whole girder (6.10.4.2.1: the deck effective in negative flexure at service)
  // Loads
  loads: {
    mode: "computed" | "entered";
    dc1: number; // klf per girder, entered: DC1 other than the girder's steel
    dc2: number; // klf
    dw: number; // klf
    sip: number; // psf, stay-in-place forms between flanges
    misc: number; // plf, cross-frames, stiffeners and other steel
    otherDC1: number; // klf
    barrierWeight: number; // klf, each barrier (shared equally by the girders)
    otherDC2: number; // klf
    fws: number; // psf, future wearing surface over the roadway
  };
  girder: "both" | "interior" | "exterior"; // which girder's distribution factor and effective width; both: the larger factor and the smaller width
  rigidMethod: boolean; // exterior girder not less than the rigid cross-section (4.6.2.2.2d), required with cross-frames
  skewShearInterior: boolean;
  IM: number; // dynamic load allowance on the truck and tandem
  constructionLL: number; // psf, on the deck while it's placed
  flConstruction: number; // ksi, flange lateral bending during construction (overhang brackets)
  deflection: { check: boolean; limit: number }; // L / limit under the live load (2.5.2.6.2)
  eta: number; // ηD ηR ηI
  // Details (phase 2)
  fatigue: { check: boolean; adttSL: number; life: number; flange: FatigueCategory; flangeNeg: FatigueCategory }; // single-lane ADTT (3.6.1.4.2); the category of the attachments on the flanges (connection plates, stiffeners) in positive and in negative moment regions
  studs: Studs & { check: boolean; zones: { from: number; to: number; pitch: number }[] }; // stud shear connectors: diameter, studs across, pitch (in), height (in), Fu (ksi); zones of other pitches along the girder (ft, in)
  stiffener: StiffenerPlate; // the intermediate transverse stiffeners in the stiffened zones
  bearing: BearingStiffeners & { use: boolean; N: number; weld: number };
  endFrame: { check: boolean; abutment: "integral" | "semi-integral" | "seat"; type: "X" | "K"; diagonal: string; strut: string; hb: number }; // hb 0: 0.8 of the girder's depth, to the inch; // the cross-frames at the abutments, on the bearing stiffeners (6.7.4.2.1)
  sole: SoleInputs; // sole plates and anchor rods at the bearings (14.8)
  splice: SpliceInputs; // bolted field splices at the sections' changes (6.13.6.1.3), designed; shopWelded: the changes made in the shop
  crossFrame: CrossFrame & { check: boolean; connection: CfConnection }; // intermediate cross-frames: stability bracing (6.7.4.2.2), wind (4.6.2.7.1), curvature; the members' end connections (6.13)
  wind: { V: number; exposure: "B" | "C" | "D"; Z: number; lateral: boolean; construction: number }; // construction: the wind speed while the deck is placed (mph, 0: not checked) // lateral: the wind's lateral bending of the bottom flange at Strength III and V (C4.6.2.7.1, exterior girder) // Strength III design wind speed (mph, 0: none), exposure, height (ft); Strength V uses 80 mph // plate bearing stiffeners at the supports; without them the web at the bearing (D6.5): bearing length N, flange-to-web weld or fillet (in)
};

const plate = (b: number, t: number): Plate => ({ b, t });

/** FHWA Steel Bridge Design Handbook Design Example 2A's bridge: two 90 ft spans, four plate girders at 10 ft. */
export const STEEL_DEFAULTS: SteelGirderInputs = {
  spans: [90, 90],
  nGirders: 4,
  S: 10,
  overhang: 3.5,
  barrierWidth: 1.5,
  skew: 0,
  deckT: 8.5,
  sacrificial: 0.5,
  haunch: 2,
  haunchTo: "web",
  fcDeck: 4,
  wcDeck: 0.15,
  n: 8,
  bars: { pct: 1, top: 1 / 3, topCover: 2.5, bottomCover: 1.75, fy: 60 },
  Fyw: 50,
  Fyf: 50,
  segments: [
    { length: 63, kind: "plate", D: 42, tw: 0.4375, top: plate(14, 0.75), bottom: plate(16, 1.25) },
    { length: 54, kind: "plate", D: 42, tw: 0.5, top: plate(14, 1.125), bottom: plate(16, 1.25) },
    { length: 63, kind: "plate", D: 42, tw: 0.4375, top: plate(14, 0.75), bottom: plate(16, 1.25) },
  ],
  crossFrames: 22.5,
  pours: [],
  braces: [20, 40, 60, 80, 100, 120, 140, 160], // 2A: 20 ft bays, 10 ft each side of the pier
  appendixA6: true,
  redistribution: true, // 2A redistributes 937 kip·ft from the pier (Appendix B6)
  redistributionMethod: "simplified",
  radius: 0,
  analysis: "line",
  endDistance: 0.75,
  stiffeners: [],
  studsThroughout: true,
  loads: { mode: "computed", dc1: 0, dc2: 0, dw: 0, sip: 15, misc: 15, otherDC1: 0, barrierWeight: 0.52, otherDC2: 0, fws: 25 },
  girder: "both",
  rigidMethod: true,
  skewShearInterior: false,
  IM: 0.33,
  constructionLL: 0,
  flConstruction: 0,
  deflection: { check: true, limit: 800 },
  eta: 1,
  fatigue: { check: true, adttSL: 1000, life: 75, flange: "B", flangeNeg: "C'" }, // 2A: bolted connection plates in positive moment, welded near the pier
  studs: { check: true, d: 0.875, perRow: 3, pitch: 10, height: 6, Fu: 60, zones: [] },
  stiffener: { bt: 5.5, tp: 0.5, Fys: 50, pair: false },
  bearing: { use: true, bt: 6, tp: 0.625, Fys: 50, clip: 1.5, pairsEnd: 1, pairsPier: 2, gap: 8, N: 10, weld: 0.3125 },
  splice: SPLICE_DEFAULTS,
  sole: SOLE_DEFAULTS,
  endFrame: { check: true, abutment: "semi-integral", type: "X", diagonal: "L5X5X1/2", strut: "L5X5X1/2", hb: 0 },
  crossFrame: { check: true, type: "X", diagonal: "L5X5X1/2", strut: "L5X5X1/2", hb: 36, Fy: 50, fullDepthPlates: true, plateWidth: 10, plateThickness: 0.5, connection: CF_CONNECTION_DEFAULTS },
  wind: { V: 0, exposure: "C", Z: 33, lateral: true, construction: 0 },
};

// --- inputs as saved ----------------------------------------------------------------------------------

const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const segOf = (v: unknown): SteelSegment => {
  const s = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const pl = (x: unknown, d: Plate): Plate => {
    const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    return { b: num(o.b, d.b), t: num(o.t, d.t) };
  };
  const d = STEEL_DEFAULTS.segments[0];
  return { length: num(s.length, 0), kind: s.kind === "rolled" ? "rolled" : "plate", ...(typeof s.shape === "string" ? { shape: s.shape } : {}), D: num(s.D, d.D), tw: num(s.tw, d.tw), top: pl(s.top, d.top), bottom: pl(s.bottom, d.bottom) };
};

/** A steel girder check's inputs as saved, filled in from the defaults. */
export function steelGirderInputs(saved: unknown): SteelGirderInputs {
  const s = (saved && typeof saved === "object" ? saved : {}) as Record<string, unknown>;
  if (Object.keys(s).length === 0) return structuredClone(STEEL_DEFAULTS);
  const d = STEEL_DEFAULTS;
  const o = <T extends object>(x: unknown, def: T) => ({ ...def, ...((x && typeof x === "object" ? x : {}) as Partial<T>) });
  return {
    ...d,
    ...(s as Partial<SteelGirderInputs>),
    spans: Array.isArray(s.spans) ? (s.spans as unknown[]).map((x) => num(x, 0)).filter((x) => x > 0).slice(0, 6) : d.spans,
    segments: Array.isArray(s.segments) ? (s.segments as unknown[]).slice(0, 30).map(segOf) : d.segments,
    // Designs saved before these inputs existed keep their equal spacing and no Appendix A6 or B6.
    braces: Array.isArray(s.braces) ? (s.braces as unknown[]).map((x) => num(x, -1)).filter((x) => x > 0).slice(0, 200) : [],
    appendixA6: s.appendixA6 === true,
    pours: Array.isArray(s.pours) ? (s.pours as unknown[]).slice(0, 20).map((z) => o(z, { from: 0, to: 0, order: 1 })) : [],
    redistribution: s.redistribution === true,
    redistributionMethod: s.redistributionMethod === "refined" ? "refined" : "simplified",
    analysis: s.analysis === "grid" ? "grid" : "line",
    radius: Math.max(0, num(s.radius, 0)),
    endDistance: Math.max(0, num(s.endDistance, 0.75)),
    stiffeners: Array.isArray(s.stiffeners) ? (s.stiffeners as unknown[]).slice(0, 30).map((z) => o(z, { from: 0, to: 0, spacing: 0 })) : [],
    bars: o(s.bars, d.bars),
    loads: o(s.loads, d.loads),
    deflection: o(s.deflection, d.deflection),
    fatigue: (() => {
      const f = o(s.fatigue, d.fatigue);
      return { ...f, flange: f.flange in FATIGUE_CATEGORIES ? f.flange : d.fatigue.flange, flangeNeg: f.flangeNeg in FATIGUE_CATEGORIES ? f.flangeNeg : d.fatigue.flangeNeg };
    })(),
    studs: (() => {
      const st = o(s.studs, d.studs);
      return { ...st, zones: Array.isArray(st.zones) ? st.zones.slice(0, 30).map((z) => o(z, { from: 0, to: 0, pitch: 0 })) : [] };
    })(),
    stiffener: o(s.stiffener, d.stiffener),
    bearing: o(s.bearing, d.bearing),
    crossFrame: (() => {
      const c = o(s.crossFrame, d.crossFrame);
      // Designs saved before the connections were checked keep them off.
      const raw = (s.crossFrame as { connection?: unknown } | undefined)?.connection;
      const k = raw && typeof raw === "object" ? o(raw, CF_CONNECTION_DEFAULTS) : { ...CF_CONNECTION_DEFAULTS, check: false };
      const connection: CfConnection = { ...k, kind: k.kind === "welded" ? "welded" : "bolted", d: BOLT_DIAMETERS.includes(k.d) ? k.d : 0.875, grade: k.grade === "A490" ? "A490" : "A325", threads: k.threads === "excluded" ? "excluded" : "included", holes: k.holes === "drilled" ? "drilled" : "punched", surface: k.surface === "A" || k.surface === "C" ? k.surface : "B" };
      return { ...c, type: c.type === "K" ? "K" : "X", diagonal: L_SHAPE_NAMES.includes(c.diagonal) ? c.diagonal : d.crossFrame.diagonal, strut: L_SHAPE_NAMES.includes(c.strut) ? c.strut : d.crossFrame.strut, connection } as SteelGirderInputs["crossFrame"];
    })(),
    endFrame: (() => {
      // Designs saved before the end cross-frames were designed keep them off.
      const raw = s.endFrame && typeof s.endFrame === "object" ? (s.endFrame as Record<string, unknown>) : null;
      const k = raw ? o(raw, d.endFrame) : { ...d.endFrame, check: false };
      return { ...k, abutment: k.abutment === "integral" || k.abutment === "seat" ? k.abutment : "semi-integral", type: k.type === "K" ? "K" : "X", diagonal: L_SHAPE_NAMES.includes(k.diagonal) ? k.diagonal : d.endFrame.diagonal, strut: L_SHAPE_NAMES.includes(k.strut) ? k.strut : d.endFrame.strut } as SteelGirderInputs["endFrame"];
    })(),
    sole: (() => {
      // Designs saved before the sole plates were designed keep them off.
      const raw = s.sole && typeof s.sole === "object" ? (s.sole as Record<string, unknown>) : null;
      const k = raw ? o(raw, d.sole) : { ...d.sole, check: false };
      const an = o(raw?.anchors, d.sole.anchors);
      return { ...k, fixed: k.fixed === "abutments" || k.fixed === "all" ? k.fixed : "piers", anchors: { ...an, grade: an.grade === "A449" || (typeof an.grade === "number" && an.grade in F1554_FU) ? an.grade : "A449" } } as SoleInputs;
    })(),
    splice: (() => {
      // Designs saved before the splices were designed keep them off.
      const raw = s.splice && typeof s.splice === "object" ? (s.splice as Record<string, unknown>) : null;
      const k = raw ? o(raw, SPLICE_DEFAULTS) : { ...SPLICE_DEFAULTS, check: false };
      return { ...k, shopWelded: Array.isArray(raw?.shopWelded) ? (raw!.shopWelded as unknown[]).map((x) => num(x, -1)).filter((x) => x > 0).slice(0, 50) : [], d: BOLT_DIAMETERS.includes(k.d) ? k.d : 0.875, grade: k.grade === "A490" ? "A490" : "A325", threadsFlange: k.threadsFlange === "included" ? "included" : "excluded", threadsWeb: k.threadsWeb === "excluded" ? "excluded" : "included", surface: k.surface === "A" || k.surface === "C" ? k.surface : "B" } as SpliceInputs;
    })(),
    wind: (() => {
      const w = o(s.wind, d.wind);
      // Designs saved before the wind's lateral bending was checked keep it off.
      return { ...w, exposure: w.exposure === "B" || w.exposure === "D" ? w.exposure : "C", lateral: (s.wind as { lateral?: unknown } | undefined)?.lateral === true, construction: Math.max(0, num(w.construction, 0)) } as SteelGirderInputs["wind"];
    })(),
    haunchTo: s.haunchTo === "flange" ? "flange" : "web",
    girder: s.girder === "interior" || s.girder === "exterior" ? s.girder : "both",
  };
}

export const W_SHAPE_NAMES = W_SHAPES.map((r) => r[0]);

// --- the design -------------------------------------------------------------------------------------------

const PHI_F = 1.0; // 6.5.4.2, flexure
const PHI_V = 1.0; // shear
/** DC and construction loads on the fully erected steelwork during construction (AASHTO 3.4.2.1). */
const GAMMA_ERECT = 1.4;

/** The ratio of shear buckling to shear yield, C (Eqs. 6.10.9.3.2-4 to -6). */
export function shearC(D: number, tw: number, Fyw: number, k: number) {
  const r = D / tw;
  const a = Math.sqrt((ES * k) / Fyw);
  if (r <= 1.12 * a) return 1;
  if (r <= 1.4 * a) return (1.12 / r) * a;
  return (1.57 / r ** 2) * ((ES * k) / Fyw);
}

/** The hybrid factor Rh (6.10.1.10.1): 1.0 for a homogeneous section. */
export function hybridRh(Aw: number, Afn: number, Dn: number, tw: number, Fyw: number, fn: number) {
  if (Fyw >= fn) return 1;
  const beta = (2 * Dn * tw) / Afn;
  const rho = Math.min(1, Fyw / fn);
  return (12 + beta * (3 * rho - rho ** 3)) / (12 + 2 * beta);
}

/** The web load-shedding factor Rb (6.10.1.10.2, Eqs. -3, -5, -8, -9), webs without longitudinal stiffeners. */
export function webRb(Dc: number, tw: number, bfc: number, tfc: number, Fyc: number) {
  const awc = (2 * Dc * tw) / (bfc * tfc);
  const crw = Math.min(5.7, Math.max(4.6, 3.1 + 5.0 / awc));
  const lrw = crw * Math.sqrt(ES / Fyc);
  const r = (2 * Dc) / tw;
  if (r <= lrw) return 1;
  return Math.min(1, 1 - (awc / (1200 + 300 * awc)) * (r - lrw));
}

/** The compression flange's nominal resistance Fnc (6.10.8.2): the lesser of local buckling and LTB. */
export function flangeFnc(p: { bfc: number; tfc: number; Dc: number; tw: number; Fyc: number; Fyw: number; Lb: number; Cb: number; Rb: number; Rh: number }) {
  const { bfc, tfc, Dc, tw, Fyc, Fyw, Lb, Cb, Rb, Rh } = p;
  // Local buckling (6.10.8.2.2): Fyr the smaller of 0.7Fyc and Fyw, at least 0.5Fyc.
  const lf = bfc / (2 * tfc);
  const lpf = 0.38 * Math.sqrt(ES / Fyc);
  const FyrF = Math.max(0.5 * Fyc, Math.min(0.7 * Fyc, Fyw));
  const lrf = 0.56 * Math.sqrt(ES / FyrF);
  const flb = lf <= lpf ? Rb * Rh * Fyc : (1 - (1 - FyrF / (Rh * Fyc)) * ((lf - lpf) / (lrf - lpf))) * Rb * Rh * Fyc;
  // LTB (6.10.8.2.3a, b): Fyr = 0.5Fyc for webs without longitudinal stiffeners; rt by Eq. 6.10.8.2.3b-3.
  const rt = bfc / Math.sqrt(12 * (1 + (Dc * tw) / (3 * bfc * tfc)));
  const Lp = 1.1 * rt * Math.sqrt(ES / Fyc);
  const FyrL = 0.5 * Fyc;
  const Lr = Math.PI * rt * Math.sqrt(ES / FyrL);
  let ltb: number;
  if (Lb <= Lp) ltb = Rb * Rh * Fyc;
  else if (Lb <= Lr) ltb = Math.min(Rb * Rh * Fyc, Cb * (1 - (1 - FyrL / (Rh * Fyc)) * ((Lb - Lp) / (Lr - Lp))) * Rb * Rh * Fyc);
  else {
    const Fe = (Cb * Math.PI ** 2 * ES) / (Lb / rt) ** 2;
    ltb = Math.min(Rb * Rh * Fyc, Rb * Fe);
  }
  return { Fnc: Math.min(flb, ltb), flb, ltb, lf, lpf, lrf, rt, Lp, Lr, governs: flb <= ltb ? "local buckling" : "lateral-torsional buckling" };
}

/** Cb from the moments at a quarter, half and three-quarters of the unbraced length (Eq. 6.10.8.2.3b-1). */
export function momentGradientCb(Mmax: number, MA: number, MB: number, MC: number) {
  const m = Math.abs(Mmax);
  if (!(m > 0)) return 1;
  return Math.max(1, (12.5 * m) / (2.5 * m + 3 * Math.abs(MA) + 4 * Math.abs(MB) + 3 * Math.abs(MC)));
}

/** The web's elastic bend-buckling resistance (6.10.1.9.1). */
export function webFcrw(D: number, tw: number, Dc: number, Rh: number, Fyc: number, Fyw: number) {
  if (!(Dc > 0)) return Math.min(Rh * Fyc, Fyw / 0.7);
  const k = 9 / (Dc / D) ** 2;
  return Math.min((0.9 * ES * k) / (D / tw) ** 2, Rh * Fyc, Fyw / 0.7);
}

export type ComboKey = "I" | "III" | "V";
const LL_FACTOR: Record<ComboKey, number> = { I: 1.75, III: 0, V: 1.35 };
const COMBO_NAME: Record<ComboKey, string> = { I: "Strength I", III: "Strength III", V: "Strength V" };

export type SteelStation = {
  X: number; // ft from the girder's start
  span: number;
  x: number; // ft in the span
  seg: number;
  M: { dc1: number; dc2: number; dw: number; llPos: number; llNeg: number }; // kip·ft per girder (live load distributed, with IM)
  V: { dc1: number; dc2: number; dw: number; ll: number }; // kip
  dfM: number;
  dfV: number;
  negativeRegion: boolean;
  Mpos: number; // Strength I, kip·ft
  Mneg: number;
  Vu: number; // kip
  ratios: Record<string, number>;
  shear?: { Vcr: number; Vn: number; zone: number; interiorPanel: boolean }; // kip
  fatigue?: {
    Mmax: number; // the fatigue truck per girder with IM, unfactored
    Mmin: number;
    Vmax: number;
    Vmin: number;
    cycles: number;
    bot?: { fMax: number; fMin: number; cat: FatigueCategory }; // ksi at the flange's inner face, tension +
    top?: { fMax: number; fMin: number; cat: FatigueCategory };
    stud?: { Q: number; I: number }; // in³, in⁴ on the short-term section
  };
};

export function designSteelGirder(i: SteelGirderInputs) {
  const spans = i.spans;
  if (!spans.length || spans.some((L) => !(L > 0))) throw new DesignError("Give the spans.");
  if (spans.length > 6) throw new DesignError("Up to six spans.");
  if (!(i.nGirders >= 2)) throw new DesignError("At least two girders.");
  if (!(i.S > 0)) throw new DesignError("Give the girder spacing.");
  const total = spans.reduce((s, L) => s + L, 0);
  const segLen = i.segments.reduce((s, x) => s + x.length, 0);
  if (!i.segments.length) throw new DesignError("Give the girder's cross-sections along it.");
  if (Math.abs(segLen - total) > 0.5) throw new DesignError(`The girder's sections add up to ${segLen.toFixed(2)} ft; the spans to ${total.toFixed(2)} ft.`);
  if (!(i.Fyw > 0 && i.Fyf > 0)) throw new DesignError("Give the steel's yield strengths.");
  for (const s of i.segments) plates(s); // validates every segment
  /** The stud pitch at X (in): a zone's, or the girder's. */
  const pitchAt = (X: number) => {
    const z = i.studs.zones.find((q) => q.pitch > 0 && X >= q.from - 1e-9 && X <= q.to + 1e-9);
    return Math.max(0.1, z ? z.pitch : i.studs.pitch);
  };
  /** Rows of studs over a length of girder, at the pitch along it. */
  const rowsOver = (a: number, b: number) => {
    const N = 400;
    const h = (b - a) / N;
    let rows = 0;
    for (let q = 0; q < N; q++) rows += (h * 12) / pitchAt(a + (q + 0.5) * h);
    return Math.floor(rows + 1e-6);
  };
  const starts: number[] = [];
  spans.reduce((a, L) => (starts.push(a), a + L), 0);
  const segStart: number[] = [];
  i.segments.reduce((a, s) => (segStart.push(a), a + s.length), 0);
  const segAt = (X: number) => {
    let k = 0;
    while (k + 1 < i.segments.length && X >= segStart[k + 1] - 1e-9) k++;
    return k;
  };

  // The deck and its effective width (4.6.2.6.1): interior, half the spacing each side; exterior, half the spacing and the overhang.
  const Ec = modulus(1, i.wcDeck, i.fcDeck);
  const n = i.n > 0 ? i.n : ES / Ec;
  const ts = i.deckT - i.sacrificial;
  if (!(ts > 0)) throw new DesignError("The deck's structural thickness must be positive.");
  const beffInt = i.S * 12;
  const beffExt = (i.S / 2 + i.overhang) * 12;
  const beff = i.girder === "interior" ? beffInt : i.girder === "exterior" ? beffExt : Math.min(beffInt, beffExt);
  const deckFor = (seg: SteelSegment): DeckSection => {
    const p = plates(seg);
    const haunch = Math.max(0, i.haunchTo === "web" ? i.haunch - p.top.t : i.haunch);
    const As = (i.bars.pct / 100) * beff * i.deckT;
    const top = Math.min(1, Math.max(0, i.bars.top));
    return { beff, ts, tGross: i.deckT, haunch, n, fc: i.fcDeck, fy: i.bars.fy, bars: [{ A: As * top, y: ts - i.bars.topCover }, { A: As * (1 - top), y: i.bars.bottomCover }] };
  };
  const props = new Map<string, SectionProps>();
  const prop = (k: number, stage: Stage) => {
    const key = `${k}:${stage}`;
    let p = props.get(key);
    if (!p) props.set(key, (p = sectionProps(i.segments[k], stage, deckFor(i.segments[k]), i.Fyw, i.Fyf)));
    return p;
  };

  // The girder line, three ways: steel alone (DC1), long-term composite (DC2, DW), short-term composite (live load).
  const stiff = (stage: Stage) => (X: number) => (ES * prop(segAt(X), stage).I) / 144;
  const deflectAt = i.deflection.check ? spans.flatMap((L, j) => [starts[j] + 0.4 * L, starts[j] + 0.5 * L, starts[j] + 0.6 * L]) : [];
  // Camber (6.7.2): the dead load deflections at the tenth points of every span.
  const camberAt = spans.flatMap((Ls, j) => Array.from({ length: 9 }, (_, q) => starts[j] + ((q + 1) * Ls) / 10));
  const steelLine = nonprismaticBeam(spans, stiff("steel"), 80, camberAt);
  const longLine = nonprismaticBeam(spans, stiff("3n"), 80, camberAt);
  const shortLine = nonprismaticBeam(spans, stiff("n"), 80, deflectAt);

  // Loads per girder (klf).
  const L = i.loads;
  const roadway = (i.nGirders - 1) * i.S + 2 * i.overhang - 2 * i.barrierWidth;
  const deckWidth = (i.nGirders - 1) * i.S + 2 * i.overhang;
  const avgTop = i.segments.reduce((s, x) => s + plates(x).top.b * x.length, 0) / total; // in
  const dc1Deck =
    L.mode === "entered"
      ? L.dc1
      : (i.deckT / 12) * deckWidth * i.wcDeck / i.nGirders + ((i.haunch / 12) * (avgTop / 12) * i.wcDeck) + ((L.sip / 1000) * Math.max(0, i.S - avgTop / 12) * (i.nGirders - 1)) / i.nGirders + L.misc / 1000 + L.otherDC1;
  const dc2 = L.mode === "entered" ? L.dc2 : (2 * L.barrierWeight) / i.nGirders + L.otherDC2;
  const dw = L.mode === "entered" ? L.dw : ((L.fws / 1000) * roadway) / i.nGirders;
  const wSteel = (X: number) => selfWeight(i.segments[segAt(X)]);

  /** A load's moment and shear at x in span s: uniform loads exactly, the steel's varying weight by its influence line. */
  const deadAt = (line: typeof steelLine, s: number, x: number, w: number, varying?: (X: number) => number) => {
    const u = line.beam.uniformAll(s, x, w);
    if (!varying) return { M: u.M, V: u.V };
    const X = starts[s] + x;
    const ilM = line.beam.influence(s, x, "M");
    const ilV = line.beam.influence(s, x, "V");
    const N = 600;
    let M = 0;
    let V = 0;
    for (const [a, b] of [[0, X], [X, total]]) {
      const h = (b - a) / N;
      if (h <= 0) continue;
      for (let q = 0; q < N; q++) {
        const Xq = a + (q + 0.5) * h;
        M += ilM(Xq) * varying(Xq) * h;
        V += ilV(Xq) * varying(Xq) * h;
      }
    }
    return { M: u.M + M, V: u.V + V };
  };

  // Distribution factors (4.6.2.2): positive moment and shear per span from its own section and length; negative
  // moment at each pier from the pier's section and the two spans' average length (Table C4.6.2.2.1-1).
  const dfBase = { S: i.S, nGirders: i.nGirders, overhang: i.overhang, barrierWidth: i.barrierWidth, skew: i.skew, distribution: "aashto", rigidMethod: i.rigidMethod, skewShearInterior: i.skewShearInterior, shape: "steel" } as unknown as GirderInputs;
  const dfFor = (Lspan: number, k: number) => {
    const g = prop(k, "steel");
    const deck = deckFor(i.segments[k]);
    const deckCg = g.depth + deck.haunch + ts / 2;
    const geo = { A: g.A, I: g.I, yb: g.yNA } as unknown as Parameters<typeof distributionFactors>[1];
    const one = (exterior: boolean): DistFactors => distributionFactors({ ...dfBase, L: Lspan }, geo, ts, n, deckCg, exterior);
    const int = one(false);
    const ext = one(true);
    const pick = (f: (d: DistFactors) => number) => (i.girder === "interior" ? f(int) : i.girder === "exterior" ? f(ext) : Math.max(f(int), f(ext)));
    // The fatigue truck's factors: one lane without the multiple presence factor (3.6.1.4.3b).
    return { moment: pick((d) => d.moment), shear: pick((d) => d.shear), fatigueM: pick((d) => d.fatigue), fatigueV: pick((d) => (d.shearOne * d.skewShear) / 1.2), interior: int, exterior: ext };
  };
  const spanDF = spans.map((Ls, j) => dfFor(Ls, segAt(starts[j] + (j === 0 ? 0.4 : j === spans.length - 1 ? 0.6 : 0.5) * Ls)));
  const pierDF = spans.slice(1).map((_, k) => dfFor((spans[k] + spans[k + 1]) / 2, segAt(starts[k + 1])));

  // Stations: twentieths of each span, the sections' ends (each side), and the supports.
  const pts = new Set<number>();
  spans.forEach((Ls, j) => {
    for (let q = 0; q <= 20; q++) pts.add(Math.round((starts[j] + (Ls * q) / 20) * 1e6) / 1e6);
  });
  segStart.slice(1).forEach((X) => {
    pts.add(X - 0.01);
    pts.add(X + 0.01);
  });
  const located = (X: number) => {
    let s = 0;
    while (s + 1 < spans.length && X > starts[s + 1] - 1e-9 && !(Math.abs(X - starts[s + 1]) < 1e-9 && s + 1 === spans.length)) s++;
    // A support belongs to the span on its left, except the first.
    if (s > 0 && Math.abs(X - starts[s]) < 1e-9) s--;
    return { s, x: Math.min(spans[s], Math.max(0, X - starts[s])) };
  };

  const eta = i.eta;
  /** The unfactored effects at a point. */
  const effectsCache = new Map<number, ReturnType<typeof effectsRaw>>();
  const effects = (X: number) => {
    const key = Math.round(X * 1e4);
    let e = effectsCache.get(key);
    if (!e) effectsCache.set(key, (e = effectsRaw(X)));
    return e;
  };
  function effectsRaw(X: number, at?: { s: number; x: number }) {
    const { s, x } = at ?? located(X);
    const k = segAt(Math.min(Math.max(X, 1e-6), total - 1e-6));
    const d1 = deadAt(steelLine, s, x, dc1Deck, wSteel);
    const d2 = deadAt(longLine, s, x, dc2);
    const dW = deadAt(longLine, s, x, dw);
    const env = shortLine.beam.liveEnvelope(s, x, i.IM);
    const negativeRegion = longLine.beam.uniformAll(s, x).M < 0;
    if (grid) {
      const gx = grid.at(X, !!at && at.x >= spans[at.s] - 1e-9 && at.s < spans.length - 1);
      return { s, x, k, M: gx.M, V: gx.V, dfM: 1, dfV: 1, negativeRegion };
    }
    const pier = x > spans[s] / 2 ? s : s - 1; // the nearer interior pier
    const dfM = negativeRegion && pier >= 0 && pier < pierDF.length ? pierDF[pier].moment : spanDF[s].moment;
    const dfV = spanDF[s].shear;
    return { s, x, k, M: { dc1: d1.M, dc2: d2.M, dw: dW.M, llPos: dfM * env.Mpos, llNeg: dfM * env.Mneg }, V: { dc1: d1.V, dc2: d2.V, dw: dW.V, ll: dfV * env.V }, dfM, dfV, negativeRegion };
  }
  /** The fatigue truck (3.6.1.4.1: 8, 32 and 32 kip axles, 14 and 30 ft apart) on the short-term girder line: per girder, with its factors and 15% IM, unfactored. */
  const fatigueAt = (X: number) => {
    if (grid) return grid.fatigue(X);
    const e = effects(X);
    const ilM = shortLine.beam.influence(e.s, e.x, "M");
    const ilV = shortLine.beam.influence(e.s, e.x, "V");
    const axles = [
      [8, 0],
      [32, 14],
      [32, 44],
    ];
    let Mmax = 0;
    let Mmin = 0;
    let Vmax = 0;
    let Vmin = 0;
    for (let pos = -50; pos <= total + 50; pos += 0.5)
      for (const dir of [1, -1]) {
        let M = 0;
        let V = 0;
        for (const [P, d] of axles) {
          const Xq = pos + dir * d;
          if (Xq < 0 || Xq > total) continue;
          M += P * ilM(Xq);
          V += P * ilV(Xq);
        }
        Mmax = Math.max(Mmax, M);
        Mmin = Math.min(Mmin, M);
        Vmax = Math.max(Vmax, V);
        Vmin = Math.min(Vmin, V);
      }
    const pier = e.x > spans[e.s] / 2 ? e.s : e.s - 1;
    const dfM = e.negativeRegion && pier >= 0 && pier < pierDF.length ? pierDF[pier].fatigueM : spanDF[e.s].fatigueM;
    const dfV = spanDF[e.s].fatigueV;
    const im = 1 + FATIGUE_IM;
    return { Mmax: Mmax * dfM * im, Mmin: Mmin * dfM * im, Vmax: Vmax * dfV * im, Vmin: Vmin * dfV * im, dfM, dfV };
  };
  const g = (m: number, positive: boolean, up: number, down: number) => ((positive ? m >= 0 : m <= 0) ? up : down);
  /** Strength I, III or V moments, the dead loads' factors chosen for the extreme (Tables 3.4.1-1, -2): the live load at 1.75, none, or 1.35. */
  const strengthC = (e: ReturnType<typeof effects>, c: ComboKey) => {
    const ll = LL_FACTOR[c];
    const pos = eta * (g(e.M.dc1, true, 1.25, 0.9) * e.M.dc1 + g(e.M.dc2, true, 1.25, 0.9) * e.M.dc2 + g(e.M.dw, true, 1.5, 0.65) * e.M.dw + ll * e.M.llPos);
    const neg = eta * (g(e.M.dc1, false, 1.25, 0.9) * e.M.dc1 + g(e.M.dc2, false, 1.25, 0.9) * e.M.dc2 + g(e.M.dw, false, 1.5, 0.65) * e.M.dw + ll * e.M.llNeg);
    const Vu = eta * (1.25 * Math.abs(e.V.dc1 + e.V.dc2) + 1.5 * Math.abs(e.V.dw) + ll * e.V.ll);
    return { pos, neg, Vu };
  };
  const strength = (e: ReturnType<typeof effects>) => strengthC(e, "I");
  /** Flange stresses (ksi, compression positive at the flange that M compresses) from staged moments (kip·ft) on their sections. */
  const stress = (k: number, parts: { M: number; stage: Stage }[]) => {
    let top = 0;
    let bot = 0;
    for (const p of parts) {
      const sp = prop(k, p.stage);
      top += (p.M * 12) / sp.Stop; // compression at the top for sagging moment
      bot -= (p.M * 12) / sp.Sbot;
    }
    return { top, bot }; // + compression, − tension
  };

  // Brace points: the supports and cross-frames at equal spacing no more than the given one in each span.
  const braces: number[] = [];
  if (i.braces.length) {
    // Cross-frames where given, and at every support.
    braces.push(...starts, total, ...i.braces.filter((b) => b > 1e-6 && b < total - 1e-6));
  } else
    spans.forEach((Ls, j) => {
      const nb = Math.max(1, Math.ceil(Ls / Math.max(1, i.crossFrames) - 1e-9));
      for (let q = 0; q <= nb; q++) braces.push(starts[j] + (Ls * q) / nb);
    });
  const bracesU = [...new Set(braces.map((b) => Math.round(b * 1e6) / 1e6))].sort((a, b) => a - b);
  const unbraced = (X: number) => {
    let a = 0;
    while (a + 1 < bracesU.length && bracesU[a + 1] <= X + 1e-9) a++;
    const b = Math.min(a + 1, bracesU.length - 1);
    if (Math.abs(bracesU[a] - X) < 1e-6 && a > 0) {
      // At a brace: the longer adjacent unbraced length governs; take the one on the side of larger compression later.
      return [bracesU[a - 1], bracesU[a]] as [number, number];
    }
    return [bracesU[a], bracesU[b]] as [number, number];
  };

  // --- Refined analysis (4.6.3.3): a grid of all the girders, the cross-frames and the deck. DC1 on the steel, DC2 and
  // DW on the long-term composite stage, the live load on the short-term stage by influence surfaces; the deck's loads
  // to the girders by the lever rule. The girder checked: the interior or exterior girders' envelope, as chosen ---
  const grid = i.analysis === "grid" ? buildGrid() : null;
  function buildGrid() {
    const halfDeck = ((i.nGirders - 1) * i.S) / 2 + i.overhang;
    const roadway: [number, number] = [-halfDeck + i.barrierWidth, halfDeck - i.barrierWidth];
    if (!(roadway[1] - roadway[0] >= 10)) throw new DesignError("The roadway is too narrow for a lane.");
    const gin: GridInput = {
      spans,
      nGirders: i.nGirders,
      S: i.S,
      overhang: i.overhang,
      barrierWidth: i.barrierWidth,
      radius: i.radius,
      skew: i.skew,
      braces: bracesU.filter((b) => b > 1e-6 && b < total - 1e-6 && !starts.some((x) => Math.abs(x - b) < 1e-6)),
      extraStations: segStart.slice(1),
      section: (X, stage) => {
        const k = segAt(Math.min(Math.max(X, 1e-6), total - 1e-6));
        const p = plates(i.segments[k]);
        const J = (p.top.b * p.top.t ** 3 + p.bottom.b * p.bottom.t ** 3 + p.D * p.tw ** 3) / 3;
        const Iyc = (p.top.t * p.top.b ** 3) / 12;
        const Iyt = (p.bottom.t * p.bottom.b ** 3) / 12;
        const h = p.D + (p.top.t + p.bottom.t) / 2;
        return { I: prop(k, stage).I, J, Cw: (h * h * Iyc * Iyt) / (Iyc + Iyt) };
      },
      cf: { type: i.crossFrame.type, Ad: 0.65 * angle(i.crossFrame.diagonal).A, As: 0.65 * angle(i.crossFrame.strut).A, hb: i.crossFrame.hb },
      deck: { ts, Ec },
      E: ES,
      G: 11200,
    };
    const geo = gridGeometry(gin);
    const ys = geo.ys;
    // The girders' line loads (klf), each girder's share by the lever rule.
    const entered = L.mode === "entered";
    const deckShare = entered ? [] : leverStrip(ys, (i.deckT / 12) * i.wcDeck, -halfDeck, halfDeck);
    const sipShare = ys.map((_, j) => (entered ? 0 : ((j > 0 ? 1 : 0) + (j < ys.length - 1 ? 1 : 0)) * 0.5 * (L.sip / 1000) * Math.max(0, i.S - avgTop / 12)));
    const edge = halfDeck - i.barrierWidth / 2;
    const barrierShare = entered ? [] : leverWeights(ys, -edge).map((v, j) => L.barrierWeight * (v + leverWeights(ys, edge)[j]));
    const fwsShare = entered ? [] : leverStrip(ys, L.fws / 1000, roadway[0], roadway[1]);
    const segOf = (X: number) => i.segments[segAt(Math.min(Math.max(X, 1e-6), total - 1e-6))];
    const dc1Line = (j: number, X: number) => selfWeight(segOf(X)) + (entered ? L.dc1 : deckShare[j] + (i.haunch / 12) * (plates(segOf(X)).top.b / 12) * i.wcDeck + sipShare[j] + L.misc / 1000 + L.otherDC1);
    const dc2Line = (j: number) => (entered ? L.dc2 : barrierShare[j] + L.otherDC2);
    const dwLine = (j: number) => (entered ? L.dw : fwsShare[j]);
    const symmetric = !(i.radius > 0) && Math.abs(i.skew) < 1e-9;
    const all = ys.map((_, j) => j);
    let cand = i.girder === "interior" ? all.filter((j) => j > 0 && j < ys.length - 1) : i.girder === "exterior" ? [0, ys.length - 1] : all;
    if (!cand.length) cand = all;
    if (symmetric) cand = cand.filter((j) => j <= (ys.length - 1) / 2);
    const steelM = gridModel(gin, geo, "steel");
    const longM = gridModel(gin, geo, "3n");
    const shortM = gridModel(gin, geo, "n");
    const d1 = deadEffects(geo, steelM, dc1Line);
    const d2 = deadEffects(geo, longM, (j) => dc2Line(j));
    const dW = deadEffects(geo, longM, (j) => dwLine(j));
    const lanes = Math.max(1, Math.floor((roadway[1] - roadway[0]) / 12));
    const live = (row: Sparse | null, negative: boolean) => {
      if (!row) return null;
      const lam = shortM.adjoint(row);
      const infl = Float64Array.from(geo.nodes.map((_, n) => -lam[n * 3]));
      return liveExtremes(gin, geo, infl, { IM: i.IM, roadway, lanes, negative });
    };
    const zero = { pos: 0, neg: 0, fatigue: { max: 0, min: 0, range: 0 } };
    const llM = cand.map((j) => geo.stations.map((_, k) => live(shortM.momentRow(j, k), true) ?? zero));
    const llV = cand.map((j) => geo.stations.map((_, k) => live(shortM.shearRow(j, k), false) ?? zero));
    // The cross-frames' members: Strength I (the dead loads' factors either way), the deck placement (1.4 DC1, 3.4.2.1),
    // Service II, and the fatigue truck's range.
    const frames = geo.frames.map((f, fi) =>
      shortM.frameModels[fi].names.map((name, m) => {
        const dc = d1.frames[fi][m] + d2.frames[fi][m];
        const dw = dW.frames[fi][m];
        const l = live(shortM.memberRow(fi, m), false) ?? zero;
        const fac = (v: number, up: number, down: number, tension: boolean) => (tension === v >= 0 ? up : down) * v;
        const tens = eta * (fac(dc, 1.25, 0.9, true) + fac(dw, 1.5, 0.65, true) + 1.75 * l.pos);
        const comp = eta * (fac(dc, 1.25, 0.9, false) + fac(dw, 1.5, 0.65, false) + 1.75 * l.neg);
        return { name, bay: f.bay, X: f.Xa, support: f.support, dc1: d1.frames[fi][m], dc, dw, ll: l, strength: { tension: Math.max(0, tens), compression: Math.max(0, -comp) }, construction: GAMMA_ERECT * eta * Math.abs(d1.frames[fi][m]), service: Math.max(Math.abs(dc + dw + 1.3 * l.pos), Math.abs(dc + dw + 1.3 * l.neg)), range: l.fatigue.range };
      }),
    );
    const st = geo.stations;
    const kAt = (X: number) => {
      let k = 0;
      while (k + 1 < st.length && st[k + 1] <= X + 1e-9) k++;
      return k;
    };
    const interp = (v: number[], X: number) => {
      const k = Math.min(kAt(X), st.length - 2);
      const t = Math.max(0, Math.min(1, (X - st[k]) / (st[k + 1] - st[k])));
      return v[k] + (v[k + 1] - v[k]) * t;
    };
    /** Shear just right of X (or left, at a station): the element's, constant along it. */
    const shearOf = (v: number[], X: number, left: boolean) => {
      let k = kAt(X);
      if (left && Math.abs(st[k] - X) < 1e-6 && k > 0) k--;
      return v[Math.min(k, v.length - 1)];
    };
    const pickAbs = (vals: number[]) => vals.reduce((b, v) => (Math.abs(v) > Math.abs(b) ? v : b), 0);
    const at = (X: number, left = false) => {
      const M = { dc1: pickAbs(cand.map((j) => interp(d1.M[j], X))), dc2: pickAbs(cand.map((j) => interp(d2.M[j], X))), dw: pickAbs(cand.map((j) => interp(dW.M[j], X))), llPos: Math.max(0, ...cand.map((_, c) => interp(llM[c].map((r) => r.pos), X) / 12)), llNeg: Math.min(0, ...cand.map((_, c) => interp(llM[c].map((r) => r.neg), X) / 12)) };
      const V = { dc1: pickAbs(cand.map((j) => shearOf(d1.V[j], X, left))), dc2: pickAbs(cand.map((j) => shearOf(d2.V[j], X, left))), dw: pickAbs(cand.map((j) => shearOf(dW.V[j], X, left))), ll: Math.max(0, ...cand.map((_, c) => Math.max(Math.abs(shearOf(llV[c].map((r) => r.pos), X, left)), Math.abs(shearOf(llV[c].map((r) => r.neg), X, left))))) };
      return { M, V };
    };
    const fatigue = (X: number) => ({
      Mmax: Math.max(0, ...cand.map((_, c) => interp(llM[c].map((r) => r.fatigue.max), X) / 12)),
      Mmin: Math.min(0, ...cand.map((_, c) => interp(llM[c].map((r) => r.fatigue.min), X) / 12)),
      // The range at one girder: its largest and smallest at the truck's governing place across.
      ...cand.reduce(
        (b, _, c) => {
          const mx = shearOf(llV[c].map((r) => r.fatigue.max), X, false);
          const mn = shearOf(llV[c].map((r) => r.fatigue.min), X, false);
          return mx - mn > b.Vmax - b.Vmin ? { Vmax: mx, Vmin: mn } : b;
        },
        { Vmax: 0, Vmin: 0 },
      ),
      dfM: 1,
      dfV: 1,
    });
    const group = (label: "strut" | "diagonal") => {
      const ms = frames.flat().filter((m) => (label === "strut" ? m.name.includes("strut") : m.name === "diagonal"));
      return { compression: Math.max(0, ...ms.map((m) => m.strength.compression)), tension: Math.max(0, ...ms.map((m) => m.strength.tension)), construction: Math.max(0, ...ms.map((m) => m.construction)), service: Math.max(0, ...ms.map((m) => m.service)), range: Math.max(0, ...ms.map((m) => m.range)) };
    };
    // Each girder's Strength I moment at mid-span of each span, for the record.
    const girderMoments = ys.map((_, j) => spans.map((Ls, s) => {
      const X = starts[s] + Ls / 2;
      return { dc1: interp(d1.M[j], X), dc2: interp(d2.M[j], X), dw: interp(dW.M[j], X) };
    }));
    return { geo, cand, at, fatigue, frames, strut: group("strut"), diag: group("diagonal"), girderMoments, lanes, roadway };
  }

  // --- Flange lateral bending (6.10.1.6): from horizontal curvature (Eq. C4.6.1.2.4b-1, Mlat = M ℓ² / (N R D), N = 10),
  // and from the wind on the exterior girder's bottom flange at Strength III and V (Eqs. C4.6.2.7.1-1, -2,
  // W = η γ PD d / 2, Mw = W Lb² / 10), each on the flange's lateral section modulus tf bf² / 6 ---
  const curved = i.radius > 0;
  const flOf = (Mlat: number, fl: Plate) => (Math.abs(Mlat) * 12 * 6) / (fl.t * fl.b ** 2); // ksi from kip·ft
  /** First-order lateral bending from curvature (ksi) under the major-axis moment M (kip·ft) over an unbraced length Lb (ft). */
  const flCurve = (M: number, Lb: number, D: number, fl: Plate) => (curved ? flOf((Math.abs(M) * Lb ** 2) / (10 * i.radius * (D / 12)), fl) : 0);
  const depthFt = Math.max(...i.segments.map((x) => plates(x).D + plates(x).top.t + plates(x).bottom.t)) / 12;
  const windOnFlange = i.wind.lateral && i.girder !== "interior";
  const windW: Record<ComboKey, number> = {
    I: 0,
    III: windOnFlange && i.wind.V > 0 ? (eta * 1.0 * windPressure("Strength III", i.wind).PZ * depthFt) / 2 : 0,
    V: windOnFlange ? (eta * 1.0 * windPressure("Strength V", i.wind).PZ * depthFt) / 2 : 0,
  };
  /** First-order lateral bending of the bottom flange from the wind (ksi) over an unbraced length Lb (ft). */
  const flWind = (c: ComboKey, Lb: number, fl: Plate) => (windW[c] > 0 ? flOf((windW[c] * Lb ** 2) / 10, fl) : 0);
  /** The construction wind on the fascia girder's flanges (klf): the lower half of the girder on the bottom flange, the upper half with the haunch and the wet deck on the top. */
  const windConstruction =
    i.girder !== "interior" && i.wind.construction > 0
      ? (() => {
          const pz = windPressure("Strength III", { ...i.wind, V: i.wind.construction }).PZ;
          const steelFt = depthFt;
          return { PZ: pz, Wbot: (eta * 1.0 * pz * steelFt) / 2, Wtop: eta * 1.0 * pz * (steelFt / 2 + (i.haunch + i.deckT) / 12) };
        })()
      : null;
  const combos: ComboKey[] = ["I", ...(windW.III > 0 ? (["III"] as const) : []), ...(windW.V > 0 ? (["V"] as const) : [])];
  /** A discretely braced compression flange's first-order fℓ amplified (Eqs. 6.10.1.6-2, -4); Infinity where fbu reaches Fcr. */
  const amplify = (fl1: number, fbu: number, Lb: number, f: { rt: number; Lp: number }, Cb: number, Rb: number) => {
    if (!(fl1 > 0) || !(fbu > 0)) return fl1;
    if (Lb <= 1.2 * f.Lp * Math.sqrt((Cb * Rb) / (fbu / i.Fyf))) return fl1;
    const Fcr = (Cb * Rb * Math.PI ** 2 * ES) / (Lb / f.rt) ** 2; // Eq. 6.10.8.2.3-8
    return fbu >= Fcr ? Infinity : Math.max(fl1, (0.85 / (1 - fbu / Fcr)) * fl1);
  };

  // --- Negative flexure by Appendix A6 at a point, where it applies and the unbraced length is prismatic ---
  const MuNegAt = (Xq: number) => strength(effects(Math.min(total, Math.max(0, Xq)))).neg;
  const cbNeg = (a: number, b: number, at: number) => {
    const Mends = [MuNegAt(a + 1e-3), MuNegAt(b - 1e-3)];
    const Mq = [MuNegAt(a + (b - a) / 4), MuNegAt(a + (b - a) / 2), MuNegAt(a + (3 * (b - a)) / 4)];
    return momentGradientCb(Math.min(...Mends, ...Mq, MuNegAt(at)), Mq[0], Mq[1], Mq[2]);
  };
  const negSection = (k: number, X: number, a: number, b: number) => {
    const seg = i.segments[k];
    const p = plates(seg);
    const steel = prop(k, "steel");
    const bars = prop(k, "bars");
    const deck = deckFor(seg);
    const e = effects(X);
    const MD1 = Math.abs(g(e.M.dc1, false, 1.25, 0.9) * e.M.dc1 * eta) * 12;
    const As = deck.bars.reduce((s, x) => s + x.A, 0);
    const yBars = deck.bars.reduce((s, x) => s + x.A * (p.D + p.top.t + p.bottom.t + deck.haunch + x.y), 0) / Math.max(1e-9, As);
    const ym = negativeYieldMoments({ MD1, steel, bars: { Stop: bars.Stop, Sbot: bars.Sbot, Sbars: bars.I / Math.max(1e-9, yBars - bars.yNA) }, Fyc: i.Fyf, Fyt: i.Fyf, fyBars: i.bars.fy });
    const pm = plasticMoment(seg, deck, false, i.Fyw, i.Fyf);
    const Dc = Math.max(0, bars.yNA - p.bottom.t);
    const Rh = hybridRh(p.D * p.tw, Math.min(p.top.b * p.top.t, p.bottom.b * p.bottom.t), Math.max(steel.yNA - p.bottom.t, steel.depth - p.top.t - steel.yNA), p.tw, i.Fyw, i.Fyf);
    const Cb = cbNeg(a, b, X);
    const a6 = appendixA6({ D: p.D, tw: p.tw, bfc: p.bottom.b, tfc: p.bottom.t, bft: p.top.b, tft: p.top.t, Dc, Dcp: pm.Dcp, Mp: pm.Mp, Myc: ym.Myc, Myt: ym.Myt, SxcElastic: bars.Sbot, Fyc: i.Fyf, Fyt: i.Fyf, Fyw: i.Fyw, Rh, Lb: (b - a) * 12, Cb, rolled: seg.kind === "rolled" });
    const prismatic = segAt(a + 1e-3) === segAt(b - 1e-3);
    // A6 is for straight bridges with supports skewed no more than 20° (6.10.6.2.3).
    if (curved) a6.reasons.push("the girder is curved (6.10.6.2.3)");
    if (Math.abs(i.skew) > 20) a6.reasons.push("the supports are skewed more than 20° (6.10.6.2.3)");
    if (a6.reasons.length) a6.applicable = false;
    return { p, ym, pm, Dc, Rh, Cb, a6, prismatic, MD1 };
  };

  // --- Moment redistribution from the interior piers (Appendix B6, the simplified method) ---
  // The web's panels (6.10.9.1): between neighbouring supports, cross-frame connection plates (full depth, on both
  // flanges) and transverse stiffeners; a panel no longer than 3D is stiffened, one next to an abutment an end panel.
  const panelEdges = (() => {
    const pts: number[] = [...starts, total];
    if (i.crossFrame.fullDepthPlates) pts.push(...bracesU);
    for (const z of i.stiffeners) {
      if (!(z.spacing > 0)) continue;
      for (let x = z.from; x <= z.to + 1e-6; x += z.spacing / 12) pts.push(x);
    }
    return [...new Set(pts.map((x) => Math.round(x * 1e4) / 1e4))].filter((x) => x >= -1e-9 && x <= total + 1e-9).sort((a, b) => a - b);
  })();
  /** The panel at X (the one to the left at a span's end): its ends, length do (in), whether it's stiffened and an end panel. */
  const panelAt = (X: number, left = false) => {
    let a = 0;
    let b = total;
    for (const p of panelEdges) {
      if (left ? p < X - 1e-6 : p <= X + 1e-6) a = p;
      if ((left ? p >= X - 1e-6 : p > X + 1e-6) && p < b) {
        b = p;
        break;
      }
    }
    const D = plates(i.segments[segAt(Math.min(Math.max((a + b) / 2, 1e-6), total - 1e-6))]).D;
    const d0 = (b - a) * 12;
    return { a, b, d0, stiffened: d0 <= 3 * D + 1e-9, end: a < 1e-6 || b > total - 1e-6 };
  };
  const vcrAt = (X: number) => {
    const p = plates(i.segments[segAt(Math.min(Math.max(X, 1e-6), total - 1e-6))]);
    const pn = panelAt(X);
    return shearC(p.D, p.tw, i.Fyw, pn.stiffened ? 5 + 5 / (pn.d0 / p.D) ** 2 : 5) * 0.58 * i.Fyw * p.D * p.tw;
  };
  const piersB6 = spans.slice(1).map((_, q) => {
    const pier = q + 1;
    const X = starts[pier];
    const ia = bracesU.findIndex((b) => Math.abs(b - X) < 1e-6);
    const a = bracesU[Math.max(0, ia - 1)];
    const b = bracesU[Math.min(bracesU.length - 1, ia + 1)];
    const k = segAt(X);
    const ns = negSection(k, X, X - a >= b - X ? a : X, X - a >= b - X ? X : b);
    const { p, pm, Dc, a6 } = ns;
    const e = effectsRaw(X, { s: pier - 1, x: spans[pier - 1] });
    const Me = strength(e).neg; // kip·ft
    const MeSvc = e.M.dc1 + e.M.dc2 + e.M.dw + 1.3 * e.M.llNeg;
    const sq = Math.sqrt(ES / i.Fyf);
    const reqs: { name: string; demand: number; capacity: number; unit: string; ref: string }[] = [];
    const req = (name: string, demand: number, capacity: number, unit: string, ref: string) => reqs.push({ name, demand, capacity, unit, ref });
    req("Skew of the supports", Math.abs(i.skew), 10, "°", "AASHTO B6.2");
    req("A straight girder (radius 0)", curved ? 1 : 0, 0, "", "AASHTO B6.2");
    req("Yield strengths", Math.max(i.Fyf, i.Fyw), 70, "ksi", "AASHTO B6.2");
    req("Web D/tw", p.D / p.tw, 150, "", "AASHTO Eq. B6.2.1-1");
    req("Web 2Dc/tw ≤ 6.8√(E/Fyc)", (2 * Dc) / p.tw, 6.8 * sq, "", "AASHTO Eq. B6.2.1-2");
    req("Dcp ≤ 0.75D", pm.Dcp, 0.75 * p.D, "in", "AASHTO Eq. B6.2.1-3");
    req("Compression flange bfc/2tfc ≤ 0.38√(E/Fyc)", p.bottom.b / (2 * p.bottom.t), 0.38 * sq, "", "AASHTO Eq. B6.2.2-1");
    req("D/bfc ≤ 4.25", p.D / p.bottom.b, 4.25, "", "AASHTO Eq. B6.2.2-2");
    for (const [from, to, far] of [[a, X, a], [X, b, b]] as const) {
      req(`Prismatic from ${from.toFixed(1)} to ${to.toFixed(1)} ft (section changes)`, segAt(from + 1e-3) === segAt(to - 1e-3) ? 0 : 1, 0, "", "AASHTO B6.2.3");
      const ratio = Math.max(-1, Math.min(1, MuNegAt(far) / Me)); // + single curvature
      const rt = ns.a6.rt;
      req(`Unbraced length ${from.toFixed(1)}–${to.toFixed(1)} ft ≤ (0.1 − 0.06 M1/M2) rt E/Fyc`, (to - from) * 12, (0.1 - 0.06 * ratio) * rt * (ES / i.Fyf), "in", "AASHTO Eq. B6.2.4-1");
      let vu = 0;
      let vcr = Infinity;
      for (let q2 = 0; q2 <= 10; q2++) {
        const Xq = from + ((to - from) * q2) / 10;
        vu = Math.max(vu, strength(effects(Xq)).Vu);
        vcr = Math.min(vcr, vcrAt(Xq));
      }
      req(`Shear from ${from.toFixed(1)} to ${to.toFixed(1)} ft, Vu ≤ φv Vcr`, vu, PHI_V * vcr, "kip", "AASHTO Eq. B6.2.5-1");
    }
    req("Bearing stiffeners at the pier", i.bearing.use ? 0 : 1, 0, "", "AASHTO B6.2.6");
    const qualifies = reqs.every((r) => r.demand <= r.capacity + 1e-9);
    // Mn: Appendix A6 where it applies, else Fnc Sxc and Fnt Sxt by 6.10.8 (B6.5).
    const Sxc = ns.ym.Myc / i.Fyf;
    const Sxt = ns.ym.Myt / i.Fyf;
    const f = flangeFnc({ bfc: p.bottom.b, tfc: p.bottom.t, Dc, tw: p.tw, Fyc: i.Fyf, Fyw: i.Fyw, Lb: (Math.max(X - a, b - X)) * 12, Cb: ns.Cb, Rb: webRb(Dc, p.tw, p.bottom.b, p.bottom.t, i.Fyf), Rh: ns.Rh });
    const useA6 = i.appendixA6 && a6.applicable;
    const Mn = useA6 ? Math.min(a6.Mnc, a6.Mnt) : Math.min(f.Fnc * Sxc, ns.Rh * i.Fyf * Sxt); // kip·in
    const stiffClose = i.stiffeners.some((z) => z.spacing > 0 && z.spacing <= p.D / 2 && z.from * 12 <= X * 12 - p.D / 2 && z.to * 12 >= X * 12 + p.D / 2);
    const enhanced = stiffClose || (2 * pm.Dcp) / p.tw <= 2.3 * sq;
    const Mpe = effectivePlasticMoment({ Mn, D: p.D, bfc: p.bottom.b, tfc: p.bottom.t, Fyc: i.Fyf, enhanced });
    const rdSvc = redistributionMoment(MeSvc * 12, Mpe.service, 1);
    // Each strength combination: Mn less a third of the pier flange's lateral bending (fℓ Sxc / 3, B6.6.2), from curvature
    // and the wind, first order.
    const Lside = Math.max(X - a, b - X);
    const SxcB6 = ns.ym.Myc / i.Fyf;
    const byCombo = Object.fromEntries(
      combos.map((c) => {
        const MeC = strengthC(e, c).neg;
        const fl = flCurve(MeC, Lside, p.D, p.bottom) + flWind(c, Lside, p.bottom);
        const MnC = Math.max(0, Mn - (fl * SxcB6) / 3);
        const MpeC = effectivePlasticMoment({ Mn: MnC, D: p.D, bfc: p.bottom.b, tfc: p.bottom.t, Fyc: i.Fyf, enhanced }).strength;
        const r = redistributionMoment(MeC * 12, MpeC, PHI_F);
        return [c, { Me: MeC, fl, Mn: MnC, Mpe: MpeC, Mrd: r.Mrd / 12, MrdRaw: r.raw / 12, theta: 0, M: Math.abs(MeC) - r.Mrd / 12 }];
      }),
    ) as Record<ComboKey, { Me: number; fl: number; Mn: number; Mpe: number; Mrd: number; MrdRaw: number; theta: number; M: number }>;
    const rd = { Mrd: byCombo.I.Mrd * 12, raw: byCombo.I.MrdRaw * 12 };
    const thetaLimit = thetaRL({ D: p.D, bfc: p.bottom.b, tfc: p.bottom.t, Fyc: i.Fyf, enhanced });
    // Service II regions not checked: from the pier to the nearest flange transition or permanent-load contraflexure, each side.
    const towards = (dir: -1 | 1) => {
      let Xq = X;
      for (let q2 = 0; q2 < 400; q2++) {
        const nx = Xq + dir * 0.25;
        if (nx <= 0 || nx >= total || segAt(nx) !== k || longLine.beam.uniformAll(located(nx).s, located(nx).x).M >= 0) break;
        Xq = nx;
      }
      return Xq;
    };
    return { pier, X, a, b, bfc: p.bottom.b, tfc: p.bottom.t, D: p.D, Me, MeSvc, reqs, qualifies, useA6, a6, Mn, enhanced, Mpe, Mrd: rd.Mrd / 12, MrdRaw: rd.raw / 12, MrdSvc: rdSvc.Mrd / 12, byCombo, thetaRL: thetaLimit, thetaSvc: 0, ktheta: 0, serviceRegion: [towards(-1), towards(1)] as [number, number], Myc: ns.ym.Myc / 12, Myt: ns.ym.Myt / 12, Mp: pm.Mp / 12, Dc, Dcp: pm.Dcp };
  });
  // The refined method (B6.6): every pier's continuity with the plastic rotations at the piers that may yield (those
  // meeting B6.2), on the short-term composite stiffness with the deck effective throughout (B6.6.1); the others elastic.
  const refined = i.redistribution && i.redistributionMethod === "refined" && piersB6.length > 0;
  if (refined) {
    const K = rotationalStiffness(spans, (X) => ES * prop(segAt(Math.min(Math.max(X, 1e-6), total - 1e-6)), "n").I);
    const yielding = piersB6.map((q) => q.qualifies);
    for (const c of combos) {
      const sol = refinedRedistribution({ Me: piersB6.map((q) => Math.abs(q.byCombo[c].Me) * 12), Mn: piersB6.map((q) => q.byCombo[c].Mn), phi: PHI_F, K, yielding });
      sol.forEach((r, k) => Object.assign(piersB6[k].byCombo[c], { Mrd: r.Mrd / 12, MrdRaw: r.Mrd / 12, theta: r.theta, M: r.M / 12 }));
    }
    const svc = refinedRedistribution({ Me: piersB6.map((q) => Math.abs(q.MeSvc) * 12), Mn: piersB6.map((q) => q.Mn), phi: 1, K, yielding });
    svc.forEach((r, k) => Object.assign(piersB6[k], { MrdSvc: r.Mrd / 12, thetaSvc: r.theta }));
    piersB6.forEach((q, k) => Object.assign(q, { Mrd: q.byCombo.I.Mrd, MrdRaw: q.byCombo.I.MrdRaw, ktheta: K[k][k] }));
  }
  const b6Active = i.redistribution && piersB6.length > 0 && (refined ? piersB6.some((q) => q.qualifies) : piersB6.every((q) => q.qualifies));
  /** The redistribution moment at X (kip·ft, sagging +): straight lines between the piers' values, zero at the abutments (B6.3.3.2, B6.4.2.2). */
  const mrdAt = (X: number, c: ComboKey | "svc" = "I") => {
    if (!b6Active) return 0;
    const v = [0, ...piersB6.map((q) => (c === "svc" ? q.MrdSvc : (q.byCombo[c]?.Mrd ?? 0))), 0];
    const { s, x } = located(X);
    return v[s] + ((v[s + 1] - v[s]) * x) / spans[s];
  };
  // Flexure isn't checked in the unbraced lengths next to a pier that redistributes (B6.4.1.1), nor the service flange
  // limits from it to the nearest transition or contraflexure (B6.3.2.1).
  const nearPier = (X: number) => b6Active && piersB6.some((q) => q.qualifies && X >= q.a - 1e-6 && X <= q.b + 1e-6);
  const inServiceRegion = (X: number) => b6Active && piersB6.some((q) => q.qualifies && X >= q.serviceRegion[0] - 1e-6 && X <= q.serviceRegion[1] + 1e-6);

  // --- The deck's pour sequence (6.10.3.4): each pour's wet concrete on the girder as it then is, steel where
  // the deck is still wet, short-term composite (n) where earlier pours have hardened (6.10.1.1.1d) ---
  const pours = [...i.pours].filter((q) => q.to > q.from).sort((a, b) => a.order - b.order);
  const wetDeck = L.mode === "entered" ? dc1Deck : ((i.deckT / 12) * deckWidth * i.wcDeck) / i.nGirders + (i.haunch / 12) * (avgTop / 12) * i.wcDeck; // klf
  const pourStages = pours.map((q, n) => {
    const hardened = (X: number) => pours.slice(0, n).some((h) => X >= h.from - 1e-9 && X <= h.to + 1e-9);
    const line = nonprismaticBeam(spans, (X: number) => (ES * prop(segAt(Math.min(Math.max(X, 1e-6), total - 1e-6)), hardened(X) ? "n" : "steel").I) / 144, 80, camberAt);
    const w = (X: number) => (X >= q.from - 1e-9 && X <= q.to + 1e-9 ? wetDeck : 0);
    return { pour: q, n, hardened, line, w };
  });

  const stations: SteelStation[] = [];
  const worst: Record<string, { ratio: number; at: SteelStation | null; demand: number; capacity: number; note: string }> = {};
  const record = (id: string, st: SteelStation, demand: number, capacity: number, note = "") => {
    const ratio = capacity > 0 ? demand / capacity : demand > 0 ? Infinity : 0;
    st.ratios[id] = Math.max(st.ratios[id] ?? -Infinity, ratio);
    if (!worst[id] || ratio > worst[id].ratio) worst[id] = { ratio, at: st, demand, capacity, note };
  };

  for (const X of [...pts].sort((a, b) => a - b)) {
    const e = effects(X);
    const k = e.k;
    const seg = i.segments[k];
    const p = plates(seg);
    const sf = strength(e);
    const st: SteelStation = { X, span: e.s, x: e.x, seg: k, M: e.M, V: e.V, dfM: e.dfM, dfV: e.dfV, negativeRegion: e.negativeRegion, Mpos: sf.pos, Mneg: sf.neg, Vu: sf.Vu, ratios: {} };
    stations.push(st);
    const deck = deckFor(seg);
    const steel = prop(k, "steel");
    const Rh = hybridRh(p.D * p.tw, Math.min(p.top.b * p.top.t, p.bottom.b * p.bottom.t), Math.max(steel.yNA - p.bottom.t, steel.depth - p.top.t - steel.yNA), p.tw, i.Fyw, i.Fyf);

    // --- Flexure at Strength I, and at Strength III and V with the wind on the exterior girder's bottom flange
    // (6.10.7, 6.10.8), with any redistribution moment (B6.4.1.2) and the flange lateral bending (6.10.1.6) ---
    const [ua, ub] = unbraced(X);
    const LbFt = ub - ua;
    // Positive flexure's resistance (the same for every combination: the dead loads' factors are the same).
    const pm = plasticMoment(seg, deck, true, i.Fyw, i.Fyf);
    // Curved girders' composite sections in positive flexure are noncompact (6.10.6.2.2).
    const compact = !curved && i.Fyf <= 70 && p.D / p.tw <= 150 && (2 * pm.Dcp) / p.tw <= 3.76 * Math.sqrt(ES / i.Fyf);
    // Yield moment (D6.2.2): the factored dead loads on their sections, the live load the rest, the first flange to yield.
    const M1 = g(e.M.dc1, true, 1.25, 0.9) * e.M.dc1 * 12;
    const M2 = (g(e.M.dc2, true, 1.25, 0.9) * e.M.dc2 + g(e.M.dw, true, 1.5, 0.65) * e.M.dw) * 12;
    const nc = prop(k, "steel");
    const lt = prop(k, "3n");
    const sh = prop(k, "n");
    const MADbot = (i.Fyf - M1 / nc.Sbot - M2 / lt.Sbot) * sh.Sbot;
    const MAD = Math.min(MADbot, (i.Fyf - M1 / nc.Stop - M2 / lt.Stop) * sh.Stop);
    const My = (M1 + M2 + MAD) / 12;
    const Sxt = (M1 + M2 + MADbot) / i.Fyf; // in³, Myt / Fyt of the bottom flange
    const Mp = pm.Mp / 12;
    let MnPos = pm.Dp <= 0.1 * pm.Dt ? Mp : Mp * (1.07 - (0.7 * pm.Dp) / pm.Dt);
    const capped = spans.length > 1 && !b6Active && MnPos > 1.3 * Rh * My;
    if (capped) MnPos = 1.3 * Rh * My; // 6.10.7.1.2-3 (no moment redistribution)
    let mrd = 0;
    for (const c of combos) {
      const pre = c === "I" ? "flex" : c === "III" ? "s3" : "s5";
      const sc = c === "I" ? sf : strengthC(e, c);
      const ll = LL_FACTOR[c];
      mrd = mrdAt(X, c);
      const tag = (fl: number) => (fl > 0 ? `; fℓ ${fl.toFixed(2)} ksi (${[curved ? "curvature" : "", c !== "I" && windW[c] > 0 ? "wind" : ""].filter(Boolean).join(" and ")})` : "");
      if (sc.pos + mrd > 0 && (c === "III" || e.M.llPos > 0)) {
        const MuPos = sc.pos + mrd;
        // The bottom flange in tension: its lateral bending, not amplified (6.10.1.6).
        const flB = flCurve(MuPos, LbFt, p.D, p.bottom) + flWind(c, LbFt, p.bottom);
        if (flB > 0) record(`${pre}-fl`, st, flB, 0.6 * i.Fyf, "bottom flange, Eq. 6.10.1.6-1");
        if (compact) {
          record(`${pre}-pos`, st, MuPos + (flB * Sxt) / 36, PHI_F * MnPos, `compact; Mp ${Mp.toFixed(0)} kip·ft, Dp/Dt ${(pm.Dp / pm.Dt).toFixed(3)}${capped ? ", limited to 1.3RhMy" : ""}${mrd > 0 ? `; Mrd ${mrd.toFixed(0)} kip·ft added (B6.4.1.2)` : ""}${flB > 0 ? `; Mu + fℓ Sxt / 3, Sxt ${Sxt.toFixed(1)} in³` : ""}${tag(flB)}`);
        } else {
          const fs = stress(k, [
            { M: g(e.M.dc1, true, 1.25, 0.9) * e.M.dc1 * eta, stage: "steel" },
            { M: (g(e.M.dc2, true, 1.25, 0.9) * e.M.dc2 + g(e.M.dw, true, 1.5, 0.65) * e.M.dw) * eta + mrd, stage: "3n" },
            { M: ll * e.M.llPos * eta, stage: "n" },
          ]);
          record(`${pre}-pos-c`, st, fs.top, PHI_F * Rh * i.Fyf, "noncompact: compression flange, Rb = 1");
          record(`${pre}-pos-t`, st, -fs.bot + flB / 3, PHI_F * Rh * i.Fyf, `noncompact: tension flange${tag(flB)}`);
        }
        if (c === "I") record("ductility", st, pm.Dp, 0.42 * pm.Dt, "Dp ≤ 0.42 Dt");
      }

      // Negative flexure (6.10.8): the bottom flange discretely braced, the top continuously by the deck. Within the
      // unbraced lengths next to a pier whose moment is redistributed, flexure isn't checked (B6.4.1.1).
      if (sc.neg + mrd < 0 && (c === "III" || e.M.llNeg < 0) && !nearPier(X)) {
        const Lb = LbFt * 12;
        const parts = [
          { M: g(e.M.dc1, false, 1.25, 0.9) * e.M.dc1 * eta, stage: "steel" as Stage },
          { M: (g(e.M.dc2, false, 1.25, 0.9) * e.M.dc2 + g(e.M.dw, false, 1.5, 0.65) * e.M.dw + ll * e.M.llNeg) * eta + mrd, stage: "bars" as Stage },
        ];
        const fs = stress(k, parts);
        const fbu = fs.bot; // compression in the bottom flange
        const bars = prop(k, "bars");
        const Dc = Math.max(0, bars.yNA - p.bottom.t);
        const Rb = webRb(Dc, p.tw, p.bottom.b, p.bottom.t, i.Fyf);
        const Cb = cbNeg(ua, ub, X);
        const f = flangeFnc({ bfc: p.bottom.b, tfc: p.bottom.t, Dc, tw: p.tw, Fyc: i.Fyf, Fyw: i.Fyw, Lb, Cb, Rb, Rh });
        const Mu = Math.abs(sc.neg + mrd);
        const fl1 = flCurve(Mu, LbFt, p.D, p.bottom) + flWind(c, LbFt, p.bottom);
        const fl = amplify(fl1, fbu, Lb, f, Cb, Rb);
        if (fl1 > 0) record(`${pre}-fl`, st, fl, 0.6 * i.Fyf, `bottom flange${fl > fl1 ? `, amplified from ${fl1.toFixed(2)} ksi (Eq. 6.10.1.6-4)` : ""}, Eq. 6.10.1.6-1`);
        const ns = i.appendixA6 ? negSection(k, X, ua, ub) : null;
        if (ns && ns.a6.applicable && ns.prismatic) {
          // Appendix A6: Mu + fℓ Sxc / 3 ≤ φf Mnc (A6.1.1) and, the top flange braced by the deck, Mu ≤ φf Rpt Myt (A6.1.4).
          record(`${pre}-neg-a6c`, st, Mu + (fl * ns.a6.Sxc) / 36, (PHI_F * ns.a6.Mnc) / 12, `Mnc by ${ns.a6.governs}; ${ns.a6.compact ? "compact" : "noncompact"} web, Rpc ${ns.a6.Rpc.toFixed(3)}; Lb ${LbFt.toFixed(1)} ft, Cb ${ns.Cb.toFixed(2)}${mrd > 0 ? `; Mrd ${mrd.toFixed(0)} kip·ft` : ""}${tag(fl)}`);
          record(`${pre}-neg-a6t`, st, Mu, (PHI_F * ns.a6.Mnt) / 12, `Rpt ${ns.a6.Rpt.toFixed(3)}, Myt ${(ns.ym.Myt / 12).toFixed(0)} kip·ft`);
        } else {
          const why = i.appendixA6 && ns ? (!ns.a6.applicable ? `; Appendix A6 doesn't apply: ${ns.a6.reasons.join(", ")}` : "; Appendix A6 not used: the unbraced length isn't prismatic") : "";
          record(`${pre}-neg-c`, st, fbu + fl / 3, PHI_F * f.Fnc, `Fnc by ${f.governs}; Lb ${LbFt.toFixed(1)} ft, Cb ${Cb.toFixed(2)}, Rb ${Rb.toFixed(3)}${mrd > 0 ? `; Mrd ${mrd.toFixed(0)} kip·ft` : ""}${tag(fl)}${why}`);
          record(`${pre}-neg-t`, st, -fs.top, PHI_F * Rh * i.Fyf, "tension flange (continuously braced by the deck), Eq. 6.10.8.1.3-1");
        }
      }
    }

    // --- Strength I, shear (6.10.9) ---
    {
      const Vp = 0.58 * i.Fyw * p.D * p.tw;
      const pn = panelAt(X, e.x >= spans[e.s] - 1e-6 && e.s < spans.length - 1);
      const zone = pn.stiffened ? i.stiffeners.find((z) => X >= z.from - 1e-9 && X <= z.to + 1e-9) : undefined;
      let Vn: number;
      let note: string;
      let Vcr: number;
      let interiorPanel = false;
      if (!pn.stiffened) {
        const C = shearC(p.D, p.tw, i.Fyw, 5);
        Vn = C * Vp;
        Vcr = Vn;
        note = `unstiffened${pn.d0 < 1e5 ? ` (panel ${(pn.d0 / 12).toFixed(1)} ft > 3D)` : ""}, C ${C.toFixed(3)}`;
      } else {
        const d0 = pn.d0;
        const kk = 5 + 5 / (d0 / p.D) ** 2;
        const C = shearC(p.D, p.tw, i.Fyw, kk);
        Vcr = C * Vp;
        const endPanel = pn.end;
        interiorPanel = !endPanel;
        if (endPanel) {
          Vn = C * Vp;
          note = `end panel, do ${d0} in, C ${C.toFixed(3)}`;
        } else {
          const ratio = (2 * p.D * p.tw) / (p.top.b * p.top.t + p.bottom.b * p.bottom.t);
          Vn = ratio <= 2.5 ? Vp * (C + (0.87 * (1 - C)) / Math.sqrt(1 + (d0 / p.D) ** 2)) : Vp * (C + (0.87 * (1 - C)) / (Math.sqrt(1 + (d0 / p.D) ** 2) + d0 / p.D));
          note = `stiffened interior panel, do ${d0} in, ${ratio <= 2.5 ? "Eq. 6.10.9.3.2-2" : "Eq. 6.10.9.3.2-8"}`;
        }
      }
      record("shear", st, sf.Vu, PHI_V * Vn, note);
      st.shear = { Vcr, Vn, zone: zone ? i.stiffeners.indexOf(zone) : -1, interiorPanel };
    }

    // --- Fatigue (6.10.5, 6.6.1.2): the welded attachments at the flanges' inner faces; the web (6.10.5.3) ---
    if (i.fatigue.check || i.studs.check) {
      const fat = fatigueAt(X);
      const cycles = cyclesPerTruck(spans, e.s, e.x);
      st.fatigue = { Mmax: fat.Mmax, Mmin: fat.Mmin, Vmax: fat.Vmax, Vmin: fat.Vmin, cycles };
      if (i.fatigue.check) {
        // Deck effective in negative flexure too where studs run throughout with the 6.10.1.7 bars (6.6.1.2.1).
        const negStage: Stage = i.studsThroughout && i.bars.pct >= 1 ? "n" : "bars";
        const permNeg: Stage = i.studsThroughout && i.bars.pct >= 1 ? "3n" : "bars";
        /** Tension (+) at a flange's inner face from a moment on a section. */
        const faceStress = (M: number, stage: Stage, face: "top" | "bot") => {
          const sp = prop(k, stage);
          const c = face === "bot" ? sp.yNA - p.bottom.t : -(sp.depth - p.top.t - sp.yNA);
          return (M * 12 * c) / sp.I;
        };
        const live = (M: number, face: "top" | "bot") => faceStress(M, M >= 0 ? "n" : negStage, face);
        for (const face of ["bot", "top"] as const) {
          const fMax = live(fat.Mmax, face);
          const fMin = live(fat.Mmin, face);
          const range = Math.abs(fMax - fMin);
          const perm = faceStress(e.M.dc1, "steel", face) + faceStress(e.M.dc2 + e.M.dw, e.M.dc2 + e.M.dw >= 0 ? "3n" : permNeg, face);
          const llTension = FATIGUE_I * Math.max(0, fMax, fMin);
          if (perm < 0 && -perm >= llTension) continue; // net compression: no fatigue (6.6.1.2.1)
          const attach = e.negativeRegion ? i.fatigue.flangeNeg : i.fatigue.flange;
          const cats: FatigueCategory[] = face === "top" && i.studs.check ? [attach, "C"] : [attach];
          let worstHere: { demand: number; capacity: number; note: string; cat: FatigueCategory } | null = null;
          for (const cat of cats) {
            const r = fatigueResistance(FATIGUE_CATEGORIES[cat], i.fatigue.adttSL, cycles, i.fatigue.life);
            const cand = { demand: r.gamma * range, capacity: r.Fn, cat, note: `category ${cat}${cat === "C" && cats.length > 1 ? " (studs)" : ""}, ${r.combo}, n ${cycles}` };
            if (!worstHere || cand.demand / cand.capacity > worstHere.demand / worstHere.capacity) worstHere = cand;
          }
          st.fatigue![face] = { fMax, fMin, cat: worstHere!.cat };
          record(face === "bot" ? "fat-bot" : "fat-top", st, worstHere!.demand, worstHere!.capacity, worstHere!.note);
        }
        // The web's special fatigue requirement (6.10.5.3): interior panels of stiffened webs, Vu ≤ Vcr.
        if (st.shear?.interiorPanel) {
          const Vperm = e.V.dc1 + e.V.dc2 + e.V.dw;
          const Vu = Math.abs(Vperm) + FATIGUE_I * (Vperm >= 0 ? fat.Vmax : -fat.Vmin);
          record("fat-web", st, Vu, st.shear.Vcr, "Eq. 6.10.5.3-1");
        }
      }
      // Stud pitch for fatigue (6.10.10.1.2): the shear range on the short-term composite section.
      if (i.studs.check) {
        const sr = studResistance(i.studs, i.fatigue.adttSL, cycles, i.fatigue.life);
        const sp = prop(k, "n");
        const deck = deckFor(seg);
        const Ad = (deck.beff * ts) / n;
        const Q = Ad * (sp.depth + deck.haunch + ts / 2 - sp.yNA);
        const Vf = sr.gamma * (fat.Vmax - fat.Vmin);
        const pf = studPitchForFatigue(i.studs.perRow, sr.Zr, Vf, Q, sp.I);
        st.fatigue.stud = { Q, I: sp.I };
        record("stud-fat", st, pitchAt(X), pf.pitch, `${sr.combo}, Zr ${sr.Zr.toFixed(2)} kip, Vsr ${pf.Vsr.toFixed(3)} kip/in, n ${cycles}`);
      }
    }

    // --- Constructibility (6.10.3): the deck placed on the steel girder (3.4.2.1): Strength I, 1.25 DC + 1.5 the
    // construction loads, or 1.4 (DC + the construction loads) on the erected steelwork ---
    {
      const cll = (i.constructionLL / 1000) * i.S;
      const MDC1 = e.M.dc1;
      const MC = cll > 0 ? steelLine.beam.uniformAll(e.s, e.x, cll).M : 0;
      const VC = cll > 0 ? steelLine.beam.uniformAll(e.s, e.x, cll).V : 0;
      const Mc = Math.abs(1.25 * MDC1 + 1.5 * MC) > Math.abs(GAMMA_ERECT * (MDC1 + MC)) ? 1.25 * MDC1 + 1.5 * MC : GAMMA_ERECT * (MDC1 + MC);
      const Vc = Math.max(Math.abs(1.25 * e.V.dc1 + 1.5 * VC), Math.abs(GAMMA_ERECT * (e.V.dc1 + VC)));
      const fs = stress(k, [{ M: Mc * eta, stage: "steel" }]);
      const topComp = Mc >= 0;
      const fbu = topComp ? fs.top : fs.bot;
      const fbt = topComp ? -fs.bot : -fs.top;
      const flc = i.flConstruction;
      const cf = topComp ? p.top : p.bottom;
      const Dc = topComp ? Math.max(0, steel.depth - p.top.t - steel.yNA) : Math.max(0, steel.yNA - p.bottom.t);
      const [a, b] = unbraced(X);
      const Lb = (b - a) * 12;
      const McAt = (Xq: number) => {
        const q = effects(Math.min(total, Math.max(0, Xq)));
        return GAMMA_ERECT * q.M.dc1;
      };
      const Mq = [McAt(a + (b - a) / 4), McAt(a + (b - a) / 2), McAt(a + (3 * (b - a)) / 4)];
      const sameSign = (m: number) => (topComp ? Math.max(0, m) : Math.min(0, m));
      const Mmax = [McAt(a + 1e-3), McAt(b - 1e-3), ...Mq, Mc].reduce((m, v) => (Math.abs(sameSign(v)) > Math.abs(m) ? sameSign(v) : m), 0);
      const Cb = momentGradientCb(Mmax, sameSign(Mq[0]), sameSign(Mq[1]), sameSign(Mq[2]));
      const f = flangeFnc({ bfc: cf.b, tfc: cf.t, Dc, tw: p.tw, Fyc: i.Fyf, Fyw: i.Fyw, Lb, Cb, Rb: 1, Rh });
      // The brackets' and curvature's lateral bending on the bare flanges, the compression flange's first-order
      // value amplified (Eq. 6.10.1.6-4).
      const flc1 = flCurve(Mc, b - a, p.D, cf);
      const flCc = amplify(flc + flc1, fbu, Lb, f, Cb, 1);
      const flCt = flc + flCurve(Mc, b - a, p.D, topComp ? p.bottom : p.top);
      const curveNote = (x: number) => (curved && x > flc ? `; fℓ ${x.toFixed(2)} ksi with curvature` : "");
      if (fbu > 0) {
        if (!pours.length) record("con-yield", st, fbu + flCc, PHI_F * Rh * i.Fyf, `${topComp ? "top" : "bottom"} flange, Eq. 6.10.3.2.1-1${curveNote(flCc)}`);
        if (!pours.length) record("con-fnc", st, fbu + flCc / 3, PHI_F * f.Fnc, `${topComp ? "top" : "bottom"} flange, Fnc by ${f.governs}; Lb ${(Lb / 12).toFixed(1)} ft, Cb ${Cb.toFixed(2)}${curveNote(flCc)}`);
        if (curved && flCc > 0) record("con-fl", st, flCc, 0.6 * i.Fyf, `${topComp ? "top" : "bottom"} flange, Eq. 6.10.1.6-1`);
        record("con-web", st, fbu, PHI_F * webFcrw(p.D, p.tw, Dc, Rh, i.Fyf, i.Fyw), "web bend-buckling, Eq. 6.10.3.2.1-3");
      }
      if (fbt > 0 && !pours.length) record("con-tension", st, fbt + flCt, PHI_F * Rh * i.Fyf, `${topComp ? "bottom" : "top"} flange, Eq. 6.10.3.2.2-1${curveNote(flCt)}`);
      const Vcr = vcrAt(X);
      record("con-shear", st, Vc * eta, PHI_V * Vcr, "Eq. 6.10.3.3-1");
    }

    // --- Wind during construction (Strength III on the bare steel, 3.4.2.1): the deck still wet, so it can't carry
    // the wind as a diaphragm; the fascia girder's lower half loads its bottom flange, its upper half with the wet
    // deck and haunch its top flange, each flange bent between the cross-frames and, with no wind bracing, with all
    // the girders' flanges over the span (Eq. C4.6.2.7.1-3), on 1.25 DC1 (Table 3.4.1-1) ---
    if (windConstruction) {
      const { Wtop, Wbot } = windConstruction;
      const Mc = 1.25 * e.M.dc1 * eta;
      const fs = stress(k, [{ M: Mc, stage: "steel" }]);
      const topComp = Mc >= 0;
      const Ls = spans[e.s];
      const Mw = (W: number) => (W * LbFt ** 2) / 10 + (W * Ls ** 2) / (8 * i.nGirders);
      const flT = flOf(Mw(Wtop), p.top) + i.flConstruction + flCurve(Mc, LbFt, p.D, p.top);
      const flB = flOf(Mw(Wbot), p.bottom) + flCurve(Mc, LbFt, p.D, p.bottom);
      const cf = topComp ? p.top : p.bottom;
      const fbu = topComp ? fs.top : fs.bot;
      const fbt = topComp ? -fs.bot : -fs.top;
      const Dc = topComp ? Math.max(0, steel.depth - p.top.t - steel.yNA) : Math.max(0, steel.yNA - p.bottom.t);
      const f = flangeFnc({ bfc: cf.b, tfc: cf.t, Dc, tw: p.tw, Fyc: i.Fyf, Fyw: i.Fyw, Lb: LbFt * 12, Cb: 1, Rb: 1, Rh });
      const flc = amplify(topComp ? flT : flB, fbu, LbFt * 12, f, 1, 1);
      const flt = topComp ? flB : flT;
      const note = (x: number) => `${topComp ? "top" : "bottom"} flange; fℓ ${x.toFixed(2)} ksi (wind${curved ? ", curvature" : ""}${i.flConstruction ? ", brackets" : ""})`;
      if (fbu > 0) {
        record("cw-yield", st, fbu + flc, PHI_F * Rh * i.Fyf, `${note(flc)}, Eq. 6.10.3.2.1-1`);
        record("cw-fnc", st, fbu + flc / 3, PHI_F * f.Fnc, `${note(flc)}, Fnc by ${f.governs}, Lb ${LbFt.toFixed(1)} ft, Cb 1, Eq. 6.10.3.2.1-2`);
      }
      if (fbt > 0) record("cw-tension", st, fbt + flt, PHI_F * Rh * i.Fyf, `${topComp ? "bottom" : "top"} flange; fℓ ${flt.toFixed(2)} ksi, Eq. 6.10.3.2.2-1`);
      record("cw-fl", st, Math.max(flc, flt), 0.6 * i.Fyf, "the larger flange's, Eq. 6.10.1.6-1");
    }

    // --- Service II (6.10.4.2): 1.0 DC + 1.0 DW + 1.3 LL ---
    const LbFtS = LbFt;
    for (const sign of [1, -1] as const) {
      const ll = sign > 0 ? e.M.llPos : e.M.llNeg;
      if (!(Math.abs(ll) > 0)) continue;
      const negative = sign < 0;
      // In negative flexure the deck counts only with studs throughout and its Service II tension within 2fr
      // (6.10.4.2.1); otherwise the steel and the bars.
      let deckEffective = !negative || i.studsThroughout;
      let fDeck = 0;
      if (negative && i.studsThroughout) {
        const s3 = prop(k, "3n");
        const sN = prop(k, "n");
        fDeck = -(((e.M.dc2 + e.M.dw) * 12) / (s3.Sdeck * 3 * n) + (1.3 * ll * 12) / (sN.Sdeck * n));
        if (fDeck > 2 * 0.24 * Math.sqrt(i.fcDeck)) deckEffective = false;
      }
      const composite: Stage = deckEffective ? "3n" : "bars";
      const short: Stage = deckEffective ? "n" : "bars";
      const deckNote = negative && i.studsThroughout ? (deckEffective ? `; deck effective (${fDeck.toFixed(3)} ksi ≤ 2fr)` : `; deck cracked (${fDeck.toFixed(3)} ksi > 2fr): the steel and bars, 6.10.4.2.1`) : "";
      const fs = stress(k, [
        { M: e.M.dc1, stage: "steel" },
        { M: e.M.dc2 + e.M.dw, stage: composite },
        { M: 1.3 * ll, stage: short },
      ]);
      // Redistribution at service (B6.3.2): the flange limits not checked from a pier to the nearest flange
      // transition or permanent-load contraflexure; elsewhere the redistribution moment is added, on the long-term section.
      const mrdS = mrdAt(X, "svc");
      const fr = mrdS ? stress(k, [{ M: mrdS, stage: composite }]) : { top: 0, bot: 0 };
      const flS = flCurve(e.M.dc1 + e.M.dc2 + e.M.dw + 1.3 * ll + mrdS, LbFtS, p.D, p.bottom);
      if (!inServiceRegion(X)) {
        record("svc-top", st, Math.abs(fs.top + fr.top), 0.95 * Rh * i.Fyf, `${negative ? "negative" : "positive"} moment, Eq. 6.10.4.2.2-1${mrdS ? `; Mrd ${mrdS.toFixed(0)} kip·ft` : ""}${deckNote}`);
        record("svc-bot", st, Math.abs(fs.bot + fr.bot) + flS / 2, 0.95 * Rh * i.Fyf, `${negative ? "negative" : "positive"} moment, Eq. 6.10.4.2.2-2${mrdS ? `; Mrd ${mrdS.toFixed(0)} kip·ft` : ""}${deckNote}${flS > 0 ? `; ff + fℓ/2, fℓ ${flS.toFixed(2)} ksi (curvature)` : ""}`);
      }
      // Web bend-buckling at service (Eq. 6.10.4.2.2-4): all sections but composite ones in positive flexure with D/tw ≤ 150.
      if (negative || p.D / p.tw > 150) {
        const fc = negative ? fs.bot : fs.top; // compression flange
        const ft = negative ? -fs.top : -fs.bot;
        if (fc > 0) {
          const Dc = Math.max(0, (fc / (fc + Math.max(0, ft))) * steel.depth - (negative ? p.bottom.t : p.top.t)); // D6.3.1
          record("svc-web", st, fc, webFcrw(p.D, p.tw, Dc, Rh, i.Fyf, i.Fyw), "web bend-buckling, Eq. 6.10.4.2.2-4");
        }
      }
    }
  }

  // --- Cross-section proportions (6.10.2) and the deck's negative-flexure bars (6.10.1.7) ---
  const proportions = i.segments.map((s, k) => {
    const p = plates(s);
    const Iyt = (p.top.t * p.top.b ** 3) / 12;
    const Iyb = (p.bottom.t * p.bottom.b ** 3) / 12;
    return {
      k,
      Dtw: p.D / p.tw,
      bf2tf: Math.max(p.top.b / (2 * p.top.t), p.bottom.b / (2 * p.bottom.t)),
      bfMin: Math.min(p.top.b, p.bottom.b),
      tfMin: Math.min(p.top.t, p.bottom.t),
      Iy: Math.min(Iyt / Iyb, Iyb / Iyt),
      D: p.D,
      tw: p.tw,
    };
  });

  // --- Live load deflection (2.5.2.6.2): all lanes loaded, the girders deflecting equally; the truck, or 25% of it with the lane ---
  const lanes = Math.max(1, Math.floor(roadway / 12));
  const mpf = lanes <= 1 ? 1.2 : lanes === 2 ? 1 : lanes === 3 ? 0.85 : 0.65;
  const dfDefl = (lanes * mpf) / i.nGirders;
  const deflections = i.deflection.check
    ? spans.map((Ls, j) => {
        let best = 0;
        for (let r = 3 * j; r < 3 * j + 3; r++) {
          const il = (X: number) => shortLine.deflectionIL(r, X) * 12; // in per kip
          let truck = 0;
          for (const rear of [14, 30])
            for (let pos = -50; pos <= total + 50; pos += 0.5)
              for (const dir of [1, -1]) {
                const ax = [
                  [8, 0],
                  [32, 14],
                  [32, 14 + rear],
                ];
                let d = 0;
                for (const [P, dd] of ax) {
                  const at = pos + dir * dd;
                  if (at > 0 && at < total) d += P * il(at);
                }
                truck = Math.max(truck, d);
              }
          let lane = 0;
          const h = total / 1200;
          for (let q = 0; q < 1200; q++) lane += Math.max(0, il((q + 0.5) * h)) * 0.64 * h;
          const d = dfDefl * Math.max(truck * (1 + i.IM), 0.25 * truck * (1 + i.IM) + lane);
          best = Math.max(best, d);
        }
        return { span: j, deflection: best, limit: (Ls * 12) / i.deflection.limit };
      })
    : [];

  // --- Reactions per girder: the dead loads from the supports' shears; the live load from each support's
  // reaction influence line (the truck or tandem with IM, the lane where the line is positive, and at a pier
  // 90% of two trucks with 90% of the lane, 3.6.1.3.1), by the span's shear distribution factor ---
  const reactions = Array.from({ length: spans.length + 1 }, (_, sup) => {
    const left = sup > 0 ? effectsRaw(starts[sup - 1] + spans[sup - 1], { s: sup - 1, x: spans[sup - 1] }) : null;
    const right = sup < spans.length ? effectsRaw(starts[sup], { s: sup, x: 0 }) : null;
    const dead = (f: (e: ReturnType<typeof effectsRaw>) => number) => (left ? -f(left) : 0) + (right ? f(right) : 0);
    const ilL = sup > 0 ? shortLine.beam.influence(sup - 1, spans[sup - 1], "V") : null;
    const ilR = sup < spans.length ? shortLine.beam.influence(sup, 0, "V") : null;
    const il = (X: number) => (ilR ? ilR(X, -1) : 0) - (ilL ? ilL(X, 1) : 0);
    const df = Math.max(sup > 0 ? spanDF[sup - 1].shear : 0, sup < spans.length ? spanDF[sup].shear : 0);
    const groups: [number, number][][] = [];
    for (const rear of [14, 16, 18, 20, 22, 24, 26, 28, 30]) groups.push([[8, 0], [32, 14], [32, 14 + rear]]);
    groups.push([[25, 0], [25, 4]]);
    const best = (axles: [number, number][]) => {
      let top = 0;
      for (let pos = -80; pos <= total + 80; pos += 0.5)
        for (const dir of [1, -1]) {
          let r = 0;
          for (const [P, d] of axles) {
            const Xq = pos + dir * d;
            if (Xq >= 0 && Xq <= total) r += P * il(Xq);
          }
          top = Math.max(top, r);
        }
      return top;
    };
    let truck = Math.max(...groups.map(best));
    let lane = 0;
    const h = total / 2000;
    for (let q = 0; q < 2000; q++) lane += Math.max(0, il((q + 0.5) * h)) * 0.64 * h;
    if (sup > 0 && sup < spans.length) {
      let pair = 0;
      for (let gap = 50; gap <= Math.min(250, total); gap += 2) pair = Math.max(pair, best([[8, 0], [32, 14], [32, 28], [8, 28 + gap], [32, 42 + gap], [32, 56 + gap]]));
      if (0.9 * (pair * (1 + i.IM) + lane) > truck * (1 + i.IM) + lane) {
        truck = 0.9 * pair;
        lane = 0.9 * lane;
      }
    }
    return { support: sup, dc: dead((e) => e.V.dc1 + e.V.dc2), dw: dead((e) => e.V.dw), truck: df * truck * (1 + i.IM), lane: df * lane, df };
  });

  // --- Camber (6.7.2): downward deflections (in) of each dead load on the section that carries it ---
  const deflect = (line: typeof steelLine, r: number, w: (X: number) => number) => {
    const N = 900;
    const h = total / N;
    let d = 0;
    for (let q = 0; q < N; q++) {
      const X = (q + 0.5) * h;
      d += w(X) * line.deflectionIL(r, X) * h;
    }
    return d * 12;
  };
  // --- The deck's pour sequence: the flanges and the hardened deck at each stage ---
  const pourResults: { stage: number; X: number; top: number; bot: number; deck: number }[] = [];
  const pourM = new Map<number, number>(); // kip·ft, each station's largest factored moment during the pours (for the splices' slip)
  if (pours.length) {
    const fr = 0.24 * Math.sqrt(i.fcDeck); // 5.4.2.6
    const gamma = GAMMA_ERECT; // the deck placed on the erected steelwork: 1.4 DC (3.4.2.1)
    for (const st of stations) {
      const k = st.seg;
      const p = plates(i.segments[k]);
      const sSteel = prop(k, "steel");
      const sN = prop(k, "n");
      const { s, x } = { s: st.span, x: st.x };
      // Stage 0: the steel and the forms, stay-in-place forms and other DC1 besides the wet deck, on the steel.
      const m0 = deadAt(steelLine, s, x, Math.max(0, dc1Deck - wetDeck), wSteel).M * gamma;
      let top = (m0 * 12) / sSteel.Stop; // + compression in the top flange
      let bot = (-m0 * 12) / sSteel.Sbot;
      let deckT = 0; // ksi, + tension at the deck's top where it has hardened
      let Mtot = m0; // kip·ft, for curvature's lateral bending
      for (const sg of pourStages) {
        const M = deadAt(sg.line, s, x, 0, sg.w).M * gamma;
        const sec = sg.hardened(st.X) ? sN : sSteel;
        top += (M * 12) / sec.Stop;
        bot -= (M * 12) / sec.Sbot;
        if (sg.hardened(st.X)) deckT += (-M * 12) / (sN.Sdeck * n); // at the deck's top
        Mtot += M;
        if (Math.abs(Mtot) > Math.abs(pourM.get(st.X) ?? 0)) pourM.set(st.X, Mtot);
        pourResults.push({ stage: sg.n + 1, X: st.X, top, bot, deck: deckT });
        // Constructibility of the noncomposite flanges at this stage (6.10.3.4.1): the steel section's resistance.
        const wet = !sg.hardened(st.X); // the top flange still bare or under wet concrete
        const [a, b] = unbraced(st.X);
        const Lb = (b - a) * 12;
        const Dc = top > 0 ? Math.max(0, sSteel.depth - p.top.t - sSteel.yNA) : Math.max(0, sSteel.yNA - p.bottom.t);
        const tag = `pour ${sg.n + 1} (${sg.pour.from}–${sg.pour.to} ft)`;
        // Curvature's lateral bending, the bare top flange and the bottom flange (the compression flange's amplified).
        const flTop = wet ? flCurve(Mtot, b - a, p.D, p.top) : 0;
        const flBot = flCurve(Mtot, b - a, p.D, p.bottom);
        if (top > 0 && wet) {
          const f = flangeFnc({ bfc: p.top.b, tfc: p.top.t, Dc, tw: p.tw, Fyc: i.Fyf, Fyw: i.Fyw, Lb, Cb: 1, Rb: 1, Rh: 1 });
          const fl = amplify(i.flConstruction + flTop, top, Lb, f, 1, 1); // brackets and curvature, amplified (Eq. 6.10.1.6-4)
          record("pour-yield", st, top + fl, PHI_F * i.Fyf, `top flange, ${tag}`);
          record("pour-fnc", st, top + fl / 3, PHI_F * f.Fnc, `top flange, ${tag}; Fnc by ${f.governs}, Lb ${(Lb / 12).toFixed(1)} ft, Cb 1`);
        }
        if (bot > 0) {
          const f = flangeFnc({ bfc: p.bottom.b, tfc: p.bottom.t, Dc, tw: p.tw, Fyc: i.Fyf, Fyw: i.Fyw, Lb, Cb: 1, Rb: 1, Rh: 1 });
          const fl = amplify(flBot, bot, Lb, f, 1, 1);
          record("pour-yield", st, bot + fl, PHI_F * i.Fyf, `bottom flange, ${tag}`);
          record("pour-fnc", st, bot + fl / 3, PHI_F * f.Fnc, `bottom flange, ${tag}; Fnc by ${f.governs}, Lb ${(Lb / 12).toFixed(1)} ft, Cb 1`);
        }
        record("pour-tension", st, Math.max(top < 0 ? -top + (wet ? i.flConstruction : 0) + flTop : 0, bot < 0 ? -bot + flBot : 0), PHI_F * i.Fyf, `tension flange, ${tag}`);
        if (deckT > 0) record("pour-deck", st, deckT, fr, `hardened deck, ${tag}; fr = 0.24√f'c`);
      }
    }
  }

  const camber = camberAt.map((X, r) => {
    const { s, x } = located(X);
    const steelW = deflect(steelLine, r, wSteel);
    // The deck's deflection: all at once on the steel, or pour by pour on the girder as it then is.
    const deck = pours.length ? deflect(steelLine, r, () => Math.max(0, dc1Deck - wetDeck)) + pourStages.reduce((d, sg) => d + deflect(sg.line, r, sg.w), 0) : deflect(steelLine, r, () => dc1Deck);
    const dc2D = deflect(longLine, r, () => dc2);
    const dwD = deflect(longLine, r, () => dw);
    return { X, span: s, at: x / spans[s], steel: steelW, deck, dc2: dc2D, dw: dwD, total: steelW + deck + dc2D };
  });

  // --- Shear connectors for strength (6.10.10.4): from each span's point of the most positive live load
  // moment to the adjacent end (Pp) or pier centerline (Pp + Pn, the deck composite in negative flexure) ---
  const studStrength: { span: number; side: "left" | "right"; length: number; P: number; required: number; provided: number }[] = [];
  const studGeometry: { name: string; demand: number; capacity: number; unit: string; ref: string; advisory?: boolean }[] = [];
  if (i.studs.check) {
    const Qr = studResistance(i.studs, i.fatigue.adttSL, 1, i.fatigue.life).Qr;
    const steelForce = (k: number) => {
      const p = plates(i.segments[k]);
      return i.Fyw * p.D * p.tw + i.Fyf * (p.top.b * p.top.t + p.bottom.b * p.bottom.t);
    };
    spans.forEach((Ls, j) => {
      const inSpan = stations.filter((s) => s.span === j);
      const best = inSpan.reduce((b, s) => (s.M.llPos > b.M.llPos ? s : b), inSpan[0]);
      const Pp = Math.min(0.85 * i.fcDeck * beff * ts, steelForce(best.seg));
      for (const side of ["left", "right"] as const) {
        const pier = side === "left" ? j > 0 : j < spans.length - 1;
        const length = side === "left" ? best.x : Ls - best.x; // ft
        let P = Pp;
        if (pier && i.studsThroughout) {
          const k = segAt(side === "left" ? starts[j] : starts[j] + Ls);
          P = Pp + Math.min(steelForce(k), 0.45 * i.fcDeck * beff * ts);
        }
        const from = side === "left" ? starts[j] : starts[j] + best.x;
        const provided = i.studs.perRow * rowsOver(from, from + length);
        studStrength.push({ span: j, side, length, P, required: P / Qr, provided });
      }
    });
    const lim = studPitchLimits(i.studs.d, Math.min(...i.segments.map((s) => plates(s).D)));
    const pitches = [i.studs.pitch, ...i.studs.zones.filter((z) => z.pitch > 0).map((z) => z.pitch)];
    studGeometry.push({ name: "Shear connectors: pitch at most the limit", demand: Math.max(...pitches), capacity: lim.max, unit: "in", ref: "AASHTO 6.10.10.1.2" });
    studGeometry.push({ name: "Shear connectors: pitch at least 4 diameters", demand: lim.min, capacity: Math.min(...pitches), unit: "in", ref: "AASHTO 6.10.10.1.2" });
    // Where the deck isn't composite over the piers: extra connectors at the points of permanent-load
    // contraflexure to develop the bars' fatigue force, nac = As fsr / Zr (6.10.10.3).
    if (!i.studsThroughout && spans.length > 1)
      for (let p = 1; p < spans.length; p++) {
        const X = starts[p];
        const st = stations.reduce((b, s) => (Math.abs(s.X - X) < Math.abs(b.X - X) ? s : b), stations[0]);
        if (!st.fatigue) continue;
        const k = st.seg;
        const sb = prop(k, "bars");
        const deck = deckFor(i.segments[k]);
        const As = deck.bars.reduce((s, b) => s + b.A, 0);
        const pk = plates(i.segments[k]);
        const yBars = deck.bars.reduce((s, b) => s + b.A * (pk.D + pk.top.t + pk.bottom.t + deck.haunch + b.y), 0) / Math.max(1e-9, As); // from the steel's bottom
        const sr = studResistance(i.studs, i.fatigue.adttSL, st.fatigue.cycles, i.fatigue.life);
        const fsr = (sr.gamma * (st.fatigue.Mmax - st.fatigue.Mmin) * 12 * Math.max(0, yBars - sb.yNA)) / sb.I;
        const nac = (As * fsr) / sr.Zr;
        const fit = i.studs.perRow * Math.floor(((2 * beff) / 3) / (4 * i.studs.d));
        studGeometry.push({ name: `Shear connectors: extra at pier ${p}'s permanent-load contraflexure points, nac = As fsr / Zr, each within beff/3 of the point`, demand: nac, capacity: fit, unit: "studs", ref: "AASHTO Eq. 6.10.10.3-1", advisory: true });
      }
    const narrow = Math.min(...i.segments.map((s) => plates(s).top.b));
    studGeometry.push({ name: "Shear connectors: studs across the narrowest top flange (4d apart, 1 in clear of its edges)", demand: i.studs.perRow, capacity: studsAcross(narrow, i.studs.d), unit: "", ref: "AASHTO 6.10.10.1.3" });
    studGeometry.push({ name: "Shear connectors: height at least 5 diameters", demand: 5 * i.studs.d, capacity: i.studs.height, unit: "in", ref: "AASHTO 6.10.10.1.1" });
    const above = Math.max(...i.segments.map((s) => deckFor(s).haunch)); // the deck's bottom above the top flange
    const below = Math.min(...i.segments.map((s) => deckFor(s).haunch));
    studGeometry.push({ name: "Shear connectors: penetration into the deck at least 2 in", demand: 2, capacity: i.studs.height - above, unit: "in", ref: "AASHTO 6.10.10.1.4", advisory: true });
    studGeometry.push({ name: "Shear connectors: cover over the studs at least 2 in", demand: 2, capacity: i.deckT - (i.studs.height - below), unit: "in", ref: "AASHTO 6.10.10.1.4", advisory: true });
  }

  // --- Intermediate transverse stiffeners (6.10.11.1), per stiffened zone ---
  const stiffenerChecks = i.stiffeners
    .map((z, zi) => {
      if (!(z.spacing > 0)) return null;
      const inZone = stations.filter((s) => s.shear?.zone === zi);
      if (!inZone.length) return null;
      const segs = [...new Set(inZone.map((s) => s.seg))];
      const ps = segs.map((k) => plates(i.segments[k]));
      const D = Math.max(...ps.map((p) => p.D));
      const tw = Math.min(...ps.map((p) => p.tw));
      const bfMax = Math.max(...ps.flatMap((p) => [p.top.b, p.bottom.b]));
      let rhoW = 0;
      let tensionField = false;
      for (const s of inZone) {
        const sh = s.shear!;
        if (s.Vu > PHI_V * sh.Vcr + 1e-9 && sh.Vn > sh.Vcr) {
          tensionField = true;
          rhoW = Math.max(rhoW, (s.Vu - PHI_V * sh.Vcr) / (PHI_V * sh.Vn - PHI_V * sh.Vcr));
        }
      }
      return { zone: zi, from: z.from, to: z.to, spacing: z.spacing, tensionField, rhoW, D, tw, bfMax, ...transverseStiffener({ st: i.stiffener, D, tw, do: z.spacing, bfMax, Fyw: i.Fyw, rhoW, tensionField }) };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);

  // --- Bearing stiffeners at the supports (6.10.11.2), or the web at the bearing (D6.5) ---
  const bearings = reactions.map((rc) => {
    const X = rc.support === 0 ? 0 : starts[rc.support - 1] + spans[rc.support - 1];
    const k = segAt(Math.min(Math.max(X, 1e-6), total - 1e-6));
    const p = plates(i.segments[k]);
    const end = rc.support === 0 || rc.support === spans.length;
    const Ru = eta * (1.25 * rc.dc + 1.5 * rc.dw + 1.75 * (rc.truck + rc.lane));
    const b = i.bearing;
    const stiffened = b.use ? bearingStiffener(b, end ? b.pairsEnd : b.pairsPier, p.D, p.tw) : null;
    const web = !b.use ? webAtBearing({ N: b.N, k: p.bottom.t + b.weld, tw: p.tw, tf: p.bottom.t, d: p.D + p.top.t + p.bottom.t, Fyw: i.Fyw, end }) : null;
    return { support: rc.support, end, Ru, plate: i.segments[k].kind === "plate", D: p.D, tw: p.tw, stiffened, web };
  });

  // --- Intermediate cross-frames (6.7.4.2.2, 4.6.2.7.1): each span's positive moment region and each pier,
  // stability bracing for the deck's placement on the steel (1.4 DC1 by 3.4.2.1, Cb = 1); the wind on the bottom flange ---
  const crossFrames = (() => {
    if (!i.crossFrame.check) return null;
    const cf = i.crossFrame;
    const Sin = i.S * 12;
    const steelOf = (k: number) => {
      const p = plates(i.segments[k]);
      const sp = prop(k, "steel");
      return { p, sp, depth: sp.depth, ho: sp.depth - (p.top.t + p.bottom.t) / 2 };
    };
    const Iyeff = (k: number, topComp: boolean) => {
      const { p, sp } = steelOf(k);
      const Iyt = (p.top.t * p.top.b ** 3) / 12;
      const Iyb = (p.bottom.t * p.bottom.b ** 3) / 12;
      const cTop = sp.depth - p.top.t / 2 - sp.yNA;
      const cBot = sp.yNA - p.bottom.t / 2;
      return topComp ? Iyt + (cBot / cTop) * Iyb : Iyb + (cTop / cBot) * Iyt; // Eqs. 6.7.4.2.2-4, -5
    };
    const inner = (a: number, b: number) => bracesU.filter((x) => x > a + 1e-6 && x < b - 1e-6);
    const bays = (a: number, b: number) => {
      const pts = [a, ...inner(a, b), b];
      return Math.max(...pts.slice(1).map((x, q) => x - pts[q]));
    };
    const cases = [
      ...spans.map((Ls, j) => {
        const inSpan = stations.filter((s) => s.span === j);
        const best = inSpan.reduce((b, s) => (s.M.dc1 > b.M.dc1 ? s : b), inSpan[0]);
        return { label: `span ${j + 1}`, L: Ls, n: inner(starts[j], starts[j] + Ls).length, Mu: GAMMA_ERECT * Math.max(0, best.M.dc1), k: best.seg, topComp: true, Lb: bays(starts[j], starts[j] + Ls) };
      }),
      ...spans.slice(1).map((_, q) => {
        const X = starts[q + 1];
        const e = effectsRaw(X, { s: q, x: spans[q] });
        return { label: `pier ${q + 1}`, L: (spans[q] + spans[q + 1]) / 2, n: Math.max(inner(starts[q], X).length, inner(X, X + spans[q + 1]).length), Mu: GAMMA_ERECT * Math.abs(Math.min(0, e.M.dc1)), k: segAt(X), topComp: false, Lb: Math.max(bays(starts[q], X), bays(X, X + spans[q + 1])) };
      }),
    ].map((c) => {
      const { p, sp, depth, ho } = steelOf(c.k);
      const sb = stabilityBracing({ cf, S: Sin, ng: i.nGirders, L: c.L * 12, n: c.n, Mu: c.Mu * 12, Iyeff: Iyeff(c.k, c.topComp), Ix: sp.I, Cb: 1, Lb: c.Lb * 12, ho, D: p.D, tw: p.tw, girderDepth: depth });
      return { ...c, ...sb, Iyeff: Iyeff(c.k, c.topComp), Ix: sp.I };
    });
    // The wind on the lower half of the fascia girder goes to the bottom flange and on to the cross-frames: W = γ PD d / 2 (C4.6.2.7.1-1).
    const LbMax = Math.max(...bracesU.slice(1).map((x, q) => x - bracesU[q]));
    const winds = (["Strength III", "Strength V"] as const)
      .filter((c) => c === "Strength V" || i.wind.V > 0)
      .map((c) => {
        const pz = windPressure(c, i.wind);
        const W = eta * 1.0 * pz.PZ * depthFt / 2; // klf
        return { combination: c as string, PZ: pz.PZ, W, F: W * LbMax };
      });
    if (windConstruction) winds.push({ combination: "Construction (deck wet)", PZ: windConstruction.PZ, W: Math.max(windConstruction.Wtop, windConstruction.Wbot), F: Math.max(windConstruction.Wtop, windConstruction.Wbot) * LbMax });
    const Fwind = Math.max(0, ...winds.map((w) => w.F));
    const Ld = cases[0].Ld;
    // Curvature (V-load approximation): each flange's force M/D turns through ℓ/R between brace points, a radial
    // force P = M ℓ / (R D) at the struts; the girders' torques M ℓ / R balanced by vertical shears across the
    // cross-frames, linear in the girders' offsets from the bridge's center (equilibrium of the cross-section), the
    // diagonals taking the largest bay's shear. At every cross-frame, under the deck's placement (1.4 DC1 on the
    // steel) and Strength I.
    const curve = (() => {
      if (!curved || grid) return null;
      const ng = i.nGirders;
      const xs = Array.from({ length: ng }, (_, q) => (q - (ng - 1) / 2) * i.S);
      const sumX2 = xs.reduce((a, x) => a + x * x, 0);
      let best = { X: 0, M: 0, ell: 0, P: 0, V: 0, stage: "" };
      for (const X of bracesU) {
        const q = bracesU.indexOf(X);
        const ell = Math.max(q > 0 ? X - bracesU[q - 1] : 0, q + 1 < bracesU.length ? bracesU[q + 1] - X : 0);
        const e = effects(Math.min(total, Math.max(0, X)));
        const Dft = plates(i.segments[segAt(Math.min(Math.max(X, 1e-6), total - 1e-6))]).D / 12;
        const sfx = strength(e);
        for (const [stage, M] of [["deck placement", GAMMA_ERECT * eta * e.M.dc1], ["Strength I", Math.abs(sfx.pos) > Math.abs(sfx.neg) ? sfx.pos : sfx.neg]] as const) {
          const P = (Math.abs(M) * ell) / (i.radius * Dft);
          const T = (Math.abs(M) * ell) / i.radius; // kip·ft per girder
          let cum = 0;
          let V = 0;
          for (let gq = 0; gq < ng - 1; gq++) {
            cum += (ng * T * xs[gq]) / sumX2;
            V = Math.max(V, Math.abs(cum));
          }
          if (P > best.P) best = { X, M, ell, P, V, stage };
        }
      }
      return { ...best, diag: (best.V / 2) * (Ld / cf.hb) };
    })();
    // With the grid: its forces at Strength I and during the deck's placement (with the stability bracing's).
    const stabS = Math.max(...cases.map((c) => c.Fstrut));
    const stabD = Math.max(...cases.map((c) => c.Fdiag));
    const strutForce = grid ? Math.max(Fwind, stabS + grid.strut.construction, grid.strut.compression, grid.strut.tension) : Math.max(Fwind, stabS) + (curve?.P ?? 0);
    const diagForce = grid ? Math.max(stabD + grid.diag.construction, grid.diag.compression, grid.diag.tension) : stabD + (curve?.diag ?? 0);
    const strut = singleAngle(cf.strut, cf.type === "K" ? Sin / 2 : Sin, cf.Fy);
    const diag = singleAngle(cf.diagonal, Ld, cf.Fy);
    // The members' end connections (6.13): for the members' forces, either way (the diagonals and the wind reverse);
    // on a curved bridge, where the cross-frames are primary members, the larger of the average of the force and the
    // member's resistance, and 75% of the resistance (6.13.1).
    const cn = cf.connection;
    const cycles = i.S > 20 ? 1 : 2; // transverse members (Table 6.6.1.2.5-2)
    const connections = cn.check
      ? ([["strut", strut, strutForce, Math.max(...cases.map((c) => c.Fstrut))], ["diagonal", diag, diagForce, Math.max(...cases.map((c) => c.Fdiag))]] as const).map(([label, m, F, stab]) => {
          const Pr = Math.min(m.Pr, m.Pt);
          const Pu = curved ? Math.max(F, (F + Pr) / 2, 0.75 * Pr) : F;
          const gm = grid ? (label === "strut" ? grid.strut : grid.diag) : null;
          const Ps = cn.serviceForce > 0 ? cn.serviceForce : gm ? Math.max(gm.service, stab / GAMMA_ERECT) : stab / GAMMA_ERECT;
          const c2 = gm && !(cn.fatigueRange > 0) ? { ...cn, fatigueRange: gm.range } : cn;
          return { label, Pu, Ps, ...cfConnection(c2, m.name, -Pu, Ps, cf.Fy, i.fatigue.adttSL, i.fatigue.life, cycles) };
        })
      : [];
    return { cases, winds, Fwind, strutForce, diagForce, strut, diag, depthFt, LbMax, curve, connections, cycles };
  })();

  // --- End cross-frames at the abutments (6.7.4.2.1, 6.7.4.2.2): framed into the bearing stiffeners, they brace the
  // girders' ends while the deck is placed (the stability bracing's stiffness and strength, for the end span) and
  // carry the lateral loads to the bearings. At an integral or semi-integral abutment the concrete end diaphragm,
  // cast with the deck, then takes over (CDOT BDM 11.3): the steel frame sees the construction stage's wind only;
  // on a seat abutment it also carries the design wind to the bearings at Strength III and V. ---
  const endFrames = (() => {
    const ef = i.endFrame;
    if (!ef.check) return null;
    const Sin = i.S * 12;
    // Its depth between the struts: as given, or 0.8 of the deeper end section's depth to the inch (full depth in 6.7.4.2.2).
    const endDepth = Math.max(...[0, total].map((X) => prop(segAt(Math.min(Math.max(X, 1e-6), total - 1e-6)), "steel").depth));
    const hb = ef.hb > 0 ? ef.hb : Math.ceil(0.8 * endDepth);
    const frame: CrossFrame = { ...i.crossFrame, type: ef.type, diagonal: ef.diagonal, strut: ef.strut, hb, fullDepthPlates: true, plateWidth: 2 * i.bearing.bt, plateThickness: i.bearing.tp };
    const inner = (a: number, b: number) => bracesU.filter((x) => x > a + 1e-6 && x < b - 1e-6);
    const bays = (a: number, b: number) => {
      const pts = [a, ...inner(a, b), b];
      return Math.max(...pts.slice(1).map((x, q) => x - pts[q]));
    };
    const ng = i.nGirders;
    const superDepth = (Math.max(...i.segments.map((x) => plates(x).D + plates(x).top.t + plates(x).bottom.t)) + Math.max(0, i.haunch) + i.deckT) / 12 + 42 / 12; // ft, girder, haunch, deck and a 42 in barrier
    const ends = [
      { label: "start abutment", X: 0, j: 0 },
      { label: "end abutment", X: total, j: spans.length - 1 },
    ].map(({ label, X, j }) => {
      const k = segAt(Math.min(Math.max(X, 1e-6), total - 1e-6));
      const p = plates(i.segments[k]);
      const sp = prop(k, "steel");
      const ho = sp.depth - (p.top.t + p.bottom.t) / 2;
      const Iyt = (p.top.t * p.top.b ** 3) / 12;
      const Iyb = (p.bottom.t * p.bottom.b ** 3) / 12;
      const cTop = sp.depth - p.top.t / 2 - sp.yNA;
      const cBot = sp.yNA - p.bottom.t / 2;
      const Iyeff = Iyt + (cBot / cTop) * Iyb; // Eq. 6.7.4.2.2-4, the top flange in compression in the end span
      const inSpan = stations.filter((s) => s.span === j);
      const best = inSpan.reduce((b, s) => (s.M.dc1 > b.M.dc1 ? s : b), inSpan[0]);
      const Mu = GAMMA_ERECT * eta * Math.max(0, best.M.dc1); // kip·ft, the deck's placement on the steel (3.4.2.1)
      const Ls = spans[j];
      const sb = stabilityBracing({ cf: frame, S: Sin, ng, L: Ls * 12, n: inner(starts[j], starts[j] + Ls).length, Mu: Mu * 12, Iyeff, Ix: sp.I, Cb: 1, Lb: bays(starts[j], starts[j] + Ls) * 12, ho, D: p.D, tw: p.tw, girderDepth: sp.depth });
      // The lateral reaction at this bearing line from half the end span, entering at the fascia girder and shared by
      // the bearings: the first bay carries (ng − 1)/ng of it.
      const share = (ng - 1) / ng;
      const Hc = windConstruction ? ((windConstruction.Wtop + windConstruction.Wbot) * Ls) / 2 : 0; // kip, Strength III with the deck wet
      const finals = ef.abutment === "seat" ? (["Strength III", "Strength V"] as const).filter((c) => c === "Strength V" || i.wind.V > 0).map((c) => ({ c: c as string, H: (eta * windPressure(c, i.wind).PZ * superDepth * Ls) / 2 })) : [];
      const Hf = Math.max(0, ...finals.map((x) => x.H));
      const Ld = sb.Ld;
      const diagOf = (Hbay: number) => (ef.type === "X" ? (Hbay / 2) * (Ld / Sin) : (Hbay / 2) * (Ld / (Sin / 2)));
      // The stability bracing at 1.4 DC1; with the construction wind on 1.25 DC1 (Strength III); the design wind alone.
      const strutForce = Math.max(sb.Fstrut, (sb.Fstrut * 1.25) / GAMMA_ERECT + share * Hc, share * Hf);
      const diagForce = Math.max(sb.Fdiag, (sb.Fdiag * 1.25) / GAMMA_ERECT + diagOf(share * Hc), diagOf(share * Hf));
      const strut = singleAngle(ef.strut, ef.type === "K" ? Sin / 2 : Sin, i.crossFrame.Fy);
      const diag = singleAngle(ef.diagonal, Ld, i.crossFrame.Fy);
      const cn = i.crossFrame.connection;
      const connections = cn.check
        ? ([["strut", strut, strutForce], ["diagonal", diag, diagForce]] as const).map(([m, a, F]) => ({ label: m, Pu: F, ...cfConnection({ ...cn, fatigueRange: 0, serviceForce: 0 }, a.name, -F, F / GAMMA_ERECT, i.crossFrame.Fy, i.fatigue.adttSL, i.fatigue.life, 1) }))
        : [];
      return { label, X, span: j, seg: k, depth: sp.depth, Mu, ...sb, Iyeff, Hc, Hf, finals, share, strutForce, diagForce, strut, diag, connections };
    });
    return { frame, ends, abutment: ef.abutment };
  })();

  // --- Sole plates and anchor rods at the bearings (14.8): not at integral abutments, whose girders are cast into
  // the abutment (CDOT BDM 11.3.1). The horizontal forces per bearing: the design wind across (Strength III; V with
  // the wind on the live load), braking along at the fixed bearings (3.6.4), and Zone 1's connection force (3.10.9.2). ---
  const soles = (() => {
    const so = i.sole;
    if (!so.check) return null;
    const ng = i.nGirders;
    const integralEnds = i.endFrame.abutment === "integral";
    const sups = reactions.filter((rc) => !(integralEnds && (rc.support === 0 || rc.support === spans.length)));
    if (!sups.length) return { supports: [], fixedCount: 0, notes: ["Integral abutments, a single span: no bearings to plate."] };
    const isPier = (sup: number) => sup > 0 && sup < spans.length;
    let fixedSet = sups.filter((rc) => (so.fixed === "all" ? true : so.fixed === "piers" ? isPier(rc.support) : !isPier(rc.support))).map((rc) => rc.support);
    if (!fixedSet.length) fixedSet = [sups[0].support];
    const superDepth = (Math.max(...i.segments.map((x) => plates(x).D + plates(x).top.t + plates(x).bottom.t)) + Math.max(0, i.haunch) + i.deckT) / 12 + 42 / 12; // ft
    const lanes = Math.max(1, Math.floor(roadway / 12));
    const mpf = [1.2, 1, 0.85, 0.65][Math.min(3, lanes - 1)];
    const BR = Math.max(0.25 * 72, 0.05 * (72 + 0.64 * total)) * lanes * mpf; // kip, the whole bridge (3.6.4)
    const permAll = reactions.reduce((s, rc) => s + rc.dc + rc.dw, 0); // kip per girder line
    const f = connectionFactor(so.AS);
    // The girder's underside slope at a support under the full permanent load: d = a x + b x² through the deflections
    // at 0.1 and 0.2 of the span next to it; the larger of the two spans at a pier; plus the grade.
    const slopeAt = (sup: number) => {
      const fromSpan = (j: number, fromEnd: boolean) => {
        const pts = camber.filter((c) => c.span === j);
        const near = fromEnd ? [pts[pts.length - 1], pts[pts.length - 2]] : [pts[0], pts[1]];
        const x1 = 0.1 * spans[j] * 12;
        const x2 = 0.2 * spans[j] * 12;
        const d = (c: (typeof camber)[number]) => c.steel + c.deck + c.dc2 + c.dw;
        const d1 = d(near[0]);
        const d2 = d(near[1]);
        return (d1 * x2 * x2 - d2 * x1 * x1) / (x1 * x2 * (x2 - x1));
      };
      const th = Math.max(sup > 0 ? Math.abs(fromSpan(sup - 1, true)) : 0, sup < spans.length ? Math.abs(fromSpan(sup, false)) : 0);
      return Math.abs(so.grade) / 100 + (sup > 0 && sup < spans.length ? 0 : th);
    };
    const supports = sups.map((rc) => {
      const X = rc.support === 0 ? 0 : starts[rc.support - 1] + spans[rc.support - 1];
      const p = plates(i.segments[segAt(Math.min(Math.max(X, 1e-6), total - 1e-6))]);
      const trib = ((rc.support > 0 ? spans[rc.support - 1] : 0) + (rc.support < spans.length ? spans[rc.support] : 0)) / 2;
      const w3 = i.wind.V > 0 ? windPressure("Strength III", i.wind).PZ * superDepth : 0;
      const w5 = windPressure("Strength V", i.wind).PZ * superDepth + 0.1; // klf, with WL 0.10 klf (3.8.1.3)
      const fixed = fixedSet.includes(rc.support);
      const Ru = eta * (1.25 * rc.dc + 1.5 * rc.dw + 1.75 * (rc.truck + rc.lane));
      return designSole(so, {
        label: rc.support === 0 ? "start abutment" : rc.support === spans.length ? "end abutment" : `pier ${rc.support}`,
        X,
        fixed,
        bf: p.bottom.b,
        tf: p.bottom.t,
        Rperm: rc.dc + rc.dw,
        Ru,
        Hwind: (eta * Math.max(w3, w5) * trib) / ng,
        Hbrake: fixed ? (eta * 1.75 * BR) / (fixedSet.length * ng) : 0,
        Hseis: { across: f * (rc.dc + rc.dw), along: fixed ? (f * permAll) / fixedSet.length : 0 },
        slope: slopeAt(rc.support),
      });
    });
    return { supports, fixedCount: fixedSet.length, notes: [] as string[] };
  })();

  // --- Checks ---
  const checks: Check[] = [];
  const at = (s: SteelStation | null) => (s ? ` at ${s.X.toFixed(1)} ft (span ${s.span + 1}, ${(s.x / spans[s.span]).toFixed(2)}L)` : "");
  const add = (id: string, name: string, unit: string, ref: string, extra?: (w: (typeof worst)[string]) => string) => {
    const w = worst[id];
    if (!w) return;
    checks.push({ id, name: `${name}${at(w.at)}`, demand: w.demand, capacity: w.capacity, unit, ok: w.demand <= w.capacity * (1 + 1e-9), ref, note: [w.note, extra?.(w)].filter(Boolean).join("; ") || undefined });
  };
  add("flex-pos", "Strength I, positive flexure: Mu ≤ φf Mn", "kip·ft", "AASHTO 6.10.7.1");
  add("flex-pos-c", "Strength I, positive flexure (noncompact): compression flange", "ksi", "AASHTO Eq. 6.10.7.2.1-1");
  add("flex-pos-t", "Strength I, positive flexure (noncompact): tension flange", "ksi", "AASHTO Eq. 6.10.7.2.1-2");
  add("ductility", "Ductility: Dp ≤ 0.42 Dt", "in", "AASHTO Eq. 6.10.7.3-1");
  add("flex-neg-c", "Strength I, negative flexure: bottom flange fbu ≤ φf Fnc", "ksi", "AASHTO 6.10.8.1.1, 6.10.8.2");
  add("flex-neg-t", "Strength I, negative flexure: top flange", "ksi", "AASHTO Eq. 6.10.8.1.3-1");
  add("flex-neg-a6c", "Strength I, negative flexure (Appendix A6): Mu ≤ φf Mnc", "kip·ft", "AASHTO Eq. A6.1.1-1");
  add("flex-neg-a6t", "Strength I, negative flexure (Appendix A6): Mu ≤ φf Rpt Myt", "kip·ft", "AASHTO Eq. A6.1.4-1");
  add("flex-fl", "Strength I: flange lateral bending fℓ ≤ 0.6 Fyf (curvature)", "ksi", "AASHTO Eq. 6.10.1.6-1");
  // Strength III and V: the wind on the exterior girder's bottom flange (and any curvature).
  for (const [pre, c] of [["s3", "III"], ["s5", "V"]] as const) {
    const nm = COMBO_NAME[c];
    add(`${pre}-pos`, `${nm}, positive flexure: Mu + fℓ Sxt / 3 ≤ φf Mn`, "kip·ft", "AASHTO Eq. 6.10.7.1.1-1, C4.6.2.7.1");
    add(`${pre}-pos-c`, `${nm}, positive flexure (noncompact): compression flange`, "ksi", "AASHTO Eq. 6.10.7.2.1-1");
    add(`${pre}-pos-t`, `${nm}, positive flexure (noncompact): tension flange fbu + fℓ/3`, "ksi", "AASHTO Eq. 6.10.7.2.1-2");
    add(`${pre}-neg-c`, `${nm}, negative flexure: bottom flange fbu + fℓ/3 ≤ φf Fnc`, "ksi", "AASHTO Eq. 6.10.8.1.1-1");
    add(`${pre}-neg-t`, `${nm}, negative flexure: top flange`, "ksi", "AASHTO Eq. 6.10.8.1.3-1");
    add(`${pre}-neg-a6c`, `${nm}, negative flexure (Appendix A6): Mu + fℓ Sxc / 3 ≤ φf Mnc`, "kip·ft", "AASHTO Eq. A6.1.1-1");
    add(`${pre}-neg-a6t`, `${nm}, negative flexure (Appendix A6): Mu ≤ φf Rpt Myt`, "kip·ft", "AASHTO Eq. A6.1.4-1");
    add(`${pre}-fl`, `${nm}: bottom flange lateral bending fℓ ≤ 0.6 Fyf`, "ksi", "AASHTO Eq. 6.10.1.6-1");
  }
  // Horizontal curvature: the line girder stands for a curved one only within these limits (4.6.1.2.4b).
  if (curved && !grid) {
    spans.forEach((Ls, j) => {
      const factor = spans.length === 1 ? 1 : j === 0 || j === spans.length - 1 ? 0.9 : 0.8;
      const ratio = (factor * Ls) / i.radius;
      checks.push({ id: `curve-span-${j}`, name: `Curvature, span ${j + 1}: Las / R < 0.06 rad (Las = ${factor} × arc span), else a refined analysis`, demand: ratio, capacity: 0.06, unit: "rad", ok: ratio < 0.06, ref: "AASHTO 4.6.1.2.4b" });
    });
    checks.push({ id: "curve-skew", name: "Curvature: bearing lines within 10° of radial, else a refined analysis", demand: Math.abs(i.skew), capacity: 10, unit: "°", ok: Math.abs(i.skew) <= 10, ref: "AASHTO 4.6.1.2.4b" });
  }
  // Moment redistribution (Appendix B6): the pier sections' requirements, and the 20% limit.
  if (i.redistribution)
    for (const q of piersB6) {
      // A pier missing one of these isn't redistributed (its flexure is checked as usual): for information.
      q.reqs.forEach((r, n) => checks.push({ id: `b6-req-${q.pier}-${n}`, name: `Redistribution at pier ${q.pier}: ${r.name}`, demand: r.demand, capacity: r.capacity, unit: r.unit, ok: r.demand <= r.capacity + 1e-9, ref: r.ref, advisory: true }));
      if (b6Active && refined) {
        // The refined method: each yielding pier's plastic rotation within θRL, at strength (φf Mn) and at service (Mn).
        if (q.qualifies) {
          for (const c of combos)
            checks.push({ id: `b6r-${c}-${q.pier}`, name: `Redistribution at pier ${q.pier} (refined), ${COMBO_NAME[c]}: θp ≤ θRL (Me ${Math.abs(q.byCombo[c].Me).toFixed(0)}, M ${q.byCombo[c].M.toFixed(0)}, Mrd ${q.byCombo[c].Mrd.toFixed(0)} kip·ft)`, demand: q.byCombo[c].theta, capacity: q.thetaRL, unit: "rad", ok: q.byCombo[c].theta <= q.thetaRL + 1e-12, ref: "AASHTO B6.6.1, Eqs. B6.6.2-1, -2" });
          checks.push({ id: `b6r-svc-${q.pier}`, name: `Redistribution at pier ${q.pier} (refined), Service II: θp ≤ θRL (Me ${Math.abs(q.MeSvc).toFixed(0)}, Mrd ${q.MrdSvc.toFixed(0)} kip·ft)`, demand: q.thetaSvc, capacity: q.thetaRL, unit: "rad", ok: q.thetaSvc <= q.thetaRL + 1e-12, ref: "AASHTO B6.6.1, Eqs. B6.6.2-1, -2" });
        }
      } else if (b6Active) {
        for (const c of combos.filter((x) => x !== "I")) {
          const b = q.byCombo[c];
          checks.push({ id: `b6-mrd-${c}-${q.pier}`, name: `Redistribution at pier ${q.pier}, ${COMBO_NAME[c]}: Mrd ≤ 0.2|Me| (Me ${Math.abs(b.Me).toFixed(0)}, Mpe ${(b.Mpe / 12).toFixed(0)} kip·ft, Mn less fℓ Sxc/3)`, demand: b.Mrd, capacity: 0.2 * Math.abs(b.Me), unit: "kip·ft", ok: b.MrdRaw <= 0.2 * Math.abs(b.Me) + 1e-9, ref: "AASHTO Eqs. B6.4.2.1-1, -3" });
        }
        checks.push({ id: `b6-mrd-${q.pier}`, name: `Redistribution at pier ${q.pier}: Mrd = |Me| − φf Mpe ≤ 0.2|Me| (Me ${Math.abs(q.Me).toFixed(0)}, Mpe ${(q.Mpe.strength / 12).toFixed(0)} kip·ft)`, demand: q.Mrd, capacity: 0.2 * Math.abs(q.Me), unit: "kip·ft", ok: q.MrdRaw <= 0.2 * Math.abs(q.Me) + 1e-9, ref: "AASHTO Eqs. B6.4.2.1-1, -3" });
        checks.push({ id: `b6-svc-${q.pier}`, name: `Redistribution at pier ${q.pier}, Service II: Mrd ≤ 0.2|Me| (Me ${Math.abs(q.MeSvc).toFixed(0)}, Mpe ${(q.Mpe.service / 12).toFixed(0)} kip·ft)`, demand: q.MrdSvc, capacity: 0.2 * Math.abs(q.MeSvc), unit: "kip·ft", ok: Math.abs(q.MeSvc) - q.Mpe.service / 12 <= 0.2 * Math.abs(q.MeSvc) + 1e-9, ref: "AASHTO Eqs. B6.3.3.1-1, -2" });
      }
    }
  add("shear", "Strength I, shear: Vu ≤ φv Vn", "kip", "AASHTO 6.10.9");
  add("con-yield", "Constructibility: compression flange fbu + fℓ ≤ φf Rh Fyc", "ksi", "AASHTO Eq. 6.10.3.2.1-1");
  add("con-fnc", "Constructibility: compression flange fbu + fℓ/3 ≤ φf Fnc", "ksi", "AASHTO Eq. 6.10.3.2.1-2");
  add("con-web", "Constructibility: web bend-buckling fbu ≤ φf Fcrw", "ksi", "AASHTO Eq. 6.10.3.2.1-3");
  add("con-tension", "Constructibility: tension flange", "ksi", "AASHTO Eq. 6.10.3.2.2-1");
  add("con-shear", "Constructibility: shear Vu ≤ φv Vcr", "kip", "AASHTO Eq. 6.10.3.3-1");
  add("con-fl", "Constructibility: flange lateral bending fℓ ≤ 0.6 Fyf (curvature)", "ksi", "AASHTO Eq. 6.10.1.6-1");
  add("cw-yield", "Construction wind (Strength III, deck wet): compression flange fbu + fℓ ≤ φf Rh Fyc", "ksi", "AASHTO Eq. 6.10.3.2.1-1, C4.6.2.7.1");
  add("cw-fnc", "Construction wind (Strength III, deck wet): compression flange fbu + fℓ/3 ≤ φf Fnc", "ksi", "AASHTO Eq. 6.10.3.2.1-2, C4.6.2.7.1");
  add("cw-tension", "Construction wind (Strength III, deck wet): tension flange fbu + fℓ ≤ φf Rh Fyt", "ksi", "AASHTO Eq. 6.10.3.2.2-1");
  add("cw-fl", "Construction wind: flange lateral bending fℓ ≤ 0.6 Fyf", "ksi", "AASHTO Eq. 6.10.1.6-1");
  add("pour-yield", "Deck placement, pour by pour: flange fbu + fℓ ≤ φf Fyc", "ksi", "AASHTO 6.10.3.4.1, Eq. 6.10.3.2.1-1");
  add("pour-fnc", "Deck placement, pour by pour: compression flange fbu + fℓ/3 ≤ φf Fnc", "ksi", "AASHTO 6.10.3.4.1, Eq. 6.10.3.2.1-2");
  add("pour-tension", "Deck placement, pour by pour: tension flange ≤ φf Fyt", "ksi", "AASHTO 6.10.3.4.1, Eq. 6.10.3.2.2-1");
  if (worst["pour-deck"]) {
    const w = worst["pour-deck"];
    // Above fr the 6.10.1.7 bars are required; with them the check is for information.
    const bars = i.bars.pct >= 1;
    checks.push({ id: "pour-deck", name: `Deck placement: hardened deck's tension ≤ fr, or the 6.10.1.7 bars${at(w.at)}`, demand: w.demand, capacity: w.capacity, unit: "ksi", ok: w.demand <= w.capacity || bars, ref: "AASHTO 6.10.3.2.4", note: `${w.note}${w.demand > w.capacity ? (bars ? "; over fr, the 1% bars are there" : "; over fr: provide the 6.10.1.7 bars") : ""}`, ...(bars ? { advisory: true } : {}) });
  }
  add("svc-top", "Service II: top flange ≤ 0.95 Rh Fyf", "ksi", "AASHTO Eq. 6.10.4.2.2-1");
  add("svc-bot", "Service II: bottom flange ≤ 0.95 Rh Fyf", "ksi", "AASHTO Eq. 6.10.4.2.2-2");
  add("svc-web", "Service II: web bend-buckling fc ≤ Fcrw", "ksi", "AASHTO Eq. 6.10.4.2.2-4");
  for (const pr of proportions) {
    const label = `section ${pr.k + 1}`;
    checks.push({ id: `prop-dtw-${pr.k}`, name: `Web D/tw ≤ 150, ${label}`, demand: pr.Dtw, capacity: 150, unit: "", ok: pr.Dtw <= 150, ref: "AASHTO Eq. 6.10.2.1.1-1" });
    checks.push({ id: `prop-bf-${pr.k}`, name: `Flanges bf/2tf ≤ 12, ${label}`, demand: pr.bf2tf, capacity: 12, unit: "", ok: pr.bf2tf <= 12, ref: "AASHTO Eq. 6.10.2.2-1" });
    checks.push({ id: `prop-bfd-${pr.k}`, name: `Flanges bf ≥ D/6, ${label}`, demand: pr.D / 6, capacity: pr.bfMin, unit: "in", ok: pr.bfMin >= pr.D / 6 - 1e-9, ref: "AASHTO Eq. 6.10.2.2-2" });
    checks.push({ id: `prop-tf-${pr.k}`, name: `Flanges tf ≥ 1.1 tw, ${label}`, demand: 1.1 * pr.tw, capacity: pr.tfMin, unit: "in", ok: pr.tfMin >= 1.1 * pr.tw - 1e-9, ref: "AASHTO Eq. 6.10.2.2-3" });
    checks.push({ id: `prop-iy-${pr.k}`, name: `Flanges 0.1 ≤ Iyc/Iyt ≤ 10, ${label}`, demand: 0.1, capacity: pr.Iy, unit: "", ok: pr.Iy >= 0.1, ref: "AASHTO Eq. 6.10.2.2-4" });
  }
  if (spans.length > 1) checks.push({ id: "deck-bars", name: "Deck's longitudinal bars in negative flexure: at least 1% of the deck", demand: 1, capacity: i.bars.pct, unit: "%", ok: i.bars.pct >= 1 - 1e-9, ref: "AASHTO 6.10.1.7" });
  for (const d of deflections) checks.push({ id: `defl-${d.span}`, name: `Live load deflection, span ${d.span + 1} (L/${i.deflection.limit})`, demand: d.deflection, capacity: d.limit, unit: "in", ok: d.deflection <= d.limit, ref: "AASHTO 2.5.2.6.2" });

  // Fatigue and the shear connectors.
  add("fat-bot", "Fatigue: bottom flange at its attachments, γ(Δf) ≤ (ΔF)n", "ksi", "AASHTO 6.6.1.2.2, 6.10.5.1");
  add("fat-top", "Fatigue: top flange at its attachments and studs, γ(Δf) ≤ (ΔF)n", "ksi", "AASHTO 6.6.1.2.2, 6.10.5.1");
  add("fat-web", "Fatigue: web of a stiffened interior panel, Vu ≤ Vcr", "kip", "AASHTO Eq. 6.10.5.3-1");
  add("stud-fat", "Shear connectors: pitch ≤ n Zr / Vsr (fatigue)", "in", "AASHTO Eq. 6.10.10.1.2-1");
  for (const s of studStrength)
    checks.push({
      id: `stud-str-${s.span}-${s.side}`,
      name: `Shear connectors for strength, span ${s.span + 1} ${s.side === "left" ? "from its start" : "to its end"} to the most positive moment (${s.length.toFixed(1)} ft, P ${s.P.toFixed(0)} kip)`,
      demand: s.required,
      capacity: s.provided,
      unit: "studs",
      ok: s.provided >= s.required - 1e-9,
      ref: "AASHTO Eqs. 6.10.10.4.1-2, 6.10.10.4.2",
    });
  studGeometry.forEach((g, q) => checks.push({ id: `stud-geo-${q}`, name: g.name, demand: g.demand, capacity: g.capacity, unit: g.unit, ok: g.demand <= g.capacity + 1e-9, ref: g.ref, ...(g.advisory ? { advisory: true } : {}) }));
  // Stiffeners.
  for (const z of stiffenerChecks) {
    const label = `zone ${z.from}–${z.to} ft at ${z.spacing} in`;
    checks.push({ id: `stf-w-${z.zone}`, name: `Transverse stiffeners: projecting width at least 2 + D/30 and bf/4, ${label}`, demand: z.widthMin, capacity: i.stiffener.bt, unit: "in", ok: i.stiffener.bt >= z.widthMin - 1e-9, ref: "AASHTO Eqs. 6.10.11.1.2-1, -2" });
    checks.push({ id: `stf-t-${z.zone}`, name: `Transverse stiffeners: projecting width at most 16 tp, ${label}`, demand: i.stiffener.bt, capacity: z.widthMax, unit: "in", ok: i.stiffener.bt <= z.widthMax + 1e-9, ref: "AASHTO Eq. 6.10.11.1.2-2" });
    checks.push({ id: `stf-i-${z.zone}`, name: `Transverse stiffeners: moment of inertia, ${label}${z.tensionField ? " (tension field)" : ""}`, demand: z.required, capacity: z.It, unit: "in⁴", ok: z.It >= z.required - 1e-9, ref: z.tensionField ? "AASHTO Eqs. 6.10.11.1.3-7, -8" : "AASHTO Eqs. 6.10.11.1.3-1, -2" });
  }
  for (const b of bearings) {
    const where = b.end ? `abutment ${b.support === 0 ? 1 : 2}` : `pier ${b.support}`;
    if (b.stiffened) {
      const s = b.stiffened;
      checks.push({ id: `brg-w-${b.support}`, name: `Bearing stiffeners at ${where}: width at most 0.48 tp √(E/Fys)`, demand: i.bearing.bt, capacity: s.btMax, unit: "in", ok: i.bearing.bt <= s.btMax + 1e-9, ref: "AASHTO Eq. 6.10.11.2.2-1" });
      checks.push({ id: `brg-b-${b.support}`, name: `Bearing stiffeners at ${where}: bearing, Ru ≤ 1.4 Apn Fys`, demand: b.Ru, capacity: s.Rr, unit: "kip", ok: b.Ru <= s.Rr + 1e-9, ref: "AASHTO Eqs. 6.10.11.2.3-1, -2" });
      checks.push({ id: `brg-a-${b.support}`, name: `Bearing stiffeners at ${where}: axial, Ru ≤ φc Pn (KL = 0.75D)`, demand: b.Ru, capacity: s.Pr, unit: "kip", ok: b.Ru <= s.Pr + 1e-9, ref: "AASHTO 6.10.11.2.4, 6.9.4.1.1" });
    } else if (b.web) {
      if (b.plate) checks.push({ id: `brg-req-${b.support}`, name: `Bearing stiffeners at ${where}: required on a built-up girder`, demand: 1, capacity: 0, unit: "", ok: false, ref: "AASHTO 6.10.11.2.1" });
      checks.push({ id: `brg-y-${b.support}`, name: `Web local yielding at ${where} (no bearing stiffeners)`, demand: b.Ru, capacity: b.web.yielding, unit: "kip", ok: b.Ru <= b.web.yielding + 1e-9, ref: "AASHTO D6.5.2" });
      checks.push({ id: `brg-c-${b.support}`, name: `Web crippling at ${where} (no bearing stiffeners)`, demand: b.Ru, capacity: b.web.phiCrippling, unit: "kip", ok: b.Ru <= b.web.phiCrippling + 1e-9, ref: "AASHTO D6.5.3" });
    }
  }

  // Cross-frames.
  if (crossFrames) {
    const cf = crossFrames;
    for (const c of cf.cases)
      checks.push({ id: `cf-stiff-${c.label}`, name: `Cross-frames, ${c.label}: stability bracing stiffness (βT)act ≥ (βT)req (Mu ${(c.Mu).toFixed(0)} kip·ft, n ${c.n})`, demand: c.req, capacity: c.act, unit: "kip·in/rad", ok: c.act >= c.req, ref: `AASHTO Eqs. 6.7.4.2.2-1, ${c.full ? "-2" : "-3"}, -6` });
    checks.push({ id: "cf-strut", name: `Cross-frames: strut ${cf.strut.name} in compression (stability ${Math.max(...cf.cases.map((c) => c.Fstrut)).toFixed(1)} kip, wind ${cf.Fwind.toFixed(1)} kip${cf.curve ? `, curvature ${cf.curve.P.toFixed(1)} kip` : ""})`, demand: cf.strutForce, capacity: cf.strut.Pr, unit: "kip", ok: cf.strutForce <= cf.strut.Pr, ref: "AASHTO 6.9.4.4, Eq. 6.7.4.2.2-14, C4.6.2.7.1" });
    checks.push({ id: "cf-diag", name: `Cross-frames: diagonal ${cf.diag.name} in compression (stability bracing${cf.curve ? `, curvature ${cf.curve.diag.toFixed(1)} kip` : ""})`, demand: cf.diagForce, capacity: cf.diag.Pr, unit: "kip", ok: cf.diagForce <= cf.diag.Pr, ref: "AASHTO 6.9.4.4, Eq. 6.7.4.2.2-14" });
    // Secondary members 140; on a curved bridge the cross-frames are primary members, 120 (6.9.3, 6.7.4.1).
    const slim = curved ? 120 : 140;
    checks.push({ id: "cf-sl-strut", name: `Cross-frames: strut slenderness ℓ/rz ≤ ${slim}`, demand: cf.strut.slenderness, capacity: slim, unit: "", ok: cf.strut.slenderness <= slim, ref: "AASHTO 6.9.3" });
    checks.push({ id: "cf-sl-diag", name: `Cross-frames: diagonal slenderness ℓ/rz ≤ ${slim}`, demand: cf.diag.slenderness, capacity: slim, unit: "", ok: cf.diag.slenderness <= slim, ref: "AASHTO 6.9.3" });
    for (const c of cf.connections)
      c.checks.forEach((x, q) => checks.push({ id: `cfc-${c.label}-${q}`, name: `Cross-frame connections, ${c.label} (${c.a.name}, Pu ${c.Pu.toFixed(1)} kip): ${x.name}`, demand: x.demand, capacity: x.capacity, unit: x.unit, ok: x.demand <= x.capacity + 1e-9, ref: x.ref }));
    for (const [m, label] of [[cf.strut, "strut"], [cf.diag, "diagonal"]] as const)
      if (m.slenderLeg) checks.push({ id: `cf-leg-${label}`, name: `Cross-frames: ${label}'s legs b/t ≤ 0.45√(E/Fy) (else reduce for local buckling)`, demand: m.b / m.t, capacity: 0.45 * Math.sqrt(ES / i.crossFrame.Fy), unit: "", ok: false, ref: "AASHTO Table 6.9.4.2.1-1" });
  }

  if (endFrames) {
    const slim = curved ? 120 : 140;
    for (const e of endFrames.ends) {
      const at = `End cross-frame, ${e.label}`;
      const rolled = i.segments[e.seg].kind === "rolled";
      const minDepth = (rolled ? 0.5 : 0.75) * e.depth;
      checks.push({ id: `ef-depth-${e.X}`, name: `${at}: depth at least ${rolled ? "0.5" : "0.75"} of the girder's (between the struts)`, demand: minDepth, capacity: endFrames.frame.hb, unit: "in", ok: endFrames.frame.hb >= minDepth - 1e-9, ref: "AASHTO 6.7.4.2.1" });
      checks.push({ id: `ef-stiff-${e.X}`, name: `${at}: stability bracing stiffness (βT)act ≥ (βT)req for the deck's placement (Mu ${e.Mu.toFixed(0)} kip·ft, span ${e.span + 1})`, demand: e.req, capacity: e.act, unit: "kip·in/rad", ok: e.act >= e.req, ref: "AASHTO Eqs. 6.7.4.2.2-2, -6" });
      const windNote = [e.Hc > 0 ? `construction wind ${e.Hc.toFixed(1)} kip` : "", ...e.finals.map((f) => `${f.c} wind ${f.H.toFixed(1)} kip`)].filter(Boolean).join(", ");
      checks.push({ id: `ef-strut-${e.X}`, name: `${at}: strut ${e.strut.name} (stability ${e.Fstrut.toFixed(1)} kip${windNote ? `; the lateral reaction ${windNote}, ${(e.share * 100).toFixed(0)}% through the first bay` : ""})`, demand: e.strutForce, capacity: Math.min(e.strut.Pr, e.strut.Pt), unit: "kip", ok: e.strutForce <= Math.min(e.strut.Pr, e.strut.Pt), ref: "AASHTO 6.7.4.2.1, 6.9.4.4, 6.8.2.1" });
      checks.push({ id: `ef-diag-${e.X}`, name: `${at}: diagonal ${e.diag.name} (stability ${e.Fdiag.toFixed(1)} kip${windNote ? ", with the lateral reaction" : ""})`, demand: e.diagForce, capacity: Math.min(e.diag.Pr, e.diag.Pt), unit: "kip", ok: e.diagForce <= Math.min(e.diag.Pr, e.diag.Pt), ref: "AASHTO 6.7.4.2.1, 6.9.4.4, 6.8.2.1" });
      checks.push({ id: `ef-sl-strut-${e.X}`, name: `${at}: strut slenderness ℓ/rz ≤ ${slim}`, demand: e.strut.slenderness, capacity: slim, unit: "", ok: e.strut.slenderness <= slim, ref: "AASHTO 6.9.3" });
      checks.push({ id: `ef-sl-diag-${e.X}`, name: `${at}: diagonal slenderness ℓ/rz ≤ ${slim}`, demand: e.diag.slenderness, capacity: slim, unit: "", ok: e.diag.slenderness <= slim, ref: "AASHTO 6.9.3" });
      for (const c of e.connections)
        c.checks.forEach((x, q) => checks.push({ id: `efc-${e.X}-${c.label}-${q}`, name: `${at}, ${c.label}'s connection (Pu ${c.Pu.toFixed(1)} kip): ${x.name}`, demand: x.demand, capacity: x.capacity, unit: x.unit, ok: x.demand <= x.capacity + 1e-9, ref: x.ref }));
    }
  }

  if (soles)
    for (const sp of soles.supports)
      sp.checks.forEach((c, k) => checks.push({ id: `sole-${sp.X}-${k}`, name: `Sole plate, ${sp.label}${sp.fixed ? " (fixed)" : " (expansion)"}: ${c.name}`, demand: c.demand, capacity: c.capacity, unit: c.unit, ok: c.demand <= c.capacity * (1 + 1e-9), ref: c.ref }));

  // --- Bolted field splices (6.13.6.1.3): at each change of section not welded in the shop ---
  const splices: SpliceResult[] = [];
  if (i.splice.check)
    segStart.slice(1).forEach((X, q) => {
      if (i.splice.shopWelded.some((w) => Math.abs(w - X) < 0.05)) return;
      const near = (x: number) => stations.reduce((b, s) => (Math.abs(s.X - x) < Math.abs(b.X - x) ? s : b), stations[0]);
      const sL = near(X - 0.01);
      const sR = near(X + 0.01);
      const side = [sL, sR];
      const Ms = (s: SteelStation, ll: number) => s.M.dc1 + s.M.dc2 + s.M.dw + 1.3 * ll;
      const Vs = (s: SteelStation) => Math.abs(s.V.dc1 + s.V.dc2 + s.V.dw) + 1.3 * Math.abs(s.V.ll);
      // The tension flange's Strength I stress on the gross section, each sign, the larger of the two sides.
      const ft = (s: SteelStation, sign: 1 | -1) => {
        const neg = sign < 0;
        const comp: Stage = neg ? (i.studsThroughout ? "bars" : "bars") : "3n";
        const sh: Stage = neg ? "bars" : "n";
        const fs = stress(s.seg, [
          { M: eta * 1.25 * s.M.dc1, stage: "steel" },
          { M: eta * (1.25 * s.M.dc2 + 1.5 * s.M.dw), stage: comp },
          { M: eta * 1.75 * (neg ? s.M.llNeg : s.M.llPos), stage: sh },
        ]);
        return neg ? Math.max(0, -fs.top) : Math.max(0, -fs.bot);
      };
      // The live load's stress range at each flange's outer fiber, the gross section (the deck in negative flexure as for fatigue).
      const negStage: Stage = i.studsThroughout && i.bars.pct >= 1 ? "n" : "bars";
      const range = (s: SteelStation, face: "top" | "bot") => {
        if (!s.fatigue) return 0;
        const f = (M: number) => {
          const sp = prop(s.seg, M >= 0 ? "n" : negStage);
          return (M * 12) / (face === "top" ? sp.Stop : sp.Sbot);
        };
        return Math.abs(f(s.fatigue.Mmax) - f(s.fatigue.Mmin));
      };
      const pM = pours.length ? side.map((s) => pourM.get(s.X) ?? GAMMA_ERECT * s.M.dc1).reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a), 0) : GAMMA_ERECT * (Math.abs(sL.M.dc1) > Math.abs(sR.M.dc1) ? sL.M.dc1 : sR.M.dc1);
      const pL = plates(i.segments[sL.seg]);
      const pR = plates(i.segments[sR.seg]);
      const sec = (p: ReturnType<typeof plates>) => ({ D: p.D, tw: p.tw, top: p.top, bottom: p.bottom });
      const res = designSplice(i.splice, X, sL.seg, sR.seg, sec(pL), sec(pR), i.Fyf, i.Fyw, { ts, above: i.haunchTo === "web" ? i.haunch : Math.min(pL.top.t, pR.top.t) + i.haunch }, {
        MuPos: Math.max(0, sL.Mpos, sR.Mpos),
        MuNeg: Math.min(0, sL.Mneg, sR.Mneg),
        Vr: PHI_V * Math.min(...side.map((s) => s.shear?.Vn ?? Infinity)),
        MsPos: Math.max(0, Ms(sL, sL.M.llPos), Ms(sR, sR.M.llPos)),
        MsNeg: Math.min(0, Ms(sL, sL.M.llNeg), Ms(sR, sR.M.llNeg)),
        Vs: Math.max(Vs(sL), Vs(sR)),
        Mdeck: eta * pM,
        Vdeck: eta * GAMMA_ERECT * Math.max(Math.abs(sL.V.dc1), Math.abs(sR.V.dc1)),
        ftPos: Math.max(ft(sL, 1), ft(sR, 1)),
        ftNeg: Math.max(ft(sL, -1), ft(sR, -1)),
        fatigue: i.fatigue.check ? { top: Math.max(range(sL, "top"), range(sR, "top")), bot: Math.max(range(sL, "bot"), range(sR, "bot")) } : { top: 0, bot: 0 },
        adttSL: i.fatigue.adttSL,
        life: i.fatigue.life,
        cycles: sL.fatigue?.cycles ?? 1,
      });
      splices.push(res);
      res.checks.forEach((c, k) => checks.push({ id: `splice-${q}-${k}`, name: c.name, demand: c.demand, capacity: c.capacity, unit: c.unit, ok: c.demand <= c.capacity * (1 + 1e-9), ref: c.ref }));
    });

  // Every check reads demand ≤ capacity: the governing ratio is the largest demand/capacity.
  const governing = checks.reduce((m, c) => (c.advisory ? m : Math.max(m, c.capacity > 0 ? c.demand / c.capacity : 0)), 0);
  return {
    ok: checks.every((c) => c.ok || c.advisory),
    checks,
    stations,
    spans,
    total,
    n,
    Ec,
    beff: { interior: beffInt, exterior: beffExt, used: beff },
    loads: { dc1Deck, dc2, dw, steel: i.segments.map((s) => selfWeight(s)) },
    df: { spans: spanDF, piers: pierDF },
    sections: i.segments.map((s, k) => ({ k, name: plates(s).name, steel: prop(k, "steel"), short: prop(k, "n"), long: prop(k, "3n"), bars: prop(k, "bars"), weight: selfWeight(s) * 1000 })),
    deflections,
    reactions,
    governing,
    braces: bracesU,
    segmentStarts: segStart,
    camber,
    crossFrames,
    endFrames,
    soles,
    splices,
    pourResults,
    b6: { active: b6Active, refined, piers: piersB6 },
    combos,
    grid: grid ? { girders: grid.cand, nodes: grid.geo.nodes.length, frames: grid.frames, strut: grid.strut, diag: grid.diag, girderMoments: grid.girderMoments, lanes: grid.lanes, ys: grid.geo.ys } : null,
    windW,
    windConstruction,
    curved,
    studStrength,
    stiffenerChecks,
    bearings,
  };
}

export type SteelGirderResult = ReturnType<typeof designSteelGirder>;
