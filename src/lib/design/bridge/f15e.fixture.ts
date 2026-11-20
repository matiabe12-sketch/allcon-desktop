import type { AbutmentInputs } from "../foundations/abutment";
import type { SoilLayer } from "../foundations/piles";
import type { GirderInputs } from "../girders/prestressed";
import type { ApproachSlabInputs } from "../approach/approach-slab";
import { BRIDGE_DEFAULTS, BRIDGE_GIRDER_BASE, type BridgeInputs } from "./bridge";

// CDOT structure F-15-E, "Bridge X", I-70 WB over Sawmill Gulch (Floyd Hill Central Section, project 25177, 2025),
// entered in the Bridge from its plans (35 sheets) and its independent design calculations (girders by PGSuper,
// the abutments' micropiles by a pile group program). Only numbers are kept here.
//
// - One span, 140'-0" centerline of bearing to centerline of bearing (girders 141.50 ft), skew 15°. A crest vertical
//   curve: VPC 1068+00.00 at El. 7349.37, +4.00 % / −3.9553 %, 1,000 ft. 59'-0" out to out (31'-6" left and
//   27'-6" right of the HCL), a one-way 2 % cross slope. Seven CBT 72 at 8'-6" (the girders' center 2 ft left of the
//   HCL), an 8½ in deck (½ in sacrificial) on 3 in precast panels, 3 in SMA (36 psf). Type 9 rails.
// - Semi-integral abutments: the end diaphragm on the bearings, a 4 ft wall on a footing over micropiles (12 in
//   casings, 2 × 3 in bars, 10 ft cased and 10 ft bonded in rock). Abutment 1: Type II expansion bearings (steel
//   laminated, PTFE), a 9 ft footing on three rows of 15 (the front row battered 4:1). Abutment 2: ¾ in leveling pads,
//   a 6 ft footing on two rows of 13 (the front row battered 4:1).

const SKEW = 15;

export const F15E: BridgeInputs = {
  ...BRIDGE_DEFAULTS,
  alignment: { refStation: 107485, northing: 40000, easting: 50000, azimuth: 85 + 15 / 60 + 58 / 3600, curves: [] }, // N85°15'58"E, a tangent (the coordinates assumed)
  profile: { station: 106800, elevation: 7349.37, grade: 4, curves: [{ pvi: 107300, grade: -3.9553, length: 1000 }] },
  roadway: { leftSlope: -0.02, rightSlope: 0.02, crownOffset: 0 }, // one way, rising to the right (the typical section)
  supports: [
    { name: "Abutment 1", station: 107485, skew: SKEW, type: "semi-integral-abutment", endDistance: 0.75, bearingOffset: 0, bearingHeight: 0.3, bearing: "expansion" },
    { name: "Abutment 2", station: 107625, skew: SKEW, type: "semi-integral-abutment", endDistance: 0.75, bearingOffset: 0, bearingHeight: 0.0625, bearing: "fixed" },
  ],
  shape: "cbt-72",
  nGirders: 7,
  spacing: 8.5,
  bridgeLineOffset: -2, // the girders' center 2 ft left of the HCL
  leftEdge: 29.5, // from the girders' center: 4 ft overhangs both sides
  rightEdge: 29.5,
  barrierWidth: 1.5,
  deckT: 8.5,
  sacrificial: 0.5,
  slabOffset: 13.625, // PGSuper's "A"
  fcDeck: 4.5,
  fws: 36, // 3 in SMA (the plans' design data)
  rail: { type: "type9-4", testLevel: "TL-4", steel: "A1035" },
  girderDesignIds: [],
  deckDesignId: null,
  components: [],
};

/**
 * The girders (plans BX18–BX20, PGSuper): f'ci 6.5 / f'c 8.5 ksi, 64 0.6 in strands. Straight: 16 at 2.25 in and 16 at
 * 4.25 in (6 of each row debonded: 4 strands each 9, 12 and 15 ft), 10 at 6.25 in, 4 at 8.25 in. Harped:
 * 18 (two columns of 9 at 2 in, 2.25 to 18.25 in at the harp points, their center 10.25 in), at the ends starting 2½ in
 * clear of the top (BX18): the top pair at 69.2 in, the nine pairs' center 61.2 in. (The schedule's 21.09 in for all 64
 * at the ends implies 63.9 in for the harped strands, only reached with wider rows in the top flange, which the plans
 * don't draw.) Harped at 0.40 L (Lh 14.15 ft). Stirrups #4 bundled with D20 from the end: 6
 * at 3 in, 26 at 4 in, 11 at 6 in, 11 at 12 in, then 18 in. Utilities 5 psf (DW) and the forms 5 psf (DC) on the girders.
 */
