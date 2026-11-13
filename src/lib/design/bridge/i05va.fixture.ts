import type { GirderInputs } from "../girders/prestressed";
import type { SoilLayer } from "../foundations/piles";
import type { ShaftLayer } from "../foundations/shaft";
import { BRIDGE_DEFAULTS, BRIDGE_GIRDER_BASE, type BridgeInputs } from "./bridge";

// CDOT project 22943, SH 92 over the Gunnison River, structure I-05-VA, entered in the Bridge from its
// documents: the independent design check (IDC: the bearing seat elevations sheet, the LEAP girder runs, its
// summary), the Pre-AD plans (general layout B03, construction layout B07, pier B13, girders B15, wingwalls
// B12) and the summary of quantities (B02). Only numbers are kept here. A value none of them gives is
// marked "assumed".
//
// - Profile (SH 92, vertical curve 1): L = 780 ft, g1 = +1.72 %, g2 = −1.42 %, PVI 119+50.00 at El. 5026.70,
//   finished grade; the Bridge's profile is the top of the deck, 0.25 ft below (3 in HMA).
// - Roadway: crowned at the HCL, 2 % each way. No skew. A tangent, N61°09'04.57"E.
// - Supports (the AD stations of the seat sheet): Abut 1 CL bearing 117+87.50; Pier 2 118+98.50; Pier 3
//   120+39.50; Abut 4 121+50.50 (spans 111, 141, 111 ft); the pier bearings 1'-0" each side of the pier.
//   Integral abutments; girders continuous over the piers, the pier caps built in two stages.
// - Six CBT 54 at 8 ft, −20 to +20 ft; deck 47 ft out to out (±23.5 ft); 8 in deck, 6¼ in haunch at the
//   bearings ("A" = 14.25 in); 3/4 in leveling pads; Bridge Rail Type 10 MASH both sides.
// - Piers (B13): a cap 43'-4" long, 4'-0" wide, 4'-0" deep (minimum), soffit El. 5013.12 (Pier 3 5013.22),
//   10 #9 top and bottom; three 36 in columns at 16'-6" (7 bundled pairs of #11, 32 in #4 spiral at 6 in)
//   on 42 in caissons. Abutments: a cap on 9 HP 14x89 piles, its bottom at El. 5009.0 (Abut 4 5009.5).

const FG_TO_DECK = 0.25;
// The IDC's girder: 110.417 ft overall for 110.0 ft design length, so 0.21 ft past each bearing.
const END = (110.417 - 110) / 2;

export const I05VA: BridgeInputs = {
  ...BRIDGE_DEFAULTS,
  alignment: { refStation: 11787.5, northing: 20000, easting: 30000, azimuth: 61 + 9 / 60 + 4.57 / 3600, curves: [] }, // coordinates assumed
  profile: { station: 11000, elevation: 5026.7 - 0.0172 * 950 - FG_TO_DECK, grade: 1.72, curves: [{ pvi: 11950, grade: -1.42, length: 780 }] },
  roadway: { leftSlope: -0.02, rightSlope: -0.02, crownOffset: 0 },
  supports: [
    { name: "Abutment 1", station: 11787.5, skew: 0, type: "integral-abutment", endDistance: END, bearingOffset: 0, bearingHeight: 0.75 },
    {
      name: "Pier 2",
      station: 11898.5,
      skew: 0,
      type: "continuous-pier",
      endDistance: END,
      bearingOffset: 1,
      bearingHeight: 0.75,
      // The caisson's top assumed at El. 5002 (near the ground in the elevation; not dimensioned).
      pier: { kind: "multicolumn", capLength: 43 + 4 / 12, capDepth: 4, capWidth: 48, columns: 3, columnSpacing: 16.5, columnShape: "round", columnSize: 36, columnDepth: 36, foundationTop: 5002, foundation: "drilled-shaft" },
    },
    {
      name: "Pier 3",
      station: 12039.5,
      skew: 0,
      type: "continuous-pier",
      endDistance: END,
      bearingOffset: 1,
      bearingHeight: 0.75,
      pier: { kind: "multicolumn", capLength: 43 + 4 / 12, capDepth: 4, capWidth: 48, columns: 3, columnSpacing: 16.5, columnShape: "round", columnSize: 36, columnDepth: 36, foundationTop: 5002, foundation: "drilled-shaft" },
    },
    { name: "Abutment 4", station: 12150.5, skew: 0, type: "integral-abutment", endDistance: END, bearingOffset: 0, bearingHeight: 0.75 },
  ],
  shape: "cbt-54",
  nGirders: 6,
  spacing: 8,
  bridgeLineOffset: 0,
  leftEdge: 23.5,
  rightEdge: 23.5,
  barrierWidth: 1.5,
  deckT: 8,
  sacrificial: 0,
  slabOffset: 8 + 6.25,
  fcDeck: 4.5,
  fws: 0.25 * 147,
  rail: { type: "type10-mash", testLevel: "TL-4", steel: "A1035" },
  girderDesignIds: [],
  deckDesignId: null,
  components: [],
};

/** The IDC's bearing seat elevations (its table "IDC results"), G-A … G-F; at the piers, at their centerlines. */
export const I05VA_SEATS = {
  abut1: [5016.46, 5016.62, 5016.78, 5016.78, 5016.62, 5016.46],
  pier2: [5017.11, 5017.27, 5017.43, 5017.43, 5017.27, 5017.11],
  pier3: [5017.21, 5017.37, 5017.53, 5017.53, 5017.37, 5017.21],
  abut4: [5016.73, 5016.89, 5017.05, 5017.05, 5016.89, 5016.73],
};

