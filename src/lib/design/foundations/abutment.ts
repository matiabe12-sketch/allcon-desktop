import { columnSection } from "../piers/column-section";
import { BARS, DesignError, flexure, type Bars, type Check } from "../walls/cip";
import { nominalBearing } from "./footing";
import { axialResistance, fixityEmbedment, flexuralResistance, HP_SECTIONS, interaction, PHI_PILE } from "./hpile";
import { analyzeLateral, type Layer } from "./lateral";
import { pMultiplier, toLayers, type SoilLayer } from "./piles";
import { designMicropile, MICROPILE_DEFAULTS, type MicropileInputs } from "./micropile";
import { gridPiles, groupForces, type GroupPile } from "./micropile-group";
import { development } from "../stm/anchorage";
import { designWingwall, WINGWALL_DEFAULTS } from "../walls/wingwall";

// A bridge abutment, CDOT BDM 11.3 with AASHTO LRFD (10th Edition) 3.11, 3.12, 4.7.4.4, 5, 6.15, 10
// and 11.6.
//
// Integral (BDM 11.3.1, CDOT's preferred type): one row of H-piles (weak axis along the abutment) or
// drilled shafts with a pin at their top; the bridge unit's thermal movement and creep and shrinkage
// from the point of no movement at its middle, the BDM's limits (unit length Table 11-1, factored
// movement ≤ 2 in, grade ≤ 5 %, skew ≤ 30°, curvature ≤ 5°, depth ≤ 13 ft, cap 3.5 to 6 ft, cap
// embedded 1.5 ft, 2 ft to the girders, foundation elements 10 ft below the cap and beyond any
// prebore, prebore d + 1 ft with pea gravel k = 300 pci, φ = 40°, γ = 95 pcf); each pile pushed through
// the movement by p–y with its head fixed in the cap (a shaft pinned), its axial load with that
// moment (AASHTO 6.9.2.2 / 5.6.4.5) and its buckling over the unconfined length plus the depth to
// fixity (10.7.3.13.4); the cap as a continuous beam over the piles under the girders (5.6.3, 5.7.3.3,
// IM included in the cap but not the foundation, BDM 11.3), half the approach slab's dead load on it;
// the end diaphragm spanning between girders under passive earth pressure (AASHTO 3.11.5.4, 11.6.1.3).
//
// Semi-integral and seat type (BDM 11.3.2, 11.3.3): a stem and backwall on a spread footing or two rows
// of H-piles, per foot of abutment: earth pressure at rest or active (3.11.5), the bridge's reactions,
// braking and the bearings' shear; stability on the footing (eccentricity, bearing on B′ by AASHTO
// 10.6.3.1.2a, sliding) or the piles' loads; the stem and backwall in flexure and shear; the seat width
// (4.7.4.4).
// Kip, foot and inch.

export type AbutmentType = "integral-piles" | "integral-shafts" | "integral-micropiles" | "semi-integral" | "seat";

export type AbutmentInputs = {
  type: AbutmentType;
  // The bridge
  unitLength: number; // ft, the continuous unit (both abutments' unit for an integral bridge)
  girderMaterial: "precast" | "steel" | "cip";
  grade: number; // %, the unit's straight-line grade
  skew: number; // deg
  curvature: number; // deg, degree of curvature
  tMin: number; // °F
  tMax: number;
  alpha: number; // per °F
  csMove: number; // in, creep, shrinkage and elastic shortening toward the middle
  gammaTU: number; // the movement's factor for deformation (AASHTO 3.4.1: 1.2)
  thermalForce: number; // TU's factor on force effects at the Strength limit (AASHTO Table 3.4.1-1: 0.50; 1.20 for deformations)
  nGirders: number;
  girderSpacing: number; // ft
  RDC: number; // kip per girder
  RDW: number;
  /** kip per girder: its DC1 (girder, deck and haunch), what an integral cap carries alone before its diaphragm is cast; default RDC. The Bridge sets it. */
  RDC1?: number;
  /** The whole line of girders' DC and DW, kip (two exterior and the rest interior); default nGirders × RDC, RDW (the larger girder's). The Bridge sets it. */
  girderTotals?: { DC: number; DW: number } | null;
  /**
   * kip, unfactored: what the girders' reactions already carry inside the abutment's solid concrete (an integral cap and
   * diaphragm, or a semi-integral end diaphragm): their ends, and the deck and haunch from the bearing line to the
   * concrete's face. Taken off its DC so it's counted once. The Bridge sets it; default 0.
   */
  girderInside?: number;
  RLL: number; // without IM
  /** One lane's reaction at the abutment, no IM (kip): with `lanes`, the foundation's live load is the lanes × their multiple presence factors (AASHTO 3.6.1.1.2), not the girders × RLL. 0: girders × RLL. */
  RLane?: number;
  lanes?: number; // design lanes on the deck
  IM: number;
  braking: number; // kip, the whole bridge's at this abutment
  /**
   * kip, unfactored: the abutment's share of the wind along the bridge on the superstructure (AASHTO 3.8.1.2.3a) and on
   * the live load (3.8.1.3), at the bearings, shared as the braking is: Strength III's and V's WS, WL, and Service I's
   * WS. The longitudinal force at the bearings is the largest of 1.75 BR (Strength I), 1.35 BR + WS + WL (V) and WS
   * (III), taken with Strength I's other loads (the conservative choice). The Bridge sets it; default none.
   */
  windLong?: { WS3: number; WS5: number; WL: number; WSs: number } | null;
  bearingShear: number; // kip/ft, the bearings' shear (seat, semi-integral)
  approachDC: number; // kip/ft, the approach slab's end reaction (half carried by the abutment, BDM 11.3)
  /** kip/ft, the approach slab's wearing surface (DW), the whole slab per foot of abutment, half carried by the abutment as its DC is; default 0. The Bridge sets it. */
  approachDW?: number;
  /**
   * kip/ft, the design lane load on the approach slab (AASHTO 3.6.1.2.4, every lane with its multiple presence factor),
   * the whole slab per foot of abutment, half on the abutment, no IM; the truck isn't added (a lane carries one, and the
   * girders' reaction already has it over the abutment). Default 0. The Bridge sets it.
   */
  approachLL?: number;
  length: number; // ft, the abutment along its centerline
  // Integral geometry
  capWidth: number; // ft, along the bridge
  capDepth: number; // ft
  totalDepth: number; // ft, top of deck to the cap's bottom
  capEmbed: number; // ft, the cap's bottom below the embankment
  girderClear: number; // ft, top of embankment to the girders' bottom
  // Semi-integral and seat geometry
  stemH: number; // ft, top of footing to the bearing seat
  stemT: number; // ft
  backwallH: number; // ft, seat to the top of deck
  backwallT: number; // ft
  seatWidth: number; // in
  /** ft, H in Eq. 4.7.4.4-1: at an abutment, the average height of the columns supporting the deck to the next expansion joint (0 for a single span). Default 0. */
  seatH?: number;
  /** %, Table 4.7.4.4-1 by seismic zone: 50 (Zone 1, As < 0.05), 100 (Zone 1, As ≥ 0.05), 150 (Zones 2–4). Default 100. */
  seatPct?: number;
  /** in, clear cover to the stem's and backwall's bars (AASHTO Table 5.10.1-1: 2 in for exterior faces other than cast against earth). Default 2. */
  wallCover?: number;
  toe: number; // ft
  heel: number; // ft
  footT: number; // ft
  foundation: "footing" | "piles" | "micropiles";
  pressure: "at-rest" | "active";
  // Materials and bars
  fc: number;
  fy: number;
  gammaC: number;
  cover: number;
  capTop: { bar: number; count: number };
  capBot: { bar: number; count: number };
  stirrup: { bar: number; spacing: number; legs: number };
  diaphragmBars: Bars; // horizontal, each face
  /** Integral with steel girders: the girders' ends cast into the diaphragm (web, through-bar holes, studs, cap-to-diaphragm dowels). */
  steelEnds?: Partial<SteelEnds>;
  /** Semi-integral: the end diaphragm's bars and the jacking for the bearings' replacement. */
  semi?: Partial<SemiDiaphragm>;
  stemBars: Bars; // back face, vertical
  backwallBars: Bars;
  backwallHorizBars?: Bars; // horizontal, each face (5.10.6), CDOT's usual #5 @ 12 in where not given
  /** No live load surcharge (AASHTO 3.11.6.5; CDOT BDM 11.3: ignored where an approach slab is provided). Default: omitted when an approach slab is given (approachDC > 0), applied by AASHTO Table 3.11.6.4.1-1 otherwise. */
  lsOmit?: boolean;
  /**
   * The wingwalls cantilevered off the abutment's ends (the Cantilever Wingwall tool; the Bridge sets them from its
   * wingwall): their length, height at the tip and thickness, ft, ft, in; how many (1 or 2, default 2); their surcharge
   * height heq (default the wingwall tool's 2 ft). Their Section B forces are applied to the abutment's ends. None by default.
   */
  wing?: { L: number; h: number; t: number; count?: number; heq?: number; bars?: Bars; cornerBars?: Bars } | null;
  /**
   * Seat and semi-integral on a skew with wingwalls: back-face bars added between the stem's main bars at each
   * wingwall's end, over `width` ft from it, for the wingwall's push square to the abutment. Default (not given): the
   * smallest that's enough, over the push's spread width (rounded up to the foot), where the main bars fall short; null: none.
   */
  stemEndBars?: { bar?: number; width?: number } | null; // bar: a size, 0 none, -1 or not given designed
  /** ft, the bearings from the stem's centerline toward the span (seat, semi-integral). Default: the seat's middle (half the backwall's thickness) for a seat abutment, 0 for semi-integral. */
  bearingEcc?: number;
  backwallLLecc?: number; // ft, the axles on the backwall's top from its centerline (default half its thickness)
  toeBars: Bars; // footing bottom, across it
  heelBars: Bars; // footing top, across it
  /** Seat and semi-integral: the stem's other bars and the footing's bars along the abutment (all optional, CDOT's usual #5 @ 12 in). */
  stemHQty?: number; // ft, the stem's average height for quantities (a stepped footing); the design uses stemH
  stemFrontBars?: Bars; // front face, vertical
  /** Seat or semi-integral on H-piles: the axis the piles bend about under the earth pressure (default weak: neither AASHTO nor the CDOT BDM sets it). */
  seatPileAxis?: "strong" | "weak";
  stemHorizBars?: Bars; // horizontal, each face
  seatTop?: { bar: number; count: number }; // continuous along the top of the stem (the seat)
  seatU?: Bars; // U bars round the seat
  footLongTop?: Bars; // footing, top, along the abutment
  footLongBot?: Bars; // footing, bottom, along the abutment
  exposure: 1 | 2;
  // Soil
  backfillPhi: number;
  backfillGamma: number; // pcf
  soil: SoilLayer[]; // under the cap or footing, for the piles' and shafts' lateral analysis
  // Integral on piles
  section: string;
  Fy: number;
  nPiles: number;
  pileLength: number; // ft, below the cap
  prebore: number; // ft
  peaGravel: boolean;
  holeD: number; // in
  embed: number; // in
  Rn: number; // kip, nominal geotechnical axial resistance per pile or shaft
  phiDyn: number;
  // Integral on shafts
  shaftD: number; // in
  shaftBars: number;
  shaftBar: number;
  shaftLength: number; // ft
  // Integral on micropiles: nPiles in each of mpRows rows, mpRowSpacing apart across the cap, the back rows battered
  mpRows: number;
  mpRowSpacing: number; // ft
  mpBatterFront: number; // deg from vertical, the first row
  mpBatterBack: number; // deg, the other rows
  /** kip·ft, the factored (Strength) moment on the group across its rows (the integral frame's, from the bridge's analysis). */
  groupMoment: number;
  /** kip·ft, the factored (Strength) moment on the group along the abutment: the live load placed toward one curb. */
  groupMomentAlong?: number;
  /** The micropiles' section, lengths and bond (the Micropile design's inputs). */
  micropile: Partial<MicropileInputs>;
  // Seat on micropiles: rows across the footing (ft from the toe), each with its batter (deg from vertical) and
  // mpPerRow micropiles along the abutment's length; the micropiles' section and bond in `micropile`.
  mpRowList?: { x: number; batter: number }[];
  mpPerRow?: number;
  // Seat on piles: two rows
  rowFront: number; // ft from the toe
  rowBack: number;
  pileSpacing: number; // ft, along the abutment
  // Seat on a footing
  c: number; // psf
  phi: number;
  gammaBelow: number; // pcf
  Dw: number; // ft below the footing's base... from the ground in front
  Df: number; // ft, ground in front to the footing's base
  phiB: number;
  phiTau: number;
};

/** Steel girders' ends in an integral abutment's diaphragm: the web, the holes for the bars through it, the studs on the end, and the dowels from the cap. */
export type SteelEnds = {
  D: number; // in, web depth
  tw: number; // in
  Fyw: number; // ksi
  holes: number; // through-bar holes in each web
  holeD: number; // in
  throughBar: number; // the bars through the webs (#), continuous along the abutment
  studs: number; // per girder end, in the diaphragm
  studD: number; // in
  studFu: number; // ksi
  dowels: Bars; // vertical, the cap into the diaphragm
};
export const STEEL_ENDS_DEFAULTS: SteelEnds = { D: 42, tw: 0.5, Fyw: 50, holes: 3, holeD: 1.375, throughBar: 6, studs: 12, studD: 0.875, studFu: 60, dowels: { bar: 6, spacing: 12 } };
/** A semi-integral abutment's end diaphragm: its bars, and the jacks under it for replacing the bearings (CDOT BDM 14.5.6). */
/** The stem's added end bars as designed: between the main bars (their spacing, in), over `width` ft at `ends` ends. */
export type StemEndBars = { bar: number; spacing: number; width: number; ends: number; auto: boolean };

export type SemiDiaphragm = {
  horiz: Bars; // horizontal, each face (along the abutment)
  vert: Bars; // vertical, each face
  bottom: { bar: number; count: number }; // continuous along the bottom (Figure 11-3's #11)
  stirrup: { bar: number; spacing: number; legs: number };
  jackTons: 50 | 100;
  jackOffset: number; // ft, each jack from its girder's centerline
  clear: number; // in, the seat to the diaphragm's bottom
};
export const SEMI_DEFAULTS: SemiDiaphragm = { horiz: { bar: 5, spacing: 12 }, vert: { bar: 5, spacing: 12 }, bottom: { bar: 11, count: 2 }, stirrup: { bar: 5, spacing: 12, legs: 2 }, jackTons: 100, jackOffset: 1.5, clear: 9 };
type SemiResult = SemiDiaphragm & { Kp: number; pBot: number; Mpass: number; Rj: number; P: number; Mj: number; MRj: number; d: number; dv: number; Vc: number; Vs: number; jackD: number; jackH: number; Ast: number };
type SteelEndsResult = SteelEnds & { piles: number; brake: number; pull: number; perGirder: number; Qr: number; Vend: number; Dnet: number; Vui: number; pushCap: number; Acv: number; Avf: number; Pc: number; Vri: number; ld: number; Hjoint: number };