// The plans' debonding table (BX18): 4 strands each 9, 12 and 15 ft, 6 in each of the two bottom rows (Strand Pattern
// No. 1, BX19): 2 of each row at each length, 4 ending at each section.
const STRANDS = [
  { y: 2.25, count: 16, debonded: 2, debondLength: 9, debonded2: 2, debondLength2: 12, debonded3: 2, debondLength3: 15 },
  { y: 4.25, count: 16, debonded: 2, debondLength: 9, debonded2: 2, debondLength2: 12, debonded3: 2, debondLength3: 15 },
  { y: 6.25, count: 10 },
  { y: 8.25, count: 4 },
];
export const F15E_GIRDER: GirderInputs = {
  ...BRIDGE_GIRDER_BASE,
  shape: "cbt-72",
  criteria: "cdot",
  fci: 6.5,
  fc: 8.5,
  strandDia: 0.6,
  strands: STRANDS,
  harped: { count: 18, yEnd: 61.2, yHarp: 10.25, harpPoint: 0.4 },
  extraSpans: [],
  deckPanels: true,
  overlay: 3, // 3 in SMA on the membrane (BX02: 403-09210)
  endBars: { count: 2, bar: 6 }, // #6 C-bars, tot 2 each end (BX18)
  confinement: { bar: 3, spacing: 4, length: 9 }, // #3 (D11) with the stirrups for 1.5D = 9 ft from each end (BX18)
  stirrups: [
    { length: 1.5, bar: 4, legs: 2, spacing: 3, bundle: { bars: 1, wire: 0.2 } },
    { length: 26 * 4 / 12, bar: 4, legs: 2, spacing: 4, bundle: { bars: 1, wire: 0.2 } },
    { length: 5.5, bar: 4, legs: 2, spacing: 6, bundle: { bars: 1, wire: 0.2 } },
    { length: 11, bar: 4, legs: 2, spacing: 12, bundle: { bars: 1, wire: 0.2 } },
    { length: 0, bar: 4, legs: 2, spacing: 18, bundle: { bars: 1, wire: 0.2 } },
  ],
};

/** Abutment 1: Type II expansion bearings, 10 × 38 in, four ½ in layers, a PTFE slider, two 1½ in F1554 Grade 55 anchor rods (the calcs). Abutment 2: ¾ in × 18 × 38 in leveling pads. */
export const F15E_PAD = (support: number) =>
  support === 0
    ? { pad: "steel" as const, method: "B" as const, L: 10, W: 38, hri: 0.5, n: 4, hre: 0.125, covers: 1 as const, hs: 0.125, sliding: true, anchorRods: { n: 2, d: 1.5, Fu: 75 } }
    : { pad: "plain" as const, method: "A" as const, L: 18, W: 38, hri: 0.75, levelingPad: true }; // in the girders' item (BX16)

/** The pile group input's rock (weak rock: qu 880 psi, Em 576 ksi, RQD 60 %, krm 0.0004, 170 pcf). */
const rock = (thickness: number): SoilLayer => ({ name: "Bedrock", thickness, kind: "weak-rock", gamma: 170, phi: 0, k: 0, su: 0, e50: 0, qu: 880, Em: 576000, rqd: 60 });
const fill = (thickness: number): SoilLayer => ({ name: "Overburden", thickness, kind: "sand", gamma: 125, phi: 34, k: 90, su: 0, e50: 0, qu: 0, Em: 0, rqd: 0 });

/**
 * The micropiles (BX10, the calcs): 12 in OD × ½ in casings (80 ksi) through 10 ft, two 3 in Grade 150 bars (fy 120 ksi),
 * 6 ksi grout, an 11 in hole bonded 10 ft in rock at a nominal 20 ksf; final design, load-tested at φ 0.70 (a verification test
 * pile at each abutment, BX10 Note 2);
 * aggressive ground over 100 years (the calcs: 0.001 in/yr), half the wall lost at the threads. Into the footing: a
 * 15 × 15 × 1¼ in bearing plate (36 ksi), a ¼ in fillet weld (90 ksi electrode, the calcs).
 */
const MICROPILE = { casingOD: 12, casingT: 0.5, casingFy: 80, threadReduction: (Math.PI / 4) * (144 - 121) / 2, bar: 24, barCount: 2, barFy: 120, fcGrout: 6, holeD: 11, cased: 10, plunge: 0, bond: 10, embed: 12, bondGround: "granite" as const, grouting: "A" as const, alphaB: 20, phiBond: 0.55, loadTested: true, phiBondTested: 0.7, aggressive: true, designLife: 100, coatingLife: 0, corrosionRate: 0.001, plate: { size: 15, t: 1.25, Fy: 36, weld: 0.25, Fexx: 90 } };

