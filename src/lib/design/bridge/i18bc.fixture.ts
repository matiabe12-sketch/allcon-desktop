import type { BearingInputs } from "../bearings/elastomeric";
import type { ShaftLayer } from "../foundations/shaft";
import type { SoilLayer } from "../foundations/piles";
import type { GirderInputs } from "../girders/prestressed";
import { BRIDGE_DEFAULTS, BRIDGE_GIRDER_BASE, type BridgeInputs } from "./bridge";

// CDOT project 24610, Airport Rd over Powers Blvd, structure I-18-BC (westbound), entered in the Bridge
// from its documents: the sealed design calculations (03/03/2023), the FOR quantities, the girder
// schedule, the bridge plans (status set 8/8/2022: girder sheet B20, Pier 2 WB sheet B17), the boring
// logs (B-1 to B-6, 1/2022) and the pile geotechnical calc. Only numbers are kept here, not the files.
// A value none of them gives is marked "assumed".
//
// - Profile (WB Airport Rd, vertical curve 1): L = 580 ft, g1 = +3.21 %, g2 = −1.85 %, PVI 316+43.74 at
//   El. 6183.27, finished grade. The Bridge's profile is the top of the deck: 0.25 ft below (3 in HMA).
// - Roadway: a single 2 % slope falling to the right. Skew 25°03'55" (bent angle 64°56'05").
// - Supports on the HCL: Abut 1 CL bearing 313+98.15; Pier 2 315+01.65, bearings 315+00.55 back and
//   315+02.76 ahead; Abut 3 CL bearing 316+05.15. Integral abutments, the girders continuous at the pier.
// - Six CBT 54 girders at 10.8 ft, at −30.25 … +23.75 ft from the HCL; deck edges at −34.0 and +27.5 ft;
//   8 in deck, 4.5 in haunch at the bearings ("A" = 12.5 in), 3/4 in leveling pads, Type 10 MASH rails.
// - Pier 2 (sheet B17): a cap 67'-10¾" long and 4'-0" wide, 5 ft deep, 18 #11 top and bottom, on three
//   columns at 30'-11⅜", 3'-0" from the cap's ends, the bottom of the columns at El. 6152 on drilled shafts.

const SKEW = 25 + 3 / 60 + 55 / 3600; // 25°03'55"
const FG_TO_DECK = 0.25; // the 3 in HMA overlay
// The girders are 103.23 ft (girder schedule) over 102.40 ft bearing to bearing: 0.83 ft of ends, taken equal.
const END = (103.23 - (31500.55 - 31398.15)) / 2;

export const I18BC: BridgeInputs = {
  ...BRIDGE_DEFAULTS,
  alignment: { refStation: 31398.15, northing: 50600, easting: 269400, azimuth: 89.88, curves: [] }, // a tangent through the bridge; its coordinates assumed (the bearing from the EB layout)
  profile: { station: 31000, elevation: 6183.27 - 0.0321 * 643.74 - FG_TO_DECK, grade: 3.21, curves: [{ pvi: 31643.74, grade: -1.85, length: 580 }] },
  roadway: { leftSlope: 0.02, rightSlope: -0.02, crownOffset: -40 }, // one slope, down to the right
  supports: [
    { name: "Abutment 1", station: 31398.15, skew: SKEW, type: "integral-abutment", endDistance: END, bearingOffset: 0, bearingHeight: 0.75 },
    {
      name: "Pier 2",
      station: 31501.65,
      skew: SKEW,
      type: "continuous-pier",
      endDistance: END,
      bearingOffset: ((31502.76 - 31500.55) / 2) * Math.cos((SKEW * Math.PI) / 180), // 1.105 ft along the HCL, normal to the pier
      bearingHeight: 0.75,
      // Columns 60 in (the sealed calc designs "column / drilled shaft" as one member; the FOR pays 60 in shafts).
      pier: { kind: "multicolumn", capLength: 67 + 10.75 / 12, capDepth: 5, capWidth: 48, columns: 3, columnSpacing: 30 + 11.375 / 12, columnShape: "round", columnSize: 60, columnDepth: 60, foundationTop: 6152, foundation: "drilled-shaft" },
    },
    { name: "Abutment 3", station: 31605.15, skew: SKEW, type: "integral-abutment", endDistance: END, bearingOffset: 0, bearingHeight: 0.75 },
  ],
  shape: "cbt-54",
  nGirders: 6,
  spacing: 10.8,
  bridgeLineOffset: (-30.25 + 23.75) / 2,
  leftEdge: 34 - 3.25,
  rightEdge: 27.5 + 3.25,
  barrierWidth: 1.5,
  deckT: 8,
  sacrificial: 0,
  slabOffset: 12.5,
  fcDeck: 4.5,
  fws: 0.25 * 147, // 3 in HMA at 147 pcf
  rail: { type: "type10-mash", testLevel: "TL-4", steel: "A1035" },
  girderDesignIds: [],
  deckDesignId: null,
  components: [],
};