/** An integral abutment on twelve HP 12x53 piles in 10 ft prebores with pea gravel, for a 240 ft precast girder unit. */
export const ABUTMENT_DEFAULTS: AbutmentInputs = {
  type: "integral-piles",
  unitLength: 240,
  girderMaterial: "precast",
  grade: 2,
  skew: 0,
  curvature: 0,
  tMin: 0,
  tMax: 100,
  alpha: 6e-6,
  csMove: 0.4,
  gammaTU: 1.2,
  thermalForce: 0.5,
  nGirders: 6,
  girderSpacing: 7.5,
  RDC: 140,
  RDW: 18,
  RLL: 75,
  RLane: 0,
  lanes: 0,
  IM: 0.33,
  braking: 40,
  bearingShear: 0,
  approachDC: 1.5,
  length: 44,
  capWidth: 3,
  capDepth: 4,
  totalDepth: 10,
  capEmbed: 2,
  girderClear: 2.5,
  stemH: 12,
  stemT: 3,
  backwallH: 6,
  backwallT: 1.5,
  seatWidth: 36,
  toe: 4,
  heel: 7,
  footT: 3,
  foundation: "footing",
  pressure: "at-rest",
  fc: 4.5,
  fy: 60,
  gammaC: 0.15,
  cover: 3,
  capTop: { bar: 8, count: 6 },
  capBot: { bar: 8, count: 6 },
  stirrup: { bar: 5, spacing: 12, legs: 2 },
  diaphragmBars: { bar: 6, spacing: 12 },
  steelEnds: STEEL_ENDS_DEFAULTS,
  semi: SEMI_DEFAULTS,
  stemBars: { bar: 8, spacing: 9 },
  backwallBars: { bar: 6, spacing: 12 },
  toeBars: { bar: 8, spacing: 9 },
  heelBars: { bar: 8, spacing: 9 },
  exposure: 1,
  backfillPhi: 34,
  backfillGamma: 125,
  soil: [
    { name: "Embankment fill", thickness: 10, kind: "sand", gamma: 125, phi: 34, k: 90, su: 0, e50: 0.007, qu: 0, Em: 0, rqd: 0 },
    { name: "Silty sand", thickness: 15, kind: "sand", gamma: 60, phi: 32, k: 60, su: 0, e50: 0.007, qu: 0, Em: 0, rqd: 0 },
    { name: "Claystone", thickness: 30, kind: "weak-rock", gamma: 65, phi: 0, k: 0, su: 0, e50: 0, qu: 300, Em: 30000, rqd: 50 },
  ],
  section: "HP12x53",
  Fy: 50,
  nPiles: 12,
  pileLength: 40,
  prebore: 10,
  peaGravel: true,
  holeD: 24,
  embed: 24,
  Rn: 450,
  phiDyn: 0.65,
  shaftD: 36,
  shaftBars: 12,
  shaftBar: 8,
  shaftLength: 30,
  mpRows: 2,
  mpRowSpacing: 5,
  mpBatterFront: 0,
  mpBatterBack: 6,
  groupMoment: 0,
  micropile: { casingOD: 7, casingT: 0.5, casingFy: 80, bar: 20, barFy: 75, fcGrout: 5, holeD: 8, cased: 0, bond: 25, alphaB: 2.4, phiBond: 0.55, embed: 12 },
  rowFront: 1.5,
  rowBack: 12.5,
  pileSpacing: 4,
  mpRowList: [{ x: 1.5, batter: 0 }, { x: 4.5, batter: 14 }],
  mpPerRow: 12,
  c: 0,
  phi: 34,
  gammaBelow: 125,
  Dw: 30,
  Df: 4,
  phiB: 0.45,
  phiTau: 0.8,
};

const rad = (d: number) => (d * Math.PI) / 180;

/** A continuous beam on point supports (stiffness method, Euler–Bernoulli): moments and shears along it. */
export function continuousBeam(L: number, supports: number[], loads: { x: number; P: number }[], w: number) {
  const xs = [...new Set([0, L, ...supports, ...loads.map((l) => l.x), ...Array.from({ length: 41 }, (_, k) => (L * k) / 40)])].filter((x) => x >= 0 && x <= L).sort((a, b) => a - b);
  const n = xs.length;
  const N = 2 * n;
  const K = Array.from({ length: N }, () => new Array(N).fill(0));
  const F = new Array(N).fill(0);
  for (let e = 0; e < n - 1; e++) {
    const l = xs[e + 1] - xs[e];
    if (l <= 0) continue;
    const k = [
      [12 / l ** 3, 6 / l ** 2, -12 / l ** 3, 6 / l ** 2],
      [6 / l ** 2, 4 / l, -6 / l ** 2, 2 / l],
      [-12 / l ** 3, -6 / l ** 2, 12 / l ** 3, -6 / l ** 2],
      [6 / l ** 2, 2 / l, -6 / l ** 2, 4 / l],
    ];
    const dof = [2 * e, 2 * e + 1, 2 * e + 2, 2 * e + 3];
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) K[dof[a]][dof[b]] += k[a][b];
    const fe = [(-w * l) / 2, (-w * l * l) / 12, (-w * l) / 2, (w * l * l) / 12];
    for (let a = 0; a < 4; a++) F[dof[a]] += fe[a];
  }
  for (const p of loads) F[2 * xs.indexOf(p.x)] -= p.P;
  const fixed = new Set(supports.map((s) => 2 * xs.indexOf(s)));
  const free = Array.from({ length: N }, (_, k) => k).filter((k) => !fixed.has(k));
  const A = free.map((r) => free.map((c) => K[r][c]));
  const b = free.map((r) => F[r]);
  // Gaussian elimination.
  const m = A.length;
  for (let k = 0; k < m; k++) {
    let p = k;
    for (let r = k + 1; r < m; r++) if (Math.abs(A[r][k]) > Math.abs(A[p][k])) p = r;
    [A[k], A[p]] = [A[p], A[k]];
    [b[k], b[p]] = [b[p], b[k]];
    for (let r = k + 1; r < m; r++) {
      const f = A[r][k] / A[k][k];
      for (let c = k; c < m; c++) A[r][c] -= f * A[k][c];
      b[r] -= f * b[k];
    }
  }
  const x = new Array(m).fill(0);
  for (let k = m - 1; k >= 0; k--) {
    let s = b[k];
    for (let c = k + 1; c < m; c++) s -= A[k][c] * x[c];
    x[k] = s / A[k][k];
  }
  const d = new Array(N).fill(0);
  free.forEach((k, j) => (d[k] = x[j]));
  // Element end moments (sagging positive) and shears.
  const M: number[] = new Array(n).fill(0);
  let Vmax = 0;
  for (let e = 0; e < n - 1; e++) {
    const l = xs[e + 1] - xs[e];
    if (l <= 0) continue;
    const [v1, t1, v2, t2] = [d[2 * e], d[2 * e + 1], d[2 * e + 2], d[2 * e + 3]];
    const m1 = (6 / l ** 2) * v1 + (4 / l) * t1 - (6 / l ** 2) * v2 + (2 / l) * t2 + (w * l * l) / 12;
    const s1 = (12 / l ** 3) * v1 + (6 / l ** 2) * t1 - (12 / l ** 3) * v2 + (6 / l ** 2) * t2 + (w * l) / 2;
    M[e] = -m1;
    M[e + 1] = -m1 + s1 * l - (w * l * l) / 2;
    Vmax = Math.max(Vmax, Math.abs(s1), Math.abs(s1 - w * l));
  }
  return { xs, M, Mpos: Math.max(0, ...M), Mneg: Math.max(0, ...M.map((v) => -v)), Vmax };
}

/** AASHTO Table 3.11.6.4-1: the equivalent soil height for vehicular load on an abutment of height H (ft), interpolated. */
export const heqAbutment = (H: number) => (H <= 5 ? 4 : H <= 10 ? 4 - (H - 5) / 5 : H <= 20 ? 3 - (H - 10) / 10 : 2);

/** AASHTO Table 3.6.1.1.2-1. */
const presence = (lanes: number) => (lanes <= 1 ? 1.2 : lanes === 2 ? 1.0 : lanes === 3 ? 0.85 : 0.65);

/**
 * The live load on the whole abutment, no IM (kip): with one lane's reaction and the design lanes, the most of
 * k lanes × their multiple presence factor (AASHTO 3.6.1.1.2, as for any substructure); otherwise the girders × RLL.
 */
export function abutmentLiveLoad(i: Pick<AbutmentInputs, "nGirders" | "RLL" | "RLane" | "lanes">) {
  const lanes = Math.floor(i.lanes ?? 0);
  if (!((i.RLane ?? 0) > 0 && lanes >= 1)) return i.nGirders * i.RLL;
  let best = 0;
  for (let k = 1; k <= lanes; k++) best = Math.max(best, k * presence(k) * (i.RLane ?? 0));
  return best;
}

/** A seat or semi-integral abutment's added stem end bars as designed (for the bar schedule and the 3D view), or null. */
export function stemEndBarsOf(i: AbutmentInputs): StemEndBars | null {
  if (i.type.startsWith("integral") || !i.wing || !(i.wing.L > 0) || !i.skew || i.stemEndBars === null) return null;
  try {
    return designAbutment(i).seat?.wingPush?.stem?.end ?? null;
  } catch {
    return null;
  }
}