/**
 * The girders: CBT 54, f'ci 7.5 / f'c 9.0 ksi. Spans 1 and 3 as the IDC's run: 38 strands of 0.6 in, 32
 * straight (16 at 2.25 in and 16 at 4.25 in) and 6 draped from 24.25, 46.25 and 48.25 in (2 each) at the ends
 * to 2.25, 4.25 and 6.25 in, held down at 0.30 L. Span 2 from the girder schedule: 58 strands (A*s 12.59 in²),
 * 6.9 % debonded, the c.g. 4.69 in at midspan and 10.21 in at the ends, harped at 0.30 L (Lh 27.57 of 137.83 ft);
 * its pattern here gives those: 46 straight (16, 16, 14 in rows at 2.25, 4.25, 6.25 in), 4 of the bottom row
 * debonded 10 ft (assumed), 12 harped. Stirrups as B15: 6 spaces at 3 in, 11 at 4 in, 11 at 6 in, 11 at 12 in,
 * then 18 in (#4 and D20 bundled, taken as #6). Positive moment connection: 8 strands extended (taken as 8 #6).
 */
const S13 = [
  { y: 2.25, count: 16 },
  { y: 4.25, count: 16 },
];
const H13 = { count: 6, yEnd: ((24.25 + 46.25 + 48.25) * 2) / 6, yHarp: ((2.25 + 4.25 + 6.25) * 2) / 6, harpPoint: 0.3 };
const S2 = [
  { y: 2.25, count: 16, debonded: 4, debondLength: 10 },
  { y: 4.25, count: 16 },
  { y: 6.25, count: 14 },
];
const sumY = 16 * 2.25 + 16 * 4.25 + 14 * 6.25;
const H2 = { count: 12, yEnd: (10.21 * 58 - sumY) / 12, yHarp: (4.69 * 58 - sumY) / 12, harpPoint: 0.3 };
export const I05VA_GIRDER: GirderInputs = {
  ...BRIDGE_GIRDER_BASE,
  shape: "cbt-54",
  criteria: "cdot",
  fci: 7.5,
  fc: 9.0,
  highStrengthApproved: true, // the sealed plans specify 7.5 / 9.0 ksi: approved (BDM 5.3.1.2)
  strandDia: 0.6,
  strands: S13,
  harped: H13,
  extraSpans: [
    { L: 139, strands: S2, harped: H2 },
    { L: 110, strands: S13, harped: H13 },
  ],
  connection: { count: 8, bar: 6, y: 3 },
  stirrups: [
    { length: 1.5, bar: 6, legs: 2, spacing: 3 },
    { length: 44 / 12, bar: 6, legs: 2, spacing: 4 },
    { length: 5.5, bar: 6, legs: 2, spacing: 6 },
    { length: 11, bar: 6, legs: 2, spacing: 12 },
    { length: 0, bar: 6, legs: 2, spacing: 18 },
  ],
};

/** Plain 3/4 in leveling pads, Method A (the IDC); the plan size as I-18-BC's (assumed). */
export const I05VA_PAD = { pad: "plain" as const, method: "A" as const, L: 8, W: 37, hri: 0.75 };

// Soils aren't in the documents read (assumed): river alluvium, sand and gravel, over bedrock at the piles'
// tips (the abutments' 9 piles are 22 ft, the caissons 25 ft: both end in rock).
const layer = (name: string, thickness: number, kind: SoilLayer["kind"], gamma: number, phi: number, k: number): SoilLayer => ({ name, thickness, kind, gamma, phi, k, su: 0, e50: 0, qu: kind === "weak-rock" ? 400 : 0, Em: kind === "weak-rock" ? 40000 : 0, rqd: kind === "weak-rock" ? 50 : 0 });
export const I05VA_ABUT_SOIL: SoilLayer[] = [layer("Embankment fill", 10, "sand", 120, 34, 90), layer("Sand and gravel alluvium", 10, "sand", 60, 36, 60), layer("Bedrock", 20, "weak-rock", 70, 0, 0)];
export const I05VA_SHAFT_LAYERS: ShaftLayer[] = [
  { ...layer("Sand and gravel alluvium", 8, "sand", 60, 36, 60), axial: "beta", N60: 30, quKsf: 0, qs: 0, qp: 0, phiQs: 0.55, phiQp: 0.55 },
  { ...layer("Bedrock", 30, "weak-rock", 70, 0, 0), axial: "rock", N60: 0, quKsf: (400 * 144) / 1000, qs: 0, qp: 0, phiQs: 0.55, phiQp: 0.55 },
];
/** The piers' top tie when complete: the deck's transverse bars within the cap's 4 ft and the diaphragm's (assumed: 12 #5). */
export const I05VA_DIAPHRAGM_TOP = { size: 5, count: 12 };

/** The summary of quantities (B02), for the items the Bridge's designs carry. */
export const I05VA_SOQ: Record<string, { total: number }> = {
  "618-01154": { total: 2169 }, // CBT 54, LF
  "606-11035": { total: 732 }, // rail on the bridge (80 more on the approach slabs)
  "502-11489": { total: 404 }, // HP 14x89, LF
  "503-00042": { total: 152 }, // 42 in drilled shafts, LF
  "515-00120": { total: 1986 }, // waterproofing, SY (1,790 on the bridge, 196 on the approach slabs)
};
