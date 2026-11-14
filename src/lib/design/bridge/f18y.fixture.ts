import type { SoilLayer } from "../foundations/piles";
import type { ShaftLayer } from "../foundations/shaft";
import type { GirderInputs } from "../girders/prestressed";
import { BRIDGE_DEFAULTS, BRIDGE_GIRDER_BASE, type BridgeInputs } from "./bridge";

// CDOT structure F-18-Y, Picadilly Road over I-70 (Aurora, 2024), entered in the Bridge from its independent design
// check (superstructure and substructure) and the first 76 pages of its design calculations. Only numbers are kept
// here. The plans (over the download limit) weren't read: the pier's column spacing, the piles' length and the
// soils above the rock are assumed (marked).
//
// - Two spans, 111.08 ft centerline of abutment bearing to centerline of pier; nine CBT 54 at 12'-4" under an 8 in
//   deck on precast panels, a 3 in HMA overlay; 106 ft out to out. Skew 7°53'44". A crest vertical curve: VPI
//   152+74.94 at El. 5570.208, +4.52 % / −3.86 %, 400 ft. Type 9 barriers at the edges; a 14 ft raised median
//   sidewalk with Type 9 guardrails each side (its weight, 1.20 klf, and the guardrails', 0.84 klf each, spread
//   over the nine girders as the designers did; the edge barriers 0.55 klf with their fence).
// - Integral abutments on 13 HP 12x74 at 8.4 ft, a barrel 2.5 ft wide and about 4 ft deep; end bearing on rock,
//   18 ksi factored on the steel (392 kip). Pier: a dropped cap 105 ft long, 48 x 66 in, 14 #10 bottom, 12 #10
//   top; three pill-shaped 36 x 60 in columns (24 #10); 48 in drilled shafts 47 ft long (top El. 5539).

const SKEW = 90 - (82 + 6 / 60 + 16 / 3600);

export const F18Y: BridgeInputs = {
  ...BRIDGE_DEFAULTS,
  alignment: { refStation: 15170.32, northing: 40000, easting: 50000, azimuth: 0, curves: [] }, // a tangent (the coordinates assumed)
  profile: { station: 15074.94, elevation: 5561.166, grade: 4.52, curves: [{ pvi: 15274.94, grade: -3.86, length: 400 }] },
  roadway: { leftSlope: -0.02, rightSlope: -0.02, crownOffset: 0 },
  supports: [
    { name: "Abutment 1", station: 15170.32, skew: SKEW, type: "integral-abutment", endDistance: 0.5, bearingOffset: 0, bearingHeight: 0.75 },
    {
      name: "Pier 2",
      station: 15281.4,
      skew: SKEW,
      type: "continuous-pier",
      endDistance: 0.5,
      bearingOffset: 1, // the bearings 1 ft each side of the pier
      bearingHeight: 0.75,
      // Three columns, 35 ft apart (assumed); taken as 36 x 60 in rectangles (pill-shaped in the design: 1882 in²).
      pier: { kind: "multicolumn", capLength: 105, capDepth: 5.5, capWidth: 48, columns: 3, columnSpacing: 35, columnShape: "rectangular", columnSize: 60, columnDepth: 36, foundationTop: 5539, foundation: "drilled-shaft" },
    },
    { name: "Abutment 3", station: 15392.48, skew: SKEW, type: "integral-abutment", endDistance: 0.5, bearingOffset: 0, bearingHeight: 0.75 },
  ],
  shape: "cbt-54",
  nGirders: 9,
  spacing: 12 + 4 / 12,
  bridgeLineOffset: 0,
  leftEdge: 53,
  rightEdge: 53,
  barrierWidth: 1.5,
  deckT: 8,
  sacrificial: 0,
  slabOffset: 11, // 8 in deck and the 3 in haunch at the supports (the IDC's BDM Example 7 check)
  fcDeck: 4.5,
  fws: 0.25 * 146.67, // 3 in HMA
  rail: { type: "type9-4", testLevel: "TL-4", steel: "A1035" },
  girderDesignIds: [],
  deckDesignId: null,
  components: [],
};