/**
 * The abutments (BX11–BX15, the calcs): a 4 ft wall, #8 at 6 in on its back face; footings 3 ft deep, #10 at 6 in on the
 * bottom and #10 at 5 in on top. Abutment 1: wall 18.29 ft from the footing to the seat (the calcs' arm), a 9 ft footing
 * (1 ft toe, 4 ft heel, assumed from the sections), rows 1.5, 4.5 and 7.5 ft from the toe. Abutment 2: the wall 7.3 ft, a
 * 6 ft footing (1 ft toe and heel), rows 1.5 and 4.5 ft. The end diaphragm (BX15) 4 ft wide, 2 ft each side of the
 * bearing line, and 7'-10" from the seat to the deck's top. Backfill φ 34°.
 */
export const F15E_ABUTMENT = (support: number): Partial<AbutmentInputs> => ({
  foundation: "micropiles",
  stemT: 4,
  toe: 1,
  heel: support === 0 ? 4 : 1,
  footT: 3,
  stemH: support === 0 ? 18.29 : 7.3,
  // Abutment 1 steps (footing tops at 7338.50 and 7332.00, BX13): its average height for the quantities.
  ...(support === 0 ? { stemHQty: 14.95 } : {}),
  backwallH: 7.83,
  backwallT: 4,
  seatWidth: 48,
  pressure: "active",
  backfillPhi: 34,
  backfillGamma: 125,
  fc: 4.5,
  fy: 60,
  // The plans' bars (BX13, BX14): the wall #8@6 each face, #5@12 horizontals each face; the seat 7-#8 continuous and
  // #6@6 U bars; the footing #5@6 across top and bottom, #10@6 along it top and bottom (between the micropiles).
  stemBars: { bar: 8, spacing: 6 },
  stemFrontBars: { bar: 8, spacing: 6 },
  stemHorizBars: { bar: 5, spacing: 12 },
  seatTop: { bar: 8, count: 7 },
  seatU: { bar: 6, spacing: 6 },
  toeBars: { bar: 5, spacing: 6 },
  heelBars: { bar: 5, spacing: 6 },
  footLongTop: { bar: 10, spacing: 6 },
  footLongBot: { bar: 10, spacing: 6 },
  mpPerRow: support === 0 ? 15 : 13,
  mpRowList: support === 0 ? [{ x: 1.5, batter: 14.04 }, { x: 4.5, batter: 0 }, { x: 7.5, batter: 0 }] : [{ x: 1.5, batter: 14.04 }, { x: 4.5, batter: 0 }],
  micropile: MICROPILE,
  soil: support === 0 ? [rock(40)] : [fill(7.5), rock(40)],
});

/** What the calcs report, for the comparisons. */
/**
 * The approach slabs (BX25): Class D (Bridge) for the slabs and sleepers (Note 1); the sleeper 5'-10" by 1'-0" with the
 * slab on 2'-4" of it and a 2'-0" block under the device; a coping along each edge under the rail, a 5½ in leg to
 * 2'-0" below the slab's top (Section B).
 */
export const F15E_APPROACH = { sleeperB: 70 / 12, sleeperSeat: 28, blockW: 24, coping: { depth: 24, width: 5.5 }, takeoff: { items: { concrete: "601-03040" } } } as Partial<ApproachSlabInputs>;

export const F15E_CALC = {
  /** PGSuper, midspan, Strength I (kip·ft): Girder A (exterior) and B (interior). */
  midspan: { exterior: { Mu: 15657.76, phiMn: 21252.68 }, interior: { Mu: 14245.57, phiMn: 21342.44 } },
  /** Effective prestress, all 64 strands (kip): after transfer and final. */
  prestress: { transfer: 2507.36, final: 2056.59 },
  /** Interior girder's design camber at 60 days (in). */
  camber: 6.57,
  /** Abutment 1 bearing, per girder (kip): DC, DW, LL without IM. */
  bearing1: { DC: 220.09, DW: 23.73, LL: 49.84 },
  /** Micropiles, the most loaded (kip): Abutment 1 factored top and service; the plans' table for both. */
  micropile: { abut1: { factored: 256.39, service: 191.26, tension: 90.58, lateral: 20.82 }, abut2: { factored: 213, service: 172 } },
  /** Abutment 1 wall at the footing, Strength I and Service (kip·ft/ft). */
  wall1: { Mu: 97.57, Ms: 72.04, Vu: 11.66 },
  /** Summary of quantities (BX02). */
  soq: { "503-01120": 1753, "618-01172": 991, "512-00102": 7, "606-10900": 310, "601-03040": 243, "601-03056": 619, "403-09210": 190, "518-01004": 116, "601-25730": 481 },
};
