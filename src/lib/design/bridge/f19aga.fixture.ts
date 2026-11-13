import type { SoilLayer } from "../foundations/piles";
import type { ShaftLayer } from "../foundations/shaft";
import type { GirderInputs } from "../girders/prestressed";
import { BRIDGE_DEFAULTS, BRIDGE_GIRDER_BASE, type BridgeInputs } from "./bridge";

// CDOT project 24898, SH 79 over I-70, structure F-19-AGA, entered in the Bridge from its independent design
// check (the box girders' calc, the substructure and the quantities) and the FIR structure selection report.
// Only numbers are kept here. The plans aren't among the documents read (the set is larger than the download
// limit), so the alignment, profile and stations are assumed from the documents' descriptions: those values
// are marked, and this bridge's seat elevations are not tested.
//
// - Two spans of 92.23 ft; 16 side-by-side 35 x 66 in prestressed boxes per span (92.06 ft long) under a 5 in
//   reinforced deck; 92 ft out to out (a 68 ft roadway and a 10.5 ft sidewalk each side, the sidewalks not
//   modelled), Bridge Rail Type 9 at the edges. Skew 1°14'47". A crest vertical curve with its high point on
//   the bridge, 0.40 % between supports.
// - Integral abutments on 15 HP 14x89 piles (about 56 ft, 10 ft into claystone at El. 5491), caps 3 ft wide.
// - Pier 2: a cap 91.02 ft long, 4 ft wide, 5 to 5.96 ft deep, 8 #11 top and bottom, on seven columns at
//   13.5 ft (2645 in²; 32 #9) on 54 in drilled shafts 65 ft long, their tops at El. 5521, 35 ft in rock.

const SKEW = 1 + 14 / 60 + 47 / 3600;

export const F19AGA: BridgeInputs = {
  ...BRIDGE_DEFAULTS,
  // Stations assumed from the FIR's 109+54.85 (the back face of Abutment 1) and the 1.5 ft to the bearings.
  alignment: { refStation: 10956.35, northing: 40000, easting: 50000, azimuth: 0, curves: [] }, // a tangent; bearing and coordinates assumed
  // A crest centered on the pier, 0.40 % average grade from each abutment to it (assumed: ±1.74 %, L = 400 ft), the deck about El. 5545.5 there.
  profile: { station: 10600, elevation: 5545.5 - 0.0174 * 448.58 - (0.0348 * 200) / 4 + 0.0174 * 0, grade: 1.74, curves: [{ pvi: 11048.58, grade: -1.74, length: 400 }] },
  roadway: { leftSlope: -0.02, rightSlope: -0.02, crownOffset: 0 }, // crowned (assumed)
  supports: [
    { name: "Abutment 1", station: 10956.35, skew: SKEW, type: "integral-abutment", endDistance: 0.5, bearingOffset: 0, bearingHeight: 0.75 },
    {
      name: "Pier 2",
      station: 11048.58,
      skew: SKEW,
      type: "continuous-pier",
      endDistance: 0.08, // the boxes' 92.06 ft over 92.23 − 0.75 ft bearing to bearing with 0.5 ft at the abutment
      bearingOffset: 0.75, // assumed
      bearingHeight: 0.75,
      // Columns: 2645 in² in the quantities, on 54 in caissons (taken as 54 in round, the caissons' size: the column shape is in the plans, not read); the shafts' tops at El. 5521.
      pier: { kind: "multicolumn", capLength: 91.02, capDepth: 5, capWidth: 48, columns: 7, columnSpacing: 13.5, columnShape: "round", columnSize: 54, columnDepth: 54, foundationTop: 5521, foundation: "drilled-shaft" },
    },
    { name: "Abutment 3", station: 11140.81, skew: SKEW, type: "integral-abutment", endDistance: 0.5, bearingOffset: 0, bearingHeight: 0.75 },
  ],
  shape: "box-35x66",
  nGirders: 16,
  spacing: 5.5,
  bridgeLineOffset: 0,
  leftEdge: 46,
  rightEdge: 46,
  barrierWidth: 1.5,
  deckT: 5,
  sacrificial: 0,
  slabOffset: 7.75, // the IDC's provided slab offset
  fcDeck: 4.5,
  fws: 0.25 * 146.67, // 3 in HMA (the IDC's 0.25 ft at 0.14667 kcf)
  rail: { type: "type9-4", testLevel: "TL-4", steel: "A1035" },
  girderDesignIds: [],
  deckDesignId: null,
  components: [],
};