/** The sealed calc's bearing seat elevations (I-18-BC WB summary, also sheet B17), G-A … G-F. */
export const I18BC_SEATS = {
  abut1: [6170.44, 6170.09, 6169.73, 6169.38, 6169.01, 6168.65],
  pier2Back: [6172.75, 6172.44, 6172.13, 6171.82, 6171.5, 6171.18],
  pier2Ahead: [6172.79, 6172.48, 6172.17, 6171.86, 6171.55, 6171.23],
  abut3: [6174.16, 6173.9, 6173.63, 6173.37, 6173.1, 6172.83],
};

/**
 * The girders (girder schedule and sheet B20): CBT 54, f'ci 6.5 / f'c 8.5 ksi, A*s = 8.246 in² (38 strands of
 * 0.6 in), none debonded, the strands' c.g. 3.41 in above the bottom at midspan and 10.67 in at the ends,
 * harped at Lh = 10.23 ft each side of midspan (0.40 L), Fj 1669.8 kip (0.75 fpu). CDOT leaves the pattern to
 * the fabricator within those; the one here gives them exactly: 16 at 2 in and 12 at 4 in straight, 10
 * harped with their c.g. at 4.96 in in the middle and 32.55 in at the ends. End-zone stirrups #4 and D20
 * bundled (0.40 in² a leg, taken as #6): 4 spaces at 3 in, 6 at 4 in, 20 at 6 in, then 9 in. The positive
 * moment connection: 10 strands extended 2'-8" into the diaphragm (taken as 10 #6 bars).
 */
const STRANDS = [
  { y: 2, count: 16 },
  { y: 4, count: 12 },
];
const HARPED = { count: 10, yEnd: (10.67 * 38 - 80) / 10, yHarp: (3.41 * 38 - 80) / 10, harpPoint: (103.23 / 2 - 10.23) / 103.23 };
export const I18BC_GIRDER: GirderInputs = {
  ...BRIDGE_GIRDER_BASE,
  shape: "cbt-54",
  criteria: "cdot",
  fci: 6.5,
  fc: 8.5,
  strandDia: 0.6,
  strands: STRANDS,
  harped: HARPED,
  extraSpans: [{ L: 100, strands: STRANDS, harped: HARPED }],
  connection: { count: 10, bar: 6, y: 3 },
  // The deck's negative moment bars over the pier (FOR tabulation: #9 at 6 in, 60 ft long), on the top mat.
  pierBars: { ...BRIDGE_GIRDER_BASE.pierBars, topBar: 9, topSpacing: 6 },
  stirrups: [
    { length: 1, bar: 6, legs: 2, spacing: 3 },
    { length: 2, bar: 6, legs: 2, spacing: 4 },
    { length: 10, bar: 6, legs: 2, spacing: 6 },
    { length: 0, bar: 6, legs: 2, spacing: 9 },
  ],
};

/** Sheet B17: 3/4 x 8 in x 3'-1" unreinforced elastomeric leveling pads (the plain pad, Method A). */
export const I18BC_PAD: Partial<BearingInputs> = { pad: "plain", method: "A", L: 8, W: 37, hri: 0.75 };

