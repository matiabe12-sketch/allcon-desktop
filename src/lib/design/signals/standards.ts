// CDOT's standard traffic signal supports (Traffic Safety & Engineering Services standard plans, issued
// July 1, 2026), as their tables give them:
// - S-614-40 "Typical Traffic Signal, 15'–75' Double Mast Arms and 60'–75' Single Mast Arm": the arms (sheet 3), the
//   double-arm poles (sheet 4), the 60–75 ft single-arm poles (sheet 5), the base connection and caisson (sheet 6);
// - S-614-40A "Alternate Traffic Signal, 15'–55' Single Mast Arm": the arms (sheet 3), the pole (sheet 2) and the
//   caisson (sheet 5);
// - S-614-44 "Pedestal Pole Signals": the poles' service moment and shear and their caissons (sheets 1 and 2).
// Each arm series is designed for its longest arm (the "design length" in the sheets' parentheses) and the worst-case
// loading of sheet 2: signal heads every 10 ft from the tip, signs between them, a luminaire arm and a camera on the
// pole's top, a signal head on the pole. Tube lengths in ft; diameters and walls in in.

export type Tube = { length: number; tip: number; trunk: number; t: number }; // the smaller diameter, the larger

export type Caisson = {
  D: number; // in
  depth: number; // ft, in cohesionless soil (and cohesive where one depth is given)
  depthCohesive: number; // ft
  pay: number; // ft, pay length (Item 503), cohesionless
  payCohesive: number; // ft
  bars: number;
  bar: number;
  spiral: number; // bar size, at 6 in pitch
};

export type SignalStandard = {
  id: string;
  sheet: "S-614-40" | "S-614-40A" | "S-614-44";
  label: string; // for the picker
  kind: "mast-arm" | "pedestal";
  arms: 1 | 2; // the most arms the pole is designed for
  L: number; // ft, the design arm length (the series' longest arm)
  covers: string; // the arm lengths it is used for
  heads: number; // signal heads on each arm (sheet 2)
  armBase?: Tube;
  armEnd?: Tube;
  poleBase?: Tube;
  poleEnd?: Tube; // the end section with a luminaire (6 ft without)
  caisson: Caisson;
  anchors: { n: number; d: number; circle: number }; // in
  basePlate: { size: number; t: number; square: boolean }; // in: the diameter, or the side of a square plate
  // S-614-44: the pole's service moment and shear at its base, for a 90 mph design wind speed.
  service?: { M: number; V: number; V0: number };
  safety: { flexure: number; torsion: number }; // the sheets' soil factors of safety (Design Data)
  designWind: number; // mph, the sheets' design wind speed
};

const caisson40 = (D: number, depth: number, bars: number): Caisson => ({ D, depth, depthCohesive: depth, pay: Math.ceil(depth), payCohesive: Math.ceil(depth), bars, bar: 9, spiral: 4 });