/**
 * The boxes (IDC): f'ci 6.5 / f'c 8.5 ksi, 44 straight 0.6 in strands, their c.g. 3.07 in above the bottom
 * (here 24 at 2 in and 20 at 4.36 in), debonded an average 8.8 ft (here 8 strands of the bottom row,
 * assumed), 55 % humidity. Distribution by the lever rule for every girder, as the IDC's analysis. The
 * deck's #11 at 6 in over the pier (the quantities: 184 bars 60 ft long). Shear stirrups assumed: #6 at 4 in
 * for the 10 ft confinement zone (the IDC), then #5 at 12 in.
 */
const STRANDS = [
  { y: 2, count: 24, debonded: 8, debondLength: 8.8 },
  { y: (3.07 * 44 - 24 * 2) / 20, count: 20 },
];
export const F19AGA_GIRDER: GirderInputs = {
  ...BRIDGE_GIRDER_BASE,
  shape: "box-35x66",
  criteria: "cdot",
  fci: 6.5,
  fc: 8.5,
  strandDia: 0.6,
  strands: STRANDS,
  harped: { count: 0, yEnd: 10, yHarp: 4, harpPoint: 0.4 },
  extraSpans: [{ L: 90, strands: STRANDS, harped: { count: 0, yEnd: 10, yHarp: 4, harpPoint: 0.4 } }],
  humidity: 55,
  distribution: "lever-rule",
  pierBars: { ...BRIDGE_GIRDER_BASE.pierBars, topBar: 11, topSpacing: 6 },
  stirrups: [
    { length: 10, bar: 6, legs: 2, spacing: 4 },
    { length: 0, bar: 5, legs: 2, spacing: 12 },
  ],
};

/** Plain 3/4 in pads, Method A (assumed, as the other CDOT bridges here). */
export const F19AGA_PAD = { pad: "plain" as const, method: "A" as const, L: 8, W: 37, hri: 0.75 };

// Soils (the FIR): embankment fill of clayey and silty sand and sandy lean clay, eolian silts and sands, over
// claystone and siltstone bedrock (El. 5491). Strengths assumed.
const layer = (name: string, thickness: number, kind: SoilLayer["kind"], gamma: number, phi: number, k: number): SoilLayer => ({ name, thickness, kind, gamma, phi, k, su: 0, e50: 0, qu: kind === "weak-rock" ? 300 : 0, Em: kind === "weak-rock" ? 30000 : 0, rqd: kind === "weak-rock" ? 50 : 0 });
/** At the abutments: the caps' bottoms at El. 5535.65 and 5534.85, bedrock at 5491. */
export const F19AGA_ABUT_SOIL: SoilLayer[] = [layer("Embankment fill (clayey and silty sand)", 20, "sand", 120, 30, 60), layer("Eolian silts and sands", 25, "sand", 115, 30, 60), layer("Claystone bedrock", 20, "weak-rock", 70, 0, 0)];
export const F19AGA_SHAFT_LAYERS: ShaftLayer[] = [
  { ...layer("Eolian silts and sands", 30, "sand", 115, 30, 60), axial: "beta", N60: 12, quKsf: 0, qs: 0, qp: 0, phiQs: 0.55, phiQp: 0.55 },
  { ...layer("Claystone bedrock", 40, "weak-rock", 70, 0, 0), axial: "rock", N60: 0, quKsf: (300 * 144) / 1000, qs: 0, qp: 0, phiQs: 0.55, phiQp: 0.55 },
];
/** The pier's top tie when complete: the pier diaphragm's 12 #5 and the deck's transverse #5 at 6 in within 4 ft. */
export const F19AGA_DIAPHRAGM_TOP = { size: 5, count: 20 };

/** The IDC's quantities (the designer's), for the items the Bridge's designs carry. */
export const F19AGA_SOQ: Record<string, { total: number }> = {
  "618-01994": { total: 16204 }, // Prestressed Concrete Box 32"-48", SF
  "606-10900": { total: 375 }, // Bridge Rail Type 9 on the bridge, LF (80 more on the approach slabs)
  "502-11489": { total: 1665 }, // HP 14x89, LF (840 + 825)
  "503-00054": { total: 455 }, // 54 in drilled caissons, LF
};
