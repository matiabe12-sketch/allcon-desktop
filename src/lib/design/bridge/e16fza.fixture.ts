import type { SoilLayer } from "../foundations/piles";
import type { ShaftLayer } from "../foundations/shaft";
import type { GirderInputs } from "../girders/prestressed";
import { BRIDGE_DEFAULTS, BRIDGE_GIRDER_BASE, type BridgeInputs } from "./bridge";

// CDOT project 24057, I-70 over Harlan Street, structure E-16-FZA, entered in the Bridge from its superstructure
// and substructure independent design checks (2022). Only numbers are kept here. The plans aren't among the
// documents read, so the alignment and profile are assumed (marked) and the seats are not tested.
//
// - Two spans, 66 ft centerline of abutment to centerline of pier, 65 ft bearing to bearing; side-by-side 28 x 50 in
//   prestressed boxes, 66 ft long, at 4'-2½" under a 5 in reinforced deck (1.5 in haunch at the bearings, 3.07 in
//   at midspan). The bridge is two units with a longitudinal deck joint: the north unit, 78 ft out to out with 18
//   boxes, is modelled (the IDC's girder model); the south unit (62 ft, 15 boxes of 28 x 48 in) is not.
//   Skew 4.12° (85°52'33" between the abutments and the line of girders). Bridge Rail Type 9 both edges.
// - Integral abutments: a cap 3 ft wide, 3.5 ft deep before the diaphragm, 4 #9 bottom, 6 #9 top, #6 @ 6 in
//   stirrups; 23 HP 14x89 at 6.119 ft over the whole 140 ft (13 for the north unit here), 47.55 ft long, 15 ft
//   into bedrock (El. 5320), resisting by end bearing on rock: 24 ksi on the steel, φ 0.65 (geotechnical report).
// - Pier: a cap 4 x 4 ft, 14 #11 bottom, 18 #11 top, three #6 stirrups @ 6 in, the bearings 12 in each side;
//   5.5 x 3.5 ft columns 19.32 ft tall at 16.125 ft, 28 #11, #6 ties @ 6 in; 54 in caissons 45 ft long, all in
//   bedrock, 18 #11: side 4.5 ksf and tip 55 ksf (φ 0.50 each), side shear left out over the bottom diameter.

const SKEW = 90 - (85 + 52 / 60 + 32.55 / 3600);

export const E16FZA: BridgeInputs = {
  ...BRIDGE_DEFAULTS,
  alignment: { refStation: 4300, northing: 40000, easting: 50000, azimuth: 0, curves: [] }, // a tangent (assumed)
  // Level (assumed); the north unit's roadway falls 2 % to its left edge from I-70's centerline at its right edge.
  profile: { station: 4300, elevation: 5357.0, grade: 0, curves: [] },
  roadway: { leftSlope: -0.02, rightSlope: -0.02, crownOffset: 39 },
  supports: [
    { name: "Abutment 1", station: 4300, skew: SKEW, type: "integral-abutment", endDistance: 0.5, bearingOffset: 0, bearingHeight: 0.75 },
    {
      name: "Pier 2",
      station: 4366,
      skew: SKEW,
      type: "continuous-pier",
      endDistance: 0.5,
      bearingOffset: 1, // the bearings 12 in each side of the pier's centerline
      bearingHeight: 0.75,
      // Five columns under the north unit (16.125 ft apart); their bottoms 19.32 ft below the cap's.
      pier: { kind: "multicolumn", capLength: 76, capDepth: 4, capWidth: 48, columns: 5, columnSpacing: 16.125, columnShape: "rectangular", columnSize: 66, columnDepth: 42, foundationTop: 5357.0 - (6.5 + 28 + 0.75) / 12 - 4 - 19.32, foundation: "drilled-shaft" },
    },
    { name: "Abutment 3", station: 4432, skew: SKEW, type: "integral-abutment", endDistance: 0.5, bearingOffset: 0, bearingHeight: 0.75 },
  ],
  shape: "box-28x50",
  nGirders: 18,
  spacing: 4 + 2.5 / 12,
  bridgeLineOffset: 0,
  leftEdge: 39,
  rightEdge: 39,
  barrierWidth: 1.5,
  deckT: 5,
  sacrificial: 0,
  slabOffset: 6.5, // 5 in deck and the 1.5 in haunch at the bearings
  fcDeck: 4.5,
  fws: 45, // the IDC's 40 psf overlay and 5 psf future utilities
  rail: { type: "type9-4", testLevel: "TL-4", steel: "A1035" },
  girderDesignIds: [],
  deckDesignId: null,
  components: [],
};

/**
 * The boxes (IDC, LEAP): f'ci 6.5 / f'c 8.0 ksi, 20 straight 0.6 in strands (4.34 in², c.g. 2.65 in: here 16 at
 * 2.25 in and 4 at 4.25 in), no debonding, 55 % humidity. (The LEAP model's beam 3 carries a 15-strand trial
 * pattern; beams 1 and 2, which it checks, have the 20.) AASHTO's type (f) distribution factors, as the IDC.
 * Stirrups assumed: #4 pairs at 6 in for 10 ft, then at 12 in.
 */
const STRANDS = [
  { y: 2.25, count: 16 },
  { y: 4.25, count: 4 },
];
export const E16FZA_GIRDER: GirderInputs = {
  ...BRIDGE_GIRDER_BASE,
  shape: "box-28x50",
  criteria: "cdot",
  fci: 6.5,
  fc: 8.0,
  strandDia: 0.6,
  strands: STRANDS,
  harped: { count: 0, yEnd: 10, yHarp: 4, harpPoint: 0.4 },
  extraSpans: [{ L: 65, strands: STRANDS, harped: { count: 0, yEnd: 10, yHarp: 4, harpPoint: 0.4 } }],
  humidity: 55,
  stirrups: [
    { length: 10, bar: 4, legs: 2, spacing: 6 },
    { length: 0, bar: 4, legs: 2, spacing: 12 },
  ],
};

/** Plain pads 8 x 30 x 3/4 in, Method A, dead load only at the integral supports (IDC, BDM 14.5.7). */
export const E16FZA_PAD = { pad: "plain" as const, method: "A" as const, L: 8, W: 30, hri: 0.75 };

// Soils (the IDC from the geotechnical report): Class 1 structural backfill (125 pcf, φ 34°) over shallow
// sedimentary bedrock; at the abutments the caps' bottoms at El. 5352.55 and the rock at 5320.
const layer = (name: string, thickness: number, kind: SoilLayer["kind"], gamma: number, phi: number, k: number): SoilLayer => ({ name, thickness, kind, gamma, phi, k, su: 0, e50: 0, qu: kind === "weak-rock" ? 400 : 0, Em: kind === "weak-rock" ? 40000 : 0, rqd: kind === "weak-rock" ? 50 : 0 });
export const E16FZA_ABUT_SOIL: SoilLayer[] = [layer("Structural backfill and overburden", 32.55, "sand", 125, 34, 90), layer("Bedrock", 25, "weak-rock", 70, 0, 0)];
/** The caissons, all in bedrock below 3 ft of overburden. */
export const E16FZA_SHAFT_LAYERS: ShaftLayer[] = [{ ...layer("Bedrock", 60, "weak-rock", 70, 0, 0), axial: "entered", N60: 0, quKsf: 0, qs: 4.5, qp: 55, phiQs: 0.5, phiQp: 0.5 }];
/** The piers' top tie when complete: the deck's #5 at 5 in over the cap's 4 ft (assumed). */
export const E16FZA_DIAPHRAGM_TOP = { size: 5, count: 10 };