// S-614-40 sheet 3 (arms), sheet 4 (double-arm poles), sheet 6 (base connection, caissons).
const ARMS_40: Record<number, { base: Tube; end?: Tube }> = {
  30: { base: { length: 29.25, tip: 6.5, trunk: 10.59, t: 0.1793 } },
  40: { base: { length: 39.11, tip: 6.5, trunk: 11.98, t: 0.2391 } },
  50: { base: { length: 25.15, tip: 9.47, trunk: 12.99, t: 0.3125 }, end: { length: 25, tip: 6.5, trunk: 10, t: 0.1793 } },
  65: { base: { length: 25.35, tip: 12.52, trunk: 16.07, t: 0.3125 }, end: { length: 40, tip: 7.5, trunk: 13.1, t: 0.1793 } },
  75: { base: { length: 35.23, tip: 12.52, trunk: 17.45, t: 0.3125 }, end: { length: 40, tip: 7.5, trunk: 13.1, t: 0.1793 } },
};
const POLES_40_DOUBLE: Record<number, { base: Tube; end: Tube }> = {
  30: { base: { length: 22.29, tip: 9.11, trunk: 12.23, t: 0.3125 }, end: { length: 20.54, tip: 7.25, trunk: 10.13, t: 0.2391 } },
  40: { base: { length: 22.67, tip: 11.81, trunk: 14.98, t: 0.3125 }, end: { length: 20.71, tip: 10, trunk: 12.9, t: 0.2391 } },
  50: { base: { length: 22.33, tip: 14.86, trunk: 17.98, t: 0.3125 }, end: { length: 20.79, tip: 13, trunk: 15.91, t: 0.2391 } },
  65: { base: { length: 22.77, tip: 18.54, trunk: 21.73, t: 0.3125 }, end: { length: 21.02, tip: 16.75, trunk: 19.69, t: 0.2391 } },
  75: { base: { length: 23.08, tip: 20.75, trunk: 23.98, t: 0.3125 }, end: { length: 21.12, tip: 19, trunk: 21.96, t: 0.2391 } },
};
const POLES_40_SINGLE: Record<number, { base: Tube; end: Tube }> = {
  65: { base: { length: 26.3, tip: 18.05, trunk: 21.73, t: 0.3125 }, end: { length: 14.99, tip: 16.75, trunk: 18.85, t: 0.2391 } },
  75: { base: { length: 26.74, tip: 20.24, trunk: 23.98, t: 0.3125 }, end: { length: 14.83, tip: 19, trunk: 21.07, t: 0.2391 } },
};
const BASE_40: Record<number, { caisson: Caisson; anchors: SignalStandard["anchors"]; plate: SignalStandard["basePlate"] }> = {
  30: { caisson: caisson40(36, 12.5, 11), anchors: { n: 6, d: 2, circle: 17.75 }, plate: { size: 24, t: 2.25, square: false } },
  40: { caisson: caisson40(36, 14.5, 11), anchors: { n: 6, d: 2, circle: 21 }, plate: { size: 27, t: 2.5, square: false } },
  50: { caisson: caisson40(42, 16.5, 14), anchors: { n: 6, d: 2, circle: 25 }, plate: { size: 32, t: 2.75, square: false } },
  65: { caisson: caisson40(48, 20.5, 18), anchors: { n: 6, d: 2.5, circle: 30.25 }, plate: { size: 39, t: 3, square: false } },
  75: { caisson: caisson40(54, 20.5, 23), anchors: { n: 6, d: 2.5, circle: 33 }, plate: { size: 42, t: 3.25, square: false } },
};
const HEADS_40: Record<number, number> = { 30: 2, 40: 3, 50: 4, 65: 5, 75: 5 };
const COVERS_40: Record<number, string> = { 30: "25 and 30 ft", 40: "35 and 40 ft", 50: "45 and 50 ft", 65: "55, 60 and 65 ft", 75: "70 and 75 ft" };

// S-614-40A sheet 3 (arms), sheet 2 (the pole, all arms), sheet 5 (caisson: 36 in, 14'-6" cohesionless, 18'-6" cohesive).
const ARMS_40A: Record<number, { base: Tube; end?: Tube }> = {
  25: { base: { length: 23.92, tip: 6.65, trunk: 10, t: 0.2391 } },
  35: { base: { length: 33.92, tip: 7.5, trunk: 12.25, t: 0.2391 } },
  45: { base: { length: 25.16, tip: 9.73, trunk: 13.25, t: 0.3125 }, end: { length: 20, tip: 7.46, trunk: 10.26, t: 0.1793 } },
  55: { base: { length: 25.34, tip: 11.2, trunk: 14.75, t: 0.3125 }, end: { length: 30, tip: 7.56, trunk: 11.76, t: 0.1793 } },
};
const POLE_40A = { base: { length: 24.47, tip: 11.57, trunk: 15, t: 0.3125 }, end: { length: 16, tip: 9.9, trunk: 12.14, t: 0.1793 } };
const CAISSON_40A: Caisson = { D: 36, depth: 14.5, depthCohesive: 18.5, pay: 15, payCohesive: 19, bars: 14, bar: 9, spiral: 4 };
const HEADS_40A: Record<number, number> = { 25: 2, 35: 3, 45: 4, 55: 5 };
const COVERS_40A: Record<number, string> = { 25: "15 to 25 ft", 35: "30 and 35 ft", 45: "40 and 45 ft", 55: "50 and 55 ft" };