export function designAbutment(i: AbutmentInputs) {
  if (!(i.length > 0 && i.unitLength > 0)) throw new DesignError("Give the abutment's length and the bridge unit's length.");
  if (!(i.nGirders >= 1)) throw new DesignError("Give the girders.");
  const checks: Check[] = [];
  const add = (c: Omit<Check, "ok"> & { ok?: boolean }) => checks.push({ ...c, ok: c.ok ?? c.demand <= c.capacity });
  const integral = i.type === "integral-piles" || i.type === "integral-shafts" || i.type === "integral-micropiles";
  const ec = 120000 * i.gammaC ** 2 * i.fc ** 0.33;
  const beta1 = Math.min(0.85, Math.max(0.65, 0.85 - (i.fc - 4) * 0.05));
  const common = { fc: i.fc, fy: i.fy, Es: 29000, phiF: 0.9, exposure: i.exposure, n: 29000 / ec, beta1 };
  // dv (5.7.2.8): the flexural lever arm de − a/2, not less than 0.9 de or 0.72 h.
  const dvOf = (f: { de: number; a: number }, h: number) => Math.max(f.de - f.a / 2, 0.9 * f.de, 0.72 * h);
  const wallCover = i.wallCover ?? 2;

  // --- movement toward the abutment from the unit's middle ----------------------------------------------------------
  const half = (i.unitLength / 2) * 12;
  const expansion = i.alpha * half * Math.max(0, i.tMax - 60);
  const contraction = i.alpha * half * Math.max(0, 60 - i.tMin) + i.csMove;
  const move = Math.max(expansion, contraction);
  const totalGirderR = { DC: (i.girderTotals?.DC ?? i.nGirders * i.RDC) - Math.max(0, i.girderInside ?? 0), DW: i.girderTotals?.DW ?? i.nGirders * i.RDW, LL: abutmentLiveLoad(i) };

  // --- the wingwalls (walls/wingwall.ts, its Section B): designed with the abutment's height, width, skew and backfill ---
  const wingIn = i.wing && i.wing.L > 0 ? i.wing : null;
  const wingH = integral ? i.totalDepth : i.stemH + i.backwallH;
  const wing = wingIn
    ? designWingwall({ ...WINGWALL_DEFAULTS, H: wingH, h: Math.min(Math.max(0, wingIn.h ?? 3), wingH), L: wingIn.L, t: wingIn.t || 12, A: integral ? i.capWidth : i.stemT, skew: Math.min(89, Math.abs(i.skew)), phi: i.backfillPhi, gammaS: i.backfillGamma / 1000, fc: i.fc, fy: i.fy, gammaC: i.gammaC, heq: wingIn.heq ?? WINGWALL_DEFAULTS.heq, ...(wingIn.bars ? { bars: wingIn.bars } : {}), ...(wingIn.cornerBars ? { cornerBars: wingIn.cornerBars } : {}) })
    : null;
  const nWing = wingIn ? Math.max(1, Math.min(2, Math.round(wingIn.count ?? 2))) : 0;
  /**
   * The wingwall's thrust P is square to the wingwall, which runs along the road: on a skew θ it splits into P cos θ along
   * the abutment (tension in it) and P sin θ square to it, pushing the abutment's end toward the span at one corner and
   * toward the fill at the other. Its moment about the wall's axis splits the same way. y: the thrust's height above the
   * wingwall's bottom (Strength I and Service I), ft.
   */
  const sq = wing
    ? (() => {
        const th = rad(Math.min(89, Math.abs(i.skew)));
        const { strength: Bu, service: Bs } = wing.sectionB;
        return { cos: Math.cos(th), sin: Math.sin(th), Pu: Bu.P, Ps: Bs.P, Myu: Math.abs(Bu.My), Mys: Math.abs(Bs.My), yu: wingH / 2 - Bu.ez, ys: wingH / 2 - Bs.ez, Hu: Bu.P * Math.sin(th), Hs: Bs.P * Math.sin(th) };
      })()
    : null;
  /**
   * The abutment's end section under the wingwall's Section B (Strength I): the thrust's part along the abutment,
   * P cos θ, as tension, its moments about the section's vertical axis (My) and horizontal axis (Mx cos θ, plus mx0 from
   * the abutment's own loads; its top or bottom bars), by a linear interaction (5.6.2:
   * the tension and both moments on the same bars, φ 0.9). My is the corner's moment: its tension face is the
   * abutment's back face, where the wingwall's corner bars run with the abutment's own face bars, over the height.
   * Integral: the cap is a beam along the abutment on one row of piles, so the wingwall's weight's moment about its axis
   * is torsion along it, against the threshold 0.25 φ Tcr (5.7.2.1), above which its closed stirrups take it with the
   * shear (5.7.3.6.2, θ 45°). A seat abutment's stem stands on its footing all along: that moment goes down into the
   * footing at the end (in its statics), not along the stem as torsion.
   */
  const wingEnd = (o: { name: string; b: number; h: number; AsFace: number; dFace: number; MrX: number | null; AsLong: number; mx0: number; Vu: number; Vc: number; dv: number; stirrup: { bar: number; legs: number; spacing: number } | null; torsion: boolean }) => {
    if (!wing) return null;
    const B = wing.sectionB.strength;
    const cos = sq?.cos ?? 1;
    const Nu = B.P * cos;
    const Myu = Math.abs(B.My);
    const Mxu = Math.abs(B.Mx) * cos + Math.abs(o.mx0);
    const cb = wing.connection.abutBars;
    const AsCorner = ((BARS[cb.bar].area * 12) / cb.spacing) * (wingH - 2 * WINGWALL_DEFAULTS.cover / 12); // in², over the wingwall's height
    const AsT = o.AsFace + AsCorner; // the back face: its own bars and the corner bars
    const aY = (AsT * i.fy) / (0.85 * i.fc * o.h);
    const MrY = (0.9 * AsT * i.fy * (o.dFace - aY / 2)) / 12;
    const Pr = 0.9 * (o.AsLong + AsCorner) * i.fy;
    const value = Nu / Pr + Myu / MrY + (o.MrX ? Mxu / o.MrX : 0);
    add({ id: "wing-end", name: `${o.name}: the wingwall's tension ${Nu.toFixed(1)} kip with its moments (My ${Myu.toFixed(0)}${o.MrX ? `, Mx ${Mxu.toFixed(0)}` : ""} kip·ft), the corner bars #${cb.bar} @ ${cb.spacing} in with its own`, demand: value, capacity: 1, unit: "", ref: "AASHTO 5.6.2, 5.6.3.2 (linear interaction)" });
    const Tu = Math.abs(B.Tz); // kip·ft
    if (!o.torsion) return { Nu, cos, Myu, Mxu, AsCorner, AsT, aY, MrY, Pr, value, Tu, Acp: 0, pc: 0, Tcr: 0, neglect: true, tors: null, ...o };
    const Acp = o.b * o.h;
    const pc = 2 * (o.b + o.h);
    const Tcr = (0.126 * Math.sqrt(i.fc) * Acp ** 2) / pc / 12; // kip·ft, K = 1 (Eq. 5.7.2.1-4)
    const neglect = Tu <= 0.25 * 0.9 * Tcr;
    add({ id: "wing-torsion", name: `${o.name}: the wingwall's weight's torsion ${neglect ? "below the threshold, neglected" : o.stirrup ? "over the threshold: designed for (the closed stirrups and the bars round the perimeter)" : "over the threshold: torsion reinforcement needed"}`, demand: Tu, capacity: 0.25 * 0.9 * Tcr, unit: "kip·ft", ref: "AASHTO 5.7.2.1", ...(neglect ? {} : { ok: !!o.stirrup }) });
    let tors: { x0: number; y0: number; Aoh: number; Ao: number; At: number; Av: number; need: number; have: number; ph: number; Al: number } | null = null;
    if (!neglect) {
      if (!o.stirrup) add({ id: "wing-torsion-steel", name: `${o.name}: no closed stirrups to take the torsion`, demand: Tu, capacity: 0.25 * 0.9 * Tcr, unit: "kip·ft", ref: "AASHTO 5.7.3.6.2" });
      else {
        const st = o.stirrup;
        const db = BARS[st.bar].dia;
        const x0 = o.b - 2 * i.cover - db;
        const y0 = o.h - 2 * i.cover - db;
        const Aoh = x0 * y0;
        const Ao = 0.85 * Aoh;
        const At = (Tu * 12) / (0.9 * 2 * Ao * i.fy); // in²/in, one leg (θ 45°)
        const Av = Math.max(0, (o.Vu / 0.9 - o.Vc) / (i.fy * o.dv)); // in²/in, all legs
        const need = Av + 2 * At;
        const have = (st.legs * BARS[st.bar].area) / st.spacing;
        add({ id: "wing-torsion-steel", name: `${o.name}: closed stirrups #${st.bar} @ ${st.spacing} in for the torsion with the shear`, demand: need, capacity: have, unit: "in²/in", ref: "AASHTO 5.7.3.6.2 (θ 45°)" });
        const ph = 2 * (x0 + y0);
        const Al = (Tu * 12 * ph) / (0.9 * 2 * Ao * i.fy);
        add({ id: "wing-torsion-long", name: `${o.name}: longitudinal bars round the perimeter for the torsion`, demand: Al, capacity: 2 * o.AsFace, unit: "in²", ref: "AASHTO 5.7.3.6.3 (the face bars, θ 45°)" });
        tors = { x0, y0, Aoh, Ao, At, Av, need, have, ph, Al };
      }
    }
    return { Nu, cos, Myu, Mxu, AsCorner, AsT, aY, MrY, Pr, value, Tu, Acp, pc, Tcr, neglect, tors, ...o };
  };

  /** The micropiles' own design (an integral abutment's or a footing's), for its notes and bond lengths. */
  let micropileResult: ReturnType<typeof designMicropile> | null = null;
  let integralOut: ReturnType<typeof integralDesign> | null = null;
  let seatOut: ReturnType<typeof seatDesign> | null = null;
  if (integral) integralOut = integralDesign();
  else seatOut = seatDesign();
  return { checks, expansion, contraction, move, integral: integralOut, seat: seatOut, totalGirderR, micropileResult: micropileResult as ReturnType<typeof designMicropile> | null };

  function integralDesign() {
    add({ id: "unit-length", name: "Bridge unit length (BDM Table 11-1)", demand: i.unitLength, capacity: 460, unit: "ft", ref: "CDOT BDM 11.3.1" });
    add({ id: "movement", name: "Factored movement at the abutment, one direction", demand: i.gammaTU * move, capacity: 2, unit: "in", ref: "CDOT BDM 11.3.1, AASHTO 3.12" });
    add({ id: "grade", name: "Grade between the unit's ends", demand: i.grade, capacity: 5, unit: "%", ref: "CDOT BDM 11.3.1" });
    add({ id: "skew", name: "Skew", demand: i.skew, capacity: 30, unit: "deg", ref: "CDOT BDM 11.3.1" });
    add({ id: "curvature", name: "Degree of curvature", demand: i.curvature, capacity: 5, unit: "deg", ref: "CDOT BDM 11.3.1" });
    add({ id: "depth", name: "Depth, top of deck to the cap's bottom (typically 13 ft or less)", demand: i.totalDepth, capacity: 13, unit: "ft", ref: "CDOT BDM 11.3.1", advisory: true });
    add({ id: "cap-max", name: "Pile cap depth at most 6 ft", demand: i.capDepth, capacity: 6, unit: "ft", ref: "CDOT BDM 11.3.1" });
    add({ id: "cap-min", name: "Pile cap depth at least 3.5 ft", demand: 3.5, capacity: i.capDepth, unit: "ft", ref: "CDOT BDM 11.3.1" });
    add({ id: "cap-embed", name: "Cap's bottom embedded in the embankment", demand: 1.5, capacity: i.capEmbed, unit: "ft", ref: "CDOT BDM 11.3.1" });
    add({ id: "girder-clear", name: "Embankment to the girders' bottom", demand: 2, capacity: i.girderClear, unit: "ft", ref: "CDOT BDM 11.3.1" });
    if (i.girderMaterial === "precast" && contraction > 1) add({ id: "flex-detail", name: "Girder contraction over 1 in: add details for foundation flexibility", demand: contraction, capacity: 1, unit: "in", ref: "CDOT BDM 11.3.1", advisory: true });

    // Vertical loads on the cap and the foundation (foundation: no IM, BDM 11.3).
    const capW = i.gammaC * i.capWidth * i.totalDepth; // kip/ft, cap and diaphragm (solid)
    const apr = 0.5 * i.approachDC; // kip/ft
    const micro = i.type === "integral-micropiles";
    const rowsMP = micro ? Math.max(1, Math.round(i.mpRows)) : 1;
    // Along the abutment: the piles of one row (a cap span's supports).
    const n = i.type === "integral-piles" || micro ? i.nPiles : Math.max(2, i.nPiles);
    const aprDW = 0.5 * (i.approachDW ?? 0); // kip/ft
    const aprLL = 0.5 * (i.approachLL ?? 0); // kip/ft
    const factoredStrength = 1.25 * (totalGirderR.DC + (capW + apr) * i.length) + 1.5 * (totalGirderR.DW + aprDW * i.length) + 1.75 * (totalGirderR.LL + aprLL * i.length);
    const service = totalGirderR.DC + (capW + apr) * i.length + totalGirderR.DW + aprDW * i.length + totalGirderR.LL + aprLL * i.length;
    const Pu = factoredStrength / (n * rowsMP);
    const Ps = service / (n * rowsMP);
    // Supports along the abutment.
    const edge = (i.length - (n - 1) * ((i.length - 2) / Math.max(1, n - 1))) / 2;
    const sp = n > 1 ? (i.length - 2 * Math.max(1, edge)) / (n - 1) : 0;
    const supports = Array.from({ length: n }, (_, k) => Math.max(1, edge) + k * sp);
    const girders = Array.from({ length: i.nGirders }, (_, k) => i.length / 2 - ((i.nGirders - 1) * i.girderSpacing) / 2 + k * i.girderSpacing);
    if (girders[0] < 0) throw new DesignError("The girders don't fit on the abutment: check the spacing and the length.");

    // The foundation elements under the imposed movement.
    const pea: Layer = { thickness: i.prebore, model: i.peaGravel ? { kind: "sand", phi: 40, gamma: 95, k: 300 } : { kind: "none" } };
    let foundation:
      | { kind: "piles"; lat: ReturnType<typeof analyzeLateral>; lat0: ReturnType<typeof analyzeLateral>; yBr: number; kHead: number; inter: ReturnType<typeof interaction>; KL: number; Pr: number; Mry: number }
      | { kind: "shafts"; lat: ReturnType<typeof analyzeLateral>; lat0: ReturnType<typeof analyzeLateral>; yBr: number; kHead: number; phiMn: number }
      | { kind: "micropiles"; lat: ReturnType<typeof analyzeLateral>; lat0: ReturnType<typeof analyzeLateral>; yBr: number; kHead: number; phiMn: number; mpIn: MicropileInputs; PmaxS: number; PminS: number; Pr: number; Zc: number; value: number; nPiles: number; group: GroupPile[]; fS: number[] }
      | null = null;
    const delta = i.thermalForce * move;
    // Braking along the bridge (its share, AASHTO 3.6.4, Strength I 1.75) on the abutment: the foundation elements, their
    // heads moving with the cap, are pushed further by it, at their secant stiffness under the movement (p–y, pinned
    // heads), and checked at the movement and that together; lat0 is the movement alone (the steel ends' pull adds
    // the braking itself).
    const pushed = (runAt: (y: number) => ReturnType<typeof analyzeLateral>, nF: number) => {
      const lat0 = runAt(delta);
      if (!(i.braking > 0) && !i.windLong) return { lat: lat0, lat0, yBr: 0, kHead: 0 };
      const probe = delta > 0 && Math.abs(lat0.H0) > 1e-9 ? lat0 : runAt(0.1);
      const kHead = Math.abs(probe.H0) / (delta > 0 && probe === lat0 ? delta : 0.1); // kip/in, each
      const wl = i.windLong ?? null;
      const Hlong = Math.max(1.75 * i.braking, wl ? 1.35 * i.braking + wl.WS5 + wl.WL : 0, wl ? wl.WS3 : 0); // kip, factored
      const yBr = Hlong / (nF * Math.max(kHead, 1e-6));
      return { lat: runAt(delta + yBr), lat0, yBr, kHead };
    };
    if (i.type === "integral-piles") {
      const s = HP_SECTIONS[i.section];
      if (!s) throw new DesignError("Choose an H-pile section.");
      add({ id: "pile-length", name: "Piles at least 10 ft below the cap and 10 ft past the prebore", demand: Math.max(10, i.prebore + 10), capacity: i.pileLength, unit: "ft", ref: "CDOT BDM 11.3, 11.3.1" });
      if (i.prebore > 0) add({ id: "prebore", name: "Prebore diameter at least the pile's depth plus 1 ft", demand: s.d + 12, capacity: i.holeD, unit: "in", ref: "CDOT BDM 11.3.1" });
      add({ id: "embed", name: "Pile embedment into the cap, for information: the BDM 10.5.3 fixed-head length (the design takes a pin)", demand: Math.round(fixityEmbedment(s, i.Fy, i.fc)), capacity: i.embed, unit: "in", ref: "CDOT BDM 10.5.3, 11.3.1", advisory: true });
      const layers: Layer[] = [...(i.prebore > 0 ? [pea] : []), ...toLayers(i.soil).map((l, k) => (k === 0 && i.prebore > 0 ? { ...l, thickness: Math.max(0, l.thickness - i.prebore) } : l))];
      // BDM 11.3.1: a pin is taken to form between the cap and the pile; the pile's head moves with the cap.
      const push = pushed((y) => analyzeLateral({ length: i.pileLength, D: s.bf, EI: 29000 * s.Iy, Q: Pu, head: { kind: "displaced", y, pinned: true }, layers }), n);
      const lat = push.lat;
      // Buckling: the length without confinement plus the depth to fixity, K = 2.1 (pinned head free to sway, fixed below).
      const unconfined = i.peaGravel ? 0 : i.prebore;
      const KL = unconfined > 0 ? 2.1 * (unconfined + (lat.zZero ?? 0)) * 12 : 0;
      const ax = axialResistance(s, i.Fy, KL);
      const Pr = PHI_PILE.combinedAxial * ax.Pn;
      const fy = flexuralResistance(s, i.Fy, "y");
      const Mry = PHI_PILE.flexure * fy.Mn;
      const inter = interaction(Pu, Pr, 0, 1, lat.Mmax * 12, Mry, fy.compact);
      add({ id: "pile-interaction", name: `Pile: axial with the movement's weak-axis moment${push.yBr > 0 ? ` (and braking's ${push.yBr.toFixed(2)} in more)` : ""}`, demand: inter.value, capacity: 1, unit: "", ref: `AASHTO 6.15.3.2, Eq. ${inter.eq}; CDOT BDM 11.3.1` });
      const axOnly = axialResistance(s, i.Fy, 0);
      add({ id: "pile-axial", name: "Pile: structural axial", demand: Pu, capacity: PHI_PILE.axialGood * axOnly.Pn, unit: "kip", ref: "AASHTO 6.15.3.1" });
      add({ id: "pile-geo", name: "Pile: geotechnical axial", demand: Pu, capacity: i.phiDyn * (n <= 3 ? 0.8 : 1) * i.Rn, unit: "kip", ref: "AASHTO 10.5.5.2.3, CDOT BDM 10.5.2.2" });
      foundation = { kind: "piles", lat, lat0: push.lat0, yBr: push.yBr, kHead: push.kHead, inter, KL, Pr, Mry };
    } else if (micro) {
      // Micropiles in rows under the cap: the group's forces on a rigid cap, the moment across the rows (FHWA GEC 12 9.8,
      // as CDOT's micropile array calcs), along a battered pile's axis; each micropile by the Micropile design (AASHTO 10.9);
      // the movement pushed through each by p–y, its head pinned (BDM 11.3.1), the casing's bending with its axial load.
      const mp: MicropileInputs = { ...MICROPILE_DEFAULTS, ...i.micropile };
      const group = gridPiles(n, rowsMP, sp || 1, i.mpRowSpacing, { batterByRow: Array.from({ length: rowsMP }, (_, r) => (r === 0 ? i.mpBatterFront : i.mpBatterBack)) });
      const fS = groupForces(group, factoredStrength, i.groupMoment, i.groupMomentAlong ?? 0);
      const PmaxS = Math.max(...fS);
      const PminS = Math.min(...fS);
      add({ id: "pile-length", name: "Micropiles at least 10 ft below the cap", demand: 10, capacity: mp.cased + mp.bond, unit: "ft", ref: "CDOT BDM 11.3" });
      const mpIn: MicropileInputs = { ...mp, spacing: Math.min(sp || 99, i.mpRowSpacing), cases: [{ name: "Strength I", limit: "strength", compression: Math.max(0, PmaxS), tension: Math.max(0, -PminS), H: 0 }, { name: "Service I", limit: "service", compression: Math.max(...groupForces(group, service, 0, 0)), tension: 0, H: 0 }] };
      const r = (micropileResult = designMicropile(mpIn));
      for (const ch of r.checks) if (!/^(deflection|interaction)$/.test(ch.id)) checks.push({ ...ch, id: `mp-${ch.id}`, name: `Micropile: ${ch.name}` });
      const ID = mp.casingOD - 2 * mp.casingT;
      const Ic = (Math.PI / 64) * (mp.casingOD ** 4 - ID ** 4);
      const Zc = (mp.casingOD ** 3 - ID ** 3) / 6;
      const push = pushed((y) => analyzeLateral({ length: mp.cased + mp.bond, D: mp.casingOD, EI: 29000 * Ic, Q: PmaxS, head: { kind: "displaced", y, pinned: true }, layers: toLayers(i.soil) }), n * rowsMP);
      const lat = push.lat;
      const Pr = r.checks.find((c) => c.id === "cased-comp")?.capacity ?? r.checks.find((c) => c.id === "uncased-comp")?.capacity ?? 0;
      const Mr = 1.0 * Math.min(mp.casingFy, 80) * Zc / 12; // kip·ft, the casing (AASHTO 6.12.2.2.3, φf 1.0)
      const value = (Pr > 0 ? PmaxS / Pr : 1) + (Mr > 0 ? lat.Mmax / Mr : 1);
      add({ id: "mp-movement", name: "Micropile: axial with the movement's moment (the casing, pinned head)", demand: value, capacity: 1, unit: "", ref: "AASHTO 10.9.3.10.1, 6.9.2.2; CDOT BDM 11.3.1", note: `${PmaxS.toFixed(1)} kip on the most loaded pile (the group's moments: ${i.groupMoment} kip·ft across ${rowsMP} rows${i.groupMomentAlong ? `, ${i.groupMomentAlong} kip·ft along the abutment` : ""}); ${lat.Mmax.toFixed(1)} kip·ft from ${delta.toFixed(2)} in of movement${push.yBr > 0 ? ` and ${push.yBr.toFixed(2)} in more from braking` : ""}` });
      foundation = { kind: "micropiles", lat, lat0: push.lat0, yBr: push.yBr, kHead: push.kHead, phiMn: Mr, mpIn, PmaxS, PminS, Pr, Zc, value, nPiles: n * rowsMP, group, fS };
    } else {
      add({ id: "shaft-length", name: "Shafts at least 10 ft below the cap", demand: 10, capacity: i.shaftLength, unit: "ft", ref: "CDOT BDM 11.3" });
      add({ id: "shaft-d", name: "Shaft diameter at least 24 in", demand: 24, capacity: i.shaftD, unit: "in", ref: "CDOT BDM 10.6.1.1" });
      const Ec = ec;
      const EI = 0.5 * Ec * ((Math.PI * i.shaftD ** 4) / 64);
      const push = pushed((y) => analyzeLateral({ length: i.shaftLength, D: i.shaftD, EI, Q: Pu, head: { kind: "displaced", y, pinned: true }, layers: toLayers(i.soil) }), n);
      const lat = push.lat;
      const sec = columnSection({ shape: "round", T: i.shaftD, W: i.shaftD, cover: i.cover, bar: i.shaftBar, bars: i.shaftBars, barsT: 0, barsL: 0, barsEnd: 0, tieBar: 5, transverse: "spiral", fc: i.fc, fy: i.fy });
      const res = sec.resistance(Pu, lat.Mmax * 12, 0);
      const phiMn = res ? res.phiMn / 12 : 0;
      add({ id: "shaft-pm", name: `Shaft: axial with the movement's moment (pinned top)${push.yBr > 0 ? `, and braking's ${push.yBr.toFixed(2)} in more` : ""}`, demand: lat.Mmax, capacity: phiMn, unit: "kip·ft", ref: "AASHTO 5.6.4.5; CDOT BDM 11.3.1" });
      add({ id: "shaft-geo", name: "Shaft: axial resistance (from the Drilled Shaft tool)", demand: Pu, capacity: i.phiDyn * i.Rn, unit: "kip", ref: "AASHTO 10.8.3.5" });
      foundation = { kind: "shafts", lat, lat0: push.lat0, yBr: push.yBr, kHead: push.kHead, phiMn };
    }

    // The cap: a continuous beam over the piles, the girders with IM.
    const Pg = 1.25 * (i.RDC - Math.max(0, i.girderInside ?? 0) / i.nGirders) + 1.5 * i.RDW + 1.75 * i.RLL * (1 + i.IM); // the girders' ends inside the cap off (counted in its own weight)
    const wCap = 1.25 * (capW + apr) + 1.5 * aprDW + 1.75 * aprLL; // the lane load takes no IM (3.6.2.1)
    const Pw = wing ? wing.sectionB.strength.V : 0; // kip, each wingwall's weight × γDC at the cap's end
    const wingLoads = wing ? (nWing === 2 ? [{ x: 0, P: Pw }, { x: i.length, P: Pw }] : [{ x: 0, P: Pw }]) : [];
    const beam = continuousBeam(i.length, supports, [...girders.map((x) => ({ x, P: Pg })), ...wingLoads], wCap);
    const b = i.capWidth * 12;
    const h = i.totalDepth * 12; // the cap and diaphragm act together once cast
    const asTop = i.capTop.count * BARS[i.capTop.bar].area;
    const asBot = i.capBot.count * BARS[i.capBot.bar].area;
    const dCap = h - i.cover - 0.625 - BARS[i.capBot.bar].dia / 2;
    const Mr = (As: number) => {
      const a = (As * i.fy) / (0.85 * i.fc * b);
      return (0.9 * As * i.fy * (dCap - a / 2)) / 12;
    };
    add({ id: "cap-pos", name: "Cap: positive moment between supports", demand: beam.Mpos, capacity: Mr(asBot), unit: "kip·ft", ref: "AASHTO 5.6.3.2" });
    add({ id: "cap-neg", name: "Cap: negative moment over the supports", demand: beam.Mneg, capacity: Mr(asTop), unit: "kip·ft", ref: "AASHTO 5.6.3.2" });
    const fr = 0.24 * Math.sqrt(i.fc);
    const Mcr = (1.6 * fr * ((b * h * h) / 6) * 0.67) / 12;
    add({ id: "cap-min", name: "Cap: minimum reinforcement (bottom)", demand: Math.min(1.33 * beam.Mpos, Mcr), capacity: Mr(asBot), unit: "kip·ft", ref: "AASHTO 5.6.3.3" });
    const dv = Math.max(0.9 * dCap, 0.72 * h);
    const Vc = 0.0316 * 2 * Math.sqrt(i.fc) * b * dv;
    const Vs = (i.stirrup.legs * BARS[i.stirrup.bar].area * i.fy * dv) / i.stirrup.spacing;
    add({ id: "cap-shear", name: "Cap: shear", demand: beam.Vmax, capacity: 0.9 * Math.min(Vc + Vs, 0.25 * i.fc * b * dv), unit: "kip", ref: "AASHTO 5.7.3.3" });
    // The cap alone before the diaphragm is cast (CDOT BDM 11.3.1: the cap poured first, the girders set on it, then the
    // diaphragm): the girders' DC1 (girder, deck and haunch), the wet diaphragm and the cap, nothing else; with no live
    // load Strength IV governs (1.5 DC, AASHTO Table 3.4.1-1; 3.4.2.1 keeps it at least 1.25). The cap's own depth.
    const hc = i.capDepth * 12;
    const wDia = i.gammaC * i.capWidth * Math.max(0, i.totalDepth - i.capDepth); // kip/ft, wet
    const wCap1 = i.gammaC * i.capWidth * i.capDepth;
    const Pg1 = 1.5 * Math.max(0, (i.RDC1 ?? i.RDC) - Math.max(0, i.girderInside ?? 0) / i.nGirders);
    const beam1 = continuousBeam(i.length, supports, girders.map((x) => ({ x, P: Pg1 })), 1.5 * (wCap1 + wDia));
    const dC = hc - i.cover - BARS[i.stirrup.bar].dia - BARS[i.capBot.bar].dia / 2;
    const dT = hc - 2 - BARS[i.stirrup.bar].dia - BARS[i.capTop.bar].dia / 2;
    const Mr1 = (As: number, d: number) => {
      const a = (As * i.fy) / (0.85 * i.fc * b);
      return (0.9 * As * i.fy * (d - a / 2)) / 12;
    };
    add({ id: "cap-const-pos", name: "Cap alone, before the diaphragm (Strength IV): positive moment", demand: beam1.Mpos, capacity: Mr1(asBot, dC), unit: "kip·ft", ref: "AASHTO 3.4.1, 3.4.2.1, 5.6.3.2; CDOT BDM 11.3.1" });
    add({ id: "cap-const-neg", name: "Cap alone, before the diaphragm (Strength IV): negative moment", demand: beam1.Mneg, capacity: Mr1(asTop, dT), unit: "kip·ft", ref: "AASHTO 3.4.1, 3.4.2.1, 5.6.3.2; CDOT BDM 11.3.1" });
    const dv1 = Math.max(0.9 * dC, 0.72 * hc);
    const Vc1 = 0.0316 * 2 * Math.sqrt(i.fc) * b * dv1;
    const Vs1 = (i.stirrup.legs * BARS[i.stirrup.bar].area * i.fy * dv1) / i.stirrup.spacing;
    add({ id: "cap-const-shear", name: "Cap alone, before the diaphragm (Strength IV): shear", demand: beam1.Vmax, capacity: 0.9 * Math.min(Vc1 + Vs1, 0.25 * i.fc * b * dv1), unit: "kip", ref: "AASHTO 5.7.3.3" });
    const construction = { Pg1, wDia, wCap1, beam: beam1, dC, dT, dv1, Vc1, Vs1 };

    // The end diaphragm under passive pressure, spanning between girders (per foot of height at its bottom).
    const Kp = Math.tan(rad(45 + i.backfillPhi / 2)) ** 2;
    const pBottom = Kp * (i.backfillGamma / 1000) * i.totalDepth; // ksf
    const Mdia = (1.35 * pBottom * i.girderSpacing ** 2) / 10;
    const dia = flexure({ ...common, Mu: Mdia, Ms: Mdia / 1.35, h: i.capWidth * 12, cover: 2, bars: i.diaphragmBars });
    // Steel girders cast into the end diaphragm (CDOT BDM 11.3.1 Figure 11-1 note 3): their anchorage. The girders pull the
    // abutment through the piles' shears as the bridge contracts (and braking), so each girder's end carries that share
    // by studs inside the diaphragm (AASHTO 6.10.10.4.3, Qn = 0.70 Asc Fu, φsc 1.0); the web's holes for the through
    // bars leave its net section for the end shear (6.10.9.2 on the net web); the cap and diaphragm, cast apart, are
    // tied by dowels across the joint by shear friction (5.7.4): the contraction's pull or the expansion's push of the
    // cap (its own face's passive pressure, 1.35, with the piles' shears and braking), per foot.
    let steelEnds: SteelEndsResult | null = null;
    if (i.girderMaterial === "steel") {
      const se = { ...STEEL_ENDS_DEFAULTS, ...(i.steelEnds ?? {}) };
      const lat = foundation?.lat0; // the movement alone: the braking is added below
      const nFound = foundation?.kind === "micropiles" ? foundation.nPiles : n;
      const piles = lat ? Math.abs(lat.H0) * nFound : 0; // kip, all the foundation elements' head shears at the movement
      const brake = 1.75 * i.braking;
      const pull = piles + brake; // kip, the whole abutment
      const perGirder = pull / i.nGirders;
      const Asc = (Math.PI * se.studD ** 2) / 4;
      const Qr = 1.0 * 0.7 * Asc * se.studFu;
      add({ id: "steel-studs", name: `Steel girder ends: studs in the diaphragm, ${se.studs} – ${se.studD} in each girder (the piles' shears ${piles.toFixed(0)} kip and braking ${brake.toFixed(0)} kip over ${i.nGirders} girders)`, demand: perGirder, capacity: se.studs * Qr, unit: "kip", ref: "AASHTO 6.10.10.4.3; CDOT BDM 11.3.1 (Fig. 11-1 note 3)" });
      // The end shear on the web's net section at the through bars' holes.
      const Vend = 1.25 * i.RDC + 1.5 * i.RDW + 1.75 * i.RLL * (1 + i.IM);
      const Dnet = se.D - se.holes * se.holeD;
      add({ id: "steel-web-holes", name: `Steel girder ends: the web at the through bars' holes, ${se.holes} holes of ${se.holeD} in in a ${se.D} × ${se.tw} in web`, demand: Vend, capacity: 1.0 * 0.58 * se.Fyw * Dnet * se.tw, unit: "kip", ref: "AASHTO 6.10.9.2 (Vp on the net web)" });
      add({ id: "steel-hole-size", name: "Through-bar holes at least the bar plus 1/2 in", demand: BARS[se.throughBar].dia + 0.5, capacity: se.holeD, unit: "in", ref: "CDOT BDM 11.3.1 (bars through the webs)" });
      // Dowels across the cap-to-diaphragm joint, per foot.
      const Hjoint = i.totalDepth - i.capDepth; // ft, the diaphragm above the joint
      const pushCap = 1.35 * 0.5 * Kp * (i.backfillGamma / 1000) * (i.totalDepth ** 2 - Hjoint ** 2); // kip/ft, the cap's face
      const Vui = Math.max(pull / i.length, pushCap + pull / i.length); // kip/ft
      const Acv = i.capWidth * 12 * 12; // in² per foot
      const Avf = (BARS[se.dowels.bar].area * 12) / se.dowels.spacing; // in²/ft
      const Pc = i.gammaC * i.capWidth * Hjoint; // kip/ft, the diaphragm's weight
      const Vni = 0.24 * Acv + 1.0 * (Avf * i.fy + Pc);
      const Vri = 0.9 * Math.min(Vni, 0.25 * i.fc * Acv, 1.5 * Acv);
      add({ id: "steel-dowels", name: `Dowels, cap to diaphragm: #${se.dowels.bar} @ ${se.dowels.spacing} in across the joint (roughened 1/4 in)`, demand: Vui, capacity: Vri, unit: "kip/ft", ref: "AASHTO 5.7.4.3, 5.7.4.4 (c 0.24 ksi, μ 1.0)" });
      if (Vui / Acv >= 0.21) add({ id: "steel-dowels-min", name: "Dowels: minimum interface steel, 0.05 Acv / fy", demand: (0.05 * Acv) / i.fy, capacity: Avf, unit: "in²/ft", ref: "AASHTO 5.7.4.2" });
      const ld = development({ barSize: se.dowels.bar, fy: i.fy, fc: i.fc, clearCover: i.cover, clearSpacing: Math.max(3, se.dowels.spacing - BARS[se.dowels.bar].dia), horizontal: false, concreteBelow: 0, coating: "epoxy" }).required;
      add({ id: "steel-dowel-embed", name: "Dowels developed into the diaphragm above the joint", demand: ld, capacity: Hjoint * 12 - i.cover, unit: "in", ref: "AASHTO 5.10.8.2.1" });
      steelEnds = { ...se, piles, brake, pull, perGirder, Qr, Vend, Dnet, Vui, pushCap, Acv, Avf, Pc, Vri, ld, Hjoint };
    }
    add({ id: "diaphragm", name: "End diaphragm: horizontal bars under passive pressure between girders", demand: Mdia, capacity: dia.MR, unit: "kip·ft/ft", ref: "AASHTO 3.11.5.4, 11.6.1.3, 5.6.3.2" });
    // The wingwalls on the cap's ends: the end pile (or shaft) takes the wingwall's weight on the overhang with the
    // average load (the cap rigid between the end supports), and the end section its Section B forces.
    let wingOut: { Pw: number; PuEnd: number; lever: number; end: ReturnType<typeof wingEnd>; push: { a: number; Hu: number; pOh: number; Mu: number; Vu: number; AsF: number; past: number; ld: number; kC: number; aF: number; MrF: number; PrF: number; Mx: number; value: number; dvH: number; VcH: number } | null } | null = null;
    if (wing) {
      const lever = n > 1 ? supports[0] / sp : 0; // the overhang over the span to the next support
      const PuEnd = Pu + Pw * (1 + lever);
      if (i.type === "integral-piles") {
        const s = HP_SECTIONS[i.section];
        add({ id: "wing-pile-axial", name: "End pile with the wingwall's weight: structural axial", demand: PuEnd, capacity: PHI_PILE.axialGood * axialResistance(s, i.Fy, 0).Pn, unit: "kip", ref: "AASHTO 6.15.3.1" });
        add({ id: "wing-pile-geo", name: "End pile with the wingwall's weight: geotechnical axial", demand: PuEnd, capacity: i.phiDyn * (n <= 3 ? 0.8 : 1) * i.Rn, unit: "kip", ref: "AASHTO 10.5.5.2.3" });
      } else if (i.type === "integral-shafts") add({ id: "wing-shaft-geo", name: "End shaft with the wingwall's weight: axial resistance", demand: PuEnd, capacity: i.phiDyn * i.Rn, unit: "kip", ref: "AASHTO 10.8.3.5" });
      const AsFace = ((BARS[i.diaphragmBars.bar].area * 12) / i.diaphragmBars.spacing) * i.totalDepth;
      const endIdx = beam.xs.indexOf(supports[0]);
      const end = wingEnd({ name: "Cap and diaphragm at the wingwall", b, h, AsFace, dFace: b - 2 - BARS[i.diaphragmBars.bar].dia / 2, MrX: Math.min(Mr(asTop), Mr(asBot)), AsLong: asTop + asBot + 2 * AsFace, mx0: endIdx >= 0 ? beam.M[endIdx] : 0, Vu: beam.Vmax, Vc, dv, stirrup: i.stirrup, torsion: true });
      // The thrust's part square to the abutment, P sin θ, pushes the cap and diaphragm's end past the exterior girder,
      // which carries it into the superstructure (with the other end's, a couple the deck takes in its plane): the end a
      // horizontal cantilever from that girder, with the wingwall's My and the passive pressure on it, the tension
      // P cos θ along it, and the cap's own moment there; the diaphragm's face bars, and the corner bars by how far they
      // run past the girder against their ℓd (their stress in proportion, as 5.10.8.1 develops a bar). Its shear across
      // the cap's width, the concrete alone (5.7.3.3, β 2).
      let push: { a: number; Hu: number; pOh: number; Mu: number; Vu: number; AsF: number; past: number; ld: number; kC: number; aF: number; MrF: number; PrF: number; Mx: number; value: number; dvH: number; VcH: number } | null = null;
      if (end && sq && sq.sin > 1e-6) {
        const a = Math.max(0, girders[0]); // ft, the cap's end to the exterior girder
        const pOh = 1.35 * 0.5 * Kp * (i.backfillGamma / 1000) * i.totalDepth ** 2; // kip/ft along the abutment, the whole height
        const Mu = end.Myu + sq.Hu * a + (pOh * a * a) / 2;
        const Vu = sq.Hu + pOh * a;
        const ld = wing!.connection.dev.required; // in
        const past = Math.max(0, wing!.connection.legAb - a * 12); // in, the corner bars past the girder
        const kC = Math.min(1, past / ld);
        const AsF = AsFace + kC * end.AsCorner;
        const aF = (AsF * i.fy) / (0.85 * i.fc * h);
        const MrF = (0.9 * AsF * i.fy * (end.dFace - aF / 2)) / 12;
        const PrF = 0.9 * (asTop + asBot + 2 * AsFace + kC * end.AsCorner) * i.fy;
        const gIdx = beam.xs.reduce((best, x, k) => (Math.abs(x - a) < Math.abs(beam.xs[best] - a) ? k : best), 0);
        const Mx = end.Mxu - Math.abs(end.mx0) + Math.abs(beam.M[gIdx] ?? 0);
        const value = end.Nu / PrF + Mu / MrF + Mx / Math.min(Mr(asTop), Mr(asBot));
        add({ id: "wing-push", name: `Cap and diaphragm's end at the exterior girder: the wingwall's push ${sq.Hu.toFixed(1)} kip square to the abutment ${a.toFixed(2)} ft out, with its My, the passive pressure and the tension ${end.Nu.toFixed(1)} kip`, demand: value, capacity: 1, unit: "", ref: "AASHTO 3.11.5.4, 5.6.2, 5.6.3.2 (linear interaction)" });
        const dvH = Math.max(0.9 * end.dFace, 0.72 * b);
        const VcH = 0.0316 * 2 * Math.sqrt(i.fc) * h * dvH;
        add({ id: "wing-push-shear", name: "Cap and diaphragm's end at the exterior girder: shear from the wingwall's push and the passive pressure", demand: Vu, capacity: 0.9 * Math.min(VcH, 0.25 * i.fc * h * dvH), unit: "kip", ref: "AASHTO 5.7.3.3 (β 2, the concrete)" });
        push = { a, Hu: sq.Hu, pOh, Mu, Vu, AsF, past, ld, kC, aF, MrF, PrF, Mx, value, dvH, VcH };
      }
      wingOut = { Pw, PuEnd, lever, end, push };
    }
    return { capW, apr, aprDW, aprLL, n, Pu, Ps, supports, girders, beam, foundation, delta, Kp, pBottom, Mdia, Pg, factoredStrength, service, wCap, dCap, asTop, asBot, dv, rowsMP, steelEnds, wing: wingOut, construction };
  }

  function seatDesign() {
    // Per foot of abutment.
    const perFt = (v: number) => v / i.length;
    const Hs = i.stemH;
    const Hb = i.backwallH;
    const H = i.footT + Hs + Hb;
    const B = i.toe + i.stemT + i.heel;
    const g = i.backfillGamma / 1000;
    const phiS = rad(i.backfillPhi);
    const K = i.pressure === "at-rest" ? 1 - Math.sin(phiS) : Math.tan(rad(45 - i.backfillPhi / 2)) ** 2;
    const gEH = i.pressure === "at-rest" ? { max: 1.35, min: 0.9 } : { max: 1.5, min: 0.9 };
    // Forces per foot, moments about the toe (x from the toe).
    const xStem = i.toe + i.stemT / 2;
    const xBack = i.toe + i.stemT - i.backwallT / 2;
    // The bearings toward the span from the stem's centerline; the approach slab on the backwall (seat) or the
    // end diaphragm (semi-integral, on the bearings).
    const ecc = i.bearingEcc ?? (i.type === "seat" ? i.backwallT / 2 : 0);
    const xBear = xStem - ecc;
    const items = {
      stem: { V: i.gammaC * i.stemT * Hs, x: xStem },
      backwall: { V: i.gammaC * i.backwallT * Hb, x: xBack },
      footing: { V: i.gammaC * B * i.footT, x: B / 2 },
      soil: { V: g * i.heel * (Hs + Hb), x: i.toe + i.stemT + i.heel / 2 },
      DC: { V: perFt(totalGirderR.DC) + 0.5 * i.approachDC, x: (perFt(totalGirderR.DC) * xBear + 0.5 * i.approachDC * (i.type === "seat" ? xBack : xBear)) / Math.max(1e-9, perFt(totalGirderR.DC) + 0.5 * i.approachDC) },
      DW: { V: perFt(totalGirderR.DW), x: xBear },
      LL: { V: perFt(totalGirderR.LL), x: xBear },
      // The approach slab's wearing surface and lane load, half on the abutment where its DC is.
      apDW: { V: 0.5 * (i.approachDW ?? 0), x: i.type === "seat" ? xBack : xBear },
      apLL: { V: 0.5 * (i.approachLL ?? 0), x: i.type === "seat" ? xBack : xBear },
      // The wingwalls' weight, spread along the abutment, at their middle behind the stem (DC).
      wings: { V: wing ? perFt(nWing * wing.wall.Vs) : 0, x: i.toe + i.stemT + (wingIn ? (wingIn.L / 2) * Math.cos(rad(Math.abs(i.skew))) : 0) },
    };
    const EH = 0.5 * K * g * H * H; // kip/ft at H/3
    // Live load surcharge (3.11.6.4.1): Δp = K γs heq, heq for the abutment's height from the backfill's surface to the
    // footing's bottom (Table 3.11.6.4.1-1); horizontally over the whole height at H/2, and vertically on the heel for
    // bearing only (it helps against sliding and overturning, C11.5.6). 3.11.6.5: none where an approach slab on the
    // backwall carries the traffic (CDOT BDM 11.3: ignored where an approach slab is provided), by default when one is given.
    const heqW = (i.lsOmit ?? i.approachDC > 0) ? 0 : heqAbutment(H);
    const dpLS = K * g * heqW; // ksf
    const LSh = dpLS * H; // kip/ft at H/2
    const LSv = g * heqW * i.heel; // kip/ft on the heel
    const BR = perFt(i.braking);
    const yBR = i.footT + Hs + (i.type === "semi-integral" ? Hb : 0);
    // The force along the bridge at the bearings: braking with the live load's factor, or the wind along the bridge's
    // Strength V (1.35 BR + WS + WL) or III (WS) where larger, taken with Strength I's other loads; Service I adds its wind.
    const wl = i.windLong ?? null;
    const lonU = Math.max(1.75 * BR, wl ? perFt(1.35 * i.braking + wl.WS5 + wl.WL) : 0, wl ? perFt(wl.WS3) : 0);
    const lonS = BR + (wl ? perFt(wl.WSs) : 0);
    const lonF = (c: { name: string }) => (c.name.startsWith("Service") ? lonS : lonU);
    const TU = i.bearingShear;
    // Strength I, two sets: the most vertical (bearing) and the least (sliding, eccentricity).
    const combos = [
      // br: braking with the live load's factor; kept in the minimum set (it pushes the abutment, though the vertical live load
      // that helps is left off), the conservative choice.
      { name: "Strength I, maximum", dc: 1.25, dw: 1.5, ev: 1.35, eh: gEH.max, ll: 1.75, br: 1.75, tu: 0.5, ls: 1.75, lsv: 1.75 },
      { name: "Strength I, minimum", dc: 0.9, dw: 0.65, ev: 1.0, eh: gEH.max, ll: 0, br: 1.75, tu: 0.5, ls: 1.75, lsv: 0 },
      { name: "Service I", dc: 1, dw: 1, ev: 1, eh: 1, ll: 1, br: 1, tu: 1, ls: 1, lsv: 1 },
    ];
    // The wingwalls' thrusts square to the abutment (P sin θ at their ends, already factored in Section B): two push
    // opposite ways, a couple T = P sin θ · L about the vertical axis; one is a net force F = P sin θ, off the middle by
    // L/2, with its My: T = F L/2 + My. On piles, the group shares the couple elastically, linear along it (6T/L² per
    // foot at the ends, Σx² of the piles along the abutment): the piles are checked for the end strip, q = F/L + 6T/L²
    // per foot at the thrust's height. A spread footing takes the net force with the earth pressure and the couple by
    // friction (the sliding check with the twist, below).
    const L = i.length;
    const onPiles = i.foundation !== "footing";
    const wingT = (P: number, My: number) => (!sq || sq.sin < 1e-6 ? 0 : nWing === 2 ? P * sq.sin * L : (P * sq.sin * L) / 2 + My);
    const wingF = (P: number) => (!sq || sq.sin < 1e-6 || nWing === 2 ? 0 : P * sq.sin);
    const wingQ = (P: number, My: number) => wingF(P) / L + (onPiles ? (6 * wingT(P, My)) / L ** 2 : 0);
    const qWu = sq ? wingQ(sq.Pu, sq.Myu) : 0;
    const qWs = sq ? wingQ(sq.Ps, sq.Mys) : 0;
    const yWu = i.footT + (sq?.yu ?? 0);
    const yWs = i.footT + (sq?.ys ?? 0);
    const endStrip = qWu > 0 ? ", with the wingwall's push" : "";
    const rows = combos.map((c) => {
      const V = c.dc * (items.stem.V + items.backwall.V + items.footing.V + items.DC.V + items.wings.V) + c.dw * (items.DW.V + items.apDW.V) + c.ev * items.soil.V + c.ll * (items.LL.V + items.apLL.V) + c.lsv * LSv;
      const Mr = c.dc * (items.stem.V * items.stem.x + items.backwall.V * items.backwall.x + items.footing.V * items.footing.x + items.DC.V * items.DC.x + items.wings.V * items.wings.x) + c.dw * (items.DW.V * items.DW.x + items.apDW.V * items.apDW.x) + c.ev * items.soil.V * items.soil.x + c.ll * (items.LL.V * items.LL.x + items.apLL.V * items.apLL.x) + c.lsv * LSv * items.soil.x;
      const sv = c.name.startsWith("Service");
      const qW = sv ? qWs : qWu;
      const Hh = c.eh * EH + lonF(c) + c.tu * TU + c.ls * LSh + qW;
      const Mo = c.eh * EH * (H / 3) + lonF(c) * yBR + c.tu * TU * yBR + c.ls * LSh * (H / 2) + qW * (sv ? yWs : yWu);
      const xR = (Mr - Mo) / V;
      const e = B / 2 - xR;
      return { c, V, Mr, Mo, Hh, xR, e };
    });
    const strength = rows.filter((r) => r.c.name.startsWith("Strength"));
    const worstE = strength.reduce((a, b) => (Math.abs(b.e) > Math.abs(a.e) ? b : a));
    // The wingwalls' weight along the abutment: the footing (or pile cap) is rigid (AASHTO 10.6.1.3, 5.12.8.4), so two
    // wingwalls balance and their weight is spread evenly along it (above). One alone is off the middle by L/2 plus
    // its centroid's reach past the end along the abutment, (Lw/2) sin θ: a moment along the abutment, by B′ × L′ on a
    // footing (10.6.1.3) and P/n ± M x/Σx² on a pile group, the end piles the most.
    const oneWing = wing && wingIn && nWing === 1 ? wing.wall.Vs : 0; // kip, unfactored
    const leverL = L / 2 + (wingIn ? (wingIn.L / 2) * Math.sin(rad(Math.min(89, Math.abs(i.skew)))) : 0); // ft
    const Mlong = (c: (typeof combos)[number]) => c.dc * oneWing * leverL; // kip·ft, about the middle
    const alongL = (s: number) => {
      const n = Math.max(2, Math.round(L / s));
      const xs = Array.from({ length: n }, (_, k) => (k - (n - 1) / 2) * s);
      return { n, xmax: xs[n - 1], S2: xs.reduce((t, x) => t + x * x, 0) };
    };
    let endWing: { W: number; lever: number; M: number; eL?: number; Lp?: number; dP?: number; P?: number; R?: number; n?: number; xmax?: number; S2?: number; rows?: number } | null = null;
    let footing: null | { qeq: number; qR: number; slide: number; RR: number; nb: ReturnType<typeof nominalBearing>; twist: { T: number; k: number; RT: number } | null } = null;
    let piles: null | { Pfront: number; Pback: number; Hp: number; inter: ReturnType<typeof interaction>; lat: ReturnType<typeof analyzeLateral> } = null;
    let micropiles: null | { rows: { x: number; batter: number; P: number[] }[]; s: number; H: number; Pmax: number; Pmin: number; result: ReturnType<typeof designMicropile>; forceOf: (r: (typeof rows)[number]) => number[]; plate: number; mpIn: MicropileInputs; xc: number; S2: number; perRow: number; onRows: ReturnType<typeof footingOnRows> | null } = null;
    if (i.foundation === "micropiles") {
      // Rows of micropiles under the footing, a rigid cap (FHWA GEC 12 9.8, FHWA NHI-05-039 Sample Problem 1): per foot of
      // abutment, each row's share P/n ± M·(xc − x)/Σ(x − xc)² of the load and its moment about the group's centroid, times
      // the micropiles' spacing along the abutment, along a battered row's axis by 1/cos. The shear spread over all the
      // micropiles, the batter's help not counted (conservative); each micropile by the Micropile design (AASHTO 10.9)
      // with the group's p-multipliers across the rows (AASHTO Table 10.7.2.4-1).
      const list = (i.mpRowList ?? []).filter((r) => r.x >= 0 && r.x <= B).sort((a, b) => a.x - b.x);
      const xs = list.map((r) => r.x);
      if (!xs.length) throw new DesignError("Give the micropile rows' positions from the toe.");
      const perRow = Math.max(1, Math.round(i.mpPerRow ?? 1));
      const s = i.length / perRow; // ft of abutment per micropile in a row
      const nr = xs.length;
      const xc = xs.reduce((t, x) => t + x, 0) / nr;
      const S2 = xs.reduce((t, x) => t + (x - xc) ** 2, 0);
      const batter = (k: number) => rad(list[k].batter ?? 0);
      const forces = (r: (typeof rows)[number]) => xs.map((x, k) => ((r.V / nr + (S2 > 0 ? (r.V * (xc - r.xR) * (xc - x)) / S2 : 0)) * s) / Math.cos(batter(k)));
      const mp: MicropileInputs = { ...MICROPILE_DEFAULTS, ...i.micropile };
      const service = rows.filter((r) => r.c.name.startsWith("Service"));
      const all = strength.map((r) => ({ r, P: forces(r) }));
      const Pmax = Math.max(...all.flatMap((a) => a.P));
      const Pmin = Math.min(...all.flatMap((a) => a.P));
      const H = (strength[0].Hh * i.length) / (nr * perRow);
      const ratio = nr > 1 ? (Math.min(...xs.slice(1).map((x, k) => x - xs[k])) * 12) / mp.casingOD : 99;
      const pms = xs.map((_, k) => (nr === 1 ? (ratio <= 5 ? pMultiplier(1, ratio) : 1) : pMultiplier(k + 1, ratio)));
      const sv = service.map((r) => Math.max(...forces(r)));
      const mpIn: MicropileInputs = {
        ...mp,
        spacing: Math.min(s, nr > 1 ? Math.min(...xs.slice(1).map((x, k) => x - xs[k])) : 99),
        groupPm: nr * perRow > 1 ? { avg: pms.reduce((t, v) => t + v, 0) / pms.length, lead: Math.max(...pms) } : null,
        capFc: i.fc,
        cases: [
          ...all.map((a) => ({ name: a.r.c.name, limit: "strength" as const, compression: Math.max(0, Math.max(...a.P)), tension: Math.max(0, -Math.min(...a.P)), H })),
          ...service.map((r, k) => ({ name: r.c.name, limit: "service" as const, compression: Math.max(0, sv[k]), tension: 0, H: (r.Hh * i.length) / (nr * perRow) })),
        ],
      };
      const result = designMicropile(mpIn);
      for (const ch of result.checks) checks.push({ ...ch, id: `mp-${ch.id}`, name: `Micropile: ${ch.name}` });
      if (Pmin < 0 && strength.every((r) => r.V < 0)) add({ id: "mp-group-uplift", name: "The group in uplift", demand: -Pmin, capacity: 0.5 * result.Rs, unit: "kip", ref: "AASHTO 10.7.3.11" });
      micropileResult = result;
      if (oneWing > 0) {
        const g = alongL(s);
        const worst = all.reduce((a, b) => (Math.max(...b.P) > Math.max(...a.P) ? b : a));
        const M = Mlong(worst.r.c);
        const dP = (M * g.xmax) / (nr * g.S2);
        const P = Math.max(...worst.P) + dP;
        const R = Math.min(...result.checks.filter((c) => /^(bond-comp|cased-comp|uncased-comp)$/.test(c.id)).map((c) => c.capacity));
        add({ id: "wing-pile-end", name: "End micropile with the one wingwall's weight off the middle: compression", demand: P, capacity: R, unit: "kip", ref: "AASHTO 10.9.3.5, 10.9.3.10 (a rigid cap)" });
        endWing = { W: oneWing, lever: leverL, M, dP, P, R, ...g, rows: nr };
      }
      micropiles = { rows: xs.map((x, k) => ({ x, batter: list[k].batter ?? 0, P: all.map((a) => a.P[k]) })), s, H, Pmax, Pmin, result, forceOf: forces, plate: mp.plate?.size ?? mp.casingOD, mpIn, xc, S2, perRow, onRows: null as ReturnType<typeof footingOnRows> | null };
    } else if (i.foundation === "footing") {
      add({ id: "ecc", name: `Eccentricity (${worstE.c.name}${endStrip})`, demand: Math.abs(worstE.e), capacity: B / 3, unit: "ft", ref: "AASHTO 10.6.3.3, 11.6.3.3" });
      const bmax = strength[0];
      const Bp = Math.max(0.01, B - 2 * Math.abs(bmax.e));
      const nb = nominalBearing({ c: i.c, phi: i.phi, gammaAbove: i.backfillGamma, gammaBelow: i.gammaBelow, Df: i.Df, Dw: i.Dw, B: Bp, L: 1e6, depthFactor: false });
      let qeq = bmax.V / Bp;
      if (oneWing > 0) {
        const M = Mlong(bmax.c);
        const eL = M / (bmax.V * L);
        const Lp = L - 2 * eL;
        qeq = (bmax.V * L) / (Bp * Lp);
        const eMax = Math.max(...strength.map((r) => Mlong(r.c) / (r.V * L)));
        add({ id: "wing-ecc-long", name: "Eccentricity along the abutment from the one wingwall's weight", demand: eMax, capacity: L / 3, unit: "ft", ref: "AASHTO 10.6.3.3, 11.6.3.3" });
        endWing = { W: oneWing, lever: leverL, M, eL, Lp };
      }
      add({ id: "bearing", name: `Bearing on B′${oneWing > 0 ? " × L′" : ""} (${bmax.c.name}${endStrip})`, demand: qeq, capacity: i.phiB * nb.qn, unit: "ksf", ref: "AASHTO 10.6.3.1.2a, 11.6.3.2" });
      const smin = strength[1];
      const RR = i.phiTau * smin.V * Math.tan(rad(i.phi));
      add({ id: "sliding", name: `Sliding (${smin.c.name}${endStrip})`, demand: smin.Hh, capacity: RR, unit: "kip/ft", ref: "AASHTO 10.6.3.4, 11.6.3.6" });
      // One wingwall alone also pushes the abutment along its length by P cos θ (two balance): with the force across it,
      // their resultant per foot against the same friction.
      if (sq && wing && nWing === 1) {
        const along = (sq.Pu * sq.cos) / L;
        add({ id: "wing-slide-along", name: `Sliding with the one wingwall's push along the abutment, ${(sq.Pu * sq.cos).toFixed(1)} kip (${smin.c.name})`, demand: Math.hypot(smin.Hh, along), capacity: RR, unit: "kip/ft", ref: "AASHTO 10.6.3.4" });
      }
      // Sliding with the wingwalls' twist: the footing slides and turns as a rigid body, the friction at its limit RR per
      // foot everywhere, reversed over a length x at one end; that length's couple r x (L − x) takes T, and what is left,
      // RR √(1 − 4T/(RR L²)) per foot on average, the sliding force (a rigid-plastic base).
      if (sq && sq.sin > 1e-6) {
        const T = wingT(sq.Pu, sq.Myu);
        const k = 1 - (4 * T) / (RR * L * L);
        const RT = k > 0 ? RR * Math.sqrt(k) : 0;
        add({ id: "wing-twist", name: `Sliding with the wingwalls' twist ${T.toFixed(0)} kip·ft (${smin.c.name})`, demand: smin.Hh, capacity: RT, unit: "kip/ft", ref: "AASHTO 10.6.3.4 (friction, a rigid footing)" });
        footing = { qeq, qR: i.phiB * nb.qn, slide: smin.Hh, RR, nb, twist: { T, k, RT } };
      } else footing = { qeq, qR: i.phiB * nb.qn, slide: smin.Hh, RR, nb, twist: null };
    } else {
      const s = HP_SECTIONS[i.section];
      if (!s) throw new DesignError("Choose an H-pile section.");
      const xf = i.rowFront;
      const xb = i.rowBack;
      const xc = (xf + xb) / 2;
      const r = strength[0];
      const Mc = r.V * (xc - r.xR); // about the group's center
      const half = (xb - xf) / 2;
      const perRow = (sign: number) => (r.V / 2 + (sign * Mc) / (2 * half)) * i.pileSpacing;
      const Pfront = perRow(1);
      const Pback = perRow(-1);
      add({ id: "pile-geo", name: "Front row pile: geotechnical axial", demand: Math.max(Pfront, Pback), capacity: i.phiDyn * i.Rn, unit: "kip", ref: "AASHTO 10.5.5.2.3" });
      if (oneWing > 0) {
        const g = alongL(i.pileSpacing);
        const M = Mlong(r.c);
        const dP = (M * g.xmax) / (2 * g.S2); // two rows
        const P = Math.max(Pfront, Pback) + dP;
        add({ id: "wing-pile-end", name: "End pile with the one wingwall's weight off the middle: geotechnical axial", demand: P, capacity: i.phiDyn * i.Rn, unit: "kip", ref: "AASHTO 10.5.5.2.3, 10.7.1 (a rigid cap)" });
        endWing = { W: oneWing, lever: leverL, M, dP, P, R: i.phiDyn * i.Rn, ...g, rows: 2 };
      }
      if (Math.min(Pfront, Pback) < 0) add({ id: "pile-uplift", name: "Back row pile in uplift: check it against the uplift resistance from the geotechnical report", demand: -Math.min(Pfront, Pback), capacity: 0, unit: "kip", ref: "AASHTO 10.7.3.10", advisory: true });
      const Hp = (r.Hh * i.pileSpacing) / 2;
      const ratio = ((xb - xf) * 12) / s.bf;
      const pm = (pMultiplier(1, ratio) + pMultiplier(2, ratio)) / 2;
      // The piles bend under the earth pressure along the bridge, the head fixed in the footing; about their weak axis
      // unless set strong (`seatPileAxis`): neither AASHTO nor the CDOT BDM sets a seat abutment's pile orientation, so
      // the weak axis is the default (the conservative choice; the owner's rule, 2026-11-20).
      const strong = i.seatPileAxis === "strong";
      const lat = analyzeLateral({ length: i.pileLength, D: strong ? s.bf : s.d, EI: 29000 * (strong ? s.Ix : s.Iy), Q: Math.max(Pfront, Pback), pm, head: { kind: "fixed", H: Hp }, layers: toLayers(i.soil) });
      const ax = axialResistance(s, i.Fy, 0);
      const fxx = flexuralResistance(s, i.Fy, strong ? "x" : "y");
      const inter = strong ? interaction(Math.max(Pfront, Pback), PHI_PILE.combinedAxial * ax.Pn, lat.Mmax * 12, fxx.Mn, 0, 1, fxx.compact) : interaction(Math.max(Pfront, Pback), PHI_PILE.combinedAxial * ax.Pn, 0, 1, lat.Mmax * 12, fxx.Mn, fxx.compact);
      add({ id: "pile-interaction", name: `Pile: axial with flexure (${strong ? "strong" : "weak"} axis)`, demand: inter.value, capacity: 1, unit: "", ref: `AASHTO 6.15.3.2, Eq. ${inter.eq}` });
      piles = { Pfront, Pback, Hp, inter, lat };
    }
    // The stem at the footing's top: earth over Hs + Hb, braking and the bearings' shear at the seat.
    const Hst = Hs + Hb;
    // The vertical loads' moment about the stem's base (+ toward the span, adding to the earth's): the girders' reactions at
    // the bearings (the LL with IM, the stem being above ground, AASHTO 3.6.2.1), the approach slab and the backwall
    // where they sit; a load behind the centerline relieves and takes the minimum factor (0.9).
    const arm = (x: number) => xStem - x;
    const vertM = (gDC: number, gDW: number, gLL: number) => {
      const dc = (gx: number, V: number, x: number) => (arm(x) >= 0 ? gx : Math.min(gx, 0.9)) * V * arm(x);
      // The approach slab's DW and lane load where its DC is (the lane load without IM, 3.6.2.1).
      const ap = (gx: number, V: number) => (arm(items.apDW.x) >= 0 ? gx : 0) * V * arm(items.apDW.x);
      return dc(gDC, perFt(totalGirderR.DC), xBear) + dc(gDC, 0.5 * i.approachDC, i.type === "seat" ? xBack : xBear) + dc(gDC, items.backwall.V, xBack) + gDW * perFt(totalGirderR.DW) * arm(xBear) + gLL * perFt(totalGirderR.LL) * (1 + i.IM) * arm(xBear) + ap(gDW, items.apDW.V) + ap(gLL, items.apLL.V);
    };
    const MstemV = vertM(1.25, 1.5, 1.75);
    const MstemVs = vertM(1, 1, 1);
    const Mstem = gEH.max * K * g * Hst ** 3 / 6 + lonU * (yBR - i.footT) + 0.5 * TU * (yBR - i.footT) + (1.75 * dpLS * Hst ** 2) / 2 + MstemV;
    const Mstem_s = K * g * Hst ** 3 / 6 + lonS * (yBR - i.footT) + TU * (yBR - i.footT) + (dpLS * Hst ** 2) / 2 + MstemVs;
    const Vstem = gEH.max * 0.5 * K * g * Hst ** 2 + lonU + 0.5 * TU + 1.75 * dpLS * Hst;
    const fs = flexure({ ...common, Mu: Mstem, Ms: Mstem_s, h: i.stemT * 12, cover: wallCover, bars: i.stemBars });
    add({ id: "stem-flex", name: "Stem: flexure at the footing", demand: Mstem, capacity: fs.MR, unit: "kip·ft/ft", ref: "AASHTO 5.6.3.2" });
    add({ id: "stem-min", name: "Stem: minimum reinforcement", demand: fs.minRequired, capacity: fs.MR, unit: "kip·ft/ft", ref: "AASHTO 5.6.3.3" });
    add({ id: "stem-crack", name: "Stem: crack control (spacing)", demand: i.stemBars.spacing, capacity: fs.sMax, unit: "in", ref: "AASHTO 5.6.7" });
    const dvS = dvOf(fs, i.stemT * 12);
    add({ id: "stem-shear", name: "Stem: shear at the footing", demand: Vstem, capacity: 0.9 * 0.0316 * 2 * Math.sqrt(i.fc) * 12 * dvS, unit: "kip/ft", ref: "AASHTO 5.7.3.3" });
    // The wingwalls on the stem's ends (their Section B): the stem's end section, its horizontal bars each face over its
    // height taking the tension and My; Mx is in the wall's own plane (as deep as the wall), not checked; the wingwall's
    // weight's torsion against the threshold (a wall has no closed stirrups to take more).
    const sh = i.stemHorizBars ?? { bar: 5, spacing: 12 };
    const AsFaceS = ((BARS[sh.bar].area * 12) / sh.spacing) * Hs;
    const wingStem = wingEnd({ name: "Stem at the wingwall", b: i.stemT * 12, h: Hs * 12, AsFace: AsFaceS, dFace: i.stemT * 12 - wallCover - BARS[sh.bar].dia / 2, MrX: null, AsLong: 2 * AsFaceS, mx0: 0, Vu: 0, Vc: 0, dv: 1, stirrup: null, torsion: false });
    // The wingwall's push square to the abutment, P sin θ at height y on the stem's end, toward the span at one corner
    // (with the earth pressure): spread at 45° down to the footing one way (the end is free), over a width y at the
    // base, it adds P sin θ · y / y = P sin θ per foot to the stem's moment there, and P sin θ / y to its shear.
    // Where the stem's own bars fall short there, added back-face bars at its ends (stemEndBars): between the main bars
    // (at their spacing) over the spread width from each wingwall's end, hooked into the footing like them; the smallest
    // that's enough when not given (null: none).
    let stemPush: { Hu: number; y: number; dM: number; dV: number; end: StemEndBars | null; As: number; MR: number; MsEnd: number; sAt: number; sMax: number; fss: number } | null = null;
    if (sq && sq.sin > 1e-6) {
      const y = Math.min(Hst, Math.max(1, sq.yu));
      const dM = sq.Hu;
      const dV = sq.Hu / y;
      const Mu = Mstem + dM;
      const withEnd = (bar: number | null) => {
        const As = fs.As + (bar ? (BARS[bar].area * 12) / i.stemBars.spacing : 0);
        const a = (As * i.fy) / (0.85 * i.fc * 12);
        return { As, MR: (0.9 * As * i.fy * (fs.de - a / 2)) / 12 };
      };
      const given = i.stemEndBars?.bar;
      const auto = i.stemEndBars !== null && (given === undefined || given < 0);
      let bar: number | null = auto ? null : given && given > 0 ? given : null;
      if (auto && withEnd(null).MR < Mu) bar = [4, 5, 6, 7, 8, 9, 10, 11].find((b) => withEnd(b).MR >= Mu) ?? 11;
      const end: StemEndBars | null = bar ? { bar, spacing: i.stemBars.spacing, width: i.stemEndBars?.width || Math.ceil(y), ends: nWing, auto } : null;
      const { As, MR } = withEnd(end && end.width >= y - 1e-9 ? end.bar : null);
      add({ id: "wing-push-stem", name: `Stem's end at the wingwall: flexure at the footing with the wingwall's push ${sq.Hu.toFixed(1)} kip square to it${end ? `, with #${end.bar} added between the bars over ${end.width} ft` : ""}`, demand: Mu, capacity: MR, unit: "kip·ft/ft", ref: "AASHTO 5.6.3.2" });
      if (end && end.width < y - 1e-9) add({ id: "wing-push-stem-width", name: "Stem's end bars: over the push's spread width at the base", demand: y, capacity: end.width, unit: "ft", ref: "AASHTO 5.6.3.2 (45° spread)" });
      add({ id: "wing-push-stem-shear", name: "Stem's end at the wingwall: shear at the footing with the wingwall's push", demand: Vstem + dV, capacity: 0.9 * 0.0316 * 2 * Math.sqrt(i.fc) * 12 * dvS, unit: "kip/ft", ref: "AASHTO 5.7.3.3" });
      // Crack control at the end (5.6.7), Service I with the push (P sin θ per foot, as at strength): the steel there as
      // the main bars at the spacing that gives its area; against the clear spacing of the bars there (halved where the
      // added ones sit between them).
      const MsEnd = Mstem_s + sq.Hs;
      const sEq = (BARS[i.stemBars.bar].area * 12) / As;
      const fe = flexure({ ...common, Mu, Ms: MsEnd, h: i.stemT * 12, cover: wallCover, bars: { bar: i.stemBars.bar, spacing: sEq } });
      const sAt = end && end.width >= y - 1e-9 ? i.stemBars.spacing / 2 : i.stemBars.spacing;
      add({ id: "wing-push-stem-crack", name: "Stem's end at the wingwall: crack control with the push (Service I)", demand: sAt, capacity: fe.sMax, unit: "in", ref: "AASHTO 5.6.7" });
      stemPush = { Hu: sq.Hu, y, dM, dV, end, As, MR, MsEnd, sAt, sMax: fe.sMax, fss: fe.fss };
    }
    const wingPush = sq && sq.sin > 1e-6 ? { qWu, qWs, yWu, yWs, stem: stemPush, sin: sq.sin, Pu: sq.Pu, Ps: sq.Ps, Hu: sq.Hu, Hs: sq.Hs, Myu: sq.Myu, Mys: sq.Mys, Tu: wingT(sq.Pu, sq.Myu), Ts: wingT(sq.Ps, sq.Mys), onPiles, nWing } : null;
    // The backwall (seat type, BDM 11.3.3), a cantilever from the seat per foot: earth pressure at H/3 (3.11.5), the
    // live load surcharge at H/2 with heq by its own height (3.11.6.4, Table 3.11.6.4-1), and the trucks' axles in every
    // lane on its top (with IM and the multiple presence factor, 3.6.1.1.2), eccentric to its centerline (as FHWA
    // NHI-04-041 Step 7.9); Strength I and V (LL and LS at 1.35), Service I for crack control.
    const MbwEH = (gEH.max * K * g * Hb ** 3) / 6; // the earth's share, Strength
    const REHbw = 0.5 * K * g * Hb ** 2;
    const heqBw = heqW; // the abutment's whole height (3.11.6.4.1)
    const RLSbw = dpLS * Hb;
    const lanesBw = Math.max(1, Math.floor(i.lanes ?? 1));
    const RLLbw = (presence(lanesBw) * lanesBw * (32 * (1 + i.IM) + 0.64 * 2)) / i.length; // kip/ft: a rear axle and 2 ft of lane in each lane
    const eLL = i.backwallLLecc ?? i.backwallT / 2;
    const bwMoment = (gLL: number, gEHx: number) => gLL * RLLbw * eLL + gEHx * REHbw * (Hb / 3) + gLL * RLSbw * (Hb / 2);
    const Mbw = Math.max(bwMoment(1.75, gEH.max), bwMoment(1.35, gEH.max));
    const MbwS = bwMoment(1.0, 1.0);
    const Vbw = gEH.max * REHbw + 1.75 * RLSbw;
    const fb = flexure({ ...common, Mu: Mbw, Ms: MbwS, h: i.backwallT * 12, cover: wallCover, bars: i.backwallBars });
    if (i.type !== "semi-integral") {
      add({ id: "backwall", name: `Backwall: flexure at the seat (earth, LS with heq ${heqBw.toFixed(2)} ft, the axles on its top)`, demand: Mbw, capacity: fb.MR, unit: "kip·ft/ft", ref: "AASHTO 5.6.3.2, 3.11.5, 3.11.6.4" });
      add({ id: "backwall-min", name: "Backwall: minimum reinforcement", demand: fb.minRequired, capacity: fb.MR, unit: "kip·ft/ft", ref: "AASHTO 5.6.3.3" });
      add({ id: "backwall-crack", name: "Backwall: crack control (spacing)", demand: i.backwallBars.spacing, capacity: fb.sMax, unit: "in", ref: "AASHTO 5.6.7" });
      const dvB = dvOf(fb, i.backwallT * 12);
      add({ id: "backwall-shear", name: "Backwall: shear at the seat", demand: Vbw, capacity: 0.9 * 0.0316 * 2 * Math.sqrt(i.fc) * 12 * dvB, unit: "kip/ft", ref: "AASHTO 5.7.3.3" });
      const hb = i.backwallHorizBars ?? { bar: 5, spacing: 12 };
      const bT = i.backwallT * 12;
      const hT = Hb * 12;
      const AsT = Math.min(0.6, Math.max(0.11, (1.3 * bT * hT) / (2 * (bT + hT) * i.fy)));
      add({ id: "backwall-horiz", name: `Backwall: horizontal bars #${hb.bar} @ ${hb.spacing} in each face, shrinkage and temperature`, demand: AsT, capacity: (BARS[hb.bar].area * 12) / hb.spacing, unit: "in²/ft", ref: "AASHTO 5.10.6" });
    }
    // The end diaphragm of a semi-integral abutment (BDM 11.3.2, Figure 11-3) rides on the bearings with the
    // superstructure: not a backwall fixed to the seat, but a beam between the girders. Its horizontal bars carry the
    // passive pressure as the bridge expands (3.11.5.4, spanning between girders like an integral diaphragm); for the
    // bearings' replacement it carries each girder to a jack either side (CDOT BDM 14.5.6 with 50- or 100-ton jacks;
    // AASHTO 3.4.3.1, 1.3 × the permanent reaction, no live load): its bottom bars and stirrups, the jack's rating,
    // the concrete under the jack (5.6.5) and the clear height for it; its vertical bars at least the shrinkage and
    // temperature steel (5.10.6).
    let semiOut: SemiResult | null = null;
    if (i.type === "semi-integral") {
      const sd = { ...SEMI_DEFAULTS, ...(i.semi ?? {}) };
      const Kp = Math.tan(rad(45 + i.backfillPhi / 2)) ** 2;
      const pBot = Kp * g * Hb; // ksf at the diaphragm's bottom
      const Mpass = (1.35 * pBot * i.girderSpacing ** 2) / 10; // kip·ft per ft of height
      const fh = flexure({ ...common, Mu: Mpass, Ms: Mpass / 1.35, h: i.backwallT * 12, cover: wallCover, bars: sd.horiz });
      add({ id: "semi-pass", name: "End diaphragm: horizontal bars under passive pressure between girders", demand: Mpass, capacity: fh.MR, unit: "kip·ft/ft", ref: "AASHTO 3.11.5.4, 5.6.3.2; CDOT BDM 11.3.2" });
      // Jacking: each girder's permanent reaction × 1.3 to two jacks at ±a from it; the diaphragm a beam between them.
      const Rj = 1.3 * (i.RDC + i.RDW);
      const P = Rj / 2;
      const a = sd.jackOffset * 12; // in
      const Mj = (P * a) / 12; // kip·ft
      const b = i.backwallT * 12;
      const h = Hb * 12;
      const As = sd.bottom.count * BARS[sd.bottom.bar].area;
      const d = h - i.cover - BARS[sd.stirrup.bar].dia - BARS[sd.bottom.bar].dia / 2;
      const aw = (As * i.fy) / (0.85 * i.fc * b);
      const MRj = (0.9 * As * i.fy * (d - aw / 2)) / 12;
      add({ id: "semi-jack-flex", name: `End diaphragm on the jacks: bottom bars ${sd.bottom.count} #${sd.bottom.bar} (each girder's ${Rj.toFixed(0)} kip to jacks ${sd.jackOffset} ft either side)`, demand: Mj, capacity: MRj, unit: "kip·ft", ref: "AASHTO 3.4.3.1, 5.6.3.2; CDOT BDM 14.5.6" });
      const dv = Math.max(0.9 * d, 0.72 * h);
      const Vc = 0.0316 * 2 * Math.sqrt(i.fc) * b * dv;
      const Vs = (sd.stirrup.legs * BARS[sd.stirrup.bar].area * i.fy * dv) / sd.stirrup.spacing;
      add({ id: "semi-jack-shear", name: `End diaphragm on the jacks: shear, #${sd.stirrup.bar} stirrups @ ${sd.stirrup.spacing} in${a < 2 * d ? " (a deep beam: the Strut-and-Tie tool for the detail)" : ""}`, demand: P, capacity: 0.9 * Math.min(Vc + Vs, 0.25 * i.fc * b * dv), unit: "kip", ref: "AASHTO 5.7.3.3" });
      const cap = sd.jackTons * 2; // kip
      add({ id: "semi-jack-rating", name: `Jack rating: ${sd.jackTons}-ton jacks (CDOT BDM 14.5.6)`, demand: P, capacity: cap, unit: "kip", ref: "CDOT BDM 14.5.6" });
      const jackD = sd.jackTons >= 100 ? 10 : 8; // in, CDOT's minimum sizes
      const jackH = sd.jackTons >= 100 ? 8 : 6;
      const A1 = (Math.PI * jackD ** 2) / 4;
      add({ id: "semi-jack-bearing", name: `Concrete bearing under a ${jackD} in jack`, demand: P, capacity: 0.7 * 0.85 * i.fc * A1, unit: "kip", ref: "AASHTO 5.6.5 (m = 1)" });
      add({ id: "semi-jack-clear", name: `Clear height under the diaphragm for a ${jackH} in jack and its cribbing`, demand: jackH + 1, capacity: sd.clear, unit: "in", ref: "CDOT BDM 14.5.6, Figure 11-3 (7 in min for 50-ton jacks)" });
      // Vertical bars, each face: the shrinkage and temperature minimum (5.10.6), As ≥ 1.30 b h / (2 (b + h) fy), 0.11 to 0.60 in²/ft.
      const Ast = Math.min(0.6, Math.max(0.11, (1.3 * b * h) / (2 * (b + h) * i.fy)));
      add({ id: "semi-vert-min", name: `End diaphragm: vertical bars #${sd.vert.bar} @ ${sd.vert.spacing} in each face, shrinkage and temperature`, demand: Ast, capacity: (BARS[sd.vert.bar].area * 12) / sd.vert.spacing, unit: "in²/ft", ref: "AASHTO 5.10.6" });
      add({ id: "semi-horiz-min", name: "End diaphragm: horizontal bars each face, shrinkage and temperature", demand: Ast, capacity: (BARS[sd.horiz.bar].area * 12) / sd.horiz.spacing, unit: "in²/ft", ref: "AASHTO 5.10.6" });
      // Steel girders (Figure 11-3 note 3): studs on each end carry its share of the bearings' shear and braking into the
      // diaphragm; the web keeps its net section at the through bars' holes.
      if (i.girderMaterial === "steel") {
        const se = { ...STEEL_ENDS_DEFAULTS, ...(i.steelEnds ?? {}) };
        const pull = i.bearingShear * i.length + 1.75 * i.braking;
        const perGirder = pull / i.nGirders;
        const Qr = 1.0 * 0.7 * ((Math.PI * se.studD ** 2) / 4) * se.studFu;
        add({ id: "semi-studs", name: `Steel girder ends: studs in the diaphragm, ${se.studs} – ${se.studD} in each girder (the bearings' shear and braking over ${i.nGirders} girders)`, demand: perGirder, capacity: se.studs * Qr, unit: "kip", ref: "AASHTO 6.10.10.4.3; CDOT BDM 11.3.2 (Fig. 11-3 note 3)" });
        const Vend = 1.25 * i.RDC + 1.5 * i.RDW + 1.75 * i.RLL * (1 + i.IM);
        add({ id: "semi-web-holes", name: `Steel girder ends: the web at the through bars' holes, ${se.holes} holes of ${se.holeD} in`, demand: Vend, capacity: 1.0 * 0.58 * se.Fyw * (se.D - se.holes * se.holeD) * se.tw, unit: "kip", ref: "AASHTO 6.10.9.2 (Vp on the net web)" });
      }
      semiOut = { ...sd, Kp, pBot, Mpass, Rj, P, Mj, MRj, d, dv, Vc, Vs, jackD, jackH, Ast };
    }

    // The seat width (4.7.4.4): N = (8 + 0.02 L + 0.08 H)(1 + 0.000125 S²) × the percentage of Table 4.7.4.4-1, H at an
    // abutment the average height of the columns to the next expansion joint (0 for a single span).
    if (i.type === "seat") {
      const N = (8 + 0.02 * i.unitLength + 0.08 * (i.seatH ?? 0)) * (1 + 0.000125 * i.skew ** 2) * ((i.seatPct ?? 100) / 100);
      add({ id: "seat", name: `Bearing seat width (H ${i.seatH ?? 0} ft, ${i.seatPct ?? 100}%)`, demand: N, capacity: i.seatWidth, unit: "in", ref: "AASHTO 4.7.4.4, Table 4.7.4.4-1" });
    }
    if (micropiles) {
      micropiles.onRows = footingOnRows(micropiles);
      return { H, B, K, EH, BR, rows, footing, piles, micropiles, Mstem, Vstem, Mbw, MbwEH, REHbw, RLSbw, RLLbw, heqBw, eLL, Vbw, heqW, dpLS, LSh, LSv, ecc, MstemV, MstemVs, Mtoe: 0, Mheel: 0, items, semi: semiOut, wingStem, wingPush, endWing };
    }
    // The footing (or pile cap) as cantilevers from the stem: the toe under the bearing pressure.
    const r0 = strength[0];
    const qToe = i.foundation === "footing" ? (() => {
      const e = r0.e;
      const q1 = Math.abs(e) <= B / 6 ? (r0.V / B) * (1 + (6 * e) / B) : (2 * r0.V) / (3 * (B / 2 - e));
      return q1;
    })() : 0;
    const Mtoe = i.foundation === "footing" ? (qToe * i.toe ** 2) / 2 - 1.25 * i.gammaC * i.footT * i.toe ** 2 / 2 : piles ? (piles.Pfront / i.pileSpacing) * Math.max(0, i.toe - i.rowFront) : 0;
    const ft = flexure({ ...common, Mu: Math.max(0, Mtoe), Ms: Math.max(0, Mtoe) / 1.4, h: i.footT * 12, cover: 3, bars: i.toeBars });
    add({ id: "toe", name: "Footing toe: flexure at the stem", demand: Math.max(0, Mtoe), capacity: ft.MR, unit: "kip·ft/ft", ref: "AASHTO 5.6.3.2" });
    const Mheel = 1.35 * g * (Hs + Hb) * i.heel ** 2 / 2 + 1.25 * i.gammaC * i.footT * i.heel ** 2 / 2 + (1.75 * g * heqW * i.heel ** 2) / 2; // with the surcharge on it (3.11.6.4.1)
    const fh = flexure({ ...common, Mu: Mheel, Ms: Mheel / 1.3, h: i.footT * 12, cover: 2, bars: i.heelBars });
    add({ id: "heel", name: "Footing heel: flexure at the stem (soil, footing and the live load surcharge, no pressure under it)", demand: Mheel, capacity: fh.MR, unit: "kip·ft/ft", ref: "AASHTO 5.6.3.2" });
    return { H, B, K, EH, BR, rows, footing, piles, micropiles, Mstem, Vstem, Mbw, MbwEH, REHbw, RLSbw, RLLbw, heqBw, eLL, Vbw, heqW, dpLS, LSh, LSv, ecc, MstemV, MstemVs, Mtoe, Mheel, items, semi: semiOut, wingStem, wingPush, endWing };

    /**
     * The footing across its width as a beam on the rows of micropiles (per foot of abutment): each row's reaction its
     * axial force's vertical part over its spacing along the abutment; the footing's weight and the soil on the heel
     * downward; the stem's load and moment between its vertical bars. A free body each side of the stem (the toe's from
     * the toe, the heel's from the heel) gives the moment at any section out to the stem's bars (the footing taken as
     * supported at the wall's vertical steel, not at its faces: the conservative choice), with no need of the stem's
     * share: the largest positive (bottom bars) and negative (top bars), and the shear at dv from each face
     * (5.12.8.6.1: a section's shear is the reactions beyond it). Then punching at the most loaded micropile
     * (5.12.8.6.3): its force on a perimeter at dv/2 round its bearing plate, cut by the footing's edge, dv the
     * concrete over the pile's head.
     */
    function footingOnRows(m: NonNullable<typeof micropiles>) {
      const barIn = (2 + BARS[i.stemBars.bar].dia / 2) / 12; // ft, the stem's vertical bars inside each face
      const x1 = i.toe + barIn;
      const x2 = i.toe + i.stemT - barIn;
      const hs = Hs + Hb;
      const at = (r: (typeof rows)[number], c: { dc: number; ev: number }) => {
        const R = m.forceOf(r).map((P, k) => ({ x: m.rows[k].x, R: (P * Math.cos(rad(m.rows[k].batter))) / m.s }));
        const wf = c.dc * i.gammaC * i.footT;
        const ws = c.ev * g * hs;
        // Positive: tension in the bottom bars.
        const Mleft = (x: number) => R.filter((q) => q.x < x).reduce((t, q) => t + q.R * (x - q.x), 0) - (wf * x * x) / 2;
        const Mright = (x: number) => R.filter((q) => q.x > x).reduce((t, q) => t + q.R * (q.x - x), 0) - (wf * (B - x) ** 2) / 2 - (ws * (B - x) ** 2) / 2;
        const Vleft = (x: number) => R.filter((q) => q.x < x).reduce((t, q) => t + q.R, 0) - wf * x;
        const Vright = (x: number) => R.filter((q) => q.x > x).reduce((t, q) => t + q.R, 0) - (wf + ws) * (B - x);
        const xs: number[] = [];
        for (let k = 0; k <= 20; k++) xs.push((x1 * k) / 20, x2 + ((B - x2) * k) / 20);
        const Ms = xs.map((x) => (x <= x1 + 1e-9 ? Mleft(x) : Mright(x)));
        const kPos = Ms.indexOf(Math.max(...Ms));
        const kNeg = Ms.indexOf(Math.min(...Ms));
        return { Mpos: Math.max(0, ...Ms), Mneg: Math.max(0, ...Ms.map((v) => -v)), Vleft, Vright, R, wf, ws, xPos: xs[kPos], xNeg: xs[kNeg] };
      };
      const sv = rows.filter((r) => r.c.name.startsWith("Service"));
      const st = strength.map((r) => ({ r, a: at(r, r.c) }));
      const se = sv.map((r) => at(r, r.c));
      const bot = st.reduce((p, q) => (q.a.Mpos > p.a.Mpos ? q : p));
      const top = st.reduce((p, q) => (q.a.Mneg > p.a.Mneg ? q : p));
      const MsBot = Math.max(0, ...se.map((x) => x.Mpos));
      const MsTop = Math.max(0, ...se.map((x) => x.Mneg));
      const fb = flexure({ ...common, Mu: bot.a.Mpos, Ms: MsBot, h: i.footT * 12, cover: 3, bars: i.toeBars });
      const ftp = flexure({ ...common, Mu: top.a.Mneg, Ms: MsTop, h: i.footT * 12, cover: 2, bars: i.heelBars });
      add({ id: "foot-bot", name: `Footing, bottom bars across it: flexure on the pile rows (${bot.r.c.name})`, demand: bot.a.Mpos, capacity: fb.MR, unit: "kip·ft/ft", ref: "AASHTO 5.12.8.4, 5.6.3.2" });
      // Minimum steel and crack control where the face is in tension (a moment of at least 1 kip·ft/ft).
      if (bot.a.Mpos >= 1) add({ id: "foot-bot-min", name: "Footing, bottom bars: minimum reinforcement", demand: fb.minRequired, capacity: fb.MR, unit: "kip·ft/ft", ref: "AASHTO 5.6.3.3" });
      if (MsBot >= 1) add({ id: "foot-bot-crack", name: "Footing, bottom bars: crack control (spacing)", demand: i.toeBars.spacing, capacity: fb.sMax, unit: "in", ref: "AASHTO 5.6.7" });
      add({ id: "foot-top", name: `Footing, top bars across it: flexure on the pile rows (${top.r.c.name})`, demand: top.a.Mneg, capacity: ftp.MR, unit: "kip·ft/ft", ref: "AASHTO 5.12.8.4, 5.6.3.2" });
      if (top.a.Mneg >= 1) add({ id: "foot-top-min", name: "Footing, top bars: minimum reinforcement", demand: ftp.minRequired, capacity: ftp.MR, unit: "kip·ft/ft", ref: "AASHTO 5.6.3.3" });
      if (MsTop >= 1) add({ id: "foot-top-crack", name: "Footing, top bars: crack control (spacing)", demand: i.heelBars.spacing, capacity: ftp.sMax, unit: "in", ref: "AASHTO 5.6.7" });
      // One-way shear at dv from the stem's faces, the reactions beyond the section (5.12.8.6.1), β = 2.
      const dv = dvOf(fb, i.footT * 12) / 12;
      const Vu = Math.max(...st.map((q) => Math.max(Math.abs(q.a.Vleft(Math.max(0, x1 - dv))), Math.abs(q.a.Vright(Math.min(B, x2 + dv))))));
      add({ id: "foot-shear", name: "Footing: one-way shear at dv from the stem's faces", demand: Vu, capacity: 0.9 * 0.0316 * 2 * Math.sqrt(i.fc) * 12 * dv * 12, unit: "kip/ft", ref: "AASHTO 5.12.8.6.1, 5.7.3.3" });
      // Punching at the most loaded micropile (5.12.8.6.3): dv the concrete over the pile's head (its embedment out).
      const mpE = (i.micropile?.embed ?? 12) / 12;
      const dvp = Math.max(0.5, i.footT - mpE) * 12; // in
      const side = m.plate + dvp; // in, the perimeter's side at dv/2 round the plate
      const worst = m.rows.map((r, k) => ({ k, P: Math.max(...r.P) * Math.cos(rad(r.batter)) })).reduce((p, q) => (q.P > p.P ? q : p));
      const edge = Math.min(m.rows[worst.k].x, B - m.rows[worst.k].x) * 12; // in, from the pile's center to the nearer edge across
      const bo = edge < side / 2 ? side + 2 * (edge + side / 2) : 4 * side;
      const Vnp = 0.126 * Math.sqrt(i.fc) * bo * dvp;
      add({ id: "foot-punch", name: "Footing: punching at the most loaded micropile", demand: worst.P, capacity: 0.9 * Vnp, unit: "kip", ref: "AASHTO 5.12.8.6.3", note: `perimeter ${bo.toFixed(1)} in at dv/2 round a ${m.plate} in plate, dv = ${dvp.toFixed(1)} in over the pile's head${edge < side / 2 ? ", cut by the footing's edge" : ""}` });

      // Along the abutment: the footing spans between the micropiles of each row (s apart) under the wall's load, a
      // continuous beam over its full width (AASHTO 4.6.2.1.? / the usual coefficients: w s²/10 over the piles, w s²/14
      // between them, the shear 1.15 w s/2), the stem's stiffening not counted (conservative). w the most vertical
      // Strength case per foot of abutment; the bars along the abutment over the footing's width.
      const lt = i.footLongTop ?? { bar: 5, spacing: 12 };
      const lb = i.footLongBot ?? { bar: 5, spacing: 12 };
      const wU = Math.max(...strength.map((r) => r.V));
      const wS = Math.max(0, ...rows.filter((r) => r.c.name.startsWith("Service")).map((r) => r.V));
      const sp = m.s;
      const perFt = (M: number) => M / B; // kip·ft per ft of the footing's width
      const coverT = 2 + BARS[i.heelBars.bar].dia;
      const coverB = 3 + BARS[i.toeBars.bar].dia;
      const fLt = flexure({ ...common, Mu: perFt((wU * sp * sp) / 10), Ms: perFt((wS * sp * sp) / 10), h: i.footT * 12, cover: coverT, bars: lt });
      const fLb = flexure({ ...common, Mu: perFt((wU * sp * sp) / 14), Ms: perFt((wS * sp * sp) / 14), h: i.footT * 12, cover: coverB, bars: lb });
      add({ id: "foot-long-top", name: "Footing, top bars along the abutment: over the micropiles (w s²/10)", demand: perFt((wU * sp * sp) / 10), capacity: fLt.MR, unit: "kip·ft/ft", ref: "AASHTO 5.12.8.4, 5.6.3.2", note: `w = ${wU.toFixed(1)} kip/ft of abutment, piles ${sp.toFixed(2)} ft apart along it, over the footing's ${(B).toFixed(2)} ft width` });
      add({ id: "foot-long-bot", name: "Footing, bottom bars along the abutment: between the micropiles (w s²/14)", demand: perFt((wU * sp * sp) / 14), capacity: fLb.MR, unit: "kip·ft/ft", ref: "AASHTO 5.12.8.4, 5.6.3.2" });
      add({ id: "foot-long-crack", name: "Footing, top bars along the abutment: crack control (spacing)", demand: lt.spacing, capacity: fLt.sMax, unit: "in", ref: "AASHTO 5.6.7" });
      const dvL = dvOf(fLt, i.footT * 12) / 12;
      add({ id: "foot-long-shear", name: "Footing along the abutment: shear at the micropiles (1.15 w s/2)", demand: perFt((1.15 * wU * sp) / 2), capacity: 0.9 * 0.0316 * 2 * Math.sqrt(i.fc) * 12 * dvL * 12, unit: "kip/ft", ref: "AASHTO 5.7.3.3" });
      const shearAt = st.map((q) => ({ q, L: q.a.Vleft(Math.max(0, x1 - dv)), Rt: q.a.Vright(Math.min(B, x2 + dv)) })).reduce((p, c) => (Math.max(Math.abs(c.L), Math.abs(c.Rt)) > Math.max(Math.abs(p.L), Math.abs(p.Rt)) ? c : p));
      return { x1, x2, hs, bot, top, MsBot, MsTop, dv, Vu, shear: { r: shearAt.q.r, toe: Math.abs(shearAt.L) >= Math.abs(shearAt.Rt), x: Math.abs(shearAt.L) >= Math.abs(shearAt.Rt) ? Math.max(0, x1 - dv) : Math.min(B, x2 + dv) }, punch: { k: worst.k, P: worst.P, dvp, side, edge, bo, cut: edge < side / 2 }, long: { wU, wS, sp, lt, lb, coverT, coverB, dvL } };
    }
  }
}

export type AbutmentResult = ReturnType<typeof designAbutment>;