// Soils (boring logs B-1 to B-6): loose to medium dense sands, N 6 to 16 with dense lenses, over Pierre
// Shale, weathered then very hard (50/3"); groundwater 43 to 49 ft down. Unit weights, φ and the shale's
// strength aren't in the logs (assumed: typical for those soils, qu 300 psi for the hard shale).
const sand = (name: string, thickness: number, gamma: number, phi: number, k: number): SoilLayer => ({ name, thickness, kind: "sand", gamma, phi, k, su: 0, e50: 0, qu: 0, Em: 0, rqd: 0 });
const shale = (thickness: number): SoilLayer => ({ name: "Pierre Shale bedrock", thickness, kind: "weak-rock", gamma: 65, phi: 0, k: 0, su: 0, e50: 0, qu: 300, Em: 30000, rqd: 50 });
/** At the abutments: the pile table's bedrock about 70 ft below the caps' bottoms (El. 6167 to 6097). */
export const I18BC_ABUT_SOIL: SoilLayer[] = [sand("Embankment and silty sand (SM, SP-SC)", 25, 120, 32, 90), sand("Poorly graded sand (SP), loose to medium dense", 20, 115, 30, 60), sand("Sands below groundwater", 25, 55, 30, 40), shale(25)];
/** At the pier: the shaft table's bedrock 48 ft below the shafts' tops (El. 6152 to 6104), socketed 21 ft. */
export const I18BC_SHAFT_LAYERS: ShaftLayer[] = [
  { ...sand("Silty and poorly graded sand (SM, SP)", 43, 115, 30, 60), axial: "beta", N60: 9, quKsf: 0, qs: 0, qp: 0, phiQs: 0.55, phiQp: 0.55 },
  { ...sand("Sands below groundwater", 5, 55, 30, 40), axial: "beta", N60: 12, quKsf: 0, qs: 0, qp: 0, phiQs: 0.55, phiQp: 0.55 },
  { ...shale(40), axial: "rock", N60: 0, quKsf: (300 * 144) / 1000, qs: 0, qp: 0, phiQs: 0.55, phiQp: 0.55 },
];
/** The pile calc: qp = 38 ksi on 19.446 in² (the HP 14x89 after 75 years' corrosion), φ 0.65 (geotech memo 3/7/22). */
export const I18BC_PILE = { Rn: 38 * 19.446, phiDyn: 0.65 };

/** The FOR summary of quantities, I-18-BC, for the items the Bridge's designs carry. */
export const I18BC_SOQ: Record<string, { superstructure?: number; abut1?: number; pier2?: number; abut3?: number; approach?: number; total: number }> = {
  "618-01154": { superstructure: 1239, total: 1239 }, // CBT 54, LF
  "606-11035": { superstructure: 423, approach: 80, total: 503 }, // Bridge Rail Type 10 MASH, LF
  "515-00120": { superstructure: 1081, approach: 204, total: 1285 }, // waterproofing, SY
  "502-11489": { abut1: 786, abut3: 693, total: 1479 }, // HP 14x89, LF
  "503-00060": { pier2: 292, total: 292 }, // 60 in drilled shaft, LF (four shafts in the FOR; three in the later plans)
  "601-03040": { superstructure: 13.9, abut1: 35.3, pier2: 50.3, abut3: 35.3, total: 134.8 }, // Class D, CY
  "601-03056": { superstructure: 477.5, pier2: 27.5, approach: 106.5, total: 611.6 }, // Class DF, CY
  "602-00020": { superstructure: 120000, abut1: 11160, pier2: 27750, abut3: 11160, approach: 26530, total: 196600 }, // epoxy rebar, LB
};

/**
 * The pier diaphragm's top tie along the cap, for the completed cap (cap and diaphragm one member): the FOR's
 * P2 diaphragm longitudinals (5 #5, 70 ft) and the deck's top transverse #5 at 6 in within its 4 ft (8 bars).
 */
export const I18BC_DIAPHRAGM_TOP = { size: 5, count: 13 };