export const SIGNAL_STANDARDS: SignalStandard[] = [
  ...[25, 35, 45, 55].map(
    (L): SignalStandard => ({
      id: `40A-${L}`,
      sheet: "S-614-40A",
      label: `S-614-40A single arm, ${COVERS_40A[L]} (designed for ${L} ft)`,
      kind: "mast-arm",
      arms: 1,
      L,
      covers: COVERS_40A[L],
      heads: HEADS_40A[L],
      armBase: ARMS_40A[L].base,
      armEnd: ARMS_40A[L].end,
      poleBase: POLE_40A.base,
      poleEnd: POLE_40A.end,
      caisson: CAISSON_40A,
      anchors: { n: 4, d: 2, circle: 20 },
      basePlate: { size: 20, t: 2.75, square: true },
      safety: { flexure: 3, torsion: 1.25 },
      designWind: 100,
    }),
  ),
  ...[30, 40, 50, 65, 75].map(
    (L): SignalStandard => ({
      id: `40-${L}`,
      sheet: "S-614-40",
      label: `S-614-40 double arm, ${COVERS_40[L]} (designed for ${L} ft)`,
      kind: "mast-arm",
      arms: 2,
      L,
      covers: COVERS_40[L],
      heads: HEADS_40[L],
      armBase: ARMS_40[L].base,
      armEnd: ARMS_40[L].end,
      poleBase: POLES_40_DOUBLE[L].base,
      poleEnd: POLES_40_DOUBLE[L].end,
      caisson: BASE_40[L].caisson,
      anchors: BASE_40[L].anchors,
      basePlate: BASE_40[L].plate,
      safety: { flexure: 3, torsion: 1.5 },
      designWind: 100,
    }),
  ),
  ...[65, 75].map(
    (L): SignalStandard => ({
      id: `40S-${L}`,
      sheet: "S-614-40",
      label: `S-614-40 single arm, ${L === 65 ? "60 and 65 ft" : "70 and 75 ft"} (designed for ${L} ft)`,
      kind: "mast-arm",
      arms: 1,
      L,
      covers: L === 65 ? "60 and 65 ft" : "70 and 75 ft",
      heads: 5,
      armBase: ARMS_40[L].base,
      armEnd: ARMS_40[L].end,
      poleBase: POLES_40_SINGLE[L].base,
      poleEnd: POLES_40_SINGLE[L].end,
      caisson: BASE_40[L].caisson,
      anchors: BASE_40[L].anchors,
      basePlate: BASE_40[L].plate,
      safety: { flexure: 3, torsion: 1.5 },
      designWind: 100,
    }),
  ),
  {
    id: "44-signal",
    sheet: "S-614-44",
    label: "S-614-44 pedestal pole, traffic signal (6 in Sch 40)",
    kind: "pedestal",
    arms: 1,
    L: 0,
    covers: "a pedestal pole",
    heads: 0,
    caisson: { D: 24, depth: 4 + 8 / 12, depthCohesive: 4 + 8 / 12, pay: 5, payCohesive: 5, bars: 8, bar: 7, spiral: 4 },
    anchors: { n: 4, d: 1, circle: 10 },
    basePlate: { size: 12, t: 1.25, square: true },
    service: { M: 14.72, V: 0.97, V0: 90 },
    safety: { flexure: 1.25, torsion: 1.25 },
    designWind: 90,
  },
  {
    id: "44-ramp",
    sheet: "S-614-44",
    label: "S-614-44 pedestal pole, ramp metering (4 in Sch 40)",
    kind: "pedestal",
    arms: 1,
    L: 0,
    covers: "a ramp metering pedestal pole",
    heads: 0,
    caisson: { D: 24, depth: 3 + 2 / 12, depthCohesive: 3 + 2 / 12, pay: 3.5, payCohesive: 3.5, bars: 8, bar: 7, spiral: 4 },
    anchors: { n: 4, d: 1, circle: 10 },
    basePlate: { size: 12, t: 1.25, square: true },
    service: { M: 4.23, V: 0.45, V0: 90 },
    safety: { flexure: 1.25, torsion: 1.25 },
    designWind: 90,
  },
];

export const signalStandard = (id: string) => SIGNAL_STANDARDS.find((s) => s.id === id) ?? SIGNAL_STANDARDS[0];

/** An item on an arm or the pole (S-614-40 and 40A sheet 2): its weight (lb), projected area (ft²) and drag coefficient. */
export type Attachment = { name: string; at: number; weight: number; area: number; Cd: number; plate: boolean }; // at: ft from the pole along the arm

/** Sheet 2's worst-case loading on an arm of design length L with n heads: heads every 10 ft from the tip (63 lb and
 * 14 ft² at the tip, 46 lb and 8.67 ft² for the others), a 60 lb, 15 ft² sign 3 ft in from the tip head and 28 lb,
 * 7 ft² signs midway between the others. Signal heads' Cd 1.2 (LTS Table 3.8.7-1), signs' 1.2. */
export function cdotArmLoading(L: number, heads: number): Attachment[] {
  const out: Attachment[] = [];
  for (let k = 0; k < heads; k++) out.push({ name: k === 0 ? "Signal head (tip, 5-section)" : "Signal head", at: L - 10 * k, weight: k === 0 ? 63 : 46, area: k === 0 ? 14 : 8.67, Cd: 1.2, plate: false });
  for (let k = 0; k < heads - 1; k++) out.push({ name: "Sign", at: k === 0 ? L - 3 : L - 10 * k - 5, weight: k === 0 ? 60 : 28, area: k === 0 ? 15 : 7, Cd: 1.2, plate: true });
  return out.filter((a) => a.at > 1);
}