/**
 * The girders (design calcs, LEAP): f'ci 6.5 / f'c 8.5 ksi, 46 0.6 in strands: 34 straight (16 at 2.25 in, two of
 * them shielded 2 ft, 16 at 4.25 in, 2 at 6.25 in) and 12 draped from 42.25–52.25 in at the ends to 2.25–12.25 in,
 * held down at 0.40 L. Refined losses, the deck at 60 days, precast deck panels. The median sidewalk, guardrails and
 * the edge barriers' extra weight over the worksheet's, 0.334 klf on each girder. Stirrups and the positive
 * moment connection (8 strands extended) taken as I-05-VA's (CDOT standard details), not read.
 */
const STRANDS = [
  { y: 2.25, count: 16, debonded: 2, debondLength: 2 },
  { y: 4.25, count: 16 },
  { y: 6.25, count: 2 },
];
const DRAPED = { count: 12, yEnd: 47.25, yHarp: 7.25, harpPoint: 0.4 };
export const F18Y_GIRDER: GirderInputs = {
  ...BRIDGE_GIRDER_BASE,
  shape: "cbt-54",
  criteria: "cdot",
  fci: 6.5,
  fc: 8.5,
  strandDia: 0.6,
  strands: STRANDS,
  harped: DRAPED,
  extraSpans: [{ L: 110.02, strands: STRANDS, harped: DRAPED }],
  deckPanels: true,
  otherDC2: (1.2 + 2 * 0.84 + 2 * (0.55 - 0.486)) / 9,
  connection: { count: 0, bar: 6, y: 3, strands: { count: 8, length: 36, y: 2.25 } },
  endBars: { count: 2, bar: 6 },
  stirrups: [
    { length: 1.5, bar: 4, legs: 2, spacing: 3, bundle: { bars: 1, wire: 0.2 } },
    { length: 44 / 12, bar: 4, legs: 2, spacing: 4, bundle: { bars: 1, wire: 0.2 } },
    { length: 5.5, bar: 4, legs: 2, spacing: 6, bundle: { bars: 1, wire: 0.2 } },
    { length: 11, bar: 4, legs: 2, spacing: 12, bundle: { bars: 1, wire: 0.2 } },
    { length: 0, bar: 4, legs: 2, spacing: 18, bundle: { bars: 1, wire: 0.2 } },
  ],
};

/** Plain 3/4 in leveling pads, Method A (assumed, as the other CDOT CBT bridges here). */
export const F18Y_PAD = { pad: "plain" as const, method: "A" as const, L: 8, W: 37, hri: 0.75 };

const layer = (name: string, thickness: number, kind: SoilLayer["kind"], gamma: number, phi: number, k: number): SoilLayer => ({ name, thickness, kind, gamma, phi, k, su: 0, e50: 0, qu: kind === "weak-rock" ? 400 : 0, Em: kind === "weak-rock" ? 40000 : 0, rqd: kind === "weak-rock" ? 50 : 0 });
/** At the abutments: Class 1 fill (φ 34°) over overburden and claystone (thicknesses assumed). */
export const F18Y_ABUT_SOIL: SoilLayer[] = [layer("Class 1 backfill", 10, "sand", 130, 34, 90), layer("Overburden", 15, "sand", 120, 32, 60), layer("Bedrock", 20, "weak-rock", 70, 0, 0)];
/**
 * The shafts (IDC p. 173, the geotechnical values): 12 ft of overburden not counted; weathered bedrock from El. 5527,
 * 5 ksf side; competent bedrock from El. 5500, 8 ksf side and 90 ksf tip; φ 0.60 on each (the IDC's capacities).
 */
export const F18Y_SHAFT_LAYERS: ShaftLayer[] = [
  { ...layer("Overburden", 12, "sand", 120, 32, 60), axial: "none", N60: 0, quKsf: 0, qs: 0, qp: 0, phiQs: 0.6, phiQp: 0.6 },
  { ...layer("Weathered bedrock", 27, "weak-rock", 70, 0, 0), axial: "entered", N60: 0, quKsf: 0, qs: 5, qp: 0, phiQs: 0.6, phiQp: 0.6 },
  { ...layer("Competent bedrock", 30, "weak-rock", 70, 0, 0), axial: "entered", N60: 0, quKsf: 0, qs: 8, qp: 90, phiQs: 0.6, phiQp: 0.6 },
];
/** The pier's top tie when complete: the deck's #5 at 6 in over the cap's 4 ft (assumed). */
export const F18Y_DIAPHRAGM_TOP = { size: 5, count: 8 };
